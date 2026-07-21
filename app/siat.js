const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CREDENTIALS_FILE = 'siat-credentials.json';

const FAKE_INVOICES = [
  { autorizacion: '12345678901234', factura: 'FAC-001', nit: '1024549028', monto: '150.50' },
  { autorizacion: '98765432109876', factura: 'FAC-002', nit: '1024549028', monto: '320.00' },
  { autorizacion: '45678901234567', factura: 'FAC-003', nit: '1024549028', monto: '89.90' }
];

function getCredentialsPath() {
  return path.join(app.getPath('userData'), CREDENTIALS_FILE);
}

function getKey() {
  return crypto.createHash('sha256').update(app.getPath('userData')).digest();
}

function encrypt(text) {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted + ':' + cipher.getAuthTag().toString('hex');
}

function decrypt(encryptedText) {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const authTag = Buffer.from(parts[2], 'hex');
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function saveCredentials(credentials) {
  try {
    const json = JSON.stringify(credentials);
    const encrypted = encrypt(json);
    fs.writeFileSync(getCredentialsPath(), encrypted, 'utf8');
    console.log('Credenciales guardadas en:', getCredentialsPath());
  } catch (e) {
    console.error('Error al guardar credenciales:', e);
  }
}

function loadCredentials() {
  try {
    const p = getCredentialsPath();
    if (!fs.existsSync(p)) return null;
    const encrypted = fs.readFileSync(p, 'utf8');
    const decrypted = decrypt(encrypted);
    console.log('Credenciales cargadas desde:', p);
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
