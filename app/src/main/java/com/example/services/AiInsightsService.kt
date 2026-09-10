package com.example.services

import com.example.models.SensorReading
import com.example.models.UserProfile

class AiInsightsService {
    suspend fun generateInsights(
        userProfile: UserProfile,
        currentReading: SensorReading,
        recentReadings: List<SensorReading>
    ): List<AiInsightCard> {
        // OpenRouter credentials and provider calls remain on the authenticated backend.
        return emptyList()
    }
}
