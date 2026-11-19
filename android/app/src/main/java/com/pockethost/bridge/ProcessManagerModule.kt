package com.pockethost.bridge

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.pockethost.model.ProcessSession
import com.pockethost.model.ProcessStatus
import com.pockethost.model.SessionType
import kotlinx.coroutines.*
import java.io.BufferedReader
import java.io.File
import java.io.InputStream
import java.io.InputStreamReader
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap

class ProcessManagerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val moduleScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = "ProcessManagerModule"

    companion object {
        val activeSessions = ConcurrentHashMap<String, ProcessSession>()
        fun getSession(sessionId: String): ProcessSession? = activeSessions[sessionId]
    }

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
    fun createSession(
        sessionId: String,
        commandArray: ReadableArray,
        workingDirPath: String?,
        envMap: ReadableMap?,
        sessionTypeStr: String?,
        promise: Promise
    ) {
        try {
            if (activeSessions.containsKey(sessionId)) {
                promise.reject("SESSION_EXISTS", "Session with ID $sessionId already exists.")
                return
            }

            val command = mutableListOf<String>()
            for (i in 0 until commandArray.size()) {
                commandArray.getString(i)?.let { command.add(it) }
            }

            val workingDir = if (!workingDirPath.isNullOrEmpty()) {
                val dir = File(workingDirPath)
                if (!dir.exists()) dir.mkdirs()
                dir
            } else {
                reactContext.filesDir
            }

            val env = mutableMapOf<String, String>()
            envMap?.let {
                val iterator = it.keySetIterator()
                while (iterator.hasNextKey()) {
                    val key = iterator.nextKey()
                    it.getString(key)?.let { value -> env[key] = value }
                }
            }

            val sessionType = try {
                SessionType.valueOf(sessionTypeStr ?: "SHELL")
            } catch (_: Exception) {
                SessionType.SHELL
            }

            val session = ProcessSession(
                sessionId = sessionId,
                sessionType = sessionType,
                command = command,
                workingDir = workingDir,
                env = env
            )

            activeSessions[sessionId] = session
            promise.resolve(sessionId)
        } catch (e: Exception) {
            promise.reject("CREATE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun startSession(sessionId: String, promise: Promise) {
        val session = activeSessions[sessionId]
        if (session == null) {
            promise.reject("NOT_FOUND", "Session $sessionId not found.")
            return
        }

        if (session.status == ProcessStatus.RUNNING) {
            promise.reject("ALREADY_RUNNING", "Session $sessionId is already running.")
            return
        }

        moduleScope.launch {
            try {
                val nativeLibDir = File(reactContext.applicationInfo.nativeLibraryDir)
                val prootLib = File(nativeLibDir, "libproot.so")
                val loaderLib = File(nativeLibDir, "libloader.so")
                val rootDir = getRootDir()

                ensureDnsAndSsl(rootDir)

                val resolvConf = File(rootDir, "etc/resolv.conf")
                val sslDir = File(rootDir, "etc/ssl")
                val certFile = File(sslDir, "certs/ca-certificates.crt")

                val fullCommand = mutableListOf<String>()

                if (prootLib.exists() && rootDir.exists() && File(rootDir, "bin/sh").exists()) {
                    // Build the shell command string from the session command parts
                    val cmdStr = session.command.joinToString(" ")

                    fullCommand.addAll(listOf(
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
                        "-b", "${certFile.absolutePath}:/etc/ssl/certs/ca-certificates.crt",
                        "-b", "${session.workingDir.absolutePath}:/workspace",
                        "-b", "${nativeLibDir.absolutePath}:${nativeLibDir.absolutePath}",
                        "-w", "/workspace",
                        "/bin/sh",
                        "-c",
                        "export PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin; export HOME=/root; export TERM=xterm; $cmdStr"
                    ))
                } else {
                    // No PRoot — run command directly (fallback for non-Linux commands)
                    fullCommand.addAll(session.command)
                }

                val processBuilder = ProcessBuilder(fullCommand)
                    .directory(session.workingDir)

                val procEnv = processBuilder.environment()
                session.env.forEach { (k, v) -> procEnv[k] = v }
                procEnv["LD_LIBRARY_PATH"] = nativeLibDir.absolutePath
                if (loaderLib.exists()) {
                    procEnv["PROOT_LOADER"] = loaderLib.absolutePath
                }
                procEnv["PROOT_TMP_DIR"] = reactContext.cacheDir.absolutePath
                procEnv["HOME"] = "/root"
                procEnv["TMPDIR"] = reactContext.cacheDir.absolutePath
                procEnv["TERM"] = "xterm"
                procEnv["LANG"] = "en_US.UTF-8"

                val process = processBuilder.start()
                session.process = process
                session.setupStdin()
                session.status = ProcessStatus.RUNNING

                withContext(Dispatchers.Main) {
                    emitStatusChange(sessionId, ProcessStatus.RUNNING, null)
                }

                // Start stdout reader coroutine
                session.stdoutJob = moduleScope.launch {
                    streamOutput(sessionId, process.inputStream, "stdout")
                }

                // Start stderr reader coroutine
                session.stderrJob = moduleScope.launch {
                    streamOutput(sessionId, process.errorStream, "stderr")
                }

                // Monitor process completion in background
                moduleScope.launch {
                    val exitCode = try {
                        process.waitFor()
                    } catch (_: InterruptedException) {
                        -1
                    }
                    session.exitCode = exitCode
                    session.status = if (exitCode == 0) ProcessStatus.STOPPED else ProcessStatus.FAILED
                    withContext(Dispatchers.Main) {
                        emitStatusChange(sessionId, session.status, exitCode)
                    }
                }

                withContext(Dispatchers.Main) {
                    promise.resolve(true)
                }
            } catch (e: Exception) {
                session.status = ProcessStatus.FAILED
                withContext(Dispatchers.Main) {
                    emitStatusChange(sessionId, ProcessStatus.FAILED, -1)
                    promise.reject("START_ERROR", e.message, e)
                }
            }
        }
    }

    private suspend fun streamOutput(sessionId: String, inputStream: InputStream, streamType: String) {
        withContext(Dispatchers.IO) {
            try {
                val reader = BufferedReader(InputStreamReader(inputStream, StandardCharsets.UTF_8))
                val buffer = CharArray(2048)
                var bytesRead: Int

                while (isActive && reader.read(buffer).also { bytesRead = it } != -1) {
                    val text = String(buffer, 0, bytesRead)
                    withContext(Dispatchers.Main) {
                        val event = Arguments.createMap().apply {
                            putString("sessionId", sessionId)
                            putString("text", text)
                            putString("streamType", streamType)
                            putDouble("timestamp", System.currentTimeMillis().toDouble())
                        }
                        sendEvent("onProcessOutput", event)
                    }
                }
            } catch (_: Exception) {}
        }
    }

    private fun emitStatusChange(sessionId: String, status: ProcessStatus, exitCode: Int?) {
        val event = Arguments.createMap().apply {
            putString("sessionId", sessionId)
            putString("status", status.name)
            if (exitCode != null) {
                putInt("exitCode", exitCode)
            } else {
                putNull("exitCode")
            }
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
        sendEvent("onProcessStatusChange", event)
    }

    @ReactMethod
    fun writeStdin(sessionId: String, input: String, promise: Promise) {
        val session = activeSessions[sessionId]
        if (session == null) {
            promise.reject("NOT_FOUND", "Session $sessionId not found.")
            return
        }

        try {
            session.writeStdin(input)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STDIN_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun terminateSession(sessionId: String, force: Boolean, promise: Promise) {
        val session = activeSessions[sessionId] ?: run {
            promise.resolve(false)
            return
        }

        try {
            session.terminate(force)
            activeSessions.remove(sessionId)
            emitStatusChange(sessionId, ProcessStatus.STOPPED, session.exitCode ?: 0)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("TERMINATE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun listSessions(promise: Promise) {
        val array = Arguments.createArray()
        activeSessions.values.forEach { session ->
            val map = Arguments.createMap().apply {
                putString("sessionId", session.sessionId)
                putString("sessionType", session.sessionType.name)
                putString("status", session.status.name)
                putDouble("startTime", session.startTime.toDouble())
                if (session.exitCode != null) putInt("exitCode", session.exitCode!!)
            }
            array.pushMap(map)
        }
        promise.resolve(array)
    }

    @ReactMethod
    fun getSessionStatus(sessionId: String, promise: Promise) {
        val session = activeSessions[sessionId]
        if (session == null) {
            promise.reject("NOT_FOUND", "Session $sessionId not found.")
            return
        }

        val map = Arguments.createMap().apply {
            putString("sessionId", session.sessionId)
            putString("sessionType", session.sessionType.name)
            putString("status", session.status.name)
            putDouble("startTime", session.startTime.toDouble())
            if (session.exitCode != null) putInt("exitCode", session.exitCode!!)
        }
        promise.resolve(map)
    }

    @ReactMethod
    fun startProjectServer(
        projectId: String,
        projectName: String,
        stackId: String,
        port: Int,
        promise: Promise
    ) {
        // No-op: real runtime launched via startSession → PRoot
        promise.resolve(true)
    }

    @ReactMethod
    fun stopProjectServer(projectId: String, promise: Promise) {
        promise.resolve(true)
    }

    override fun invalidate() {
        super.invalidate()
        moduleScope.cancel()
        activeSessions.values.forEach { it.terminate(force = true) }
        activeSessions.clear()
    }
}
