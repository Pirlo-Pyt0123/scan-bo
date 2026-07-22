const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const siat = require('../siat');
const db = require('../db');

// El AppImage no incluye chrome-sandbox con permisos setuid-root, asi que el
// sandbox de Chromium no puede inicializarse. La app solo carga HTML propio
// (nunca contenido remoto), asi que deshabilitarlo aqui es seguro.
app.commandLine.appendSwitch('no-sandbox');

// La app solo pinta interfaz plana y un canvas 2D, no necesita GPU. En algunos
// equipos el proceso de GPU falla al iniciar (driver Intel) y Electron gasta
// varios segundos reintentando antes de caer a render por software; evitamos
// ese ciclo arrancando directo en software.
app.disableHardwareAcceleration();

// safeStorage (usado para cifrar las credenciales del SIAT) detecta el
// backend de llavero segun XDG_CURRENT_DESKTOP. En escritorios que no son
// GNOME/KDE "de fabrica" (tiling WMs como niri, sway, i3, etc.) esa deteccion
// falla aunque gnome-keyring este corriendo, y isEncryptionAvailable()
// devuelve false. Forzamos el backend real de libsecret explicitamente.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('password-store', 'gnome-libsecret');
}

let mainWindow;
let pythonProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#eef0f7',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('src/index.html');
  
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (pythonProcess) {
      pythonProcess.kill();
    }
  });
}

function sendToRenderer(json) {
  if (mainWindow) {
    mainWindow.webContents.send('python-data', json);
  }
}

function getBackendCommand() {
  if (app.isPackaged) {
    // Binario standalone empaquetado por PyInstaller (ver electron-builder.extraResources)
    const binName = process.platform === 'win32' ? 'backend.exe' : 'backend';
    return { command: path.join(process.resourcesPath, 'backend', binName), args: [] };
  }

  const pythonScript = path.join(__dirname, '../python/backend.py');
  const venvPython = process.platform === 'win32'
    ? path.join(__dirname, '../../venv/Scripts/python.exe')
    : path.join(__dirname, '../../venv/bin/python3');

  return { command: venvPython, args: [pythonScript] };
}

function getSiatCommand() {
  if (app.isPackaged) {
    // Binario standalone empaquetado por PyInstaller (ver electron-builder.extraResources)
    const binName = process.platform === 'win32' ? 'siat_automation.exe' : 'siat_automation';
    return { command: path.join(process.resourcesPath, 'backend', binName), args: [] };
  }

  const script = path.join(__dirname, '../python/siat_automation.py');
  const venvPython = process.platform === 'win32'
    ? path.join(__dirname, '../../venv/Scripts/python.exe')
    : path.join(__dirname, '../../venv/bin/python3');

  return { command: venvPython, args: [script] };
}

function startPythonBackend() {
  const { command, args } = getBackendCommand();

  pythonProcess = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let buffer = '';

  pythonProcess.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.trim()) {
        try {
          sendToRenderer(JSON.parse(line));
        } catch (e) {}
      }
    }
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error('Python:', data.toString());
  });

  pythonProcess.on('error', (err) => {
    console.error('No se pudo iniciar el backend:', err);
    sendToRenderer({ type: 'error', message: 'No se pudo iniciar el backend de camara' });
  });

  pythonProcess.on('close', (code) => {
    console.log(`Python exited: ${code}`);
    if (code !== 0 && code !== null) {
      sendToRenderer({ type: 'error', message: 'El backend de camara se detuvo inesperadamente' });
    }
  });
}

ipcMain.on('send-command', (event, command) => {
  if (pythonProcess && pythonProcess.stdin.writable) {
    pythonProcess.stdin.write(JSON.stringify(command) + '\n');
  }
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('close-window', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('app:is-packaged', () => app.isPackaged);

ipcMain.handle('db:save-invoice', (event, fields) => {
  try {
    const empresa = db.saveInvoice(fields);
    return { success: true, empresa };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('db:update-invoice-fields', (event, { id, fields }) => {
  try {
    db.updateInvoiceFields(id, fields);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('db:get-invoices', (event, empresa, statusGroup) => {
  return db.getInvoicesByEmpresa(empresa, statusGroup);
});

ipcMain.handle('db:delete-invoice', (event, id) => {
  try {
    db.deleteInvoice(id);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('db:get-empresa-nit', (event, empresa) => {
  return db.EMPRESA_NIT[empresa] || null;
});

app.whenReady().then(() => {
  createWindow();
  startPythonBackend();
});

ipcMain.handle('siat:has-credentials', () => {
  return siat.hasCredentials();
});

ipcMain.handle('siat:save-credentials', (event, credentials) => {
  try {
    siat.saveCredentials(credentials);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('siat:get-credentials', () => {
  return siat.loadCredentials();
});

ipcMain.handle('siat:upload-batch', async (event, invoices) => {
  return new Promise((resolve) => {
    const credentials = siat.loadCredentials();
    if (!credentials) {
      resolve({ success: false, error: 'No hay credenciales guardadas' });
      return;
    }

    const payload = JSON.stringify({ credentials, invoices }) + '\n';
    const { command, args } = getSiatCommand();
    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let buffer = '';
    let resolved = false;

    proc.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'progress' && mainWindow) {
            mainWindow.webContents.send('siat:progress', msg);
          } else if (msg.type === 'invoice_result') {
            db.updateInvoiceStatus(msg.autorizacion, msg.factura, msg.status);
            if (mainWindow) {
              mainWindow.webContents.send('siat:invoice-result', msg);
            }
          } else if (msg.type === 'success' && !resolved) {
            resolved = true;
            resolve({ success: true });
          } else if (msg.type === 'error' && !resolved) {
            resolved = true;
            resolve({ success: false, error: msg.message });
          }
        } catch (e) {}
      }
    });

    proc.stderr.on('data', (data) => {
      console.error('SIAT Python:', data.toString());
    });

    proc.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        if (code !== 0) {
          resolve({ success: false, error: `Proceso terminó con código ${code}` });
        } else {
          resolve({ success: true });
        }
      }
    });

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: err.message });
      }
    });

    proc.stdin.write(payload);
    proc.stdin.end();
  });
});

ipcMain.handle('siat:get-fake', () => {
  return siat.FAKE_INVOICES;
});

app.on('window-all-closed', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  app.quit();
});
