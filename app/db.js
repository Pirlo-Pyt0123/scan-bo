const path = require('path');
const Database = require('better-sqlite3');
const { app } = require('electron');

// NITs fijos de cada empresa: sirven para clasificar automaticamente cada
// factura/tarjeta escaneada segun el NIT que tenga cargado en ese momento.
const EMPRESA_NIT = {
  entel: '1020703023',
  tigo: '1020255020'
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
      UNIQUE(autorizacion, factura)
    )
  `);

  return db;
}

function classifyEmpresa(nit) {
  if (nit === EMPRESA_NIT.entel) return 'entel';
  if (nit === EMPRESA_NIT.tigo) return 'tigo';
  return 'otro';
}

function saveInvoice(fields) {
  const empresa = classifyEmpresa(fields.nit);
  const stmt = getDb().prepare(`
    INSERT INTO invoices (autorizacion, factura, nit, monto, empresa, created_at)
    VALUES (@autorizacion, @factura, @nit, @monto, @empresa, @created_at)
    ON CONFLICT(autorizacion, factura) DO UPDATE SET
      nit = excluded.nit,
      monto = excluded.monto,
      empresa = excluded.empresa
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

function getInvoicesByEmpresa(empresa) {
  return getDb()
    .prepare('SELECT * FROM invoices WHERE empresa = ? ORDER BY created_at DESC')
    .all(empresa);
}

module.exports = { saveInvoice, getInvoicesByEmpresa, classifyEmpresa, EMPRESA_NIT };
