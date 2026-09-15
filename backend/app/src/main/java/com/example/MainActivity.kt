package com.example

import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import com.example.crisis.permissions.CrisisPermissionsManager
import com.example.crisis.service.CrisisForegroundService
import com.example.crisis.store.CrisisSettingsStore
import com.example.crisis.ui.CrisisOnboardingScreen
import com.example.ui.SoberWatchApp
import com.example.ui.theme.MyApplicationTheme
import kotlinx.coroutines.launch

/**
 * Launch gate for the zero-touch guarantee.
 *
 * - On EVERY launch (onCreate + onResume) checks [CrisisPermissionsManager] status.
 * - If onboarding was never completed OR life-saving foreground permissions are
 *   missing, forces [CrisisOnboardingScreen] (blocks the rest of the app until the
 *   user grants everything — they cannot grant anything while unconscious later).
 * - Once configured, boots the low-power [CrisisForegroundService] daemon immediately
 *   so background detection is active before the user taps anything else.
 */
class MainActivity : ComponentActivity() {

    private val tag = "MainActivityGate"
    private var showCrisisOnboarding by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // Lock-screen bypass: if the user opens the app (e.g. via the crisis
        // notification) while the phone is locked/black, the shield UI shows
        // immediately and can turn the screen on — no swipe/pin delay. NOTE:
        // window flags can only live on an Activity; the background camera +
        // sensor pipeline itself runs in CrisisForegroundService and needs no
        // activity at all (partial wake lock + FGS camera type cover it).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        evaluateLaunchGate()

        setContent {
            MyApplicationTheme {
                if (showCrisisOnboarding) {
                    CrisisOnboardingScreen(
                        onOnboardingComplete = {
                            showCrisisOnboarding = false
                            bootDaemonIfReady()
                        },
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    SoberWatchApp()
                }

                // Re-evaluate if permissions change while composed (e.g. Settings return).
                LaunchedEffect(Unit) {
                    // one-shot; onResume covers subsequent returns
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // User may return from system Settings — re-check without requiring a restart.
        evaluateLaunchGate()
        bootDaemonIfReady()
    }

    @Deprecated("Legacy permission callback still used for background-location split request")
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        Log.i(tag, "Permission result $requestCode: " +
            permissions.zip(grantResults.toList()).joinToString {
                "${it.first.substringAfterLast('.')}=${it.second == PackageManager.PERMISSION_GRANTED}"
            })
        evaluateLaunchGate()
        bootDaemonIfReady()
    }

    /**
     * Decides whether the blocking crisis onboarding must be shown.
     * Rule: onboarding flag missing OR any foreground essential missing → block.
     * Background-location-only gaps do NOT block (user can fix in Settings later),
     * but the banner inside onboarding/settings keeps pushing "Always Allow".
     */
    private fun evaluateLaunchGate() {
        lifecycleScope.launch {
            val store = CrisisSettingsStore.get(applicationContext)
            val onboardingDone = try {
                store.isOnboardingCompletedSync()
            } catch (_: Exception) {
                false
            }
            val status = CrisisPermissionsManager.checkStatus(applicationContext)
            val mustOnboard = !onboardingDone || !status.hasForegroundEssentials
            if (mustOnboard != showCrisisOnboarding) {
                Log.i(
                    tag, "Launch gate: onboardingDone=$onboardingDone " +
                        "essentials=${status.hasForegroundEssentials} " +
                        "missing=${status.missingLabels()} → showOnboarding=$mustOnboard"
                )
                showCrisisOnboarding = mustOnboard
            } else if (mustOnboard) {
                Log.i(tag, "Launch gate: still awaiting ${status.missingLabels()}")
            }
        }
    }

    /**
     * Boots the background listener daemon as soon as it is legal to do so:
     * onboarding done (or at least foreground essentials granted) + daemon enabled.
     * Called from onCreate, onResume, permission callbacks and onboarding completion.
     */
    private fun bootDaemonIfReady() {
        lifecycleScope.launch {
            try {
                val store = CrisisSettingsStore.get(applicationContext)
                val daemonOn = try {
                    store.isDaemonEnabledSync()
                } catch (_: Exception) {
                    true
                }
                if (!daemonOn) {
                    Log.i(tag, "Daemon disabled — boot skipped.")
                    return@launch
                }
                if (!CrisisPermissionsManager.hasForegroundEssentials(applicationContext)) {
                    Log.i(tag, "Foreground essentials missing — daemon boot deferred until granted.")
                    return@launch
                }
                CrisisForegroundService.startService(
                    applicationContext,
                    CrisisForegroundService.ACTION_START_MONITORING
                )
                Log.i(tag, "Background listener daemon booted on launch.")
            } catch (e: Exception) {
                Log.w(tag, "Daemon boot failed: ${e.message}")
            }
        }
    }
}
