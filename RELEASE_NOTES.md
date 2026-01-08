# Release v1.1.0: Cogo Pro - Snapdragon Stability & Robust Init

**Release Date:** January 8, 2026
**Version:** 1.1.0-snapdragon

## 🆕 New in this Release

### 1. Snapdragon (Adreno GPU) Stability
- **Resolved**: Addressed RAM spikes and crashes occurring during model initialization on Snapdragon devices.
- **Robust Initialization**: Implemented a staggered, sequential loading pipeline for the LLM and the RAG Embedder.
- **Buffer Recovery**: Added stability delays (1.0s - 1.5s) between model allocations to allow the mobile GPU driver to release and reclaim memory buffers safely.
- **Explicit Cleanup**: Ensured all hardware-accelerated resources are explicitly closed before re-initialization or backend fallback.

## 📦 Installation
1. Download `app-debug.apk` from the latest release.
2. Install and launch.
3. Observe the "Optimizing Compute Graph" phase, which now manages the staged loading flow.

---

# Release v1.0.0: Cogo Pro - Universal Local AI & RAG Assistant

**Release Date:** January 7, 2026
**Version:** 1.0.0-rag

## 🚀 Key Features

### 1. Universal Compatibility (Android 15 & MediaTek)
- **Resolved**: Fixed `libvndksupport.so` crashes on Android 15 devices.
- **Support**: Validated on MediaTek Dimensity 6100+ (Realme Narzo 70x 5G).
- **Core Engine**: Upgraded to **MediaPipe 0.10.29** and targeted **Android SDK 35**.

### 2. Robust GPU-to-CPU Fallback
- The app now intelligently attempts to initialize the High-Performance GPU Backend first.
- **Fail-Safe**: If GPU initialization fails (e.g., due to missing `clSetPerfHintQCOM` drivers), it automatically and seamlessly falls back to the Universal CPU Backend.
- This ensures 100% app launch stability across diverse hardware.

### 3. Retrieval Augmented Generation (RAG)
- **Feature**: "Add Knowledge" button allows you to attach local text files (`.txt`, `.md`).
- **Functionality**: The AI embeds your document into a local vector database and uses it as context to answer your questions.
- **Verified**: Successfully retrieved specific validation keys from ingested documents.

### 4. Enhanced UI/UX
- **Shader Simulation**: A "Compiling Neural Shaders" sequence masks the model loading time, providing a gamified and polished user experience.
- **Status Indicators**: Real-time feedback ("Optimizing Compute Graph", "Cogo is Ready").

## 📦 Installation
1. Download `app-debug.apk` from this repository.
2. Install on any Android device (Android 8.0+).
3. On first launch, the app will download the necessary AI models (LLM + Embedder).

## 🛠 Technical Details
- **LLM Engine**: MediaPipe Tasks GenAI
- **Database**: Room Database with Vector Storage
- **Architecture**: MVVM with Kotlin Coroutines & StateFlow
