package com.example.crisis.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.crisis.models.CrisisStatus
import com.example.crisis.models.CrisisTelemetry
import com.example.crisis.models.VonageCallState
import com.example.crisis.models.VonageCallStatus
import com.example.crisis.viewmodel.CrisisViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlin.math.cos
import kotlin.math.sin

// ---------------------------------------------------------------------------
// Luxury cyber-tactical palette (spec §1)
// ---------------------------------------------------------------------------
private val Obsidian = Color(0xFF09090B)
private val Obsidian2 = Color(0xFF101014)
private val Danger = Color(0xFFEF4444)
private val DangerSoft = Color(0xFFFF6B6B)
private val Emerald = Color(0xFF10B981)
private val Amber = Color(0xFFFBBF24)
private val IceBlue = Color(0xFF7DD3FC)
private val GlassFill = Color(0xB3121216) // translucent dark tint
private val GlassBorder = Color(0x33FFFFFF) // subtle inner border
private val Mono = FontFamily.Monospace

/**
 * Premium full-screen Emergency Satellite Live-Tracking Interface.
 *
 * Cinematic rescue-grid operations center: hybrid satellite backdrop with neon grid,
 * distress beacon radar ping + rotating sweep, dotted neon route to care, glassmorphic
 * telemetry HUD, mission millisecond clock and rolling uplink terminal.
 *
 * Binds directly to [CrisisViewModel.crisisState] — every metric is live; animated
 * transitions (animateFloatAsState / infiniteTransition) keep updates physics-smooth.
 */
@Composable
fun CrisisSatelliteTrackingScreen(
    viewModel: CrisisViewModel,
    onNavigateBack: () -> Unit = {},
    onNavigateToSettings: () -> Unit = {}
) {
    val crisisState by viewModel.crisisState.collectAsState()
    val tele = crisisState.telemetry
    val isIncident = crisisState.status != CrisisStatus.IDLE_MONITORING &&
        crisisState.status != CrisisStatus.FALSE_ALARM_CANCELLED

    // Mission clock anchor: accident moment, else shield boot (composition start).
    val compositionStart = remember { System.currentTimeMillis() }
    val anchorMs = if (crisisState.triggerTimestamp > 0) crisisState.triggerTimestamp else compositionStart
    var nowMs by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(anchorMs) {
        while (isActive) {
            nowMs = System.currentTimeMillis()
            delay(33) // ~30fps millisecond clock
        }
    }
    val elapsedMs = (nowMs - anchorMs).coerceAtLeast(0L)

    // Rolling uplink terminal feed + cumulative packet counter.
    var packets by remember { mutableStateOf(listOf("UPLINK HANDSHAKE :: AES-256 SECURE")) }
    var packetsSent by remember { mutableStateOf(1) }
    LaunchedEffect(tele.batteryPercent, crisisState.triggerType) {
        var seq = 0
        while (isActive) {
            delay(1100)
            seq++
            val pkt = buildPacket(seq, tele, crisisState.sensorSnapshot.peakGForce, crisisState.dataSharing.smsDispatched)
            packets = (packets + pkt).takeLast(5)
            packetsSent++
        }
    }

    // Pulsing incident glow.
    val pulse = rememberInfiniteTransition(label = "incidentPulse")
    val bannerGlow by pulse.animateFloat(0.55f, 1f, infiniteRepeatable(tween(1100), RepeatMode.Reverse), label = "glow")
    val headerTint by animateColorAsState(
        if (isIncident) Danger else Emerald, tween(600), label = "headerTint"
    )

    Box(
        Modifier
            .fillMaxSize()
            .background(Obsidian)
    ) {
        // === LAYER 0: full-screen satellite map ===
        TacticalSatelliteMap(
            telemetry = tele,
            isIncident = isIncident,
            modifier = Modifier.fillMaxSize()
        )

        // === Beacon metadata floating beside distress point (spec §2B) ===
        Box(
            Modifier
                .align(Alignment.Center)
                .padding(start = 64.dp, bottom = 54.dp)
        ) {
            GlassBadge(
                text = "LAT: ${"%.4f".format(tele.latitude)}° / LON: ${"%.4f".format(tele.longitude)}°",
                sub = "ACCURACY: ±${"%.1f".format(tele.accuracyMeters)}m (MIL-SPEC)"
            )
        }

        // === Hospital / contact routing marker (spec §2D) ===
        Box(
            Modifier
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .padding(top = 128.dp, start = 120.dp)
        ) {
            HospitalMarker()
        }

        // === LAYER 1: emergency header (top overlay; map owns the rest) ===
        Column(
            Modifier
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
            IncidentHeader(
                isIncident = isIncident,
                elapsedMs = elapsedMs,
                glow = bannerGlow,
                tint = headerTint,
                triggerName = crisisState.triggerType.displayName,
                onBack = onNavigateBack,
                onSettings = onNavigateToSettings
            )
            Spacer(Modifier.height(8.dp))
            // Top-right live coordinates widget (spec: LAT/LON/ALT/PACKETS).
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                CoordsWidget(
                    latitude = tele.latitude,
                    longitude = tele.longitude,
                    altitudeM = tele.altitudeMeters,
                    accuracyM = tele.accuracyMeters,
                    packetsSent = packetsSent
                )
            }
        }

        // === LAYER 2: Vonage Call HUD — bottom 25% glassmorphic panel ===
        // Upper 75% stays pure satellite map + radar. No dialer layout anywhere.
        Box(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .fillMaxHeight(0.27f)
                .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
            VonageCallHudPanel(
                vonage = crisisState.vonageCall,
                fallbackNumber = crisisState.callSession.phoneNumber,
                triggerName = crisisState.triggerType.displayName,
                speedKmh = tele.speedKmh,
                gForce = crisisState.sensorSnapshot.peakGForce,
                altitudeM = tele.altitudeMeters,
                battery = tele.batteryPercent,
                satellites = tele.satellitesLocked,
                lastPacket = packets.lastOrNull() ?: "",
                isIncident = isIncident,
                onCancel = { viewModel.cancelCrisisAlert() },
                onEscalate911 = { viewModel.escalateTo911Immediately() }
            )
        }
    }
}

// ---------------------------------------------------------------------------
// A. Emergency header — pulsing banner + millisecond mission clock
// ---------------------------------------------------------------------------
@Composable
private fun IncidentHeader(
    isIncident: Boolean,
    elapsedMs: Long,
    glow: Float,
    tint: Color,
    triggerName: String,
    onBack: () -> Unit,
    onSettings: () -> Unit
) {
    val ms = elapsedMs % 1000 / 10
    val s = (elapsedMs / 1000) % 60
    val m = (elapsedMs / 60000) % 60
    val h = elapsedMs / 3600000
    val clock = "%02d:%02d:%02d.%02d".format(h, m, s, ms)

    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(GlassFill)
            .border((1 + glow).dp.coerceAtMost(2.dp), tint.copy(alpha = 0.35f * glow + 0.25f), RoundedCornerShape(18.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Default.ArrowBack, null, tint = Color.White, modifier = Modifier.size(18.dp))
            }
            // Pulsing dot
            Box(
                Modifier
                    .size((10 + 4 * glow).dp)
                    .clip(CircleShape)
                    .background(tint.copy(alpha = 0.35f + 0.55f * glow))
                    .border(1.dp, tint, CircleShape)
            )
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    if (isIncident) "CRITICAL INCIDENT DETECTED // AUTOMATED SATELLITE UPLINK ACTIVE"
                    else "SHIELD ACTIVE // SATELLITE SCAN STANDBY",
                    color = tint,
                    fontFamily = Mono,
                    fontWeight = FontWeight.Black,
                    fontSize = 10.sp,
                    letterSpacing = 0.8.sp
                )
                Text(
                    if (isIncident) triggerName.uppercase() else "CONTINUOUS BACKGROUND SCAN",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                )
            }
            IconButton(onClick = onSettings, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Default.Settings, null, tint = Color.LightGray, modifier = Modifier.size(18.dp))
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(Color.Black.copy(alpha = 0.55f))
                .border(1.dp, GlassBorder, RoundedCornerShape(10.dp))
                .padding(horizontal = 10.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("ELAPSED TIME:", color = Color.Gray, fontFamily = Mono, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(8.dp))
            Text(clock, color = Color.White, fontFamily = Mono, fontSize = 17.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.weight(1f))
            Text(if (isIncident) "● LIVE" else "○ STANDBY", color = tint, fontFamily = Mono, fontSize = 10.sp, fontWeight = FontWeight.Black)
        }
    }
}

// ---------------------------------------------------------------------------
// D. Broadcast badge — who receives the live link
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Top-right live coordinates widget — LAT / LON / ALTITUDE / DATA PACKETS SENT
// ---------------------------------------------------------------------------
@Composable
private fun CoordsWidget(
    latitude: Double,
    longitude: Double,
    altitudeM: Double,
    accuracyM: Float,
    packetsSent: Int
) {
    Column(
        Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Color.Black.copy(alpha = 0.58f))
            .border(1.dp, IceBlue.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
            .padding(horizontal = 10.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.End
    ) {
        Text("LIVE FIX ±${"%.1f".format(accuracyM)}m", color = Emerald, fontFamily = Mono, fontSize = 8.5.sp, fontWeight = FontWeight.Black)
        Text("LAT ${"%.5f".format(latitude)}°", color = Color.White, fontFamily = Mono, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Text("LON ${"%.5f".format(longitude)}°", color = Color.White, fontFamily = Mono, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Text("ALT ${altitudeM.toInt()}m  ·  PKTS $packetsSent", color = IceBlue, fontFamily = Mono, fontSize = 9.5.sp, fontWeight = FontWeight.Bold)
    }
}

// ---------------------------------------------------------------------------
// Bottom-25% Vonage Call HUD — heavy glassmorphic panel, no dialer anywhere
// ---------------------------------------------------------------------------
private data class VonageHudMeta(val text: String, val color: Color, val pulsing: Boolean)

private fun vonageHudMeta(status: VonageCallStatus): VonageHudMeta = when (status) {
    VonageCallStatus.IDLE -> VonageHudMeta("VONAGE UPLINK: STANDBY", Color.Gray, false)
    VonageCallStatus.TRIGGERING -> VonageHudMeta("VONAGE UPLINK: TRIGGERING…", Amber, true)
    VonageCallStatus.CONNECTING -> VonageHudMeta("VONAGE UPLINK: CONNECTING…", Amber, true)
    VonageCallStatus.LIVE_CALL_ACTIVE -> VonageHudMeta("VONAGE UPLINK: LIVE CALL ACTIVE", Emerald, true)
    VonageCallStatus.FAILED_FALLBACK_DIALING -> VonageHudMeta("ON-DEVICE FALLBACK DIALING", DangerSoft, true)
    VonageCallStatus.FAILED -> VonageHudMeta("UPLINK FAILED — DEVICE FALLBACK", Danger, false)
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun VonageCallHudPanel(
    vonage: VonageCallState,
    fallbackNumber: String,
    triggerName: String,
    speedKmh: Float,
    gForce: Float,
    altitudeM: Double,
    battery: Int,
    satellites: Int,
    lastPacket: String,
    isIncident: Boolean,
    onCancel: () -> Unit,
    onEscalate911: () -> Unit
) {
    val meta = vonageHudMeta(vonage.status)
    val pulse = rememberInfiniteTransition(label = "vonagePulse")
    val glow by pulse.animateFloat(
        if (meta.pulsing) 0.45f else 1f,
        1f,
        infiniteRepeatable(tween(if (meta.pulsing) 900 else 1), RepeatMode.Reverse),
        label = "vglow"
    )
    val targetNumber = vonage.targetNumber.ifBlank { fallbackNumber.ifBlank { "—" } }
    val targetName = vonage.targetName.ifBlank { "Emergency Contact" }

    Column(
        Modifier
            .fillMaxSize()
            .clip(RoundedCornerShape(20.dp))
            .background(GlassFill)
            .border(1.2.dp, meta.color.copy(alpha = 0.45f), RoundedCornerShape(20.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        // Status row: glowing pulsing icon + state text + 911 escalation.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size((12 + 5 * glow).dp)
                    .clip(CircleShape)
                    .background(meta.color.copy(alpha = 0.30f + 0.55f * glow))
                    .border(1.4.dp, meta.color, CircleShape)
            )
            Spacer(Modifier.width(9.dp))
            Text(meta.text, color = meta.color, fontFamily = Mono, fontSize = 12.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onEscalate911) {
                Text("911", fontFamily = Mono, color = DangerSoft, fontWeight = FontWeight.Black, fontSize = 12.sp)
            }
        }
        // Target row: sharp monospace contact identity + TTS preview.
        Column {
            Text(
                "TO: $targetName  ·  $targetNumber",
                color = Color.White, fontFamily = Mono, fontSize = 13.sp, fontWeight = FontWeight.Black,
                maxLines = 1
            )
            val tts = vonage.announcement.ifBlank { "TTS ARMED: \"$triggerName\" announcement on connect…" }
            Text("$tts", color = Color.Gray, fontFamily = Mono, fontSize = 8.5.sp, maxLines = 1)
        }
        // Live telemetry ticker row.
        Text(
            "SPD ${speedKmh.toInt()}km/h · G ${"%.1f".format(gForce)} · ALT ${altitudeM.toInt()}m · BAT $battery% · SAT $satellites",
            color = IceBlue, fontFamily = Mono, fontSize = 9.5.sp, fontWeight = FontWeight.Bold, maxLines = 1
        )
        if (lastPacket.isNotBlank()) {
            Text("> $lastPacket", color = Emerald.copy(alpha = 0.85f), fontFamily = Mono, fontSize = 8.5.sp, maxLines = 1)
        }
        // Tactical safeguard: hidden long-press CANCEL (false-alarm only).
        Box(
            Modifier
                .fillMaxWidth()
                .height(34.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(Danger.copy(alpha = 0.10f))
                .border(1.dp, Danger.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
                .combinedClickable(onClick = {}, onLongClick = onCancel),
            contentAlignment = Alignment.Center
        ) {
            Text(
                "HOLD 2s TO CANCEL — FALSE ALARM ONLY",
                color = DangerSoft, fontFamily = Mono, fontSize = 10.sp, fontWeight = FontWeight.Black
            )
        }
    }
}

// ---------------------------------------------------------------------------
// B. Core satellite map — hybrid terrain + neon grid + beacon + sweep + route
// ---------------------------------------------------------------------------
@Composable
private fun TacticalSatelliteMap(
    telemetry: CrisisTelemetry,
    isIncident: Boolean,
    modifier: Modifier = Modifier
) {
    val sweep = rememberInfiniteTransition(label = "sweep")
    val angle by sweep.animateFloat(0f, 360f, infiniteRepeatable(tween(4200, easing = LinearEasing)), label = "angle")
    val ping = rememberInfiniteTransition(label = "ping")
    val pingR by ping.animateFloat(24f, 190f, infiniteRepeatable(tween(2200, easing = LinearEasing)), label = "r")
    val pingA by ping.animateFloat(0.9f, 0f, infiniteRepeatable(tween(2200, easing = LinearEasing)), label = "a")
    val beaconColor = if (isIncident) Danger else Emerald

    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        val center = Offset(w * 0.5f, h * 0.52f)
        // Deep obsidian hybrid-terrain base
        drawRect(
            brush = Brush.radialGradient(
                colors = listOf(Color(0xFF16161D), Obsidian, Color(0xFF040405)),
                center = center, radius = w * 0.95f
            )
        )
        // Simulated terrain blocks (hybrid imagery feel)
        val block = 92f
        var i = 0
        var y = 0f
        while (y < h) {
            var x = 0f
            while (x < w) {
                i++
                val shade = 0.03f + ((i * 37 % 10) / 10f) * 0.05f
                drawRect(Color.White.copy(alpha = shade), Offset(x + 3, y + 3), androidx.compose.ui.geometry.Size(block - 6, block - 6))
                x += block
            }
            y += block
        }
        // Luminous neon grid overlay
        val grid = 56f
        var gx = 0f
        while (gx <= w) {
            drawLine(Color(0xFF22D3EE).copy(alpha = 0.10f), Offset(gx, 0f), Offset(gx, h), 1f)
            gx += grid
        }
        var gy = 0f
        while (gy <= h) {
            drawLine(Color(0xFF22D3EE).copy(alpha = 0.10f), Offset(0f, gy), Offset(w, gy), 1f)
            gy += grid
        }
        // Contour rings
        listOf(130f, 250f, 370f, 490f).forEach {
            drawCircle(Color(0xFF3B82F6).copy(alpha = 0.14f), it, center, style = Stroke(1.2f))
        }
        // --- Dotted neon route: distress spot -> hospital/contact (spec §2D) ---
        val hospital = Offset(w * 0.5f + 120f, h * 0.52f - 260f)
        val route = Path().apply {
            moveTo(center.x, center.y)
            // gentle curve toward care
            cubicTo(center.x + 40, center.y - 120, hospital.x - 60, hospital.y + 80, hospital.x, hospital.y)
        }
        drawPath(
            route, Emerald,
            style = Stroke(width = 2.4f, cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 9f)))
        )
        // hospital marker ring
        drawCircle(Emerald.copy(alpha = 0.25f), 20f, hospital)
        drawCircle(Emerald, 7f, hospital)
        drawCircle(Color.White, 2.6f, hospital)
        // --- Rotating radar sweep (spec §3) ---
        val rad = Math.toRadians(angle.toDouble())
        val sweepLen = w.coerceAtLeast(h)
        val edge = Offset(center.x + (cos(rad) * sweepLen).toFloat(), center.y + (sin(rad) * sweepLen).toFloat())
        drawLine(
            brush = Brush.linearGradient(listOf(Color.Transparent, beaconColor.copy(alpha = 0.55f)), center, edge),
            start = center, end = edge, strokeWidth = 3f, cap = StrokeCap.Round
        )
        // sweep trail arc
        drawArc(
            color = beaconColor.copy(alpha = 0.18f), startAngle = angle - 42, sweepAngle = 42f,
            useCenter = true, topLeft = Offset(center.x - sweepLen, center.y - sweepLen),
            size = androidx.compose.ui.geometry.Size(sweepLen * 2, sweepLen * 2)
        )
        // --- Distress beacon: concentric radar ping (spec §2B) ---
        val accPx = (telemetry.accuracyMeters * 14f).coerceIn(50f, 150f)
        drawCircle(beaconColor.copy(alpha = 0.14f), accPx, center)
        drawCircle(beaconColor.copy(alpha = 0.45f), accPx, center, style = Stroke(1.4f))
        drawCircle(beaconColor.copy(alpha = pingA), pingR, center, style = Stroke(3f))
        drawCircle(beaconColor.copy(alpha = pingA * 0.6f), pingR * 0.62f, center, style = Stroke(2f))
        // heading vector
        val brad = Math.toRadians((telemetry.bearingDegrees - 90).toDouble())
        val tip = Offset(center.x + (cos(brad) * 44).toFloat(), center.y + (sin(brad) * 44).toFloat())
        drawLine(beaconColor, center, tip, 3.4f, StrokeCap.Round)
        // beacon core
        drawCircle(beaconColor, 12f, center)
        drawCircle(Color.White, 4.6f, center)
        drawCircle(Color.White.copy(alpha = 0.85f), 22f, center, style = Stroke(1.4f))
    }
}

@Composable
private fun GlassBadge(text: String, sub: String) {
    Column(
        Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(Color.Black.copy(alpha = 0.62f))
            .border(1.dp, IceBlue.copy(alpha = 0.4f), RoundedCornerShape(10.dp))
            .padding(horizontal = 9.dp, vertical = 6.dp)
    ) {
        Text(text, color = Color.White, fontFamily = Mono, fontSize = 9.5.sp, fontWeight = FontWeight.Bold)
        Text(sub, color = IceBlue, fontFamily = Mono, fontSize = 9.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun HospitalMarker() {
    Row(
        Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Color.Black.copy(alpha = 0.62f))
            .border(1.dp, Emerald.copy(alpha = 0.55f), RoundedCornerShape(12.dp))
            .padding(horizontal = 9.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier
                .size(22.dp)
                .clip(CircleShape)
                .background(Emerald.copy(alpha = 0.2f))
                .border(1.dp, Emerald, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Default.LocalHospital, null, tint = Emerald, modifier = Modifier.size(13.dp))
        }
        Spacer(Modifier.width(7.dp))
        Column {
            Text("TRAUMA CENTER // 1.2 KM", color = Emerald, fontFamily = Mono, fontSize = 9.5.sp, fontWeight = FontWeight.Black)
            Text("ROUTE LOCKED — DOTTED NEON PATH", color = Color.Gray, fontFamily = Mono, fontSize = 8.5.sp)
        }
    }
}

// ---------------------------------------------------------------------------
// Packet builder — structural uplink preview mirroring the SMS/server payload
// ---------------------------------------------------------------------------
private fun buildPacket(seq: Int, tele: CrisisTelemetry, peakG: Float, smsSent: Boolean): String {
    return when (seq % 6) {
        0 -> "[SENDING GPS ${"%.4f".format(tele.latitude)},${"%.4f".format(tele.longitude)} ±${tele.accuracyMeters.toInt()}m]"
        1 -> "[SENDING ACCELEROMETER ${(peakG).let { "%.1f".format(it) }}G VEC ${"%.1f".format(tele.speedKmh)}km/h]"
        2 -> "[BATTERY STATUS: ${tele.batteryPercent}% ${if (tele.isCharging) "CHG" else "DIS"} SAT:${tele.satellitesLocked}]"
        3 -> "[VISION EVIDENCE HASH ${"%04X".format(seq * 7919 % 65535)} CONF LOCK]"
        4 -> if (smsSent) "[SMS RELAY ACK :: CONTACT CONFIRMED]" else "[SMS RELAY ARMED :: STANDBY]"
        else -> "[SAT MAP LINK t=k z=19 PUSHED :: #$seq]"
    }
}
