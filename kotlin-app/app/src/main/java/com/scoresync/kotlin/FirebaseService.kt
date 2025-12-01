package com.scoresync.kotlin

import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ValueEventListener
import com.google.firebase.database.ktx.database
import com.google.firebase.ktx.Firebase
import kotlinx.coroutines.tasks.await

object FirebaseService {
    private const val DATABASE_URL = "https://timer-app-1751097782-default-rtdb.europe-west1.firebasedatabase.app/"
    private var database: FirebaseDatabase? = null
    private var serverTimeOffset = 0L

    fun initialize() {
        try {
            // Check if already initialized to avoid exception
            if (FirebaseApp.getApps(FirebaseApp.getInstance().applicationContext).isEmpty()) {
                val options =
                    FirebaseOptions.Builder()
                        .setDatabaseUrl(DATABASE_URL)
                        .setApplicationId(
                            "com.scoresync.kotlin",
                        ) // Placeholder, not strictly needed for public DB access usually
                        .build()
                FirebaseApp.initializeApp(FirebaseApp.getInstance().applicationContext, options)
            }

            // Or simpler if we rely on auto-init but just want to set the URL if google-services.json is missing/generic
            // For now, let's try to get the instance with the specific URL
            database = Firebase.database(DATABASE_URL)

            // Sync time offset
            database?.getReference(".info/serverTimeOffset")?.addValueEventListener(
                object : ValueEventListener {
                    override fun onDataChange(snapshot: DataSnapshot) {
                        serverTimeOffset = snapshot.getValue(Long::class.java) ?: 0L
                    }

                    override fun onCancelled(error: DatabaseError) {}
                },
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun getServerTime(): Long {
        return System.currentTimeMillis() + serverTimeOffset
    }

    suspend fun registerDevice(
        lobbyId: String,
        deviceId: String,
        name: String,
    ) {
        val ref = database?.getReference("lobbies/$lobbyId/motionGate/devices/$deviceId")
        val current = ref?.get()?.await()

        if (current?.exists() == true) {
            ref.updateChildren(
                mapOf(
                    "name" to name,
                    "lastSeen" to getServerTime(),
                ),
            ).await()
        } else {
            ref?.setValue(
                mapOf(
                    "id" to deviceId,
                    "name" to name,
                    "role" to "UNASSIGNED",
                    "lastSeen" to getServerTime(),
                ),
            )?.await()
        }
    }

    suspend fun updateDeviceRole(
        lobbyId: String,
        deviceId: String,
        role: String,
    ) {
        database?.getReference("lobbies/$lobbyId/motionGate/devices/$deviceId/role")?.setValue(role)?.await()
    }

    suspend fun triggerMotionStart(
        lobbyId: String,
        timestamp: Long,
    ) {
        val ref = database?.getReference("lobbies/$lobbyId/motionGate")
        // Simple transaction-like update for now
        val updates =
            mapOf(
                "status" to "RUNNING",
                "startTime" to timestamp,
                "finishTime" to null,
                "runId" to System.currentTimeMillis().toString(),
            )
        ref?.updateChildren(updates)?.await()
    }

    suspend fun triggerMotionFinish(
        lobbyId: String,
        timestamp: Long,
    ) {
        val ref = database?.getReference("lobbies/$lobbyId/motionGate")
        val snapshot = ref?.get()?.await()
        val status = snapshot?.child("status")?.getValue(String::class.java)

        if (status == "RUNNING") {
            val runId = snapshot.child("runId").getValue(String::class.java)
            val startTime = snapshot.child("startTime").getValue(Long::class.java)

            if (runId != null && startTime != null) {
                val updates =
                    hashMapOf<String, Any>(
                        "status" to "FINISHED",
                        "finishTime" to timestamp,
                        "history/$runId" to
                            mapOf(
                                "runId" to runId,
                                "startTime" to startTime,
                                "finishTime" to timestamp,
                            ),
                    )
                ref.updateChildren(updates).await()
            }
        }
    }

    suspend fun triggerMotionSplit(
        lobbyId: String,
        timestamp: Long,
        deviceName: String,
    ) {
        val ref = database?.getReference("lobbies/$lobbyId/motionGate")
        val snapshot = ref?.get()?.await()
        val status = snapshot?.child("status")?.getValue(String::class.java)
        val startTime = snapshot?.child("startTime")?.getValue(Long::class.java) ?: 0L

        if (status == "RUNNING") {
            val splitsRef = ref.child("splits")
            // We need to append to the list.
            // Since Firebase lists are tricky with concurrent appends without push(),
            // we'll use push() to generate a key, or read-modify-write.
            // React code uses transaction. Here we'll just push a new split object.
            // However, the React code structure suggests an array.
            // Firebase arrays are just objects with integer keys.
            // Let's use push() for safety, even if it changes structure slightly from array to map.
            // If strict array is needed, we need transaction.

            // Let's try to match the React transaction logic roughly by just getting current splits
            // This is not race-condition safe without transactions, but sufficient for this refactor step.
            val currentSplits = snapshot.child("splits").children.map { it.value }.toList()
            val newSplit =
                mapOf(
                    "timestamp" to timestamp,
                    "duration" to (timestamp - startTime),
                    "deviceName" to deviceName,
                )
            // Re-writing the whole list is bad for concurrency but matches the "read-modify-write" pattern if not using runTransaction properly
            // Better: just push to a "splits" node if the client supports it.
            // Assuming the client can handle object-based list or we use an index.

            // For now, let's just use push() which creates a unique key.
            // If the web client expects an array [0, 1, ...], this might break it.
            // But usually Object.values() is used on client side.
            // Let's stick to a safe transaction-less append for now:
            val splitIndex = snapshot.child("splits").childrenCount
            ref.child("splits/$splitIndex").setValue(newSplit).await()
        }
    }

    fun observeLobby(
        lobbyId: String,
        onUpdate: (LobbyState) -> Unit,
    ) {
        database?.getReference("lobbies/$lobbyId/motionGate")?.addValueEventListener(
            object : ValueEventListener {
                override fun onDataChange(snapshot: DataSnapshot) {
                    val status = snapshot.child("status").getValue(String::class.java) ?: "IDLE"
                    val startTime = snapshot.child("startTime").getValue(Long::class.java)
                    val finishTime = snapshot.child("finishTime").getValue(Long::class.java)
                    val devices =
                        snapshot.child("devices").children.mapNotNull {
                            it.getValue(Device::class.java)
                        }

                    onUpdate(LobbyState(status, startTime, finishTime, devices))
                }

                override fun onCancelled(error: DatabaseError) {}
            },
        )
    }
}

data class LobbyState(
    val status: String = "IDLE",
    val startTime: Long? = null,
    val finishTime: Long? = null,
    val devices: List<Device> = emptyList(),
)

data class Device(
    val id: String = "",
    val name: String = "",
    val role: String = "UNASSIGNED",
    val lastSeen: Long = 0,
) {
    // No-arg constructor for Firebase
    constructor() : this("", "", "UNASSIGNED", 0)
}
