package com.pockethost.bridge

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.io.BufferedReader
import java.io.File
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import java.util.regex.Pattern

class TunnelManagerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val moduleScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val activeTunnels = ConcurrentHashMap<String, TunnelInstance>()

    private val cloudflareUrlPattern = Pattern.compile("https://[a-zA-Z0-9-]+\\.trycloudflare\\.com")
    private val zrokUrlPattern = Pattern.compile("https://[a-zA-Z0-9-]+\\.share\\.zrok\\.io")

    data class TunnelInstance(
        val provider: String,
        val port: Int,
        var process: Process? = null,
        var publicUrl: String? = null,
        var status: String = "CONNECTING",
        var readerJob: Job? = null
    )

    override fun getName(): String = "TunnelManagerModule"

    private fun sendEvent(eventName: String, params: WritableMap) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    private suspend fun ensureBinary(binaryFile: File, tunnelKey: String): Boolean {
        if (binaryFile.exists() && binaryFile.length() > 5000000L) {
            binaryFile.setExecutable(true, false)
            return true
        }

        if (tunnelKey != "cloudflare") return false

        return withContext(Dispatchers.IO) {
            try {
                binaryFile.parentFile?.mkdirs()
                val urlStr = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
                var currentUrl = urlStr
                var conn: HttpURLConnection
                var redirectCount = 0
                while (true) {
                    conn = URL(currentUrl).openConnection() as HttpURLConnection
                    conn.instanceFollowRedirects = true
                    conn.connectTimeout = 15000
                    conn.readTimeout = 30000
                    val code = conn.responseCode
                    if ((code in 301..308) && redirectCount < 6) {
                        currentUrl = conn.getHeaderField("Location") ?: break
                        conn.disconnect()
                        redirectCount++
                        continue
                    }
                    break
                }
                val temp = File(binaryFile.parentFile, "${binaryFile.name}.tmp")
                conn.inputStream.use { input ->
                    FileOutputStream(temp).use { output ->
                        input.copyTo(output)
                    }
                }
                if (binaryFile.exists()) binaryFile.delete()
                temp.renameTo(binaryFile)
                binaryFile.setExecutable(true, false)
                binaryFile.setReadable(true, false)
                binaryFile.exists() && binaryFile.length() > 5000000L
            } catch (_: Exception) {
                false
            }
        }
    }

    @ReactMethod
    fun startTunnel(provider: String, port: Int, promise: Promise) {
        val tunnelKey = provider.lowercase()
        if (activeTunnels[tunnelKey]?.status == "CONNECTED") {
            val existing = activeTunnels[tunnelKey]!!
            val map = Arguments.createMap().apply {
                putString("provider", existing.provider)
                putInt("port", existing.port)
                putString("url", existing.publicUrl)
                putString("status", existing.status)
            }
            promise.resolve(map)
            return
        }

        moduleScope.launch {
            try {
                emitTunnelStatus(tunnelKey, "CONNECTING", null)

                val binDir = File(reactContext.filesDir, "bin")
                val binaryName = if (tunnelKey == "zrok") "zrok" else "cloudflared"
                val binaryFile = File(binDir, binaryName)

                val hasBinary = ensureBinary(binaryFile, tunnelKey)
                if (!hasBinary) {
                    val errorMsg = "${binaryName.capitalize()} binary is not available. Please install it from Packages & Storage."
                    emitTunnelStatus(tunnelKey, "ERROR", null)
                    withContext(Dispatchers.Main) {
                        promise.reject("BINARY_MISSING", errorMsg)
                    }
                    return@launch
                }

                val command = mutableListOf<String>()
                if (tunnelKey == "zrok") {
                    command.addAll(listOf(binaryFile.absolutePath, "share", "public", "http://127.0.0.1:$port"))
                } else {
                    command.addAll(listOf(binaryFile.absolutePath, "tunnel", "--url", "http://127.0.0.1:$port", "--no-autoupdate"))
                }

                val processBuilder = ProcessBuilder(command)
                processBuilder.directory(reactContext.filesDir)
                val env = processBuilder.environment()
                env["HOME"] = reactContext.filesDir.absolutePath
                env["TMPDIR"] = reactContext.cacheDir.absolutePath
                processBuilder.redirectErrorStream(true)
                val process = processBuilder.start()

                val instance = TunnelInstance(
                    provider = tunnelKey,
                    port = port,
                    process = process,
                    status = "CONNECTING"
                )
                activeTunnels[tunnelKey] = instance

                val urlDeferred = CompletableDeferred<String>()

                val readerJob = launch {
                    try {
                        val reader = BufferedReader(InputStreamReader(process.inputStream, StandardCharsets.UTF_8))
                        var line: String? = null
                        while (isActive && reader.readLine().also { line = it } != null) {
                            val currentLine = line ?: continue
                            android.util.Log.d("TunnelCLI", currentLine)
                            val pattern = if (tunnelKey == "zrok") zrokUrlPattern else cloudflareUrlPattern
                            val matcher = pattern.matcher(currentLine)
                            if (matcher.find()) {
                                val url = matcher.group(0)
                                instance.publicUrl = url
                                instance.status = "CONNECTED"
                                if (!urlDeferred.isCompleted) {
                                    urlDeferred.complete(url)
                                }
                                emitTunnelUrl(tunnelKey, url, port)
                                emitTunnelStatus(tunnelKey, "CONNECTED", url)
                            }
                        }
                    } catch (_: Exception) {}
                }
                instance.readerJob = readerJob

                // Wait up to 8.5 seconds for tunnel URL to be established
                val publicUrl = try {
                    withTimeout(8500) {
                        urlDeferred.await()
                    }
                } catch (_: Exception) {
                    null
                }

                withContext(Dispatchers.Main) {
                    val map = Arguments.createMap().apply {
                        putString("provider", tunnelKey)
                        putInt("port", port)
                        putString("url", publicUrl)
                        putString("status", if (publicUrl != null) "CONNECTED" else "CONNECTING")
                    }
                    promise.resolve(map)
                }
            } catch (e: Exception) {
                emitTunnelStatus(tunnelKey, "ERROR", null)
                withContext(Dispatchers.Main) {
                    promise.reject("TUNNEL_ERROR", e.message, e)
                }
            }
        }
    }

    private fun emitTunnelUrl(provider: String, url: String, port: Int) {
        val event = Arguments.createMap().apply {
            putString("provider", provider)
            putString("url", url)
            putInt("port", port)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
        sendEvent("onTunnelUrlGenerated", event)
    }

    private fun emitTunnelStatus(provider: String, status: String, url: String?) {
        val event = Arguments.createMap().apply {
            putString("provider", provider)
            putString("status", status)
            if (url != null) putString("url", url)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
        sendEvent("onTunnelStatusChanged", event)
    }

    @ReactMethod
    fun stopTunnel(provider: String, promise: Promise) {
        val tunnelKey = provider.lowercase()
        val instance = activeTunnels.remove(tunnelKey)
        if (instance != null) {
            instance.readerJob?.cancel()
            try {
                instance.process?.destroy()
            } catch (_: Exception) {}
            emitTunnelStatus(tunnelKey, "DISCONNECTED", null)
            promise.resolve(true)
        } else {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun getActiveTunnels(promise: Promise) {
        val array = Arguments.createArray()
        activeTunnels.values.forEach { tunnel ->
            val map = Arguments.createMap().apply {
                putString("provider", tunnel.provider)
                putInt("port", tunnel.port)
                if (tunnel.publicUrl != null) putString("url", tunnel.publicUrl)
                putString("status", tunnel.status)
            }
            array.pushMap(map)
        }
        promise.resolve(array)
    }

    override fun invalidate() {
        super.invalidate()
        activeTunnels.values.forEach { tunnel ->
            tunnel.readerJob?.cancel()
            try { tunnel.process?.destroy() } catch (_: Exception) {}
        }
        activeTunnels.clear()
        moduleScope.cancel()
    }
}
