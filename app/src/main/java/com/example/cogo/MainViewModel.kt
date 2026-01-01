package com.example.cogo

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.cogo.db.ChatMessage
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch

class MainViewModel(private val repository: ChatRepository) : ViewModel() {

    private val _currentSessionId = MutableStateFlow<Long?>(null)
    val currentSessionId = _currentSessionId.asStateFlow()

    private val _isInitializing = MutableStateFlow(true)
    val isInitializing = _isInitializing.asStateFlow()

    private val _isThinking = MutableStateFlow(false)
    val isThinking = _isThinking.asStateFlow()

    enum class ModelStatus { NOT_FOUND, DOWNLOADING, READY, ERROR }
    private val _modelStatus = MutableStateFlow(ModelStatus.NOT_FOUND)
    val modelStatus = _modelStatus.asStateFlow()

    private val systemPrompt = """You are Cogo, an advanced Mobile Agent.
Your Core Directives:
1. Growing Memory: Extract key facts about the user and store them mentally.
2. Automation: When asked to perform a mobile task (e.g., "Open WhatsApp"), output your response in this format: ACTION[{"type": "launch", "package": "com.whatsapp"}]
3. Personality: Professional, efficient, and proactive. Use the user's stored preferences to personalize every interaction.
4. Privacy: Only perform actions clearly requested or logically required for the task."""

    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    init {
        // Simple observation logic
        viewModelScope.launch {
            _currentSessionId.collect { id ->
                if (id != null) {
                    repository.getMessagesForSession(id).collect {
                        _messages.value = it
                    }
                }
            }
        }
    }

    private val _downloadProgress = MutableStateFlow(0f)
    val downloadProgress = _downloadProgress.asStateFlow()

    fun startNewSession(title: String = "New Chat") {
        viewModelScope.launch {
            _isInitializing.value = true
            val id = repository.createNewSession(title)
            _currentSessionId.value = id
            
            val modelManager = ModelManager(repository.textGenerator.context)
            val path = modelManager.getModelPath()
            
            if (path == null) {
                _modelStatus.value = ModelStatus.DOWNLOADING
                // Trigger download observation
                val downloadJob = launch {
                    modelManager.downloadProgress.collect { progress ->
                        _downloadProgress.value = progress
                    }
                }
                
                val pathResult = modelManager.startDownload()
                downloadJob.cancel()
                
                if (pathResult != null) {
                    val success = repository.textGenerator.initialize()
                    _modelStatus.value = if (success) ModelStatus.READY else ModelStatus.ERROR
                } else {
                    _modelStatus.value = ModelStatus.ERROR
                }
            } else {
                val success = repository.textGenerator.initialize()
                _modelStatus.value = if (success) ModelStatus.READY else ModelStatus.ERROR
            }
            
            _isInitializing.value = false
        }
    }

    fun sendMessage(text: String) {
        val sessionId = _currentSessionId.value ?: return
        viewModelScope.launch {
            // 1. Save and show User message
            val userMsg = ChatMessage(text = text, isFromUser = true, sessionId = sessionId)
            repository.saveMessage(userMsg)

            // 2. Set thinking state
            _isThinking.value = true

            try {
                // 1. Get Memory Context
                val memoryContext = repository.getMemoryContext()
                
                // 2. Combine system prompt + memory + prompt
                val fullPrompt = "$systemPrompt\nMemory: $memoryContext\nUser: $text"
                val response = repository.generateResponse(text, "$systemPrompt\n$memoryContext")
                
                val botMsg = ChatMessage(text = response, isFromUser = false, sessionId = sessionId)
                repository.saveMessage(botMsg)
                
                // 3. Process memory extraction
                repository.processMemory(text, response)
            } catch (e: Exception) {
                repository.saveMessage(ChatMessage(text = "Error: ${e.message}", isFromUser = false, sessionId = sessionId))
            } finally {
                _isThinking.value = false
            }
        }
    }
}

class MainViewModelFactory(private val repository: ChatRepository) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(MainViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return MainViewModel(repository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
