package com.example.cogo.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Transaction

@Dao
interface RAGDao {
    @Insert
    suspend fun insertDocument(document: DocumentEntity): Long

    @Insert
    suspend fun insertEmbeddings(embeddings: List<EmbeddingEntity>)

    @Query("SELECT * FROM documents ORDER BY addedDate DESC")
    suspend fun getAllDocuments(): List<DocumentEntity>

    @Query("SELECT * FROM embeddings WHERE documentId = :docId")
    suspend fun getEmbeddingsForDocument(docId: Long): List<EmbeddingEntity>

    @Query("SELECT * FROM embeddings")
    suspend fun getAllEmbeddings(): List<EmbeddingEntity>
    
    @Query("DELETE FROM documents WHERE id = :docId")
    suspend fun deleteDocument(docId: Long)
}
