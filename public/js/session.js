// إن انتهت الجلسة (8 ساعات) أثناء فتح أي صفحة من لوحة الدكتور، يُعاد التوجيه لصفحة الدخول بدل أن تبقى الصفحة معطّلة
(() => {
  const orig = window.fetch;
  window.fetch = async (...args) => {
    const r = await orig(...args);
    if (r.status === 401 && String(args[0]).startsWith('/api/')) location.href = '/login';
    return r;
  };
})();
