const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { sendCode } = require('../mailer');

module.exports = (app, { auth, SECRET, PROD, ALLOWED }) => {
  const DUMMY = bcrypt.hashSync('dummy-password', 12);
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
    message: { error: 'محاولات كثيرة، حاول لاحقًا' } });
  const norm = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
  const hashCode = (email, code) => crypto.createHmac('sha256', SECRET).update(email + ':' + code).digest('hex');
  const signIn = (res, uid) => {
    res.cookie('token', jwt.sign({ uid }, SECRET, { expiresIn: '8h' }),
      { httpOnly: true, sameSite: 'strict', secure: PROD, maxAge: 8 * 3600 * 1000 });
  };

  // 1) طلب رمز تفعيل: لا يُرسل إلا إلى بريد الدكتور المسموح، والرد واحد لأي بريد
  app.post('/api/auth/request-code', limiter, async (req, res) => {
    const email = norm(req.body && req.body.email);
    if (ALLOWED.includes(email)) {
      const prev = db.prepare('SELECT created_at FROM auth_codes WHERE email = ?').get(email);
      if (prev && Date.now() - Date.parse(prev.created_at) < 60000) return res.status(429).json({ error: 'انتظر دقيقة قبل طلب رمز جديد' });
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      db.prepare('INSERT OR REPLACE INTO auth_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)')
        .run(email, hashCode(email, code), new Date(Date.now() + 10 * 60000).toISOString(), new Date().toISOString());
      try { await sendCode(email, code); }
      catch (e) {
        console.error('mail failed:', e.message);
        db.prepare('DELETE FROM auth_codes WHERE email = ?').run(email);
        return res.status(502).json({ error: 'تعذّر إرسال البريد. تحقق من إعدادات البريد في الخادم.' });
      }
    }
    res.json({ ok: true });
  });

  // 2) التفعيل: الرمز + كلمة المرور التي يختارها الدكتور بنفسه (يصلح أيضًا لنسيان كلمة المرور)
  app.post('/api/auth/activate', limiter, (req, res) => {
    const b = req.body || {};
    const email = norm(b.email), code = String(b.code || '').trim(), pw = b.password;
    if (typeof pw !== 'string' || pw.length < 10 || pw.length > 128) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 10 أحرف على الأقل' });
    const row = ALLOWED.includes(email) ? db.prepare('SELECT * FROM auth_codes WHERE email = ?').get(email) : null;
    if (!row || Date.parse(row.expires_at) < Date.now() || row.attempts >= 5)
      return res.status(400).json({ error: 'الرمز غير صالح أو منتهي. اطلب رمزًا جديدًا.' });
    const ok = crypto.timingSafeEqual(Buffer.from(hashCode(email, code)), Buffer.from(row.code_hash));
    if (!ok) { db.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE email = ?').run(email); return res.status(400).json({ error: 'الرمز غير صحيح' }); }
    const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(pw, 12), u.id);
      db.prepare('DELETE FROM auth_codes WHERE email = ?').run(email);
    })();
    signIn(res, u.id);
    res.json({ ok: true });
  });

  // 3) الدخول العادي: البريد + كلمة المرور
  app.post('/api/login', limiter, (req, res) => {
    const b = req.body || {};
    const email = norm(b.email);
    if (typeof b.password !== 'string') return res.status(400).json({ error: 'بيانات غير صالحة' });
    const row = ALLOWED.includes(email) ? db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email) : null;
    if (row && !row.password_hash) return res.status(403).json({ code: 'not_activated', error: 'لم يتم تفعيل الحساب بعد. اضغط "تفعيل الحساب" وسيصلك رمز على بريدك.' });
    const ok = bcrypt.compareSync(b.password, row ? row.password_hash : DUMMY);
    if (!row || !ok) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    signIn(res, row.id);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });
  app.get('/api/me', auth('api'), (req, res) => res.json({ name: req.user.full_name }));
};
