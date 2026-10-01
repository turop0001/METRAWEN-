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
      '.mw-toggle{display:none}' +
      '@media (max-width:768px){' +
        '.mw-contact{right:12px;bottom:calc(74px + env(safe-area-inset-bottom,0px));gap:6px}' +
        '.mw-contact a,.mw-toggle{opacity:.5;transition:opacity .25s,background .25s}' +
        '.mw-contact a:active,.mw-contact.open a,.mw-contact.open .mw-toggle{opacity:1}' +
        '.mw-contact a{padding:10px 13px;font-size:13px;box-shadow:0 6px 18px -10px rgba(0,0,0,.6)}' +
                '.mw-contact.multi a{display:none}.mw-contact.multi.open a{display:inline-flex}' +
        '.mw-toggle{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;padding:0;border-radius:50%;background:#C4A165;color:#151411;border:1px solid #C4A165;cursor:pointer;box-shadow:0 6px 18px -10px rgba(0,0,0,.6)}' +
      '}' +
      'html,body{overflow-x:clip;overscroll-behavior-x:none}' +
      '@supports not (overflow:clip){html{overflow-x:hidden}}';
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
    box.className += ' multi';
    var t = document.createElement('button');
    t.type = 'button'; t.className = 'mw-toggle';
    t.setAttribute('aria-label', ru ? 'Написать нам' : 'Contact us'); t.setAttribute('aria-expanded', 'false');
    t.innerHTML = icon;
    var tOpen = 0, y0 = window.pageYOffset;
    function close() { box.classList.remove('open'); t.setAttribute('aria-expanded', 'false'); }
    t.addEventListener('click', function (e) {
      e.stopPropagation();
      var o = box.classList.toggle('open'); tOpen = Date.now(); y0 = window.pageYOffset;
      t.setAttribute('aria-expanded', o ? 'true' : 'false');
    });
    document.addEventListener('click', close);
    window.addEventListener('scroll', function () {
      if (box.classList.contains('open') && Date.now() - tOpen > 500 && Math.abs(window.pageYOffset - y0) > 8) close();
      y0 = window.pageYOffset;
    }, { passive: true });
    box.appendChild(t);
    document.body.appendChild(box);
  } catch (e) { /* ничего */ }
})();
