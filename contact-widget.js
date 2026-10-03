/* Круглая кнопка связи с выпадающим списком каналов и встроенный чат с менеджером. */
(function () {
  try {
    var ru = /^ru/i.test(document.documentElement.lang || '') || /^\/ru(\/|$)/.test(location.pathname);
    var ic = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';
    var T = ru ? {
      toggle: 'Напишите нам', aria: 'Написать нам', chatItem: 'Чат на сайте',
      title: 'METRAWEN', online: 'онлайн', role: 'AI-менеджер METRAWEN', persona: 'Елена',
      hello: 'Здравствуйте! Напишите ваш вопрос, мы подключим свободного менеджера.',
      searching: 'Ищем свободного менеджера', joined: 'Елена подключилась к чату',
      ph: 'Напишите сообщение…', send: 'Отправить', name: 'Ваше имя и контакт (необязательно)',
      err: 'Не удалось отправить. Попробуйте ещё раз или напишите в Telegram.', close: 'Закрыть'
    } : {
      toggle: 'Contact us', aria: 'Contact us', chatItem: 'Chat with us',
      title: 'METRAWEN', online: 'online', role: 'METRAWEN AI manager', persona: 'Nicole',
      hello: "Hi! Send your question and we'll connect an available manager.",
      searching: 'Finding an available manager', joined: 'Nicole joined the chat',
      ph: 'Type your message…', send: 'Send', name: 'Your name and contact (optional)',
      err: 'Could not send. Please try again or message us on LINE.', close: 'Close'
    };
    var items = ru ? [
      { href: 'https://t.me/Metrawen_bot?start=site', label: 'Написать в Telegram', id: 'tg' }
    ] : [
      { href: 'https://line.me/R/ti/p/%40179hddny', label: 'Message us on LINE', id: 'line' },
      { href: 'https://wa.me/66985955242', label: 'Message us on WhatsApp', id: 'wa' }
    ];
    items.unshift({ href: '#', label: T.chatItem, id: 'chat' });

    var css = '.mw-contact{position:fixed;right:16px;bottom:16px;z-index:900;display:flex;flex-direction:column;gap:8px;align-items:flex-end;transition:bottom .3s}' +
      '.mw-list{display:none;flex-direction:column;gap:8px;align-items:flex-end}' +
      '.mw-contact.open .mw-list{display:flex}' +
      '.mw-list a{display:inline-flex;align-items:center;gap:8px;padding:11px 16px;border-radius:999px;background:#C4A165;color:#151411;font:600 14px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none;border:1px solid #C4A165;box-shadow:0 10px 30px -12px rgba(0,0,0,.6);transition:background .25s,transform .25s}' +
      '.mw-list a:hover,.mw-list a:focus-visible{background:#D9BC86;border-color:#D9BC86;transform:translateY(-1px)}' +
      '.mw-toggle{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;width:68px;height:68px;padding:0;border-radius:50%;background:#C4A165;color:#151411;border:1px solid #D9BC86;cursor:pointer;box-shadow:0 10px 30px -12px rgba(0,0,0,.7);font:700 10px/1.1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:background .25s,transform .25s}' +
      '@media (min-width:769px){.mw-toggle{opacity:.78}.mw-toggle:hover,.mw-contact.open .mw-toggle{opacity:1}}' +
      '.mw-toggle:hover{background:#D9BC86}' +
      '.mw-lbl{display:block;max-width:56px}' +
      '.mw-cl{display:none;font-size:30px;line-height:1;font-weight:400}' +
      '.mw-contact.open .mw-toggle .mw-lbl,.mw-contact.open .mw-toggle svg{display:none}' +
      '.mw-contact.open .mw-toggle .mw-cl{display:block}' +
      'body.mw-chat-open .mw-contact{display:none}' +
      '@media (min-width:769px){body.mw-lift .mw-contact{bottom:100px}body.mw-lift .mwc{bottom:100px;height:min(500px,calc(100vh - 116px))}}' +
      '@media (max-width:768px){.mw-contact{right:12px;bottom:calc(74px + env(safe-area-inset-bottom,0px))}.mw-toggle{width:44px;height:44px;opacity:.55;transition:opacity .25s,background .25s}.mw-toggle .mw-lbl{display:none}.mw-toggle svg{width:20px;height:20px}.mw-contact.open .mw-toggle,.mw-toggle:active{opacity:1}.mw-cl{font-size:26px}.mw-list a{padding:10px 13px;font-size:13px;opacity:.92}}' +
      /* чат */
      '.mwc{position:fixed;right:16px;bottom:16px;z-index:950;width:min(370px,calc(100vw - 24px));height:min(500px,calc(100vh - 32px));display:none;flex-direction:column;background:#151411;color:#f2ede4;border:1px solid #C4A165;border-radius:18px;box-shadow:0 20px 50px -18px rgba(0,0,0,.8);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}' +
      '.mwc-h{display:flex;align-items:center;gap:11px;padding:11px 12px;background:#1d1b17;border-bottom:1px solid rgba(196,161,101,.35)}' +
      '.mwc-av{position:relative;flex:none;width:42px;height:42px}' +
      '.mwc-av img{width:42px;height:42px;border-radius:50%;display:block;object-fit:cover}' +
      '.mwc-av i{position:absolute;right:-1px;bottom:-1px;width:11px;height:11px;border-radius:50%;background:#9FBF78;border:2px solid #1d1b17}' +
      '.mwc-ht{flex:1;min-width:0}.mwc-ht b{display:block;color:#f2ede4;font-size:15px;line-height:1.2}' +
      '.mwc-ht span{display:flex;align-items:center;gap:6px;font-size:12px;color:#A9BC85}' +
      '.mwc-ht span em{font-style:normal;color:#b9b2a5}' +
      '.mwc-x{background:none;border:0;color:#C4A165;font-size:26px;line-height:1;cursor:pointer;padding:4px 8px}' +
      '.mwc-l{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px;display:flex;flex-direction:column;gap:8px}' +
      '.mwc-m{max-width:86%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}' +
      '.mwc-me{align-self:flex-end;background:#C4A165;color:#151411;border-bottom-right-radius:4px}' +
      '.mwc-them{align-self:flex-start;background:#26231e;border-bottom-left-radius:4px}' +
      '.mwc-sys{align-self:center;text-align:center;font-size:12px;color:#b9b2a5;padding:2px 8px}' +
      '.mwc-sys.ok{color:#A9BC85}' +
      '.mwc-dots span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:#C4A165;animation:mwb 1.2s infinite}' +
      '.mwc-dots span:nth-child(2){animation-delay:.15s}.mwc-dots span:nth-child(3){animation-delay:.3s}' +
      '@keyframes mwb{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}' +
      '.mwc-f{display:flex;flex-direction:column;gap:6px;padding:10px;border-top:1px solid rgba(196,161,101,.35);background:#1d1b17}' +
      '.mwc-f input[type=text],.mwc-f textarea{width:100%;box-sizing:border-box;background:#151411;color:#f2ede4;border:1px solid #3a352c;border-radius:10px;padding:9px 10px;font:16px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;resize:none;-webkit-appearance:none;appearance:none}' +
      '.mwc-f input:focus,.mwc-f textarea:focus{outline:none;border-color:#C4A165}' +
      '.mwc-r{display:flex;gap:8px;align-items:flex-end}.mwc-r textarea{flex:1}' +
      '.mwc-s{background:#C4A165;color:#151411;border:0;border-radius:10px;padding:11px 14px;font:600 15px system-ui,sans-serif;cursor:pointer;touch-action:manipulation}.mwc-s:disabled{opacity:.5}' +
      '.mwc-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}' +
      '@media (max-width:768px){.mwc{right:8px;bottom:8px;width:calc(100vw - 16px);height:min(75vh,520px)}@supports (height:1dvh){.mwc{height:min(75dvh,520px)}}}' +
      'html,body{overflow-x:clip;overscroll-behavior-x:none}' +
      '@supports not (overflow:clip){html{overflow-x:hidden}}';
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    var box = document.createElement('div');
    box.className = 'mw-contact';
    var listEl = document.createElement('div');
    listEl.className = 'mw-list';
    items.forEach(function (it) {
      var a = document.createElement('a');
      a.href = it.href;
      if (it.id !== 'chat') { a.target = '_blank'; a.rel = 'noopener'; }
      a.setAttribute('data-contact', it.id);
      a.innerHTML = ic + '<span></span>';
      a.lastChild.textContent = it.label;
      if (it.id === 'chat') a.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openChat(); });
      listEl.appendChild(a);
    });
    box.appendChild(listEl);
    var t = document.createElement('button');
    t.type = 'button'; t.className = 'mw-toggle';
    t.setAttribute('aria-label', T.aria); t.setAttribute('aria-expanded', 'false');
    t.innerHTML = ic + '<span class="mw-lbl"></span><span class="mw-cl" aria-hidden="true">×</span>';
    t.querySelector('.mw-lbl').textContent = T.toggle;
    function closeList() { box.classList.remove('open'); t.setAttribute('aria-expanded', 'false'); }
    t.addEventListener('click', function (e) {
      e.stopPropagation();
      var o = box.classList.toggle('open');
      t.setAttribute('aria-expanded', o ? 'true' : 'false');
    });
    document.addEventListener('click', closeList);
    box.appendChild(t);
    document.body.appendChild(box);

    (function () {
      var bar = document.getElementById('stickybar');
      if (!bar || !window.MutationObserver) return;
      function sync() { document.body.classList.toggle('mw-lift', bar.classList.contains('visible')); }
      new MutationObserver(sync).observe(bar, { attributes: true, attributeFilter: ['class'] });
      sync();
    })();

    // ---------- Чат ----------
    var panel = null, listC = null, input = null, sendBtn = null, nameIn = null, hdrImg = null, hdrTitle = null, hdrSub = null;
    var sid = '', msgs = [], pendingText = null, cAtSend = 0, tAtSend = 0, waiting = false, searching = false, connected = false;
    var timer = 0, waitTimer = 0, lastSig = '', busy = false;

    function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
    function newSid() {
      var a = '', c = 'abcdefghijklmnopqrstuvwxyz0123456789';
      try { var r = new Uint8Array(20); crypto.getRandomValues(r); for (var i = 0; i < 20; i++) a += c[r[i] % c.length]; }
      catch (e) { for (var j = 0; j < 20; j++) a += c[Math.floor(Math.random() * c.length)]; }
      return a;
    }
    var AV_BRAND = '/chat-logo.png';
    var AV_PERSON = ru ? '/chat-ru.jpg' : '/chat-en.jpg';

    function el(tag, cls, text) { var d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; }
    function countRole(r) { var n = 0; for (var i = 0; i < msgs.length; i++) if (msgs[i].r === r) n++; return n; }
    function header() {
      if (!hdrImg) return;
      if (connected) {
        hdrImg.src = AV_PERSON; hdrTitle.textContent = T.persona;
        hdrSub.innerHTML = '<span></span>'; hdrSub.firstChild.textContent = T.online + ' ';
        var em = document.createElement('em'); em.textContent = '· ' + T.role; hdrSub.firstChild.appendChild(em);
      } else {
        hdrImg.src = AV_BRAND; hdrTitle.textContent = T.title;
        hdrSub.innerHTML = '<span></span>'; hdrSub.firstChild.textContent = T.online;
      }
    }
    function render() {
      if (!listC) return;
      listC.textContent = '';
      listC.appendChild(el('div', 'mwc-m mwc-them', T.hello));
      var sysDone = false;
      function sys() {
        if (sysDone) return; sysDone = true;
        if (searching) { var s = el('div', 'mwc-sys'); s.textContent = T.searching; var d = el('span', 'mwc-dots'); d.innerHTML = ' <span></span><span></span><span></span>'; s.appendChild(d); listC.appendChild(s); }
        else if (connected) listC.appendChild(el('div', 'mwc-sys ok', T.joined));
      }
      var firstC = true;
      msgs.forEach(function (m) {
        if (m.r === 'a') return;
        listC.appendChild(el('div', 'mwc-m ' + (m.r === 'c' ? 'mwc-me' : 'mwc-them'), m.t));
        if (m.r === 'c' && firstC) { firstC = false; sys(); }
      });
      if (pendingText && countRole('c') === cAtSend) {
        listC.appendChild(el('div', 'mwc-m mwc-me', pendingText));
        if (firstC) { firstC = false; sys(); }
      }
      if (waiting && !searching) {
        var ty = el('div', 'mwc-m mwc-them mwc-dots'); ty.innerHTML = '<span></span><span></span><span></span>'; listC.appendChild(ty);
      }
      listC.scrollTop = listC.scrollHeight;
    }
    function api(method, qs, body) {
      return fetch('/api/chat' + (qs || ''), { method: method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._s = r.status; return j; }); });
    }
    function sync() {
      if (!sid) return Promise.resolve();
      return api('GET', '?sid=' + sid + '&n=0').then(function (j) {
        if (!j || !j.ok) return;
        msgs = j.msgs || [];
        if (!connected && countRole('t') > 0) { connected = true; store('mw_chat_conn', '1'); header(); }
        if (waiting && countRole('t') > tAtSend) { waiting = false; clearTimeout(waitTimer); }
        var sig = JSON.stringify(msgs) + '|' + waiting + searching + connected + (pendingText || '');
        if (sig !== lastSig) { lastSig = sig; render(); }
      }).catch(function () {});
    }
    function fit() {
      if (!panel || panel.style.display === 'none') return;
      var vv = window.visualViewport;
      if (!vv || window.innerWidth > 768) { panel.style.bottom = ''; panel.style.maxHeight = ''; return; }
      var kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      panel.style.bottom = (8 + kb) + 'px';
      panel.style.maxHeight = Math.max(240, vv.height - 16) + 'px';
    }
    function buildChat() {
      panel = el('div', 'mwc'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', T.title);
      var h = el('div', 'mwc-h');
      var av = el('div', 'mwc-av'); hdrImg = document.createElement('img'); hdrImg.alt = ''; av.appendChild(hdrImg); av.appendChild(document.createElement('i'));
      var ht = el('div', 'mwc-ht'); hdrTitle = el('b'); hdrSub = el('div'); hdrSub.className = 'mwc-sub';
      hdrSub.style.cssText = 'font-size:12px;color:#A9BC85';
      ht.appendChild(hdrTitle); ht.appendChild(hdrSub);
      var x = el('button', 'mwc-x', '×'); x.type = 'button'; x.setAttribute('aria-label', T.close);
      x.addEventListener('click', closeChat);
      h.appendChild(av); h.appendChild(ht); h.appendChild(x);
      listC = el('div', 'mwc-l');
      var f = el('div', 'mwc-f');
      nameIn = document.createElement('input'); nameIn.type = 'text'; nameIn.maxLength = 120; nameIn.placeholder = T.name; nameIn.setAttribute('autocomplete', 'off');
      var hp = document.createElement('input'); hp.type = 'text'; hp.className = 'mwc-hp'; hp.tabIndex = -1; hp.setAttribute('autocomplete', 'off'); hp.setAttribute('aria-hidden', 'true');
      var row = el('div', 'mwc-r');
      input = document.createElement('textarea'); input.rows = 2; input.maxLength = 1000; input.placeholder = T.ph;
      sendBtn = el('button', 'mwc-s', T.send); sendBtn.type = 'button';
      row.appendChild(input); row.appendChild(sendBtn);
      f.appendChild(nameIn); f.appendChild(hp); f.appendChild(row);
      panel.appendChild(h); panel.appendChild(listC); panel.appendChild(f);
      document.body.appendChild(panel);
      panel.addEventListener('click', function (e) { e.stopPropagation(); });
      function submit() {
        var text = input.value.trim();
        if (!text || busy) return;
        busy = true; sendBtn.disabled = true;
        var nm = nameIn.value.trim();
        cAtSend = countRole('c'); tAtSend = countRole('t'); pendingText = text; input.value = '';
        if (!connected) {
          searching = true;
          setTimeout(function () { searching = false; connected = true; store('mw_chat_conn', '1'); header(); lastSig = ''; render(); }, 2200);
        }
        waiting = true; clearTimeout(waitTimer); waitTimer = setTimeout(function () { waiting = false; lastSig = ''; render(); }, 120000);
        lastSig = ''; render();
        api('POST', '', { sid: sid, message: text, name: nm, contact: nm, lang: ru ? 'ru' : 'en', page: location.pathname, website: hp.value }).then(function (j) {
          if (j && j.ok) {
            nameIn.style.display = 'none';
            pendingText = null;
            return sync();
          }
          pendingText = null; waiting = false; searching = false; input.value = text;
          lastSig = ''; render(); listC.appendChild(el('div', 'mwc-sys', T.err)); listC.scrollTop = listC.scrollHeight;
        }).catch(function () {
          pendingText = null; waiting = false; searching = false; input.value = text;
          lastSig = ''; render(); listC.appendChild(el('div', 'mwc-sys', T.err));
        }).then(function () { busy = false; sendBtn.disabled = false; if (!('ontouchstart' in window)) input.focus(); });
      }
      sendBtn.addEventListener('click', submit);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
      if (window.visualViewport) { window.visualViewport.addEventListener('resize', fit); window.visualViewport.addEventListener('scroll', fit); }
    }
    function closeChat() {
      panel.style.display = 'none'; document.body.classList.remove('mw-chat-open'); clearInterval(timer);
    }
    function openChat() {
      closeList();
      if (!panel) {
        sid = store('mw_chat_sid') || '';
        if (!/^[a-z0-9]{12,40}$/.test(sid)) { sid = newSid(); store('mw_chat_sid', sid); }
        connected = store('mw_chat_conn') === '1';
        buildChat(); header(); render();
        sync().then(function () { if (msgs.length) nameIn.style.display = 'none'; });
      }
      panel.style.display = 'flex'; document.body.classList.add('mw-chat-open');
      fit(); sync();
      clearInterval(timer); timer = setInterval(sync, 3000);
      if (!('ontouchstart' in window)) setTimeout(function () { input.focus(); }, 50);
    }
  } catch (e) { /* ничего */ }
})();
