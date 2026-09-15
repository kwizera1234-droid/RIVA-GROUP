package com.example.crisis.ui

import android.graphics.Bitmap
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.crisis.models.*
import com.example.crisis.viewmodel.CrisisViewModel

@Composable
fun CrisisResponseScreen(
    viewModel: CrisisViewModel,
    onNavigateBack: () -> Unit = {},
    onNavigateToSettings: () -> Unit = {}
) {
    val crisisState by viewModel.crisisState.collectAsState()
    val latestBitmap by viewModel.cameraManager.latestFrameBitmap.collectAsState()
    var showSimulationSheet by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF040711))
    ) {
        // 1. Full-Screen High-Resolution Satellite Map Canvas
        SatelliteMapCanvas(
            telemetry = crisisState.telemetry,
            isCrisisActive = crisisState.status != CrisisStatus.IDLE_MONITORING &&
                    crisisState.status != CrisisStatus.FALSE_ALARM_CANCELLED,
            modifier = Modifier.fillMaxSize()
        )

        // 2. High-Tech Dark Glassmorphic HUD Overlays
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            // Top Navigation & Shield Status Bar
            CrisisTopHeaderBar(
                crisisState = crisisState,
                onBack = onNavigateBack,
                onOpenSettings = onNavigateToSettings,
                onToggleSimulations = { showSimulationSheet = !showSimulationSheet }
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Main Crisis Dynamic Content
            AnimatedVisibility(
                visible = crisisState.status == CrisisStatus.VERIFIED_ESCALATING ||
                        crisisState.status == CrisisStatus.POTENTIAL_CRISIS_DETECTED ||
                        crisisState.status == CrisisStatus.AI_VERIFYING,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically()
            ) {
                PreEscalationCountdownWidget(
                    crisisState = crisisState,
                    onCancel = { viewModel.cancelCrisisAlert() },
                    onEscalateNow = { viewModel.executeZeroTouchEmergencyProtocol() }
                )
            }

            // Active Emergency Dispatch & Telecom Call HUD
            AnimatedVisibility(
                visible = crisisState.status == CrisisStatus.EMERGENCY_DISPATCH_ACTIVE,
                enter = fadeIn() + slideInVertically(),
                exit = fadeOut() + slideOutVertically()
            ) {
                ActiveCallTelemetryHUD(
                    callSession = crisisState.callSession,
                    dataSharing = crisisState.dataSharing,
                    onToggleSpeaker = { viewModel.toggleSpeakerphone() },
                    onToggleMute = { viewModel.toggleMute() },
                    onEscalate911 = { viewModel.escalateTo911Immediately() },
                    onCancel = { viewModel.cancelCrisisAlert() }
                )
            }

            Spacer(modifier = Modifier.weight(1f))

            // Lower Telemetry & Satellite Data Sharing Bar
            LiveSatelliteTelemetryBar(
                telemetry = crisisState.telemetry,
                dataSharing = crisisState.dataSharing,
                visionEvidence = crisisState.visionEvidence
            )
        }

        // 3. Sleek Floating Live Camera Feed Window (Picture-in-Picture)
        if (crisisState.isCameraFeedActive || crisisState.status != CrisisStatus.IDLE_MONITORING) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 76.dp, end = 16.dp)
            ) {
                FloatingLiveCameraWidget(
                    bitmap = latestBitmap,
                    visionEvidence = crisisState.visionEvidence,
                    facing = crisisState.activeCameraFacing,
                    isTorchOn = crisisState.isTorchActive,
                    onSwitchCamera = { viewModel.switchCamera() },
                    onToggleTorch = { viewModel.toggleTorch() }
                )
            }
        }

        // 4. Quick Simulation Bottom Sheet for Testing
        if (showSimulationSheet) {
            SimulationControlModal(
                onDismiss = { showSimulationSheet = false },
                onSimulateCrash = {
                    showSimulationSheet = false
                    viewModel.simulateVehicleCrash()
                },
                onSimulateFall = {
                    showSimulationSheet = false
                    viewModel.simulateFallImpact()
                },
                onSimulateScream = {
                    showSimulationSheet = false
                    viewModel.simulateDistressScream()
                },
                onSimulateFire = {
                    showSimulationSheet = false
                    viewModel.simulateVisionFire()
                },
                onSimulateWeapon = {
                    showSimulationSheet = false
                    viewModel.simulateVisionWeapon()
                },
                onSimulateManual = {
                    showSimulationSheet = false
                    viewModel.simulateManualSos()
                }
            )
        }
    }
}

/**
 * High-detail Satellite Map Canvas with dynamic user location, radar beacon, and contours.
 */
@Composable
fun SatelliteMapCanvas(
    telemetry: CrisisTelemetry,
    isCrisisActive: Boolean,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "RadarPulse")
    val pulseRadius by infiniteTransition.animateFloat(
        initialValue = 20f,
        targetValue = 180f,
        animationSpec = infiniteRepeatable(
            animation = tween(2200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "radius"
    )
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.85f,
        targetValue = 0.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(2200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "alpha"
    )

    Canvas(modifier = modifier) {
        val center = Offset(size.width * 0.5f, size.height * 0.52f)

        // Deep satellite terrain texture simulation
        drawRect(
            brush = Brush.radialGradient(
                colors = listOf(Color(0xFF0F1A2A), Color(0xFF060B14), Color(0xFF020408)),
                center = center,
                radius = size.width * 0.9f
            )
        )

        // Topographic / Latitude-Longitude Grid
        val gridSpacing = 65f
        for (x in 0..(size.width / gridSpacing).toInt()) {
            drawLine(
                color = Color(0xFF1E334D).copy(alpha = 0.25f),
                start = Offset(x * gridSpacing, 0f),
                end = Offset(x * gridSpacing, size.height),
                strokeWidth = 1f
            )
        }
        for (y in 0..(size.height / gridSpacing).toInt()) {
            drawLine(
                color = Color(0xFF1E334D).copy(alpha = 0.25f),
                start = Offset(0f, y * gridSpacing),
                end = Offset(size.width, y * gridSpacing),
                strokeWidth = 1f
            )
        }

        // Contour elevation circles
        for (r in listOf(140f, 260f, 380f, 500f)) {
            drawCircle(
                color = Color(0xFF2A4365).copy(alpha = 0.18f),
                radius = r,
                center = center,
                style = Stroke(width = 1.5f)
            )
        }

        // Accuracy radius circle
        val accuracyPx = (telemetry.accuracyMeters * 16f).coerceIn(45f, 160f)
        drawCircle(
            color = if (isCrisisActive) Color(0xFFFF1744).copy(alpha = 0.15f) else Color(0xFF00E5FF).copy(alpha = 0.12f),
            radius = accuracyPx,
            center = center
        )
        drawCircle(
            color = if (isCrisisActive) Color(0xFFFF1744).copy(alpha = 0.5f) else Color(0xFF00E5FF).copy(alpha = 0.4f),
            radius = accuracyPx,
            center = center,
            style = Stroke(width = 1.5f)
        )

        // Animated Pulsating Crisis Radar Rings
        if (isCrisisActive) {
            drawCircle(
                color = Color(0xFFFF1744).copy(alpha = pulseAlpha),
                radius = pulseRadius,
                center = center,
                style = Stroke(width = 3.5f)
            )
            drawCircle(
                color = Color(0xFFFF6D00).copy(alpha = (pulseAlpha * 0.7f)),
                radius = (pulseRadius * 0.65f),
                center = center,
                style = Stroke(width = 2.5f)
            )
        }

        // User Position Pin / Beacon Core
        drawCircle(
            color = if (isCrisisActive) Color(0xFFFF1744) else Color(0xFF00E5FF),
            radius = 11f,
            center = center
        )
        drawCircle(
            color = Color.White,
            radius = 4.5f,
            center = center
        )

        // Directional Heading Vector
        val bearingRad = Math.toRadians((telemetry.bearingDegrees - 90.0)).toFloat()
        val vectorLen = 42f
        val vectorEnd = Offset(
            center.x + kotlin.math.cos(bearingRad) * vectorLen,
            center.y + kotlin.math.sin(bearingRad) * vectorLen
        )
        drawLine(
            color = if (isCrisisActive) Color(0xFFFF5252) else Color(0xFF00E5FF),
            start = center,
            end = vectorEnd,
            strokeWidth = 3.5f
        )
    }
}

/**
 * Top Header with Frosted Glass styling, active trigger badges, and quick toggles.
 */
@Composable
fun CrisisTopHeaderBar(
    crisisState: CrisisState,
    onBack: () -> Unit,
    onOpenSettings: () -> Unit,
    onToggleSimulations: () -> Unit
) {
    val isEmergency = crisisState.status != CrisisStatus.IDLE_MONITORING &&
            crisisState.status != CrisisStatus.FALSE_ALARM_CANCELLED

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Color(0xCC0C1424))
            .border(
                1.dp,
                if (isEmergency) Color(0x66FF1744) else Color(0x3300E5FF),
                RoundedCornerShape(20.dp)
            )
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(
            onClick = onBack,
            modifier = Modifier.size(36.dp)
        ) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
        }

        Spacer(modifier = Modifier.width(8.dp))

        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(if (isEmergency) Color(0xFFFF1744) else Color(0xFF00E676))
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = if (isEmergency) "EMERGENCY PROTOCOL" else "CRISIS SHIELD ACTIVE",
                    color = if (isEmergency) Color(0xFFFF5252) else Color(0xFF00E676),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 1.sp
                )
            }
            Text(
                text = if (isEmergency) crisisState.triggerType.displayName else "Continuous Background Scanning",
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold
            )
        }

        // Test Simulation Trigger Button
        OutlinedButton(
            onClick = onToggleSimulations,
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF00E5FF)),
            border = ButtonDefaults.outlinedButtonBorder.copy(brush = Brush.linearGradient(listOf(Color(0xFF00E5FF), Color(0xFF7C4DFF)))),
            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
            modifier = Modifier.height(34.dp)
        ) {
            Icon(Icons.Default.BugReport, contentDescription = "Simulate", modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(4.dp))
            Text("Simulate", fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }

        Spacer(modifier = Modifier.width(6.dp))

        IconButton(
            onClick = onOpenSettings,
            modifier = Modifier.size(36.dp)
        ) {
            Icon(Icons.Default.Settings, contentDescription = "Settings", tint = Color.LightGray)
        }
    }
}

/**
 * Pre-Escalation Countdown & False Alarm Safeguard Widget.
 */
@Composable
fun PreEscalationCountdownWidget(
    crisisState: CrisisState,
    onCancel: () -> Unit,
    onEscalateNow: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xD9170808)),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.5.dp, Color(0xFFFF1744), RoundedCornerShape(24.dp))
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    Icons.Default.Warning,
                    contentDescription = "Alert",
                    tint = Color(0xFFFF1744),
                    modifier = Modifier.size(28.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "CRISIS VERIFIED: ZERO-TOUCH ESCALATION",
                    color = Color(0xFFFF1744),
                    fontWeight = FontWeight.Black,
                    fontSize = 13.sp,
                    letterSpacing = 1.sp
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = "Dual cameras activated & AI evidence verified. Calling emergency contact & 911 dispatch in:",
                color = Color.LightGray,
                fontSize = 12.sp,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(14.dp))

            // Huge Glowing Countdown Timer
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(88.dp)
                    .clip(CircleShape)
                    .background(Color(0x33FF1744))
                    .border(2.dp, Color(0xFFFF1744), CircleShape)
            ) {
                Text(
                    text = "${crisisState.preEscalationCountdown}s",
                    color = Color.White,
                    fontSize = 32.sp,
                    fontWeight = FontWeight.Black,
                    fontFamily = FontFamily.Monospace
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Slide / Tap to Cancel False Alarm
                Button(
                    onClick = onCancel,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF263238)),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .weight(1f)
                        .height(46.dp)
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Cancel", tint = Color.White)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("I'M OK (CANCEL)", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
                }

                // Escalate Immediately
                Button(
                    onClick = onEscalateNow,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF1744)),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .weight(1f)
                        .height(46.dp)
                ) {
                    Icon(Icons.Default.Phone, contentDescription = "Call", tint = Color.White)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("ESCALATE NOW", fontSize = 12.sp, fontWeight = FontWeight.Black, color = Color.White)
                }
            }
        }
    }
}

/**
 * Active Zero-Touch Telecom Call Bar and Live Satellite Data HUD.
 */
@Composable
fun ActiveCallTelemetryHUD(
    callSession: CrisisCallSession,
    dataSharing: DataSharingStatus,
    onToggleSpeaker: () -> Unit,
    onToggleMute: () -> Unit,
    onEscalate911: () -> Unit,
    onCancel: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xE608101E)),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.5.dp, Color(0xFF00E5FF).copy(alpha = 0.6f), RoundedCornerShape(24.dp))
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            // Call Status & Contact Info
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Box(
                    modifier = Modifier
                        .size(46.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF00E5FF).copy(alpha = 0.2f))
                        .border(1.dp, Color(0xFF00E5FF), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.PhoneInTalk,
                        contentDescription = "Active Call",
                        tint = Color(0xFF00E5FF),
                        modifier = Modifier.size(24.dp)
                    )
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = callSession.contactName,
                        color = Color.White,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "${callSession.phoneNumber} • ${callSession.callStatus}",
                        color = Color(0xFF00E5FF),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )
                }

                // Call Duration Timer
                val minutes = callSession.callDurationSeconds / 60
                val seconds = callSession.callDurationSeconds % 60
                Text(
                    text = "%02d:%02d".format(minutes, seconds),
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Black,
                    fontFamily = FontFamily.Monospace
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Audio Equalizer Waveform Animation
            AudioWaveformEqualizer(isCallActive = callSession.isCallActive)

            Spacer(modifier = Modifier.height(14.dp))

            // Call Action Controls
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // Speakerphone Toggle
                FilterChip(
                    selected = callSession.isSpeakerphoneOn,
                    onClick = onToggleSpeaker,
                    label = { Text("SPEAKER", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                    leadingIcon = {
                        Icon(
                            if (callSession.isSpeakerphoneOn) Icons.Default.VolumeUp else Icons.Default.VolumeOff,
                            contentDescription = "Speaker",
                            modifier = Modifier.size(16.dp)
                        )
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Color(0xFF00E5FF).copy(alpha = 0.25f),
                        selectedLabelColor = Color(0xFF00E5FF),
                        selectedLeadingIconColor = Color(0xFF00E5FF)
                    )
                )

                // Mute Toggle
                FilterChip(
                    selected = callSession.isMuted,
                    onClick = onToggleMute,
                    label = { Text(if (callSession.isMuted) "MUTED" else "MIC ON", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                    leadingIcon = {
                        Icon(
                            if (callSession.isMuted) Icons.Default.MicOff else Icons.Default.Mic,
                            contentDescription = "Mute",
                            modifier = Modifier.size(16.dp)
                        )
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Color(0xFFFF5252).copy(alpha = 0.25f),
                        selectedLabelColor = Color(0xFFFF5252),
                        selectedLeadingIconColor = Color(0xFFFF5252)
                    )
                )

                // 911 Escalation Switch
                Button(
                    onClick = onEscalate911,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF1744)),
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    modifier = Modifier.height(34.dp)
                ) {
                    Text("ESCALATE 911", fontSize = 11.sp, fontWeight = FontWeight.Black)
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // End / Dismiss Call
            TextButton(
                onClick = onCancel,
                modifier = Modifier.align(Alignment.CenterHorizontally)
            ) {
                Text("End Emergency Call & Clear Alert", color = Color.Gray, fontSize = 11.sp)
            }
        }
    }
}

/**
 * Animated Audio Equalizer visualization for active telecom call.
 */
@Composable
fun AudioWaveformEqualizer(isCallActive: Boolean) {
    val infiniteTransition = rememberInfiniteTransition(label = "Waveform")
    val heights = listOf(
        infiniteTransition.animateFloat(0.2f, 0.9f, infiniteRepeatable(tween(420, easing = LinearEasing), RepeatMode.Reverse), label = "h1"),
        infiniteTransition.animateFloat(0.4f, 1.0f, infiniteRepeatable(tween(310, easing = LinearEasing), RepeatMode.Reverse), label = "h2"),
        infiniteTransition.animateFloat(0.1f, 0.7f, infiniteRepeatable(tween(540, easing = LinearEasing), RepeatMode.Reverse), label = "h3"),
        infiniteTransition.animateFloat(0.5f, 0.95f, infiniteRepeatable(tween(380, easing = LinearEasing), RepeatMode.Reverse), label = "h4"),
        infiniteTransition.animateFloat(0.3f, 0.85f, infiniteRepeatable(tween(460, easing = LinearEasing), RepeatMode.Reverse), label = "h5"),
        infiniteTransition.animateFloat(0.2f, 0.95f, infiniteRepeatable(tween(350, easing = LinearEasing), RepeatMode.Reverse), label = "h6"),
        infiniteTransition.animateFloat(0.4f, 0.75f, infiniteRepeatable(tween(490, easing = LinearEasing), RepeatMode.Reverse), label = "h7")
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(26.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0x3300E5FF))
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically
    ) {
        heights.forEach { anim ->
            val factor = if (isCallActive) anim.value else 0.1f
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .fillMaxHeight(factor)
                    .clip(CircleShape)
                    .background(Color(0xFF00E5FF))
            )
        }
    }
}

/**
 * Sleek Floating Live Camera Feed Widget (Picture-in-Picture)
 * Shows real-time evidence being transmitted with AI detection tags.
 */
@Composable
fun FloatingLiveCameraWidget(
    bitmap: Bitmap?,
    visionEvidence: VisionEvidence,
    facing: CameraFacing,
    isTorchOn: Boolean,
    onSwitchCamera: () -> Unit,
    onToggleTorch: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xE60A101C)),
        modifier = Modifier
            .width(170.dp)
            .height(130.dp)
            .border(1.5.dp, Color(0xFF00E5FF).copy(alpha = 0.7f), RoundedCornerShape(18.dp))
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            if (bitmap != null) {
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = "Live Camera Feed",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0xFF10192A)),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Color(0xFF00E5FF), modifier = Modifier.size(24.dp))
                }
            }

            // Top Status Overlay Tag
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xB3000000))
                    .padding(horizontal = 6.dp, vertical = 3.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(Color.Red)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "LIVE EVIDENCE",
                    color = Color.White,
                    fontSize = 8.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 0.5.sp
                )
                Spacer(modifier = Modifier.weight(1f))
                Text(
                    text = if (facing == CameraFacing.REAR) "REAR" else "FRONT",
                    color = Color(0xFF00E5FF),
                    fontSize = 8.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            // Bottom AI Verification Tag
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .background(Color(0xCC000000))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = visionEvidence.detectedCategory,
                    color = Color(0xFF00E676),
                    fontSize = 8.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1
                )
            }

            // Floating mini-controls (Flip camera, Torch)
            Row(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 18.dp, end = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                IconButton(
                    onClick = onSwitchCamera,
                    modifier = Modifier
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(Color(0x99000000))
                ) {
                    Icon(
                        Icons.Default.FlipCameraAndroid,
                        contentDescription = "Flip",
                        tint = Color.White,
                        modifier = Modifier.size(14.dp)
                    )
                }

                IconButton(
                    onClick = onToggleTorch,
                    modifier = Modifier
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(if (isTorchOn) Color(0xFFFFD600) else Color(0x99000000))
                ) {
                    Icon(
                        Icons.Default.FlashOn,
                        contentDescription = "Torch",
                        tint = if (isTorchOn) Color.Black else Color.White,
                        modifier = Modifier.size(14.dp)
                    )
                }
            }
        }
    }
}

/**
 * Bottom Telemetry HUD displaying high-fidelity GPS, speed, battery, and broadcast status.
 */
@Composable
fun LiveSatelliteTelemetryBar(
    telemetry: CrisisTelemetry,
    dataSharing: DataSharingStatus,
    visionEvidence: VisionEvidence
) {
    Card(
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xEB060C16)),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Color(0x4000E5FF), RoundedCornerShape(22.dp))
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            // Live GPS & Speed Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "EXACT GPS COORDINATES",
                        color = Color.Gray,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )
                    Text(
                        text = "${"%.5f".format(telemetry.latitude)}°N, ${"%.5f".format(kotlin.math.abs(telemetry.longitude))}°W",
                        color = Color.White,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Black,
                        fontFamily = FontFamily.Monospace
                    )
                }

                // Speed Badge
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF00E5FF).copy(alpha = 0.15f))
                        .border(1.dp, Color(0xFF00E5FF).copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "${telemetry.speedKmh.toInt()}",
                            color = Color(0xFF00E5FF),
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Black
                        )
                        Text(
                            text = "KM/H",
                            color = Color(0xFF00E5FF),
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Telemetry Metric Chips (Altitude, Accuracy, Battery, Satellites)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                TelemetryMetricChip(label = "ACCURACY", value = "±${telemetry.accuracyMeters.toInt()}m")
                TelemetryMetricChip(label = "ALTITUDE", value = "${telemetry.altitudeMeters.toInt()}m")
                TelemetryMetricChip(label = "BATTERY", value = "${telemetry.batteryPercent}%")
                TelemetryMetricChip(label = "SATELLITES", value = "${telemetry.satellitesLocked} Locked")
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Real-Time Broadcast Status Indicator
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    Icons.Default.CloudUpload,
                    contentDescription = "Broadcast",
                    tint = Color(0xFF00E676),
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Real-time Telemetry & Satellite Link Streaming Active",
                    color = Color(0xFF00E676),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.weight(1f))
                if (dataSharing.smsDispatched) {
                    Text(
                        text = "SMS SENT",
                        color = Color(0xFFFFD600),
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Black
                    )
                }
            }
        }
    }
}

@Composable
fun TelemetryMetricChip(label: String, value: String) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0x33101A2C))
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(text = label, color = Color.Gray, fontSize = 8.sp, fontWeight = FontWeight.Bold)
        Text(text = value, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

/**
 * Interactive Simulation Modal to let the reviewer / user test automated triggers.
 */
@Composable
fun SimulationControlModal(
    onDismiss: () -> Unit,
    onSimulateCrash: () -> Unit,
    onSimulateFall: () -> Unit,
    onSimulateScream: () -> Unit,
    onSimulateFire: () -> Unit,
    onSimulateWeapon: () -> Unit,
    onSimulateManual: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xFF0C1424),
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.BugReport, contentDescription = null, tint = Color(0xFF00E5FF))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Simulate Crisis Triggers", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    "Test the zero-touch automated detection, camera activation, AI verification, and telecom dialing pipelines:",
                    color = Color.LightGray,
                    fontSize = 12.sp
                )

                Spacer(modifier = Modifier.height(4.dp))

                SimulationButton(
                    title = "🚗 High-G Vehicle Collision",
                    subtitle = "5.4G shock + rotational roll spike",
                    color = Color(0xFFFF1744),
                    onClick = onSimulateCrash
                )

                SimulationButton(
                    title = "💥 Free-Fall & Ground Impact",
                    subtitle = "450ms weightlessness + 3.6G shock",
                    color = Color(0xFFFF5252),
                    onClick = onSimulateFall
                )

                SimulationButton(
                    title = "🔊 Distress Scream / Gunshot",
                    subtitle = "91.5 dB peak in 2.6 kHz acoustic band",
                    color = Color(0xFFFF9100),
                    onClick = onSimulateScream
                )

                SimulationButton(
                    title = "🔥 AI Vision: Fire & Smoke",
                    subtitle = "Thermal flame chromaticity 94% verified",
                    color = Color(0xFFFF6D00),
                    onClick = onSimulateFire
                )

                SimulationButton(
                    title = "🔫 AI Vision: Weapon / Threat",
                    subtitle = "Threat object bounding box 92% verified",
                    color = Color(0xFFD500F9),
                    onClick = onSimulateWeapon
                )

                SimulationButton(
                    title = "🚨 Manual SOS Override",
                    subtitle = "Immediate zero-touch escalation",
                    color = Color(0xFF00E5FF),
                    onClick = onSimulateManual
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close", color = Color.Gray)
            }
        }
    )
}

@Composable
fun SimulationButton(
    title: String,
    subtitle: String,
    color: Color,
    onClick: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.12f)),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, color.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = title, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Text(text = subtitle, color = Color.LightGray, fontSize = 10.sp)
            }
            Icon(Icons.Default.PlayArrow, contentDescription = null, tint = color)
        }
    }
}
