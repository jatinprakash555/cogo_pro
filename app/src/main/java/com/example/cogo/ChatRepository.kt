package com.example.cogo

import com.example.cogo.db.ChatDao
import com.example.cogo.db.ChatMessage
import com.example.cogo.db.ChatSession
import com.example.cogo.db.KeyFact
import com.example.cogo.db.Macro
import kotlinx.coroutines.flow.Flow

class ChatRepository(
    private val chatDao: ChatDao,
    val textGenerator: TextGenerator
) {
    private val memoryManager = MemoryManager(chatDao)

    suspend fun processMemory(userText: String, botResponse: String) {
        memoryManager.processConversationForMemory(userText, botResponse)
    }

    suspend fun getMemoryContext(): String = memoryManager.getMemoryContext()
    // --- Sessions & Messages ---
    val allSessions: Flow<List<ChatSession>> = chatDao.getAllSessions()

    fun getMessagesForSession(sessionId: Long): Flow<List<ChatMessage>> =
        chatDao.getMessagesForSession(sessionId)

    suspend fun createNewSession(title: String): Long =
        chatDao.insertSession(ChatSession(title = title))

    suspend fun saveMessage(message: ChatMessage) =
        chatDao.insertMessage(message)

    // --- AI & Growing Memory ---
    fun generateStreamingResponse(prompt: String, context: String): Flow<String> {
        // Future: Inject KeyFacts from context here
        return textGenerator.generateStreamingResponse("$context\nUser: $prompt")
    }

    suspend fun generateResponse(prompt: String, context: String): String {
        return textGenerator.generateResponse("$context\nUser: $prompt")
    }

    suspend fun saveKeyFact(fact: KeyFact) =
        chatDao.insertKeyFact(fact)

    fun getAllKeyFacts(): Flow<List<KeyFact>> =
        chatDao.getAllKeyFacts()

    // --- Automation (Macros) ---
    suspend fun saveMacro(macro: Macro) =
        chatDao.insertMacro(macro)

    fun getActiveMacros(): Flow<List<Macro>> =
        chatDao.getActiveMacros()

    suspend fun getMacroByTrigger(trigger: String): Macro? =
        chatDao.getMacroByTrigger(trigger)
}
