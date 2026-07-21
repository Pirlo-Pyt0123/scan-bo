const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

// Nombre nuevo (.enc) a proposito: el formato anterior (siat-credentials.json)
// usaba una clave derivada de una ruta predecible (app.getPath('userData')),
// que cualquiera con acceso al archivo podia recalcular en dos lineas de
// codigo. safeStorage usa el llavero real del sistema operativo (gnome-keyring
// / kwallet / DPAPI segun la plataforma), asi que no hay clave que adivinar.
const CREDENTIALS_FILE = 'siat-credentials.enc';

const FAKE_INVOICES = [
  { autorizacion: '12345678901234', factura: 'FAC-001', nit: '1024549028', monto: '150.50' },
  { autorizacion: '98765432109876', factura: 'FAC-002', nit: '1024549028', monto: '320.00' },
  { autorizacion: '45678901234567', factura: 'FAC-003', nit: '1024549028', monto: '89.90' }
];

function getCredentialsPath() {
  return path.join(app.getPath('userData'), CREDENTIALS_FILE);
}

function saveCredentials(credentials) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('El cifrado de credenciales no esta disponible en este equipo (falta un llavero del sistema operativo)');
  }
  const json = JSON.stringify(credentials);
  const encrypted = safeStorage.encryptString(json);
  fs.writeFileSync(getCredentialsPath(), encrypted);
}

function loadCredentials() {
  try {
    const p = getCredentialsPath();
    if (!fs.existsSync(p)) return null;
    if (!safeStorage.isEncryptionAvailable()) {
      console.error('safeStorage no disponible: no se pueden leer las credenciales guardadas');
      return null;
    }
    const encrypted = fs.readFileSync(p);
    const decrypted = safeStorage.decryptString(encrypted);
    return JSON.parse(decrypted);
  } catch (e) {
    console.error('Error al cargar credenciales:', e);
    return null;
  }
}

function hasCredentials() {
  return fs.existsSync(getCredentialsPath());
}

module.exports = { saveCredentials, loadCredentials, hasCredentials, FAKE_INVOICES };
