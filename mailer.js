const nodemailer = require('nodemailer');

async function sendCode(to, code) {
  const subject = 'رمز تفعيل حسابك — نظام الحضور الذكي';
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8"><p>جامعة النجاح الوطنية — نظام الحضور الذكي</p><p>رمز التفعيل الخاص بك:</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px">${code}</p><p>الرمز صالح لمدة 10 دقائق. إن لم تطلبه فتجاهل هذه الرسالة.</p></div>`;
  const from = process.env.MAIL_FROM;

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
  if (process.env.NODE_ENV !== 'production') { console.log(`[DEV] رمز التفعيل لـ ${to}: ${code}`); return; }
  throw new Error('لم يُضبط أي مزوّد بريد (BREVO_API_KEY أو SMTP_HOST)');
}
module.exports = { sendCode };
