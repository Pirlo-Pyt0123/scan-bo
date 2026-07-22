// Recompila los modulos nativos (better-sqlite3) para el ABI de Electron.
// Escrito en Node en vez de un script de shell para que funcione igual en
// Linux, Windows y Mac (la ruta del venv y la sintaxis de variables de
// entorno son distintas en cada uno).
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function findVenvSitePackages() {
  const venvDir = path.join(__dirname, '..', '..', 'venv');

  const winPath = path.join(venvDir, 'Lib', 'site-packages');
  if (fs.existsSync(winPath)) return winPath;

  const libDir = path.join(venvDir, 'lib');
  if (fs.existsSync(libDir)) {
    const pyDir = fs.readdirSync(libDir).find((d) => d.startsWith('python'));
    if (pyDir) {
      const linuxPath = path.join(libDir, pyDir, 'site-packages');
      if (fs.existsSync(linuxPath)) return linuxPath;
    }
  }

  return null;
}

const env = { ...process.env };
const sitePackages = findVenvSitePackages();
if (sitePackages) {
  env.PYTHONPATH = sitePackages;
}

execSync('electron-builder install-app-deps', { stdio: 'inherit', env });
