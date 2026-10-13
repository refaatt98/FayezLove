# النشر مجانًا (Render + Turso)

الموقع يعمل على **Render** (خطة مجانية) والبيانات محفوظة في **Turso** (قاعدة SQLite سحابية مجانية)، فلا تضيع عند إعادة تشغيل الخادم. لا يلزم أي بطاقة بنكية.

## 1) قاعدة البيانات — Turso
1. سجّل في https://turso.tech (بحساب GitHub).
2. أنشئ قاعدة جديدة (Create Database) واختر أقرب منطقة (مثل Frankfurt).
3. من صفحة القاعدة انسخ:
   - **URL** ويبدأ بـ `libsql://...` ← هذا `TURSO_DATABASE_URL`
   - أنشئ **Token** (Generate Token، بلا تاريخ انتهاء) ← هذا `TURSO_AUTH_TOKEN`

الجداول تُنشأ تلقائيًا عند أول تشغيل.

## 2) الموقع — Render
1. سجّل في https://render.com بحساب GitHub.
2. New ← **Blueprint** ← اختر مستودع `FayezLove` (يقرأ ملف `render.yaml` تلقائيًا وينشئ خدمة مجانية).
3. سيطلب قيم المتغيرات السرّية:
   - `TURSO_DATABASE_URL` و`TURSO_AUTH_TOKEN` من الخطوة 1
   - مفاتيح EmailJS (القسم 3)
4. رابط QR يُبنى تلقائيًا من عنوان الموقع الذي يفتح منه الدكتور الشاشة، فلا يلزم ضبطه.

## 3) البريد — EmailJS (مجاني، 200 رسالة شهريًا، يرسل من Gmail)
1. سجّل في https://www.emailjs.com
2. **Email Services ← Add New Service ← Gmail ← Connect Account** واختر حساب Gmail المرسِل ← Create Service. انسخ **Service ID**.
3. **Email Templates ← Create New Template**:
   - Subject: `{{subject}}`
   - Content: `رمز التفعيل الخاص بك: {{code}} — صالح لمدة 10 دقائق.`
   - في الجهة اليمنى: To Email = `{{to_email}}`
   احفظ وانسخ **Template ID**.
4. **Account ← General**: انسخ **Public Key** و**Private Key**.
5. **Account ← Security**: فعّل **Allow EmailJS API for non-browser applications** واحفظ (ضروري).
6. على Render ← Environment أضف: `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY` ثم Save, rebuild, and deploy.

### بديل: Gmail عبر Google Apps Script (100 رسالة يوميًا)
الرموز تُرسل من حساب Gmail الخاص بك عبر HTTPS (Render المجاني يحجب SMTP).
1. افتح https://script.google.com وأنت داخل على حساب Gmail المرسِل ← **New project**.
2. احذف المحتوى والصق محتوى الملف `mail-relay.gs` من المستودع.
3. غيّر قيمة `SECRET` لكلمة سر طويلة من اختيارك، واحفظ (Ctrl+S).
4. **Deploy ← New deployment** ← النوع (⚙️) **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   ثم Deploy ← وافق على الصلاحيات (Advanced ← Go to ... (unsafe) ← Allow، لأنه سكربتك أنت).
5. انسخ **Web app URL** (ينتهي بـ `/exec`).
6. على Render ← Environment أضف:
   - `MAIL_WEBHOOK_URL` = الرابط
   - `MAIL_WEBHOOK_SECRET` = نفس كلمة السر من الخطوة 3
   ثم Save, rebuild, and deploy.

إن عدّلت السكربت لاحقًا: Deploy ← Manage deployments ← ✏️ ← Version: New version.

**بدائل:** Brevo (`BREVO_API_KEY` + `MAIL_FROM`)، أو بلا بريد: يُطبع الرمز في سجلات Render (ابحث عن `[CODE]`).

## 4) إبقاء الموقع مستيقظًا (مهم)
الخطة المجانية في Render تُنيم الموقع بعد 15 دقيقة بلا زيارات، وأول فتح بعدها يتأخر قرابة دقيقة.
لمنع ذلك:
1. سجّل في https://cron-job.org (مجاني).
2. أنشئ Cron Job على الرابط `https://رابط-موقعك/healthz` كل **10 دقائق**.

ساعات Render المجانية (750 ساعة شهريًا) تكفي لتشغيل خدمة واحدة طوال الشهر.

## 5) الحسابات والدخول
- الحسابات المسموحة محفوظة في قاعدة البيانات، وتُدار من صفحة **الحسابات** داخل لوحة التحكم (إضافة / حذف).
- `DOCTOR_EMAIL` و`EXTRA_ALLOWED_EMAILS` تُستخدمان مرة واحدة فقط لإنشاء الحسابات الأولى؛ تعديلهما لاحقًا لا يحذف أي حساب.
- أول مرة: صفحة الدخول ← "تفعيل الحساب" ← يصل رمز على البريد ← يختار صاحب الحساب كلمة مروره. بعدها يدخل بالإيميل وكلمة المرور من أي جهاز.
- الجلسة تبقى 30 يومًا على الجهاز. نسيت كلمة المرور؟ "تفعيل الحساب / نسيت كلمة المرور" من جديد.

## 6) قبل أول محاضرة
ارفع قائمة الطلاب، وجرّب محاضرة تجريبية بعدة هواتف. النسخ الاحتياطي: من لوحة Turso أو عبر تصدير Excel من الموقع.
