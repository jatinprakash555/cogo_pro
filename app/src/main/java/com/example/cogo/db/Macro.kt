package com.example.cogo.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "macros")
data class Macro(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val trigger: String, // e.g., "Good morning", "Heading home"
    val actionIntent: String, // JSON representation of actions (clicks, swipes, app launches)
    val isActive: Boolean = true,
    val usageCount: Int = 0
)
