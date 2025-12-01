package com.scoresync.kotlin

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

class MotionGateActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MotionGateScreen()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MotionGateScreen() {
    val context = LocalContext.current
    var currentScreen by remember { mutableStateOf("menu") }

    // Cloud Params
    var lobbyId by remember { mutableStateOf<String?>(null) }
    var deviceId by remember { mutableStateOf<String?>(null) }
    var role by remember { mutableStateOf<String?>(null) }

    // LAN Params
    var lanIp by remember { mutableStateOf<String?>(null) }
    var lanPort by remember { mutableStateOf<String?>(null) }
    var isLanHost by remember { mutableStateOf(false) }

    if (currentScreen == "cloud_lobby") {
        MotionGateCloudLobbyScreen(
            onNavigateToGame = { lId, dId, r ->
                lobbyId = lId
                deviceId = dId
                role = r
                currentScreen = "game"
            },
            onBack = {
                currentScreen = "menu"
            },
        )
        return
    }

    if (currentScreen == "lan_lobby") {
        MotionGateLanLobbyScreen(
            onNavigateToGame = { ip, port, isHost, r ->
                lanIp = ip
                lanPort = port
                isLanHost = isHost
                role = r
                currentScreen = "game"
            },
            onBack = {
                currentScreen = "menu"
            },
        )
        return
    }

    if (currentScreen == "game") {
        MotionGateGameScreen(
            lobbyId = if (lobbyId?.isNotEmpty() == true) lobbyId else null,
            deviceId = deviceId,
            role = role,
            lanIp = if (lanIp?.isNotEmpty() == true) lanIp else null,
            lanPort = if (lanPort?.isNotEmpty() == true) lanPort else null,
            isLanHost = isLanHost,
            onBack = {
                // If in game, back goes to previous lobby or menu?
                // For now, let's go back to menu to be safe, or back to lobby if we came from one.
                // But we don't track history well. Let's go to menu for now as a "Exit Game" action.
                currentScreen = "menu"
            },
        )
        return
    }

    val backgroundColor = Color(0xFF121212)
    val cardBackgroundColor = Color(0xFF1E1E1E)
    val accentColor = Color(0xFF3B82F6)
    val textColor = Color(0xFFFFFFFF)
    val secondaryTextColor = Color(0xFFB0B0B0)

    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .background(backgroundColor)
                .padding(16.dp),
    ) {
        Text(
            text = "Motion Gate",
            color = textColor,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
        )

        Text(
            text = "Select operation mode",
            color = secondaryTextColor,
            fontSize = 14.sp,
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Native LAN Server
        ModeCard(
            title = "Native LAN Server",
            description = "Run a native WebSocket signaling server on THIS device.",
            iconRes = android.R.drawable.ic_menu_share,
            onClick = {
                currentScreen = "lan_lobby"
            },
            cardBackgroundColor,
            accentColor,
            textColor,
            secondaryTextColor,
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Multi-Device (Cloud)
        ModeCard(
            title = "Multi-Device (Cloud)",
            description = "Synchronize multiple devices via the internet.",
            iconRes = android.R.drawable.ic_menu_upload,
            onClick = {
                currentScreen = "cloud_lobby"
            },
            cardBackgroundColor,
            accentColor,
            textColor,
            secondaryTextColor,
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Single Device
        ModeCard(
            title = "Single Device",
            description = "Uses the camera of this device as a standalone tripwire stopwatch.",
            iconRes = android.R.drawable.ic_menu_camera,
            onClick = {
                lobbyId = null
                deviceId = null
                role = null
                lanIp = null
                lanPort = null
                isLanHost = false
                currentScreen = "game"
            },
            cardBackgroundColor,
            accentColor,
            textColor,
            secondaryTextColor,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModeCard(
    title: String,
    description: String,
    iconRes: Int,
    onClick: () -> Unit,
    cardColor: Color,
    accentColor: Color,
    textColor: Color,
    secondaryTextColor: Color,
) {
    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(containerColor = cardColor),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier =
                Modifier
                    .padding(16.dp)
                    .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(
                painter = painterResource(iconRes),
                contentDescription = null,
                colorFilter = ColorFilter.tint(accentColor),
                modifier = Modifier.size(24.dp),
            )

            Column(
                modifier =
                    Modifier
                        .weight(1f)
                        .padding(start = 16.dp),
            ) {
                Text(
                    text = title,
                    color = textColor,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = description,
                    color = secondaryTextColor,
                    fontSize = 12.sp,
                )
            }

            Image(
                painter = painterResource(android.R.drawable.ic_media_play),
                contentDescription = null,
                colorFilter = ColorFilter.tint(secondaryTextColor),
                modifier = Modifier.size(24.dp),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Preview(showBackground = true)
@Composable
fun MotionGateScreenPreview() {
    MotionGateScreen()
}
