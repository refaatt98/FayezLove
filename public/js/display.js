const $ = (i) => document.getElementById(i);
const TTL = 180000;
let exp = 0, off = 0, open = false, busy = false;
async function load() {
  if (busy) return; busy = true;
  try {
    const r = await fetch('/api/lectures/current');
    if (r.status === 401) { location.href = '/login'; return; }
    const d = await r.json();
    open = !!d.open; $('live').hidden = !open; $('idle').hidden = open;
    if (!open) return;
    exp = Date.parse(d.qr.expiresAt); off = Date.parse(d.serverNow) - Date.now();
    if ($('qr').src !== d.qr.image) $('qr').src = d.qr.image; // الصورة تتغير فقط عند صدور رمز جديد
    const c = d.counts || {}; $('c').textContent = `سجّل حضوره حتى الآن: ${(c.present || 0) + (c.late || 0)}`;
  } finally { busy = false; }
}
setInterval(() => {
  if (!open) return;
  const ms = Math.max(0, exp - (Date.now() + off)), s = Math.ceil(ms / 1000);
  $('t').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  $('p').style.width = Math.min(100, ms / TTL * 100) + '%';
  if (ms === 0) load();
}, 250);
setInterval(load, 3000);
$('fs').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
load();
