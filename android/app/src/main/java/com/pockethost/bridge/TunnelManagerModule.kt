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

    // Cloudflare Quick Tunnel URL pattern — must not match api.trycloudflare.com
    private val cloudflareUrlPattern = Pattern.compile("https://(?!api[.-])([a-zA-Z0-9-]+)\\.trycloudflare\\.com")
    private val zrokUrlPattern = Pattern.compile("https://[a-zA-Z0-9-]+\\.share\\.zrok\\.io")

    data class TunnelInstance(
        val provider: String,
        val port: Int,
        var process: Process? = null,
        var publicUrl: String? = null,
        var status: String = "CONNECTING",
        var readerJob: Job? = null,
        var stderrJob: Job? = null
    )

    override fun getName(): String = "TunnelManagerModule"

    private fun sendEvent(eventName: String, params: WritableMap) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    @ReactMethod
    fun startTunnel(provider: String, port: Int, promise: Promise) {
        val tunnelKey = provider.lowercase()

        // Return existing connected tunnel immediately
        activeTunnels[tunnelKey]?.let { existing ->
            if (existing.status == "CONNECTED" && existing.publicUrl != null) {
                val map = Arguments.createMap().apply {
                    putString("provider", existing.provider)
                    putInt("port", existing.port)
                    putString("url", existing.publicUrl)
                    putString("status", existing.status)
                }
                promise.resolve(map)
                return
            }
        }

        moduleScope.launch {
            try {
                emitTunnelStatus(tunnelKey, "CONNECTING", null)

                val nativeLibDir = File(reactContext.applicationInfo.nativeLibraryDir)
                val cfLib = File(nativeLibDir, "libcloudflared.so")

                if (tunnelKey == "cloudflare" && !cfLib.exists()) {
                    val errorMsg = "libcloudflared.so not found in native library directory: ${nativeLibDir.absolutePath}"
                    android.util.Log.e("TunnelManager", errorMsg)
                    emitTunnelStatus(tunnelKey, "ERROR", null)
                    withContext(Dispatchers.Main) {
                        promise.reject("BINARY_MISSING", errorMsg)
                    }
                    return@launch
                }

                // Set executable permission
                cfLib.setExecutable(true, false)

                val rootDir = File(reactContext.filesDir, "rootfs")
                val prootLib = File(nativeLibDir, "libproot.so")
                val loaderLib = File(nativeLibDir, "libloader.so")
                val resolvConf = File(rootDir, "etc/resolv.conf")
                val sslDir = File(rootDir, "etc/ssl")
                val certFile = File(sslDir, "certs/ca-certificates.crt")

                // Ensure resolv.conf exists for container DNS resolution
                if (!resolvConf.exists()) {
                    try {
                        resolvConf.parentFile?.mkdirs()
                        resolvConf.writeText("nameserver 1.1.1.1\nnameserver 8.8.8.8\nnameserver 1.0.0.1\n")
                    } catch (_: Exception) {}
                }

                // Ensure CA certificate bundle exists in rootfs
                if (!certFile.exists() || certFile.length() == 0L) {
                    try {
                        certFile.parentFile?.mkdirs()
                        reactContext.assets.open("ca-certificates.crt").use { input ->
                            val bytes = input.readBytes()
                            certFile.writeBytes(bytes)
                            File(sslDir, "cert.pem").writeBytes(bytes)
                        }
                    } catch (e: Exception) {
                        android.util.Log.w("TunnelManager", "Could not copy ca-certificates from assets", e)
                    }
                }

                // Run cloudflared inside PRoot Alpine container so Go runtime
                // has full access to /etc/resolv.conf (DNS) and /etc/ssl/certs.
                val command = mutableListOf<String>()
                if (prootLib.exists() && rootDir.exists() && resolvConf.exists()) {
                    prootLib.setExecutable(true, false)
                    command.addAll(listOf(
                        prootLib.absolutePath,
                        "--kill-on-exit",
                        "--link2symlink",
                        "-0",
                        "-r", rootDir.absolutePath,
                        "-b", "/dev",
                        "-b", "/proc",
                        "-b", "/sys",
                        "-b", "${resolvConf.absolutePath}:/etc/resolv.conf",
                        "-b", "${sslDir.absolutePath}:/etc/ssl",
                        "-b", "${nativeLibDir.absolutePath}:${nativeLibDir.absolutePath}",
                        "-w", "/root",
                        cfLib.absolutePath,
                        "tunnel",
                        "--no-autoupdate",
                        "--edge-ip-version", "4",
                        "--url", "http://127.0.0.1:$port"
                    ))
                } else {
                    command.addAll(listOf(
                        cfLib.absolutePath,
                        "tunnel",
                        "--no-autoupdate",
                        "--edge-ip-version", "4",
                        "--url", "http://127.0.0.1:$port"
                    ))
                }

                val processBuilder = ProcessBuilder(command)
                    .directory(reactContext.cacheDir)
                processBuilder.redirectErrorStream(false) // keep stderr separate

                val procEnv = processBuilder.environment()
                procEnv["LD_LIBRARY_PATH"] = nativeLibDir.absolutePath
                if (loaderLib.exists()) {
                    procEnv["PROOT_LOADER"] = loaderLib.absolutePath
                }
                procEnv["PROOT_TMP_DIR"] = reactContext.cacheDir.absolutePath
                procEnv["HOME"] = "/root"
                procEnv["TMPDIR"] = reactContext.cacheDir.absolutePath
                val inPRoot = prootLib.exists() && rootDir.exists() && resolvConf.exists()
                if (inPRoot) {
                    procEnv["SSL_CERT_FILE"] = "/etc/ssl/certs/ca-certificates.crt"
                    procEnv["SSL_CERT_DIR"] = "/etc/ssl/certs"
                    procEnv["CURL_CA_BUNDLE"] = "/etc/ssl/certs/ca-certificates.crt"
                } else if (certFile.exists()) {
                    procEnv["SSL_CERT_FILE"] = certFile.absolutePath
                    procEnv["SSL_CERT_DIR"] = sslDir.absolutePath
                }

                val process = processBuilder.start()

                val instance = TunnelInstance(provider = tunnelKey, port = port, process = process, status = "CONNECTING")
                activeTunnels[tunnelKey] = instance

                val urlDeferred = CompletableDeferred<String>()
                var lastErrorMessage = ""

                // Cloudflare logs URL to stderr
                val readerJob = moduleScope.launch {
                    try {
                        val reader = BufferedReader(InputStreamReader(process.errorStream, StandardCharsets.UTF_8))
                        var line: String? = null
                        while (isActive && reader.readLine().also { line = it } != null) {
                            val currentLine = line ?: continue
                            android.util.Log.d("CloudflareTunnel", currentLine)
                            if (currentLine.contains("ERR ") || currentLine.contains("failed to request quick Tunnel")) {
                                lastErrorMessage = currentLine
                            }
                            val matcher = cloudflareUrlPattern.matcher(currentLine)
                            if (matcher.find()) {
                                val url = matcher.group(0)!!
                                if (!url.contains("api.trycloudflare.com")) {
                                    instance.publicUrl = url
                                    instance.status = "CONNECTED"
                                    if (!urlDeferred.isCompleted) {
                                        urlDeferred.complete(url)
                                    }
                                    emitTunnelUrl(tunnelKey, url, port)
                                    emitTunnelStatus(tunnelKey, "CONNECTED", url)
                                }
                            }
                        }
                    } catch (_: Exception) {}
                }

                // Also drain stdout (usually empty for cloudflared)
                val stdoutJob = moduleScope.launch {
                    try {
                        val reader = BufferedReader(InputStreamReader(process.inputStream, StandardCharsets.UTF_8))
                        var line: String? = null
                        while (isActive && reader.readLine().also { line = it } != null) {
                            val currentLine = line ?: continue
                            android.util.Log.d("CloudflareTunnel/stdout", currentLine)
                            // Some cloudflared versions print URL to stdout too
                            val matcher = cloudflareUrlPattern.matcher(currentLine)
                            if (matcher.find()) {
                                val url = matcher.group(0)!!
                                if (!url.contains("api.trycloudflare.com")) {
                                    if (!urlDeferred.isCompleted) {
                                        urlDeferred.complete(url)
                                    }
                                    instance.publicUrl = url
                                    instance.status = "CONNECTED"
                                    emitTunnelUrl(tunnelKey, url, port)
                                    emitTunnelStatus(tunnelKey, "CONNECTED", url)
                                }
                            }
                        }
                    } catch (_: Exception) {}
                }

                instance.readerJob = readerJob
                instance.stderrJob = stdoutJob

                // Wait up to 25 seconds for tunnel URL
                val publicUrl = try {
                    withTimeout(25000) {
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
                    // Try to read any process output for diagnostics
                    val procAlive = try { process.isAlive } catch (_: Exception) { false }
                    val exitCodeStr = if (!procAlive) "exit code: ${try { process.exitValue() } catch(_: Exception) { "?" }}" else "process still running"
                    val detail = if (lastErrorMessage.isNotEmpty()) "\nDetail: $lastErrorMessage" else ""
                    val errorMsg = "Cloudflare tunnel failed to establish public URL within 25 seconds ($exitCodeStr).$detail"
                    android.util.Log.e("TunnelManager", errorMsg)
                    emitTunnelStatus(tunnelKey, "ERROR", null)
                    withContext(Dispatchers.Main) {
                        promise.reject("TUNNEL_TIMEOUT", errorMsg)
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("TunnelManager", "Tunnel error", e)
                emitTunnelStatus(tunnelKey, "ERROR", null)
                withContext(Dispatchers.Main) {
                    promise.reject("TUNNEL_ERROR", e.message ?: "Unknown tunnel error", e)
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
            instance.stderrJob?.cancel()
            try {
                instance.process?.destroyForcibly()
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
            tunnel.stderrJob?.cancel()
            try { tunnel.process?.destroyForcibly() } catch (_: Exception) {}
        }
        activeTunnels.clear()
        moduleScope.cancel()
    }
}
