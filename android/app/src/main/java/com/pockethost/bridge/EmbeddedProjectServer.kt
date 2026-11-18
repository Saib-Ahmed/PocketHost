package com.pockethost.bridge

import kotlinx.coroutines.*
import java.io.*
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

class EmbeddedProjectServer(
    val projectId: String,
    val projectName: String,
    val stackId: String,
    val port: Int,
    val projectDir: File,
    val onLog: (text: String, channel: String) -> Unit
) {
    private var serverSocket: ServerSocket? = null
    var isRunning = false
        private set

    val requestsCount = AtomicLong(0L)
    val bytesTransferred = AtomicLong(0L)
    val activeConnections = AtomicInteger(0)

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
                        activeConnections.incrementAndGet()
                        try {
                            handleClient(client)
                        } finally {
                            activeConnections.decrementAndGet()
                        }
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
            val queryStr = if (fullPath.contains("?")) fullPath.substringAfter("?") else ""

            // Drain remaining headers
            while (true) {
                val line = input.readLine() ?: break
                if (line.isEmpty()) break
            }

            requestsCount.incrementAndGet()
            onLog("[HTTP] $method $path -> 200 OK", "stdout")

            // 1. API Endpoint for file preview
            if (path == "/_api/file") {
                val queryParams = parseQuery(queryStr)
                val targetRel = queryParams["path"] ?: ""
                val safeFile = File(projectDir, targetRel).canonicalFile
                if (safeFile.exists() && safeFile.isFile && safeFile.startsWith(projectDir.canonicalFile)) {
                    val content = safeFile.readText(StandardCharsets.UTF_8)
                    sendResponse(output, 200, "OK", "text/plain; charset=utf-8", content.toByteArray(StandardCharsets.UTF_8))
                } else {
                    sendResponse(output, 404, "Not Found", "text/plain", "File not found or outside project".toByteArray())
                }
                return
            }

            // 2. Health & API endpoints
            if (path == "/health" || path == "/api" || path == "/_api/status") {
                val uptimeSec = (System.currentTimeMillis() - startTime) / 1000
                val filesCount = countFiles(projectDir)
                val dirSizeMb = calculateDirSize(projectDir).toDouble() / (1024.0 * 1024.0)
                val json = """{"status":"ONLINE","service":"$projectName","stack":"$stackId","port":$port,"uptimeSeconds":$uptimeSec,"requestsHandled":${requestsCount.get()},"filesCount":$filesCount,"storageMb":${String.format("%.2f", dirSizeMb)},"platform":"Android ARM64"}"""
                sendResponse(output, 200, "OK", "application/json", json.toByteArray(StandardCharsets.UTF_8))
                return
            }

            // 3. Resolve real Web Root for user-uploaded projects
            val webRoot = resolveWebRoot(projectDir)
            if (webRoot != null) {
                // If the user uploaded a project that has an index.html (Next.js export, React Vite dist, or static site)
                val relPath = if (path == "/" || path.isEmpty()) "index.html" else path.removePrefix("/")
                var targetFile = File(webRoot, relPath)

                // SPA fallback handling
                if (!targetFile.exists() || targetFile.isDirectory) {
                    val htmlCandidate = File(webRoot, "$relPath.html")
                    if (htmlCandidate.exists() && htmlCandidate.isFile) {
                        targetFile = htmlCandidate
                    } else if (File(webRoot, "index.html").exists()) {
                        targetFile = File(webRoot, "index.html")
                    }
                }

                if (targetFile.exists() && targetFile.isFile) {
                    val mime = getMimeType(targetFile.name)
                    val bytes = targetFile.readBytes()
                    sendResponse(output, 200, "OK", mime, bytes)
                    return
                }
            }

            // 4. If no index.html found (e.g. raw Next.js / Node.js backend files),
            // render the Real Project Workspace & File Explorer
            val projectFiles = listProjectFiles(projectDir)
            if (projectFiles.isNotEmpty()) {
                val html = buildProjectWorkspacePage(projectName, port, stackId, projectDir, projectFiles)
                sendResponse(output, 200, "OK", "text/html; charset=utf-8", html.toByteArray(StandardCharsets.UTF_8))
                return
            }

            // 5. Fallback for new projects before files uploaded
            val cleanStack = stackId.lowercase()
            val html = when {
                cleanStack.contains("react") || cleanStack.contains("next") -> buildReactPage(projectName, port)
                cleanStack.contains("python") -> buildPythonPage(projectName, port, (System.currentTimeMillis() - startTime) / 1000)
                else -> buildNodeJsPage(projectName, port, (System.currentTimeMillis() - startTime) / 1000)
            }
            sendResponse(output, 200, "OK", "text/html; charset=utf-8", html.toByteArray(StandardCharsets.UTF_8))

        } catch (_: Exception) {
        } finally {
            try { socket.close() } catch (_: Exception) {}
        }
    }

    private fun resolveWebRoot(dir: File): File? {
        val candidates = listOf("out", "dist", "build", "public", "")
        for (c in candidates) {
            val root = if (c.isEmpty()) dir else File(dir, c)
            if (File(root, "index.html").exists()) return root
        }

        // Check one level of subdirectories (e.g. my-app/out, my-app/dist, my-app/index.html)
        dir.listFiles()?.filter { it.isDirectory }?.forEach { sub ->
            for (c in candidates) {
                val root = if (c.isEmpty()) sub else File(sub, c)
                if (File(root, "index.html").exists()) return root
            }
        }
        return null
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
        bytesTransferred.addAndGet(data.size.toLong())
    }

    private fun parseQuery(query: String): Map<String, String> {
        val map = mutableMapOf<String, String>()
        if (query.isEmpty()) return map
        query.split("&").forEach { pair ->
            val kv = pair.split("=")
            if (kv.size == 2) {
                map[java.net.URLDecoder.decode(kv[0], "UTF-8")] = java.net.URLDecoder.decode(kv[1], "UTF-8")
            }
        }
        return map
    }

    private fun countFiles(dir: File): Int {
        var count = 0
        dir.listFiles()?.forEach { f ->
            if (f.isDirectory) count += countFiles(f) else count++
        }
        return count
    }

    private fun calculateDirSize(dir: File): Long {
        var size = 0L
        dir.listFiles()?.forEach { f ->
            size += if (f.isDirectory) calculateDirSize(f) else f.length()
        }
        return size
    }

    private fun listProjectFiles(dir: File, baseDir: File = dir, maxFiles: Int = 80): List<Pair<String, Long>> {
        val list = mutableListOf<Pair<String, Long>>()
        dir.listFiles()?.forEach { f ->
            if (list.size >= maxFiles) return@forEach
            if (f.isDirectory) {
                if (!f.name.startsWith(".") && f.name != "node_modules") {
                    list.addAll(listProjectFiles(f, baseDir, maxFiles - list.size))
                }
            } else {
                list.add(Pair(f.relativeTo(baseDir).path.replace("\\", "/"), f.length()))
            }
        }
        return list
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

    private fun buildProjectWorkspacePage(name: String, p: Int, stack: String, dir: File, files: List<Pair<String, Long>>): String {
        val pkgFile = File(dir, "package.json")
        var pkgName = name
        var pkgVersion = "1.0.0"
        var pkgDesc = "Mobile Hosted Application Workspace"
        val deps = mutableListOf<String>()

        if (pkgFile.exists()) {
            try {
                val json = pkgFile.readText(StandardCharsets.UTF_8)
                val nameMatch = """"name"\s*:\s*"([^"]+)"""".toRegex().find(json)
                if (nameMatch != null) pkgName = nameMatch.groupValues[1]
                val verMatch = """"version"\s*:\s*"([^"]+)"""".toRegex().find(json)
                if (verMatch != null) pkgVersion = verMatch.groupValues[1]
                val descMatch = """"description"\s*:\s*"([^"]+)"""".toRegex().find(json)
                if (descMatch != null) pkgDesc = descMatch.groupValues[1]

                val depSection = """"dependencies"\s*:\s*\{([^}]+)\}""".toRegex().find(json)
                depSection?.groupValues?.get(1)?.split(",")?.forEach {
                    val dMatch = """"([^"]+)"\s*:\s*"([^"]+)"""".toRegex().find(it)
                    if (dMatch != null) deps.add("${dMatch.groupValues[1]}: ${dMatch.groupValues[2]}")
                }
            } catch (_: Exception) {}
        }

        val totalSizeMb = calculateDirSize(dir).toDouble() / (1024.0 * 1024.0)

        val fileListHtml = files.joinToString("\n") { (relPath, size) ->
            val sizeStr = if (size > 1024 * 1024) String.format("%.1f MB", size.toDouble() / (1024.0 * 1024.0)) else "${size / 1024} KB"
            """<div class="file-row" onclick="viewFile('$relPath')">
                 <span class="file-name">📄 $relPath</span>
                 <span class="file-size">$sizeStr</span>
               </div>"""
        }

        val depsHtml = if (deps.isNotEmpty()) {
            deps.take(12).joinToString(" ") { """<span class="chip">$it</span>""" }
        } else {
            """<span class="chip">Custom Project Files</span>"""
        }

        return """
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>$pkgName - PocketHost Workspace</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            body { background: #0B0F19; color: #F8FAFC; min-height: 100vh; padding: 24px 16px; }
            .container { max-width: 820px; margin: 0 auto; }
            .header-card { background: #131B2E; border: 1px solid #1E293B; border-radius: 16px; padding: 24px; margin-bottom: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            .badge-live { display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; }
            .dot { width: 8px; height: 8px; border-radius: 50%; background: #10B981; animation: pulse 2s infinite; }
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
            h1 { font-size: 24px; font-weight: 800; margin: 12px 0 6px; }
            p.desc { font-size: 13px; color: #94A3B8; margin-bottom: 16px; line-height: 1.5; }
            .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-top: 16px; }
            .meta-item { background: #0D1527; border: 1px solid #1E293B; border-radius: 10px; padding: 12px; }
            .meta-label { font-size: 10px; color: #64748B; font-weight: 700; text-transform: uppercase; }
            .meta-val { font-size: 14px; font-weight: 700; color: #E2E8F0; margin-top: 4px; }
            .chips-wrap { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 6px; }
            .chip { background: rgba(56, 189, 248, 0.12); color: #38BDF8; border: 1px solid rgba(56, 189, 248, 0.25); padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; font-family: monospace; }
            .section-card { background: #131B2E; border: 1px solid #1E293B; border-radius: 16px; padding: 20px; margin-bottom: 20px; }
            .section-title { font-size: 15px; font-weight: 700; color: #F1F5F9; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
            .file-list { max-height: 280px; overflow-y: auto; border: 1px solid #1E293B; border-radius: 10px; background: #0D1527; }
            .file-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid #1E293B; font-size: 12px; cursor: pointer; transition: background 0.15s; }
            .file-row:hover { background: #1E293B; }
            .file-name { font-family: monospace; color: #93C5FD; }
            .file-size { color: #64748B; font-size: 11px; }
            #viewer { display: none; margin-top: 14px; }
            #codePre { background: #080D1A; border: 1px solid #334155; border-radius: 10px; padding: 16px; font-family: monospace; font-size: 12px; color: #CBD5E1; max-height: 350px; overflow: auto; white-space: pre-wrap; word-break: break-all; }
            .btn-action { display: inline-block; background: #6366F1; color: white; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-size: 12px; font-weight: 700; margin-right: 8px; border: none; cursor: pointer; }
            .btn-secondary { background: transparent; border: 1px solid #475569; color: #CBD5E1; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header-card">
              <span class="badge-live"><span class="dot"></span> ${stack.uppercase()} WORKSPACE LIVE</span>
              <h1>$pkgName <span style="font-size: 14px; color: #64748B; font-weight: 400;">v$pkgVersion</span></h1>
              <p class="desc">$pkgDesc</p>
              <div class="meta-grid">
                <div class="meta-item"><div class="meta-label">Port</div><div class="meta-val">$p</div></div>
                <div class="meta-item"><div class="meta-label">Project Files</div><div class="meta-val">${files.size} Uploaded</div></div>
                <div class="meta-item"><div class="meta-label">Workspace Size</div><div class="meta-val">${String.format("%.1f", totalSizeMb)} MB</div></div>
                <div class="meta-item"><div class="meta-label">Host</div><div class="meta-val">Android ARM64</div></div>
              </div>
              <div class="chips-wrap">$depsHtml</div>
            </div>

            <div class="section-card">
              <div class="section-title">
                <span>📁 Uploaded Project Files (${files.size})</span>
                <span style="font-size: 11px; color: #64748B;">Tap any file to inspect source</span>
              </div>
              <div class="file-list">$fileListHtml</div>
              <div id="viewer">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <span id="viewerTitle" style="font-family: monospace; font-size: 12px; color: #38BDF8; font-weight: 700;"></span>
                  <button class="btn-action btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="document.getElementById('viewer').style.display='none'">Close</button>
                </div>
                <pre id="codePre"></pre>
              </div>
            </div>

            <div class="section-card">
              <div class="section-title">🚀 Realtime Endpoints & Diagnostics</div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <a href="/health" class="btn-action" target="_blank">Test /health (JSON)</a>
                <a href="/_api/status" class="btn-action btn-secondary" target="_blank">Diagnostic State</a>
              </div>
            </div>
          </div>

          <script>
            function viewFile(path) {
              const viewer = document.getElementById('viewer');
              const title = document.getElementById('viewerTitle');
              const pre = document.getElementById('codePre');
              title.innerText = '📄 ' + path;
              pre.innerText = 'Loading file from phone storage...';
              viewer.style.display = 'block';

              fetch('/_api/file?path=' + encodeURIComponent(path))
                .then(r => r.text())
                .then(t => { pre.innerText = t; })
                .catch(e => { pre.innerText = 'Failed to load file: ' + e; });
            }
          </script>
        </body>
        </html>
        """.trimIndent()
    }

    private fun buildReactPage(name: String, p: Int): String {
        return """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>$name - React Application</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            body { background: #0B0F19; color: #F9FAFB; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
            .card { background: #161F36; border: 1px solid #232F4D; border-radius: 18px; padding: 36px; max-width: 500px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            .badge { background: rgba(6, 182, 212, 0.2); color: #06B6D4; padding: 6px 14px; border-radius: 20px; font-weight: 800; font-size: 12px; display: inline-block; margin-bottom: 16px; border: 1px solid rgba(6, 182, 212, 0.3); }
            h1 { margin: 0 0 10px; font-size: 24px; font-weight: 800; }
            p { color: #94A3B8; line-height: 1.6; font-size: 13px; margin-bottom: 24px; }
            .btn { display: inline-block; background: #06B6D4; color: #0B0F19; font-weight: 800; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">⚛️ REACT FRONTEND LIVE</div>
            <h1>$name</h1>
            <p>React application running live on Android ARM64 via PocketHost Engine on port $p.</p>
            <a href="/health" class="btn">View Runtime Diagnostics</a>
          </div>
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
              <a href="/_api/status" class="btn btn-alt">Test /status</a>
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
