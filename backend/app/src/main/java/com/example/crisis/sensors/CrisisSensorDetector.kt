package com.example.crisis.sensors

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import com.example.crisis.models.CrisisSensorSnapshot
import com.example.crisis.models.CrisisTriggerType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.sqrt

/**
 * High-performance, low-power sensor engine for automated crisis detection.
 * Monitors phone accelerometers, gyroscopes, and ambient acoustics.
 */
class CrisisSensorDetector(private val context: Context) : SensorEventListener {

    private val tag = "CrisisSensorDetector"
    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    private val accelerometer: Sensor? = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val linearAcceleration: Sensor? = sensorManager?.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
    private val gyroscope: Sensor? = sensorManager?.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

    private val scope = CoroutineScope(Dispatchers.Default)
    private var acousticJob: Job? = null
    private var isListening = false

    // Emission channel for detected potential crises
    private val _sensorTriggerEvents = MutableSharedFlow<SensorTriggerEvent>(extraBufferCapacity = 5)
    val sensorTriggerEvents: SharedFlow<SensorTriggerEvent> = _sensorTriggerEvents.asSharedFlow()

    data class SensorTriggerEvent(
        val triggerType: CrisisTriggerType,
        val snapshot: CrisisSensorSnapshot
    )

    // Fall detection state variables
    private var inFreeFall = false
    private var freeFallStartTime = 0L
    private val freeFallThresholdG = 0.38f // ~3.7 m/s^2
    private val impactThresholdG = 2.8f // ~27.5 m/s^2
    private val crashDecelThresholdG = 4.2f // ~41.2 m/s^2
    private val gyroSpikeThresholdRps = 6.0f // 6 rad/s roll/pitch jerk

    // Rolling gyroscope buffer
    private var currentGyroRps = 0.0f

    // Acoustic thresholds
    private val screamDecibelThreshold = 85.0f // dB SPL
    private val gunshotDecibelThreshold = 95.0f // dB SPL

    fun startListening() {
        if (isListening) return
        isListening = true

        // Register sensors with low-power UI sampling rate (~50 Hz)
        accelerometer?.let {
            sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
        linearAcceleration?.let {
            sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
        gyroscope?.let {
            sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }

        // Start low-power acoustic scanner in background coroutine
        startAcousticMonitoring()
        Log.i(tag, "Crisis sensor monitoring initialized successfully.")
    }

    fun stopListening() {
        if (!isListening) return
        isListening = false
        sensorManager?.unregisterListener(this)
        stopAcousticMonitoring()
        Log.i(tag, "Crisis sensor monitoring suspended.")
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return

        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                processAccelerometer(event.values[0], event.values[1], event.values[2])
            }
            Sensor.TYPE_GYROSCOPE -> {
                val gx = event.values[0]
                val gy = event.values[1]
                val gz = event.values[2]
                currentGyroRps = sqrt(gx * gx + gy * gy + gz * gz)
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    /**
     * Physics-based 3D vector magnitude calculation & multi-stage fall/crash detection.
     */
    private fun processAccelerometer(ax: Float, ay: Float, az: Float) {
        val magnitudeMs2 = sqrt(ax * ax + ay * ay + az * az)
        val gForce = magnitudeMs2 / 9.80665f
        val now = System.currentTimeMillis()

        // 1. Crash Collision Detection: Sudden extreme deceleration + rotational shock
        if (gForce > crashDecelThresholdG && currentGyroRps > gyroSpikeThresholdRps) {
            val snapshot = CrisisSensorSnapshot(
                peakGForce = gForce,
                vectorMagnitude = magnitudeMs2,
                fallDurationMs = 0L,
                gyroscopeRps = currentGyroRps,
                triggerSource = "Crash Telemetry (Dual Shock + Roll Vector)"
            )
            emitCrisisTrigger(CrisisTriggerType.VEHICLE_CRASH, snapshot)
            return
        }

        // 2. High-G Sudden Impact (e.g. physical blow or vehicle collision)
        if (gForce > crashDecelThresholdG + 0.8f) {
            val snapshot = CrisisSensorSnapshot(
                peakGForce = gForce,
                vectorMagnitude = magnitudeMs2,
                fallDurationMs = 0L,
                gyroscopeRps = currentGyroRps,
                triggerSource = "Extreme G-Force Impact Vector"
            )
            emitCrisisTrigger(CrisisTriggerType.HIGH_G_IMPACT, snapshot)
            return
        }

        // 3. Fall Detection Multi-Phase State Machine:
        // Stage A: Free fall (weightlessness when phone drops)
        if (gForce < freeFallThresholdG) {
            if (!inFreeFall) {
                inFreeFall = true
                freeFallStartTime = now
            }
        } else if (inFreeFall) {
            val fallDuration = now - freeFallStartTime

            // Stage B: Ground Impact shock following free fall (duration 100ms - 2500ms)
            if (fallDuration in 100..2500 && gForce > impactThresholdG) {
                inFreeFall = false
                val snapshot = CrisisSensorSnapshot(
                    peakGForce = gForce,
                    vectorMagnitude = magnitudeMs2,
                    fallDurationMs = fallDuration,
                    gyroscopeRps = currentGyroRps,
                    triggerSource = "Free-Fall Detection ($fallDuration ms drop followed by ${"%.1f".format(gForce)}G ground impact)"
                )
                emitCrisisTrigger(CrisisTriggerType.FREE_FALL_IMPACT, snapshot)
            } else if (fallDuration > 2500 || gForce in 0.8f..1.2f) {
                // Reset if duration expired without impact
                inFreeFall = false
            }
        }
    }

    /**
     * Continuous background low-power acoustic scanner.
     * Evaluates ambient SPL (Sound Pressure Level) and acoustic energy distribution.
     */
    private fun startAcousticMonitoring() {
        stopAcousticMonitoring()
        acousticJob = scope.launch(Dispatchers.IO) {
            val sampleRate = 16000
            val channelConfig = AudioFormat.CHANNEL_IN_MONO
            val audioFormat = AudioFormat.ENCODING_PCM_16BIT
            val bufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat).coerceAtLeast(2048)

            var audioRecord: AudioRecord? = null
            try {
                audioRecord = AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    sampleRate,
                    channelConfig,
                    audioFormat,
                    bufferSize
                )

                if (audioRecord.state != AudioRecord.STATE_INITIALIZED) {
                    Log.w(tag, "AudioRecord initialization failed, acoustic monitoring unavailable.")
                    return@launch
                }

                audioRecord.startRecording()
                val buffer = ShortArray(bufferSize)

                while (isActive && isListening) {
                    val read = audioRecord.read(buffer, 0, buffer.size)
                    if (read > 0) {
                        var sumSquared = 0.0
                        var peakAmplitude = 0
                        var zeroCrossings = 0

                        for (i in 0 until read) {
                            val sample = buffer[i].toInt()
                            sumSquared += sample * sample
                            val absSample = kotlin.math.abs(sample)
                            if (absSample > peakAmplitude) peakAmplitude = absSample
                            if (i > 0 && ((buffer[i] > 0 && buffer[i - 1] <= 0) || (buffer[i] < 0 && buffer[i - 1] >= 0))) {
                                zeroCrossings++
                            }
                        }

                        val rms = sqrt(sumSquared / read)
                        val decibels = if (rms > 1.0) (20.0 * kotlin.math.log10(rms)).toFloat() else 0.0f
                        val estimatedFrequency = (zeroCrossings * sampleRate / (2.0f * read))

                        // High decibel detection for gunshot or explosion
                        if (decibels >= gunshotDecibelThreshold) {
                            val snapshot = CrisisSensorSnapshot(
                                decibelsSPL = decibels,
                                dominantFrequencyHz = estimatedFrequency,
                                triggerSource = "Acoustic Gunshot / Impulse Peak ($decibels dB)"
                            )
                            emitCrisisTrigger(CrisisTriggerType.ACOUSTIC_GUNSHOT, snapshot)
                        }
                        // Scream detection: sustained high SPL in human distress frequency band (1.8 kHz - 3.5 kHz)
                        else if (decibels >= screamDecibelThreshold && estimatedFrequency in 1600.0f..3800.0f) {
                            val snapshot = CrisisSensorSnapshot(
                                decibelsSPL = decibels,
                                dominantFrequencyHz = estimatedFrequency,
                                triggerSource = "Acoustic Distress Scream (Peak $decibels dB @ ${estimatedFrequency.toInt()} Hz)"
                            )
                            emitCrisisTrigger(CrisisTriggerType.ACOUSTIC_DISTRESS_SCREAM, snapshot)
                        }
                    }
                    kotlinx.coroutines.delay(100) // 10 Hz sampling for low power
                }
            } catch (e: SecurityException) {
                Log.w(tag, "Audio record permission not granted: ${e.message}")
            } catch (e: Exception) {
                Log.e(tag, "Error in acoustic monitoring loop", e)
            } finally {
                try {
                    audioRecord?.stop()
                    audioRecord?.release()
                } catch (e: Exception) {
                    Log.w(tag, "Error releasing audioRecord", e)
                }
            }
        }
    }

    private fun stopAcousticMonitoring() {
        acousticJob?.cancel()
        acousticJob = null
    }

    private fun emitCrisisTrigger(triggerType: CrisisTriggerType, snapshot: CrisisSensorSnapshot) {
        scope.launch {
            _sensorTriggerEvents.emit(SensorTriggerEvent(triggerType, snapshot))
        }
    }

    // ==========================================
    // Simulation triggers for testing & review
    // ==========================================
    fun simulateVehicleCrash() {
        val snapshot = CrisisSensorSnapshot(
            peakGForce = 5.4f,
            vectorMagnitude = 52.9f,
            fallDurationMs = 0L,
            gyroscopeRps = 8.2f,
            triggerSource = "Simulated High-Speed Collision (5.4G Deceleration)"
        )
        emitCrisisTrigger(CrisisTriggerType.VEHICLE_CRASH, snapshot)
    }

    fun simulateFallImpact() {
        val snapshot = CrisisSensorSnapshot(
            peakGForce = 3.6f,
            vectorMagnitude = 35.3f,
            fallDurationMs = 450L,
            gyroscopeRps = 3.1f,
            triggerSource = "Simulated Fall & Hard Surface Impact (3.6G)"
        )
        emitCrisisTrigger(CrisisTriggerType.FREE_FALL_IMPACT, snapshot)
    }

    fun simulateDistressScream() {
        val snapshot = CrisisSensorSnapshot(
            decibelsSPL = 91.5f,
            dominantFrequencyHz = 2650.0f,
            triggerSource = "Simulated Distress Acoustic Scream (91.5 dB @ 2.6 kHz)"
        )
        emitCrisisTrigger(CrisisTriggerType.ACOUSTIC_DISTRESS_SCREAM, snapshot)
    }
}
