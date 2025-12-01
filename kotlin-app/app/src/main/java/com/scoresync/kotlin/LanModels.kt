package com.scoresync.kotlin

import kotlinx.serialization.Serializable

@Serializable
data class LanPeer(
    val id: String,
    val name: String,
    var role: String = "UNASSIGNED",
)

@Serializable
data class LanMessage(
    val type: String,
    val payload: String,
)
