package com.scoresync.kotlin

import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MotionGateCloudLobbyScreen(
    onNavigateToGame: (String, String, String) -> Unit, // lobbyId, deviceId, role
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // State
    var lobbyId by remember { mutableStateOf("") }
    var deviceName by remember { mutableStateOf("Android Device") }
    var isJoined by remember { mutableStateOf(false) }
    var lobbyState by remember { mutableStateOf(LobbyState()) }

    // Device ID (persistent per install usually, here using ANDROID_ID for simplicity)
    val deviceId =
        remember {
            Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown_device"
        }

    LaunchedEffect(Unit) {
        FirebaseService.initialize()
    }

    // Observe lobby when joined
    LaunchedEffect(isJoined, lobbyId) {
        if (isJoined && lobbyId.isNotEmpty()) {
            FirebaseService.observeLobby(lobbyId) { state ->
                lobbyState = state
            }
            // Register self
            // Register self
            FirebaseService.registerDevice(lobbyId, deviceId, deviceName)
            // Heartbeat loop could go here
        }
    }

    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .background(Color(0xFF121212))
                .padding(16.dp),
    ) {
        Header(
            title = "Cloud Lobby",
            onBackClick = onBack,
        )

        if (!isJoined) {
            // Join Form

            Spacer(modifier = Modifier.height(24.dp))

            OutlinedTextField(
                value = deviceName,
                onValueChange = { deviceName = it },
                label = { Text("Device Name") },
                colors =
                    OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = Color(0xFF3B82F6),
                        unfocusedBorderColor = Color.Gray,
                    ),
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = {
                    if (lobbyId.length >= 3 && deviceName.isNotBlank()) {
                        isJoined = true
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF3B82F6)),
            ) {
                Text("Join Lobby")
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "OR",
                color = Color.Gray,
                fontSize = 14.sp,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )

            Spacer(modifier = Modifier.height(16.dp))

            Button(
                onClick = {
                    if (deviceName.isNotBlank()) {
                        lobbyId = (100000..999999).random().toString()
                        isJoined = true
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
            ) {
                Text("Create New Session")
            }
        } else {
            // Lobby View
            Text(
                text = "Lobby: $lobbyId",
                color = Color.Gray,
                fontSize = 14.sp,
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Connected Devices",
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
            )

            LazyColumn(
                modifier =
                    Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
            ) {
                items(lobbyState.devices) { device ->
                    DeviceCard(
                        device = device,
                        isSelf = device.id == deviceId,
                        onRoleChange = { role ->
                            scope.launch {
                                FirebaseService.updateDeviceRole(lobbyId, device.id, role)
                            }
                        },
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }
            }

            // Find self to check role
            val myDevice = lobbyState.devices.find { it.id == deviceId }
            val myRole = myDevice?.role ?: "UNASSIGNED"

            Button(
                onClick = { onNavigateToGame(lobbyId, deviceId, myRole) },
                enabled = myRole != "UNASSIGNED" && myRole != "MONITOR",
                modifier = Modifier.fillMaxWidth(),
                colors =
                    ButtonDefaults.buttonColors(
                        containerColor = if (myRole != "UNASSIGNED") Color(0xFF10B981) else Color.Gray,
                    ),
            ) {
                Text(if (myRole == "MONITOR") "Monitor Mode (View Only)" else "Start Gate Mode")
            }
        }
    }
}

@Composable
fun DeviceCard(
    device: Device,
    isSelf: Boolean,
    onRoleChange: (String) -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1E1E)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = if (isSelf) "${device.name} (You)" else device.name,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = device.role,
                    color =
                        when (device.role) {
                            "START_GATE" -> Color(0xFF10B981)
                            "FINISH_GATE" -> Color(0xFFEF4444)
                            "SPLIT_GATE" -> Color(0xFFF59E0B)
                            else -> Color.Gray
                        },
                    fontSize = 12.sp,
                )
            }

            if (isSelf) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    RoleButton("Start", "START_GATE", device.role == "START_GATE") { onRoleChange("START_GATE") }
                    RoleButton("Split", "SPLIT_GATE", device.role == "SPLIT_GATE") { onRoleChange("SPLIT_GATE") }
                    RoleButton("Finish", "FINISH_GATE", device.role == "FINISH_GATE") { onRoleChange("FINISH_GATE") }
                }
            }
        }
    }
}

@Composable
fun RoleButton(
    label: String,
    role: String,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    FilterChip(
        selected = isSelected,
        onClick = onClick,
        label = { Text(label) },
        colors =
            FilterChipDefaults.filterChipColors(
                selectedContainerColor = Color(0xFF3B82F6),
                selectedLabelColor = Color.White,
            ),
    )
}

@Composable
fun Keypad(
    onNumberClick: (Int) -> Unit,
    onBackspaceClick: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        val rows =
            listOf(
                listOf(1, 2, 3),
                listOf(4, 5, 6),
                listOf(7, 8, 9),
            )

        rows.forEach { row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                row.forEach { num ->
                    KeypadButton(
                        text = num.toString(),
                        onClick = { onNumberClick(num) },
                    )
                }
            }
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Empty placeholder for alignment
            Spacer(modifier = Modifier.size(80.dp))

            KeypadButton(
                text = "0",
                onClick = { onNumberClick(0) },
            )

            KeypadButton(
                text = "⌫",
                onClick = onBackspaceClick,
                isAction = true,
            )
        }
    }
}

@Composable
fun KeypadButton(
    text: String,
    onClick: () -> Unit,
    isAction: Boolean = false,
) {
    Button(
        onClick = onClick,
        modifier = Modifier.size(80.dp),
        shape = RoundedCornerShape(50),
        colors =
            ButtonDefaults.buttonColors(
                containerColor = if (isAction) Color(0xFF374151) else Color(0xFF1F2937),
                contentColor = Color.White,
            ),
        contentPadding = PaddingValues(0.dp),
    ) {
        Text(
            text = text,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}
