package com.example.crisis.ui

import android.app.Activity
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.SafetyCheck
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.example.crisis.permissions.CrisisPermissionsManager
import com.example.crisis.service.CrisisForegroundService
import com.example.crisis.store.CrisisSettingsStore
import kotlinx.coroutines.launch

/**
 * Phase 1 — First-launch Onboarding.
 *
 * Forces the full life-saving setup BEFORE any crisis can happen:
 *  1. Why these permissions save lives (no touch possible during a crash).
 *  2. Grant ALL permissions at once (location + background, camera, mic, call, SMS).
 *  3. Save the primary emergency contact number to local storage.
 *  4. Boot the low-power background listener daemon.
 *
 * This screen blocks progress until essentials are granted — the user may be
 * unconscious during a real event and cannot press "Allow" then.
 */
@Composable
fun CrisisOnboardingScreen(
    onOnboardingComplete: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val activity = context as? Activity
    val scope = rememberCoroutineScope()
    val store = remember(context) { CrisisSettingsStore.get(context) }

    var step by remember { mutableIntStateOf(0) }
    var permRefreshTick by remember { mutableIntStateOf(0) }
    var contactName by remember { mutableStateOf("") }
    var contactPhone by remember { mutableStateOf("") }
    var phoneError by remember { mutableStateOf<String?>(null) }
    var isSaving by remember { mutableStateOf(false) }

    @Suppress("UNUSED_EXPRESSION")
    permRefreshTick.let { }

    val status = remember(permRefreshTick) { CrisisPermissionsManager.checkStatus(context) }

    val foregroundLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ -> permRefreshTick++ }

    val backgroundLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ -> permRefreshTick++ }

    fun launchForegroundBatch() {
        val missing = CrisisPermissionsManager.FOREGROUND_BATCH.filter {
            ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
        }.toTypedArray()
        if (missing.isEmpty()) {
            permRefreshTick++
            return
        }
        try {
            foregroundLauncher.launch(missing)
        } catch (_: Exception) {
            activity?.let { CrisisPermissionsManager.requestForegroundBatch(it) }
        }
    }

    fun launchBackgroundRequest() {
        try {
            backgroundLauncher.launch(arrayOf(CrisisPermissionsManager.BACKGROUND_LOCATION))
        } catch (_: Exception) {
            activity?.let { CrisisPermissionsManager.requestBackgroundLocation(it) }
        }
    }

    // Re-check when returning from Settings.
    LaunchedEffect(step) { permRefreshTick++ }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF050B16), Color(0xFF0A1424), Color(0xFF040711))
                )
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Brand + progress
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFFF1744).copy(alpha = 0.15f))
                        .border(1.dp, Color(0xFFFF1744), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.Shield, null, tint = Color(0xFFFF1744))
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        "EMERGENCY SHIELD SETUP",
                        color = Color(0xFFFF5252),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 1.5.sp
                    )
                    Text(
                        "Zero-touch protection in ${3 - step} steps",
                        color = Color.Gray,
                        fontSize = 12.sp
                    )
                }
                Text(
                    "${step + 1}/4",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                )
            }

            Spacer(Modifier.height(12.dp))
            LinearProgressIndicator(
                progress = { (step + 1) / 4f },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(CircleShape),
                color = Color(0xFFFF1744),
                trackColor = Color(0x22FFFFFF)
            )

            Spacer(Modifier.height(20.dp))

            AnimatedContent(
                targetState = step,
                transitionSpec = { fadeIn() togetherWith fadeOut() },
                label = "onboarding-step"
            ) { current ->
                when (current) {
                    0 -> WhyItMattersCard(onContinue = { step = 1 })
                    1 -> PermissionsCard(
                        status = status,
                        onGrantAll = ::launchForegroundBatch,
                        onGrantBackground = ::launchBackgroundRequest,
                        onOpenSettings = {
                            activity?.let { CrisisPermissionsManager.openAppSettings(it) }
                                ?: CrisisPermissionsManager.openAppSettings(context)
                        },
                        onContinue = { step = 2 },
                        onBack = { step = 0 }
                    )
                    2 -> EmergencyNumberCard(
                        name = contactName,
                        phone = contactPhone,
                        error = phoneError,
                        isSaving = isSaving,
                        onNameChange = { contactName = it },
                        onPhoneChange = { contactPhone = it; phoneError = null },
                        onBack = { step = 1 },
                        onSave = {
                            val cleanPhone = contactPhone.trim()
                            if (!store.isValidPhone(cleanPhone)) {
                                phoneError = "Enter a valid number (e.g. +15559113829 or 911)."
                                return@EmergencyNumberCard
                            }
                            isSaving = true
                            scope.launch {
                                try {
                                    store.saveEmergencyContact(
                                        contactName.trim().ifBlank { "Primary Emergency Contact" },
                                        cleanPhone
                                    )
                                    step = 3
                                } finally {
                                    isSaving = false
                                }
                            }
                        }
                    )
                    else -> ActivationCard(
                        contactPhone = contactPhone.trim(),
                        onActivate = {
                            scope.launch {
                                store.setOnboardingCompleted(true)
                                store.setDaemonEnabled(true)
                                // Boot the low-power background listener daemon immediately.
                                CrisisForegroundService.startService(
                                    context,
                                    CrisisForegroundService.ACTION_START_MONITORING
                                )
                                onOnboardingComplete()
                            }
                        },
                        onBack = { step = 2 }
                    )
                }
            }

            Spacer(Modifier.height(16.dp))
            Text(
                "No touch is possible during a real crash — that is why " +
                    "everything above must be granted now, while you are safe.",
                color = Color.Gray,
                fontSize = 11.sp,
                textAlign = TextAlign.Center,
                lineHeight = 16.sp
            )
        }
    }
}

@Composable
private fun WhyItMattersCard(onContinue: () -> Unit) {
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xCC0C1424)),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Color(0x44FF1744), RoundedCornerShape(24.dp))
    ) {
        Column(
            Modifier.padding(22.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(CircleShape)
                    .background(Color(0xFFFF1744).copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.SafetyCheck,
                    null,
                    tint = Color(0xFFFF1744),
                    modifier = Modifier.size(36.dp)
                )
            }
            Spacer(Modifier.height(14.dp))
            Text(
                "YOU MAY BE UNCONSCIOUS WHEN IT MATTERS",
                color = Color(0xFFFF5252),
                fontWeight = FontWeight.Black,
                fontSize = 13.sp,
                letterSpacing = 1.sp,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Crash Shield",
                color = Color.White,
                fontWeight = FontWeight.Black,
                fontSize = 26.sp
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "If you crash, fall, or scream for help, this app detects it, " +
                    "verifies it with on-device AI cameras, calls your emergency " +
                    "contact with zero taps, and streams your live satellite location.\n\n" +
                    "It can only do that if every permission below is granted NOW.",
                color = Color.LightGray,
                fontSize = 13.sp,
                lineHeight = 20.sp,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(18.dp))
            Button(
                onClick = onContinue,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF1744)),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
            ) {
                Text("START LIFE-SAVING SETUP", fontWeight = FontWeight.Black)
            }
        }
    }
}

private data class PermRow(
    val icon: ImageVector,
    val title: String,
    val why: String,
    val granted: Boolean
)

@Composable
private fun PermissionsCard(
    status: CrisisPermissionsManager.PermissionStatus,
    onGrantAll: () -> Unit,
    onGrantBackground: () -> Unit,
    onOpenSettings: () -> Unit,
    onContinue: () -> Unit,
    onBack: () -> Unit
) {
    val rows = listOf(
        PermRow(
            Icons.Default.LocationOn, "Precise Location",
            "Exact GPS for satellite rescue map", status.fineLocation
        ),
        PermRow(
            Icons.Default.LocationOn, "Background Location — Always Allow",
            "Tracks you with screen off / app closed", status.backgroundLocation
        ),
        PermRow(
            Icons.Default.CameraAlt, "Camera",
            "Silent crash & fire verification", status.camera
        ),
        PermRow(
            Icons.Default.Mic, "Microphone",
            "Scream & impact acoustic detection", status.microphone
        ),
        PermRow(
            Icons.Default.Call, "Direct Calling",
            "Zero-touch auto-dial, no dialer screen", status.callPhone
        ),
        PermRow(
            Icons.Default.Sms, "Emergency SMS",
            "Auto SOS text with tracking link", status.sms
        ),
        PermRow(
            Icons.Default.Notifications, "Notifications",
            "Keeps the shield service alive", status.notifications
        )
    )
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xCC0C1424)),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Color(0x4400E5FF), RoundedCornerShape(24.dp))
    ) {
        Column(Modifier.padding(20.dp)) {
            Text(
                "GRANT ALL LIFE-SAVING PERMISSIONS",
                color = Color(0xFF00E5FF),
                fontWeight = FontWeight.Black,
                fontSize = 13.sp,
                letterSpacing = 1.sp
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "Tap once — Android will ask for each. Choose “Allow” / “While using” " +
                    "for everything, then “Always Allow” for location on the next prompt.",
                color = Color.LightGray,
                fontSize = 12.sp,
                lineHeight = 18.sp
            )
            Spacer(Modifier.height(14.dp))
            rows.forEach { row ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(
                                if (row.granted) Color(0xFF00E676).copy(alpha = 0.15f)
                                else Color.White.copy(alpha = 0.06f)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            row.icon, null,
                            tint = if (row.granted) Color(0xFF00E676) else Color.LightGray,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(row.title, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Text(row.why, color = Color.Gray, fontSize = 11.sp)
                    }
                    FilterChip(
                        selected = row.granted,
                        onClick = {},
                        label = {
                            Text(
                                if (row.granted) "ON" else "OFF",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Black
                            )
                        },
                        leadingIcon = if (row.granted) {
                            { Icon(Icons.Default.CheckCircle, null, Modifier.size(14.dp)) }
                        } else null,
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = Color(0xFF00E676).copy(alpha = 0.2f),
                            selectedLabelColor = Color(0xFF00E676)
                        )
                    )
                }
            }

            Spacer(Modifier.height(12.dp))
            Button(
                onClick = onGrantAll,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00E5FF)),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
            ) {
                Text("ENABLE ALL PROTECTION (1 TAP)", color = Color.Black, fontWeight = FontWeight.Black)
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = onGrantBackground,
                    modifier = Modifier
                        .weight(1f)
                        .height(46.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("ALLOW ALWAYS", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
                OutlinedButton(
                    onClick = onOpenSettings,
                    modifier = Modifier
                        .weight(1f)
                        .height(46.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("OPEN SETTINGS", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
            if (!status.backgroundLocation) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "If Android skips the background prompt: Open Settings → Location → " +
                        "“Allow all the time”. Without this, tracking stops when the screen is off.",
                    color = Color(0xFFFFD600),
                    fontSize = 11.sp,
                    lineHeight = 16.sp
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = onBack) { Text("Back", color = Color.Gray) }
                Button(
                    onClick = onContinue,
                    enabled = status.hasForegroundEssentials,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFFF1744),
                        disabledContainerColor = Color.Gray.copy(alpha = 0.3f)
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        if (status.hasForegroundEssentials) "CONTINUE →" else "GRANT ABOVE TO CONTINUE",
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp
                    )
                }
            }
            if (!status.hasForegroundEssentials) {
                Text(
                    "Missing: ${status.missingLabels().joinToString(", ")}",
                    color = Color(0xFFFF5252),
                    fontSize = 11.sp,
                    modifier = Modifier.padding(top = 6.dp)
                )
            }
        }
    }
}

@Composable
private fun EmergencyNumberCard(
    name: String,
    phone: String,
    error: String?,
    isSaving: Boolean,
    onNameChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onBack: () -> Unit,
    onSave: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xCC0C1424)),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Color(0x44FFD600), RoundedCornerShape(24.dp))
    ) {
        Column(Modifier.padding(20.dp)) {
            Text(
                "WHO SHOULD WE CALL AUTOMATICALLY?",
                color = Color(0xFFFFD600),
                fontWeight = FontWeight.Black,
                fontSize = 13.sp,
                letterSpacing = 1.sp
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "During a verified crash this number is dialled instantly with " +
                    "speakerphone ON — no dialer screen, no confirmation tap. " +
                    "Stored only on this device.",
                color = Color.LightGray,
                fontSize = 12.sp,
                lineHeight = 18.sp
            )
            Spacer(Modifier.height(14.dp))
            OutlinedTextField(
                value = name,
                onValueChange = onNameChange,
                label = { Text("Contact name (e.g. Sarah — Wife)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color(0xFF00E5FF),
                    unfocusedBorderColor = Color.Gray.copy(alpha = 0.4f),
                    focusedLabelColor = Color(0xFF00E5FF),
                    cursorColor = Color(0xFF00E5FF),
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White
                )
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = phone,
                onValueChange = onPhoneChange,
                label = { Text("Emergency phone (e.g. +15559113829)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                isError = error != null,
                supportingText = error?.let { { Text(it, color = Color(0xFFFF5252)) } },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color(0xFF00E5FF),
                    unfocusedBorderColor = Color.Gray.copy(alpha = 0.4f),
                    focusedLabelColor = Color(0xFF00E5FF),
                    cursorColor = Color(0xFF00E5FF),
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    errorBorderColor = Color(0xFFFF1744)
                )
            )
            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = onBack) { Text("Back", color = Color.Gray) }
                Button(
                    onClick = onSave,
                    enabled = !isSaving && phone.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF1744)),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.height(48.dp)
                ) {
                    Text(
                        if (isSaving) "SAVING…" else "SAVE & CONTINUE →",
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun ActivationCard(
    contactPhone: String,
    onActivate: () -> Unit,
    onBack: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xCC0C1424)),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Color(0x4400E676), RoundedCornerShape(24.dp))
    ) {
        Column(
            Modifier.padding(22.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                Icons.Default.CheckCircle,
                null,
                tint = Color(0xFF00E676),
                modifier = Modifier.size(56.dp)
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "READY TO GUARD YOU 24/7",
                color = Color(0xFF00E676),
                fontWeight = FontWeight.Black,
                fontSize = 13.sp,
                letterSpacing = 1.sp
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Crash Shield will now run as a low-power background shield: " +
                    "accelerometer + microphone always listening, cameras on hot standby, " +
                    "GPS locked.",
                color = Color.LightGray,
                fontSize = 13.sp,
                lineHeight = 20.sp,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "Auto-call → ${contactPhone.ifBlank { "your emergency contact" }} (speakerphone ON)\n" +
                    "+ live satellite SMS + server tracking link",
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                lineHeight = 18.sp
            )
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = onActivate,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00E676)),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
            ) {
                Text("ACTIVATE EMERGENCY SHIELD", color = Color.Black, fontWeight = FontWeight.Black)
            }
            Spacer(Modifier.height(6.dp))
            TextButton(onClick = onBack) { Text("Back", color = Color.Gray) }
        }
    }
}
