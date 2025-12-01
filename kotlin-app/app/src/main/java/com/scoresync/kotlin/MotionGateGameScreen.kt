package com.scoresync.kotlin

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun MotionGateGameScreen(
    lobbyId: String? = null,
    deviceId: String? = null,
    role: String? = null,
    lanIp: String? = null,
    lanPort: String? = null,
    isLanHost: Boolean = false,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var motionDetected by remember { mutableStateOf(false) }
    var tripwireX by remember { mutableFloatStateOf(0.5f) }
    var tripwireY by remember { mutableFloatStateOf(0.5f) }

    // Timer State
    var isRunning by remember { mutableStateOf(false) }
    var startTime by remember { mutableLongStateOf(0L) }
    var elapsedTime by remember { mutableLongStateOf(0L) }

    // Modes
    val isCloudMode = lobbyId != null
    val isLanMode = lanIp != null

    // LAN State
    val lanState by LanClient.gameState.collectAsState()

    // Configuration
    val tripwireWidth = 50f
    val tripwireHeightPercent = 0.8f

    // Cloud Sync
    LaunchedEffect(lobbyId) {
        if (isCloudMode && lobbyId != null) {
            FirebaseService.observeLobby(lobbyId) { state ->
                if (state.status == "RUNNING" && state.startTime != null) {
                    isRunning = true
                    startTime = state.startTime
                } else if (state.status == "FINISHED" || state.status == "IDLE") {
                    isRunning = false
                    if (state.status == "IDLE") {
                        elapsedTime = 0L
                    } else if (state.status == "FINISHED" && state.finishTime != null && state.startTime != null) {
                        elapsedTime = state.finishTime - state.startTime
                    }
                }
            }
        }
    }

    // LAN Sync
    LaunchedEffect(lanIp, lanPort) {
        if (isLanMode && lanIp != null && lanPort != null) {
            if (!isLanHost) {
                LanClient.connect(lanIp, lanPort.toIntOrNull() ?: 8080, deviceId ?: "unknown", "Player")
            }
        }
    }

    // Observe LAN State
    LaunchedEffect(lanState) {
        if (isLanMode) {
            if (lanState.status == "RUNNING" && lanState.startTime != null) {
                isRunning = true
                startTime = lanState.startTime ?: 0L
            } else if (lanState.status == "FINISHED" || lanState.status == "IDLE") {
                isRunning = false
                if (lanState.status == "IDLE") {
                    elapsedTime = 0L
                } else if (lanState.status == "FINISHED" && lanState.finishTime != null && lanState.startTime != null) {
                    elapsedTime = (lanState.finishTime ?: 0L) - (lanState.startTime ?: 0L)
                }
            }
        }
    }

    val motionDetector =
        remember {
            MotionDetector { motion ->
                if (motion > 0.05f) {
                    motionDetected = true

                    if (isCloudMode && lobbyId != null) {
                        // Cloud Logic
                        val now = FirebaseService.getServerTime()
                        scope.launch {
                            when (role) {
                                "START_GATE" -> if (!isRunning) FirebaseService.triggerMotionStart(lobbyId, now)
                                "FINISH_GATE" -> if (isRunning) FirebaseService.triggerMotionFinish(lobbyId, now)
                                "SPLIT_GATE" ->
                                    if (isRunning) {
                                        FirebaseService.triggerMotionSplit(
                                            lobbyId,
                                            now,
                                            deviceId ?: "Unknown",
                                        )
                                    }
                            }
                        }
                    } else if (isLanMode) {
                        // LAN Logic
                        when (role) {
                            "START_GATE" -> if (!isRunning) LanClient.sendStart()
                            "FINISH_GATE" -> if (isRunning) LanClient.sendFinish()
                            // "SPLIT_GATE" -> LanClient.sendSplit() // TODO
                        }
                    } else {
                        // Local Logic
                        if (!isRunning) {
                            isRunning = true
                            startTime = System.currentTimeMillis()
                        }
                    }
                } else {
                    motionDetected = false
                }
            }
        }

    // Timer Loop
    LaunchedEffect(isRunning) {
        if (isRunning) {
            while (isRunning) {
                val now = if (isCloudMode) FirebaseService.getServerTime() else System.currentTimeMillis()
                elapsedTime = now - startTime
                kotlinx.coroutines.delay(16)
            }
        }
    }

    // Update detector zone when position changes
    LaunchedEffect(tripwireX, tripwireY) {
        motionDetector.zone =
            MotionDetector.Zone(
                x = tripwireX - 0.05f,
                y = tripwireY - (tripwireHeightPercent / 2),
                width = 0.1f,
                height = tripwireHeightPercent,
            )
    }

    Box(modifier = Modifier.fillMaxSize()) {
        CameraPreview(
            modifier = Modifier.fillMaxSize(),
            motionDetector = motionDetector,
        )

        // Overlay
        Canvas(
            modifier =
                Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) {
                        detectDragGestures { change, dragAmount ->
                            change.consume()
                            val newX = (tripwireX + dragAmount.x / size.width).coerceIn(0f, 1f)
                            val newY = (tripwireY + dragAmount.y / size.height).coerceIn(0f, 1f)
                            tripwireX = newX
                            tripwireY = newY
                        }
                    },
        ) {
            val canvasWidth = size.width
            val canvasHeight = size.height

            val zoneW = tripwireWidth
            val zoneH = canvasHeight * tripwireHeightPercent

            val centerX = tripwireX * canvasWidth
            val centerY = tripwireY * canvasHeight

            val topLeftX = centerX - (zoneW / 2)
            val topLeftY = centerY - (zoneH / 2)

            val color = if (motionDetected) Color.Red else Color.Green

            // Draw Tripwire Zone
            drawRect(
                color = color.copy(alpha = 0.3f),
                topLeft = Offset(topLeftX, topLeftY),
                size = Size(zoneW, zoneH),
            )

            // Draw Border
            drawRect(
                color = color,
                topLeft = Offset(topLeftX, topLeftY),
                size = Size(zoneW, zoneH),
                style = Stroke(width = 4f),
            )

            // Draw Handle
            drawCircle(
                color = Color.White,
                radius = 20f,
                center = Offset(centerX, centerY),
            )
        }

        // Back Button
        androidx.compose.material3.IconButton(
            onClick = onBack,
            modifier =
                Modifier
                    .align(Alignment.TopStart)
                    .padding(16.dp)
                    .background(Color.Black.copy(alpha = 0.5f), androidx.compose.foundation.shape.CircleShape),
        ) {
            androidx.compose.material3.Icon(
                imageVector = androidx.compose.material.icons.Icons.Filled.ArrowBack,
                contentDescription = "Back",
                tint = Color.White,
            )
        }

        // UI Overlay (Timer & Status)
        Column(
            modifier =
                Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Role/Mode Display
            if (isCloudMode) {
                Text("Cloud Role: $role", color = Color.Yellow, style = MaterialTheme.typography.titleMedium)
            } else if (isLanMode) {
                Text("LAN Role: $role", color = Color.Cyan, style = MaterialTheme.typography.titleMedium)
            }

            // Timer Display
            Text(
                text = formatTime(elapsedTime),
                color = Color.White,
                style = MaterialTheme.typography.displayLarge,
                modifier = Modifier.padding(bottom = 16.dp),
            )

            if (motionDetected) {
                Text(
                    text = "MOTION DETECTED!",
                    color = Color.Red,
                    style = MaterialTheme.typography.headlineMedium,
                )
            }
        }

        // Reset Button (Local only or Host)
        if (!isCloudMode && (!isLanMode || isLanHost)) {
            androidx.compose.material3.Button(
                onClick = {
                    if (isLanMode && isLanHost) {
                        // Send Reset
                        // LanServer.triggerReset() // Implement if needed
                    } else {
                        isRunning = false
                        elapsedTime = 0L
                        motionDetected = false
                    }
                },
                modifier =
                    Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 48.dp),
            ) {
                Text("RESET")
            }
        }
    }
}

fun formatTime(millis: Long): String {
    val minutes = (millis / 1000) / 60
    val seconds = (millis / 1000) % 60
    val hundredths = (millis % 1000) / 10
    return String.format("%02d:%02d.%02d", minutes, seconds, hundredths)
}
