/* Bridge for the small settings window (Notion link, partner PIN, turning Tokku off). */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  notionStatus: () => ipcRenderer.invoke('settings:notion-status'),
  notionSave: (token, database) => ipcRenderer.invoke('settings:notion-save', String(token), String(database)),
  notionDisconnect: () => ipcRenderer.invoke('settings:notion-disconnect'),
  pinStatus: () => ipcRenderer.invoke('settings:pin-status'),
  pinSet: (pin, current) => ipcRenderer.invoke('settings:pin-set', String(pin), String(current || '')),
  quit: (pin) => ipcRenderer.invoke('settings:quit', String(pin)),
  emergencyStart: () => ipcRenderer.invoke('settings:emergency-start'),
  emergencyStop: () => ipcRenderer.invoke('settings:emergency-stop'),
  emergencyQuit: (reason) => ipcRenderer.invoke('settings:emergency-quit', String(reason)),
  partnerTopic: (create) => ipcRenderer.invoke('settings:partner-topic', !!create),
  canAsk: () => ipcRenderer.invoke('settings:can-ask'),
  askUnlock: () => ipcRenderer.invoke('settings:ask-unlock'),
  close: () => ipcRenderer.send('settings:close'),
});
