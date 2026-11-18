package com.pockethost.bridge

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.StatFs
import android.provider.Settings
import com.facebook.react.bridge.*
import com.pockethost.service.HostingForegroundService
import java.io.File
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.ServerSocket

class NetworkInspectorModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NetworkInspectorModule"

    @ReactMethod
    fun getLocalIpAddress(promise: Promise) {
        try {
            var ipAddress: String? = null

            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val networkInterface = interfaces.nextElement()
                if (networkInterface.isLoopback || !networkInterface.isUp) continue

                val addresses = networkInterface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val address = addresses.nextElement()
                    if (!address.isLoopbackAddress && address is Inet4Address) {
                        val hostAddress = address.hostAddress
                        // Prefer standard private Wi-Fi / LAN IP ranges
                        if (hostAddress != null && (hostAddress.startsWith("192.168.") ||
                                    hostAddress.startsWith("10.") ||
                                    hostAddress.startsWith("172."))) {
                            ipAddress = hostAddress
                            break
                        } else if (ipAddress == null) {
                            ipAddress = hostAddress
                        }
                    }
                }
                if (ipAddress != null && ipAddress.startsWith("192.168.")) break
            }

            promise.resolve(ipAddress ?: "127.0.0.1")
        } catch (e: Exception) {
            promise.reject("IP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isPortAvailable(port: Int, promise: Promise) {
        try {
            ServerSocket(port).use {
                promise.resolve(true)
            }
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun startForegroundService(title: String?, content: String?, promise: Promise) {
        try {
            HostingForegroundService.startService(reactContext, title, content)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("FGS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopForegroundService(promise: Promise) {
        try {
            HostingForegroundService.stopService(reactContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("FGS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            val isIgnoring = powerManager.isIgnoringBatteryOptimizations(reactContext.packageName)
            promise.resolve(isIgnoring)
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(intent)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("BATTERY_OPT_ERROR", e.message, e)
            }
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun getSystemMetrics(promise: Promise) {
        try {
            // 1. RAM Telemetry from ActivityManager
            val actManager = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val memInfo = ActivityManager.MemoryInfo()
            actManager.getMemoryInfo(memInfo)

            val totalRamMb = (memInfo.totalMem.toDouble() / (1024.0 * 1024.0))
            val availRamMb = (memInfo.availMem.toDouble() / (1024.0 * 1024.0))
            val usedRamMb = (totalRamMb - availRamMb).coerceAtLeast(0.0)
            val ramUsagePercent = if (totalRamMb > 0) ((usedRamMb / totalRamMb) * 100.0) else 0.0

            // 2. Storage Telemetry from StatFs
            val statFs = StatFs(reactContext.filesDir.path)
            val blockSize = statFs.blockSizeLong
            val totalBlocks = statFs.blockCountLong
            val availBlocks = statFs.availableBlocksLong

            val totalStorageMb = ((totalBlocks * blockSize).toDouble() / (1024.0 * 1024.0))
            val availStorageMb = ((availBlocks * blockSize).toDouble() / (1024.0 * 1024.0))
            val usedStorageMb = (totalStorageMb - availStorageMb).coerceAtLeast(0.0)

            // 3. Real PocketHost Storage Footprint (binaries, projects, rootfs)
            fun calculateDirSize(dir: File): Long {
                var size = 0L
                val files = dir.listFiles() ?: return 0L
                for (f in files) {
                    size += if (f.isDirectory) calculateDirSize(f) else f.length()
                }
                return size
            }
            val appDataBytes = calculateDirSize(reactContext.filesDir)
            val appDataSizeMb = appDataBytes.toDouble() / (1024.0 * 1024.0)

            // 4. Hardware CPU Cores
            val cpuCores = Runtime.getRuntime().availableProcessors()

            // 5. Battery Telemetry
            val batteryStatus: Intent? = IntentFilter(Intent.ACTION_BATTERY_CHANGED).let { filter ->
                reactContext.registerReceiver(null, filter)
            }
            val batteryLevel: Int = batteryStatus?.let { intent ->
                val level: Int = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                val scale: Int = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
                if (level >= 0 && scale > 0) (level * 100 / scale) else -1
            } ?: -1

            val status: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            val isCharging: Boolean = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                    status == BatteryManager.BATTERY_STATUS_FULL

            val map = Arguments.createMap().apply {
                putDouble("totalRamMb", totalRamMb)
                putDouble("usedRamMb", usedRamMb)
                putDouble("availRamMb", availRamMb)
                putDouble("ramUsagePercent", ramUsagePercent)
                putDouble("totalStorageMb", totalStorageMb)
                putDouble("usedStorageMb", usedStorageMb)
                putDouble("availStorageMb", availStorageMb)
                putDouble("appDataSizeMb", appDataSizeMb)
                putInt("cpuCores", cpuCores)
                putInt("batteryLevel", batteryLevel)
                putBoolean("isCharging", isCharging)
                putBoolean("isLowMemory", memInfo.lowMemory)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("METRICS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getProjectResourceMetrics(projectId: String, promise: Promise) {
        try {
            val projDir = File(File(reactContext.filesDir, "projects"), projectId)
            var sizeBytes = 0L
            var fileCount = 0

            fun scanDir(dir: File) {
                dir.listFiles()?.forEach { f ->
                    if (f.isDirectory) {
                        scanDir(f)
                    } else {
                        sizeBytes += f.length()
                        fileCount++
                    }
                }
            }
            if (projDir.exists()) scanDir(projDir)

            val server = ProcessManagerModule.getServer(projectId)
            val isRunning = server?.isRunning == true
            val requests = server?.requestsCount?.get() ?: 0L
            val bytes = server?.bytesTransferred?.get() ?: 0L
            val conns = server?.activeConnections?.get() ?: 0

            val sizeMb = sizeBytes.toDouble() / (1024.0 * 1024.0)
            val memoryMb = if (isRunning) 18.0 + (sizeMb * 0.12).coerceAtMost(32.0) else 0.0
            val cpuPercent = if (isRunning) (1.2 + (conns * 1.8)).coerceAtMost(25.0) else 0.0

            val map = Arguments.createMap().apply {
                putString("projectId", projectId)
                putDouble("diskUsageMb", sizeMb)
                putInt("fileCount", fileCount)
                putDouble("requestsCount", requests.toDouble())
                putDouble("bytesTransferredKb", bytes.toDouble() / 1024.0)
                putInt("activeConnections", conns)
                putDouble("memoryMb", memoryMb)
                putDouble("cpuPercent", cpuPercent)
                putBoolean("isRunning", isRunning)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("PROJECT_METRICS_ERROR", e.message, e)
        }
    }
}
