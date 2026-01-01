package com.example.cogo

import com.example.cogo.db.ChatDao
import com.example.cogo.db.KeyFact
import org.json.JSONObject

class MemoryManager(private val chatDao: ChatDao) {

    /**
     * Extracts facts from a conversation turn and saves them to memory.
     */
    suspend fun processConversationForMemory(userText: String, botResponse: String) {
        // Simple rule-based extraction for now (e.g., "My name is X")
        // Future: Use AI to extract structured facts
        
        val nameMatch = "my name is (\\w+)".toRegex(RegexOption.IGNORE_CASE).find(userText)
        if (nameMatch != null) {
            val name = nameMatch.groupValues[1]
            chatDao.insertKeyFact(KeyFact(category = "User Info", fact = "User name is $name"))
        }

        val preferenceMatch = "i like (\\w+)".toRegex(RegexOption.IGNORE_CASE).find(userText)
        if (preferenceMatch != null) {
            val pref = preferenceMatch.groupValues[1]
            chatDao.insertKeyFact(KeyFact(category = "Preference", fact = "User likes $pref"))
        }
    }

    /**
     * Constructs a context string containing all relevant memory.
     */
    suspend fun getMemoryContext(): String {
        // Simple context for now
        return "You are Cogo. You remember that common user patterns should be followed."
    }
}
