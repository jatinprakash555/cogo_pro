package com.example.cogo

data class Message(val text: String, val isFromUser: Boolean, val metrics: String = "", val isStreaming: Boolean = false)
