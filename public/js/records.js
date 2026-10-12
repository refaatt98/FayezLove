const STATUS_AR = { present: 'حاضر', late: 'متأخر', absent: 'غائب', excused: 'غياب بعذر' };
const hm = (iso) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
const cell = (tr, text) => { const td = document.createElement('td'); td.textContent = text; tr.appendChild(td); return td; };

function mountRecords(id, tbody, logBox, onCounts) {
  async function refresh() {
    const r = await fetch(`/api/lectures/${id}/records`); if (!r.ok) return;
    const d = await r.json();
    tbody.replaceChildren();
    for (const x of d.rows) {
      const tr = document.createElement('tr');
      cell(tr, x.name); cell(tr, x.universityId); cell(tr, hm(x.checkedInAt));
      const td = document.createElement('td'), sel = document.createElement('select');
      for (const k in STATUS_AR) { const o = new Option(STATUS_AR[k], k); o.selected = k === x.status; sel.add(o); }
      sel.setAttribute('aria-label', 'تعديل حالة ' + x.name);
      sel.onchange = async () => { await fetch(`/api/records/${x.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: sel.value }) }); };
      td.appendChild(sel); tr.appendChild(td); tbody.appendChild(tr);
    }
    if (onCounts) onCounts(d.counts);
    if (logBox) {
      const logs = await (await fetch(`/api/lectures/${id}/logs`)).json();
      logBox.replaceChildren();
      for (const g of logs) {
        const li = document.createElement('li');
        li.textContent = `${g.student}: ${STATUS_AR[g.oldStatus]} ← ${STATUS_AR[g.newStatus]} · ${g.editor} · ${new Date(g.at).toLocaleString('en-GB')}`;
        logBox.appendChild(li);
      }
    }
  }
  refresh();
  const es = new EventSource(`/api/lectures/${id}/stream`); // تحديث فوري دون Refresh
  es.onmessage = refresh;
  return () => es.close();
}
