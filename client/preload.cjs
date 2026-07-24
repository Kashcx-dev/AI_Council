// Preload script — exposing Node/Electron APIs safely to renderer
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

window.ipcRenderer = ipcRenderer;
window.nodeFs = fs;
window.nodePath = path;

console.log('[AI Council] Preload script loaded with Electron IPC bindings.');
