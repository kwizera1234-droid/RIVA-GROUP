package com.example.crisis.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.example.crisis.service.CrisisForegroundService

/**
 * Phase 1 — Initialization daemon autostart.
 *
 * Restarts the low-power background listener daemon after:
 *  - Device reboot (BOOT_COMPLETED / LOCKED_BOOT_COMPLETED)
 *  - App update (MY_PACKAGE_REPLACED)
 *  - System kills the service (service itself re-arms via START_STICKY, this is the
 *    second line of defence)
 *
 * The receiver performs NO UI and requests NO permissions — it only resumes monitoring
 * if the user already completed onboarding (daemon enabled + onboarding flag set).
 * This guarantees the shield is back up even if the user never re-opens the app.
 */
class CrisisBootReceiver : BroadcastReceiver() {

    private val tag = "CrisisBootReceiver"

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        Log.i(tag, "Boot/event received: $action")

        val allowed = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_PACKAGE_REPLACED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON"
        )
        if (action !in allowed) return

        try {
            val prefs = context.getSharedPreferences(
                "crisis_emergency_prefs", Context.MODE_PRIVATE
            )
            val onboardingDone = prefs.getBoolean("crisis_onboarding_completed", false)
            val daemonEnabled = prefs.getBoolean("crisis_daemon_enabled", true)

            if (!onboardingDone) {
                Log.i(tag, "Onboarding not completed — daemon autostart skipped.")
                return
            }
            if (!daemonEnabled) {
                Log.i(tag, "Daemon disabled by user — autostart skipped.")
                return
            }

            // Direct-boot aware: only start foreground service after user unlock on
            // LOCKED_BOOT_COMPLETED devices that need credential-encrypted storage.
            if (action == Intent.ACTION_LOCKED_BOOT_COMPLETED &&
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
            ) {
                Log.i(tag, "Locked boot — deferring start until unlock.")
                return
            }

            CrisisForegroundService.startService(
                context, CrisisForegroundService.ACTION_START_MONITORING
            )
            Log.i(tag, "Crisis listener daemon restarted after $action")
        } catch (e: Exception) {
            Log.w(tag, "Autostart failed: ${e.message}")
        }
    }
}
