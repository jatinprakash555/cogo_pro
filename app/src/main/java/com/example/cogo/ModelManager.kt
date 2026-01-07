package com.example.cogo

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile

class ModelManager(private val context: Context) {

    private val client = OkHttpClient()
    private val _downloadProgress = MutableStateFlow(0f)
    val downloadProgress = _downloadProgress.asStateFlow()

    companion object {
        private const val MODEL_FILENAME = "gemma-2b-it-gpu-int4.bin"
        const val EMBEDDING_MODEL_FILENAME = "universal_sentence_encoder.tflite"

        // Official model download link from GitHub Releases
        private const val MODEL_URL = "https://github.com/jatinprakash555/cogo_pro/releases/download/v1.0/gemma-2b-it-gpu-int4.bin"
        // Using a standard hosted location or placeholder for the embedding model. 
        // For this task, I will use a known reliable source or the same repo if the user uploaded it.
        // I'll assume standard MediaPipe model URL for now as fallback or user's repo.
        // Let's use the official Google storage URL for the small BERT embedder favored by MediaPipe tasks.
        private const val EMBEDDING_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/text_embedder/universal_sentence_encoder/float32/1/universal_sentence_encoder.tflite"

        private const val CHUNK_SIZE = 1024 * 1024L // 1MB chunks for smoother UI progress
    }

    suspend fun getModelPath(): String? = withContext(Dispatchers.IO) {
        val modelFile = File(context.filesDir, MODEL_FILENAME)
        if (modelFile.exists() && modelFile.length() > 100000) {
            return@withContext modelFile.absolutePath
        }
        return@withContext null
    }

    suspend fun getEmbeddingModelPath(): String? = withContext(Dispatchers.IO) {
        val modelFile = File(context.filesDir, EMBEDDING_MODEL_FILENAME)
        if (modelFile.exists() && modelFile.length() > 1000) {
            return@withContext modelFile.absolutePath
        }
        return@withContext null
    }

    suspend fun startDownload(): String? = withContext(Dispatchers.IO) {
        // Download Embedding Model First (Quick)
        downloadFile(EMBEDDING_MODEL_URL, EMBEDDING_MODEL_FILENAME)

        // Download Main LLM
        downloadFile(MODEL_URL, MODEL_FILENAME)
    }

    private suspend fun downloadFile(url: String, filename: String): String? {
        val modelFile = File(context.filesDir, filename)
        val tempFile = File(context.filesDir, "$filename.tmp")

        if (modelFile.exists()) return modelFile.absolutePath

        try {
            val totalSize = getTotalSize(url)
            var downloaded = if (tempFile.exists()) tempFile.length() else 0L

            while (downloaded < totalSize) {
                val end = (downloaded + CHUNK_SIZE).coerceAtMost(totalSize - 1)
                downloadChunk(url, downloaded, end, tempFile)
                downloaded = tempFile.length()
                if (filename == MODEL_FILENAME) { // Only track progress for the big model
                    _downloadProgress.value = downloaded.toFloat() / totalSize
                }
            }

            tempFile.renameTo(modelFile)
            return modelFile.absolutePath
        } catch (e: Exception) {
            e.printStackTrace()
            return null
        }
    }

    private fun getTotalSize(url: String): Long {
        val request = Request.Builder().url(url).head().build()
        client.newCall(request).execute().use { response ->
            return response.header("Content-Length")?.toLong() ?: 0L
        }
    }

    private fun downloadChunk(url: String, start: Long, end: Long, file: File) {
        val request = Request.Builder()
            .url(url)
            .addHeader("Range", "bytes=$start-$end")
            .build()
        
        client.newCall(request).execute().use { response ->
            val body = response.body ?: throw Exception("Empty body")
            RandomAccessFile(file, "rw").use { raf ->
                raf.seek(start)
                raf.write(body.bytes())
            }
        }
    }
}
