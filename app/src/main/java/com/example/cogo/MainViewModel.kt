package com.example.cogo

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.cogo.db.ChatMessage
import com.example.cogo.db.ChatSession
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.launchIn

class MainViewModel(
    private val repository: ChatRepository,
    private val ragRepository: RAGRepository
) : ViewModel() {

    private val _currentSessionId = MutableStateFlow<Long?>(null)
    val currentSessionId = _currentSessionId.asStateFlow()

    private val _isInitializing = MutableStateFlow(true)
    val isInitializing = _isInitializing.asStateFlow()

    private val _isThinking = MutableStateFlow(false)
    val isThinking = _isThinking.asStateFlow()

    enum class ModelStatus { NOT_FOUND, DOWNLOADING, READY, ERROR }
    private val _modelStatus = MutableStateFlow(ModelStatus.NOT_FOUND)
    val modelStatus = _modelStatus.asStateFlow()

    private val _prepareStatusText = MutableStateFlow("Cogo is preparing...")
    val prepareStatusText = _prepareStatusText.asStateFlow()

    private val _attachedFiles = MutableStateFlow<List<String>>(emptyList())
    val attachedFiles = _attachedFiles.asStateFlow()

    val allSessions: StateFlow<List<ChatSession>> = repository.allSessions.stateIn(
        viewModelScope, SharingStarted.Lazily, emptyList()
    )

    private val systemPrompt = """You are Cogo, a LOCAL and OFFLINE AI companion running on a mobile device.
Your Reality:
1. No Internet: You cannot check real-time weather, news, or book services online.
2. Local Knowledge: You use provided Document Snippets (RAG) and your internal weights to answer.
3. Memory: You remember user facts locally.
4. Automation: You can LAUNCH apps on this phone if asked. Use: ACTION[{"type": "launch", "package": "com.package.name"}]

Goal: Be a helpful, honest companion. If asked for something you cannot do (like booking a flight), explain that you are an offline assistant and offer to open a relevant app instead."""

    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    init {
        // Collect messages for current session
        _currentSessionId
            .filterNotNull()
            .flatMapLatest { id -> repository.getMessagesForSession(id) }
            .onEach { _messages.value = it }
            .launchIn(viewModelScope)

        // Initial setup
        initializeModelIfNeeded()
    }

    fun selectSession(id: Long) {
        _currentSessionId.value = id
    }

    private var initJob: kotlinx.coroutines.Job? = null

    private fun initializeModelIfNeeded() {
        if (initJob?.isActive == true) return
        
        initJob = viewModelScope.launch {
            try {
                val modelManager = ModelManager(repository.textGenerator.context)
                val path = modelManager.getModelPath()
                val embeddingPath = modelManager.getEmbeddingModelPath()

                if (path == null || embeddingPath == null) {
                    _modelStatus.value = ModelStatus.DOWNLOADING
                    
                    val progressJob = launch {
                        modelManager.downloadProgress.collect { progress ->
                            _downloadProgress.value = progress
                        }
                    }
                    
                    val result = modelManager.startDownload()
                    progressJob.cancel()
                    
                    if (result != null) {
                        initializeWithShaderSimulation()
                    } else {
                        _modelStatus.value = ModelStatus.ERROR
                    }
                } else {
                    initializeWithShaderSimulation()
                }
            } finally {
                _isInitializing.value = false
            }
        }
    }

    private val _downloadProgress = MutableStateFlow(0f)
    val downloadProgress = _downloadProgress.asStateFlow()

    fun startNewSession(title: String = "New Chat") {
        viewModelScope.launch {
            val id = repository.createNewSession(title)
            _currentSessionId.value = id
            // initializeModelIfNeeded() is already called in VM init
        }
    }

    private suspend fun initializeWithShaderSimulation() {
         // Simulate Shader Loading / Optimization for the user experience
         _prepareStatusText.value = "Compiling Neural Shaders..."
         delay(800)
         _prepareStatusText.value = "Optimizing Compute Graph..."
         delay(1200)

         val success = repository.textGenerator.initialize()
         val ragSuccess = ragRepository.initializeEmbedder() // Ensure loaded
         
         if (success) {
              _prepareStatusText.value = "Cogo is Ready"
             _modelStatus.value = ModelStatus.READY
         } else {
             _modelStatus.value = ModelStatus.ERROR
         }
    }

    fun addDocument(uri: android.net.Uri, filename: String) {
        android.util.Log.i("CogoPro", "ViewModel: addDocument called for $filename")
        viewModelScope.launch {
            _isThinking.value = true
            try {
                ragRepository.addDocument(uri, filename)
                _attachedFiles.value = _attachedFiles.value + filename
                android.util.Log.i("CogoPro", "ViewModel: addDocument success")
                
                // Add a confirmation message from Cogo
                val sessionId = _currentSessionId.value
                if (sessionId != null) {
                    val confirmMsg = ChatMessage(
                        text = "I've successfully processed and added '$filename' to my knowledge base. You can now ask me questions about its content! 📚",
                        isFromUser = false,
                        sessionId = sessionId,
                        metrics = "Knowledge Indexed"
                    )
                    repository.saveMessage(confirmMsg)
                }
            } catch (e: Exception) {
                android.util.Log.e("CogoPro", "ViewModel: addDocument failed", e)
                e.printStackTrace()
            } finally {
                _isThinking.value = false
            }
        }
    }

    fun sendMessage(text: String) {
        val sessionId = _currentSessionId.value ?: return
        viewModelScope.launch {
            // 1. Save and show User message
            val userMsg = ChatMessage(text = text, isFromUser = true, sessionId = sessionId)
            repository.saveMessage(userMsg)

            // 2. Placeholder Bot Message for Streaming
            var botMsg = ChatMessage(text = "...", isFromUser = false, sessionId = sessionId, isStreaming = true)
            val msgId = repository.saveMessage(botMsg)
            botMsg = botMsg.copy(id = msgId) // Update with ID

            _isThinking.value = true
            val startTime = System.currentTimeMillis()
            var tokenCount = 0

            try {
                // 1. Get Memory Context
                val memoryContext = repository.getMemoryContext()
                
                // 2. Get RAG Context
                android.util.Log.i("CogoPro", "ViewModel: Retrieving context for query: '$text'")
                val ragContext = ragRepository.retrieveRelevantContext(text)
                android.util.Log.i("CogoPro", "ViewModel: Retrieved context length: ${ragContext.length}")
                
                val contextBlock = if (ragContext.isNotBlank()) "Checked Documents:\n$ragContext\n" else ""
                val fullSystemPrompt = "$systemPrompt\nMemory: $memoryContext"
                val userPromptWithContext = if (ragContext.isNotBlank()) {
                    "RAG CONTEXT:\n$ragContext\n\nQUERY: $text"
                } else {
                    text
                }

                val sb = StringBuilder()
                
                repository.generateStreamingResponse(userPromptWithContext, fullSystemPrompt, _messages.value)
                    .collect { token ->
                        sb.append(token)
                        tokenCount++
                        
                        val elapsed = (System.currentTimeMillis() - startTime) / 1000f
                        val tps = if (elapsed > 0) tokenCount / elapsed else 0f
                        
                        // Update UI periodically (every ~300ms or so would be better, but for now we stream)
                        // In a real app, debounce this db update. 
                        // For this "Glorified UI", we want smooth updates. 
                        // We will update the state directly if possible, but Repository is DB source.
                        // We'll update DB every few tokens to avoid spamming.
                        
                        if (tokenCount % 3 == 0) {
                            val metrics = String.format("⚡ %.1f t/s | %d tokens | ⏱️ %.1fs", tps, tokenCount, elapsed)
                            repository.updateMessage(msgId, sb.toString(), metrics)
                        }
                    }
                
                // Final Update
                val elapsed = (System.currentTimeMillis() - startTime) / 1000f
                val tps = if (elapsed > 0) tokenCount / elapsed else 0f
                val finalMetrics = String.format("⚡ %.1f t/s | %d tokens | ⏱️ %.1fs | EOS", tps, tokenCount, elapsed)
                
                repository.updateMessage(msgId, sb.toString(), finalMetrics, isStreaming = false)
                
                // 3. Process memory extraction (Async)
                repository.processMemory(text, sb.toString())
            } catch (e: Exception) {
                repository.updateMessage(msgId, "Error: ${e.message}", "Error")
            } finally {
                _isThinking.value = false
            }
        }
    }
}

class MainViewModelFactory(
    private val repository: ChatRepository,
    private val ragRepository: RAGRepository
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(MainViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return MainViewModel(repository, ragRepository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
