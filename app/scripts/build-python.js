// Compila backend.py o siat_automation.py a un binario standalone con
// PyInstaller. Escrito en Node (en vez de un comando de shell en
// package.json) porque la ruta del pyinstaller del venv difiere entre
// Linux/Mac (venv/bin/pyinstaller) y Windows (venv\Scripts\pyinstaller.exe).
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const target = process.argv[2];
if (target !== 'backend' && target !== 'siat') {
  console.error('Uso: node build-python.js <backend|siat>');
  process.exit(1);
}

const isWin = process.platform === 'win32';
const venvBin = isWin ? 'Scripts' : 'bin';
const pyinstallerName = isWin ? 'pyinstaller.exe' : 'pyinstaller';
const pyinstaller = path.join(__dirname, '..', '..', 'venv', venvBin, pyinstallerName);

if (!fs.existsSync(pyinstaller)) {
  console.error(`No se encontro pyinstaller en ${pyinstaller}`);
  console.error('Activa el venv e instala las dependencias: pip install -r requirements.txt');
  process.exit(1);
}

const appDir = path.join(__dirname, '..');

const configs = {
  backend: {
    name: 'backend',
    script: path.join('python', 'backend.py'),
    extraArgs: []
  },
  siat: {
    name: 'siat_automation',
    script: path.join('python', 'siat_automation.py'),
    extraArgs: ['--collect-all', 'selenium', '--collect-all', 'webdriver_manager']
  }
};

const cfg = configs[target];

const args = [
  '--onefile',
  '--name', cfg.name,
  '--clean',
  '--distpath', path.join('python', 'dist'),
  '--workpath', path.join('python', 'build'),
  '--specpath', 'python',
  ...cfg.extraArgs,
  cfg.script
];

const result = spawnSync(pyinstaller, args, { cwd: appDir, stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
