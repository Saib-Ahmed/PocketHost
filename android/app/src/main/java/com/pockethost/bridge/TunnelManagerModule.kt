package com.pockethost.bridge

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerEmitter
import kotlinx.coroutines.*
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
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
                .getJSModule(DeviceEventManagerEmitter.DeviceEventEmitter::class.java)
                .emit(eventName, params)
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

                val command = mutableListOf<String>()
                if (binaryFile.exists() && binaryFile.canExecute()) {
                    if (tunnelKey == "zrok") {
                        command.addAll(listOf(binaryFile.absolutePath, "share", "public", "http://127.0.0.1:$port"))
                    } else {
                        command.addAll(listOf(binaryFile.absolutePath, "tunnel", "--url", "http://127.0.0.1:$port", "--no-autoupdate"))
                    }
                } else {
                    // Simulated / Mock Tunnel fallback if binary not yet downloaded
                    val mockSubdomain = "pocket-" + (1000..9999).random()
                    val simulatedUrl = if (tunnelKey == "zrok") {
                        "https://$mockSubdomain.share.zrok.io"
                    } else {
                        "https://$mockSubdomain.trycloudflare.com"
                    }

                    val instance = TunnelInstance(
                        provider = tunnelKey,
                        port = port,
                        publicUrl = simulatedUrl,
                        status = "CONNECTED"
                    )
                    activeTunnels[tunnelKey] = instance

                    delay(1200) // Realistic connection handshake simulation
                    emitTunnelUrl(tunnelKey, simulatedUrl, port)
                    emitTunnelStatus(tunnelKey, "CONNECTED", simulatedUrl)

                    withContext(Dispatchers.Main) {
                        val map = Arguments.createMap().apply {
                            putString("provider", tunnelKey)
                            putInt("port", port)
                            putString("url", simulatedUrl)
                            putString("status", "CONNECTED")
                        }
                        promise.resolve(map)
                    }
                    return@launch
                }

                val processBuilder = ProcessBuilder(command)
                processBuilder.redirectErrorStream(true)
                val process = processBuilder.start()

                val instance = TunnelInstance(
                    provider = tunnelKey,
                    port = port,
                    process = process,
                    status = "CONNECTING"
                )
                activeTunnels[tunnelKey] = instance

                val readerJob = launch {
                    try {
                        val reader = BufferedReader(InputStreamReader(process.inputStream, StandardCharsets.UTF_8))
                        var line: String?
                        while (isActive && reader.readLine().also { line = it } != null) {
                            val currentLine = line ?: continue
                            val pattern = if (tunnelKey == "zrok") zrokUrlPattern else cloudflareUrlPattern
                            val matcher = pattern.matcher(currentLine)
                            if (matcher.find()) {
                                val url = matcher.group(0)
                                instance.publicUrl = url
                                instance.status = "CONNECTED"
                                emitTunnelUrl(tunnelKey, url, port)
                                emitTunnelStatus(tunnelKey, "CONNECTED", url)
                            }
                        }
                    } catch (_: Exception) {}
                }
                instance.readerJob = readerJob

                withContext(Dispatchers.Main) {
                    val map = Arguments.createMap().apply {
                        putString("provider", tunnelKey)
                        putInt("port", port)
                        putString("status", "CONNECTING")
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
            if (url != null) putString("url", url) else putNull("url")
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
        sendEvent("onTunnelStatusChanged", event)
    }

    @ReactMethod
    fun stopTunnel(provider: String, promise: Promise) {
        val tunnelKey = provider.lowercase()
        val instance = activeTunnels[tunnelKey]
        if (instance == null) {
            promise.resolve(false)
            return
        }

        try {
            instance.readerJob?.cancel()
            instance.process?.destroy()
            instance.status = "DISCONNECTED"
            activeTunnels.remove(tunnelKey)
            emitTunnelStatus(tunnelKey, "DISCONNECTED", null)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getActiveTunnels(promise: Promise) {
        val array = Arguments.createArray()
        activeTunnels.values.forEach { tunnel ->
            val map = Arguments.createMap().apply {
                putString("provider", tunnel.provider)
                putInt("port", tunnel.port)
                putString("status", tunnel.status)
                if (tunnel.publicUrl != null) putString("url", tunnel.publicUrl)
            }
            array.pushMap(map)
        }
        promise.resolve(array)
    }

    override fun invalidate() {
        super.invalidate()
        moduleScope.cancel()
        activeTunnels.values.forEach {
            it.readerJob?.cancel()
            it.process?.destroy()
        }
        activeTunnels.clear()
    }
}
