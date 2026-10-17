const crypto = require('crypto');
const pass = require('../password');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { sendCode } = require('../mailer');

const SESSION_DAYS = 365; // سنة كاملة: لا يُطلب الدخول من جديد على نفس الجهاز
const NOT_ALLOWED = 'هذا البريد غير مسموح له بالتسجيل أو الدخول إلى هذا النظام.';

module.exports = (app, { auth, SECRET, PROD, DOCTOR }) => {
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.AUTH_RATE_LIMIT) || 30, standardHeaders: true, legacyHeaders: false,
    message: { error: 'محاولات كثيرة، حاول بعد ربع ساعة' } });
  const norm = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
  const hashCode = (email, code) => crypto.createHmac('sha256', SECRET).update(email + ':' + code).digest('hex');
  const account = (email) => db.get('SELECT id, password_hash FROM users WHERE email = ? AND active = 1', email);
  // الجلسة تبقى سنة. lax حتى تبقى مسجّلًا عند فتح الرابط من واتساب أو إنستغرام
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
    await db.run(`INSERT INTO auth_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)
      ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0, created_at = EXCLUDED.created_at`,
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
    const email = norm(b.email), pw = b.password;
    const code = String(b.code || '').replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x6f0).replace(/\D/g, '');
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
      ['UPDATE users SET password_hash = ? WHERE id = ?', await pass.hash(pw.trim()), u.id], // تُحفظ في القاعدة على الخادم
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
    const pw = b.password, trimmed = pw.trim();
    const ok = await pass.verify(pw, u.password_hash) || (trimmed !== pw && await pass.verify(trimmed, u.password_hash));
    if (!ok) return res.status(401).json({ code: 'bad_password', error: 'كلمة المرور غير صحيحة. إن نسيتها اضغط "تفعيل الحساب / نسيت كلمة المرور".' });
    // كلمات المرور القديمة (bcrypt) تُحوَّل للتشفير الأسرع بعد أول دخول ناجح
    if (pass.isLegacy(u.password_hash)) await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await pass.hash(trimmed || pw), u.id);
    signIn(res, u.id);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => { res.clearCookie('token', { sameSite: 'lax', secure: PROD }); res.json({ ok: true }); });
  app.get('/api/me', auth('api'), (req, res) => res.json({ name: req.user.full_name, email: req.user.email }));

};
