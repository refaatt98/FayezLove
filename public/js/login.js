const $ = (i) => document.getElementById(i);
const views = ['v-login', 'v-req', 'v-ver'];
const show = (id) => { views.forEach((v) => { $(v).hidden = v !== id; }); msg(''); };
const msg = (t, ok) => { $('err').textContent = t; $('err').className = ok ? 'ok' : ''; };
const post = async (url, body) => {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: r.ok, status: r.status, d: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, status: 0, d: { error: 'تعذّر الاتصال بالخادم. تأكد من الإنترنت وحاول مرة أخرى.' } };
  }
};
// يعطّل الزر ويُظهر "جارٍ..." حتى يرد الخادم (قد يأخذ ثوانٍ إن كان الموقع نائمًا)
async function busy(form, label, fn) {
  const btn = form.querySelector('button.p'), text = btn.textContent;
  if (btn.disabled) return;
  btn.disabled = true; btn.textContent = label; msg('');
  try { await fn(); } finally { btn.disabled = false; btn.textContent = text; }
}
const toCode = (email, note) => { $('e2').value = email; show('v-ver'); if (note) msg(note, true); $('c').focus(); };

document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => show('v-login')));
$('to-act').onclick = () => { $('e2').value = $('e1').value; show('v-req'); };
$('have-code').onclick = () => {
  if (!$('e2').value.trim()) { msg('اكتب بريدك الإلكتروني أولًا'); $('e2').focus(); return; }
  toCode($('e2').value);
};

$('v-login').onsubmit = (e) => { e.preventDefault(); busy($('v-login'), 'جارٍ تسجيل الدخول...', async () => {
  const r = await post('/api/login', { email: $('e1').value, password: $('p1').value });
  if (r.ok) { location.href = '/dashboard'; return; }
  if (r.d.code === 'not_activated') { $('e2').value = $('e1').value; show('v-req'); }
  msg(r.d.error || 'حدث خطأ، حاول مرة أخرى');
}); };

$('v-req').onsubmit = (e) => { e.preventDefault(); busy($('v-req'), 'جارٍ إرسال الرمز...', async () => {
  const r = await post('/api/auth/request-code', { email: $('e2').value });
  if (r.ok) return toCode($('e2').value, 'تم إرسال الرمز إلى بريدك. تفقد صندوق الوارد والرسائل غير المرغوبة.');
  if (r.status === 429) return toCode($('e2').value, r.d.error); // الرمز السابق ما زال صالحًا
  msg(r.d.error || 'حدث خطأ، حاول مرة أخرى');
}); };

$('v-ver').onsubmit = (e) => { e.preventDefault();
  if ($('p2').value !== $('p3').value) return msg('كلمتا المرور غير متطابقتين');
  busy($('v-ver'), 'جارٍ التفعيل...', async () => {
    const r = await post('/api/auth/activate', { email: $('e2').value, code: $('c').value.trim(), password: $('p2').value });
    if (r.ok) { location.href = '/dashboard'; return; }
    msg(r.d.error || 'حدث خطأ، حاول مرة أخرى');
  });
};
