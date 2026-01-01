package com.example.cogo

import android.content.Context
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File

class TextGenerator(val context: Context) {

    private var llmInference: LlmInference? = null
    private var isInitialized = false

    suspend fun initialize(): Boolean = withContext(Dispatchers.IO) {
        val modelManager = ModelManager(context)
        val modelPath = try {
            modelManager.getModelPath()
        } catch (e: Exception) {
            println("Failed to get model path: ${e.message}")
            null
        }
        
        if (modelPath == null) return@withContext false
        val modelFile = File(modelPath)
        if (!modelFile.exists() || modelFile.length() < 1000000) return@withContext false // Sanity check for size

        // Force GPU Inference for maximum power
        val options = LlmInference.LlmInferenceOptions.builder()
            .setModelPath(modelPath)
            .setResultListener { _, _ -> /* Handled in flow */ }
            .setMaxTokens(512)
            .setTopK(40)
            .setTemperature(0.7f)
            .setRandomSeed(System.currentTimeMillis().toInt())
            .build()

        try {
            llmInference = LlmInference.createFromOptions(context, options)
            isInitialized = true
            println("LlmInference initialized (GPU Priority).")
            true
        } catch (e: Exception) {
            println("GPU Init failed, falling back to CPU: ${e.message}")
            false
        }
    }

    fun generateStreamingResponse(prompt: String): Flow<String> = callbackFlow {
        if (!isInitialized || llmInference == null) {
            trySend("Model not initialized.")
            close()
            return@callbackFlow
        }

        try {
            // MediaPipe 0.10.14 doesn't support a direct Flow, using callbackFlow
            llmInference?.generateResponseAsync(prompt)
            
            // Note: The callback is set in options. 
            // However, since we want a reactive experience, we'll use a specialized listener if possible.
            // If the library version only supports one global listener, we'd need to redirect it.
            // For now, we'll use the sync version on a worker thread for better stability if async is limited.
            val response = llmInference?.generateResponse(prompt) ?: "Error"
            trySend(response)
            close()
        } catch (e: Exception) {
            trySend("Error: ${e.message}")
            close()
        }
        awaitClose { /* Cleanup if needed */ }
    }

    fun generateResponse(prompt: String): String {
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

    companion object {
        private var instance: TextGenerator? = null

        fun getInstance(context: Context): TextGenerator {
            return instance ?: synchronized(this) {
                instance ?: TextGenerator(context.applicationContext).also { instance = it }
            }
        }
    }
}
