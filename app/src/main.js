const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// El AppImage no incluye chrome-sandbox con permisos setuid-root, asi que el
// sandbox de Chromium no puede inicializarse. La app solo carga HTML propio
// (nunca contenido remoto), asi que deshabilitarlo aqui es seguro.
app.commandLine.appendSwitch('no-sandbox');

// La app solo pinta interfaz plana y un canvas 2D, no necesita GPU. En algunos
// equipos el proceso de GPU falla al iniciar (driver Intel) y Electron gasta
// varios segundos reintentando antes de caer a render por software; evitamos
// ese ciclo arrancando directo en software.
app.disableHardwareAcceleration();

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

app.whenReady().then(() => {
  createWindow();
  startPythonBackend();
});

app.on('window-all-closed', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  app.quit();
});
