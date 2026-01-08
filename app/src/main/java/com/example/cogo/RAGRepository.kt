package com.example.cogo

import android.content.Context
import com.example.cogo.db.AppDatabase
import com.example.cogo.db.DocumentEntity
import com.example.cogo.db.EmbeddingEntity
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.text.textembedder.TextEmbedder
import com.google.mediapipe.tasks.text.textembedder.TextEmbedder.TextEmbedderOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.math.sqrt

class RAGRepository(private val context: Context, private val modelManager: ModelManager) {

    private val db = AppDatabase.getDatabase(context)
    private val rDao = db.ragDao()
    private var textEmbedder: TextEmbedder? = null

    // Initialize the embedder if model exists
    suspend fun initializeEmbedder(): Boolean {
        val modelPath = modelManager.getEmbeddingModelPath()
        if (modelPath == null) {
            android.util.Log.e("CogoPro", "RAG Init Failed: Model path is null")
            return false
        }

        // Cleanup old embedder to free resources
        try {
            textEmbedder?.close()
            textEmbedder = null
        } catch (e: Exception) {
            android.util.Log.w("CogoPro", "Error closing old embedder", e)
        }

        val baseOptions = BaseOptions.builder().setModelAssetPath(modelPath).build()
        val options = TextEmbedderOptions.builder().setBaseOptions(baseOptions).build()
        
        return try {
            val startTime = System.currentTimeMillis()
            withContext(Dispatchers.Main) { // MediaPipe init often requires main thread or Looper
                 textEmbedder = TextEmbedder.createFromOptions(context, options)
            }
            android.util.Log.i("CogoPro", "RAG Embedder Initialized in ${System.currentTimeMillis() - startTime}ms")
            true
        } catch (e: Exception) {
            android.util.Log.e("CogoPro", "RAG Embedder Init Error", e)
            false
        }
    }

    suspend fun addDocument(uri: android.net.Uri, filename: String) = withContext(Dispatchers.IO) {
        android.util.Log.i("CogoPro", "Adding Document: $filename from $uri")
        // 1. Read Content
        val content = context.contentResolver.openInputStream(uri)?.use { 
            it.bufferedReader().readText() 
        } ?: run {
            android.util.Log.e("CogoPro", "Failed to read file content")
            return@withContext
        }
        android.util.Log.i("CogoPro", "File Content Length: ${content.length}")

        // 2. Save Document Metadata
        val docId = rDao.insertDocument(DocumentEntity(
            filename = filename,
            filePath = uri.toString(),
            addedDate = System.currentTimeMillis()
        ))

        // 3. Chunk Content (Simple overlap chunking)
        val chunks = chunkText(content)
        android.util.Log.i("CogoPro", "Created ${chunks.size} chunks")

        // 4. Embed and Save Chunks
        val embeddings = chunks.mapNotNull { chunk ->
            val vector = getEmbedding(chunk)
            if (vector == null) {
                android.util.Log.w("CogoPro", "Failed to embed chunk: ${chunk.take(20)}...")
                return@mapNotNull null
            }
            EmbeddingEntity(
                documentId = docId,
                chunkText = chunk,
                embeddingVector = vector.joinToString(",")
            )
        }
        rDao.insertEmbeddings(embeddings)
        android.util.Log.i("CogoPro", "Inserted ${embeddings.size} embeddings into DB")
    }

    suspend fun retrieveRelevantContext(query: String, limit: Int = 3): String {
        // Ensure embedder is ready
        if (textEmbedder == null && !initializeEmbedder()) {
            android.util.Log.e("CogoPro", "Retrieve failed: Embedder not initialized")
            return ""
        }

        val queryVector = getEmbedding(query)
        if (queryVector == null) {
            android.util.Log.e("CogoPro", "Retrieve failed: Could not embed query")
            return ""
        }
        
        val allEmbeddings = withContext(Dispatchers.IO) { rDao.getAllEmbeddings() }
        android.util.Log.i("CogoPro", "Scanning ${allEmbeddings.size} embeddings for query: '$query'")

        // Naive cosine similarity search (in-memory for MVP stability)
        val sorted = allEmbeddings.map { entity ->
            val vector = entity.embeddingVector.split(",").map { it.toFloat() }.toFloatArray()
            val score = cosineSimilarity(queryVector, vector)
            Pair(entity.chunkText, score)
        }.sortedByDescending { it.second }

        val topResults = sorted.take(limit)
        if (topResults.isNotEmpty()) {
             android.util.Log.i("CogoPro", "Top Match Score: ${topResults.first().second}")
             android.util.Log.i("CogoPro", "Top Match Content: ${topResults.first().first.take(50)}...")
        } else {
             android.util.Log.w("CogoPro", "No matches found")
        }

        return topResults.joinToString("\n\n") { it.first }
    }

    private fun getEmbedding(text: String): FloatArray? {
        if (textEmbedder == null) {
            android.util.Log.w("CogoPro", "getEmbedding called but textEmbedder is null")
            return null
        }
        // TextEmbedder is not thread-safe, ensure synchronization if needed, 
        // but for this simple use-case, let's just run it.
        // MediaPipe calls mostly happen on calling thread.
        try {
            val embeddingResult = textEmbedder!!.embed(text)
            val floatList = embeddingResult.embeddingResult().embeddings().first().floatEmbedding()
            // Convert to primitive array
            val floatArray = FloatArray(floatList.size)
            for (i in floatList.indices) {
                floatArray[i] = floatList[i]
            }
            return floatArray
        } catch (e: Exception) {
            android.util.Log.e("CogoPro", "Embed failed for text: '${text.take(20)}...'", e)
            return null
        }
    }

    private fun chunkText(text: String, chunkSize: Int = 500, overlap: Int = 50): List<String> {
        val words = text.split(" ")
        val chunks = mutableListOf<String>()
        var start = 0
        while (start < words.size) {
            val end = (start + chunkSize).coerceAtMost(words.size)
            chunks.add(words.subList(start, end).joinToString(" "))
            start += (chunkSize - overlap)
        }
        return chunks
    }

    private fun cosineSimilarity(v1: FloatArray, v2: FloatArray): Float {
        var dot = 0f
        var normA = 0f
        var normB = 0f
        for (i in v1.indices) {
            dot += v1[i] * v2[i]
            normA += v1[i] * v1[i]
            normB += v2[i] * v2[i]
        }
        return if (normA > 0 && normB > 0) dot / (sqrt(normA) * sqrt(normB)) else 0f
    }
}
