/* ================= 启动 ================= */
document.addEventListener('DOMContentLoaded', function () {
  try {
    window.CORE.buildTabs();
  } catch (e) {
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="padding:16px;background:#fdecec;color:#c53030">' +
      '初始化失败：' + (e && e.message ? e.message : e) + '</div>');
    throw e;
  }
});
