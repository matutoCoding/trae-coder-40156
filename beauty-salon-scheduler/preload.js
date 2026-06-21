const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isDesktop: true,

  onExportData: (callback) => {
    ipcRenderer.on('export-data', (event, filePath) => {
      callback(filePath);
    });
  },

  onImportData: (callback) => {
    ipcRenderer.on('import-data', (event, filePath) => {
      callback(filePath);
    });
  },

  onClearData: (callback) => {
    ipcRenderer.on('clear-data', () => {
      callback();
    });
  },

  saveFile: (content, filePath) => {
    return ipcRenderer.invoke('save-file', content, filePath);
  },

  readFile: (filePath) => {
    return ipcRenderer.invoke('read-file', filePath);
  },

  showSaveDialog: (defaultFilename) => {
    return ipcRenderer.invoke('show-save-dialog', defaultFilename);
  },

  sendExportComplete: (success) => {
    ipcRenderer.send('export-complete', success);
  },

  sendImportComplete: (success) => {
    ipcRenderer.send('import-complete', success);
  },

  getVersion: () => {
    return '1.0.0';
  }
});

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('electron-app');
});
