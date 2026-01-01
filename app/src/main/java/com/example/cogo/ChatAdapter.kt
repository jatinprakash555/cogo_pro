package com.example.cogo

import com.example.cogo.R

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.PopupMenu
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

private const val VIEW_TYPE_USER = 1
private const val VIEW_TYPE_BOT = 2

class ChatAdapter(private val messages: List<Message>) : RecyclerView.Adapter<ChatAdapter.MessageViewHolder>() {

    class MessageViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val messageTextView: TextView = view.findViewById(R.id.messageTextView)
    }

    override fun getItemViewType(position: Int): Int {
        return if (messages[position].isFromUser) {
            VIEW_TYPE_USER
        } else {
            VIEW_TYPE_BOT
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): MessageViewHolder {
        val layoutInflater = LayoutInflater.from(parent.context)
        val view = if (viewType == VIEW_TYPE_USER) {
            layoutInflater.inflate(R.layout.item_message_user, parent, false)
        } else {
            layoutInflater.inflate(R.layout.item_message_bot, parent, false)
        }
        return MessageViewHolder(view)
    }

    override fun onBindViewHolder(holder: MessageViewHolder, position: Int) {
        val message = messages[position]
        holder.messageTextView.text = message.text

        // Set a long-click listener on the message bubble
        holder.itemView.setOnLongClickListener {
            showPopupMenu(holder.itemView.context, holder.itemView, message.text)
            true
        }
    }

    override fun getItemCount() = messages.size

    private fun showPopupMenu(context: Context, view: View, text: String) {
        val popup = PopupMenu(context, view)
        popup.menu.add("Copy")
        popup.menu.add("Share")

        popup.setOnMenuItemClickListener { item ->
            when (item.title) {
                "Copy" -> {
                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    val clip = ClipData.newPlainText("Cogo Message", text)
                    clipboard.setPrimaryClip(clip)
                    true
                }
                "Share" -> {
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, text)
                    }
                    context.startActivity(Intent.createChooser(intent, "Share via"))
                    true
                }
                else -> false
            }
        }
        popup.show()
    }
}
