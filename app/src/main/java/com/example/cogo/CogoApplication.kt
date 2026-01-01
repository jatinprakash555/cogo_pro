package com.example.cogo

import android.app.Application
import com.example.cogo.db.AppDatabase

class CogoApplication : Application() {
    
    val database by lazy { AppDatabase.getDatabase(this) }
    val repository by lazy { 
        val textGenerator = TextGenerator.getInstance(this)
        ChatRepository(database.chatDao(), textGenerator) 
    }

    override fun onCreate() {
        super.onCreate()
    }
}
