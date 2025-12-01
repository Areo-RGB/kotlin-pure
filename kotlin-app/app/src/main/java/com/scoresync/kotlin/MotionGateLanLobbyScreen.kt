package com.scoresync.kotlin

import android.net.nsd.NsdServiceInfo
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun MotionGateLanLobbyScreen(
    onNavigateToGame: (String, String, Boolean, String) -> Unit, // ip, port, isHost, role
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var selectedTab by remember { mutableIntStateOf(0) } // 0: Host, 1: Join

    // Device Info
    val deviceId =
        remember {
            android.provider.Settings.Secure.getString(context.contentResolver, android.provider.Settings.Secure.ANDROID_ID) ?: "unknown_device"
        }
    val deviceName = remember {
        val model = android.os.Build.MODEL
        val manufacturer = android.os.Build.MANUFACTURER
        val device = android.os.Build.DEVICE

        // Try to get marketing name from system properties
        try {
            val marketingName = android.os.Build::class.java.getDeclaredField("MARKETING_NAME")
            marketingName.isAccessible = true
            val name = marketingName.get(null) as? String
            if (!name.isNullOrBlank()) {
                return@remember name
            }
        } catch (e: Exception) {
            // MARKETING_NAME not available, continue with fallback
        }

        // Fallback: Use manufacturer + model with capitalization
        val cleanManufacturer = manufacturer.replaceFirstChar { it.uppercase() }
        val cleanModel = model.trim()

        // If model already starts with manufacturer, just use model
        if (cleanModel.startsWith(manufacturer, ignoreCase = true)) {
            cleanModel
        } else {
            "$cleanManufacturer $cleanModel"
        }
    }

    // Host State
    var isHosting by remember { mutableStateOf(false) }
    val isServerRunning by LanServer.isRunning.collectAsState()

    // Client State
    val isConnected by LanClient.isConnected.collectAsState()
    val peers by LanClient.peers.collectAsState()

    // Camera State
    var selectedCamera by remember { mutableStateOf("BACK") }

    // Join State
    val discoveredServices by remember { mutableStateOf(mutableListOf<NsdServiceInfo>()) }
    var manualIp by remember { mutableStateOf("") }
    var manualPort by remember { mutableStateOf("8080") }

    // Discovery
    val lanDiscovery = remember { LanDiscovery(context) }
    val services by lanDiscovery.discoveredServices.collectAsState()

    DisposableEffect(Unit) {
        onDispose {
            lanDiscovery.stopDiscovery()
            lanDiscovery.unregisterService()
            if (isHosting) {
                LanServer.stop()
            }
            LanClient.disconnect()
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
            title = "LAN Lobby (Native)",
            onBackClick = onBack,
        )

        Spacer(modifier = Modifier.height(16.dp))

        if (isConnected) {
            // LOBBY VIEW (Connected)
            LobbyView(
                peers = peers,
                deviceId = deviceId,
                isHost = isHosting,
                selectedCamera = selectedCamera,
                onCameraChange = { selectedCamera = it },
                onRoleChange = { role -> LanClient.sendRoleUpdate(role) },
                onDisconnect = {
                    LanClient.disconnect()
                    if (isHosting) {
                        LanServer.stop()
                        lanDiscovery.unregisterService()
                        isHosting = false
                    }
                },
                onEnterGame = { role ->
                    // For host, we use localhost. For client, we use the IP we connected to.
                    // Since LanClient is connected, we can just pass the params.
                    // Actually, LanClient is a singleton, so the game screen will use it.
                    // We just need to pass the initial connection params or just let GameScreen use the existing connection?
                    // The GameScreen currently creates a NEW connection or uses LanClient?
                    // Let's check GameScreen. It calls LanClient.connect if not connected.
                    // If we are already connected, we should probably just pass the current state.
                    // But GameScreen might re-init.
                    // For now, let's pass the IP/Port we used.
                    val ip = if (isHosting) "localhost" else manualIp // Need to persist connected IP
                    val port = if (isHosting) LanServer.activePort.toString() else manualPort
                    onNavigateToGame(ip, port, isHosting, role)
                },
            )
        } else {
            // SETUP VIEW
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = Color(0xFF1E1E1E),
                contentColor = Color.White,
            ) {
                Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("Host") })
                Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("Join") })
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Display device name (read-only)
            Text(
                text = "Device: $deviceName",
                color = Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
            )

            Spacer(modifier = Modifier.height(16.dp))

            if (selectedTab == 0) {
                // HOST TAB
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1E1E)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Host a Session", color = Color.White, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Start a WebSocket server on this device.",
                            color = Color.Gray,
                            fontSize = 14.sp,
                        )
                        Spacer(modifier = Modifier.height(16.dp))

                        Button(
                            onClick = {
                                scope.launch(Dispatchers.IO) {
                                    DebugLogger.log("Lobby", "Starting server...")
                                    val serverStarted = LanServer.startAndAwait("123")

                                    if (!serverStarted) {
                                        DebugLogger.log("Lobby", "Failed to start server!")
                                        return@launch
                                    }

                                    val actualPort = LanServer.activePort
                                    DebugLogger.log("Lobby", "Server is ready on port $actualPort!")
                                    DebugLogger.log("Lobby", "Registering service...")
                                    lanDiscovery.registerService(actualPort, "123")

                                    withContext(Dispatchers.Main) {
                                        isHosting = true
                                    }

                                    // Auto-connect host after server is ready
                                    DebugLogger.log("Lobby", "Auto-connecting host to port $actualPort...")
                                    LanClient.connect("127.0.0.1", actualPort, deviceId, deviceName)
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Start Server & Join")
                        }
                    }
                }
            } else {
                // JOIN TAB
                Column {
                    Button(
                        onClick = { lanDiscovery.startDiscovery() },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Scan for Hosts")
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text("Discovered Servers:", color = Color.White)
                    LazyColumn(
                        modifier =
                            Modifier
                                .height(150.dp)
                                .fillMaxWidth()
                                .background(Color(0xFF1E1E1E)),
                    ) {
                        items(services) { service ->
                            Row(
                                modifier =
                                    Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            val host = service.host
                                            val port = service.port
                                            if (host != null) {
                                                manualIp = host.hostAddress ?: ""
                                                manualPort = port.toString()
                                                LanClient.connect(manualIp, manualPort.toInt(), deviceId, deviceName)
                                            }
                                        }
                                        .padding(16.dp),
                            ) {
                                Text(service.serviceName, color = Color.White)
                            }
                            Divider(color = Color.Gray)
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text("Manual Connect:", color = Color.White)
                    OutlinedTextField(
                        value = manualIp,
                        onValueChange = { manualIp = it },
                        label = { Text("IP Address") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = manualPort,
                        onValueChange = { manualPort = it },
                        label = { Text("Port") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Button(
                        onClick = {
                            LanClient.connect(manualIp, manualPort.toInt(), deviceId, deviceName)
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = manualIp.isNotBlank(),
                    ) {
                        Text("Connect")
                    }
                }
            }
        }
            Spacer(modifier = Modifier.height(16.dp))
            
            // Debug Console
            DebugConsole(modifier = Modifier.weight(1f, fill = false))
    }
}

@Composable
fun LobbyView(
    peers: List<LanPeer>,
    deviceId: String,
    isHost: Boolean,
    selectedCamera: String,
    onCameraChange: (String) -> Unit,
    onRoleChange: (String) -> Unit,
    onDisconnect: () -> Unit,
    onEnterGame: (String) -> Unit,
) {
    Column {
        Text(
            text = "Connected Peers",
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
            items(peers) { peer ->
                LanPeerCard(
                    peer = peer,
                    isSelf = peer.id == deviceId,
                    onRoleChange = onRoleChange,
                    selectedCamera = selectedCamera,
                    onCameraChange = onCameraChange,
                )
                Spacer(modifier = Modifier.height(8.dp))
            }
        }

        val myPeer = peers.find { it.id == deviceId }
        val myRole = myPeer?.role ?: "UNASSIGNED"

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = onDisconnect,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                modifier = Modifier.weight(1f),
            ) {
                Text(if (isHost) "Stop Server" else "Disconnect")
            }

            Button(
                onClick = { onEnterGame(myRole) },
                enabled = myRole != "UNASSIGNED",
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                modifier = Modifier.weight(1f),
            ) {
                Text("Enter Game")
            }
        }
    }
}

@Composable
fun LanPeerCard(
    peer: LanPeer,
    isSelf: Boolean,
    onRoleChange: (String) -> Unit,
    selectedCamera: String = "BACK",
    onCameraChange: (String) -> Unit = {},
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
                    text = if (isSelf) "${peer.name} (You)" else peer.name,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = peer.role,
                    color =
                        when (peer.role) {
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
                    RoleButton("Start", "START_GATE", peer.role == "START_GATE") { onRoleChange("START_GATE") }
                    RoleButton("Split", "SPLIT_GATE", peer.role == "SPLIT_GATE") { onRoleChange("SPLIT_GATE") }
                    RoleButton("Finish", "FINISH_GATE", peer.role == "FINISH_GATE") { onRoleChange("FINISH_GATE") }
                }

                // Camera Selection
                Spacer(modifier = Modifier.height(12.dp))
                var expanded by remember { mutableStateOf(false) }
                val cameraOptions = listOf("BACK" to "Rear Camera", "FRONT" to "Front Camera")

                Column {
                    Text(
                        text = "Camera:",
                        color = Color.Gray,
                        fontSize = 12.sp,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Box {
                        OutlinedButton(
                            onClick = { expanded = true },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = Color.White,
                            ),
                        ) {
                            Text(cameraOptions.find { it.first == selectedCamera }?.second ?: "Rear Camera")
                            Spacer(modifier = Modifier.weight(1f))
                            Text("▼", fontSize = 10.sp)
                        }

                        androidx.compose.material3.DropdownMenu(
                            expanded = expanded,
                            onDismissRequest = { expanded = false },
                        ) {
                            cameraOptions.forEach { (value, label) ->
                                androidx.compose.material3.DropdownMenuItem(
                                    text = { Text(label) },
                                    onClick = {
                                        onCameraChange(value)
                                        expanded = false
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
