package com.example.services

import com.example.models.SensorReading
import com.example.models.UserProfile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class ChatMessage(
    val role: String,
    val content: String,
    val audioPath: String? = null,
    val timestamp: Long = System.currentTimeMillis()
)

class AiAssistantService {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val backendBaseUrl: String by lazy {
        System.getenv("SOBERWATCH_BACKEND_URL") ?: "https://soberwatch-backend.onrender.com"
    }

    suspend fun getClinicalResponse(
        userMessage: String,
        userProfile: UserProfile,
        currentReading: SensorReading,
        firebaseToken: String
    ): String {
        if (userMessage.isBlank()) {
            return ""
        }

        val telemetry = JSONObject().apply {
            put("alcoholBac", currentReading.alcoholBac)
            put("heartRateBpm", currentReading.heartRateBpm)
            put("spo2Percent", currentReading.spo2Percent)
            put("tempCelsius", currentReading.tempCelsius)
            put("status", currentReading.status)
            put("deviceId", currentReading.deviceId)
        }

        val json = JSONObject().apply {
            put("transcript", userMessage.trim())
            put("language", "rw")
            put("telemetry", telemetry)
            put("location", JSONObject())
            put("profile", JSONObject())
            put("history", org.json.JSONArray())
        }

        val request = Request.Builder()
            .url("$backendBaseUrl/api/voice/chat")
            .header("Authorization", "Bearer ${firebaseToken}")
            .header("Content-Type", "application/json")
            .post(json.toString().toRequestBody("application/json".toMediaType()))
            .build()

        return try {
            withContext(Dispatchers.IO) {
                val response = client.newCall(request).execute()
                val responseText = response.body?.string() ?: ""
                if (!response.isSuccessful) {
                    return@withContext "Voice AI service temporarily unavailable."
                }
                val data = JSONObject(responseText)
                data.optString("reply", "I am having trouble processing your request. Please try again.")
            }
        } catch (e: Exception) {
            "Voice AI service temporarily unavailable."
        }
    }
}
