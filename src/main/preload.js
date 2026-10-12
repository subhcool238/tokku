/* The only bridge between the sandboxed character window and Guard. Keep it narrow. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('guard', {
  // renderer -> Guard
  hover: (on) => ipcRenderer.send('tokku:hover', !!on),          // mouse is over Tokku or his buttons: take clicks
  front: (on) => ipcRenderer.send('tokku:front', !!on),          // come to the front, or go back behind windows
  walk: (where) => ipcRenderer.send('tokku:walk', where === 'center' ? 'center' : 'home'),   // walk the window to the middle of the screen, or home
  dragStart: () => ipcRenderer.send('tokku:drag-start'),         // the window follows the mouse while he is dragged
  drag: (dx, dy) => ipcRenderer.send('tokku:drag', Number(dx) || 0, Number(dy) || 0),
  drop: () => ipcRenderer.send('tokku:drop'),                     // let go: he falls back to the floor
  // Guard -> renderer: simple events like { type: 'quiet', on: true } or { type: 'meal', meal: 'lunch' }
  onEvent: (cb) => ipcRenderer.on('guard:event', (e, ev) => cb(ev)),
});
