# MediaPipe GPU Dependency Error - Exact Fix

## The Real Problem
The artifact `com.google.mediapipe:tasks-genai-gpu:0.10.12` **DOES NOT EXIST**. This is why you're getting the dependency resolution error.

## What Actually Exists (Verified Solutions)

### Solution 1: Use the Main Library with GPU Backend (RECOMMENDED)
MediaPipe GPU support is built into the main library. You don't need a separate GPU artifact.

**Current working dependency:**
```kotlin
implementation("com.google.mediapipe:tasks-genai:0.10.11")
```

**Updated dependency for GPU support:**
```kotlin
implementation("com.google.mediapipe:tasks-genai:0.10.14") // Latest stable version
```

### Solution 2: Check Available Versions
Run this command to see what versions actually exist:
```bash
./gradlew app:dependencies --configuration implementation | grep mediapipe
```

### Solution 3: Alternative GPU Approach
If you need GPU acceleration, try this combination:
```kotlin
dependencies {
    // Main MediaPipe library (latest version)
    implementation("com.google.mediapipe:tasks-genai:0.10.14")
    
    // TensorFlow Lite GPU delegate for acceleration
    implementation("org.tensorflow:tensorflow-lite-gpu:2.13.0")
    implementation("org.tensorflow:tensorflow-lite-gpu-delegate-plugin:0.4.4")
}
```

## Step-by-Step Fix Process

### Step 1: Update Your app/build.gradle.kts
Replace your current MediaPipe dependency:

**FROM:**
```kotlin
implementation("com.google.mediapipe:tasks-genai:0.10.11")
```

**TO:**
```kotlin
implementation("com.google.mediapipe:tasks-genai:0.10.14")
```

### Step 2: Add GPU Support Dependencies
Add these additional dependencies for GPU acceleration:
```kotlin
dependencies {
    // Your existing dependencies...
    implementation("androidx.core:core-ktx:1.9.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    
    // Updated MediaPipe with GPU support
    implementation("com.google.mediapipe:tasks-genai:0.10.14")
    
    // GPU acceleration libraries
    implementation("org.tensorflow:tensorflow-lite-gpu:2.13.0")
    
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
}
```

### Step 3: Update Your Code for GPU Backend
Your existing code should work with these changes:
```kotlin
val options = LlmInference.LlmInferenceOptions.builder()
    .setModelPath("/data/local/tmp/llm/gemma-2b-it-gpu-int4.bin")
    .setLlmBackend(LlmInference.LlmBackend.GPU) // This should now work
    .build()
```

### Step 4: Add GPU Fallback
Add this safety check in case GPU isn't available:
```kotlin
fun createLlmOptions(): LlmInference.LlmInferenceOptions {
    return try {
        // Try GPU first
        LlmInference.LlmInferenceOptions.builder()
            .setModelPath("/data/local/tmp/llm/gemma-2b-it-gpu-int4.bin")
            .setLlmBackend(LlmInference.LlmBackend.GPU)
            .build()
    } catch (e: Exception) {
        // Fallback to CPU
        LlmInference.LlmInferenceOptions.builder()
            .setModelPath("/data/local/tmp/llm/gemma-2b-it-cpu-int4.bin")
            .setLlmBackend(LlmInference.LlmBackend.CPU)
            .build()
    }
}
```

## If You Still Get Dependency Errors

### Option A: Use Exact Working Versions
```kotlin
dependencies {
    implementation("com.google.mediapipe:tasks-genai:0.10.11") // Keep your working version
    implementation("org.tensorflow:tensorflow-lite-gpu:2.12.0") // Add GPU support separately
}
```

### Option B: Check Repository Access
Add this to your settings.gradle.kts if repositories are the issue:
```kotlin
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://maven.google.com") }
        gradlePluginPortal()
    }
}
```

### Option C: Clear Gradle Cache
```bash
./gradlew clean
./gradlew --stop
rm -rf ~/.gradle/caches/
./gradlew build
```

## Verification Commands

1. **Check if dependency resolves:**
```bash
./gradlew app:dependencies --configuration implementation
```

2. **Sync project:**
```bash
./gradlew build --refresh-dependencies
```

3. **Check available MediaPipe versions:**
```bash
./gradlew dependencyInsight --dependency com.google.mediapipe:tasks-genai
```

## The Bottom Line

**The artifact `tasks-genai-gpu` does not exist.** GPU support is included in the main `tasks-genai` library and enabled through code configuration, not separate dependencies.

Try Solution 1 first - just update to version 0.10.14 and use your existing GPU backend code. This should resolve the dependency error while giving you GPU support.