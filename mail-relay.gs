// يُلصق في Google Apps Script وينشر كـ Web App، فيرسل الإيميلات من حساب Gmail صاحب السكربت.
// غيّر SECRET لكلمة سر طويلة، وضع نفسها في MAIL_WEBHOOK_SECRET على Render.
const SECRET = 'غيّر-هذه-الكلمة';

function doPost(e) {
  const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.secret !== SECRET) return out({ ok: false, error: 'bad secret' });
    MailApp.sendEmail({ to: b.to, subject: b.subject, htmlBody: b.html, name: 'نظام الحضور الذكي' });
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}
