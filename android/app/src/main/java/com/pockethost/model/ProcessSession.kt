package com.pockethost.model

import kotlinx.coroutines.Job
import java.io.BufferedWriter
import java.io.File
import java.io.OutputStreamWriter
import java.nio.charset.StandardCharsets

data class ProcessSession(
    val sessionId: String,
    val sessionType: SessionType,
    val command: List<String>,
    val workingDir: File,
    val env: Map<String, String>,
    var process: Process? = null,
    var status: ProcessStatus = ProcessStatus.IDLE,
    var exitCode: Int? = null,
    val startTime: Long = System.currentTimeMillis(),
    var stdoutJob: Job? = null,
    var stderrJob: Job? = null,
    private var stdinWriter: BufferedWriter? = null
) {
    fun setupStdin() {
        process?.outputStream?.let {
            stdinWriter = BufferedWriter(OutputStreamWriter(it, StandardCharsets.UTF_8))
        }
    }

    fun writeStdin(input: String) {
        stdinWriter?.let { writer ->
            writer.write(input)
            if (!input.endsWith("\n")) {
                writer.newLine()
            }
            writer.flush()
        }
    }

    fun terminate(force: Boolean = false) {
        process?.let { p ->
            try {
                stdinWriter?.close()
            } catch (_: Exception) {}

            if (force) {
                p.destroyForcibly()
            } else {
                p.destroy()
            }
        }
        stdoutJob?.cancel()
        stderrJob?.cancel()
        status = ProcessStatus.STOPPED
    }
}
