package com.example.cogo

import android.os.Bundle
import android.content.Intent
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.View
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.GravityCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.cogo.automation.CogoAccessibilityService
import com.example.cogo.databinding.ActivityMainBinding
import com.example.cogo.db.ChatSession
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import androidx.core.view.WindowCompat
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val viewModel: MainViewModel by viewModels { MainViewModelFactory((application as CogoApplication).repository, (application as CogoApplication).ragRepository) }
    private lateinit var chatAdapter: ChatAdapter
    private lateinit var sessionAdapter: SessionAdapter

    private val filePickerLauncher = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let {
            val filename = getFileName(it) ?: "document.txt"
            Toast.makeText(this, "Adding $filename to Knowledge...", Toast.LENGTH_SHORT).show()
            viewModel.addDocument(it, filename)
        }
    }

    private fun getFileName(uri: android.net.Uri): String? {
        var name: String? = null
        contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0) name = cursor.getString(nameIndex)
            }
        }
        return name
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        WindowCompat.setDecorFitsSystemWindows(window, false)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayShowTitleEnabled(false)

        chatAdapter = ChatAdapter(emptyList()) // Adapter will need update for dynamic list
        binding.recyclerView.layoutManager = LinearLayoutManager(this)
        binding.recyclerView.adapter = chatAdapter

        setupObservers()
        
        binding.sendButton.setOnClickListener { 
            val text = binding.messageInput.text.toString()
            if (text.isNotBlank()) {
                viewModel.sendMessage(text)
                binding.messageInput.text?.clear()
            }
        }

        binding.attachButton.setOnClickListener {
            filePickerLauncher.launch(arrayOf("text/plain", "text/markdown"))
        }

        if (viewModel.currentSessionId.value == null) {
            viewModel.startNewSession()
        }

        setupVoiceInput()
        setupKeyboardHandling()
        setupSessionPanel()
    }

    private fun setupSessionPanel() {
        sessionAdapter = SessionAdapter(emptyList()) { session ->
            viewModel.selectSession(session.id)
            binding.drawerLayout.closeDrawer(GravityCompat.END)
        }
        binding.sessionsRecyclerView.layoutManager = LinearLayoutManager(this)
        binding.sessionsRecyclerView.adapter = sessionAdapter

        binding.panelButton.setOnClickListener {
            binding.drawerLayout.openDrawer(GravityCompat.END)
        }

        binding.newChatButton.setOnClickListener {
            viewModel.startNewSession()
            binding.drawerLayout.closeDrawer(GravityCompat.END)
        }

        lifecycleScope.launch {
            viewModel.allSessions.collect { sessions: List<ChatSession> ->
                sessionAdapter.updateSessions(sessions)
            }
        }
    }

    private fun setupKeyboardHandling() {
        ViewCompat.setOnApplyWindowInsetsListener(binding.drawerLayout) { _, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())

            // Conservative padding application
            binding.toolbar.setPadding(0, systemBars.top, 0, 0)
            binding.navigationView.setPadding(0, systemBars.top, 0, 0)

            val bottomPadding = maxOf(ime.bottom, systemBars.bottom)
            
            if (binding.drawerLayout.childCount > 0) {
                val content = binding.drawerLayout.getChildAt(0)
                content.setPadding(0, 0, 0, bottomPadding)
            }

            insets
        }
    }

    private fun setupVoiceInput() {
        val speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
        val speechIntent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        }

        binding.voiceButton.setOnClickListener {
            speechRecognizer.startListening(speechIntent)
            Toast.makeText(this, "Listening...", Toast.LENGTH_SHORT).show()
        }

        speechRecognizer.setRecognitionListener(object : RecognitionListener {
            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (!matches.isNullOrEmpty()) {
                    val text = matches[0]
                    binding.messageInput.setText(text)
                    viewModel.sendMessage(text)
                }
            }
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onError(error: Int) {}
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
    }

    private fun setupObservers() {
        lifecycleScope.launch {
            viewModel.messages.collect { messages ->
                // Note: Better to use ListAdapter for efficiency
                chatAdapter = ChatAdapter(messages.map { Message(it.text, it.isFromUser, it.metrics, it.isStreaming) })
                binding.recyclerView.adapter = chatAdapter
                if (messages.isNotEmpty()) {
                    binding.recyclerView.scrollToPosition(messages.size - 1)
                    
                    val lastMessage = messages.last()
                    if (!lastMessage.isFromUser) {
                        handleAutomation(lastMessage.text)
                    }
                }
            }
        }

        lifecycleScope.launch {
            viewModel.isInitializing.collect { isInitializing ->
                binding.inputContainer.visibility = if (isInitializing) View.GONE else View.VISIBLE
            }
        }

        lifecycleScope.launch {
            viewModel.downloadProgress.collect { progress ->
                if (viewModel.modelStatus.value == MainViewModel.ModelStatus.DOWNLOADING) {
                    binding.loadingIndicator.visibility = View.VISIBLE
                    binding.downloadProgress.visibility = View.VISIBLE
                    binding.downloadProgress.progress = (progress * 100).toInt()
                    binding.prepareStatus.text = "Downloading AI Brain... ${(progress * 100).toInt()}%"
                }
            }
        }

        lifecycleScope.launch {
            viewModel.modelStatus.collect { status ->
                when (status) {
                    MainViewModel.ModelStatus.READY -> {
                        binding.loadingIndicator.visibility = View.GONE
                        binding.statusIndicator.setImageResource(R.drawable.bg_status_dot_green)
                        binding.prepareStatus.text = "Cogo is Ready"
                    }
                    MainViewModel.ModelStatus.DOWNLOADING -> {
                        binding.statusIndicator.setImageResource(R.drawable.bg_status_dot_red)
                        binding.downloadProgress.visibility = View.VISIBLE
                    }
                    MainViewModel.ModelStatus.ERROR -> {
                        binding.statusIndicator.setImageResource(R.drawable.bg_status_dot_red)
                        binding.prepareStatus.text = "Download Failed. Check Connection."
                        binding.downloadProgress.visibility = View.GONE
                    }
                    MainViewModel.ModelStatus.NOT_FOUND -> {
                        binding.statusIndicator.setImageResource(R.drawable.bg_status_dot_red)
                    }
                }
            }
        }
        
        lifecycleScope.launch {
            viewModel.prepareStatusText.collect { statusText ->
                 if (viewModel.modelStatus.value != MainViewModel.ModelStatus.READY && viewModel.modelStatus.value != MainViewModel.ModelStatus.ERROR) {
                      binding.prepareStatus.text = statusText
                 }
            }
        }

        lifecycleScope.launch {
            viewModel.attachedFiles.collect { files ->
                if (files.isNotEmpty()) {
                    binding.activeKnowledgeGroup.visibility = View.VISIBLE
                    binding.activeKnowledgeText.text = "Knowledge: ${files.joinToString(", ")}"
                } else {
                    binding.activeKnowledgeGroup.visibility = View.GONE
                }
            }
        }
    }

    private fun handleAutomation(response: String) {
        val repository = (application as CogoApplication).repository
        val action = repository.textGenerator.parseActionIntent(response) ?: return
        
        val service = CogoAccessibilityService.getInstance()
        if (service == null) {
            Toast.makeText(this, "Enable Cogo Agent in Accessibility Settings", Toast.LENGTH_LONG).show()
            return
        }

        when (action.optString("type")) {
            "launch" -> {
                val pkg = action.optString("package")
                service.launchApp(pkg)
            }
            "click" -> {
                val x = action.optDouble("x", 0.0).toFloat()
                val y = action.optDouble("y", 0.0).toFloat()
                service.performClick(x, y)
            }
            "click_text" -> {
                val text = action.optString("text")
                service.clickText(text)
            }
        }
    }
}
