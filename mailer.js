const nodemailer = require('nodemailer');

async function sendCode(to, code) {
  const subject = 'رمز تفعيل حسابك — نظام الحضور الذكي';
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8"><p>جامعة النجاح الوطنية — نظام الحضور الذكي</p><p>رمز التفعيل الخاص بك:</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px">${code}</p><p>الرمز صالح لمدة 10 دقائق. إن لم تطلبه فتجاهل هذه الرسالة.</p></div>`;
  const from = process.env.MAIL_FROM;

  if (process.env.EMAILJS_SERVICE_ID) { // EmailJS عبر HTTPS (يرسل من Gmail المربوط في حسابهم)
    const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        service_id: process.env.EMAILJS_SERVICE_ID, template_id: process.env.EMAILJS_TEMPLATE_ID,
        user_id: process.env.EMAILJS_PUBLIC_KEY, accessToken: process.env.EMAILJS_PRIVATE_KEY,
        template_params: { to_email: to, code, subject },
      }),
    });
    if (!r.ok) throw new Error(`EmailJS ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return;
  }
  if (process.env.MAIL_WEBHOOK_URL) { // Google Apps Script يرسل من Gmail عبر HTTPS (انظر mail-relay.gs)
    const r = await fetch(process.env.MAIL_WEBHOOK_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ secret: process.env.MAIL_WEBHOOK_SECRET, to, subject, html }),
    });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { throw new Error(`Mail relay ${r.status}: ${t.slice(0, 200)}`); }
    if (!j.ok) throw new Error('Mail relay: ' + j.error);
    return;
  }
  if (process.env.BREVO_API_KEY) { // عبر HTTPS (لا يحتاج منافذ SMTP)
    if (!from) throw new Error('MAIL_FROM غير مضبوط');
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { email: from, name: 'نظام الحضور الذكي' }, to: [{ email: to }], subject, htmlContent: html }),
    });
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return;
  }
  if (process.env.SMTP_HOST) {
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await t.sendMail({ from: from || process.env.SMTP_USER, to, subject, html });
    return;
  }
  // بلا مزوّد بريد: يُطبع الرمز في سجلات الخادم (Logs) ولا يراها إلا صاحب حساب الاستضافة
  console.log(`[CODE] رمز التفعيل لـ ${to}: ${code}`);
}
module.exports = { sendCode };
