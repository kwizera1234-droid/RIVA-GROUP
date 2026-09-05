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

class AiInsightsService {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val openrouterApiKey: String by lazy {
        System.getenv("OPENROUTER_API_KEY") ?: ""
    }

    private val openrouterModel: String by lazy {
        System.getenv("OPENROUTER_MODEL") ?: "openrouter/free"
    }

    suspend fun generateInsights(
        userProfile: UserProfile,
        currentReading: SensorReading,
        recentReadings: List<SensorReading>
    ): List<AiInsightCard> = withContext(Dispatchers.IO) {
        if (openrouterApiKey.isEmpty()) {
            return@withContext emptyList()
        }

        val telemetryJson = buildTelemetryJson(currentReading)
        val historyJson = buildHistoryJson(recentReadings)

        val prompt = buildPrompt(currentReading, recentReadings)

        try {
            val body = JSONObject().apply {
                put("model", openrouterModel)
                put("temperature", 0.2)
                put("max_tokens", 1400)
                val messages = org.json.JSONArray()
                val systemMsg = JSONObject()
                systemMsg.put("role", "system")
                systemMsg.put("content", "You are SoberWatch AI. Analyze ONLY real telemetry data. Never fabricate values. Return a structured response.")
                messages.put(systemMsg)
                val userMsg = JSONObject()
                userMsg.put("role", "user")
                userMsg.put("content", prompt)
                messages.put(userMsg)
                put("messages", messages)
            }

            val request = Request.Builder()
                .url("https://openrouter.ai/api/v1/chat/completions")
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer $openrouterApiKey")
                .post(body.toString().toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()
            val responseText = response.body?.string() ?: ""

            if (!response.isSuccessful) {
                return@withContext emptyList()
            }

            val data = JSONObject(responseText)
            val message = data.getJSONObject("choices").getJSONArray("messages").getJSONObject(0)
            val content = message.getString("content")

            return@withContext parseInsights(content, currentReading)
        } catch (e: Exception) {
            return@withContext emptyList()
        }
    }

    private fun buildTelemetryJson(reading: SensorReading): String {
        return """
            {
                "alcoholBac": ${reading.alcoholBac},
                "heartRateBpm": ${reading.heartRateBpm},
                "spo2Percent": ${reading.spo2Percent},
                "tempCelsius": ${reading.tempCelsius},
                "status": "${reading.status}",
                "deviceId": "${reading.deviceId}",
                "timestamp": ${reading.timestamp},
                "ecgStatus": "${reading.ecgStatus}",
                "overallHealthScore": ${reading.overallHealthScore}
            }
        """.trimIndent()
    }

    private fun buildHistoryJson(readings: List<SensorReading>): String {
        val items = readings.map { r ->
            """{"alcoholBac":${r.alcoholBac},"heartRateBpm":${r.heartRateBpm},"spo2Percent":${r.spo2Percent},"tempCelsius":${r.tempCelsius},"status":"${r.status}","timestamp":${r.timestamp}}"""
        }
        return "[$items.joinToString(",")]"
    }

    private fun buildPrompt(currentReading: SensorReading, recentReadings: List<SensorReading>): String {
        val historyJson = buildHistoryJson(recentReadings)
        return """
            Analyze ONLY the real SoberWatch telemetry supplied below. This telemetry is authoritative and comes from actual device sensors.

            STRICT RULES:
            1. Never invent a measurement.
            2. If a field is missing or null, say "Not available".
            3. Distinguish OBSERVED DATA from INTERPRETATION and RECOMMENDATION.
            4. Recommendations must be practical and based on supplied data.
            5. Do not diagnose disease.

            CURRENT TELEMETRY: ${buildTelemetryJson(currentReading)}

            RECENT HISTORY: ${historyJson}

            Return a JSON array of insight objects with these fields:
            [
              {
                "id": "unique_id",
                "category": "ALCOHOL|CARDIOVASCULAR|OXYGEN|THERMAL|OVERALL",
                "title": "short title",
                "description": "evidence-based description using actual numbers",
                "recommendation": "practical recommendation",
                "statusColorHex": "#hexcolor"
              }
            ]
        """.trimIndent()
    }

    private fun parseInsights(responseText: String, currentReading: SensorReading): List<AiInsightCard> {
        val insights = mutableListOf<AiInsightCard>()

        try {
            val jsonMatch = Regex("\\[[\\s\\S]*\\]").find(responseText)
            if (jsonMatch != null) {
                val arr = org.json.JSONArray(jsonMatch.value)
                for (i in 0 until arr.length()) {
                    val obj = arr.getJSONObject(i)
                    insights.add(
                        AiInsightCard(
                            id = obj.optString("id", "insight_$i"),
                            category = obj.optString("category", "GENERAL"),
                            title = obj.optString("title", "Analysis"),
                            description = obj.optString("description", ""),
                            recommendation = obj.optString("recommendation", ""),
                            statusColorHex = obj.optString("statusColorHex", "#10B981")
                        )
                    )
                }
            }
        } catch (e: Exception) {
            // If JSON parsing fails, return a single insight based on actual data
            insights.add(
                AiInsightCard(
                    id = "openrouter_analysis",
                    category = "OVERALL",
                    title = "AI Analysis",
                    description = "Real-time telemetry analysis from SoberWatch AI.",
                    recommendation = "Review your readings and consult a healthcare provider if needed.",
                    statusColorHex = when {
                        currentReading.alcoholBac >= 0.08 -> "#EF4444"
                        currentReading.alcoholBac >= 0.02 -> "#F59E0B"
                        else -> "#10B981"
                    }
                )
            )
        }

        return insights
    }
}
