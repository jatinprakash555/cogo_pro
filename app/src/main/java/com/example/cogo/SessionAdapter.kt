package com.example.cogo

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.cogo.db.ChatSession
import java.text.SimpleDateFormat
import java.util.*

class SessionAdapter(
    private var sessions: List<ChatSession>,
    private val onSessionClick: (ChatSession) -> Unit
) : RecyclerView.Adapter<SessionAdapter.SessionViewHolder>() {

    fun updateSessions(newSessions: List<ChatSession>) {
        sessions = newSessions
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): SessionViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(android.R.layout.simple_list_item_2, parent, false)
        return SessionViewHolder(view)
    }

    override fun onBindViewHolder(holder: SessionViewHolder, position: Int) {
        val session = sessions[position]
        holder.bind(session)
    }

    override fun getItemCount(): Int = sessions.size

    inner class SessionViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val titleText: TextView = itemView.findViewById(android.R.id.text1)
        private val dateText: TextView = itemView.findViewById(android.R.id.text2)

        fun bind(session: ChatSession) {
            titleText.text = if (session.title.isBlank()) "Untitled Chat" else session.title
            val sdf = SimpleDateFormat("MMM dd, HH:mm", Locale.getDefault())
            dateText.text = sdf.format(Date(session.createdAt))
            
            itemView.setOnClickListener { onSessionClick(session) }
        }
    }
}
