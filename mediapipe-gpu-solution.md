# MediaPipe GPU Acceleration Solution Guide

## Problem Analysis
You're experiencing a dependency resolution failure when trying to add GPU support for MediaPipe LlmInference. The error `Could not resolve com.google.mediapipe:tasks-genai-gpu:0.10.12` indicates the artifact isn't available in your current repository configuration.

## Root Cause & Solutions

### 1. Correct Dependency Information

**Issue**: The `tasks-genai-gpu` artifact may not exist or may be named differently.

**Solution**: MediaPipe GPU support is typically included in the main library with different backend configuration, not a separate GPU-specific artifact.

**Recommended Approach**:
```kotlin
// Instead of separate GPU library, use the main library
implementation("com.google.mediapipe:tasks-genai:0.10.12")
```

### 2. Repository Configuration

**Current repositories in your settings.gradle.kts**:
- google()
- mavenCentral()

**Additional repositories to add**:
```kotlin
repositories {
    google()
    mavenCentral()
    // Add these for MediaPipe GPU support
    maven { url = uri("https://maven.google.com") }
    maven { url = uri("https://jcenter.bintray.com") }
}
```

### 3. Version Compatibility Check

**Current working version**: 0.10.11 (CPU)
**Target version**: 0.10.12 (GPU attempt)

**Recommendation**: 
- First try upgrading the existing dependency to 0.10.12
- Check MediaPipe release notes for GPU support availability
- Consider using 0.10.14 or latest stable version

### 4. Alternative GPU Implementation Approaches

#### Option A: Single Library with Backend Selection
```kotlin
dependencies {
    implementation("com.google.mediapipe:tasks-genai:0.10.12")
    // GPU support may require additional OpenGL/Vulkan dependencies
    implementation("org.tensorflow:tensorflow-lite-gpu:2.13.0")
}
```

#### Option B: Check for Separate GPU Module
```kotlin
dependencies {
    implementation("com.google.mediapipe:tasks-genai:0.10.12")
    implementation("com.google.mediapipe:tasks-genai-gpu-delegate:0.10.12")
}
```

### 5. Potential Dependency Conflicts & Solutions

**Common conflicts with MediaPipe GPU**:

```kotlin
dependencies {
    implementation("com.google.mediapipe:tasks-genai:0.10.12") {
        exclude(group = "com.google.guava", module = "guava")
        exclude(group = "xml-apis", module = "xml-apis")
    }
    
    // Explicit versions to resolve conflicts
    implementation("com.google.guava:guava:31.1-android")
    implementation("xml-apis:xml-apis:1.4.01")
}
```

### 6. Android Manifest Requirements for GPU

Add these permissions and features:
```xml
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-feature android:name="android.hardware.opengles.aes" android:required="false" />
<uses-feature android:name="android.hardware.vulkan.level" android:required="false" />
```

### 7. ProGuard Rules for GPU Libraries

Add to `proguard-rules.pro`:
```
-keep class com.google.mediapipe.** { *; }
-keep class org.tensorflow.lite.** { *; }
-dontwarn com.google.mediapipe.**
-dontwarn org.tensorflow.lite.**
```

## Step-by-Step Implementation Plan

### Phase 1: Repository & Version Update
1. Update repositories in `settings.gradle.kts`
2. Upgrade to latest MediaPipe version
3. Test CPU functionality still works

### Phase 2: GPU Dependencies
1. Add GPU-related dependencies
2. Handle any dependency conflicts
3. Update ProGuard rules

### Phase 3: Code Implementation
1. Update model path to GPU-optimized model
2. Set LlmBackend.GPU in options
3. Add GPU availability checks
4. Implement fallback to CPU if GPU fails

### Phase 4: Testing & Optimization
1. Test on different devices
2. Benchmark performance improvements
3. Handle GPU memory limitations

## Alternative Solutions if Standard Approach Fails

### Option 1: Use TensorFlow Lite GPU Delegate
```kotlin
implementation("org.tensorflow:tensorflow-lite:2.13.0")
implementation("org.tensorflow:tensorflow-lite-gpu:2.13.0")
```

### Option 2: Custom MediaPipe Build
- Build MediaPipe from source with GPU support
- Use local AAR files

### Option 3: Different AI Framework
- Consider alternatives like ONNX Runtime Mobile
- Evaluate MLKit for on-device inference

## Verification Steps

1. **Dependency Resolution**: Gradle sync completes successfully
2. **Runtime Check**: GPU backend initializes without errors
3. **Performance Test**: Measure inference time improvement
4. **Device Compatibility**: Test across different Android versions/GPUs

## Troubleshooting Commands

```bash
# Check available MediaPipe versions
./gradlew app:dependencies --configuration implementation

# Clear Gradle cache if needed
./gradlew clean
rm -rf ~/.gradle/caches/

# Verbose dependency resolution
./gradlew app:dependencies --info
```

## Expected Performance Improvements

- **CPU Baseline**: Current performance on your devices
- **GPU Target**: 2-5x speed improvement (device dependent)
- **Memory**: May use more GPU memory but less CPU

## Next Steps

1. Review this solution guide
2. Choose which approach to try first (recommend starting with Phase 1)
3. Make incremental changes and test each step
4. Keep CPU fallback as backup during transition

Would you like me to help implement any specific part of this solution?