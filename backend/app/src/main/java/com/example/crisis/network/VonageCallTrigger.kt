package com.example.crisis.network

import android.content.Context
import android.util.Log
import com.example.data.room.SoberWatchDatabase
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Zero-touch Vonage Voice API trigger.
 *
 * TRUE automation path — no Intent, no dialer screen, no user confirmation:
 *  1. App POSTs (Firebase Bearer auth) to the secure backend
 *     `POST {backend}/api/emergency/call`.
 *  2. Backend (Vonage Voice API) places a real PSTN call to the emergency
 *     contact and speaks the dynamic TTS announcement.
 *
 * Returns failure (never throws) when offline, unauthenticated, or the server
 * reports Vonage unconfigured — callers then fall back to on-device Telecom
 * dialing so rescue is never blocked by network state.
 */
object VonageCallTrigger {

    private const val TAG = "VonageCallTrigger"
    private const val PREFS = "crisis_emergency_prefs"
    private const val KEY_BACKEND_URL = "crisis_backend_url"
    const val DEFAULT_BACKEND_URL = "https://soberwatch-backend.onrender.com"
    const val ENDPOINT_PATH = "/api/emergency/call"

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()
    }

    data class VonageCallExtras(
        val userName: String? = null,
        val triggerType: String? = null,
        val impactGforce: Float? = null,
        val speedKmh: Float? = null,
        val mapsUrl: String? = null,
        val language: String = "en-US"
    )

    data class VonageResult(
        val success: Boolean,
        val callUuid: String? = null,
        val toNumber: String = "",
        val error: String? = null,
        val errorCode: String? = null,
        val httpCode: Int = 0
    )

    fun resolveBackendUrl(context: Context): String {
        val override = try {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_BACKEND_URL, null)?.trim()
        } catch (_: Exception) {
            null
        }
        val base = if (!override.isNullOrBlank()) override else DEFAULT_BACKEND_URL
        return base.trim().trimEnd('/')
    }

    /**
     * Client-side preview of the TTS announcement (the server recomposes
     * authoritatively via composeEmergencyMessage; this is for instant HUD text).
     */
    fun buildAnnouncement(
        userName: String,
        triggerTitle: String,
        impactGforce: Float,
        speedKmh: Float
    ): String {
        val clean = userName.trim().ifBlank { "the user" }
        val gPart = if (impactGforce > 0.5f) " Impact force: ${"%.1f".format(impactGforce)} G." else ""
        val speedPart = if (speedKmh >= 0f) " Speed at event: ${speedKmh.toInt()} kilometers per hour." else ""
        return ("Emergency detected for $clean." +
            " This is an automated SoberWatch distress call." +
            " Cause: $triggerTitle." +
            gPart + speedPart +
            " High-accuracy live location tracking link has been sent via SMS." +
            " Please respond immediately or dispatch help.")
            .replace(Regex("\\s+"), " ").trim().take(1000)
    }

    /** Device owner's name for "Emergency detected for [User Name]". */
    suspend fun resolveUserName(context: Context): String = withContext(Dispatchers.IO) {
        try {
            val roomName = SoberWatchDatabase.getDatabase(context.applicationContext)
                .userProfileDao().getUserProfile().first()?.name?.trim()
            if (!roomName.isNullOrBlank()) return@withContext roomName
        } catch (e: Exception) {
            Log.w(TAG, "Room user name unavailable: ${e.message}")
        }
        try {
            val display = FirebaseAuth.getInstance().currentUser?.displayName?.trim()
            if (!display.isNullOrBlank()) return@withContext display
        } catch (e: Exception) {
            Log.w(TAG, "Firebase display name unavailable: ${e.message}")
        }
        "the user"
    }

    private suspend fun fetchIdToken(): String? = withContext(Dispatchers.IO) {
        try {
            val user = FirebaseAuth.getInstance().currentUser ?: return@withContext null
            user.getIdToken(false).await().token
        } catch (e: Exception) {
            Log.w(TAG, "ID token unavailable: ${e.message}")
            null
        }
    }

    suspend fun triggerVonageCall(
        context: Context,
        toNumber: String,
        announcement: String,
        extras: VonageCallExtras = VonageCallExtras(),
        backendUrl: String? = null
    ): VonageResult = withContext(Dispatchers.IO) {
        if (toNumber.trim().isEmpty()) {
            return@withContext VonageResult(false, error = "No emergency number configured")
        }
        val idToken = fetchIdToken()
        if (idToken.isNullOrBlank()) {
            return@withContext VonageResult(
                false, error = "Not signed in — Vonage uplink needs authentication",
                errorCode = "NO_AUTH"
            )
        }

        val url = "${backendUrl ?: resolveBackendUrl(context)}$ENDPOINT_PATH"
        val body = JSONObject()
            .put("toNumber", toNumber.trim())
            .put("message", announcement)
            .put("userName", extras.userName ?: "")
            .put("triggerType", extras.triggerType ?: "")
            .put("mapsUrl", extras.mapsUrl ?: "")
            .put("language", extras.language)
            .apply {
                extras.impactGforce?.let { put("impactGforce", it.toDouble()) }
                extras.speedKmh?.let { put("speedKmh", it.toDouble()) }
            }
            .toString()

        try {
            val request = Request.Builder()
                .url(url)
                .post(body.toRequestBody(jsonMedia))
                .header("Authorization", "Bearer $idToken")
                .header("Content-Type", "application/json")
                .build()
            client.newCall(request).execute().use { resp ->
                val text = try {
                    resp.body?.string() ?: ""
                } catch (_: Exception) {
                    ""
                }
                if (resp.isSuccessful) {
                    val uuid = try {
                        val json = JSONObject(text)
                        val call = json.optJSONObject("call")
                        call?.optString("uuid")?.ifBlank { null }
                            ?: json.optString("callUuid").ifBlank { null }
                    } catch (_: Exception) {
                        null
                    }
                    Log.i(TAG, "Vonage uplink accepted for $toNumber (uuid=$uuid)")
                    VonageResult(true, callUuid = uuid, toNumber = toNumber, httpCode = resp.code)
                } else {
                    val (msg, code) = try {
                        val json = JSONObject(text)
                        (json.optString("message").ifBlank { "Server rejected call request" }) to
                            json.optString("code").ifBlank { null }
                    } catch (_: Exception) {
                        "Server rejected call request" to null
                    }
                    Log.w(TAG, "Vonage uplink refused HTTP ${resp.code}: $msg")
                    VonageResult(false, toNumber = toNumber, error = msg, errorCode = code, httpCode = resp.code)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Vonage uplink unreachable ($url): ${e.message}")
            VonageResult(false, toNumber = toNumber, error = e.message ?: "Network error", errorCode = "NETWORK")
        }
    }
}
