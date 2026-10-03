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
      '@media (min-width:769px){.mw-contact{transition:bottom .3s}body.mw-lift .mw-contact{bottom:100px}body.mw-lift .mwc{bottom:100px;height:min(480px,calc(100vh - 116px))}}' +
      'html,body{overflow-x:clip;overscroll-behavior-x:none}' +
      '@supports not (overflow:clip){html{overflow-x:hidden}}';
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
    var box = document.createElement('div');
    box.className = 'mw-contact';
    items.unshift({ href: '#', label: ru ? 'Чат на сайте' : 'Chat with us', id: 'chat' });
    items.forEach(function (it) {
      var a = document.createElement('a');
      a.href = it.href;
      if (it.id !== 'chat') { a.target = '_blank'; a.rel = 'noopener'; }
      a.setAttribute('data-contact', it.id);
      a.innerHTML = icon + '<span></span>';
      a.lastChild.textContent = it.label;
      if (it.id === 'chat') a.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openChat(); });
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
    (function () {
      var bar = document.getElementById('stickybar');
      if (!bar || !window.MutationObserver) return;
      function sync() { document.body.classList.toggle('mw-lift', bar.classList.contains('visible')); }
      new MutationObserver(sync).observe(bar, { attributes: true, attributeFilter: ['class'] });
      sync();
    })();

    // ---------- Чат на сайте ----------
    var panel = null, list = null, input = null, sendBtn = null, nameIn = null, sid = '', shown = 0, timer = 0, pending = false;
    var L = ru ? {
      title: 'Чат METRAWEN', sub: 'Ответим в течение часа в рабочее время', ph: 'Напишите сообщение…', send: 'Отправить',
      name: 'Ваше имя и контакт (необязательно)', hello: 'Здравствуйте! Чем можем помочь?', err: 'Не удалось отправить. Попробуйте ещё раз или напишите в Telegram.', close: 'Закрыть'
    } : {
      title: 'METRAWEN chat', sub: 'We reply within an hour during business hours', ph: 'Type your message…', send: 'Send',
      name: 'Your name and contact (optional)', hello: 'Hello! How can we help?', err: 'Could not send. Please try again or message us on LINE.', close: 'Close'
    };
    function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
    function newSid() {
      var a = '', c = 'abcdefghijklmnopqrstuvwxyz0123456789';
      try { var r = new Uint8Array(20); crypto.getRandomValues(r); for (var i = 0; i < 20; i++) a += c[r[i] % c.length]; }
      catch (e) { for (var j = 0; j < 20; j++) a += c[Math.floor(Math.random() * c.length)]; }
      return a;
    }
    function bubble(role, text) {
      var d = document.createElement('div');
      d.className = 'mwc-m mwc-' + (role === 'c' ? 'me' : 'them');
      d.textContent = text;
      list.appendChild(d);
      list.scrollTop = list.scrollHeight;
    }
    function api(method, qs, body) {
      return fetch('/api/chat' + (qs || ''), { method: method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._s = r.status; return j; }); });
    }
    function poll() {
      if (!sid || !panel || panel.style.display === 'none') return;
      api('GET', '?sid=' + sid + '&n=' + shown).then(function (j) {
        if (!j || !j.ok) return;
        (j.msgs || []).forEach(function (m) { bubble(m.r, m.t); });
        shown = j.total || shown;
      }).catch(function () {});
    }
    function buildChat() {
      var css2 = '.mwc{position:fixed;right:16px;bottom:16px;z-index:950;width:min(360px,calc(100vw - 24px));height:min(480px,calc(100vh - 32px));display:none;flex-direction:column;background:#151411;color:#f2ede4;border:1px solid #C4A165;border-radius:16px;box-shadow:0 20px 50px -18px rgba(0,0,0,.8);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}' +
        '.mwc-h{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#1d1b17;border-bottom:1px solid rgba(196,161,101,.35)}' +
        '.mwc-h b{display:block;color:#C4A165;font-size:15px}.mwc-h span{font-size:12px;opacity:.7}' +
        '.mwc-x{background:none;border:0;color:#C4A165;font-size:24px;line-height:1;cursor:pointer;padding:4px 8px}' +
        '.mwc-l{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}' +
        '.mwc-m{max-width:85%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}' +
        '.mwc-me{align-self:flex-end;background:#C4A165;color:#151411;border-bottom-right-radius:4px}' +
        '.mwc-them{align-self:flex-start;background:#26231e;border-bottom-left-radius:4px}' +
        '.mwc-f{display:flex;flex-direction:column;gap:6px;padding:10px;border-top:1px solid rgba(196,161,101,.35);background:#1d1b17}' +
        '.mwc-f input[type=text],.mwc-f textarea{width:100%;box-sizing:border-box;background:#151411;color:#f2ede4;border:1px solid #3a352c;border-radius:10px;padding:9px 10px;font:inherit;resize:none}' +
        '.mwc-f input:focus,.mwc-f textarea:focus{outline:none;border-color:#C4A165}' +
        '.mwc-r{display:flex;gap:8px;align-items:flex-end}.mwc-r textarea{flex:1}' +
        '.mwc-s{background:#C4A165;color:#151411;border:0;border-radius:10px;padding:10px 14px;font:600 14px system-ui,sans-serif;cursor:pointer}.mwc-s:disabled{opacity:.5}' +
        '.mwc-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}' +
        '@media (max-width:768px){.mwc{right:8px;bottom:8px;width:calc(100vw - 16px);height:min(75vh,520px)}}';
      var st2 = document.createElement('style'); st2.textContent = css2; document.head.appendChild(st2);
      panel = document.createElement('div'); panel.className = 'mwc'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', L.title);
      var h = document.createElement('div'); h.className = 'mwc-h';
      var ht = document.createElement('div');
      var b1 = document.createElement('b'); b1.textContent = L.title;
      var s1 = document.createElement('span'); s1.textContent = L.sub;
      ht.appendChild(b1); ht.appendChild(s1);
      var x = document.createElement('button'); x.type = 'button'; x.className = 'mwc-x'; x.setAttribute('aria-label', L.close); x.textContent = '×';
      x.addEventListener('click', function () { panel.style.display = 'none'; clearInterval(timer); });
      h.appendChild(ht); h.appendChild(x);
      list = document.createElement('div'); list.className = 'mwc-l';
      var f = document.createElement('div'); f.className = 'mwc-f';
      nameIn = document.createElement('input'); nameIn.type = 'text'; nameIn.maxLength = 120; nameIn.placeholder = L.name; nameIn.setAttribute('autocomplete', 'off');
      var hp = document.createElement('input'); hp.type = 'text'; hp.className = 'mwc-hp'; hp.tabIndex = -1; hp.setAttribute('autocomplete', 'off'); hp.setAttribute('aria-hidden', 'true');
      var row = document.createElement('div'); row.className = 'mwc-r';
      input = document.createElement('textarea'); input.rows = 2; input.maxLength = 1000; input.placeholder = L.ph;
      sendBtn = document.createElement('button'); sendBtn.type = 'button'; sendBtn.className = 'mwc-s'; sendBtn.textContent = L.send;
      row.appendChild(input); row.appendChild(sendBtn);
      f.appendChild(nameIn); f.appendChild(hp); f.appendChild(row);
      panel.appendChild(h); panel.appendChild(list); panel.appendChild(f);
      document.body.appendChild(panel);
      panel.addEventListener('click', function (e) { e.stopPropagation(); });
      function submit() {
        var text = input.value.trim();
        if (!text || pending) return;
        pending = true; sendBtn.disabled = true;
        var nm = nameIn.value.trim();
        api('POST', '', { sid: sid, message: text, name: nm, contact: nm, lang: ru ? 'ru' : 'en', page: location.pathname, website: hp.value }).then(function (j) {
          if (j && j.ok) {
            bubble('c', text); input.value = ''; shown += 1;
            nameIn.style.display = 'none';
            setTimeout(poll, 1500);
          } else { bubble('t', L.err); }
        }).catch(function () { bubble('t', L.err); }).then(function () { pending = false; sendBtn.disabled = false; input.focus(); });
      }
      sendBtn.addEventListener('click', submit);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
    }
    function openChat() {
      close();
      if (!panel) {
        buildChat();
        sid = store('mw_chat_sid') || '';
        if (!/^[a-z0-9]{12,40}$/.test(sid)) { sid = newSid(); store('mw_chat_sid', sid); }
        bubble('t', L.hello);
        shown = 0;
        api('GET', '?sid=' + sid + '&n=0').then(function (j) {
          if (j && j.ok && j.msgs && j.msgs.length) { list.textContent = ''; j.msgs.forEach(function (m) { bubble(m.r, m.t); }); shown = j.total; nameIn.style.display = 'none'; }
        }).catch(function () {});
      }
      panel.style.display = 'flex';
      clearInterval(timer); timer = setInterval(poll, 4000);
      setTimeout(function () { input.focus(); }, 50);
    }
  } catch (e) { /* ничего */ }
})();
