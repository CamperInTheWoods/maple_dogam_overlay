const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlay", {
  onSnapshot: (cb) => ipcRenderer.on("snapshot", (_e, snap) => cb(snap)),
  onLinkState: (cb) => ipcRenderer.on("link-state", (_e, st) => cb(st)),
  close: () => ipcRenderer.send("close-overlay"),
  sendCommand: (cmd) => ipcRenderer.send("command", cmd),
  resize: (w, h) => ipcRenderer.send("resize", w, h),
});
