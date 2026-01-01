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
        
        // Official model download link from GitHub Releases
        private const val MODEL_URL = "https://github.com/jatinprakash555/cogo_pro/releases/download/v1.0/gemma-2b-it-gpu-int4.bin"
        
        private const val CHUNK_SIZE = 1024 * 1024L // 1MB chunks for smoother UI progress
    }

    suspend fun getModelPath(): String? = withContext(Dispatchers.IO) {
        val modelFile = File(context.filesDir, MODEL_FILENAME)
        if (modelFile.exists() && modelFile.length() > 100000) {
            return@withContext modelFile.absolutePath
        }
        return@withContext null
    }

    suspend fun startDownload(): String? = withContext(Dispatchers.IO) {
        val modelFile = File(context.filesDir, MODEL_FILENAME)
        val tempFile = File(context.filesDir, "$MODEL_FILENAME.tmp")
        
        try {
            val totalSize = getTotalSize(MODEL_URL)
            var downloaded = if (tempFile.exists()) tempFile.length() else 0L

            while (downloaded < totalSize) {
                val end = (downloaded + CHUNK_SIZE).coerceAtMost(totalSize - 1)
                downloadChunk(MODEL_URL, downloaded, end, tempFile)
                downloaded = tempFile.length()
                _downloadProgress.value = downloaded.toFloat() / totalSize
            }

            tempFile.renameTo(modelFile)
            modelFile.absolutePath
        } catch (e: Exception) {
            e.printStackTrace()
            null
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
