const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { sendCode } = require('../mailer');

const SESSION_DAYS = 30;
const NOT_ALLOWED = 'هذا البريد غير مسموح له بالدخول. يمكن إضافته من صفحة "الحسابات" داخل لوحة التحكم.';

module.exports = (app, { auth, SECRET, PROD, DOCTOR }) => {
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
    message: { error: 'محاولات كثيرة، حاول بعد ربع ساعة' } });
  const norm = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
  const hashCode = (email, code) => crypto.createHmac('sha256', SECRET).update(email + ':' + code).digest('hex');
  const account = (email) => db.get('SELECT id, password_hash FROM users WHERE email = ? AND active = 1', email);
  // الجلسة تبقى 30 يومًا. lax حتى تبقى مسجّلًا عند فتح الرابط من واتساب أو إنستغرام
  const signIn = (res, uid) => {
    res.cookie('token', jwt.sign({ uid }, SECRET, { expiresIn: `${SESSION_DAYS}d` }),
      { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: SESSION_DAYS * 86400 * 1000 });
  };

  // 1) طلب رمز تفعيل (أو استعادة كلمة المرور) لحساب مسموح
  app.post('/api/auth/request-code', limiter, async (req, res) => {
    const email = norm(req.body && req.body.email);
    if (!(await account(email))) return res.status(403).json({ code: 'not_allowed', error: NOT_ALLOWED });
    const prev = await db.get('SELECT created_at FROM auth_codes WHERE email = ?', email);
    if (prev && Date.now() - Date.parse(prev.created_at) < 60000) return res.status(429).json({ error: 'انتظر دقيقة قبل طلب رمز جديد. الرمز السابق ما زال صالحًا.' });
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await db.run('INSERT OR REPLACE INTO auth_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)',
      email, hashCode(email, code), new Date(Date.now() + 10 * 60000).toISOString(), new Date().toISOString());
    try { await sendCode(email, code); }
    catch (e) {
      console.error('mail failed:', e.message);
      await db.run('DELETE FROM auth_codes WHERE email = ?', email);
      return res.status(502).json({ error: 'تعذّر إرسال البريد. حاول مرة أخرى بعد قليل.' });
    }
    res.json({ ok: true });
  });

  // 2) التفعيل: الرمز + كلمة المرور الجديدة (يصلح أيضًا لنسيان كلمة المرور)
  app.post('/api/auth/activate', limiter, async (req, res) => {
    const b = req.body || {};
    const email = norm(b.email), code = String(b.code || '').trim(), pw = b.password;
    if (typeof pw !== 'string' || pw.trim().length < 10 || pw.length > 128) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 10 أحرف على الأقل' });
    const u = await account(email);
    if (!u) return res.status(403).json({ code: 'not_allowed', error: NOT_ALLOWED });
    const row = await db.get('SELECT * FROM auth_codes WHERE email = ?', email);
    if (!row || Date.parse(row.expires_at) < Date.now() || row.attempts >= 5)
      return res.status(400).json({ error: 'الرمز غير صالح أو منتهي. اطلب رمزًا جديدًا.' });
    if (!crypto.timingSafeEqual(Buffer.from(hashCode(email, code)), Buffer.from(row.code_hash))) {
      await db.run('UPDATE auth_codes SET attempts = attempts + 1 WHERE email = ?', email);
      return res.status(400).json({ error: 'الرمز غير صحيح' });
    }
    await db.batch([
      ['UPDATE users SET password_hash = ? WHERE id = ?', await bcrypt.hash(pw.trim(), 12), u.id], // تُحفظ في القاعدة على الخادم
      ['DELETE FROM auth_codes WHERE email = ?', email],
    ]);
    signIn(res, u.id);
    res.json({ ok: true });
  });

  // 3) الدخول العادي: البريد + كلمة المرور، برسالة واضحة لكل حالة
  app.post('/api/login', limiter, async (req, res) => {
    const b = req.body || {};
    const email = norm(b.email);
    if (typeof b.password !== 'string' || !b.password) return res.status(400).json({ error: 'اكتب كلمة المرور' });
    const u = await account(email);
    if (!u) return res.status(403).json({ code: 'not_allowed', error: NOT_ALLOWED });
    if (!u.password_hash) return res.status(403).json({ code: 'not_activated', error: 'لم يتم تفعيل الحساب بعد. سيصلك رمز على بريدك لتختار كلمة مرور.' });
    // مسافة زائدة من لوحة مفاتيح الجوال في أول أو آخر كلمة المرور لا تمنع الدخول
    const ok = await bcrypt.compare(b.password, u.password_hash) || await bcrypt.compare(b.password.trim(), u.password_hash);
    if (!ok) return res.status(401).json({ code: 'bad_password', error: 'كلمة المرور غير صحيحة. إن نسيتها اضغط "تفعيل الحساب / نسيت كلمة المرور".' });
    signIn(res, u.id);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => { res.clearCookie('token', { sameSite: 'lax', secure: PROD }); res.json({ ok: true }); });
  app.get('/api/me', auth('api'), (req, res) => res.json({ name: req.user.full_name, email: req.user.email }));

  // إدارة الحسابات المسموحة (تُحفظ في القاعدة وتبقى دائمًا)
  const list = () => db.all("SELECT id, email, password_hash != '' AS activated FROM users WHERE active = 1 ORDER BY id");
  app.get('/api/accounts', auth('api'), async (req, res) => {
    res.json((await list()).map((a) => ({ ...a, activated: !!a.activated, primary: a.email === DOCTOR, me: a.id === req.user.id })));
  });
  app.post('/api/accounts', auth('api'), async (req, res) => {
    const email = norm(req.body && req.body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
    await db.batch([
      ["INSERT OR IGNORE INTO users (username, email, password_hash) VALUES (?, ?, '')", email, email],
      ['UPDATE users SET active = 1 WHERE email = ?', email],
    ]);
    res.json({ ok: true });
  });
  app.delete('/api/accounts/:id', auth('api'), async (req, res) => {
    const a = await db.get('SELECT id, email FROM users WHERE id = ? AND active = 1', req.params.id);
    if (!a) return res.status(404).json({ error: 'الحساب غير موجود' });
    if (a.email === DOCTOR) return res.status(400).json({ error: 'لا يمكن حذف حساب الدكتور' });
    if (a.id === req.user.id) return res.status(400).json({ error: 'لا يمكنك حذف حسابك وأنت داخل به' });
    // يُعطَّل ويُمسح سرّه؛ إن أُضيف لاحقًا يفعّل نفسه من جديد
    await db.run("UPDATE users SET active = 0, password_hash = '' WHERE id = ?", a.id);
    res.json({ ok: true });
  });
};
