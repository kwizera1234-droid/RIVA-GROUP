package com.example.crisis.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.example.MainActivity
import com.example.crisis.camera.CrisisBackgroundCameraEngine
import com.example.crisis.location.CrisisLocationManager
import com.example.crisis.models.CrisisSensorSnapshot
import com.example.crisis.models.CrisisTriggerType
import com.example.crisis.network.CrisisTelemetryUploader
import com.example.crisis.network.VonageCallTrigger
import com.example.crisis.sensors.CrisisSensorDetector
import com.example.crisis.store.CrisisSettingsStore
import com.example.crisis.telecom.EmergencyTelecomManager
import com.example.crisis.vision.CrisisVisionVerifier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Phase 2 + 3 — Autonomous background listener daemon + zero-touch dispatch.
 *
 * This service is the heart of the "ZERO USER INTERACTION DURING A CRISIS" guarantee:
 *  - Runs as a low-power foreground service (location|camera|microphone|phoneCall).
 *  - Owns [CrisisSensorDetector] (accelerometer crash/fall + mic scream/gunshot) and
 *    [CrisisLocationManager] (high-accuracy GPS) directly, so detection works even when
 *    every Activity / ViewModel is dead (app swiped away, screen off, phone locked).
 *  - On sensor trigger: silent camera hot-standby note → on-device [CrisisVisionVerifier]
 *    check (null-bitmap severity path when no UI surface exists) → countdown from
 *    stored settings → [EmergencyTelecomManager.initiateZeroTouchCall] + SMS fallback +
 *    [CrisisTelemetryUploader] server push — all with zero prompts.
 *
 * The Compose [com.example.crisis.viewmodel.CrisisViewModel] mirrors this pipeline for
 * live UI (satellite map, camera PiP, countdown widget) when the app is open, but the
 * service NEVER depends on it.
 */
class CrisisForegroundService : android.app.Service() {

    private val tag = "CrisisForegroundSvc"
    private var wakeLock: PowerManager.WakeLock? = null

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var sensorDetector: CrisisSensorDetector? = null
    private var locationManager: CrisisLocationManager? = null
    private var telecomManager: EmergencyTelecomManager? = null
    private var visionVerifier: CrisisVisionVerifier? = null
    private var settingsStore: CrisisSettingsStore? = null
    private var backgroundCamera: CrisisBackgroundCameraEngine? = null

    private var sensorCollectJob: Job? = null
    private var countdownJob: Job? = null
    private var engineStarted = false

    companion object {
        const val CHANNEL_ID = "CRISIS_EMERGENCY_CHANNEL"
        const val CHANNEL_NAME = "Emergency Response Automation Protocol"
        const val NOTIFICATION_ID = 91101

        const val ACTION_START_MONITORING = "com.example.crisis.ACTION_START_MONITORING"
        const val ACTION_STOP_MONITORING = "com.example.crisis.ACTION_STOP_MONITORING"
        const val ACTION_ESCALATE_CRISIS = "com.example.crisis.ACTION_ESCALATE_CRISIS"
        const val ACTION_DISMISS_CRISIS = "com.example.crisis.ACTION_DISMISS_CRISIS"
        const val EXTRA_TRIGGER_TYPE = "EXTRA_TRIGGER_TYPE"

        fun startService(context: Context, action: String = ACTION_START_MONITORING) {
            val intent = Intent(context, CrisisForegroundService::class.java).apply {
                this.action = action
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopService(context: Context) {
            context.stopService(Intent(context, CrisisForegroundService::class.java))
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        acquireWakeLock()
        initAutonomousEngine()
        Log.i(tag, "CrisisForegroundService created (autonomous engine).")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START_MONITORING
        Log.i(tag, "onStartCommand received action: $action")

        when (action) {
            ACTION_START_MONITORING -> {
                startForegroundWithProperTypes(
                    title = "Emergency Shield: Active Scanning",
                    content = "Monitoring sensors for crash, fall, and distress triggers."
                )
                startEngineIfNeeded()
            }
            ACTION_ESCALATE_CRISIS -> {
                val trigger = intent.getStringExtra(EXTRA_TRIGGER_TYPE) ?: "Crisis Detected"
                startForegroundWithProperTypes(
                    title = "EMERGENCY PROTOCOL ACTIVE: $trigger",
                    content = "Transmitting live satellite coordinates & streaming dual-camera telemetry."
                )
            }
            ACTION_DISMISS_CRISIS -> {
                countdownJob?.cancel()
                countdownJob = null
                // False alarm / cleared — release the silent camera immediately.
                try {
                    backgroundCamera?.stopCapture()
                } catch (_: Exception) {
                }
                startForegroundWithProperTypes(
                    title = "Emergency Shield: Standby",
                    content = "Incident cleared. Continuous monitoring resumed."
                )
            }
            ACTION_STOP_MONITORING -> {
                shutdownEngine()
                stopSelf()
                return START_NOT_STICKY
            }
        }

        // START_STICKY: OS restarts us after kills; CrisisBootReceiver covers reboots.
        return START_STICKY
    }

    // ------------------------------------------------------------------
    // Autonomous engine
    // ------------------------------------------------------------------

    private fun initAutonomousEngine() {
        if (sensorDetector != null) return
        val appCtx = applicationContext
        settingsStore = CrisisSettingsStore.get(appCtx)
        sensorDetector = CrisisSensorDetector(appCtx)
        locationManager = CrisisLocationManager(appCtx)
        telecomManager = EmergencyTelecomManager(appCtx)
        visionVerifier = CrisisVisionVerifier(appCtx)
        if (backgroundCamera == null) {
            backgroundCamera = CrisisBackgroundCameraEngine(appCtx)
        }
    }

    private fun startEngineIfNeeded() {
        if (engineStarted) return
        engineStarted = true
        initAutonomousEngine()

        // Respect the user's daemon toggle — never spy after explicit opt-out.
        val daemonOn = try {
            settingsStore?.isDaemonEnabledSync() ?: true
        } catch (_: Exception) {
            true
        }
        if (!daemonOn) {
            Log.i(tag, "Daemon disabled by user — engine idle.")
            engineStarted = false
            return
        }

        // Low-power listeners. Each manager internally degrades gracefully when its
        // permission is missing (logs + simulated drift for location) instead of crashing.
        try {
            sensorDetector?.startListening()
        } catch (e: Exception) {
            Log.w(tag, "Sensor start failed: ${e.message}")
        }
        try {
            locationManager?.startHighAccuracyTracking()
        } catch (e: Exception) {
            Log.w(tag, "Location start failed: ${e.message}")
        }

        sensorCollectJob?.cancel()
        sensorCollectJob = serviceScope.launch {
            try {
                sensorDetector?.sensorTriggerEvents?.collect { event ->
                    onAutonomousSensorTrigger(event.triggerType, event.snapshot)
                }
            } catch (e: Exception) {
                Log.w(tag, "Sensor collect ended: ${e.message}")
            }
        }
        Log.i(tag, "Autonomous listener daemon started (touchless).")
    }

    /**
     * Background zero-touch pipeline. No Activity, no dialog, no dialer screen.
     * Heavy work (vision + network) stays on serviceScope; dialling posts via
     * EmergencyTelecomManager which handles Telecom/ACTION_CALL internally.
     */
    private fun onAutonomousSensorTrigger(
        triggerType: CrisisTriggerType,
        snapshot: CrisisSensorSnapshot
    ) {
        // Ignore duplicate triggers while a countdown/dispatch is already running.
        if (countdownJob?.isActive == true) {
            Log.i(tag, "Trigger ${triggerType.displayName} suppressed (dispatch already running).")
            return
        }
        Log.w(tag, "Autonomous trigger: ${triggerType.displayName} — verifying…")
        startForegroundWithProperTypes(
            title = "Possible emergency: ${triggerType.displayName}",
            content = "AI verifying silently — no action needed if you are OK."
        )

        serviceScope.launch {
            val store = settingsStore
            val visionOn = try {
                store?.snapshot()?.aiVisionVerificationEnabled ?: true
            } catch (_: Exception) {
                true
            }
            val aiThreshold = try {
                store?.snapshot()?.aiConfidenceThreshold ?: 0.72f
            } catch (_: Exception) {
                0.72f
            }
            val countdownSecs = try {
                store?.snapshot()?.preEscalationDelaySeconds ?: 10
            } catch (_: Exception) {
                10
            }

            // SILENT CAMERA ACTIVATION (the background fix): wake the headless
            // Camera2 engine instantly — hidden ImageReader surface, no Activity,
            // no preview, no native camera app. Frames stream at ~15-30fps while
            // the screen stays black/locked; the partial wake lock + declared
            // FOREGROUND_SERVICE_TYPE_CAMERA keep the hardware accessible.
            try {
                backgroundCamera?.startCapture()
            } catch (e: Exception) {
                Log.w(tag, "Background camera start failed: ${e.message}")
            }

            // Wait briefly for the first REAL frame, then verify on-device.
            // Falls back to the severity path only if hardware is unavailable
            // (permission revoked / policy-disabled / hard locked).
            val frame = try {
                backgroundCamera?.awaitFirstFrame(timeoutMs = 1800L)
            } catch (e: Exception) {
                Log.w(tag, "Frame wait interrupted: ${e.message}")
                null
            }
            if (frame != null) {
                Log.i(tag, "Real ${frame.facing} frame acquired for AI verification.")
            } else {
                Log.w(tag, "No camera frame available — using severity fallback path.")
            }
            val evidence = try {
                if (visionOn) {
                    visionVerifier?.verifyCrisisVisual(
                        frameBitmap = frame?.bitmap,
                        associatedTrigger = triggerType,
                        isFrontCamera = frame?.facing == com.example.crisis.models.CameraFacing.FRONT
                    )
                } else {
                    null
                }
            } catch (e: Exception) {
                Log.w(tag, "Vision verify failed, fail-open on severe triggers: ${e.message}")
                null
            }

            val verified = when {
                evidence?.isVerified == true && evidence.confidence >= aiThreshold -> true
                evidence == null && triggerType.severityLevel >= 9 -> true // fail-open: never miss a severe crash
                triggerType.severityLevel >= 9 -> true
                else -> false
            }
            if (!verified) {
                Log.i(tag, "Trigger not verified (conf=${evidence?.confidence}) — resuming scan.")
                // Release the camera so we return to low-power sensor-only scan.
                try {
                    backgroundCamera?.stopCapture()
                } catch (_: Exception) {
                }
                startForegroundWithProperTypes(
                    title = "Emergency Shield: Active Scanning",
                    content = "Monitoring sensors for crash, fall, and distress triggers."
                )
                return@launch
            }

            Log.w(tag, "Crisis VERIFIED (${evidence?.detectedCategory}). " +
                "Zero-touch dispatch in ${countdownSecs}s unless cancelled from UI.")
            startForegroundWithProperTypes(
                title = "EMERGENCY PROTOCOL ACTIVE: ${triggerType.displayName}",
                content = "Transmitting live satellite coordinates & streaming telemetry."
            )

            countdownJob?.cancel()
            countdownJob = serviceScope.launch {
                var left = countdownSecs.coerceIn(0, 60)
                while (left > 0) {
                    delay(1000)
                    left--
                }
                executeAutonomousDispatch(triggerType, snapshot)
            }
        }
    }

    /**
     * Final touchless act — Vonage Voice API first, on-device dial as fallback.
     * Runs even with the screen off and the app swiped away. No Intent dialer
     * is ever the primary path; Telecom dial engages only when the secure
     * backend is unreachable (offline robustness).
     */
    private fun executeAutonomousDispatch(
        triggerType: CrisisTriggerType,
        snapshot: CrisisSensorSnapshot
    ) {
        serviceScope.launch(Dispatchers.IO) {
            try {
                val store = settingsStore
                val s = try {
                    store?.snapshot()
                } catch (_: Exception) {
                    null
                }
                val zeroTouchOn = s?.zeroTouchDialingEnabled ?: true
                val smsOn = s?.autoSmsFallbackEnabled ?: true
                val contactPhone = try {
                    store?.getContactPhoneSync()
                        ?: telecomManager?.getEmergencyContactNumber()
                        ?: "+1 (800) 555-0911"
                } catch (_: Exception) {
                    "+1 (800) 555-0911"
                }
                val contactName = try {
                    telecomManager?.getEmergencyContactName() ?: "Primary Emergency Contact"
                } catch (_: Exception) {
                    "Primary Emergency Contact"
                }

                startForegroundWithProperTypes(
                    title = "EMERGENCY DISPATCH ACTIVE",
                    content = "Vonage uplink to $contactPhone + streaming live location."
                )

                // Snapshot live GPS synchronously from the location engine.
                val tele = try {
                    locationManager?.telemetry?.value
                } catch (_: Exception) {
                    null
                }

                // 1. Vonage Voice API — true zero-touch call (no dialer, no confirmation).
                var vonageLive = false
                if (zeroTouchOn && tele != null) {
                    try {
                        val userName = VonageCallTrigger.resolveUserName(applicationContext)
                        val mapsUrl = CrisisTelemetryUploader.satelliteLink(tele.latitude, tele.longitude)
                        val announcement = VonageCallTrigger.buildAnnouncement(
                            userName = userName,
                            triggerTitle = triggerType.displayName,
                            impactGforce = snapshot.peakGForce,
                            speedKmh = tele.speedKmh
                        )
                        startForegroundWithProperTypes(
                            title = "VONAGE UPLINK: CONNECTING…",
                            content = "Placing automated voice call to $contactName."
                        )
                        val result = VonageCallTrigger.triggerVonageCall(
                            context = applicationContext,
                            toNumber = contactPhone,
                            announcement = announcement,
                            extras = VonageCallTrigger.VonageCallExtras(
                                userName = userName,
                                triggerType = triggerType.displayName,
                                impactGforce = snapshot.peakGForce,
                                speedKmh = tele.speedKmh,
                                mapsUrl = mapsUrl
                            )
                        )
                        vonageLive = result.success
                        if (vonageLive) {
                            Log.i(tag, "Vonage zero-touch call live (uuid=${result.callUuid}).")
                            startForegroundWithProperTypes(
                                title = "VONAGE UPLINK: LIVE CALL ACTIVE",
                                content = "TTS announcement playing to $contactName."
                            )
                        } else {
                            Log.w(tag, "Vonage failed (${result.errorCode}: ${result.error}) — fallback dial.")
                        }
                    } catch (e: Exception) {
                        Log.e(tag, "Vonage trigger error", e)
                    }
                }

                // 2. On-device fallback dial — only when Vonage did not connect.
                if (zeroTouchOn && !vonageLive) {
                    try {
                        telecomManager?.let {
                            withContext(Dispatchers.Main) {
                                it.initiateZeroTouchCall(emergencyContactOverride = contactPhone)
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(tag, "Zero-touch fallback dial failed", e)
                    }
                } else if (!zeroTouchOn) {
                    Log.i(tag, "Zero-touch dial disabled in settings — SMS/server only.")
                }

                // 2. SMS fallback with structural payload + satellite link.
                if (smsOn && tele != null) {
                    try {
                        locationManager?.dispatchFallbackEmergencySms(
                            recipientPhone = contactPhone,
                            triggerTitle = triggerType.displayName
                        )
                    } catch (e: Exception) {
                        Log.w(tag, "SMS dispatch failed: ${e.message}")
                    }
                }

                // 3. Remote server push (best effort; SMS is the guarantee).
                // NOTE: background vision evidence already gated this dispatch above.
                try {
                    if (tele != null) {
                        CrisisTelemetryUploader.pushCrisis(
                            trigger = triggerType,
                            telemetry = tele,
                            snapshot = snapshot,
                            vision = null,
                            contactPhone = contactPhone
                        )
                    }
                } catch (e: Exception) {
                    Log.w(tag, "Server push failed: ${e.message}")
                }
            } catch (e: Exception) {
                Log.e(tag, "Autonomous dispatch error", e)
            }
        }
    }

    private fun shutdownEngine() {
        engineStarted = false
        countdownJob?.cancel()
        countdownJob = null
        sensorCollectJob?.cancel()
        sensorCollectJob = null
        try {
            backgroundCamera?.stopCapture()
        } catch (_: Exception) {
        }
        try {
            sensorDetector?.stopListening()
        } catch (_: Exception) {
        }
        try {
            locationManager?.stopTracking()
        } catch (_: Exception) {
        }
    }

    // ------------------------------------------------------------------
    // Foreground plumbing (unchanged contract)
    // ------------------------------------------------------------------

    private fun startForegroundWithProperTypes(title: String, content: String) {
        val notification = buildNotification(title, content)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var serviceTypes = ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                serviceTypes = serviceTypes or
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                serviceTypes = serviceTypes or ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
            }

            try {
                startForeground(NOTIFICATION_ID, notification, serviceTypes)
            } catch (e: Exception) {
                Log.w(tag, "Could not start with combined foreground types, fallback: ${e.message}")
                startForeground(NOTIFICATION_ID, notification)
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(title: String, content: String): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setColor(Color.RED)
            .setContentIntent(pendingIntent)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "High-priority alerts for automated crisis response system"
                enableLights(true)
                lightColor = Color.RED
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 800)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun acquireWakeLock() {
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "CrisisForegroundService::WakeLock"
            ).apply {
                acquire(24 * 60 * 60 * 1000L) // 24 hours
            }
        } catch (e: Exception) {
            Log.w(tag, "Could not acquire wakeLock: ${e.message}")
        }
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // App swiped away — keep guarding. START_STICKY re-creates us; re-assert scan.
        Log.i(tag, "Task removed — daemon persists (START_STICKY).")
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        super.onDestroy()
        shutdownEngine()
        try {
            backgroundCamera?.release()
        } catch (_: Exception) {
        }
        backgroundCamera = null
        serviceScope.cancel()
        wakeLock?.let {
            if (it.isHeld) {
                try {
                    it.release()
                } catch (_: Exception) {
                }
            }
        }
        wakeLock = null
        Log.i(tag, "CrisisForegroundService destroyed.")
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
