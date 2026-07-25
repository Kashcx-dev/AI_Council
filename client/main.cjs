const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // In development, load the Vite dev server URL directly.
  // In production, load the built dist/index.html via file:// protocol.
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:3000');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

// Electron is ready — create the first window.
app.whenReady().then(() => {
  ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (canceled) {
      return null;
    } else {
      return filePaths[0];
    }
  });

  ipcMain.handle('fs:listDirectory', async (_, dirPath) => {
    try {
      const files = fs.readdirSync(dirPath, { withFileTypes: true });
      return files.map(file => ({
        name: file.name,
        isDirectory: file.isDirectory(),
        path: path.join(dirPath, file.name)
      })).sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
        return a.isDirectory ? -1 : 1;
      });
    } catch (err) {
      console.error(err);
      return [];
    }
  });

  ipcMain.handle('fs:resolvePath', async (_, currentCwd, target) => {
    return path.resolve(currentCwd, target);
  });

  ipcMain.handle('fs:readFile', async (_, filePath) => {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      console.error(err);
      return '';
    }
  });

  ipcMain.handle('fs:writeFile', async (_, filePath, content) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  });

  ipcMain.handle('cmd:exec', async (_, command, cwd) => {
    return new Promise((resolve) => {
      exec(command, { cwd }, (error, stdout, stderr) => {
        resolve({
          error: error ? error.message : null,
          stdout,
          stderr
        });
      });
    });
  });

  createWindow();

  // macOS convention: re-create a window when the dock icon is clicked
  // and no other windows are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// On non-macOS platforms, quit when all windows are closed.
// On macOS, apps conventionally stay active until the user explicitly quits (Cmd+Q).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
