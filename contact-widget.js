/* Плавающие кнопки связи. RU: Telegram. EN: LINE и WhatsApp. */
(function () {
  try {
    var ru = /^ru/i.test(document.documentElement.lang || '') || /^\/ru(\/|$)/.test(location.pathname);
    var icon = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';
    var items = ru ? [
      { href: 'https://t.me/Metrawen_bot?start=site', label: 'Написать в Telegram', id: 'tg' }
    ] : [
      { href: 'https://line.me/R/ti/p/%40179hddny', label: 'Message us on LINE', id: 'line' },
      { href: 'https://wa.me/66810961901', label: 'Message us on WhatsApp', id: 'wa' }
    ];
    var css = '.mw-contact{position:fixed;right:16px;bottom:16px;z-index:900;display:flex;flex-direction:column;gap:8px;align-items:flex-end}' +
      '.mw-contact a{display:inline-flex;align-items:center;gap:8px;padding:11px 16px;border-radius:999px;background:#C4A165;color:#151411;font:600 14px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none;border:1px solid #C4A165;box-shadow:0 10px 30px -12px rgba(0,0,0,.6);transition:background .25s,transform .25s}' +
      '.mw-contact a:hover,.mw-contact a:focus-visible{background:#D9BC86;border-color:#D9BC86;transform:translateY(-1px)}' +
      '@media (max-width:560px){.mw-contact{right:12px;bottom:12px}.mw-contact a{padding:12px 14px;font-size:13px}}';
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
    var box = document.createElement('div');
    box.className = 'mw-contact';
    items.forEach(function (it) {
      var a = document.createElement('a');
      a.href = it.href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.setAttribute('data-contact', it.id);
      a.innerHTML = icon + '<span></span>';
      a.lastChild.textContent = it.label;
      box.appendChild(a);
    });
    document.body.appendChild(box);
  } catch (e) { /* ничего */ }
})();
