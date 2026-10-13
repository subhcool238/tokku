// Run: node src/main/tests/sense.test.js   (no dependencies)
// Checks the parts of Guard sensing that are plain logic: window classification and the "mic in use" reading.
const Module = require('node:module');
const load = Module._load;
Module._load = (request, ...rest) => (request === 'electron' ? { powerMonitor: {}, screen: {} } : load(request, ...rest));
const { classify, inUseFromReg } = require('../guard-sense.js');

let pass = 0, fail = 0;
const check = (name, got, want) => { if (got === want) pass++; else { fail++; console.log('FAIL ' + name + '  [got ' + got + ']'); } };

const KEY = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\';
const IN_USE = '0x0', STOPPED = '0x1dc3a7b2c4d5e6f';
const reg = (...apps) => apps.map(([name, stop]) => KEY + name + '\r\n    LastUsedTimeStop    REG_QWORD    ' + stop + '\r\n').join('\r\n');

check('Snipping Tool recording is not a call', inUseFromReg(reg(['Microsoft.ScreenSketch_8wekyb3d8bbwe', IN_USE])), false);
check('Game Bar recording is not a call', inUseFromReg(reg(['Microsoft.XboxGamingOverlay_8wekyb3d8bbwe', IN_USE])), false);
check('OBS recording is not a call', inUseFromReg(reg(['NonPackaged\\C:#Program Files#obs-studio#bin#64bit#obs64.exe', IN_USE])), false);
check('Zoom using the mic is a call', inUseFromReg(reg(['NonPackaged\\C:#Users#x#AppData#Roaming#Zoom#bin#Zoom.exe', IN_USE])), true);
check('recording during a browser call is still a call',
  inUseFromReg(reg(['Microsoft.ScreenSketch_8wekyb3d8bbwe', IN_USE], ['NonPackaged\\C:#Program Files#Google#Chrome#Application#chrome.exe', IN_USE])), true);
check('nobody using the mic', inUseFromReg(reg(['Microsoft.ScreenSketch_8wekyb3d8bbwe', STOPPED], ['NonPackaged\\x#Zoom.exe', STOPPED])), false);
check('empty output', inUseFromReg(''), false);

check('YouTube tab', classify('Lofi beats - YouTube - Google Chrome', 'Google Chrome').app, 'YouTube');
check('Netflix app', classify('', 'Netflix').category, 'video');
check('Hotstar tab', classify('Watch IPL Live | JioHotstar', 'Google Chrome').app, 'Hotstar');
check('Prime Video tab', classify('Prime Video: Home', 'Microsoft Edge').app, 'Prime Video');
check('a game', classify('VALORANT', 'VALORANT').category, 'game');
check('a meeting', classify('Zoom Meeting', 'Zoom').category, 'meeting');
check('work', classify('Tokku brief - Notion', 'Notion').category, 'work');
check('shopping is not a video', classify('Amazon.in: wireless mouse', 'Google Chrome').category, 'work');

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
