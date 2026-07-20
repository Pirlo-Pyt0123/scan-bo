const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CREDENTIALS_FILE = 'siat-credentials.json';

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
  const json = JSON.stringify(credentials);
  const encrypted = encrypt(json);
  fs.writeFileSync(getCredentialsPath(), encrypted, 'utf8');
}

function loadCredentials() {
  const p = getCredentialsPath();
  if (!fs.existsSync(p)) return null;
  const encrypted = fs.readFileSync(p, 'utf8');
  return JSON.parse(decrypt(encrypted));
}

function hasCredentials() {
  return fs.existsSync(getCredentialsPath());
}

async function uploadToSIAT(invoiceData, progressCallback) {
  const credentials = loadCredentials();
  if (!credentials) throw new Error('No hay credenciales guardadas');

  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    locale: 'es-BO'
  });
  const page = await context.newPage();

  try {
    progressCallback({ step: 'login', message: 'Iniciando sesión en SIAT...' });

    await page.goto('https://siat.impuestos.gob.bo/', { waitUntil: 'networkidle', timeout: 30000 });

    await page.waitForTimeout(3000);

    const loginForm = page.locator('app-root');
    await loginForm.waitFor({ state: 'visible', timeout: 20000 });

    const nitInput = page.locator('input[type="text"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await nitInput.fill(credentials.identity);
    await page.waitForTimeout(500);

    await passwordInput.fill(credentials.password);
    await page.waitForTimeout(500);

    const submitBtn = page.getByRole('button').filter({ hasText: /ingresar|entrar|acceder|iniciar|continuar/i });
    if (await submitBtn.count() > 0) {
      await submitBtn.first().click();
    } else {
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(5000);
    await page.waitForLoadState('networkidle');

    progressCallback({ step: 'navigate', message: 'Navegando a Aplicaciones...' });

    const aplicacionesLink = page.getByRole('link').filter({ hasText: /aplicaciones/i });
    if (await aplicacionesLink.count() > 0) {
      await aplicacionesLink.first().click();
      await page.waitForTimeout(3000);
    } else {
      const menuBtn = page.getByRole('button').filter({ hasText: /menú|menu|aplicaciones/i });
      if (await menuBtn.count() > 0) {
        await menuBtn.first().click();
        await page.waitForTimeout(2000);
      }
    }

    const sistemaFactLink = page.getByRole('link').filter({ hasText: /sistema de facturación|sistema facturacion|facturación/i });
    if (await sistemaFactLink.count() > 0) {
      await sistemaFactLink.first().click();
      await page.waitForTimeout(3000);
    }

    progressCallback({ step: 'navigate', message: 'Buscando Registro de Compras y Ventas...' });

    const comprasLink = page.getByRole('link').filter({ hasText: /registro de compra|compras y ventas|registro compras/i });
    if (await comprasLink.count() > 0) {
      await comprasLink.first().click();
      await page.waitForTimeout(3000);
    }

    await page.waitForLoadState('networkidle');

    progressCallback({ step: 'buscar', message: 'Buscando registros existentes...' });

    const buscarBtn = page.getByRole('button').filter({ hasText: /buscar/i });
    if (await buscarBtn.count() > 0) {
      await buscarBtn.first().click();
      await page.waitForTimeout(2000);
    }

    progressCallback({ step: 'form', message: 'Abriendo nuevo registro...' });

    const nuevoBtn = page.getByRole('button').filter({ hasText: /nuevo registro|nuevo|adicionar/i });
    if (await nuevoBtn.count() > 0) {
      await nuevoBtn.first().click();
      await page.waitForTimeout(2000);
    }

    await page.waitForLoadState('networkidle');

    progressCallback({ step: 'filling', message: 'Llenando datos de la factura...' });

    const nitField = page.locator('#formPrincipal\\:tabRegistroCompras\\:cmpComprasDT\\:cfacturaNueva\\:txtNitProveedor');
    if (await nitField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nitField.fill(invoiceData.nit || '');
    }

    const codAuthField = page.locator('#formPrincipal\\:tabRegistroCompras\\:cmpComprasDT\\:cfacturaNueva\\:txtCodAutorizacion');
    if (await codAuthField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await codAuthField.fill(invoiceData.autorizacion);
    }

    const nroFacturaField = page.locator('#formPrincipal\\:tabRegistroCompras\\:cmpComprasDT\\:cfacturaNueva\\:txtNroFactura');
    if (await nroFacturaField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nroFacturaField.fill(invoiceData.factura);
    }

    const nroDuiField = page.locator('#formPrincipal\\:tabRegistroCompras\\:cmpComprasDT\\:cfacturaNueva\\:txtNroDui');
    if (await nroDuiField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nroDuiField.fill('0');
    }

    const today = new Date();
    const day = today.getDate().toString().padStart(2, '0');
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const year = today.getFullYear().toString();

    const fechaField = page.locator('#formPrincipal\\:tabRegistroCompras\\:cmpComprasDT\\:cfacturaNueva\\:txtFechaFactura');
    if (await fechaField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fechaField.fill(day);
    }

    const montoInput = page.locator('#formPrincipal\\:tabRegistroCompras\\:cmpComprasDT\\:cfacturaNueva\\:txtMontoTotal_input');
    if (await montoInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await montoInput.fill(invoiceData.monto || '0');
    }

    const codControlField = page.locator('#formPrincipal\\:tabRegistroCompras\\:cmpComprasDT\\:cfacturaNueva\\:txtCodControl');
    if (await codControlField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await codControlField.fill('0-0-0');
    }

    progressCallback({ step: 'submitting', message: 'Adicionando factura...' });

    await page.waitForTimeout(1000);

    const adicionarBtn = page.locator('#formPrincipal\\:tabRegistroCompras\\:cmpComprasDT\\:cfacturaNueva\\:btnVerificarCompra');
    if (await adicionarBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await adicionarBtn.click();
    } else {
      const addBtn = page.getByRole('button').filter({ hasText: /adicionar|agregar|guardar/i });
      if (await addBtn.count() > 0) {
        await addBtn.first().click();
      }
    }

    await page.waitForTimeout(3000);

    progressCallback({ step: 'done', message: 'Factura registrada correctamente' });

    await browser.close();
    return { success: true };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}

module.exports = { saveCredentials, loadCredentials, hasCredentials, uploadToSIAT };
