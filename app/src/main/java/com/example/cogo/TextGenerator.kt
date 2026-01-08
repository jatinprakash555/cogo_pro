package com.example.cogo

import android.content.Context
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import java.io.File
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class TextGenerator(val context: Context) {

    private val generatorScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var llmInference: LlmInference? = null
    private var isInitialized = false

    private val _partialResults = kotlinx.coroutines.flow.MutableSharedFlow<String>(replay = 0, extraBufferCapacity = 100)
    private val initMutex = Mutex()

    // Shared Listener Logic (Class Level Helper)
    private fun emitPartialResult(partialResult: String, done: Boolean) {
         generatorScope.launch {
             _partialResults.emit(partialResult)
             if (done) _partialResults.emit("<EOS>")
         }
    }
    
    suspend fun initialize(): Boolean = initMutex.withLock {
        withContext(Dispatchers.IO) {
            if (isInitialized && llmInference != null) {
                android.util.Log.i("CogoPro", "Model already initialized, skipping.")
                return@withContext true
            }

            // Close old instance if exists to release memory
            try {
                llmInference?.close()
                llmInference = null
            } catch (e: Exception) {
                android.util.Log.e("CogoPro", "Error closing old model", e)
            }

            val modelManager = ModelManager(context)
            val modelPath = try {
                modelManager.getModelPath()
            } catch (e: Exception) {
                android.util.Log.e("CogoPro", "Failed to get model path", e)
                null
            }
            
            if (modelPath == null) {
                android.util.Log.e("CogoPro", "Model path is null")
                return@withContext false
            }
            
            val modelFile = File(modelPath)
            if (!modelFile.exists() || modelFile.length() < 1000000) {
                android.util.Log.e("CogoPro", "Model file invalid: ${modelFile.exists()} / ${modelFile.length()}")
                return@withContext false
            }

            // Stage 1: Try GPU (High Performance)
            try {
                android.util.Log.i("CogoPro", "Attempting GPU Initialization (Android 15 Comp)...")
                val options = LlmInference.LlmInferenceOptions.builder()
                    .setModelPath(modelPath)
                    .setMaxTokens(1024)
                    .build()
                
                withTimeout(8000) { // Increased timeout for slower initializations
                    llmInference = LlmInference.createFromOptions(context, options)
                }
                
                isInitialized = true
                android.util.Log.i("CogoPro", "Success: GPU Initialized.")
                return@withContext true
            } catch (e: Exception) {
                android.util.Log.w("CogoPro", "GPU Init failed: ${e.message}. Cleaning up...")
                // CRITICAL: Explicitly release partial allocations before switching to CPU
                llmInference?.close()
                llmInference = null
                
                // Stability Delay: Allow driver to reclaim memory on Snapdragon
                android.util.Log.i("CogoPro", "Waiting for driver buffer release...")
                kotlinx.coroutines.delay(1000) 
            }

            // Stage 2: Universal Fallback (CPU)
            try {
                android.util.Log.i("CogoPro", "Attempting Universal CPU Initialization...")
                val options = LlmInference.LlmInferenceOptions.builder()
                    .setModelPath(modelPath)
                    .setMaxTokens(1024)
                    .setPreferredBackend(LlmInference.Backend.CPU)
                    .build()
                
                llmInference = LlmInference.createFromOptions(context, options)
                
                isInitialized = true
                android.util.Log.i("CogoPro", "Success: CPU Initialized (Universal Mode).")
                return@withContext true
            } catch (e: Exception) {
                android.util.Log.e("CogoPro", "Model Init Failed Entirely: ${e.message}")
                return@withContext false
            }
        }
    }

    fun generateStreamingResponse(prompt: String): Flow<String> = flow {
        if (!isInitialized || llmInference == null) {
            emit("Model not initialized.")
            return@flow
        }

        try {
            // Trigger async generation with listener
            llmInference?.generateResponseAsync(prompt) { partial: String, done: Boolean -> 
                emitPartialResult(partial, done) 
            }
            
            // Collect from the shared flow until EOS
            _partialResults.collect { token ->
                if (token == "<EOS>") {
                    throw kotlinx.coroutines.CancellationException("EOS")
                }
                emit(token)
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            // Normal end
        } catch (e: Exception) {
            emit("Error: ${e.message}")
        }
    }

    fun generateResponse(prompt: String): String {
        // Keeps sync support if needed, but we prefer streaming now
        if (!isInitialized || llmInference == null) return "Model not initialized."
        return try {
            llmInference?.generateResponse(prompt) ?: "Generation failed."
        } catch (e: Exception) {
            "Error: ${e.message}"
        }
    }

    /**
     * Parses an action directive from a bot response.
     * Expected format: ACTION[{"type": "launch", "package": "..."}]
     */
    fun parseActionIntent(response: String): JSONObject? {
        val start = response.indexOf("ACTION[")
        if (start == -1) return null
        val end = response.indexOf("]", start)
        if (end == -1) return null
        
        val jsonStr = response.substring(start + 7, end)
        return try {
            JSONObject(jsonStr)
        } catch (e: Exception) {
            null
        }
    }



}
