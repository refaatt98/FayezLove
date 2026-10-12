const $ = (i) => document.getElementById(i);
const views = ['v-login', 'v-req', 'v-ver'];
const show = (id) => { views.forEach((v) => { $(v).hidden = v !== id; }); msg(''); };
const msg = (t, ok) => { $('err').textContent = t; $('err').className = ok ? 'ok' : ''; };
const post = async (url, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, d: await r.json().catch(() => ({})) };
};
document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => show('v-login')));
$('to-act').onclick = () => { $('e2').value = $('e1').value; show('v-req'); };

$('v-login').onsubmit = async (e) => {
  e.preventDefault(); msg('');
  const r = await post('/api/login', { email: $('e1').value, password: $('p1').value });
  if (r.ok) location.href = '/dashboard';
  else { msg(r.d.error || 'حدث خطأ'); if (r.d.code === 'not_activated') { $('e2').value = $('e1').value; show('v-req'); msg(r.d.error); } }
};
$('v-req').onsubmit = async (e) => {
  e.preventDefault(); msg('');
  const r = await post('/api/auth/request-code', { email: $('e2').value });
  if (!r.ok) return msg(r.d.error || 'حدث خطأ');
  show('v-ver'); msg('إن كان البريد صحيحًا فقد أُرسل الرمز. تفقد صندوق الوارد والرسائل غير المرغوبة.', true);
};
$('v-ver').onsubmit = async (e) => {
  e.preventDefault(); msg('');
  if ($('p2').value !== $('p3').value) return msg('كلمتا المرور غير متطابقتين');
  const r = await post('/api/auth/activate', { email: $('e2').value, code: $('c').value, password: $('p2').value });
  if (r.ok) location.href = '/dashboard'; else msg(r.d.error || 'حدث خطأ');
};
