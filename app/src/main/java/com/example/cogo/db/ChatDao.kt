package com.example.cogo.db

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface ChatDao {
    // --- Messages ---
    @Insert
    suspend fun insertMessage(message: ChatMessage): Long

    @Query("SELECT * FROM chat_messages WHERE sessionId = :sessionId ORDER BY timestamp ASC")
    fun getMessagesForSession(sessionId: Long): Flow<List<ChatMessage>>

    @Query("UPDATE chat_messages SET text = :text, metrics = :metrics, isStreaming = :isStreaming WHERE id = :id")
    suspend fun updateMessage(id: Long, text: String, metrics: String, isStreaming: Boolean)

    @Query("DELETE FROM chat_messages WHERE sessionId = :sessionId")
    suspend fun deleteMessagesForSession(sessionId: Long)

    // --- Sessions ---
    @Insert
    suspend fun insertSession(session: ChatSession): Long

    @Query("SELECT * FROM chat_sessions ORDER BY createdAt DESC")
    fun getAllSessions(): Flow<List<ChatSession>>

    @Query("DELETE FROM chat_sessions WHERE id = :sessionId")
    suspend fun deleteSession(sessionId: Long)

    // --- Key Facts (Growing Memory) ---
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertKeyFact(fact: KeyFact)

    @Query("SELECT * FROM key_facts ORDER BY lastUpdated DESC")
    fun getAllKeyFacts(): Flow<List<KeyFact>>

    @Query("SELECT * FROM key_facts WHERE category = :category")
    suspend fun getKeyFactsByCategory(category: String): List<KeyFact>

    // --- Macros (Automation) ---
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMacro(macro: Macro)

    @Query("SELECT * FROM macros WHERE isActive = 1")
    fun getActiveMacros(): Flow<List<Macro>>

    @Query("SELECT * FROM macros WHERE trigger = :trigger AND isActive = 1 LIMIT 1")
    suspend fun getMacroByTrigger(trigger: String): Macro?
}
