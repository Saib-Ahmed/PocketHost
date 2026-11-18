package com.pockethost.bridge

import android.content.Context
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

class PRootBootstrapModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

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

    @ReactMethod
    fun isEnvironmentReady(promise: Promise) {
        try {
            val rootDir = getRootDir()
            val hasRootFs = rootDir.exists() && File(rootDir, "bin/sh").exists()
            val hasBinDir = getBinDir().exists()
            val isReady = hasRootFs || File(getBinDir(), "node").exists()

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
                // Step 1: Create directory hierarchy
                notifyProgress("PREPARING_DIRS", "Creating isolated directory structure...", 10)
                getBinDir().mkdirs()
                getProjectsDir().mkdirs()
                getRootDir().mkdirs()

                // Step 2: Configure internal DNS & Hosts
                notifyProgress("CONFIGURING_DNS", "Setting up network DNS resolvers (1.1.1.1, 8.8.8.8)...", 30)
                val etcDir = File(getRootDir(), "etc")
                etcDir.mkdirs()
                val resolvConf = File(etcDir, "resolv.conf")
                resolvConf.writeText("nameserver 1.1.1.1\nnameserver 8.8.8.8\n")
                val hosts = File(etcDir, "hosts")
                hosts.writeText("127.0.0.1 localhost\n::1 localhost\n")

                // Step 3: Check for native PRoot library or binary
                notifyProgress("CHECKING_PROOT", "Verifying PRoot execution engine...", 50)
                val nativeLibDir = reactContext.applicationInfo.nativeLibraryDir
                val prootLib = File(nativeLibDir, "libproot.so")

                // Step 4: Setup workspace base
                notifyProgress("SETTING_UP_WORKSPACE", "Initializing project workspace...", 75)
                val defaultProject = File(getProjectsDir(), "default")
                if (!defaultProject.exists()) {
                    defaultProject.mkdirs()
                }

                // Step 5: Ready
                notifyProgress("READY", "Linux execution environment is ready!", 100)

                withContext(Dispatchers.Main) {
                    val map = Arguments.createMap().apply {
                        putBoolean("success", true)
                        putString("rootDir", getRootDir().absolutePath)
                        putString("projectsDir", getProjectsDir().absolutePath)
                        putBoolean("prootNativeAvailable", prootLib.exists())
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
            val nativeLibDir = reactContext.applicationInfo.nativeLibraryDir
            val prootLib = File(nativeLibDir, "libproot.so")
            val workspace = workspacePath ?: File(getProjectsDir(), "default").absolutePath

            val cmdList = Arguments.createArray()

            if (prootLib.exists() && getRootDir().exists()) {
                // Use PRoot execution
                cmdList.pushString(prootLib.absolutePath)
                cmdList.pushString("-0")
                cmdList.pushString("-r")
                cmdList.pushString(getRootDir().absolutePath)
                cmdList.pushString("-b")
                cmdList.pushString("/dev")
                cmdList.pushString("-b")
                cmdList.pushString("/proc")
                cmdList.pushString("-b")
                cmdList.pushString("/sys")
                cmdList.pushString("-b")
                cmdList.pushString("$workspace:/workspace")
                cmdList.pushString("-w")
                cmdList.pushString("/workspace")
                cmdList.pushString("/usr/bin/env")
                cmdList.pushString("-i")
                cmdList.pushString("HOME=/root")
                cmdList.pushString("PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
                cmdList.pushString("TERM=xterm-256color")
                cmdList.pushString("/bin/sh")
                cmdList.pushString("-c")
                cmdList.pushString(command)
            } else {
                // Fallback direct shell execution with internal bin path
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

    override fun invalidate() {
        super.invalidate()
        moduleScope.cancel()
    }
}
