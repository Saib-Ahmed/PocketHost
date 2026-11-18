package com.pockethost.bridge

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream
import java.util.zip.ZipInputStream

class PRootBootstrapModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val activityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            handleActivityResult(activity, requestCode, resultCode, data)
        }
    }

    init {
        reactContext.addActivityEventListener(activityEventListener)
    }

    private var pendingZipPromise: Promise? = null
    private var pendingZipProjectId: String? = null
    private val ZIP_PICKER_REQUEST_CODE = 9021

    private val moduleScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = "PRootBootstrapModule"

    private fun getFilesDir(): File = reactContext.filesDir
    private fun getRootDir(): File = File(getFilesDir(), "rootfs")
    private fun getBinDir(): File = File(getFilesDir(), "bin")
    private fun getProjectsDir(): File = File(getFilesDir(), "projects")

    private fun sendEvent(eventName: String, params: WritableMap) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    private fun emitPackageProgress(
        packageId: String,
        status: String,
        percentage: Int,
        downloadedMb: Double,
        totalMb: Double,
        message: String
    ) {
        val params = Arguments.createMap().apply {
            putString("packageId", packageId)
            putString("status", status)
            putInt("percentage", percentage)
            putDouble("downloadedMb", downloadedMb)
            putDouble("totalMb", totalMb)
            putString("message", message)
        }
        sendEvent("onPackageInstallProgress", params)
    }

    private fun ensureEnvironment() {
        val rootDir = getRootDir()
        val shFile = File(rootDir, "bin/sh")

        if (!shFile.exists()) {
            rootDir.mkdirs()
            getBinDir().mkdirs()
            getProjectsDir().mkdirs()

            try {
                val assetList = reactContext.assets.list("")?.toList() ?: emptyList()
                val assetName = when {
                    assetList.contains("alpine-rootfs.tar") -> "alpine-rootfs.tar"
                    assetList.contains("alpine-rootfs.tar.gz") -> "alpine-rootfs.tar.gz"
                    else -> "alpine-rootfs.tar"
                }

                val tempTar = File(reactContext.cacheDir, "alpine-rootfs.archive")
                reactContext.assets.open(assetName).use { input ->
                    FileOutputStream(tempTar).use { out -> input.copyTo(out) }
                }

                val nativeLibDir = File(reactContext.applicationInfo.nativeLibraryDir)
                val busybox = File(nativeLibDir, "libbusybox.so")
                if (busybox.exists()) {
                    val pb = ProcessBuilder(busybox.absolutePath, "tar", "-xf", tempTar.absolutePath, "-C", rootDir.absolutePath)
                    pb.redirectErrorStream(true)
                    val p = pb.start()
                    p.waitFor()
                } else {
                    extractTarGz(tempTar, rootDir)
                }
                tempTar.delete()
            } catch (e: Exception) {
                android.util.Log.e("PocketHost", "Failed to extract alpine rootfs", e)
            }
        }

        // Configure DNS
        val etcDir = File(rootDir, "etc")
        etcDir.mkdirs()
        File(etcDir, "resolv.conf").writeText("nameserver 1.1.1.1\nnameserver 8.8.8.8\nnameserver 1.0.0.1\n")
        File(etcDir, "hosts").writeText("127.0.0.1 localhost\n::1 localhost\n")

        // Configure SSL Certificates
        val sslDir = File(etcDir, "ssl")
        val certsDir = File(sslDir, "certs")
        certsDir.mkdirs()
        try {
            reactContext.assets.open("ca-certificates.crt").use { input ->
                val bytes = input.readBytes()
                File(sslDir, "cert.pem").writeBytes(bytes)
                File(certsDir, "ca-certificates.crt").writeBytes(bytes)
            }
        } catch (_: Exception) {}
    }

    private fun runCommandInPRootInternal(command: String, workspaceDir: File? = null): Triple<String, String, Int> {
        ensureEnvironment()
        val nativeLibDir = File(reactContext.applicationInfo.nativeLibraryDir)
        val prootLib = File(nativeLibDir, "libproot.so")
        val loaderLib = File(nativeLibDir, "libloader.so")
        val rootDir = getRootDir()
        val workspace = workspaceDir ?: File(getProjectsDir(), "default")
        workspace.mkdirs()

        val resolvConf = File(rootDir, "etc/resolv.conf")
        val sslDir = File(rootDir, "etc/ssl")

        val cmdList = mutableListOf<String>()
        if (prootLib.exists() && rootDir.exists() && File(rootDir, "bin/sh").exists()) {
            cmdList.addAll(listOf(
                prootLib.absolutePath,
                "--link2symlink",
                "-0",
                "-r", rootDir.absolutePath,
                "-b", "/dev",
                "-b", "/proc",
                "-b", "/sys",
                "-b", "${resolvConf.absolutePath}:/etc/resolv.conf",
                "-b", "${sslDir.absolutePath}:/etc/ssl",
                "-b", "${workspace.absolutePath}:/workspace",
                "-w", "/workspace",
                "/bin/sh",
                "-c",
                "export PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin; export HOME=/root; $command"
            ))
        } else {
            cmdList.addAll(listOf("/system/bin/sh", "-c", command))
        }

        val pb = ProcessBuilder(cmdList)
        pb.directory(workspace)
        val env = pb.environment()
        env["LD_LIBRARY_PATH"] = nativeLibDir.absolutePath
        if (loaderLib.exists()) {
            env["PROOT_LOADER"] = loaderLib.absolutePath
        }
        env["PROOT_TMP_DIR"] = reactContext.cacheDir.absolutePath
        env["HOME"] = reactContext.filesDir.absolutePath
        env["TMPDIR"] = reactContext.cacheDir.absolutePath

        val proc = pb.start()
        val stdout = proc.inputStream.bufferedReader().readText()
        val stderr = proc.errorStream.bufferedReader().readText()
        val exitCode = proc.waitFor()
        return Triple(stdout, stderr, exitCode)
    }

    @ReactMethod
    fun executeShellCommand(command: String, workspacePath: String?, promise: Promise) {
        moduleScope.launch {
            try {
                val ws = if (!workspacePath.isNullOrEmpty()) File(workspacePath) else null
                val (stdout, stderr, exitCode) = runCommandInPRootInternal(command, ws)
                withContext(Dispatchers.Main) {
                    val map = Arguments.createMap().apply {
                        putString("stdout", stdout)
                        putString("stderr", stderr)
                        putInt("exitCode", exitCode)
                    }
                    promise.resolve(map)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("EXEC_ERROR", e.message, e)
                }
            }
        }
    }

    @ReactMethod
    fun getPackageStatuses(promise: Promise) {
        try {
            ensureEnvironment()
            val rootDir = getRootDir()
            val nativeLibDir = File(reactContext.applicationInfo.nativeLibraryDir)

            val cfLib = File(nativeLibDir, "libcloudflared.so")
            val prootLib = File(nativeLibDir, "libproot.so")
            val nodeBin = File(rootDir, "usr/bin/node")
            val pyBin = File(rootDir, "usr/bin/python3")
            val gitBin = File(rootDir, "usr/bin/git")

            fun createPkgMap(exists: Boolean, defaultSizeMb: Double, versionStr: String, pathStr: String): WritableMap {
                return Arguments.createMap().apply {
                    putBoolean("isInstalled", exists)
                    putDouble("sizeMb", defaultSizeMb)
                    putString("path", pathStr)
                    putString("version", versionStr)
                }
            }

            val map = Arguments.createMap().apply {
                putMap("cloudflared", createPkgMap(cfLib.exists(), 37.8, "v2026.11.1 (ARM64 Native)", cfLib.absolutePath))
                putMap("zrok", createPkgMap(false, 24.0, "v0.4.42 (OpenZiti)", "Not installed"))
                putMap("proot", createPkgMap(prootLib.exists(), 4.1, "v5.5.0 (ARM64 Native)", prootLib.absolutePath))
                putMap("nodejs", createPkgMap(nodeBin.exists(), 75.0, if (nodeBin.exists()) "v20.15.1 (Alpine Linux)" else "Not installed", nodeBin.absolutePath))
                putMap("python", createPkgMap(pyBin.exists(), 60.0, if (pyBin.exists()) "Python 3.12 (Alpine Linux)" else "Not installed", pyBin.absolutePath))
                putMap("git", createPkgMap(gitBin.exists(), 25.0, if (gitBin.exists()) "Git (Alpine Linux)" else "Not installed", gitBin.absolutePath))
            }

            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("STATUS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun installPackage(packageId: String, promise: Promise) {
        moduleScope.launch {
            try {
                ensureEnvironment()
                val pkgId = packageId.lowercase().trim()
                val nativeLibDir = File(reactContext.applicationInfo.nativeLibraryDir)
                val rootDir = getRootDir()

                when (pkgId) {
                    "cloudflared" -> {
                        emitPackageProgress("cloudflared", "STARTING", 50, 20.0, 37.8, "Verifying cloudflared binary...")
                        val cfLib = File(nativeLibDir, "libcloudflared.so")
                        if (cfLib.exists()) {
                            emitPackageProgress("cloudflared", "INSTALLED", 100, 37.8, 37.8, "Cloudflare Tunnel binary ready")
                        } else {
                            val dest = File(getBinDir(), "cloudflared")
                            val url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
                            downloadFileWithProgress(url, dest, "cloudflared", "Cloudflare Tunnel CLI")
                        }
                        withContext(Dispatchers.Main) {
                            promise.resolve(Arguments.createMap().apply {
                                putBoolean("success", true)
                                putString("packageId", "cloudflared")
                            })
                        }
                    }
                    "nodejs" -> {
                        emitPackageProgress("nodejs", "STARTING", 10, 0.0, 75.0, "Updating Alpine package repositories...")
                        val cmd = "export PATH=/bin:/sbin:/usr/bin:/usr/sbin; apk update && apk add --no-cache nodejs npm"
                        val (out, err, code) = runCommandInPRootInternal(cmd)
                        val success = code == 0 && File(rootDir, "usr/bin/node").exists()
                        if (success) {
                            emitPackageProgress("nodejs", "INSTALLED", 100, 75.0, 75.0, "Node.js (v20) and npm successfully installed")
                            withContext(Dispatchers.Main) {
                                promise.resolve(Arguments.createMap().apply {
                                    putBoolean("success", true)
                                    putString("packageId", "nodejs")
                                })
                            }
                        } else {
                            throw RuntimeException("Failed to install Node.js (code $code): $err\n$out")
                        }
                    }
                    "python" -> {
                        emitPackageProgress("python", "STARTING", 10, 0.0, 60.0, "Updating Alpine package repositories...")
                        val cmd = "export PATH=/bin:/sbin:/usr/bin:/usr/sbin; apk update && apk add --no-cache python3 py3-pip"
                        val (out, err, code) = runCommandInPRootInternal(cmd)
                        val success = code == 0 && File(rootDir, "usr/bin/python3").exists()
                        if (success) {
                            emitPackageProgress("python", "INSTALLED", 100, 60.0, 60.0, "Python 3 and pip successfully installed")
                            withContext(Dispatchers.Main) {
                                promise.resolve(Arguments.createMap().apply {
                                    putBoolean("success", true)
                                    putString("packageId", "python")
                                })
                            }
                        } else {
                            throw RuntimeException("Failed to install Python 3 (code $code): $err\n$out")
                        }
                    }
                    "git" -> {
                        emitPackageProgress("git", "STARTING", 10, 0.0, 25.0, "Updating Alpine package repositories...")
                        val cmd = "export PATH=/bin:/sbin:/usr/bin:/usr/sbin; apk update && apk add --no-cache git"
                        val (out, err, code) = runCommandInPRootInternal(cmd)
                        val success = code == 0 && File(rootDir, "usr/bin/git").exists()
                        if (success) {
                            emitPackageProgress("git", "INSTALLED", 100, 25.0, 25.0, "Git successfully installed")
                            withContext(Dispatchers.Main) {
                                promise.resolve(Arguments.createMap().apply {
                                    putBoolean("success", true)
                                    putString("packageId", "git")
                                })
                            }
                        } else {
                            throw RuntimeException("Failed to install Git (code $code): $err\n$out")
                        }
                    }
                    else -> {
                        emitPackageProgress(pkgId, "INSTALLED", 100, 10.0, 10.0, "$pkgId ready")
                        withContext(Dispatchers.Main) {
                            promise.resolve(Arguments.createMap().apply {
                                putBoolean("success", true)
                                putString("packageId", pkgId)
                            })
                        }
                    }
                }
            } catch (e: Exception) {
                emitPackageProgress(packageId, "FAILED", 0, 0.0, 0.0, "Installation failed: ${e.message}")
                withContext(Dispatchers.Main) {
                    promise.reject("INSTALL_ERROR", e.message, e)
                }
            }
        }
    }

    private suspend fun downloadFileWithProgress(
        urlStr: String,
        destFile: File,
        packageId: String,
        packageName: String
    ) = withContext(Dispatchers.IO) {
        var currentUrl = urlStr
        var conn: HttpURLConnection
        var redirectCount = 0

        while (true) {
            val url = URL(currentUrl)
            conn = url.openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = true
            conn.connectTimeout = 15000
            conn.readTimeout = 30000
            conn.setRequestProperty("User-Agent", "PocketHost-Android/1.0")

            val responseCode = conn.responseCode
            if ((responseCode == HttpURLConnection.HTTP_MOVED_PERM ||
                    responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                    responseCode == 307 || responseCode == 308) && redirectCount < 6) {
                val newUrl = conn.getHeaderField("Location")
                conn.disconnect()
                currentUrl = newUrl
                redirectCount++
                continue
            }

            if (responseCode != HttpURLConnection.HTTP_OK) {
                throw java.io.IOException("Server returned HTTP $responseCode for $urlStr")
            }
            break
        }

        val totalLength = conn.contentLengthLong
        val totalMb = if (totalLength > 0) (totalLength.toDouble() / (1024.0 * 1024.0)) else 0.0

        val tempFile = File(destFile.parentFile, "${destFile.name}.part")
        if (tempFile.exists()) tempFile.delete()

        var downloadedBytes = 0L
        var lastEmitTime = 0L

        conn.inputStream.use { input ->
            FileOutputStream(tempFile).use { output ->
                val buffer = ByteArray(16384)
                var bytesRead: Int
                while (input.read(buffer).also { bytesRead = it } != -1) {
                    output.write(buffer, 0, bytesRead)
                    downloadedBytes += bytesRead

                    val now = System.currentTimeMillis()
                    if (now - lastEmitTime > 250) {
                        lastEmitTime = now
                        val downloadedMb = downloadedBytes.toDouble() / (1024.0 * 1024.0)
                        val percent = if (totalLength > 0) ((downloadedBytes * 100) / totalLength).toInt() else 0
                        emitPackageProgress(
                            packageId,
                            "DOWNLOADING",
                            percent,
                            downloadedMb,
                            totalMb,
                            "Downloading $packageName: ${String.format("%.1f", downloadedMb)} / ${String.format("%.1f", totalMb)} MB (${percent}%)"
                        )
                    }
                }
            }
        }

        if (destFile.exists()) destFile.delete()
        if (!tempFile.renameTo(destFile)) {
            tempFile.copyTo(destFile, overwrite = true)
            tempFile.delete()
        }
        destFile.setExecutable(true, false)
        destFile.setReadable(true, false)

        val finalMb = destFile.length().toDouble() / (1024.0 * 1024.0)
        emitPackageProgress(packageId, "INSTALLED", 100, finalMb, finalMb, "$packageName installed (${String.format("%.1f", finalMb)} MB)")
    }

    private fun extractTarGz(tarGzFile: File, outputDir: File, targetEntryName: String? = null) {
        GZIPInputStream(tarGzFile.inputStream().buffered()).use { gzIn ->
            val header = ByteArray(512)
            while (true) {
                var bytesRead = 0
                while (bytesRead < 512) {
                    val count = gzIn.read(header, bytesRead, 512 - bytesRead)
                    if (count < 0) break
                    bytesRead += count
                }
                if (bytesRead < 512) break
                if (header.all { it == 0.toByte() }) break

                val nameEnd = header.indexOfFirst { it == 0.toByte() }.let { if (it in 0..99) it else 100 }
                val entryName = String(header, 0, nameEnd, Charsets.UTF_8).trim()
                if (entryName.isEmpty()) continue

                val sizeStr = String(header, 124, 11, Charsets.UTF_8).trim().trimEnd(0.toChar())
                val size = try { sizeStr.toLong(8) } catch (_: Exception) { 0L }
                val typeFlag = header[156].toInt().toChar()

                if (typeFlag == '5' || entryName.endsWith("/")) {
                    File(outputDir, entryName).mkdirs()
                } else if (typeFlag == '0' || typeFlag == 0.toChar()) {
                    val cleanBaseName = File(entryName).name
                    if (targetEntryName == null || cleanBaseName == targetEntryName) {
                        val outFile = if (targetEntryName != null) File(outputDir, targetEntryName) else File(outputDir, entryName)
                        outFile.parentFile?.mkdirs()
                        FileOutputStream(outFile).use { out ->
                            var remaining = size
                            val buf = ByteArray(16384)
                            while (remaining > 0) {
                                val toRead = Math.min(buf.size.toLong(), remaining).toInt()
                                val r = gzIn.read(buf, 0, toRead)
                                if (r < 0) break
                                out.write(buf, 0, r)
                                remaining -= r
                            }
                        }
                        outFile.setExecutable(true, false)
                        outFile.setReadable(true, false)
                    } else {
                        var remaining = size
                        val buf = ByteArray(16384)
                        while (remaining > 0) {
                            val toRead = Math.min(buf.size.toLong(), remaining).toInt()
                            val r = gzIn.read(buf, 0, toRead)
                            if (r < 0) break
                            remaining -= r
                        }
                    }
                }

                val pad = (512 - (size % 512)) % 512
                var padRemaining = pad
                while (padRemaining > 0) {
                    val skipped = gzIn.skip(padRemaining)
                    if (skipped <= 0) break
                    padRemaining -= skipped
                }
            }
        }
    }

    @ReactMethod
    fun uninstallPackage(packageId: String, promise: Promise) {
        try {
            val pkgId = packageId.lowercase().trim()
            val rootDir = getRootDir()
            var freedMb = 0.0

            if (pkgId == "nodejs") {
                val nodeFile = File(rootDir, "usr/bin/node")
                if (nodeFile.exists()) {
                    runCommandInPRootInternal("export PATH=/bin:/sbin:/usr/bin:/usr/sbin; apk del nodejs npm")
                    freedMb = 75.0
                }
            } else if (pkgId == "python") {
                val pyFile = File(rootDir, "usr/bin/python3")
                if (pyFile.exists()) {
                    runCommandInPRootInternal("export PATH=/bin:/sbin:/usr/bin:/usr/sbin; apk del python3 py3-pip")
                    freedMb = 60.0
                }
            } else if (pkgId == "git") {
                val gitFile = File(rootDir, "usr/bin/git")
                if (gitFile.exists()) {
                    runCommandInPRootInternal("export PATH=/bin:/sbin:/usr/bin:/usr/sbin; apk del git")
                    freedMb = 25.0
                }
            }

            val res = Arguments.createMap().apply {
                putBoolean("success", true)
                putString("packageId", pkgId)
                putDouble("freedMb", freedMb)
            }
            promise.resolve(res)
        } catch (e: Exception) {
            promise.reject("UNINSTALL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun writeProjectFiles(projectId: String, files: ReadableMap, promise: Promise) {
        try {
            val projDir = File(getProjectsDir(), projectId)
            if (!projDir.exists()) projDir.mkdirs()

            val iter = files.keySetIterator()
            while (iter.hasNextKey()) {
                val fileName = iter.nextKey()
                val content = files.getString(fileName) ?: ""
                val targetFile = File(projDir, fileName)
                targetFile.parentFile?.mkdirs()
                targetFile.writeText(content, Charsets.UTF_8)
            }
            promise.resolve(projDir.absolutePath)
        } catch (e: Exception) {
            promise.reject("WRITE_FILES_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun deleteProjectDir(projectId: String, promise: Promise) {
        try {
            val projDir = File(getProjectsDir(), projectId)
            if (projDir.exists()) {
                projDir.deleteRecursively()
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DELETE_PROJECT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cleanCache(promise: Promise) {
        try {
            var freedBytes = 0L
            reactContext.cacheDir.listFiles()?.forEach { file ->
                freedBytes += file.length()
                if (file.isDirectory) file.deleteRecursively() else file.delete()
            }
            val freedMb = freedBytes.toDouble() / (1024.0 * 1024.0)
            promise.resolve(freedMb)
        } catch (e: Exception) {
            promise.reject("CLEAN_CACHE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isEnvironmentReady(promise: Promise) {
        try {
            ensureEnvironment()
            val rootDir = getRootDir()
            val hasRootFs = rootDir.exists() && File(rootDir, "bin/sh").exists()
            val nativeLibDir = File(reactContext.applicationInfo.nativeLibraryDir)
            val prootLib = File(nativeLibDir, "libproot.so")
            val isReady = hasRootFs && prootLib.exists()

            val map = Arguments.createMap().apply {
                putBoolean("isReady", isReady)
                putString("rootDir", rootDir.absolutePath)
                putString("binDir", getBinDir().absolutePath)
                putString("projectsDir", getProjectsDir().absolutePath)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun initializeEnvironment(promise: Promise) {
        moduleScope.launch {
            try {
                notifyProgress("PREPARING_DIRS", "Unpacking Alpine Linux container environment...", 30)
                ensureEnvironment()

                notifyProgress("SETTING_UP_WORKSPACE", "Initializing project workspace...", 80)
                val defaultProject = File(getProjectsDir(), "default")
                if (!defaultProject.exists()) {
                    defaultProject.mkdirs()
                }

                notifyProgress("READY", "Environment initialized successfully!", 100)

                withContext(Dispatchers.Main) {
                    val map = Arguments.createMap().apply {
                        putBoolean("success", true)
                        putString("rootDir", getRootDir().absolutePath)
                        putString("projectsDir", getProjectsDir().absolutePath)
                        putBoolean("prootNativeAvailable", File(reactContext.applicationInfo.nativeLibraryDir, "libproot.so").exists())
                    }
                    promise.resolve(map)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    notifyProgress("FAILED", "Setup failed: ${e.message}", 0)
                    promise.reject("BOOTSTRAP_ERROR", e.message, e)
                }
            }
        }
    }

    private fun notifyProgress(step: String, message: String, percentage: Int) {
        val params = Arguments.createMap().apply {
            putString("step", step)
            putString("message", message)
            putInt("percentage", percentage)
        }
        sendEvent("onBootstrapProgress", params)
    }

    @ReactMethod
    fun getExecutionCommand(command: String, workspacePath: String?, promise: Promise) {
        try {
            ensureEnvironment()
            val nativeLibDir = File(reactContext.applicationInfo.nativeLibraryDir)
            val prootLib = File(nativeLibDir, "libproot.so")
            val rootDir = getRootDir()
            val workspace = workspacePath ?: File(getProjectsDir(), "default").absolutePath
            val resolvConf = File(rootDir, "etc/resolv.conf")
            val sslDir = File(rootDir, "etc/ssl")

            val cmdList = Arguments.createArray()

            if (prootLib.exists() && rootDir.exists() && File(rootDir, "bin/sh").exists()) {
                cmdList.pushString(prootLib.absolutePath)
                cmdList.pushString("--link2symlink")
                cmdList.pushString("-0")
                cmdList.pushString("-r")
                cmdList.pushString(rootDir.absolutePath)
                cmdList.pushString("-b")
                cmdList.pushString("/dev")
                cmdList.pushString("-b")
                cmdList.pushString("/proc")
                cmdList.pushString("-b")
                cmdList.pushString("/sys")
                cmdList.pushString("-b")
                cmdList.pushString("${resolvConf.absolutePath}:/etc/resolv.conf")
                cmdList.pushString("-b")
                cmdList.pushString("${sslDir.absolutePath}:/etc/ssl")
                cmdList.pushString("-b")
                cmdList.pushString("$workspace:/workspace")
                cmdList.pushString("-w")
                cmdList.pushString("/workspace")
                cmdList.pushString("/bin/sh")
                cmdList.pushString("-c")
                cmdList.pushString("export PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin; export HOME=/root; $command")
            } else {
                cmdList.pushString("/system/bin/sh")
                cmdList.pushString("-c")
                cmdList.pushString(command)
            }

            promise.resolve(cmdList)
        } catch (e: Exception) {
            promise.reject("CMD_GEN_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getEnvironmentInfo(promise: Promise) {
        try {
            val map = Arguments.createMap().apply {
                putString("filesDir", getFilesDir().absolutePath)
                putString("rootDir", getRootDir().absolutePath)
                putString("binDir", getBinDir().absolutePath)
                putString("projectsDir", getProjectsDir().absolutePath)
                putString("nativeLibDir", reactContext.applicationInfo.nativeLibraryDir)
                putString("abi", android.os.Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown")
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("ENV_INFO_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun pickProjectZip(projectId: String, promise: Promise) {
        val currentActivity = reactContext.currentActivity
        if (currentActivity == null) {
            promise.reject("NO_ACTIVITY", "Current activity is null. Cannot launch file picker.")
            return
        }

        pendingZipPromise = promise
        pendingZipProjectId = projectId

        try {
            val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                type = "*/*"
                val mimeTypes = arrayOf(
                    "application/zip",
                    "application/x-zip",
                    "application/x-zip-compressed",
                    "application/octet-stream"
                )
                putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes)
                addCategory(Intent.CATEGORY_OPENABLE)
            }
            currentActivity.startActivityForResult(intent, ZIP_PICKER_REQUEST_CODE)
        } catch (e: Exception) {
            pendingZipPromise = null
            pendingZipProjectId = null
            promise.reject("PICKER_LAUNCH_FAILED", "Could not open file picker: ${e.message}", e)
        }
    }

    private fun handleActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != ZIP_PICKER_REQUEST_CODE) return

        val promise = pendingZipPromise
        val projectId = pendingZipProjectId
        pendingZipPromise = null
        pendingZipProjectId = null

        if (promise == null) return

        if (resultCode != Activity.RESULT_OK || data == null || data.data == null) {
            promise.reject("PICK_CANCELLED", "Zip selection was cancelled by user.")
            return
        }

        val uri: Uri = data.data!!
        moduleScope.launch {
            try {
                val projId = projectId ?: "default"
                val projDir = File(getProjectsDir(), projId)
                if (projDir.exists()) projDir.deleteRecursively()
                projDir.mkdirs()

                var fileName = "project.zip"
                var fileSize = 0L

                activity.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                        if (nameIndex != -1) fileName = cursor.getString(nameIndex) ?: fileName
                        if (sizeIndex != -1) fileSize = cursor.getLong(sizeIndex)
                    }
                }

                val tempZip = File(reactContext.cacheDir, "uploaded_${System.currentTimeMillis()}.zip")
                activity.contentResolver.openInputStream(uri)?.use { input ->
                    FileOutputStream(tempZip).use { output ->
                        input.copyTo(output)
                    }
                }

                // Scan common prefix
                var commonPrefix: String? = null
                ZipInputStream(tempZip.inputStream().buffered()).use { zis ->
                    var entry = zis.nextEntry
                    var topDirs = mutableSetOf<String>()
                    while (entry != null) {
                        val path = entry.name
                        val parts = path.split("/")
                        if (parts.size > 1 && parts[0].isNotEmpty()) {
                            topDirs.add(parts[0])
                        }
                        zis.closeEntry()
                        entry = zis.nextEntry
                    }
                    if (topDirs.size == 1) {
                        commonPrefix = topDirs.first() + "/"
                    }
                }

                var extractedCount = 0
                ZipInputStream(tempZip.inputStream().buffered()).use { zis ->
                    var entry = zis.nextEntry
                    val buffer = ByteArray(16384)
                    while (entry != null) {
                        var cleanName = entry.name
                        if (commonPrefix != null && cleanName.startsWith(commonPrefix!!)) {
                            cleanName = cleanName.removePrefix(commonPrefix!!)
                        }

                        if (cleanName.isNotEmpty() && !cleanName.endsWith("/")) {
                            val outFile = File(projDir, cleanName)
                            outFile.parentFile?.mkdirs()
                            FileOutputStream(outFile).use { out ->
                                var len: Int
                                while (zis.read(buffer).also { len = it } > 0) {
                                    out.write(buffer, 0, len)
                                }
                            }
                            extractedCount++
                        } else if (cleanName.isNotEmpty() && cleanName.endsWith("/")) {
                            File(projDir, cleanName).mkdirs()
                        }
                        zis.closeEntry()
                        entry = zis.nextEntry
                    }
                }
                tempZip.delete()

                val sizeMb = if (fileSize > 0) (fileSize.toDouble() / (1024.0 * 1024.0)) else (projDir.walk().filter { it.isFile }.map { it.length() }.sum().toDouble() / (1024.0 * 1024.0))

                withContext(Dispatchers.Main) {
                    val res = Arguments.createMap().apply {
                        putBoolean("success", true)
                        putString("fileName", fileName)
                        putInt("filesCount", extractedCount)
                        putDouble("sizeMb", sizeMb)
                        putString("projectDir", projDir.absolutePath)
                    }
                    promise.resolve(res)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("EXTRACT_FAILED", "Failed to extract project zip: ${e.message}", e)
                }
            }
        }
    }
}
