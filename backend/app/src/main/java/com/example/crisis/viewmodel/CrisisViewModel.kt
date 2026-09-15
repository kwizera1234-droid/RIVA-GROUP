package com.example.crisis.viewmodel

import android.app.Application
import android.graphics.Bitmap
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.crisis.camera.CrisisCameraManager
import com.example.crisis.location.CrisisLocationManager
import com.example.crisis.models.*
import com.example.crisis.network.CrisisTelemetryUploader
import com.example.crisis.network.VonageCallTrigger
import com.example.crisis.sensors.CrisisSensorDetector
import com.example.crisis.service.CrisisForegroundService
import com.example.crisis.telecom.EmergencyTelecomManager
import com.example.crisis.vision.CrisisVisionVerifier
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Master ViewModel orchestrating all Crisis Detection, Camera Automation,
 * Computer Vision Verification, Zero-Touch Dialing, and Satellite Telemetry.
 */
class CrisisViewModel(application: Application) : AndroidViewModel(application) {

    private val tag = "CrisisViewModel"
    val sensorDetector = CrisisSensorDetector(application)
    val cameraManager = CrisisCameraManager(application)
    val visionVerifier = CrisisVisionVerifier(application)
    val telecomManager = EmergencyTelecomManager(application)
    val locationManager = CrisisLocationManager(application)

    private val _crisisState = MutableStateFlow(CrisisState())
    val crisisState: StateFlow<CrisisState> = _crisisState.asStateFlow()

    private var countdownJob: Job? = null
    private var isInitialized = false

    init {
        initializeCrisisSubsystem()
    }

    private fun initializeCrisisSubsystem() {
        if (isInitialized) return
        isInitialized = true

        // 1. Observe sensor trigger events
        viewModelScope.launch {
            sensorDetector.sensorTriggerEvents.collect { event ->
                handleSensorTrigger(event.triggerType, event.snapshot)
            }
        }

        // 2. Observe camera frames and forward to AI verifier
        cameraManager.setOnFrameAnalyzedListener { bitmap ->
            handleAnalyzedCameraFrame(bitmap)
        }

        // 3. Forward location telemetry into crisis state
        viewModelScope.launch {
            locationManager.telemetry.collect { tele ->
                _crisisState.update { it.copy(telemetry = tele) }
            }
        }

        // 4. Forward telecom call session into crisis state
        viewModelScope.launch {
            telecomManager.callSession.collect { session ->
                _crisisState.update { it.copy(callSession = session) }
            }
        }

        // 5. Forward data sharing status into crisis state
        viewModelScope.launch {
            locationManager.dataSharingStatus.collect { sharing ->
                _crisisState.update { it.copy(dataSharing = sharing) }
            }
        }

        // 6. Start continuous low-power sensor monitoring & foreground service
        startContinuousMonitoring()
    }

    fun startContinuousMonitoring() {
        sensorDetector.startListening()
        locationManager.startHighAccuracyTracking()
        CrisisForegroundService.startService(getApplication(), CrisisForegroundService.ACTION_START_MONITORING)
        _crisisState.update {
            it.copy(
                status = CrisisStatus.IDLE_MONITORING,
                isMonitoringActive = true,
                logMessages = it.logMessages + "Continuous sensor shield active."
            )
        }
    }

    /**
     * Triggered automatically when physical sensors detect high-G impact, fall, scream, etc.
     */
    private fun handleSensorTrigger(triggerType: CrisisTriggerType, snapshot: CrisisSensorSnapshot) {
        val now = System.currentTimeMillis()
        Log.w(tag, "Potential crisis detected: ${triggerType.displayName}")

        _crisisState.update {
            it.copy(
                status = CrisisStatus.POTENTIAL_CRISIS_DETECTED,
                triggerType = triggerType,
                triggerTimestamp = now,
                sensorSnapshot = snapshot,
                logMessages = it.logMessages + "Detected trigger: ${triggerType.displayName}"
            )
        }

        // Escalation Step 1: Immediately activate front and rear cameras in background without user intervention
        activateBackgroundCameraSubsystem()

        // Escalation Step 2: Begin visual AI verification
        viewModelScope.launch {
            _crisisState.update { it.copy(status = CrisisStatus.AI_VERIFYING) }
            val latestBitmap = cameraManager.latestFrameBitmap.value
            val evidence = visionVerifier.verifyCrisisVisual(
                frameBitmap = latestBitmap,
                associatedTrigger = triggerType,
                isFrontCamera = cameraManager.currentFacing.value == CameraFacing.FRONT
            )

            _crisisState.update {
                it.copy(
                    visionEvidence = evidence,
                    logMessages = it.logMessages + "AI Vision: ${evidence.detectedCategory} (${"%.1f".format(evidence.confidence * 100)}%)"
                )
            }

            if (evidence.isVerified || triggerType.severityLevel >= 9) {
                escalateToVerifiedEmergency(triggerType)
            }
        }
    }

    private fun handleAnalyzedCameraFrame(bitmap: Bitmap) {
        // Continuous verification if in AI_VERIFYING mode
        if (_crisisState.value.status == CrisisStatus.AI_VERIFYING) {
            viewModelScope.launch {
                val evidence = visionVerifier.verifyCrisisVisual(
                    frameBitmap = bitmap,
                    associatedTrigger = _crisisState.value.triggerType,
                    isFrontCamera = cameraManager.currentFacing.value == CameraFacing.FRONT
                )
                _crisisState.update { it.copy(visionEvidence = evidence) }
                if (evidence.isVerified) {
                    escalateToVerifiedEmergency(_crisisState.value.triggerType)
                }
            }
        }
    }

    /**
     * Camera Automation: Instantly activates camera capture without user interaction.
     */
    private fun activateBackgroundCameraSubsystem() {
        cameraManager.startAutomatedCapture()
        _crisisState.update {
            it.copy(
                isCameraFeedActive = true,
                logMessages = it.logMessages + "Camera automation active: dual-lens stream engaged."
            )
        }
    }

    /**
     * Escalates to emergency protocol: Starts 10s countdown grace period, then zero-touch dials & broadcasts.
     */
    private fun escalateToVerifiedEmergency(triggerType: CrisisTriggerType) {
        countdownJob?.cancel()

        _crisisState.update {
            it.copy(
                status = CrisisStatus.VERIFIED_ESCALATING,
                preEscalationCountdown = 10,
                logMessages = it.logMessages + "Verified crisis: Initiating 10-second Zero-Touch countdown."
            )
        }

        CrisisForegroundService.startService(
            getApplication(),
            CrisisForegroundService.ACTION_ESCALATE_CRISIS
        )

        countdownJob = viewModelScope.launch {
            var secondsLeft = 10
            while (isActive && secondsLeft > 0) {
                delay(1000)
                secondsLeft--
                _crisisState.update { it.copy(preEscalationCountdown = secondsLeft) }
            }

            // Zero-Touch Protocol Execution upon countdown expiration
            executeZeroTouchEmergencyProtocol(triggerType)
        }
    }

    /**
     * Executes instant Zero-Touch Calling, High-Accuracy Satellite Broadcast, and Fallback SMS.
     *
     * TRUE automation order — no Intent dialer is ever the primary path:
     *  1. Vonage Voice API via secure backend (real PSTN call + dynamic TTS).
     *  2. On-device Telecom dial ONLY if the backend is unreachable/unauthenticated
     *     (offline robustness — still zero-touch, no dialer screen).
     *  3. SMS with satellite link + server telemetry push run concurrently.
     */
    fun executeZeroTouchEmergencyProtocol(triggerType: CrisisTriggerType? = null) {
        countdownJob?.cancel()
        val trigger = triggerType ?: _crisisState.value.triggerType

        _crisisState.update {
            it.copy(
                status = CrisisStatus.EMERGENCY_DISPATCH_ACTIVE,
                isEscalated = true,
                preEscalationCountdown = 0,
                vonageCall = VonageCallState(
                    status = VonageCallStatus.TRIGGERING,
                    targetName = telecomManager.getEmergencyContactName(),
                    targetNumber = telecomManager.getEmergencyContactNumber(),
                    attemptTimestamp = System.currentTimeMillis()
                ),
                logMessages = it.logMessages + "ZERO-TOUCH ESCALATION ENGAGED: Vonage uplink + Satellite Broadcast active."
            )
        }

        viewModelScope.launch {
            val ctx = getApplication<Application>()
            val snapshot = _crisisState.value.sensorSnapshot
            val tele = _crisisState.value.telemetry
            val targetNumber = telecomManager.getEmergencyContactNumber()
            val targetName = telecomManager.getEmergencyContactName()
            val userName = VonageCallTrigger.resolveUserName(ctx)
            val mapsUrl = CrisisTelemetryUploader.satelliteLink(tele.latitude, tele.longitude)
            val announcement = VonageCallTrigger.buildAnnouncement(
                userName = userName,
                triggerTitle = trigger.displayName,
                impactGforce = snapshot.peakGForce,
                speedKmh = tele.speedKmh
            )

            _crisisState.update {
                it.copy(
                    vonageCall = it.vonageCall.copy(
                        status = VonageCallStatus.CONNECTING,
                        announcement = announcement
                    ),
                    logMessages = it.logMessages + "VONAGE UPLINK: CONNECTING to $targetNumber…"
                )
            }

            // 1. Vonage Voice API — the true zero-touch call (no dialer, no confirmation).
            val result = VonageCallTrigger.triggerVonageCall(
                context = ctx,
                toNumber = targetNumber,
                announcement = announcement,
                extras = VonageCallTrigger.VonageCallExtras(
                    userName = userName,
                    triggerType = trigger.displayName,
                    impactGforce = snapshot.peakGForce,
                    speedKmh = tele.speedKmh,
                    mapsUrl = mapsUrl
                )
            )

            if (result.success) {
                _crisisState.update {
                    it.copy(
                        vonageCall = it.vonageCall.copy(
                            status = VonageCallStatus.LIVE_CALL_ACTIVE,
                            callUuid = result.callUuid
                        ),
                        logMessages = it.logMessages + "VONAGE UPLINK: LIVE CALL ACTIVE (TTS playing)."
                    )
                }
                Log.i(tag, "Vonage zero-touch call live (uuid=${result.callUuid}).")
            } else {
                // 2. Offline fallback — on-device Telecom dial (still zero-touch, no dialer UI).
                _crisisState.update {
                    it.copy(
                        vonageCall = it.vonageCall.copy(
                            status = VonageCallStatus.FAILED_FALLBACK_DIALING,
                            error = result.error
                        ),
                        logMessages = it.logMessages +
                            "Vonage unreachable (${result.error}); engaging on-device zero-touch fallback dial."
                    )
                }
                Log.w(tag, "Vonage failed (${result.errorCode}: ${result.error}) — fallback dial.")
                telecomManager.initiateZeroTouchCall()
            }

            // 3. High-Accuracy Location Broadcast & Fallback SMS Dispatch (always runs).
            locationManager.dispatchFallbackEmergencySms(
                recipientPhone = targetNumber,
                triggerTitle = trigger.displayName
            )
        }
    }

    /**
     * Cancel/Dismiss action (e.g. false alarm slide-to-cancel).
     */
    fun cancelCrisisAlert() {
        countdownJob?.cancel()
        countdownJob = null
        telecomManager.endCall()
        cameraManager.stopCapture()

        _crisisState.update {
            it.copy(
                status = CrisisStatus.FALSE_ALARM_CANCELLED,
                isEscalated = false,
                isCameraFeedActive = false,
                preEscalationCountdown = 10,
                vonageCall = VonageCallState(),
                logMessages = it.logMessages + "Alert dismissed by user (False Alarm safeguard)."
            )
        }

        CrisisForegroundService.startService(
            getApplication(),
            CrisisForegroundService.ACTION_DISMISS_CRISIS
        )

        viewModelScope.launch {
            delay(2000)
            _crisisState.update { it.copy(status = CrisisStatus.IDLE_MONITORING) }
        }
    }

    /**
     * Immediate escalation to 911 / Public Safety Dispatch without countdown delay.
     * NOTE: emergency short codes always route via on-device Telecom — cloud PSTN
     * providers cannot reliably reach local PSAPs, and the native dialer guarantees
     * emergency routing even without data connectivity.
     */
    fun escalateTo911Immediately() {
        countdownJob?.cancel()
        telecomManager.escalateTo911Dispatch()
        locationManager.dispatchFallbackEmergencySms(
            recipientPhone = "911",
            triggerTitle = "CRITICAL EMERGENCY - 911 DISPATCH ESCALATION"
        )
        _crisisState.update {
            it.copy(
                status = CrisisStatus.EMERGENCY_DISPATCH_ACTIVE,
                isEscalated = true,
                logMessages = it.logMessages + "ESCALATED TO 911 PUBLIC SAFETY DISPATCH."
            )
        }
    }

    // Hardware Controls
    fun switchCamera() {
        cameraManager.switchCamera()
        _crisisState.update {
            it.copy(activeCameraFacing = cameraManager.currentFacing.value)
        }
    }

    fun toggleTorch() {
        cameraManager.toggleTorch()
        _crisisState.update {
            it.copy(isTorchActive = cameraManager.isTorchOn.value)
        }
    }

    fun toggleSpeakerphone() {
        telecomManager.toggleSpeakerphone()
    }

    fun toggleMute() {
        telecomManager.toggleMute()
    }

    // ==========================================
    // Simulation triggers for testing & review
    // ==========================================
    fun simulateVehicleCrash() {
        sensorDetector.simulateVehicleCrash()
    }

    fun simulateFallImpact() {
        sensorDetector.simulateFallImpact()
    }

    fun simulateDistressScream() {
        sensorDetector.simulateDistressScream()
    }

    fun simulateVisionFire() {
        val snapshot = CrisisSensorSnapshot(triggerSource = "Simulated Thermal/Visual Fire Sensor")
        handleSensorTrigger(CrisisTriggerType.VISION_FIRE_SMOKE, snapshot)
    }

    fun simulateVisionWeapon() {
        val snapshot = CrisisSensorSnapshot(triggerSource = "Simulated Threat Object Detector")
        handleSensorTrigger(CrisisTriggerType.VISION_WEAPON, snapshot)
    }

    fun simulateManualSos() {
        val snapshot = CrisisSensorSnapshot(triggerSource = "Manual User SOS Override")
        _crisisState.update {
            it.copy(
                status = CrisisStatus.POTENTIAL_CRISIS_DETECTED,
                triggerType = CrisisTriggerType.MANUAL_SOS_OVERRIDE,
                triggerTimestamp = System.currentTimeMillis(),
                sensorSnapshot = snapshot
            )
        }
        activateBackgroundCameraSubsystem()
        escalateToVerifiedEmergency(CrisisTriggerType.MANUAL_SOS_OVERRIDE)
    }

    override fun onCleared() {
        super.onCleared()
        sensorDetector.stopListening()
        cameraManager.stopCapture()
        locationManager.stopTracking()
        countdownJob?.cancel()
    }
}
