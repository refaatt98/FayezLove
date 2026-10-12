const lid = location.pathname.split('/')[2];
mountRecords(lid, document.getElementById('tb'), document.getElementById('logs'), () => {});
document.getElementById('h').textContent = 'محاضرة — تفاصيل الحضور';
