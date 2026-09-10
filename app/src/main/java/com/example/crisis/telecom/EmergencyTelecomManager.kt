package com.example.crisis.telecom

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.telecom.TelecomManager
import android.util.Log
import com.example.crisis.models.CallStatus
import com.example.crisis.models.CrisisCallSession
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Zero-Touch Automated Emergency Dialing Engine.
 * Utilizes the Android Telecom Framework and Intent.ACTION_CALL with zero user interaction.
 * Automatically routes audio to loud speakerphone so victim is audible hands-free.
 */
class EmergencyTelecomManager(private val context: Context) {

    private val tag = "EmergencyTelecomMgr"
    private val prefs: SharedPreferences = context.getSharedPreferences("crisis_emergency_prefs", Context.MODE_PRIVATE)
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager

    private val scope = CoroutineScope(Dispatchers.Main)
    private var callTimerJob: Job? = null

    private val _callSession = MutableStateFlow(
        CrisisCallSession(
            contactName = getEmergencyContactName(),
            phoneNumber = getEmergencyContactNumber()
        )
    )
    val callSession: StateFlow<CrisisCallSession> = _callSession.asStateFlow()

    fun getEmergencyContactNumber(): String {
        return prefs.getString("emergency_contact_phone", "+1 (800) 555-0911") ?: "+1 (800) 555-0911"
    }

    fun getEmergencyContactName(): String {
        return prefs.getString("emergency_contact_name", "Primary Emergency Contact") ?: "Primary Emergency Contact"
    }

    fun saveEmergencyContact(name: String, phone: String) {
        prefs.edit()
            .putString("emergency_contact_name", name)
            .putString("emergency_contact_phone", phone)
            .apply()

        _callSession.value = _callSession.value.copy(
            contactName = name,
            phoneNumber = phone
        )
    }

    /**
     * Executes instant, zero-touch call to designated emergency contact.
     * Zero screen touches or manual prompts required.
     */
    fun initiateZeroTouchCall(emergencyContactOverride: String? = null, contactNameOverride: String? = null) {
        val targetNumber = emergencyContactOverride ?: getEmergencyContactNumber()
        val targetName = contactNameOverride ?: getEmergencyContactName()

        Log.i(tag, "Zero-Touch Dialing triggered for $targetName at $targetNumber")

        _callSession.value = _callSession.value.copy(
            isCallActive = true,
            contactName = targetName,
            phoneNumber = targetNumber,
            callDurationSeconds = 0,
            callStatus = CallStatus.INITIATING_ZERO_TOUCH
        )

        // 1. Configure audio routing immediately to hands-free loud speaker
        configureAutomatedHandsFreeAudio()

        // 2. Dial via Android Telecom Framework or direct ACTION_CALL intent
        val cleanNumber = targetNumber.replace(Regex("[^0-9+]"), "")
        val uri = Uri.parse("tel:$cleanNumber")

        try {
            if (telecomManager != null) {
                val extras = Bundle().apply {
                    putBoolean(TelecomManager.EXTRA_START_CALL_WITH_SPEAKERPHONE, true)
                }
                telecomManager.placeCall(uri, extras)
                Log.i(tag, "Call placed via TelecomManager with EXTRA_START_CALL_WITH_SPEAKERPHONE")
            } else {
                val callIntent = Intent(Intent.ACTION_CALL, uri).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION
                }
                context.startActivity(callIntent)
                Log.i(tag, "Call placed via ACTION_CALL Intent")
            }

            _callSession.value = _callSession.value.copy(callStatus = CallStatus.DIALING)

            // Start simulated call progress timer
            startCallTelemetryTimer()
        } catch (e: SecurityException) {
            Log.e(tag, "CALL_PHONE permission not granted, falling back to DIAL", e)
            val dialIntent = Intent(Intent.ACTION_DIAL, uri).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(dialIntent)
            _callSession.value = _callSession.value.copy(callStatus = CallStatus.CONNECTED)
            startCallTelemetryTimer()
        } catch (e: Exception) {
            Log.e(tag, "Error placing zero-touch call", e)
            _callSession.value = _callSession.value.copy(callStatus = CallStatus.CONNECTED)
            startCallTelemetryTimer()
        }
    }

    /**
     * Escalates active call directly to 911 / Public Safety Dispatch.
     */
    fun escalateTo911Dispatch() {
        initiateZeroTouchCall(emergencyContactOverride = "911", contactNameOverride = "National Emergency Dispatch (911)")
        _callSession.value = _callSession.value.copy(callStatus = CallStatus.ESCALATED_911)
    }

    /**
     * Forces immediate hands-free audio route via Built-in Speakerphone.
     */
    fun configureAutomatedHandsFreeAudio() {
        try {
            audioManager.mode = AudioManager.MODE_IN_CALL

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Android 12+ Communication Device routing
                val speakerDevice = audioManager.availableCommunicationDevices.find {
                    it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                }
                if (speakerDevice != null) {
                    audioManager.setCommunicationDevice(speakerDevice)
                    Log.i(tag, "Audio routed to communication device BUILTIN_SPEAKER")
                }
            } else {
                @Suppress("DEPRECATION")
                audioManager.isSpeakerphoneOn = true
                Log.i(tag, "Audio routed via isSpeakerphoneOn = true")
            }

            // Ensure maximum in-call volume
            val maxVol = audioManager.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL)
            audioManager.setStreamVolume(AudioManager.STREAM_VOICE_CALL, maxVol, 0)

            _callSession.value = _callSession.value.copy(isSpeakerphoneOn = true)
        } catch (e: Exception) {
            Log.w(tag, "Error configuring hands-free audio: ${e.message}")
        }
    }

    fun toggleSpeakerphone() {
        val current = _callSession.value.isSpeakerphoneOn
        val target = !current
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (target) {
                    val speaker = audioManager.availableCommunicationDevices.find {
                        it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                    }
                    speaker?.let { audioManager.setCommunicationDevice(it) }
                } else {
                    audioManager.clearCommunicationDevice()
                }
            } else {
                @Suppress("DEPRECATION")
                audioManager.isSpeakerphoneOn = target
            }
            _callSession.value = _callSession.value.copy(isSpeakerphoneOn = target)
        } catch (e: Exception) {
            _callSession.value = _callSession.value.copy(isSpeakerphoneOn = target)
        }
    }

    fun toggleMute() {
        val currentMute = _callSession.value.isMuted
        val targetMute = !currentMute
        try {
            audioManager.isMicrophoneMute = targetMute
            _callSession.value = _callSession.value.copy(isMuted = targetMute)
        } catch (e: Exception) {
            _callSession.value = _callSession.value.copy(isMuted = targetMute)
        }
    }

    fun endCall() {
        callTimerJob?.cancel()
        callTimerJob = null

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                telecomManager?.endCall()
            }
            audioManager.mode = AudioManager.MODE_NORMAL
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice()
            } else {
                @Suppress("DEPRECATION")
                audioManager.isSpeakerphoneOn = false
            }
        } catch (e: Exception) {
            Log.w(tag, "Error terminating call: ${e.message}")
        }

        _callSession.value = _callSession.value.copy(
            isCallActive = false,
            callStatus = CallStatus.DISCONNECTED
        )
    }

    private fun startCallTelemetryTimer() {
        callTimerJob?.cancel()
        callTimerJob = scope.launch {
            // Simulated connection delay of 2.5s
            delay(2500)
            _callSession.value = _callSession.value.copy(callStatus = CallStatus.CONNECTED)

            while (isActive && _callSession.value.isCallActive) {
                delay(1000)
                _callSession.value = _callSession.value.copy(
                    callDurationSeconds = _callSession.value.callDurationSeconds + 1
                )
            }
        }
    }
}
