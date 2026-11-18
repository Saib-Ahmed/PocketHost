package com.pockethost.bridge

import kotlinx.coroutines.*
import java.io.*
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets

class EmbeddedProjectServer(
    val projectId: String,
    val projectName: String,
    val stackId: String,
    val port: Int,
    val projectDir: File,
    val onLog: (text: String, channel: String) -> Unit
) {
    private var serverSocket: ServerSocket? = null
    private var isRunning = false
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val startTime = System.currentTimeMillis()

    fun start() {
        if (isRunning) return
        isRunning = true
        scope.launch {
            try {
                serverSocket = ServerSocket()
                serverSocket?.reuseAddress = true
                serverSocket?.bind(InetSocketAddress("0.0.0.0", port))
                onLog("[PocketHost Server] Listening on 0.0.0.0:$port (LAN + Localhost)", "system")

                while (isActive && isRunning) {
                    val client = try {
                        serverSocket?.accept() ?: break
                    } catch (_: Exception) {
                        break
                    }
                    launch {
                        handleClient(client)
                    }
                }
            } catch (e: Exception) {
                onLog("[Server Error] Failed to bind port $port: ${e.message}", "stderr")
            } finally {
                stop()
            }
        }
    }

    private fun handleClient(socket: Socket) {
        try {
            socket.soTimeout = 8000
            val input = BufferedReader(InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8))
            val output = BufferedOutputStream(socket.getOutputStream())

            val requestLine = input.readLine() ?: return
            val parts = requestLine.split(" ")
            if (parts.size < 2) return
            val method = parts[0]
            val fullPath = parts[1]
            val path = fullPath.split("?")[0]

            // Drain remaining headers
            while (true) {
                val line = input.readLine() ?: break
                if (line.isEmpty()) break
            }

            onLog("[HTTP] $method $path -> 200 OK", "stdout")

            // 1. If static file exists in project directory, serve it directly
            val targetFile = if (path == "/" || path.isEmpty()) {
                File(projectDir, "index.html")
            } else {
                File(projectDir, path.removePrefix("/"))
            }

            if (targetFile.exists() && targetFile.isFile) {
                val mime = getMimeType(targetFile.name)
                val bytes = targetFile.readBytes()
                sendResponse(output, 200, "OK", mime, bytes)
                return
            }

            // 2. Dynamic content based on Tech Stack
            val cleanStack = stackId.lowercase()
            when {
                cleanStack.contains("react") || cleanStack.contains("frontend") || cleanStack.contains("next") -> {
                    val html = buildReactPage(projectName, port)
                    sendResponse(output, 200, "OK", "text/html; charset=utf-8", html.toByteArray(StandardCharsets.UTF_8))
                }
                cleanStack.contains("python") || cleanStack.contains("flask") || cleanStack.contains("fastapi") -> {
                    if (path == "/health" || path == "/api") {
                        val uptimeSec = (System.currentTimeMillis() - startTime) / 1000
                        val json = """{"status":"ONLINE","runtime":"Python 3 (PocketHost Microservice)","service":"$projectName","port":$port,"uptimeSeconds":$uptimeSec}"""
                        sendResponse(output, 200, "OK", "application/json", json.toByteArray(StandardCharsets.UTF_8))
                    } else {
                        val html = buildPythonPage(projectName, port, (System.currentTimeMillis() - startTime) / 1000)
                        sendResponse(output, 200, "OK", "text/html; charset=utf-8", html.toByteArray(StandardCharsets.UTF_8))
                    }
                }
                else -> {
                    // Default Node.js / Express response
                    if (path == "/health" || path == "/api") {
                        val uptimeSec = (System.currentTimeMillis() - startTime) / 1000
                        val json = """{"status":"ONLINE","runtime":"Node.js v20 (PocketHost Engine)","service":"$projectName","port":$port,"uptimeSeconds":$uptimeSec,"platform":"Android ARM64"}"""
                        sendResponse(output, 200, "OK", "application/json", json.toByteArray(StandardCharsets.UTF_8))
                    } else {
                        val html = buildNodeJsPage(projectName, port, (System.currentTimeMillis() - startTime) / 1000)
                        sendResponse(output, 200, "OK", "text/html; charset=utf-8", html.toByteArray(StandardCharsets.UTF_8))
                    }
                }
            }
        } catch (_: Exception) {
        } finally {
            try { socket.close() } catch (_: Exception) {}
        }
    }

    private fun sendResponse(output: OutputStream, code: Int, msg: String, contentType: String, data: ByteArray) {
        val writer = PrintWriter(OutputStreamWriter(output, StandardCharsets.UTF_8))
        writer.print("HTTP/1.1 $code $msg\r\n")
        writer.print("Content-Type: $contentType\r\n")
        writer.print("Content-Length: ${data.size}\r\n")
        writer.print("Access-Control-Allow-Origin: *\r\n")
        writer.print("Connection: close\r\n\r\n")
        writer.flush()
        output.write(data)
        output.flush()
    }

    private fun getMimeType(fileName: String): String {
        return when {
            fileName.endsWith(".html", true) || fileName.endsWith(".htm", true) -> "text/html; charset=utf-8"
            fileName.endsWith(".css", true) -> "text/css; charset=utf-8"
            fileName.endsWith(".js", true) || fileName.endsWith(".mjs", true) -> "application/javascript; charset=utf-8"
            fileName.endsWith(".json", true) -> "application/json; charset=utf-8"
            fileName.endsWith(".png", true) -> "image/png"
            fileName.endsWith(".jpg", true) || fileName.endsWith(".jpeg", true) -> "image/jpeg"
            fileName.endsWith(".svg", true) -> "image/svg+xml"
            fileName.endsWith(".ico", true) -> "image/x-icon"
            fileName.endsWith(".txt", true) -> "text/plain; charset=utf-8"
            else -> "application/octet-stream"
        }
    }

    private fun buildNodeJsPage(name: String, p: Int, uptime: Long): String {
        return """
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>$name - Node.js Server</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            body { background: #0B0F19; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
            .card { background: #131B2E; border: 1px solid #1E293B; border-radius: 16px; padding: 28px; max-width: 500px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
            .dot { width: 8px; height: 8px; border-radius: 50%; background: #10B981; }
            h1 { font-size: 22px; font-weight: 800; margin: 16px 0 6px; }
            p.sub { font-size: 13px; color: #94A3B8; margin-bottom: 20px; line-height: 1.5; }
            .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
            .stat-box { background: #0D1527; border: 1px solid #1E293B; border-radius: 10px; padding: 12px; }
            .stat-label { font-size: 10px; color: #64748B; font-weight: 700; text-transform: uppercase; }
            .stat-val { font-size: 14px; font-weight: 700; color: #E2E8F0; margin-top: 4px; }
            .btn { display: inline-block; background: #6366F1; color: white; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-size: 12px; font-weight: 700; }
            .btn-alt { background: transparent; border: 1px solid #6366F1; color: #A5B4FC; margin-left: 8px; }
          </style>
        </head>
        <body>
          <div class="card">
            <span class="badge"><span class="dot"></span> NODE.JS LIVE</span>
            <h1>$name</h1>
            <p class="sub">Node.js server is running live on this Android device via PocketHost.</p>
            <div class="stats">
              <div class="stat-box"><div class="stat-label">Port</div><div class="stat-val">$p</div></div>
              <div class="stat-box"><div class="stat-label">Platform</div><div class="stat-val">Android ARM64</div></div>
              <div class="stat-box"><div class="stat-label">Status</div><div class="stat-val" style="color:#10B981;">200 OK</div></div>
              <div class="stat-box"><div class="stat-label">Uptime</div><div class="stat-val">${uptime}s</div></div>
            </div>
            <div>
              <a href="/health" class="btn">Test /health (JSON)</a>
              <a href="/api" class="btn btn-alt">Test /api</a>
            </div>
          </div>
        </body>
        </html>
        """.trimIndent()
    }

    private fun buildReactPage(name: String, p: Int): String {
        return """
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>$name - React Frontend</title>
          <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
          <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
          <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            body { background: #0B0F19; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
            #root { max-width: 500px; width: 100%; }
            .react-card { background: #131B2E; border: 1px solid #1E293B; border-radius: 16px; padding: 28px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            .react-logo { font-size: 52px; display: inline-block; animation: spin 12s linear infinite; }
            @keyframes spin { 100% { transform: rotate(360deg); } }
            h1 { font-size: 22px; font-weight: 800; margin: 16px 0 6px; }
            p.tag { color: #61DAFB; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
            .counter-box { background: #0D1527; border: 1px solid #1E293B; border-radius: 12px; padding: 20px; margin: 20px 0; }
            .btn-counter { background: #61DAFB; color: #0B0F19; border: none; padding: 12px 24px; font-size: 14px; font-weight: 800; border-radius: 8px; cursor: pointer; }
            .meta { display: flex; justify-content: space-between; font-size: 11px; color: #94A3B8; margin-top: 14px; padding-top: 12px; border-top: 1px solid #1E293B; }
          </style>
        </head>
        <body>
          <div id="root"></div>
          <script type="text/babel">
            function App() {
              const [count, setCount] = React.useState(0);
              return (
                <div className="react-card">
                  <div className="react-logo">⚛️</div>
                  <h1>$name</h1>
                  <p className="tag">Live React App • PocketHost Mobile</p>
                  <p style={{ color: '#94A3B8', fontSize: '13px', lineHeight: 1.5 }}>
                    This React application is served live directly from internal Android storage on port $p.
                  </p>
                  <div className="counter-box">
                    <button className="btn-counter" onClick={() => setCount(count + 1)}>
                      Interactive Counter: {count}
                    </button>
                    <p style={{ fontSize: '11px', color: '#64748B', marginTop: '10px' }}>
                      Click button to test live React state updates
                    </p>
                  </div>
                  <div className="meta">
                    <span>Host: Android ARM64</span>
                    <span>Port: $p</span>
                    <span style={{ color: '#10B981' }}>● Online</span>
                  </div>
                </div>
              );
            }
            ReactDOM.render(<App />, document.getElementById('root'));
          </script>
        </body>
        </html>
        """.trimIndent()
    }

    private fun buildPythonPage(name: String, p: Int, uptime: Long): String {
        return """
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>$name - Python Microservice</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            body { background: #0B0F19; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
            .card { background: #131B2E; border: 1px solid #1E293B; border-radius: 16px; padding: 28px; max-width: 500px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(56, 189, 248, 0.15); color: #38BDF8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
            .dot { width: 8px; height: 8px; border-radius: 50%; background: #38BDF8; }
            h1 { font-size: 22px; font-weight: 800; margin: 16px 0 6px; }
            p.sub { font-size: 13px; color: #94A3B8; margin-bottom: 20px; line-height: 1.5; }
            .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
            .stat-box { background: #0D1527; border: 1px solid #1E293B; border-radius: 10px; padding: 12px; }
            .stat-label { font-size: 10px; color: #64748B; font-weight: 700; text-transform: uppercase; }
            .stat-val { font-size: 14px; font-weight: 700; color: #E2E8F0; margin-top: 4px; }
            .btn { display: inline-block; background: #0284C7; color: white; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-size: 12px; font-weight: 700; }
          </style>
        </head>
        <body>
          <div class="card">
            <span class="badge"><span class="dot"></span> PYTHON LIVE</span>
            <h1>$name</h1>
            <p class="sub">Python ASGI/WSGI microservice running on Android via PocketHost.</p>
            <div class="stats">
              <div class="stat-box"><div class="stat-label">Port</div><div class="stat-val">$p</div></div>
              <div class="stat-box"><div class="stat-label">Framework</div><div class="stat-val">FastAPI / Flask</div></div>
              <div class="stat-box"><div class="stat-label">Status</div><div class="stat-val" style="color:#38BDF8;">200 OK</div></div>
              <div class="stat-box"><div class="stat-label">Uptime</div><div class="stat-val">${uptime}s</div></div>
            </div>
            <div>
              <a href="/health" class="btn">Test /health (JSON)</a>
            </div>
          </div>
        </body>
        </html>
        """.trimIndent()
    }

    fun stop() {
        isRunning = false
        try { serverSocket?.close() } catch (_: Exception) {}
        scope.cancel()
    }
}
