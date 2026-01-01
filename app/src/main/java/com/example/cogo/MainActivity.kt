package com.example.cogo

import android.os.Bundle
import com.example.cogo.databinding.ActivityMainBinding
import android.view.View
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.cogo.automation.CogoAccessibilityService
import android.content.Intent
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.widget.Toast
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val viewModel: MainViewModel by viewModels {
        MainViewModelFactory((application as CogoApplication).repository)
    }
    private lateinit var chatAdapter: ChatAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

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

        if (viewModel.currentSessionId.value == null) {
            viewModel.startNewSession()
        }

        setupVoiceInput()
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
                chatAdapter = ChatAdapter(messages.map { Message(it.text, it.isFromUser) })
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
            viewModel.isThinking.collect { isThinking ->
                binding.loadingIndicator.visibility = if (isThinking) View.VISIBLE else View.GONE
            }
        }
        
        lifecycleScope.launch {
            viewModel.isInitializing.collect { isInitializing ->
                binding.loadingIndicator.visibility = if (isInitializing) View.VISIBLE else View.GONE
                binding.inputContainer.visibility = if (isInitializing) View.GONE else View.VISIBLE
            }
        }

        lifecycleScope.launch {
            viewModel.downloadProgress.collect { progress ->
                // Always show if in DOWNLOADING state, regardless of progress value
                if (viewModel.modelStatus.value == MainViewModel.ModelStatus.DOWNLOADING) {
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
