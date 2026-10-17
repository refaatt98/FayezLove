# النشر مجانًا (Render + Supabase)

الموقع يعمل على **Render** (خطة مجانية) والبيانات محفوظة في **Supabase** (PostgreSQL سحابية مجانية)، فلا تضيع عند إعادة تشغيل الخادم.

## 1) قاعدة البيانات — Supabase
- الجداول داخل مخطط خاص اسمه `attendance` (لا تصل إليه واجهة Supabase العامة)، والتطبيق يتصل بمستخدم قاعدة مخصص `attendance_app` صلاحياته على هذا المخطط فقط.
- مشروع جديد: أنشئ المستخدم ثم نفّذ `supabase-setup.sql` (التعليمات في أول الملف). يُنشئ المخطط والجداول والصلاحيات.
- رابط الاتصال (Session pooler):
  `postgresql://attendance_app.<PROJECT_REF>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres`

## 2) الموقع — Render
1. سجّل في https://render.com بحساب GitHub.
2. New ← **Blueprint** ← اختر مستودع `FayezLove` (يقرأ ملف `render.yaml` تلقائيًا وينشئ خدمة مجانية).
3. سيطلب قيم المتغيرات السرّية:
   - `DATABASE_URL` من الخطوة 1
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
- بريدان فقط يستطيعان التسجيل والدخول: `abuhijleh@najah.edu` (الدكتور) و`fayezghaith123@gmail.com`. القائمة ثابتة في `bootstrap.js`.
- أول مرة: صفحة الدخول ← "تفعيل الحساب" ← يصل رمز على البريد ← يختار صاحب الحساب كلمة مروره.
- بعدها: الإيميل وكلمة المرور فقط، من أي جهاز ومتى شئت. الجلسة تبقى 30 يومًا على الجهاز، وبعدها يُطلب الإيميل وكلمة المرور (بلا رمز).
- كلمات المرور محفوظة مشفّرة في Supabase ولا تُحذف.

## 6) قبل أول محاضرة
ارفع قائمة الطلاب، وجرّب محاضرة تجريبية بعدة هواتف. النسخ الاحتياطي: من لوحة Turso أو عبر تصدير Excel من الموقع.
