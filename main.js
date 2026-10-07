const { app, BrowserWindow, ipcMain } = require("electron");
const http = require("http");

const PORT = 47823;
// 정확히 일치하는 출처만 허용 (접두사 비교는 localhost.evil.com 같은 주소를 통과시키므로 쓰지 않음)
const ALLOWED_ORIGINS = new Set([
  "https://camperinthewoods.github.io",
]);
const STALE_MS = 5000;

let win = null;
let lastSnapshotAt = 0;
let lastWidth = 0;
const pendingCommands = [];

function allowOrigin(req, res) {
  const origin = req.headers.origin || "";
  const ok = ALLOWED_ORIGINS.has(origin);
  if (ok) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  return ok;
}

function startServer() {
  const server = http.createServer((req, res) => {
    if (!allowOrigin(req, res)) { res.writeHead(403); return res.end(); }
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (req.method === "GET" && req.url === "/ping") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ app: "maple-dogam-overlay", version: app.getVersion() }));
    }
    if (req.method === "POST" && req.url === "/snapshot") {
      let body = "";
      req.on("data", (c) => { body += c; if (body.length > 2_000_000) req.destroy(); });
      req.on("end", () => {
        try {
          const snap = JSON.parse(body);
          lastSnapshotAt = Date.now();
          if (win && !win.isDestroyed()) win.webContents.send("snapshot", snap);
          // 설치형 창에서 누른 명령(시작/정지, 채널변경)은 다음 응답에 실어 웹이 실행하게 함
          // 창 너비도 같이 돌려줘서, 사용자가 늘린 만큼 웹이 타임라인 시간 범위를 맞추게 함
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ commands: pendingCommands.splice(0), width: lastWidth }));
        } catch {
          res.writeHead(400); res.end();
        }
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  server.listen(PORT, "127.0.0.1");
  return server;
}

function createWindow() {
  win = new BrowserWindow({
    width: 520,
    height: 180,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: require("path").join(__dirname, "build", "icon.png"),
    hasShadow: false,
    resizable: true,
    webPreferences: {
      preload: require("path").join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // 창이 외부 주소로 이동하거나 새 창을 여는 것을 막음
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.setAlwaysOnTop(true, "screen-saver");
  win.on("resize", () => { lastWidth = win.getBounds().width; });
  win.loadFile(require("path").join(__dirname, "renderer", "index.html"));
  win.on("closed", () => { win = null; });
}

app.whenReady().then(() => {
  startServer();
  createWindow();
  // 웹 탭이 닫혀 스냅샷이 끊기면 렌더러에 알려서 "연결 끊김"을 표시
  setInterval(() => {
    if (win && !win.isDestroyed()) {
      win.webContents.send("link-state", { connected: Date.now() - lastSnapshotAt < STALE_MS });
    }
  }, 1000);
});

app.on("window-all-closed", () => app.quit());

ipcMain.on("close-overlay", () => app.quit());
ipcMain.on("command", (_e, cmd) => { if (cmd && typeof cmd.type === "string") pendingCommands.push(cmd); });
ipcMain.on("resize", (_e, w, h) => {
  if (win && !win.isDestroyed() && w > 0 && h > 0) win.setSize(Math.round(w), Math.round(h));
});
