package com.scoresync.kotlin

import android.util.Log
import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.websocket.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.*
import io.ktor.websocket.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.consumeEach
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.*
import kotlinx.serialization.json.*
import org.json.JSONObject

object LanClient {
    private val client =
        HttpClient(CIO) {
            install(WebSockets) {
                contentConverter = KotlinxWebsocketSerializationConverter(Json { ignoreUnknownKeys = true })
            }
        }

    private var session: DefaultClientWebSocketSession? = null
    private val _isConnected = MutableStateFlow(false)
    val isConnected = _isConnected.asStateFlow()

    // Game State from Server
    private val _gameState = MutableStateFlow(LobbyState())
    val gameState = _gameState.asStateFlow()

    // Lobby State
    private val _peers = MutableStateFlow<List<LanPeer>>(emptyList())
    val peers = _peers.asStateFlow()

    fun connect(
        ip: String,
        port: Int,
        deviceId: String,
        name: String,
    ) {
        DebugLogger.log("LanClient", "Connecting to $ip:$port as $name...")
        CoroutineScope(Dispatchers.IO).launch {
            var attempt = 0
            val maxAttempts = 5
            while (attempt < maxAttempts && !_isConnected.value) {
                try {
                    attempt++
                    DebugLogger.log("LanClient", "Connection attempt $attempt/$maxAttempts...")
                    val url = "ws://$ip:$port/ws"
                    DebugLogger.log("LanClient", "Dialing: $url")
                    client.webSocket(method = HttpMethod.Get, host = ip, port = port, path = "/ws") {
                        session = this
                        Log.d("LanClient", "WebSocket connected to $url")
                        DebugLogger.log("LanClient", "WebSocket connected to $url")

                        // Send JOIN message in the format the server expects
                        // Server expects: {"type": "JOIN", "deviceId": "...", "name": "..."}
                        val joinMsg = buildString {
                            append("{")
                            append("\"type\":\"JOIN\",")
                            append("\"deviceId\":\"$deviceId\",")
                            append("\"name\":\"$name\"")
                            append("}")
                        }
                        send(Frame.Text(joinMsg))
                        DebugLogger.log("LanClient", "Sent JOIN message")

                        // Only mark as connected after JOIN is sent successfully
                        _isConnected.value = true

                        try {
                            incoming.consumeEach { frame ->
                                if (frame is Frame.Text) {
                                    val text = frame.readText()
                                    handleMessage(text)
                                }
                            }
                        } catch (e: Exception) {
                            Log.e("LanClient", "Connection error", e)
                            DebugLogger.log("LanClient", "Connection error: ${e.message}")
                        } finally {
                            _isConnected.value = false
                            session = null
                            _peers.value = emptyList()
                        }
                    }
                } catch (e: Exception) {
                    Log.e("LanClient", "Failed to connect (attempt $attempt)", e)
                    DebugLogger.log("LanClient", "Failed to connect (attempt $attempt): ${e.javaClass.simpleName} - ${e.message}")
                    DebugLogger.log("LanClient", "Stack trace: ${e.stackTraceToString().take(500)}")
                    if (attempt < maxAttempts) {
                        DebugLogger.log("LanClient", "Retrying in 1 second...")
                        kotlinx.coroutines.delay(1000)
                    } else {
                        _isConnected.value = false
                        DebugLogger.log("LanClient", "Max connection attempts reached. Giving up.")
                    }
                }
            }
        }
    }

    fun disconnect() {
        CoroutineScope(Dispatchers.IO).launch {
            session?.close()
            session = null
            _isConnected.value = false
            _peers.value = emptyList()
        }
    }

    private fun handleMessage(message: String) {
        try {
            val json = Json { ignoreUnknownKeys = true }
            val msg = json.decodeFromString<LanMessage>(message)

            when (msg.type) {
                "STATE_UPDATE" -> {
                    val payload = json.decodeFromString<Map<String, String>>(msg.payload) // Simplified parsing
                    // Need to handle Longs correctly, manual JSON parsing might be safer for mixed types if not using a data class
                    // Reverting to JSONObject for mixed type payload or defining a StatePayload data class
                    // Let's use JSONObject for the state payload to be safe with mixed types (String/Long)
                    val jsonObj = JSONObject(msg.payload)
                    val status = jsonObj.getString("status")
                    val startTime =
                        if (jsonObj.has("startTime") && !jsonObj.isNull("startTime")) {
                            jsonObj.getLong(
                                "startTime",
                            )
                        } else {
                            null
                        }
                    val finishTime =
                        if (jsonObj.has("finishTime") && !jsonObj.isNull("finishTime")) {
                            jsonObj.getLong(
                                "finishTime",
                            )
                        } else {
                            null
                        }

                    _gameState.value =
                        LobbyState(
                            status = status,
                            startTime = startTime,
                            finishTime = finishTime,
                        )
                }
                "LOBBY_UPDATE" -> {
                    val newPeers = json.decodeFromString<List<LanPeer>>(msg.payload)
                    _peers.value = newPeers
                }
            }
        } catch (e: Exception) {
            Log.e("LanClient", "Error parsing message", e)
        }
    }

    fun sendStart() {
        sendMessage(LanMessage("START", ""))
    }

    fun sendFinish() {
        sendMessage(LanMessage("FINISH", ""))
    }

    fun sendRoleUpdate(role: String) {
        val payload = Json.encodeToString(mapOf("role" to role))
        sendMessage(LanMessage("ROLE_UPDATE", payload))
    }

    private fun sendMessage(msg: LanMessage) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val json = Json.encodeToString(msg)
                session?.send(Frame.Text(json))
            } catch (e: Exception) {
                Log.e("LanClient", "Error sending message", e)
            }
        }
    }
}
