package com.example.crisis.permissions

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * Phase 1 — Bulletproof Permissions.
 *
 * Single source of truth for every life-saving permission the crisis engine needs
 * BEFORE a crisis happens. Crisis execution itself must be 100% touchless, so all
 * grants are forced during onboarding / launch checks, never during an accident.
 *
 * Life-saving set:
 *  - Foreground location (FINE + COARSE) — exact GPS + satellite tracking
 *  - Background location (ACCESS_BACKGROUND_LOCATION) — tracking when screen off / app killed
 *  - Camera — silent background vision verification
 *  - Microphone (RECORD_AUDIO) — scream / impact acoustic detection
 *  - Direct calling (CALL_PHONE) — programmatic zero-touch ACTION_CALL / Telecom placeCall
 *  - SMS (SEND_SMS) — automated structural SMS payload with tracking link
 *  - Notifications (POST_NOTIFICATIONS, Android 13+) — foreground-service shield notice
 */
object CrisisPermissionsManager {

    const val REQUEST_CODE_CRISIS_ALL = 9001

    /** Runtime permissions that can be requested together in one dialog batch. */
    val FOREGROUND_BATCH: Array<String> = buildList {
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        add(Manifest.permission.ACCESS_COARSE_LOCATION)
        add(Manifest.permission.CAMERA)
        add(Manifest.permission.RECORD_AUDIO)
        add(Manifest.permission.CALL_PHONE)
        add(Manifest.permission.SEND_SMS)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }.toTypedArray()

    const val BACKGROUND_LOCATION = Manifest.permission.ACCESS_BACKGROUND_LOCATION

    data class PermissionStatus(
        val fineLocation: Boolean,
        val backgroundLocation: Boolean,
        val camera: Boolean,
        val microphone: Boolean,
        val callPhone: Boolean,
        val sms: Boolean,
        val notifications: Boolean
    ) {
        /** Foreground batch without background location — the minimum to start the daemon. */
        val hasForegroundEssentials: Boolean
            get() = fineLocation && camera && microphone && callPhone

        /** Full life-saving set. Background location is required for true unconscious-user tracking. */
        val hasAllLifeSaving: Boolean
            get() = hasForegroundEssentials && backgroundLocation && sms

        fun missingLabels(): List<String> = buildList {
            if (!fineLocation) add("Precise Location")
            if (!backgroundLocation) add("Background Location (Always Allow)")
            if (!camera) add("Camera")
            if (!microphone) add("Microphone")
            if (!callPhone) add("Direct Calling")
            if (!sms) add("Emergency SMS")
            if (!notifications) add("Notifications")
        }
    }

    fun checkStatus(context: Context): PermissionStatus {
        fun granted(perm: String): Boolean =
            ContextCompat.checkSelfPermission(context, perm) == PackageManager.PERMISSION_GRANTED

        val notificationsGranted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            granted(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            true // granted by default pre-33
        }
        val backgroundGranted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            granted(BACKGROUND_LOCATION)
        } else {
            true // no separate background permission pre-Q
        }
        return PermissionStatus(
            fineLocation = granted(Manifest.permission.ACCESS_FINE_LOCATION),
            backgroundLocation = backgroundGranted,
            camera = granted(Manifest.permission.CAMERA),
            microphone = granted(Manifest.permission.RECORD_AUDIO),
            callPhone = granted(Manifest.permission.CALL_PHONE),
            sms = granted(Manifest.permission.SEND_SMS),
            notifications = notificationsGranted
        )
    }

    fun hasAllLifeSaving(context: Context): Boolean = checkStatus(context).hasAllLifeSaving

    fun hasForegroundEssentials(context: Context): Boolean =
        checkStatus(context).hasForegroundEssentials

    /**
     * Requests the entire foreground batch at once. Must be called from onboarding's
     * "Enable Life-Saving Protection" button so the user grants everything in one flow.
     * Background location is requested separately afterwards (OS requirement on Q+).
     */
    fun requestForegroundBatch(activity: Activity) {
        val missing = FOREGROUND_BATCH.filter {
            ContextCompat.checkSelfPermission(activity, it) != PackageManager.PERMISSION_GRANTED
        }.toTypedArray()
        if (missing.isEmpty()) return
        ActivityCompat.requestPermissions(activity, missing, REQUEST_CODE_CRISIS_ALL)
    }

    /**
     * Background location MUST be requested separately after foreground location is granted
     * (enforced by Android 10+). On Android 11+ the OS forces a Settings redirect —
     * this helper handles both paths.
     *
     * @return true if a direct runtime request was launched, false if Settings redirect is needed.
     */
    fun requestBackgroundLocation(activity: Activity): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
        if (ContextCompat.checkSelfPermission(
                activity, BACKGROUND_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        ) return false
        // On R+ (11+), requestPermissions for background location shows no dialog;
        // the user must pick "Allow all the time" in Settings. We still attempt the
        // runtime request first (works on Q), caller falls back to settings screen.
        return try {
            ActivityCompat.requestPermissions(
                activity, arrayOf(BACKGROUND_LOCATION), REQUEST_CODE_CRISIS_ALL + 1
            )
            true
        } catch (_: Exception) {
            false
        }
    }

    /** Deep-link to app Settings so the user can pick "Allow all the time" + "Allow" toggles. */
    fun openAppSettings(activity: Activity) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", activity.packageName, null)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            activity.startActivity(intent)
        } catch (_: Exception) {
            val fallback = Intent(Settings.ACTION_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            activity.startActivity(fallback)
        }
    }

    fun openAppSettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        } catch (_: Exception) { /* best effort */
        }
    }

    /**
     * Launch-time gate used by MainActivity.onCreate/onResume.
     * Returns the missing life-saving labels so the UI can force onboarding.
     */
    fun missingOnLaunch(context: Context): List<String> = checkStatus(context).missingLabels()
}
