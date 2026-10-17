const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// COUNT و SUM ترجع أرقامًا عادية بدل نصوص
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1700, (v) => parseFloat(v));

// DATABASE_URL: رابط قاعدة Supabase (أو أي PostgreSQL). الجداول داخل مخطط attendance.
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL غير مضبوط. ضع رابط قاعدة Supabase في متغيرات البيئة.');
const local = ['localhost', '127.0.0.1', ''].includes(new URL(url).hostname);
const pool = new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 30000 });
pool.on('error', (e) => console.error('db pool error:', e.message));

// يحوّل ? إلى $1, $2 ...
const pg = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
const meta = (r) => ({ rows: r.rows, lastInsertRowid: r.rows[0] && r.rows[0].id, changes: r.rowCount });
async function q(client, sql, args) {
  return client.query({ text: pg(sql), values: args });
}
// كل اتصال يعمل داخل مخطط attendance (يُضبط مرة واحدة لكل اتصال قبل أي استعلام)
async function connect() {
  const c = await pool.connect();
  if (!c.inSchema) { await c.query('SET search_path TO attendance'); c.inSchema = true; }
  return c;
}
async function one(sql, args) {
  const c = await connect();
  try { return await q(c, sql, args); } finally { c.release(); }
}

const db = {
  all: async (sql, ...args) => (await one(sql, args)).rows,
  get: async (sql, ...args) => (await one(sql, args)).rows[0],
  run: async (sql, ...args) => meta(await one(sql, args)),
  // عدة أوامر كوحدة واحدة (كلها أو لا شيء)
  async batch(stmts) {
    const c = await connect();
    try {
      await c.query('BEGIN');
      const out = [];
      for (const [sql, ...args] of stmts) out.push(meta(await q(c, sql, args)));
      await c.query('COMMIT');
      return out;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { c.release(); }
  },
  // ينشئ الجداول إن لم تكن موجودة (على Supabase تكون مُنشأة مسبقًا فلا يلزم أي صلاحية إضافية)
  async init() {
    const exists = await db.get("SELECT 1 FROM information_schema.tables WHERE table_schema = 'attendance' AND table_name = 'users'");
    if (exists) return;
    const c = await pool.connect();
    try {
      await c.query('CREATE SCHEMA IF NOT EXISTS attendance; SET search_path TO attendance;');
      await c.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    } finally { c.release(); }
  },
  async getSecret() {
    const v = require('crypto').randomBytes(48).toString('hex');
    await db.run("INSERT INTO settings (key, value) VALUES ('jwt_secret', ?) ON CONFLICT (key) DO NOTHING", v);
    return (await db.get("SELECT value FROM settings WHERE key = 'jwt_secret'")).value;
  },
  pool,
};
module.exports = db;
