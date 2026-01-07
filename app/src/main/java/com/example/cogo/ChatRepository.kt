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

    suspend fun updateMessage(id: Long, text: String, metrics: String, isStreaming: Boolean = true) =
        chatDao.updateMessage(id, text, metrics, isStreaming)

    // --- AI & Growing Memory ---
    fun generateStreamingResponse(prompt: String, context: String, history: List<ChatMessage> = emptyList()): Flow<String> {
        val fullPrompt = StringBuilder()
        
        // Gemma 2 Turn Format:
        // <start_of_turn>user
        // [System Context]
        // [User Query]<end_of_turn>
        // <start_of_turn>model
        // [Model Response]<end_of_turn>

        // 1. History items (Interleaved turns)
        val historyToInclude = if (history.isNotEmpty() && history.last().isFromUser) {
            history.dropLast(1)
        } else {
            history
        }.takeLast(6)

        if (historyToInclude.isEmpty()) {
            // No history: Single turn with System + Prompt
            fullPrompt.append("<start_of_turn>user\n")
            fullPrompt.append("$context\n\n$prompt<end_of_turn>\n")
        } else {
            // With history: System goes in the first turn's content
            historyToInclude.forEachIndexed { index, msg ->
                val role = if (msg.isFromUser) "user" else "model"
                fullPrompt.append("<start_of_turn>$role\n")
                if (index == 0) fullPrompt.append("$context\n\n") // Inject system at very start
                fullPrompt.append("${msg.text}<end_of_turn>\n")
            }
            // Add current query as the final user turn
            fullPrompt.append("<start_of_turn>user\n$prompt<end_of_turn>\n")
        }
        
        // 4. Open model turn for response
        fullPrompt.append("<start_of_turn>model\n")
        
        return textGenerator.generateStreamingResponse(fullPrompt.toString())
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
