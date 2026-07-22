const path = require('path');
const Database = require('better-sqlite3');
const { app } = require('electron');

// NITs fijos de cada empresa: sirven para clasificar automaticamente cada
// factura/tarjeta escaneada segun el NIT que tenga cargado en ese momento.
const EMPRESA_NIT = {
  entel: '1020703023'
};

let db = null;

function getDb() {
  if (db) return db;

  const dbPath = path.join(app.getPath('userData'), 'scan-bo.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      autorizacion TEXT NOT NULL,
      factura TEXT NOT NULL,
      nit TEXT,
      monto TEXT,
      empresa TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      UNIQUE(autorizacion, factura)
    )
  `);

  try {
    db.exec(`ALTER TABLE invoices ADD COLUMN status TEXT NOT NULL DEFAULT 'Pending'`);
  } catch (e) {}

  return db;
}

function classifyEmpresa(nit) {
  if (nit === EMPRESA_NIT.entel) return 'entel';
  return 'otro';
}

function saveInvoice(fields) {
  const empresa = classifyEmpresa(fields.nit);
  const stmt = getDb().prepare(`
    INSERT INTO invoices (autorizacion, factura, nit, monto, empresa, created_at, status)
    VALUES (@autorizacion, @factura, @nit, @monto, @empresa, @created_at, 'Pending')
    ON CONFLICT(autorizacion, factura) DO UPDATE SET
      nit = excluded.nit,
      monto = excluded.monto,
      empresa = excluded.empresa,
      status = 'Pending'
  `);
  stmt.run({
    autorizacion: fields.autorizacion,
    factura: fields.factura,
    nit: fields.nit,
    monto: fields.monto,
    empresa,
    created_at: new Date().toISOString()
  });
  return empresa;
}

function updateInvoiceFields(id, fields) {
  const empresa = classifyEmpresa(fields.nit || '');
  getDb().prepare(`
    UPDATE invoices SET nit = ?, monto = ?, factura = ?, autorizacion = ?, empresa = ? WHERE id = ?
  `).run(
    fields.nit || null, fields.monto || null,
    fields.factura || null, fields.autorizacion || null,
    empresa, id
  );
}

function deleteInvoice(id) {
  getDb().prepare('DELETE FROM invoices WHERE id = ?').run(id);
}

function updateInvoiceStatus(autorizacion, factura, status) {
  getDb().prepare(`
    UPDATE invoices SET status = ? WHERE autorizacion = ? AND factura = ?
  `).run(status, autorizacion, factura);
}

const STATUS_GROUPS = {
  pending: ['Pending', 'Invalid'],
  registered: ['OK', 'Duplicated']
};

function getInvoicesByEmpresa(empresa, statusGroup = 'pending') {
  const statuses = STATUS_GROUPS[statusGroup] || STATUS_GROUPS.pending;
  const placeholders = statuses.map(() => '?').join(',');
  return getDb()
    .prepare(`SELECT * FROM invoices WHERE empresa = ? AND status IN (${placeholders}) ORDER BY created_at DESC`)
    .all(empresa, ...statuses);
}

module.exports = { saveInvoice, updateInvoiceStatus, getInvoicesByEmpresa, classifyEmpresa, EMPRESA_NIT };
