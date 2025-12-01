package com.scoresync.kotlin

import android.util.Log
import io.ktor.serialization.kotlinx.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.*
import kotlinx.serialization.json.*
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap
import org.json.JSONObject
import java.net.ServerSocket
import java.net.BindException

object LanServer {
    private const val DEFAULT_PORT = 8080
    private val PORT_CANDIDATES = listOf(8080, 8081, 8082, 8083, 8084)
    private var server: NettyApplicationEngine? = null

    // Track the actual port being used
    private var currentPort: Int = DEFAULT_PORT

    private val _isRunning = MutableStateFlow(false)
    val isRunning = _isRunning.asStateFlow()

    // NEW: Indicates server is actually ready to accept connections
    private val _isReady = MutableStateFlow(false)
    val isReady = _isReady.asStateFlow()

    // Mutex to prevent concurrent start/stop operations
    private val serverMutex = Mutex()

    // Expose current port for clients
    val activePort: Int
        get() = currentPort

    private val sessions = Collections.synchronizedMap(HashMap<WebSocketSession, String>())

    /**
     * Check if a port is available by attempting to bind to it
     */
    private fun isPortAvailable(port: Int): Boolean {
        return try {
            ServerSocket(port).use { true }
        } catch (e: BindException) {
            false
        } catch (e: Exception) {
            false
        }
    }
    private val peers = ConcurrentHashMap<String, LanPeer>()

    private var lobbyId = "123"
    private var status = "IDLE"
    private var startTime: Long? = null
    private var finishTime: Long? = null

    /**
     * Starts the server and suspends until it's ready to accept connections.
     * Returns true if successful, false otherwise.
     */
    suspend fun startAndAwait(lobbyId: String): Boolean = serverMutex.withLock {
        DebugLogger.log("LanServer", "Starting server (Lobby: $lobbyId)...")

        if (_isRunning.value && _isReady.value) {
            DebugLogger.log("LanServer", "Server already running on port $currentPort")
            return true
        }

        // Stop any existing server instance first
        stopInternal()

        // Give the port time to be released - increased to 1.5 seconds
        delay(1500)

        // Find an available port from candidates
        var availablePort: Int? = null
        for (port in PORT_CANDIDATES) {
            DebugLogger.log("LanServer", "Checking if port $port is available...")
            if (isPortAvailable(port)) {
                availablePort = port
                DebugLogger.log("LanServer", "Port $port is available - using it")
                break
            } else {
                DebugLogger.log("LanServer", "Port $port is in use, trying next...")
            }
        }

        if (availablePort == null) {
            DebugLogger.log("LanServer", "ERROR: No available ports found in range ${PORT_CANDIDATES.first()}-${PORT_CANDIDATES.last()}")
            return false
        }

        currentPort = availablePort
        this.lobbyId = lobbyId

        return try {
            DebugLogger.log("LanServer", "Creating embedded server on port $currentPort...")

            server = embeddedServer(Netty, port = currentPort, host = "0.0.0.0") {
                install(WebSockets) {
                    pingPeriod = java.time.Duration.ofSeconds(15)
                    timeout = java.time.Duration.ofSeconds(15)
                    maxFrameSize = Long.MAX_VALUE
                    masking = false
                    contentConverter = KotlinxWebsocketSerializationConverter(Json { ignoreUnknownKeys = true })
                }
                routing {
                    webSocket("/ws") {
                        handleWebSocketSession(this)
                    }
                }
            }

            DebugLogger.log("LanServer", "Starting Netty server...")
            server?.start(wait = false)

            // Wait for the server to actually be listening
            delay(500)

            // Verify the server is running
            if (server?.application != null) {
                _isRunning.value = true
                _isReady.value = true
                DebugLogger.log("LanServer", "Server started successfully on port $currentPort")
                true
            } else {
                DebugLogger.log("LanServer", "Server failed to initialize properly")
                stopInternal()
                false
            }
        } catch (e: Exception) {
            Log.e("LanServer", "Failed to start server", e)
            DebugLogger.log("LanServer", "Failed to start server: ${e.javaClass.simpleName} - ${e.message}")
            stopInternal()
            false
        }
    }

    /**
     * Legacy non-blocking start - fires and forgets
     * Clients should wait for isReady before connecting
     */
    fun start(lobbyId: String) {
        CoroutineScope(Dispatchers.IO).launch {
            startAndAwait(lobbyId)
        }
    }

    /**
     * Suspends until the server is ready or timeout occurs
     */
    suspend fun awaitReady(timeoutMs: Long = 5000): Boolean {
        return try {
            withTimeout(timeoutMs) {
                isReady.first { it }
                true
            }
        } catch (e: TimeoutCancellationException) {
            DebugLogger.log("LanServer", "Timeout waiting for server to be ready")
            false
        }
    }

    fun stop() {
        CoroutineScope(Dispatchers.IO).launch {
            serverMutex.withLock {
                stopInternal()
            }
        }
    }

    suspend fun stopAndAwait() {
        serverMutex.withLock {
            stopInternal()
        }
    }

    private suspend fun stopInternal() {
        DebugLogger.log("LanServer", "Stopping server...")
        _isReady.value = false

        try {
            server?.stop(1000, 2000)
        } catch (e: Exception) {
            DebugLogger.log("LanServer", "Error stopping server: ${e.message}")
        }

        server = null
        _isRunning.value = false
        sessions.clear()
        peers.clear()

        // Give OS time to release the port - increased to 1 second
        delay(1000)
        DebugLogger.log("LanServer", "Server stopped")
    }

    private suspend fun handleWebSocketSession(session: DefaultWebSocketServerSession) {
        try {
            DebugLogger.log("LanServer", "New WebSocket connection request...")

            // Wait for JOIN message with timeout
            val frame = withTimeoutOrNull(10000) {
                session.incoming.receive()
            }

            if (frame == null) {
                DebugLogger.log("LanServer", "Timeout waiting for JOIN message")
                session.close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Timeout"))
                return
            }

            if (frame !is Frame.Text) {
                DebugLogger.log("LanServer", "ERROR: First message was not a text frame")
                session.close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Expected text frame"))
                return
            }

            val text = frame.readText()
            DebugLogger.log("LanServer", "Received initial message: $text")
            val json = JSONObject(text)
            val type = json.optString("type")

            if (type != "JOIN") {
                DebugLogger.log("LanServer", "ERROR: Expected JOIN message but got type: $type")
                session.close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Expected JOIN message"))
                return
            }

            if (!json.has("deviceId") || !json.has("name")) {
                DebugLogger.log("LanServer", "ERROR: JOIN message missing deviceId or name fields")
                session.close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Invalid JOIN message"))
                return
            }

            val deviceId = json.getString("deviceId")
            val name = json.getString("name")
            val peer = LanPeer(deviceId, name, "UNASSIGNED")

            peers[deviceId] = peer
            sessions[session] = deviceId
            broadcastLobbyState()
            DebugLogger.log("LanServer", "Peer joined successfully: $name ($deviceId)")

            try {
                for (incomingFrame in session.incoming) {
                    if (incomingFrame is Frame.Text) {
                        val msg = incomingFrame.readText()
                        handleMessage(session, msg)
                    }
                }
            } catch (e: Exception) {
                DebugLogger.log("LanServer", "Error in message loop: ${e.message}")
            } finally {
                peers.remove(deviceId)
                sessions.remove(session)
                broadcastLobbyState()
                DebugLogger.log("LanServer", "Peer disconnected: $name")
            }
        } catch (e: Exception) {
            DebugLogger.log("LanServer", "WebSocket error: ${e.javaClass.simpleName} - ${e.message}")
        }
    }

    private suspend fun broadcast(message: String) {
        val sessionsCopy = sessions.keys.toList()
        sessionsCopy.forEach { session ->
            try {
                session.send(Frame.Text(message))
            } catch (e: Exception) {
                DebugLogger.log("LanServer", "Failed to send to session: ${e.message}")
            }
        }
    }

    private suspend fun handleMessage(
        session: WebSocketSession,
        text: String,
    ) {
        try {
            // First check if this is a JOIN message (flat format)
            val jsonCheck = JSONObject(text)
            if (jsonCheck.optString("type") == "JOIN" && jsonCheck.has("deviceId")) {
                DebugLogger.log("LanServer", "Ignoring JOIN message in message loop (already handled)")
                return
            }

            val json = Json { ignoreUnknownKeys = true }
            val msg = json.decodeFromString<LanMessage>(text)

            when (msg.type) {
                "ROLE_UPDATE" -> {
                    val deviceId = sessions[session]
                    if (deviceId != null) {
                        val rolePayload = json.decodeFromString<Map<String, String>>(msg.payload)
                        val newRole = rolePayload["role"] ?: "UNASSIGNED"
                        peers[deviceId]?.role = newRole
                        broadcastLobbyState()
                    }
                }
                "START" -> {
                    status = "RUNNING"
                    startTime = System.currentTimeMillis()
                    finishTime = null
                    broadcastGameState()
                }
                "FINISH" -> {
                    if (status == "RUNNING") {
                        status = "FINISHED"
                        finishTime = System.currentTimeMillis()
                        broadcastGameState()
                    }
                }
                "RESET" -> {
                    status = "IDLE"
                    startTime = null
                    finishTime = null
                    broadcastGameState()
                }
            }
        } catch (e: Exception) {
            Log.e("LanServer", "Message handling error: $text", e)
        }
    }

    private suspend fun broadcastLobbyState() {
        val peerList = peers.values.toList()
        val payload = Json.encodeToString(peerList)
        val msg = Json.encodeToString(LanMessage("LOBBY_UPDATE", payload))
        broadcast(msg)
    }

    private suspend fun broadcastGameState() {
        val state =
            mapOf(
                "status" to status,
                "startTime" to (startTime ?: 0L),
                "finishTime" to (finishTime ?: 0L),
            )
        val payload = Json.encodeToString(state)
        val msg = Json.encodeToString(LanMessage("STATE_UPDATE", payload))
        broadcast(msg)
    }

    private suspend fun sendGameState(session: WebSocketSession) {
        val state =
            mapOf(
                "status" to status,
                "startTime" to (startTime ?: 0L),
                "finishTime" to (finishTime ?: 0L),
            )
        val payload = Json.encodeToString(state)
        val msg = Json.encodeToString(LanMessage("STATE_UPDATE", payload))
        session.send(Frame.Text(msg))
    }

    // Local triggers
    fun triggerStart() {
        CoroutineScope(Dispatchers.IO).launch {
            status = "RUNNING"
            startTime = System.currentTimeMillis()
            finishTime = null
            broadcastGameState()
        }
    }

    fun triggerFinish() {
        CoroutineScope(Dispatchers.IO).launch {
            if (status == "RUNNING") {
                status = "FINISHED"
                finishTime = System.currentTimeMillis()
                broadcastGameState()
            }
        }
    }

    // Host self-registration
    fun registerHost(
        deviceId: String,
        name: String,
    ) {
        peers[deviceId] = LanPeer(deviceId, name, "UNASSIGNED")
        CoroutineScope(Dispatchers.IO).launch {
            broadcastLobbyState()
        }
    }

    fun updateHostRole(
        deviceId: String,
        role: String,
    ) {
        peers[deviceId]?.role = role
        CoroutineScope(Dispatchers.IO).launch {
            broadcastLobbyState()
        }
    }
}
