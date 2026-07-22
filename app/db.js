const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// Guardado como JSON plano en vez de SQLite: para el volumen de datos de esta
// app (facturas escaneadas a mano) alcanza de sobra, y evita depender de un
// modulo nativo (better-sqlite3) que necesita compilador de C++ instalado en
// cada maquina donde se genere el build - eso rompia en Windows sin Visual
// Studio Build Tools.

// NITs fijos de cada empresa: sirven para clasificar automaticamente cada
// factura/tarjeta escaneada segun el NIT que tenga cargado en ese momento.
const EMPRESA_NIT = {
  entel: '1020703023'
};

const DATA_FILE = 'scan-bo-data.json';

let cache = null;

function getFilePath() {
  return path.join(app.getPath('userData'), DATA_FILE);
}

function load() {
  if (cache) return cache;

  const p = getFilePath();
  if (fs.existsSync(p)) {
    try {
      cache = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      cache = { nextId: 1, invoices: [] };
    }
  } else {
    cache = { nextId: 1, invoices: [] };
  }

  if (!Array.isArray(cache.invoices)) cache.invoices = [];
  if (typeof cache.nextId !== 'number') cache.nextId = 1;

  return cache;
}

function persist() {
  fs.writeFileSync(getFilePath(), JSON.stringify(cache, null, 2), 'utf8');
}

function classifyEmpresa(nit) {
  if (nit === EMPRESA_NIT.entel) return 'entel';
  return 'otro';
}

function saveInvoice(fields) {
  const db = load();
  const empresa = classifyEmpresa(fields.nit);
  const existing = db.invoices.find(
    (inv) => inv.autorizacion === fields.autorizacion && inv.factura === fields.factura
  );

  if (existing) {
    existing.nit = fields.nit;
    existing.monto = fields.monto;
    existing.empresa = empresa;
    existing.status = 'Pending';
  } else {
    db.invoices.push({
      id: db.nextId++,
      autorizacion: fields.autorizacion,
      factura: fields.factura,
      nit: fields.nit,
      monto: fields.monto,
      empresa,
      created_at: new Date().toISOString(),
      status: 'Pending'
    });
  }

  persist();
  return empresa;
}

function updateInvoiceFields(id, fields) {
  const db = load();
  const inv = db.invoices.find((i) => i.id === id);
  if (!inv) return;

  inv.nit = fields.nit || null;
  inv.monto = fields.monto || null;
  inv.factura = fields.factura || null;
  inv.autorizacion = fields.autorizacion || null;
  inv.empresa = classifyEmpresa(fields.nit || '');

  persist();
}

function deleteInvoice(id) {
  const db = load();
  db.invoices = db.invoices.filter((i) => i.id !== id);
  persist();
}

function updateInvoiceStatus(autorizacion, factura, status) {
  const db = load();
  const inv = db.invoices.find((i) => i.autorizacion === autorizacion && i.factura === factura);
  if (inv) {
    inv.status = status;
    persist();
  }
}

const STATUS_GROUPS = {
  pending: ['Pending', 'Invalid'],
  registered: ['OK', 'Duplicated']
};

function getInvoicesByEmpresa(empresa, statusGroup = 'pending') {
  const db = load();
  const statuses = STATUS_GROUPS[statusGroup] || STATUS_GROUPS.pending;

  return db.invoices
    .filter((i) => i.empresa === empresa && statuses.includes(i.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

module.exports = {
  saveInvoice,
  updateInvoiceFields,
  deleteInvoice,
  updateInvoiceStatus,
  getInvoicesByEmpresa,
  classifyEmpresa,
  EMPRESA_NIT
};
