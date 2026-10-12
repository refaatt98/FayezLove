# النشر على Render

## 1) الخدمة
Web Service من مستودع GitHub — Build: `npm install` — Start: `npm start` — خطة مدفوعة (لازمة للقرص).
أضف **Disk** بمسار `/data`.

## 2) متغيرات البيئة
- `NODE_ENV=production`
- `NODE_VERSION=20`
- `DB_PATH=/data/attendance.db`
- `BASE_URL=https://اسم-خدمتك.onrender.com`
- `DOCTOR_EMAIL=abuhijleh@najah.edu`
- `EXTRA_ALLOWED_EMAILS=fayezghaith123@gmail.com` (بريد إضافي مسموح، يدخل لوحة الدكتور نفسها)
- متغيرات البريد (القسم التالي)
`JWT_SECRET` اختياري: إن لم تضعه يُولَّد سر آمن تلقائيًا ويُحفظ في القاعدة.

## 3) إعداد البريد (مطلوب ليصل رمز التفعيل)
**الخيار أ — Brevo (عبر HTTPS):**
1. أنشئ حسابًا في brevo.com وأضف بريدًا مرسِلًا وفعّله (Senders).
2. أنشئ API Key من الإعدادات.
3. على Render: `BREVO_API_KEY=المفتاح` و`MAIL_FROM=بريد-المرسل-المفعّل`

**الخيار ب — SMTP (مثل Gmail):**
فعّل التحقق بخطوتين في حساب Gmail وأنشئ App Password، ثم:
`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=بريدك`, `SMTP_PASS=كلمة-التطبيق`, `MAIL_FROM=بريدك`
(بعض الاستضافات تحجب SMTP؛ إن فشل الإرسال استعمل Brevo.)

## 4) أول دخول للدكتور
كل صاحب بريد من البريدين المسموحين: يفتح `/login` ← "تفعيل الحساب" ← يكتب بريده ← يصله رمز ← يختار كلمة مرور بنفسه. أي بريد آخر لا يُقبل.

## 5) قبل أول محاضرة
ارفع قائمة الطلاب، وجرّب محاضرة تجريبية بعدة هواتف، وخذ نسخة احتياطية بعد كل محاضرة.
