package com.pockethost.bridge

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
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
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    private fun getRootDir(): File = File(reactContext.filesDir, "rootfs")

    private fun ensureDnsAndSsl(rootDir: File) {
        val etcDir = File(rootDir, "etc")
        etcDir.mkdirs()
        val resolvConf = File(etcDir, "resolv.conf")
        if (!resolvConf.exists() || resolvConf.length() < 10) {
            resolvConf.writeText("nameserver 1.1.1.1\nnameserver 8.8.8.8\nnameserver 1.0.0.1\n")
        }
        val sslDir = File(etcDir, "ssl")
        val certsDir = File(sslDir, "certs")
        certsDir.mkdirs()
        val certFile = File(certsDir, "ca-certificates.crt")
        if (!certFile.exists() || certFile.length() < 1000) {
            try {
                reactContext.assets.open("ca-certificates.crt").use { input ->
                    val bytes = input.readBytes()
                    File(sslDir, "cert.pem").writeBytes(bytes)
                    certFile.writeBytes(bytes)
                }
            } catch (_: Exception) {}
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

                val nativeLibDir = File(reactContext.applicationInfo.nativeLibraryDir)
                val prootLib = File(nativeLibDir, "libproot.so")
                val loaderLib = File(nativeLibDir, "libloader.so")
                val cfLib = File(nativeLibDir, "libcloudflared.so")
                val rootDir = getRootDir()
                ensureDnsAndSsl(rootDir)

                val resolvConf = File(rootDir, "etc/resolv.conf")
                val sslDir = File(rootDir, "etc/ssl")
                val certFile = File(sslDir, "certs/ca-certificates.crt")

                if (tunnelKey == "cloudflare" && !cfLib.exists()) {
                    val errorMsg = "libcloudflared.so not found in native library directory."
                    emitTunnelStatus(tunnelKey, "ERROR", null)
                    withContext(Dispatchers.Main) {
                        promise.reject("BINARY_MISSING", errorMsg)
                    }
                    return@launch
                }

                val command = mutableListOf<String>()
                if (prootLib.exists()) {
                    command.addAll(listOf(
                        prootLib.absolutePath,
                        "--link2symlink",
                        "-0",
                        "-r", rootDir.absolutePath,
                        "-b", "/dev",
                        "-b", "/proc",
                        "-b", "/sys",
                        "-b", "${resolvConf.absolutePath}:/etc/resolv.conf",
                        "-b", "${sslDir.absolutePath}:/etc/ssl",
                        "-b", "${certFile.absolutePath}:/etc/ssl/certs/ca-certificates.crt",
                        cfLib.absolutePath,
                        "tunnel",
                        "--url", "http://127.0.0.1:$port",
                        "--no-autoupdate"
                    ))
                } else {
                    command.addAll(listOf(cfLib.absolutePath, "tunnel", "--url", "http://127.0.0.1:$port", "--no-autoupdate"))
                }

                val processBuilder = ProcessBuilder(command)
                processBuilder.directory(reactContext.filesDir)
                val env = processBuilder.environment()
                env["LD_LIBRARY_PATH"] = nativeLibDir.absolutePath
                if (loaderLib.exists()) {
                    env["PROOT_LOADER"] = loaderLib.absolutePath
                }
                env["PROOT_TMP_DIR"] = reactContext.cacheDir.absolutePath
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
                            android.util.Log.d("CloudflareTunnel", currentLine)
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

                // Wait up to 15 seconds for tunnel URL to be established
                val publicUrl = try {
                    withTimeout(15000) {
                        urlDeferred.await()
                    }
                } catch (_: Exception) {
                    null
                }

                if (publicUrl != null) {
                    withContext(Dispatchers.Main) {
                        val map = Arguments.createMap().apply {
                            putString("provider", tunnelKey)
                            putInt("port", port)
                            putString("url", publicUrl)
                            putString("status", "CONNECTED")
                        }
                        promise.resolve(map)
                    }
                } else {
                    emitTunnelStatus(tunnelKey, "ERROR", null)
                    withContext(Dispatchers.Main) {
                        promise.reject("TUNNEL_TIMEOUT", "Cloudflare tunnel failed to establish public URL within 15 seconds. Please check your device internet connection.")
                    }
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
