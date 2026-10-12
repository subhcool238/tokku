/* The only bridge between the sandboxed character window and Guard. Keep it narrow. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('guard', {
  // renderer -> Guard
  hover: (on) => ipcRenderer.send('tokku:hover', !!on),          // mouse is over Tokku or his buttons: take clicks
  front: (on) => ipcRenderer.send('tokku:front', !!on),          // come to the front, or go back behind windows
  walk: (where) => ipcRenderer.send('tokku:walk', where === 'center' ? 'center' : 'home'),   // walk the window to the middle of the screen, or home
  // Guard -> renderer: simple events like { type: 'quiet', on: true } or { type: 'meal', meal: 'lunch' }
  onEvent: (cb) => ipcRenderer.on('guard:event', (e, ev) => cb(ev)),
});
