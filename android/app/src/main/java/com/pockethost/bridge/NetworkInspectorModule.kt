package com.pockethost.bridge

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.*
import com.pockethost.service.HostingForegroundService
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
}
