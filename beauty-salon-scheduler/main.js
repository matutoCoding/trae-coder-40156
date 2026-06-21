const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let isDev = process.argv.includes('--dev');

const DEFAULT_WINDOW_STATE = {
  width: 1280,
  height: 820,
  minWidth: 960,
  minHeight: 640,
  maximized: false
};

function getWindowStateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  try {
    const file = getWindowStateFile();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load window state:', e);
  }
  return { ...DEFAULT_WINDOW_STATE };
}

function saveWindowState() {
  if (!mainWindow) return;
  try {
    const bounds = mainWindow.getBounds();
    const state = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: mainWindow.isMaximized()
    };
    fs.writeFileSync(getWindowStateFile(), JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Failed to save window state:', e);
  }
}

function createMainWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width || DEFAULT_WINDOW_STATE.width,
    height: state.height || DEFAULT_WINDOW_STATE.height,
    x: state.x,
    y: state.y,
    minWidth: DEFAULT_WINDOW_STATE.minWidth,
    minHeight: DEFAULT_WINDOW_STATE.minHeight,
    title: '美容院护理排程系统',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#faf7f9',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev
    }
  });

  if (state.maximized) {
    mainWindow.maximize();
  }

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    saveWindowState();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('new-window', (e, url) => {
    e.preventDefault();
    shell.openExternal(url);
  });
}

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '导出数据备份...',
          accelerator: 'Ctrl+S',
          click: async () => {
            if (!mainWindow) return;
            const result = await dialog.showSaveDialog(mainWindow, {
              title: '导出数据备份',
              defaultPath: '美容院数据备份_' + getDateString() + '.json',
              filters: [
                { name: 'JSON 数据文件', extensions: ['json'] },
                { name: '所有文件', extensions: ['*'] }
              ]
            });
            if (!result.canceled && result.filePath) {
              mainWindow.webContents.send('export-data', result.filePath);
            }
          }
        },
        {
          label: '导入数据恢复...',
          accelerator: 'Ctrl+O',
          click: async () => {
            if (!mainWindow) return;
            const result = await dialog.showOpenDialog(mainWindow, {
              title: '导入数据备份',
              properties: ['openFile'],
              filters: [
                { name: 'JSON 数据文件', extensions: ['json'] },
                { name: '所有文件', extensions: ['*'] }
              ]
            });
            if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
              const choice = await dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: '确认导入',
                message: '导入数据将覆盖当前所有数据，确定继续吗？',
                detail: '建议先导出当前数据进行备份。',
                buttons: ['取消', '确认导入'],
                defaultId: 0,
                cancelId: 0
              });
              if (choice.response === 1) {
                mainWindow.webContents.send('import-data', result.filePaths[0]);
              }
            }
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '刷新',
          accelerator: 'F5',
          click: () => {
            if (mainWindow) mainWindow.reload();
          }
        },
        {
          label: '放大',
          accelerator: 'Ctrl+=',
          click: () => {
            if (mainWindow) {
              const current = mainWindow.webContents.getZoomLevel();
              mainWindow.webContents.setZoomLevel(current + 0.5);
            }
          }
        },
        {
          label: '缩小',
          accelerator: 'Ctrl+-',
          click: () => {
            if (mainWindow) {
              const current = mainWindow.webContents.getZoomLevel();
              mainWindow.webContents.setZoomLevel(current - 0.5);
            }
          }
        },
        {
          label: '实际大小',
          accelerator: 'Ctrl+0',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.setZoomLevel(0);
            }
          }
        },
        { type: 'separator' },
        {
          label: '全屏',
          accelerator: 'F11',
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          }
        }
      ]
    },
    {
      label: '工具',
      submenu: [
        {
          label: '打开数据目录',
          click: () => {
            shell.openPath(app.getPath('userData'));
          }
        },
        {
          label: '清除本地数据...',
          click: async () => {
            if (!mainWindow) return;
            const choice = await dialog.showMessageBox(mainWindow, {
              type: 'warning',
              title: '确认清除',
              message: '确定要清除所有本地数据吗？',
              detail: '此操作不可恢复！请先导出数据备份。',
              buttons: ['取消', '确认清除'],
              defaultId: 0,
              cancelId: 0
            });
            if (choice.response === 1) {
              mainWindow.webContents.send('clear-data');
            }
          }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: async () => {
            await dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于',
              message: '美容院护理排程系统 v' + app.getVersion(),
              detail: '智能排期 · 冲突校验 · 双向撮合 · 契合排序\n\n基于 Electron 构建的桌面客户端',
              buttons: ['确定']
            });
          }
        }
      ]
    }
  ];

  if (isDev) {
    template.push({
      label: '开发',
      submenu: [
        {
          label: '开发者工具',
          accelerator: 'F12',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          }
        }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function getDateString() {
  const now = new Date();
  return now.getFullYear() +
    ('0' + (now.getMonth() + 1)).slice(-2) +
    ('0' + now.getDate()).slice(-2) +
    ('0' + now.getHours()).slice(-2) +
    ('0' + now.getMinutes()).slice(-2);
}

app.whenReady().then(() => {
  createMainWindow();
  buildMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('export-complete', (event, success) => {
  if (success) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '导出成功',
      message: '数据导出成功！',
      buttons: ['确定']
    });
  } else {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: '导出失败',
      message: '数据导出失败，请重试。',
      buttons: ['确定']
    });
  }
});

ipcMain.on('import-complete', (event, success) => {
  if (success) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '导入成功',
      message: '数据导入成功！',
      buttons: ['确定']
    });
  } else {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: '导入失败',
      message: '数据导入失败，请检查文件格式。',
      buttons: ['确定']
    });
  }
});

ipcMain.handle('save-file', async (event, content, filePath) => {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (e) {
    console.error('Save file error:', e);
    return false;
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }
});

ipcMain.handle('show-save-dialog', async (event, defaultFilename) => {
  try {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出数据备份',
      defaultPath: defaultFilename || ('美容院数据备份_' + getDateString() + '.json'),
      filters: [
        { name: 'JSON 数据文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    return result;
  } catch (e) {
    console.error('Show save dialog error:', e);
    return { canceled: true };
  }
});
