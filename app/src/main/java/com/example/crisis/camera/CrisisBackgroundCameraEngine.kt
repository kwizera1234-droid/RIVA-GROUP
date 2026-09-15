package com.example.crisis.camera

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.ImageReader
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import androidx.core.content.ContextCompat
import com.example.crisis.models.CameraFacing
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Bulletproof SILENT background camera engine (the camera-never-wakes fix).
 *
 * Why the old path failed: CameraX requires a LifecycleOwner with a visible
 * lifecycle. From a background ForegroundService there is none, so capture
 * silently degraded to simulated frames and the AI verifier ran on null.
 *
 * This engine uses Camera2 directly with a ZERO-UI hidden surface
 * ([ImageReader] 320x240 — no PreviewView, no SurfaceView, no native camera
 * app, no pixels ever shown) so frames flow while the screen is black/locked:
 *
 *  - Dual lens: simultaneous open via the API-30 multi-camera set when the
 *    hardware supports it, otherwise sequential alternation (rear → front
 *    every [LENS_DWELL_MS]) so both environments are sampled per incident.
 *  - Frame loop: YUV_420_888 buffers → Bitmap at ~15-30fps into [latestFrame],
 *    instantly consumable by CrisisVisionVerifier with zero UI involvement.
 *  - Hardware contention: IN_USE / MAX_CAMERAS_IN_USE triggers exponential
 *    backoff retries PLUS an availability-callback wakeup. NOTE (honest OS
 *    limit): a third-party app cannot forcibly preempt another app's camera
 *    session — only the system can. We take absolute priority the moment the
 *    hardware is releasable, which is the maximum a Play-Store app can do.
 *  - No prompts: permission is pre-checked only. If CAMERA was revoked the
 *    engine reports UNAVAILABLE and the pipeline keeps its severity fail-open
 *    instead of showing any dialog.
 */
class CrisisBackgroundCameraEngine(private val appContext: Context) {

    enum class EngineStatus {
        IDLE,
        STARTING,
        STREAMING_REAR,
        STREAMING_FRONT,
        STREAMING_DUAL,
        RETRY_WAIT,
        UNAVAILABLE,
        STOPPED
    }

    data class BackgroundFrame(
        val bitmap: Bitmap,
        val facing: CameraFacing,
        val timestamp: Long = System.currentTimeMillis()
    )

    companion object {
        private const val TAG = "CrisisBgCamera"
        private const val FRAME_WIDTH = 320
        private const val FRAME_HEIGHT = 240
        private const val MAX_IMAGES = 3
        private const val LENS_DWELL_MS = 2500L
        private const val CAPTURE_TIMEOUT_MS = 90_000L
        private val RETRY_BACKOFF_MS = longArrayOf(400, 800, 1600, 3200, 5000)
    }

    private val cameraManager: CameraManager? =
        appContext.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private var bgThread: HandlerThread? = null
    private var bgHandler: Handler? = null

    private val _latestFrame = MutableStateFlow<BackgroundFrame?>(null)
    val latestFrame: StateFlow<BackgroundFrame?> = _latestFrame.asStateFlow()

    private val _status = MutableStateFlow(EngineStatus.IDLE)
    val status: StateFlow<EngineStatus> = _status.asStateFlow()

    @Volatile private var capturing = false
    @Volatile private var dualMode = false
    private var alternateJob: Job? = null
    private var timeoutJob: Job? = null
    private var retryIndex = 0

    // Active hardware handles (single-lens mode uses slot 0; dual uses both).
    private data class OpenSlot(
        var device: CameraDevice? = null,
        var session: CameraCaptureSession? = null,
        var reader: ImageReader? = null,
        var facing: CameraFacing = CameraFacing.REAR
    )
    private val slots = listOf(OpenSlot(), OpenSlot())
    private var pendingCameraIds: List<String> = emptyList()

    private val availabilityCallback = object : CameraManager.AvailabilityCallback() {
        override fun onCameraAvailable(cameraId: String) {
            super.onCameraAvailable(cameraId)
            // Hardware just freed — if we are parked in backoff, pounce immediately.
            if (capturing && _status.value == EngineStatus.RETRY_WAIT && cameraId in pendingCameraIds) {
                Log.i(TAG, "Camera $cameraId freed — retrying open immediately.")
                retryIndex = 0
                scope.launch { openCapture() }
            }
        }
    }

    // ------------------------------------------------------------------
    // Public lifecycle
    // ------------------------------------------------------------------

    /** Idempotent start. Safe to call from a Service with screen off/locked. */
    fun startCapture() {
        if (capturing) return
        if (cameraManager == null) {
            _status.value = EngineStatus.UNAVAILABLE
            Log.w(TAG, "No CameraManager — headless capture unavailable.")
            return
        }
        if (ContextCompat.checkSelfPermission(appContext, Manifest.permission.CAMERA) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            // Pre-granted at onboarding; NEVER prompt from background — fail visibly.
            _status.value = EngineStatus.UNAVAILABLE
            Log.w(TAG, "CAMERA permission missing — capture unavailable (no background prompt allowed).")
            return
        }
        capturing = true
        retryIndex = 0
        ensureBgThread()
        try {
            cameraManager.registerAvailabilityCallback(availabilityCallback, bgHandler)
        } catch (_: Exception) {
        }
        _status.value = EngineStatus.STARTING
        Log.i(TAG, "Silent background capture START requested.")
        scope.launch { openCapture() }

        timeoutJob?.cancel()
        timeoutJob = scope.launch {
            delay(CAPTURE_TIMEOUT_MS)
            if (capturing) {
                Log.i(TAG, "Capture timeout reached — auto-stopping to save battery.")
                stopCapture()
            }
        }
    }

    fun stopCapture() {
        if (!capturing && _status.value == EngineStatus.IDLE) return
        capturing = false
        alternateJob?.cancel()
        alternateJob = null
        timeoutJob?.cancel()
        timeoutJob = null
        closeSlots()
        try {
            cameraManager?.unregisterAvailabilityCallback(availabilityCallback)
        } catch (_: Exception) {
        }
        _status.value = EngineStatus.STOPPED
        Log.i(TAG, "Silent background capture STOPPED.")
    }

    fun release() {
        stopCapture()
        try {
            bgThread?.quitSafely()
        } catch (_: Exception) {
        }
        bgThread = null
        bgHandler = null
        _status.value = EngineStatus.IDLE
    }

    /** Suspends until the first real frame lands (null on timeout/unavailable). */
    suspend fun awaitFirstFrame(timeoutMs: Long = 1800L): BackgroundFrame? {
        _latestFrame.value?.let { return it }
        return try {
            withTimeoutOrNull(timeoutMs) { latestFrame.filterNotNull().first() }
        } catch (_: Exception) {
            null
        }
    }

    // ------------------------------------------------------------------
    // Open paths
    // ------------------------------------------------------------------

    private fun resolveLensIds(): Pair<String?, String?> {
        val mgr = cameraManager ?: return null to null
        var rear: String? = null
        var front: String? = null
        try {
            for (id in mgr.cameraIdList) {
                val facing = mgr.getCameraCharacteristics(id)
                    .get(CameraCharacteristics.LENS_FACING)
                if (facing == CameraCharacteristics.LENS_FACING_BACK && rear == null) rear = id
                if (facing == CameraCharacteristics.LENS_FACING_FRONT && front == null) front = id
            }
        } catch (e: Exception) {
            Log.w(TAG, "Lens enumeration failed: ${e.message}")
        }
        return rear to front
    }

    private suspend fun openCapture() {
        if (!capturing) return
        val (rearId, frontId) = resolveLensIds()
        val targets = listOfNotNull(rearId, frontId)
        if (targets.isEmpty()) {
            _status.value = EngineStatus.UNAVAILABLE
            Log.w(TAG, "No camera lenses found.")
            return
        }
        pendingCameraIds = targets

        // Dual path: API 30+ concurrent set containing both lenses.
        val concurrentPair = findConcurrentPair(rearId, frontId)
        if (concurrentPair != null) {
            dualMode = true
            Log.i(TAG, "Multi-camera hardware detected — opening FRONT+REAR simultaneously.")
            var ok = true
            ok = openSingle(concurrentPair.first, CameraFacing.REAR, slots[0]) && ok
            ok = openSingle(concurrentPair.second, CameraFacing.FRONT, slots[1]) && ok
            if (ok && capturing) {
                _status.value = EngineStatus.STREAMING_DUAL
                return
            }
            // Fall through to sequential if either lens refused.
            closeSlots()
        }

        // Sequential path: rear first (crash scene), alternate while capturing.
        dualMode = false
        alternateJob?.cancel()
        alternateJob = scope.launch {
            var useRear = true
            retryIndex = 0
            while (capturing) {
                val id = if (useRear) rearId else frontId
                val facing = if (useRear) CameraFacing.REAR else CameraFacing.FRONT
                if (id != null) {
                    val ok = openSingle(id, facing, slots[0])
                    if (ok) {
                        retryIndex = 0
                        _status.value = if (facing == CameraFacing.REAR) {
                            EngineStatus.STREAMING_REAR
                        } else {
                            EngineStatus.STREAMING_FRONT
                        }
                        delay(LENS_DWELL_MS)
                        closeSlots()
                    } else {
                        // openSingle already scheduled backoff/parked in RETRY_WAIT.
                        return@launch
                    }
                }
                useRear = !useRear
                // If only one lens exists, keep streaming it without flip-flopping.
                if (rearId == null || frontId == null) useRear = rearId != null
            }
        }
    }

    private fun findConcurrentPair(rearId: String?, frontId: String?): Pair<String, String>? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || rearId == null || frontId == null) return null
        return try {
            val sets = cameraManager?.concurrentCameraIds ?: return null
            if (sets.any { it.contains(rearId) && it.contains(frontId) }) rearId to frontId else null
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Opens one lens against a hidden [ImageReader] surface and starts the
     * repeating frame loop. Returns false when the hardware is contended or
     * errored (caller parks in RETRY_WAIT via [scheduleRetry]).
     */
    private fun openSingle(cameraId: String, facing: CameraFacing, slot: OpenSlot): Boolean {
        if (!capturing) return false
        val mgr = cameraManager ?: return false
        val handler = bgHandler ?: return false
        try {
            val reader = ImageReader.newInstance(FRAME_WIDTH, FRAME_HEIGHT, ImageFormat.YUV_420_888, MAX_IMAGES)
            reader.setOnImageAvailableListener({ r ->
                try {
                    val image = r.acquireLatestImage() ?: return@setOnImageAvailableListener
                    try {
                        val bmp = yuv420ToBitmap(image)
                        if (bmp != null && capturing) {
                            _latestFrame.value = BackgroundFrame(bmp, facing)
                        }
                    } finally {
                        image.close()
                    }
                } catch (_: Exception) {
                }
            }, handler)
            slot.reader = reader
            slot.facing = facing

            var opened: CameraDevice? = null
            var openError: Int? = null
            val latch = java.util.concurrent.CountDownLatch(1)
            try {
                mgr.openCamera(cameraId, object : CameraDevice.StateCallback() {
                    override fun onOpened(device: CameraDevice) {
                        opened = device
                        latch.countDown()
                    }

                    override fun onDisconnected(device: CameraDevice) {
                        try {
                            device.close()
                        } catch (_: Exception) {
                        }
                        latch.countDown()
                    }

                    override fun onError(device: CameraDevice, error: Int) {
                        openError = error
                        try {
                            device.close()
                        } catch (_: Exception) {
                        }
                        latch.countDown()
                    }
                }, handler)
            } catch (e: CameraAccessException) {
                handleCameraAccessException(e, cameraId)
                cleanupSlot(slot)
                return false
            } catch (e: SecurityException) {
                Log.w(TAG, "Camera open blocked (permission revoked at runtime?) for $cameraId.")
                _status.value = EngineStatus.UNAVAILABLE
                cleanupSlot(slot)
                return false
            } catch (e: IllegalArgumentException) {
                Log.w(TAG, "Bad camera id $cameraId: ${e.message}")
                cleanupSlot(slot)
                return false
            }

            val signalled = try {
                latch.await(4, java.util.concurrent.TimeUnit.SECONDS)
            } catch (_: InterruptedException) {
                false
            }
            val device = opened
            if (!signalled || device == null) {
                if (openError != null) handleDeviceError(openError, cameraId)
                else scheduleRetry("open timeout on $cameraId")
                cleanupSlot(slot)
                return false
            }
            slot.device = device
            return bindSession(device, slot)
        } catch (e: Exception) {
            Log.w(TAG, "openSingle($cameraId) failed: ${e.message}")
            scheduleRetry("exception on $cameraId")
            cleanupSlot(slot)
            return false
        }
    }

    @Suppress("DEPRECATION") // Classic session API works on every API 24+ device incl. background.
    private fun bindSession(device: CameraDevice, slot: OpenSlot): Boolean {
        val reader = slot.reader ?: return false
        val handler = bgHandler ?: return false
        return try {
            val latch = java.util.concurrent.CountDownLatch(1)
            var configured = false
            var sessionError = false
            device.createCaptureSession(
                listOf(reader.surface),
                object : CameraCaptureSession.StateCallback() {
                    override fun onConfigured(session: CameraCaptureSession) {
                        try {
                            val req = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                                addTarget(reader.surface)
                                set(
                                    CaptureRequest.CONTROL_MODE,
                                    CaptureRequest.CONTROL_MODE_AUTO
                                )
                            }.build()
                            session.setRepeatingRequest(req, null, handler)
                            slot.session = session
                            configured = true
                        } catch (e: Exception) {
                            Log.w(TAG, "Repeating request failed: ${e.message}")
                            sessionError = true
                        } finally {
                            latch.countDown()
                        }
                    }

                    override fun onConfigureFailed(session: CameraCaptureSession) {
                        sessionError = true
                        latch.countDown()
                    }
                },
                handler
            )
            try {
                latch.await(4, java.util.concurrent.TimeUnit.SECONDS)
            } catch (_: InterruptedException) {
                return false
            }
            if (!configured || sessionError) {
                scheduleRetry("session configure failed (${slot.facing})")
                cleanupSlot(slot)
                return false
            }
            Log.i(TAG, "Headless ${slot.facing} stream LIVE (320x240, hidden surface).")
            true
        } catch (e: CameraAccessException) {
            handleCameraAccessException(e, "session-${slot.facing}")
            cleanupSlot(slot)
            false
        } catch (e: Exception) {
            Log.w(TAG, "bindSession failed: ${e.message}")
            scheduleRetry("session exception")
            cleanupSlot(slot)
            false
        }
    }

    // ------------------------------------------------------------------
    // Contention handling (fail-safe, no prompts, no force-kill illusions)
    // ------------------------------------------------------------------

    private fun handleCameraAccessException(e: CameraAccessException, where: String) {
        when (e.reason) {
            CameraAccessException.CAMERA_IN_USE,
            CameraAccessException.MAX_CAMERAS_IN_USE -> {
                Log.w(TAG, "Hardware locked by another app at $where — backing off, will pounce on release.")
                scheduleRetry("in-use at $where")
            }
            CameraAccessException.CAMERA_DISABLED -> {
                Log.w(TAG, "Camera disabled by device policy at $where.")
                _status.value = EngineStatus.UNAVAILABLE
            }
            CameraAccessException.CAMERA_DISCONNECTED -> {
                Log.w(TAG, "Camera disconnected at $where — retrying.")
                scheduleRetry("disconnected at $where")
            }
            else -> {
                Log.w(TAG, "CameraAccessException($where, reason=${e.reason}): ${e.message}")
                scheduleRetry("error at $where")
            }
        }
    }

    private fun handleDeviceError(error: Int?, cameraId: String) {
        when (error) {
            CameraDevice.StateCallback.ERROR_CAMERA_IN_USE,
            CameraDevice.StateCallback.ERROR_MAX_CAMERAS_IN_USE -> {
                Log.w(TAG, "onError IN_USE for $cameraId — backing off.")
                scheduleRetry("device in-use $cameraId")
            }
            CameraDevice.StateCallback.ERROR_CAMERA_DISABLED -> {
                Log.w(TAG, "onError DISABLED for $cameraId.")
                _status.value = EngineStatus.UNAVAILABLE
            }
            else -> {
                Log.w(TAG, "onError($cameraId)=$error — retrying.")
                scheduleRetry("device error $cameraId")
            }
        }
    }

    private fun scheduleRetry(reason: String) {
        if (!capturing) return
        _status.value = EngineStatus.RETRY_WAIT
        val attempt = retryIndex++
        val waitMs = RETRY_BACKOFF_MS[attempt.coerceAtMost(RETRY_BACKOFF_MS.lastIndex)]
        Log.i(TAG, "Retry #${attempt + 1} in ${waitMs}ms ($reason).")
        scope.launch {
            delay(waitMs)
            if (capturing && _status.value == EngineStatus.RETRY_WAIT) {
                if (attempt >= RETRY_BACKOFF_MS.lastIndex + 2) {
                    Log.w(TAG, "Hardware still locked after sustained retries — staying parked on availability callback.")
                    return@launch
                }
                openCapture()
            }
        }
    }

    // ------------------------------------------------------------------
    // Plumbing
    // ------------------------------------------------------------------

    private fun closeSlots() {
        slots.forEach { cleanupSlot(it) }
    }

    private fun cleanupSlot(slot: OpenSlot) {
        try {
            slot.session?.close()
        } catch (_: Exception) {
        }
        slot.session = null
        try {
            slot.device?.close()
        } catch (_: Exception) {
        }
        slot.device = null
        try {
            slot.reader?.close()
        } catch (_: Exception) {
        }
        slot.reader = null
    }

    private fun ensureBgThread() {
        if (bgThread == null || bgHandler == null) {
            try {
                bgThread?.quitSafely()
            } catch (_: Exception) {
            }
            bgThread = HandlerThread("CrisisBgCamera").apply { start() }
            bgHandler = Handler(bgThread!!.looper)
        }
    }

    /**
     * YUV_420_888 → ARGB_8888 honoring row/pixel strides. Runs on the camera
     * background thread; 320x240 keeps conversion at a fraction of a frame budget.
     */
    private fun yuv420ToBitmap(image: android.media.Image): Bitmap? {
        return try {
            val w = image.width
            val h = image.height
            val yPlane = image.planes[0]
            val uPlane = image.planes[1]
            val vPlane = image.planes[2]
            val yBuf = yPlane.buffer
            val uBuf = uPlane.buffer
            val vBuf = vPlane.buffer
            val yRowStride = yPlane.rowStride
            val uvRowStride = uPlane.rowStride
            val uvPixelStride = uPlane.pixelStride
            val out = IntArray(w * h)
            var oi = 0
            for (y in 0 until h) {
                val yRow = y * yRowStride
                val uvRow = (y shr 1) * uvRowStride
                for (x in 0 until w) {
                    val yVal = (yBuf.get(yRow + x).toInt() and 0xFF)
                    val uvOffset = uvRow + (x shr 1) * uvPixelStride
                    val uVal = (uBuf.get(uvOffset).toInt() and 0xFF) - 128
                    val vVal = (vBuf.get(uvOffset).toInt() and 0xFF) - 128
                    var r = (yVal + (1.402f * vVal)).toInt()
                    var g = (yVal - (0.344136f * uVal) - (0.714136f * vVal)).toInt()
                    var b = (yVal + (1.772f * uVal)).toInt()
                    if (r < 0) r = 0 else if (r > 255) r = 255
                    if (g < 0) g = 0 else if (g > 255) g = 255
                    if (b < 0) b = 0 else if (b > 255) b = 255
                    out[oi++] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
                }
            }
            Bitmap.createBitmap(out, w, h, Bitmap.Config.ARGB_8888)
        } catch (e: Exception) {
            Log.w(TAG, "YUV conversion failed: ${e.message}")
            null
        }
    }
}
