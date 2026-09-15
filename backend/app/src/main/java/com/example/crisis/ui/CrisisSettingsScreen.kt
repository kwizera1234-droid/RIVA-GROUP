package com.example.crisis.ui

import android.app.Activity
import android.widget.Toast
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
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.crisis.models.CrisisSettings
import com.example.crisis.permissions.CrisisPermissionsManager
import com.example.crisis.service.CrisisForegroundService
import com.example.crisis.store.CrisisSettingsStore
import kotlinx.coroutines.launch

/**
 * Phase 1 — Attractive Settings interface.
 *
 * The user inputs and saves the primary emergency contact number to local storage
 * (CrisisSettingsStore → SharedPreferences + DataStore) plus every zero-touch toggle:
 * auto-detection, vision verification, zero-touch dialing, speakerphone, SMS fallback,
 * sensitivities and countdown. Changes apply instantly to the background daemon —
 * no restart, no touch needed during a crisis.
 */
@Composable
fun CrisisSettingsScreen(
    onNavigateBack: () -> Unit = {},
    onOpenShield: () -> Unit = {}
) {
    val context = LocalContext.current
    val activity = context as? Activity
    val scope = rememberCoroutineScope()
    val store = remember(context) { CrisisSettingsStore.get(context) }

    val settings by store.settingsFlow.collectAsState(initial = CrisisSettings())
    var permTick by remember { mutableStateOf(0) }
    @Suppress("UNUSED_EXPRESSION")
    permTick.let { }
    val permStatus = remember(permTick) { CrisisPermissionsManager.checkStatus(context) }

    var nameDraft by remember(settings.primaryContactName) {
        mutableStateOf(settings.primaryContactName)
    }
    var phoneDraft by remember(settings.primaryContactPhone) {
        mutableStateOf(settings.primaryContactPhone)
    }
    var phoneError by remember { mutableStateOf<String?>(null) }
    var isSaving by remember { mutableStateOf(false) }

    fun persist(transform: (CrisisSettings) -> CrisisSettings) {
        scope.launch { store.saveFullSettings(transform(settings)) }
    }

    fun saveContact() {
        if (!store.isValidPhone(phoneDraft.trim())) {
            phoneError = "Enter a valid number (e.g. +15559113829 or 911)."
            return
        }
        phoneError = null
        isSaving = true
        scope.launch {
            try {
                val updated = settings.copy(
                    primaryContactName = nameDraft.trim().ifBlank { "Primary Emergency Contact" },
                    primaryContactPhone = phoneDraft.trim()
                )
                store.saveFullSettings(updated)
                Toast.makeText(context, "Emergency contact saved — shield updated", Toast.LENGTH_SHORT).show()
            } finally {
                isSaving = false
            }
        }
    }

    Box(
        modifier = Modifier
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
                .padding(horizontal = 18.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Header
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                IconButton(onClick = onNavigateBack) {
                    Icon(Icons.Default.ArrowBack, null, tint = Color.White)
                }
                Spacer(Modifier.width(6.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        "CRISIS SHIELD SETTINGS",
                        color = Color(0xFFFF5252),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 1.5.sp
                    )
                    Text(
                        "Emergency number & zero-touch automation",
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                IconButton(onClick = onOpenShield) {
                    Icon(Icons.Default.Shield, null, tint = Color(0xFF00E5FF))
                }
            }

            // Permission health banner
            if (!permStatus.hasAllLifeSaving) {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFF1744).copy(alpha = 0.12f)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, Color(0xFFFF1744).copy(alpha = 0.5f), RoundedCornerShape(16.dp))
                ) {
                    Row(
                        Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Warning, null, tint = Color(0xFFFF5252))
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                "Protection degraded",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp
                            )
                            Text(
                                "Missing: ${permStatus.missingLabels().joinToString(", ")}",
                                color = Color.LightGray,
                                fontSize = 11.sp
                            )
                        }
                        OutlinedButton(
                            onClick = {
                                activity?.let { CrisisPermissionsManager.openAppSettings(it) }
                                permTick++
                            },
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text("FIX", fontSize = 11.sp, fontWeight = FontWeight.Black)
                        }
                    }
                }
            } else {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF00E676).copy(alpha = 0.1f)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, Color(0xFF00E676).copy(alpha = 0.4f), RoundedCornerShape(16.dp))
                ) {
                    Row(
                        Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.CheckCircle, null, tint = Color(0xFF00E676))
                        Spacer(Modifier.width(10.dp))
                        Text(
                            "All life-saving permissions active — shield is fully armed.",
                            color = Color(0xFF00E676),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Primary contact card
            GlassSection(title = "PRIMARY EMERGENCY CONTACT", accent = Color(0xFFFFD600)) {
                OutlinedTextField(
                    value = nameDraft,
                    onValueChange = { nameDraft = it },
                    label = { Text("Contact name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = crisisFieldColors()
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = phoneDraft,
                    onValueChange = { phoneDraft = it; phoneError = null },
                    label = { Text("Phone number (auto-dialled, no tap)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    isError = phoneError != null,
                    supportingText = phoneError?.let { { Text(it, color = Color(0xFFFF5252)) } },
                    colors = crisisFieldColors()
                )
                Spacer(Modifier.height(10.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = ::saveContact,
                        enabled = !isSaving,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFFD600)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                    ) {
                        Icon(Icons.Default.Save, null, tint = Color.Black, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(
                            if (isSaving) "SAVING…" else "SAVE NUMBER",
                            color = Color.Black,
                            fontWeight = FontWeight.Black,
                            fontSize = 12.sp
                        )
                    }
                    OutlinedButton(
                        onClick = {
                            phoneDraft = settings.emergencyServicesNumber.ifBlank { "911" }
                            nameDraft = "National Emergency Dispatch (911)"
                        },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.height(48.dp)
                    ) {
                        Text("USE 911", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "Stored on-device (SharedPreferences + DataStore). Read synchronously by the " +
                        "foreground service during a crash — never fetched from the network.",
                    color = Color.Gray,
                    fontSize = 11.sp,
                    lineHeight = 16.sp
                )
            }

            // Automation toggles
            GlassSection(title = "ZERO-TOUCH AUTOMATION", accent = Color(0xFF00E5FF)) {
                CrisisToggle(
                    title = "Background listener daemon",
                    subtitle = "Accelerometer + mic always on (low power)",
                    checked = settings.autoDetectionEnabled,
                    onChange = { persist { it.copy(autoDetectionEnabled = $0) } }
                )
                CrisisToggle(
                    title = "AI vision verification",
                    subtitle = "Fire / crash / body pose check before dialling",
                    checked = settings.aiVisionVerificationEnabled,
                    onChange = { persist { it.copy(aiVisionVerificationEnabled = $0) } }
                )
                CrisisToggle(
                    title = "Zero-touch auto-dial",
                    subtitle = "Call ${settings.primaryContactPhone} with no prompt",
                    checked = settings.zeroTouchDialingEnabled,
                    onChange = { persist { it.copy(zeroTouchDialingEnabled = $0) } }
                )
                CrisisToggle(
                    title = "Auto speakerphone",
                    subtitle = "Hands-free so an unconscious victim is audible",
                    checked = settings.autoSpeakerphoneEnabled,
                    onChange = { persist { it.copy(autoSpeakerphoneEnabled = $0) } }
                )
                CrisisToggle(
                    title = "Auto SMS fallback",
                    subtitle = "SOS text with satellite map link",
                    checked = settings.autoSmsFallbackEnabled,
                    onChange = { persist { it.copy(autoSmsFallbackEnabled = $0) } }
                )
            }

            // Sensitivity tuning
            GlassSection(title = "DETECTION SENSITIVITY", accent = Color(0xFF7C4DFF)) {
                CrisisSlider(
                    label = "Crash threshold",
                    valueLabel = "${"%.1f".format(settings.crashSensitivityG)} G",
                    value = settings.crashSensitivityG,
                    range = 2.5f..6.0f,
                    onChange = { persist { it.copy(crashSensitivityG = $0) } }
                )
                CrisisSlider(
                    label = "Fall impact threshold",
                    valueLabel = "${"%.1f".format(settings.fallSensitivityG)} G",
                    value = settings.fallSensitivityG,
                    range = 1.5f..4.0f,
                    onChange = { persist { it.copy(fallSensitivityG = $0) } }
                )
                CrisisSlider(
                    label = "Scream loudness trigger",
                    valueLabel = "${settings.acousticThresholdDb.toInt()} dB",
                    value = settings.acousticThresholdDb,
                    range = 70f..100f,
                    onChange = { persist { it.copy(acousticThresholdDb = $0) } }
                )
                CrisisSlider(
                    label = "AI confidence required",
                    valueLabel = "${(settings.aiConfidenceThreshold * 100).toInt()}%",
                    value = settings.aiConfidenceThreshold,
                    range = 0.5f..0.95f,
                    onChange = { persist { it.copy(aiConfidenceThreshold = $0) } }
                )
                CrisisSlider(
                    label = "Countdown before auto-dial",
                    valueLabel = "${settings.preEscalationDelaySeconds}s",
                    value = settings.preEscalationDelaySeconds.toFloat(),
                    range = 0f..30f,
                    onChange = { persist { it.copy(preEscalationDelaySeconds = $0.toInt()) } }
                )
                Spacer(Modifier.height(4.dp))
                OutlinedTextField(
                    value = settings.secondaryContactPhone,
                    onValueChange = { persist { s -> s.copy(secondaryContactPhone = it) } },
                    label = { Text("Secondary contact (SMS backup)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = crisisFieldColors()
                )
            }

            // Daemon controls
            GlassSection(title = "SHIELD DAEMON", accent = Color(0xFF00E676)) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = {
                            scope.launch {
                                store.setDaemonEnabled(true)
                                CrisisForegroundService.startService(
                                    context,
                                    CrisisForegroundService.ACTION_START_MONITORING
                                )
                                Toast.makeText(context, "Shield daemon started", Toast.LENGTH_SHORT).show()
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00E676)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                    ) {
                        Icon(Icons.Default.Security, null, tint = Color.Black, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("START SHIELD", color = Color.Black, fontWeight = FontWeight.Black, fontSize = 12.sp)
                    }
                    OutlinedButton(
                        onClick = { onOpenShield() },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.height(48.dp)
                    ) {
                        Icon(Icons.Default.Call, null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("LIVE MAP", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun GlassSection(
    title: String,
    accent: Color,
    content: @Composable () -> Unit
) {
    Card(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xCC0C1424)),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, accent.copy(alpha = 0.35f), RoundedCornerShape(20.dp))
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(accent)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    title,
                    color = accent,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 1.2.sp
                )
            }
            Spacer(Modifier.height(12.dp))
            content()
        }
    }
}

@Composable
private fun CrisisToggle(
    title: String,
    subtitle: String,
    checked: Boolean,
    onChange: (Boolean) -> Unit
) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, color = Color.Gray, fontSize = 11.sp)
        }
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color(0xFF00E5FF),
                checkedTrackColor = Color(0xFF00E5FF).copy(alpha = 0.3f)
            )
        )
    }
}

@Composable
private fun CrisisSlider(
    label: String,
    valueLabel: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    onChange: (Float) -> Unit
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text(valueLabel, color = Color(0xFF00E5FF), fontSize = 12.sp, fontWeight = FontWeight.Black)
        }
        Slider(
            value = value,
            onValueChange = onChange,
            valueRange = range,
            colors = SliderDefaults.colors(
                thumbColor = Color(0xFF00E5FF),
                activeTrackColor = Color(0xFF00E5FF)
            )
        )
    }
}

@Composable
private fun crisisFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Color(0xFF00E5FF),
    unfocusedBorderColor = Color.Gray.copy(alpha = 0.4f),
    focusedLabelColor = Color(0xFF00E5FF),
    unfocusedLabelColor = Color.Gray,
    cursorColor = Color(0xFF00E5FF),
    focusedTextColor = Color.White,
    unfocusedTextColor = Color.White
)
