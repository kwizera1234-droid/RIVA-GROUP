package com.example.crisis.store

import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.example.crisis.models.CrisisSettings
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.crisisDataStore by preferencesDataStore(name = "crisis_settings")

/**
 * Phase 1 — Pre-Configured Settings persistence.
 *
 * Dual-layer storage so the zero-touch crisis path NEVER depends on UI state:
 *  - SharedPreferences ("crisis_emergency_prefs") — synchronous, instant read on the
 *    critical path (EmergencyTelecomManager + ForegroundService read this without
 *    coroutines during a crash). Keys are kept compatible with EmergencyTelecomManager.
 *  - DataStore ("crisis_settings") — reactive Flow for Compose UI + full CrisisSettings.
 *
 * Both layers are written together on every save.
 */
class CrisisSettingsStore(private val context: Context) {

    companion object {
        const val LEGACY_PREFS = "crisis_emergency_prefs"
        const val KEY_CONTACT_NAME = "emergency_contact_name"
        const val KEY_CONTACT_PHONE = "emergency_contact_phone"
        const val KEY_ONBOARDING_DONE = "crisis_onboarding_completed"
        const val KEY_DAEMON_ENABLED = "crisis_daemon_enabled"

        // DataStore keys
        val DS_CONTACT_NAME = stringPreferencesKey("contact_name")
        val DS_CONTACT_PHONE = stringPreferencesKey("contact_phone")
        val DS_SECONDARY_PHONE = stringPreferencesKey("secondary_phone")
        val DS_EMERGENCY_SVC = stringPreferencesKey("emergency_svc")
        val DS_ONBOARDING_DONE = booleanPreferencesKey("onboarding_done")
        val DS_DAEMON_ENABLED = booleanPreferencesKey("daemon_enabled")
        val DS_AUTO_DETECTION = booleanPreferencesKey("auto_detection")
        val DS_VISION_ENABLED = booleanPreferencesKey("vision_enabled")
        val DS_ZERO_TOUCH_DIAL = booleanPreferencesKey("zero_touch_dial")
        val DS_SPEAKERPHONE = booleanPreferencesKey("speakerphone")
        val DS_SMS_FALLBACK = booleanPreferencesKey("sms_fallback")
        val DS_CRASH_G = floatPreferencesKey("crash_g")
        val DS_FALL_G = floatPreferencesKey("fall_g")
        val DS_DB_THRESHOLD = floatPreferencesKey("db_threshold")
        val DS_AI_THRESHOLD = floatPreferencesKey("ai_threshold")
        val DS_COUNTDOWN = intPreferencesKey("countdown_secs")

        const val DEFAULT_CONTACT_NAME = "Primary Emergency Contact"
        const val DEFAULT_CONTACT_PHONE = "+1 (800) 555-0911"
        const val DEFAULT_SECONDARY_PHONE = "+1 (555) 911-4040"
        const val DEFAULT_EMERGENCY_SVC = "911"

        @Volatile
        private var instance: CrisisSettingsStore? = null

        fun get(context: Context): CrisisSettingsStore =
            instance ?: synchronized(this) {
                instance ?: CrisisSettingsStore(context.applicationContext).also { instance = it }
            }
    }

    private val legacy: SharedPreferences =
        context.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)

    // ------------------------------------------------------------------
    // Synchronous fast-path reads (used by Service / Telecom during crisis)
    // ------------------------------------------------------------------

    fun getContactPhoneSync(): String =
        // Legacy SharedPreferences is the synchronous source of truth on the
        // crash-time fast path (DataStore is async and never read here).
        legacy.getString(KEY_CONTACT_PHONE, null) ?: DEFAULT_CONTACT_PHONE

    fun getContactNameSync(): String =
        legacy.getString(KEY_CONTACT_NAME, DEFAULT_CONTACT_NAME) ?: DEFAULT_CONTACT_NAME

    fun isOnboardingCompletedSync(): Boolean =
        legacy.getBoolean(KEY_ONBOARDING_DONE, false)

    fun isDaemonEnabledSync(): Boolean =
        legacy.getBoolean(KEY_DAEMON_ENABLED, true)

    // ------------------------------------------------------------------
    // Reactive Flows for Compose UI
    // ------------------------------------------------------------------

    val settingsFlow: Flow<CrisisSettings> = context.crisisDataStore.data.map { p ->
        CrisisSettings(
            autoDetectionEnabled = p[DS_AUTO_DETECTION] ?: true,
            crashSensitivityG = p[DS_CRASH_G] ?: 3.8f,
            fallSensitivityG = p[DS_FALL_G] ?: 2.4f,
            acousticThresholdDb = p[DS_DB_THRESHOLD] ?: 85.0f,
            aiVisionVerificationEnabled = p[DS_VISION_ENABLED] ?: true,
            aiConfidenceThreshold = p[DS_AI_THRESHOLD] ?: 0.72f,
            zeroTouchDialingEnabled = p[DS_ZERO_TOUCH_DIAL] ?: true,
            autoSpeakerphoneEnabled = p[DS_SPEAKERPHONE] ?: true,
            autoSmsFallbackEnabled = p[DS_SMS_FALLBACK] ?: true,
            primaryContactName = p[DS_CONTACT_NAME]
                ?: legacy.getString(KEY_CONTACT_NAME, CrisisSettings().primaryContactName)
                ?: CrisisSettings().primaryContactName,
            primaryContactPhone = p[DS_CONTACT_PHONE]
                ?: legacy.getString(KEY_CONTACT_PHONE, CrisisSettings().primaryContactPhone)
                ?: CrisisSettings().primaryContactPhone,
            secondaryContactPhone = p[DS_SECONDARY_PHONE] ?: DEFAULT_SECONDARY_PHONE,
            emergencyServicesNumber = p[DS_EMERGENCY_SVC] ?: DEFAULT_EMERGENCY_SVC,
            preEscalationDelaySeconds = p[DS_COUNTDOWN] ?: 10
        )
    }

    val onboardingDoneFlow: Flow<Boolean> = context.crisisDataStore.data.map {
        it[DS_ONBOARDING_DONE] ?: legacy.getBoolean(KEY_ONBOARDING_DONE, false)
    }

    // ------------------------------------------------------------------
    // Writes (update both layers)
    // ------------------------------------------------------------------

    suspend fun saveEmergencyContact(name: String, phone: String) {
        val cleanName = name.trim().ifBlank { DEFAULT_CONTACT_NAME }
        val cleanPhone = phone.trim().ifBlank { DEFAULT_CONTACT_PHONE }
        legacy.edit()
            .putString(KEY_CONTACT_NAME, cleanName)
            .putString(KEY_CONTACT_PHONE, cleanPhone)
            .apply()
        context.crisisDataStore.edit {
            it[DS_CONTACT_NAME] = cleanName
            it[DS_CONTACT_PHONE] = cleanPhone
        }
    }

    suspend fun saveFullSettings(s: CrisisSettings) {
        legacy.edit()
            .putString(KEY_CONTACT_NAME, s.primaryContactName)
            .putString(KEY_CONTACT_PHONE, s.primaryContactPhone)
            .apply()
        context.crisisDataStore.edit {
            it[DS_CONTACT_NAME] = s.primaryContactName
            it[DS_CONTACT_PHONE] = s.primaryContactPhone
            it[DS_SECONDARY_PHONE] = s.secondaryContactPhone
            it[DS_EMERGENCY_SVC] = s.emergencyServicesNumber
            it[DS_AUTO_DETECTION] = s.autoDetectionEnabled
            it[DS_VISION_ENABLED] = s.aiVisionVerificationEnabled
            it[DS_ZERO_TOUCH_DIAL] = s.zeroTouchDialingEnabled
            it[DS_SPEAKERPHONE] = s.autoSpeakerphoneEnabled
            it[DS_SMS_FALLBACK] = s.autoSmsFallbackEnabled
            it[DS_CRASH_G] = s.crashSensitivityG
            it[DS_FALL_G] = s.fallSensitivityG
            it[DS_DB_THRESHOLD] = s.acousticThresholdDb
            it[DS_AI_THRESHOLD] = s.aiConfidenceThreshold
            it[DS_COUNTDOWN] = s.preEscalationDelaySeconds
        }
    }

    suspend fun setOnboardingCompleted(done: Boolean) {
        legacy.edit().putBoolean(KEY_ONBOARDING_DONE, done).apply()
        context.crisisDataStore.edit { it[DS_ONBOARDING_DONE] = done }
    }

    suspend fun setDaemonEnabled(enabled: Boolean) {
        legacy.edit().putBoolean(KEY_DAEMON_ENABLED, enabled).apply()
        context.crisisDataStore.edit { it[DS_DAEMON_ENABLED] = enabled }
    }

    suspend fun snapshot(): CrisisSettings = settingsFlow.first()

    /** Phone-number sanity check used before saving / before zero-touch dial. */
    fun isValidPhone(phone: String): Boolean {
        val digits = phone.filter { it.isDigit() }
        // Accept short codes like 911 plus full international numbers.
        return digits.length in 3..16
    }
}
