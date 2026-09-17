const { app, BrowserWindow } = require("electron");

const WEB_URL = process.env.PUBLIC_WEB_URL ?? "http://127.0.0.1:5173";

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: undefined,
    },
  });
  void window.loadURL(`${WEB_URL}/staff/login`);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
