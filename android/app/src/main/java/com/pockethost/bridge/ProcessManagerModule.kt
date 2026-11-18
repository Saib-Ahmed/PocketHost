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

    private val sessions = ConcurrentHashMap<String, ProcessSession>()
    private val moduleScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = "ProcessManagerModule"

    private fun sendEvent(eventName: String, params: WritableMap) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
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
            if (sessions.containsKey(sessionId)) {
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

            sessions[sessionId] = session
            promise.resolve(sessionId)
        } catch (e: Exception) {
            promise.reject("CREATE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun startSession(sessionId: String, promise: Promise) {
        val session = sessions[sessionId]
        if (session == null) {
            promise.reject("NOT_FOUND", "Session $sessionId not found.")
            return
        }

        if (session.status == ProcessStatus.RUNNING) {
            promise.reject("ALREADY_RUNNING", "Session $sessionId is already running.")
            return
        }

        try {
            val processBuilder = ProcessBuilder(session.command)
                .directory(session.workingDir)

            val procEnv = processBuilder.environment()
            session.env.forEach { (k, v) -> procEnv[k] = v }

            // Ensure standard paths
            val currentPath = procEnv["PATH"] ?: ""
            val internalBin = "${reactContext.filesDir.absolutePath}/bin"
            procEnv["PATH"] = "$internalBin:$currentPath:/system/bin:/system/xbin"
            procEnv["HOME"] = reactContext.filesDir.absolutePath
            procEnv["TMPDIR"] = reactContext.cacheDir.absolutePath

            val process = processBuilder.start()
            session.process = process
            session.setupStdin()
            session.status = ProcessStatus.RUNNING

            emitStatusChange(sessionId, ProcessStatus.RUNNING, null)

            // Start stdout reader
            session.stdoutJob = moduleScope.launch {
                streamOutput(sessionId, process.inputStream, "stdout")
            }

            // Start stderr reader
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
                emitStatusChange(sessionId, session.status, exitCode)
            }

            promise.resolve(true)
        } catch (e: Exception) {
            session.status = ProcessStatus.FAILED
            emitStatusChange(sessionId, ProcessStatus.FAILED, -1)
            promise.reject("START_ERROR", e.message, e)
        }
    }

    private suspend fun streamOutput(sessionId: String, inputStream: InputStream, streamType: String) {
        withContext(Dispatchers.IO) {
            try {
                val reader = BufferedReader(InputStreamReader(inputStream, StandardCharsets.UTF_8))
                val buffer = CharArray(2048)
                var bytesRead = 0

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
        val session = sessions[sessionId]
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
        val session = sessions[sessionId]
        if (session == null) {
            promise.reject("NOT_FOUND", "Session $sessionId not found.")
            return
        }

        try {
            session.terminate(force)
            emitStatusChange(sessionId, ProcessStatus.STOPPED, session.exitCode ?: 0)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("TERMINATE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun listSessions(promise: Promise) {
        val array = Arguments.createArray()
        sessions.values.forEach { session ->
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
        val session = sessions[sessionId]
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

    private val embeddedServers = ConcurrentHashMap<String, EmbeddedProjectServer>()

    @ReactMethod
    fun startProjectServer(
        projectId: String,
        projectName: String,
        stackId: String,
        port: Int,
        promise: Promise
    ) {
        try {
            embeddedServers[projectId]?.stop()
            val projDir = File(File(reactContext.filesDir, "projects"), projectId)
            if (!projDir.exists()) projDir.mkdirs()

            val server = EmbeddedProjectServer(
                projectId = projectId,
                projectName = projectName,
                stackId = stackId,
                port = port,
                projectDir = projDir,
                onLog = { text, channel ->
                    val params = Arguments.createMap().apply {
                        putString("sessionId", "srv-$projectId")
                        putString("channel", channel)
                        putString("text", text)
                        putDouble("timestamp", System.currentTimeMillis().toDouble())
                        putString("projectId", projectId)
                    }
                    sendEvent("onProcessOutput", params)
                }
            )
            server.start()
            embeddedServers[projectId] = server
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SERVER_START_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopProjectServer(projectId: String, promise: Promise) {
        try {
            val server = embeddedServers.remove(projectId)
            server?.stop()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SERVER_STOP_ERROR", e.message, e)
        }
    }

    override fun invalidate() {
        super.invalidate()
        moduleScope.cancel()
        embeddedServers.values.forEach { it.stop() }
        embeddedServers.clear()
        sessions.values.forEach { it.terminate(force = true) }
        sessions.clear()
    }
}
