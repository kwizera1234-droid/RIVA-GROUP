package com.example.crisis.models

/**
 * High-level state of the crisis automation engine.
 */
enum class CrisisStatus {
    IDLE_MONITORING,
    POTENTIAL_CRISIS_DETECTED,
    CAMERA_ACQUIRING,
    AI_VERIFYING,
    VERIFIED_ESCALATING,
    EMERGENCY_DISPATCH_ACTIVE,
    FALSE_ALARM_CANCELLED
}

/**
 * Root cause triggers detected by sensors or computer vision.
 */
enum class CrisisTriggerType(val displayName: String, val severityLevel: Int) {
    VEHICLE_CRASH("High-G Vehicle Collision", 10),
    HIGH_G_IMPACT("Severe Sudden Impact", 9),
    FREE_FALL_IMPACT("Free-Fall & Ground Impact", 9),
    ACOUSTIC_DISTRESS_SCREAM("Acoustic Distress / Scream", 8),
    ACOUSTIC_GUNSHOT("Gunshot / Explosion Acoustic Peak", 10),
    VISION_FIRE_SMOKE("Visual Verification: Fire & Smoke", 10),
    VISION_WEAPON("Visual Verification: Weapon / Threat", 10),
    VISION_INCAPACITATION("Visual Verification: Unresponsive Fall", 9),
    MANUAL_SOS_OVERRIDE("Manual SOS Override Trigger", 10),
    NONE("Normal Operations", 0)
}

/**
 * Real-time high-fidelity location and telemetry.
 */
data class CrisisTelemetry(
    val latitude: Double = 37.7749,
    val longitude: Double = -122.4194,
    val altitudeMeters: Double = 32.4,
    val accuracyMeters: Float = 2.1f,
    val speedKmh: Float = 0.0f,
    val bearingDegrees: Float = 142.0f,
    val batteryPercent: Int = 88,
    val isCharging: Boolean = false,
    val networkType: String = "5G Ultra-Wideband",
    val satellitesLocked: Int = 18,
    val timestamp: Long = System.currentTimeMillis(),
    val addressEstimate: String = "742 Evergreen Terrace, Sector 4"
)

/**
 * Sensor metrics captured at the time of crisis trigger.
 */
data class CrisisSensorSnapshot(
    val peakGForce: Float = 1.0f,
    val vectorMagnitude: Float = 9.8f,
    val fallDurationMs: Long = 0L,
    val decibelsSPL: Float = 45.0f,
    val dominantFrequencyHz: Float = 440.0f,
    val gyroscopeRps: Float = 0.1f,
    val triggerSource: String = "Sensor Subsystem"
)

/**
 * Computer Vision verification output from on-device AI models.
 */
data class VisionEvidence(
    val isVerified: Boolean = false,
    val confidence: Float = 0.0f,
    val detectedCategory: String = "Analyzing...",
    val boundingBox: RectFCoordinates? = null,
    val frameTimestamp: Long = 0L,
    val rearCameraCaptured: Boolean = false,
    val frontCameraCaptured: Boolean = false,
    val hashSha256: String = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
)

data class RectFCoordinates(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float
)

/**
 * Zero-touch active call session telemetry.
 */
data class CrisisCallSession(
    val isCallActive: Boolean = false,
    val contactName: String = "Emergency Dispatch / Primary Contact",
    val phoneNumber: String = "+1 (800) 555-0911",
    val callDurationSeconds: Int = 0,
    val isSpeakerphoneOn: Boolean = true,
    val isMuted: Boolean = false,
    val callStatus: CallStatus = CallStatus.IDLE
)

enum class CallStatus {
    IDLE,
    INITIATING_ZERO_TOUCH,
    DIALING,
    RINGING,
    CONNECTED,
    ESCALATED_911,
    DISCONNECTED
}

/**
 * Zero-touch Vonage Voice API uplink state.
 *
 * The app NEVER opens an Intent dialer. On verified crisis it POSTs to the
 * secure backend (/api/emergency/call) and Vonage places a real PSTN call
 * speaking a dynamic TTS announcement. On-device Telecom dialing survives
 * only as an offline fallback when the backend is unreachable.
 */
enum class VonageCallStatus {
    IDLE,
    TRIGGERING,
    CONNECTING,
    LIVE_CALL_ACTIVE,
    FAILED_FALLBACK_DIALING,
    FAILED
}

data class VonageCallState(
    val status: VonageCallStatus = VonageCallStatus.IDLE,
    val targetName: String = "",
    val targetNumber: String = "",
    val announcement: String = "",
    val callUuid: String? = null,
    val error: String? = null,
    val attemptTimestamp: Long = 0L
)

/**
 * Real-time data broadcasting sync status.
 */
data class DataSharingStatus(
    val webSocketActive: Boolean = true,
    val firestoreSynced: Boolean = true,
    val smsDispatched: Boolean = false,
    val smsDispatchRecipient: String = "",
    val fallbackSatelliteLink: String = "",
    val lastBroadcastTimestamp: Long = 0L
)

/**
 * Unified reactive state of the Emergency Response Automation system.
 */
data class CrisisState(
    val status: CrisisStatus = CrisisStatus.IDLE_MONITORING,
    val triggerType: CrisisTriggerType = CrisisTriggerType.NONE,
    val triggerTimestamp: Long = 0L,
    val preEscalationCountdown: Int = 10,
    val isEscalated: Boolean = false,
    val telemetry: CrisisTelemetry = CrisisTelemetry(),
    val sensorSnapshot: CrisisSensorSnapshot = CrisisSensorSnapshot(),
    val visionEvidence: VisionEvidence = VisionEvidence(),
    val callSession: CrisisCallSession = CrisisCallSession(),
    val vonageCall: VonageCallState = VonageCallState(),
    val dataSharing: DataSharingStatus = DataSharingStatus(),
    val isMonitoringActive: Boolean = true,
    val isCameraFeedActive: Boolean = false,
    val activeCameraFacing: CameraFacing = CameraFacing.REAR,
    val isTorchActive: Boolean = false,
    val logMessages: List<String> = emptyList()
)

enum class CameraFacing {
    FRONT,
    REAR
}

/**
 * Crisis system user configuration preferences.
 */
data class CrisisSettings(
    val autoDetectionEnabled: Boolean = true,
    val crashSensitivityG: Float = 3.8f,
    val fallSensitivityG: Float = 2.4f,
    val acousticThresholdDb: Float = 85.0f,
    val aiVisionVerificationEnabled: Boolean = true,
    val aiConfidenceThreshold: Float = 0.72f,
    val zeroTouchDialingEnabled: Boolean = true,
    val autoSpeakerphoneEnabled: Boolean = true,
    val autoSmsFallbackEnabled: Boolean = true,
    val primaryContactName: String = "Sarah Connor (Wife)",
    val primaryContactPhone: String = "+1 (555) 911-3829",
    val secondaryContactPhone: String = "+1 (555) 911-4040",
    val emergencyServicesNumber: String = "911",
    val preEscalationDelaySeconds: Int = 10
)
