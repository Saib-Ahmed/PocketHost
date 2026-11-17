import { TechStackId } from '../types/stack';

export interface StarterFile {
  name: string;
  content: string;
}

export function getStarterFiles(stackId: TechStackId, port: number, mongoUri?: string): StarterFile[] {
  switch (stackId) {
    case 'node-api':
      return [
        {
          name: 'server.js',
          content: `// PocketHost Node.js REST API
const http = require('http');
const PORT = process.env.PORT || ${port};

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ONLINE',
      platform: 'PocketHost (Android Linux)',
      stack: 'Node.js REST API',
      port: PORT,
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(\`[PocketHost] Node API server listening on 0.0.0.0:\${PORT}\`);
});
`,
        },
        {
          name: 'package.json',
          content: JSON.stringify(
            {
              name: 'pockethost-node-api',
              version: '1.0.0',
              main: 'server.js',
              scripts: {
                start: 'node server.js',
              },
            },
            null,
            2
          ),
        },
      ];

    case 'python-api':
      return [
        {
          name: 'app.py',
          content: `# PocketHost Python Web App
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

PORT = ${port}

class SimpleHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        response = {
            "status": "ONLINE",
            "runtime": "Python 3 on Android",
            "stack": "FastAPI/Flask Compatible",
            "port": PORT
        }
        self.wfile.write(json.dumps(response).encode('utf-8'))

print(f"[PocketHost] Starting Python server on port {PORT}...")
httpd = HTTPServer(('0.0.0.0', PORT), SimpleHandler)
httpd.serve_forever()
`,
        },
      ];

    case 'react-frontend':
      return [
        {
          name: 'index.html',
          content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>React App - PocketHost</title>
  <style>
    body { background: #0B0F19; color: #F9FAFB; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #161F36; border: 1px solid #232F4D; border-radius: 18px; padding: 36px; max-width: 480px; text-align: center; }
    .badge { background: rgba(6, 182, 212, 0.2); color: #06B6D4; padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 13px; display: inline-block; margin-bottom: 16px; }
    h1 { margin: 0 0 10px; font-size: 26px; }
    p { color: #94A3B8; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">React Frontend Hosted Live</div>
    <h1>Running on Mobile</h1>
    <p>This React single page application is being served directly from your Android phone using PocketHost.</p>
  </div>
</body>
</html>
`,
        },
      ];

    case 'nextjs':
      return [
        {
          name: 'server.js',
          content: `// PocketHost Next.js Standalone Runner
const http = require('http');
const PORT = process.env.PORT || ${port};

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(\`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Next.js on PocketHost</title>
        <style>
          body { font-family: system-ui; background: #000; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .box { text-align: center; padding: 40px; border: 1px solid #333; border-radius: 12px; }
          .tag { color: #EC4899; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="box">
          <h2>▲ Next.js Server-Side Running</h2>
          <p>Hosted on Android via <span class="tag">PocketHost</span></p>
          <p>Port: ${port}</p>
        </div>
      </body>
    </html>
  \`);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(\`[PocketHost] Next.js service listening on port \${PORT}\`);
});
`,
        },
      ];

    case 'mern':
      return [
        {
          name: 'server.js',
          content: `// PocketHost MERN Backend Server
const express = require('express');
const app = express();
const PORT = process.env.PORT || ${port};
const MONGO_URI = process.env.MONGODB_URI || '${mongoUri || ''}';

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    host: 'PocketHost Android Engine',
    timestamp: new Date().toISOString(),
    database: MONGO_URI ? 'MongoDB Atlas (Configured)' : 'None (Cloud URI not set)'
  });
});

app.get('*', (req, res) => {
  res.send(\`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Hosted on PocketHost (Android)</title>
      <style>
        body { font-family: sans-serif; background: #0B0F19; color: #F9FAFB; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .card { background: #161F36; border: 1px solid #232F4D; border-radius: 16px; padding: 32px; max-width: 500px; text-align: center; }
        .badge { background: rgba(16, 185, 129, 0.2); color: #10B981; padding: 6px 14px; border-radius: 20px; font-weight: 600; display: inline-block; margin-bottom: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">MERN Application Live</div>
        <h1>Hosted on Android Phone</h1>
        <p>Running directly on a mobile device powered by PocketHost.</p>
      </div>
    </body>
    </html>
  \`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(\`[PocketHost] MERN Server running on port \${PORT}\`);
});
`,
        },
      ];

    default:
      return [
        {
          name: 'main.js',
          content: `const http = require('http');
const PORT = process.env.PORT || ${port};
http.createServer((req, res) => {
  res.end('PocketHost Custom Linux Service Running on port ' + PORT);
}).listen(PORT, '0.0.0.0');
console.log('Custom service started on port ' + PORT);
`,
        },
      ];
  }
}
