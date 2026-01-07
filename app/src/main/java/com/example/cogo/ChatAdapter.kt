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



class ChatAdapter(private val messages: List<Message>) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    class MessageViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val messageTextView: TextView = view.findViewById(R.id.textMessage) // Updated ID for bot
    }
    
    // User ViewHolder remains simple, or we unify. 
    // For simplicity, let's keep separate logic but we need to CAST based on type or use different ViewHolders.
    // Let's refactor slightly to handle the two layouts correctly.

    abstract class BaseViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        abstract fun bind(message: Message)
    }

    class UserViewHolder(view: View) : BaseViewHolder(view) {
        private val textView: TextView = view.findViewById(R.id.messageTextView)
        override fun bind(message: Message) {
            textView.text = message.text
        }
    }

    class BotViewHolder(view: View) : BaseViewHolder(view) {
        private val textView: TextView = view.findViewById(R.id.textMessage)
        private val metricsView: TextView = view.findViewById(R.id.textMetrics)
        private val cardView: View = view.findViewById(R.id.cardView) // For animations if needed

        override fun bind(message: Message) {
            textView.text = message.text
            
            if (message.metrics.isNotBlank()) {
                metricsView.visibility = View.VISIBLE
                metricsView.text = message.metrics
            } else {
                 metricsView.visibility = View.GONE
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): BaseViewHolder {
        val layoutInflater = LayoutInflater.from(parent.context)
        return if (viewType == VIEW_TYPE_USER) {
            UserViewHolder(layoutInflater.inflate(R.layout.item_message_user, parent, false))
        } else {
            BotViewHolder(layoutInflater.inflate(R.layout.item_chat_bot_metrics, parent, false))
        }
    }

    override fun getItemViewType(position: Int): Int {
        return if (messages[position].isFromUser) VIEW_TYPE_USER else VIEW_TYPE_BOT
    }


    
    // Fixing class signature to RecyclerView.ViewHolder and casting inside
    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        if (holder is BaseViewHolder) {
            holder.bind(messages[position])
        }
        
        // Long click logic specific to bubble
        holder.itemView.setOnLongClickListener {
            showPopupMenu(holder.itemView.context, holder.itemView, messages[position].text)
            true
        }
    }
    // Removed premature closure and misplaced data class

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

