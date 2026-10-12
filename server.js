require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const db = require('./db');

(async () => {
await db.init();
const { primary: DOCTOR, allowed: ALLOWED } = await require('./bootstrap')(db);

const PROD = process.env.NODE_ENV === 'production';
let SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) SECRET = await db.getSecret(); // يُولَّد ويُحفظ تلقائيًا في القاعدة

const app = express();
app.disable('x-powered-by');
if (PROD) app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ['https://fonts.gstatic.com'],
  imgSrc: ["'self'", 'data:'],
  frameAncestors: ["'none'"],
} } }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

function auth(kind) {
  return async (req, res, next) => {
    try {
      const p = jwt.verify(req.cookies.token, SECRET);
      const u = await db.get('SELECT id, email FROM users WHERE id = ?', p.uid);
      if (!u || !ALLOWED.includes(u.email)) throw new Error('not allowed'); // فقط البريدان المسموحان
      const t = await db.get('SELECT t.id AS teacher_id, t.full_name FROM teachers t JOIN users pu ON pu.id = t.user_id WHERE pu.email = ?', DOCTOR);
      const user = { id: u.id, email: u.email, teacher_id: t.teacher_id, full_name: t.full_name }; // الجميع يدخلون لوحة الدكتور نفسها
      req.user = user;
    } catch {
      return kind === 'page' ? res.redirect('/login') : res.status(401).json({ error: 'غير مصرح' });
    }
    next();
  };
}

require('./routes/auth')(app, { auth, SECRET, PROD, ALLOWED });
app.get('/healthz', async (req, res) => { await db.get('SELECT 1'); res.send('ok'); }); // لخدمة الإبقاء مستيقظًا (تُبقي القاعدة نشطة أيضًا)
const page = (f) => (req, res) => res.sendFile(path.join(__dirname, f));
app.get('/', page('public/index.html'));
app.get('/login', page('public/login.html'));
app.get('/a/:token', page('public/student.html'));
app.get('/dashboard', auth('page'), page('views/dashboard.html'));
app.get('/lectures', auth('page'), page('views/lectures.html'));
app.get('/lectures/:id', auth('page'), page('views/lecture.html'));
app.get('/stats', auth('page'), page('views/stats.html'));
app.get('/roster', auth('page'), page('views/roster.html'));
app.get('/display', auth('page'), page('views/display.html'));
app.get('/report', auth('page'), page('views/report.html'));
require('./routes/attendance')(app, auth);
require('./routes/records')(app, auth);
require('./routes/reports')(app, auth);
require('./routes/roster')(app, auth);
app.use('/js', express.static(path.join(__dirname, 'public/js')));

// أي خطأ غير متوقع في القاعدة يرجع 500 بدل أن يُسقط الخادم
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'خطأ في الخادم' }); });

app.listen(process.env.PORT || 3000, () => console.log('running'));
})().catch((e) => { console.error('فشل التشغيل:', e); process.exit(1); });
