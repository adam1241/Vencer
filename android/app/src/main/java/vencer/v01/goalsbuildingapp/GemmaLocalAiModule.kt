package vencer.v01.goalsbuildingapp

import android.app.ActivityManager
import android.content.Context
import android.os.StatFs
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.SamplerConfig
import java.io.BufferedReader
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

class GemmaLocalAiModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val TAG = "GemmaLocalAi"
    private const val MODEL_URL =
      "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it.litertlm?download=true"
    private const val MODEL_FILE_NAME = "gemma-4-E4B-it.litertlm"
    private const val DIAGNOSTICS_FILE_NAME = "gemma_diagnostics.log"
    private const val MIN_MODEL_BYTES = 3_000_000_000L
    private const val MIN_DEVICE_MEMORY_BYTES = 8L * 1024L * 1024L * 1024L
    private const val REQUIRED_FREE_BYTES = 5_200_000_000L
    private const val DEFAULT_MAX_TOKENS = 3000
    private const val DEFAULT_TOP_K = 5
    private const val DEFAULT_TOP_P = 0.0
    private const val DEFAULT_TEMPERATURE = 0.0
    private const val DEFAULT_RANDOM_SEED = 101
  }

  private val executor = Executors.newSingleThreadExecutor()

  @Volatile
  private var engine: Engine? = null

  @Volatile
  private var state: String = "idle"

  @Volatile
  private var backendName: String = "none"

  @Volatile
  private var lastError: String? = null

  @Volatile
  private var downloadedBytes: Long = 0L

  @Volatile
  private var totalBytes: Long = 0L

  override fun getName(): String = "GemmaLocalAi"

  @ReactMethod
  fun prepareModel(promise: Promise) {
    executor.execute {
      try {
        appendDiagnostic("prepareModel called")
        ensureReady()
        promise.resolve(buildStatusMap())
      } catch (error: Throwable) {
        lastError = error.message
        state = "error"
        appendDiagnostic("prepareModel failed: ${error.message}")
        promise.reject("GEMMA_PREPARE_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    promise.resolve(buildStatusMap())
  }

  @ReactMethod
  fun getDiagnostics(promise: Promise) {
    try {
      promise.resolve(readDiagnostics())
    } catch (error: Throwable) {
      promise.reject("GEMMA_DIAGNOSTICS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun generate(prompt: String, promise: Promise) {
    executor.execute {
      try {
        appendDiagnostic("generate called")
        ensureReady()
        state = "generating"

        val conversationConfig = ConversationConfig(
          samplerConfig = SamplerConfig(
            DEFAULT_TOP_K,
            DEFAULT_TOP_P,
            DEFAULT_TEMPERATURE,
            DEFAULT_RANDOM_SEED,
          ),
        )

        val response = engine
          ?.createConversation(conversationConfig)
          ?.use { conversation ->
            conversation.sendMessage(prompt).toString().trim()
          }
          ?: throw IllegalStateException("Gemma engine is not initialized")

        state = "ready"
        appendDiagnostic("generate finished successfully")
        promise.resolve(response)
      } catch (error: Throwable) {
        lastError = error.message
        state = if (engine != null) "ready" else "error"
        appendDiagnostic("generate failed: ${error.message}")
        promise.reject("GEMMA_GENERATE_FAILED", error.message, error)
      }
    }
  }

  @Synchronized
  private fun ensureReady() {
    if (engine != null) {
      state = "ready"
      appendDiagnostic("ensureReady: engine already available")
      return
    }

    appendDiagnostic("ensureReady: starting readiness checks")
    ensureDeviceMemory()
    ensureDiskCapacity()
    downloadModelIfNeeded()
    initializeEngine()
  }

  private fun ensureDeviceMemory() {
    val activityManager =
      reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        ?: return

    val memoryInfo = ActivityManager.MemoryInfo()
    activityManager.getMemoryInfo(memoryInfo)
    appendDiagnostic("ensureDeviceMemory: totalMem=${memoryInfo.totalMem}")

    if (memoryInfo.totalMem < MIN_DEVICE_MEMORY_BYTES) {
      throw IllegalStateException(
        "Gemma 4 E4B needs about 8 GB RAM on Android. This device reports less memory.",
      )
    }
  }

  private fun ensureDiskCapacity() {
    val modelFile = getModelFile()
    if (modelFile.exists() && modelFile.length() >= MIN_MODEL_BYTES) {
      return
    }

    val statFs = StatFs(reactApplicationContext.filesDir.absolutePath)
    if (statFs.availableBytes < REQUIRED_FREE_BYTES) {
      appendDiagnostic("ensureDiskCapacity failed: available=${statFs.availableBytes}")
      throw IllegalStateException(
        "Not enough free storage for Gemma 4. Free at least 5.2 GB and relaunch the app.",
      )
    }
  }

  private fun downloadModelIfNeeded() {
    val modelFile = getModelFile()
    if (modelFile.exists() && modelFile.length() >= MIN_MODEL_BYTES) {
      totalBytes = modelFile.length()
      downloadedBytes = modelFile.length()
      appendDiagnostic("downloadModelIfNeeded: existing model accepted (${modelFile.length()} bytes)")
      return
    }

    val tempFile = File(modelFile.parentFile, "$MODEL_FILE_NAME.part")
    if (tempFile.exists()) {
      tempFile.delete()
    }
    modelFile.parentFile?.mkdirs()

    state = "downloading"
    lastError = null
    downloadedBytes = 0L
    totalBytes = 0L
    appendDiagnostic("downloadModelIfNeeded: starting download")

    val connection = URL(MODEL_URL).openConnection() as HttpURLConnection
    connection.instanceFollowRedirects = true
    connection.connectTimeout = 30_000
    connection.readTimeout = 30_000
    connection.setRequestProperty("Accept", "*/*")
    connection.setRequestProperty("User-Agent", "Vencer-Android/1.0")

    try {
      connection.connect()
      if (connection.responseCode !in 200..299) {
        appendDiagnostic("downloadModelIfNeeded: bad HTTP ${connection.responseCode}")
        throw IllegalStateException("Model download failed with HTTP ${connection.responseCode}")
      }

      totalBytes = connection.contentLengthLong.coerceAtLeast(0L)

      connection.inputStream.use { input ->
        FileOutputStream(tempFile).use { output ->
          val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
          while (true) {
            val read = input.read(buffer)
            if (read <= 0) break
            output.write(buffer, 0, read)
            downloadedBytes += read.toLong()
          }
          output.flush()
        }
      }

      if (tempFile.length() < MIN_MODEL_BYTES) {
        throw IllegalStateException("Downloaded model is incomplete or corrupt")
      }

      if (modelFile.exists()) {
        modelFile.delete()
      }
      if (!tempFile.renameTo(modelFile)) {
        throw IllegalStateException("Could not finalize the downloaded model file")
      }

      downloadedBytes = modelFile.length()
      totalBytes = modelFile.length()
      appendDiagnostic("downloadModelIfNeeded: download complete (${modelFile.length()} bytes)")
      Log.i(TAG, "Gemma model ready at ${modelFile.absolutePath}")
    } catch (error: Throwable) {
      tempFile.delete()
      appendDiagnostic("downloadModelIfNeeded failed: ${error.message}")
      throw error
    } finally {
      connection.disconnect()
    }
  }

  private fun initializeEngine() {
    state = "initializing"
    appendDiagnostic("initializeEngine: starting")

    val modelPath = getModelFile().absolutePath
    val cacheDir = reactApplicationContext.cacheDir.absolutePath
    var lastFailure: Throwable? = null
    val backends = listOf("gpu", "cpu")

    for (name in backends) {
      try {
        appendDiagnostic("initializeEngine: trying backend=$name")
        val backend =
          when (name) {
            "gpu" -> Backend.GPU()
            else -> Backend.CPU()
          }

        val candidate = Engine(
          EngineConfig(
            modelPath = modelPath,
            backend = backend,
            visionBackend = Backend.GPU(),
            audioBackend = Backend.CPU(),
            maxNumTokens = DEFAULT_MAX_TOKENS,
            cacheDir = cacheDir,
          ),
        )

        appendDiagnostic(
          "initializeEngine: config backend=$name maxTokens=$DEFAULT_MAX_TOKENS cacheDir=$cacheDir",
        )
        candidate.initialize()
        engine = candidate
        backendName = name
        state = "ready"
        lastError = null
        appendDiagnostic("initializeEngine: success backend=$name")
        Log.i(TAG, "Gemma engine initialized with $name backend")
        return
      } catch (error: Throwable) {
        lastFailure = error
        appendDiagnostic("initializeEngine: failed backend=$name error=${error.message}")
        Log.w(TAG, "Gemma initialization failed on $name backend: ${error.message}")
      }
    }

    appendDiagnostic("initializeEngine: all backends failed")
    throw IllegalStateException(
      lastFailure?.message ?: "Failed to initialize Gemma engine",
      lastFailure,
    )
  }

  private fun getModelFile(): File =
    File(File(reactApplicationContext.filesDir, "models"), MODEL_FILE_NAME)

  private fun getDiagnosticsFile(): File =
    File(reactApplicationContext.filesDir, DIAGNOSTICS_FILE_NAME)

  @Synchronized
  private fun appendDiagnostic(message: String) {
    try {
      val timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
      FileOutputStream(getDiagnosticsFile(), true).use { output ->
        output.write("[$timestamp] $message\n".toByteArray())
      }
    } catch (_: Throwable) {
      // Avoid crashing while attempting to log a crash.
    }
  }

  private fun readDiagnostics(): String {
    val file = getDiagnosticsFile()
    if (!file.exists()) return ""

    val lines = mutableListOf<String>()
    BufferedReader(InputStreamReader(FileInputStream(file))).use { reader ->
      while (true) {
        val line = reader.readLine() ?: break
        lines.add(line)
      }
    }

    return lines.takeLast(80).joinToString("\n")
  }

  private fun buildStatusMap() = Arguments.createMap().apply {
    putString("state", state)
    putBoolean("ready", engine != null)
    putString("backend", backendName)
    putString("modelPath", getModelFile().absolutePath)
    putBoolean("downloaded", getModelFile().exists())
    putDouble("downloadedBytes", downloadedBytes.toDouble())
    putDouble("totalBytes", totalBytes.toDouble())
    putString("lastError", lastError)
    putString("diagnosticsPath", getDiagnosticsFile().absolutePath)
  }
}
