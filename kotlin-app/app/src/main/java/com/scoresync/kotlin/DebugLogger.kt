package com.scoresync.kotlin

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class LogEntry(
    val timestamp: Long,
    val tag: String,
    val message: String
) {
    private val dateFormat = SimpleDateFormat("HH:mm:ss.SSS", Locale.getDefault())

    val formattedTime: String
        get() = dateFormat.format(Date(timestamp))
}

object DebugLogger {
    private val _logs = MutableStateFlow<List<LogEntry>>(emptyList())
    val logs = _logs.asStateFlow()
    private val logScope = CoroutineScope(Dispatchers.Default)

    fun log(tag: String, message: String) {
        // Run logging in a separate coroutine to avoid blocking the calling thread
        logScope.launch {
            val entry = LogEntry(System.currentTimeMillis(), tag, message)
            _logs.value = _logs.value + entry
            // Keep only last 100 logs to avoid memory issues
            if (_logs.value.size > 100) {
                _logs.value = _logs.value.takeLast(100)
            }
            android.util.Log.d(tag, message)
        }
    }

    fun clear() {
        _logs.value = emptyList()
    }
}
