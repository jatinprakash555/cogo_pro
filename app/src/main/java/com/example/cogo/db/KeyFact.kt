package com.example.cogo.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "key_facts")
data class KeyFact(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val category: String, // e.g., "User Info", "Preference", "History"
    val fact: String,
    val confidence: Float = 1.0f,
    val lastUpdated: Long = System.currentTimeMillis()
)
