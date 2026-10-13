const $ = (i) => document.getElementById(i);
const say = (t, ok) => { $('msg').textContent = t; $('msg').className = ok ? 'ok' : 'err'; };
async function load() {
  const rows = await (await fetch('/api/accounts')).json();
  const tb = $('tb'); tb.textContent = '';
  for (const a of rows) {
    const tr = tb.insertRow();
    const e = tr.insertCell(); e.textContent = a.email; e.dir = 'ltr'; e.style.textAlign = 'right';
    if (a.primary || a.me) { const s = document.createElement('div'); s.style.cssText = 'font-size:12px;color:#5b5f66'; s.textContent = a.primary ? 'حساب الدكتور' : 'حسابك'; e.appendChild(s); }
    const st = document.createElement('span'); st.className = 'tag ' + (a.activated ? 'on' : 'off'); st.textContent = a.activated ? 'مفعّل' : 'بانتظار التفعيل';
    tr.insertCell().appendChild(st);
    const c = tr.insertCell();
    if (!a.primary && !a.me) {
      const b = document.createElement('button'); b.className = 'del'; b.textContent = 'حذف';
      b.onclick = async () => {
        if (!confirm(`حذف ${a.email}؟ لن يستطيع الدخول بعد الآن.`)) return;
        const r = await fetch('/api/accounts/' + a.id, { method: 'DELETE' });
        const d = await r.json().catch(() => ({}));
        r.ok ? (say('تم حذف الحساب', true), load()) : say(d.error || 'تعذّر الحذف');
      };
      c.appendChild(b);
    }
  }
}
$('add').onsubmit = async (ev) => {
  ev.preventDefault();
  const r = await fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('email').value }) });
  const d = await r.json().catch(() => ({}));
  if (r.ok) { say(`تمت إضافة ${$('email').value.trim()}. يفعّل حسابه من صفحة الدخول.`, true); $('email').value = ''; load(); } else say(d.error || 'تعذّرت الإضافة');
};
load();
