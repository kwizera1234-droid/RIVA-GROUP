package com.example.crisis.network

import android.util.Log
import com.example.crisis.models.CrisisSensorSnapshot
import com.example.crisis.models.CrisisTelemetry
import com.example.crisis.models.CrisisTriggerType
import com.example.crisis.models.VisionEvidence
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Phase 3 — Real-Time Live Tracking uplink.
 *
 * Pushes exact GPS coordinates + live telemetry (speed, impact force, vision verdict)
 * to a remote server. SMS remains the guaranteed fallback (handled by
 * CrisisLocationManager.dispatchFallbackEmergencySms); this uploader is the
 * high-fidelity channel used concurrently with the zero-touch call.
 *
 * Payload contract (POST JSON):
 * ```
 * {
 *   "trigger": "High-G Vehicle Collision",
 *   "lat": 37.7749, "lng": -122.4194, "accuracyM": 2.1,
 *   "speedKmh": 48.2, "peakG": 5.4, "battery": 88,
 *   "vision": "Structural Collision Deformation", "confidence": 0.94,
 *   "mapUrl": "https://maps.google.com/?q=..&t=k&z=19",
 *   "timestamp": 1715...
 * }
 * ```
 * Configure the endpoint via [configure] (e.g. from BuildConfig / Settings).
 * If no endpoint is configured the call is a structured no-op that still returns
 * the tracking link so the SMS path can use it.
 */
object CrisisTelemetryUploader {

    private val tag = "CrisisTelemetryUploader"
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    @Volatile
    private var endpointUrl: String? = null

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(8, TimeUnit.SECONDS)
            .writeTimeout(8, TimeUnit.SECONDS)
            .readTimeout(8, TimeUnit.SECONDS)
            .build()
    }

    fun configure(url: String?) {
        endpointUrl = url?.trim()?.ifBlank { null }
    }

    fun satelliteLink(lat: Double, lng: Double): String =
        "https://maps.google.com/?q=$lat,$lng&t=k&z=19"

    /** Structural SMS body shared by SMS fallback + server `smsPreview` field. */
    fun buildSmsPayload(
        triggerTitle: String,
        telemetry: CrisisTelemetry,
        snapshot: CrisisSensorSnapshot? = null,
        vision: VisionEvidence? = null
    ): String {
        val link = satelliteLink(telemetry.latitude, telemetry.longitude)
        val gLine = if (snapshot != null && snapshot.peakGForce > 1.1f) {
            "Impact: ${"%.1f".format(snapshot.peakGForce)}G (${snapshot.triggerSource}) | "
        } else ""
        val visionLine = if (vision != null && vision.isVerified) {
            "AI: ${vision.detectedCategory} (${(vision.confidence * 100).toInt()}%) | "
        } else ""
        return "SOS CRITICAL: $triggerTitle | " +
            "Loc ${"%.5f".format(telemetry.latitude)},${"%.5f".format(telemetry.longitude)} " +
            "(±${telemetry.accuracyMeters.toInt()}m) | " +
            "Speed ${telemetry.speedKmh.toInt()}km/h | " +
            gLine + visionLine +
            "Batt ${telemetry.batteryPercent}% | Map: $link"
    }

    suspend fun pushCrisis(
        trigger: CrisisTriggerType,
        telemetry: CrisisTelemetry,
        snapshot: CrisisSensorSnapshot,
        vision: VisionEvidence?,
        contactPhone: String
    ): UploadResult = withContext(Dispatchers.IO) {
        val link = satelliteLink(telemetry.latitude, telemetry.longitude)
        val body = JSONObject()
            .put("trigger", trigger.displayName)
            .put("severity", trigger.severityLevel)
            .put("lat", telemetry.latitude)
            .put("lng", telemetry.longitude)
            .put("accuracyM", telemetry.accuracyMeters.toDouble())
            .put("altitudeM", telemetry.altitudeMeters)
            .put("speedKmh", telemetry.speedKmh.toDouble())
            .put("bearing", telemetry.bearingDegrees.toDouble())
            .put("peakG", snapshot.peakGForce.toDouble())
            .put("fallMs", snapshot.fallDurationMs)
            .put("triggerSource", snapshot.triggerSource)
            .put("vision", vision?.detectedCategory ?: "pending")
            .put("confidence", (vision?.confidence ?: 0f).toDouble())
            .put("battery", telemetry.batteryPercent)
            .put("contactPhone", contactPhone)
            .put("mapUrl", link)
            .put("smsPreview", buildSmsPayload(trigger.displayName, telemetry, snapshot, vision))
            .put("timestamp", System.currentTimeMillis())
            .toString()

        val url = endpointUrl
        if (url.isNullOrBlank()) {
            Log.i(tag, "No remote endpoint configured — telemetry held for SMS channel. $link")
            return@withContext UploadResult(delivered = false, mapUrl = link, reason = "no-endpoint")
        }
        try {
            val request = Request.Builder()
                .url(url)
                .post(body.toRequestBody(jsonMedia))
                .header("Content-Type", "application/json")
                .build()
            client.newCall(request).execute().use { resp ->
                val ok = resp.isSuccessful
                Log.i(tag, "Telemetry push -> $url : HTTP ${resp.code}")
                UploadResult(delivered = ok, mapUrl = link, reason = "http-${resp.code}")
            }
        } catch (e: Exception) {
            Log.w(tag, "Telemetry push failed, SMS fallback still active: ${e.message}")
            UploadResult(delivered = false, mapUrl = link, reason = e.message ?: "error")
        }
    }

    data class UploadResult(
        val delivered: Boolean,
        val mapUrl: String,
        val reason: String
    )
}
