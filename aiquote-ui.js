/* METRAWEN AI quote checklist UI (browser). Needs aiquote.js (AiQuote). Used by the proposal page (p.html) and the proposal editor (kp-admin.html).
   Source of truth: metrawen-os/src/pricing/aiquote-ui.js. Copies elsewhere must stay byte-identical. */
(function (root) {
  "use strict";
  var T = {
    ru: { roles1: "Какая роль нужна?", rolesN: "Какие роли нужны?", pick1: "Выберите одну роль", pickN: "Выберите от {min} до {max} ролей", picked: "Выбрано", of: "из", deps: "Какие отделы нужны?", depsHelp: "Выберите от {min} до {max} отделов, в каждом от {rmin} до {rmax} ролей", addDept: "Добавить отдел", removeDept: "Убрать отдел", opts: "Ответьте на несколько вопросов", base: "в цене", plus: "доплата", inSystem: "Входит в AI System", on: "Да", off: "Нет", more: "ещё", rolesBad: "Выберите роли, чтобы увидеть цену", per: "за каждый", month: "в месяц" },
    en: { roles1: "Which role do you need?", rolesN: "Which roles do you need?", pick1: "Choose one role", pickN: "Choose {min} to {max} roles", picked: "Selected", of: "of", deps: "Which departments do you need?", depsHelp: "Choose {min} to {max} departments, {rmin} to {rmax} roles in each", addDept: "Add a department", removeDept: "Remove department", opts: "Answer a few questions", base: "included", plus: "extra", inSystem: "Included in AI System", on: "Yes", off: "No", more: "more", rolesBad: "Choose roles to see the price", per: "each", month: "per month" }
  };
  var CSS = ".aiq{--g:var(--gold,#C4A165);--c:var(--card,#1a1916);--h:var(--hair,rgba(255,255,255,.09));--d:var(--dim,#b9b2a5);--f:var(--faint,#857e72);--t:var(--text,#f2ede4);color:var(--t)}" +
    ".aiq h3{margin:0 0 4px;font-size:16px;font-weight:600}.aiq .aiq-help{margin:0 0 12px;color:var(--d);font-size:14px}" +
    ".aiq-block{background:var(--c);border:1px solid var(--h);border-radius:18px;padding:20px;margin-bottom:12px}" +
    ".aiq-roles{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}" +
    ".aiq-role{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;min-height:64px;padding:14px 16px;border-radius:14px;border:1px solid var(--h);background:transparent;color:var(--t);font:inherit;cursor:pointer;transition:border-color .2s,background .2s}" +
    ".aiq-role b{font-weight:600;font-size:15px}.aiq-role span{color:var(--d);font-size:13px;line-height:1.4}" +
    ".aiq-role:hover:not([disabled]){border-color:color-mix(in srgb,var(--g) 50%,transparent)}.aiq-role[aria-pressed=true]{border-color:var(--g);background:color-mix(in srgb,var(--g) 9%,transparent)}" +
    ".aiq-role[aria-pressed=true] b::before{content:'✓ ';color:var(--g)}.aiq-role[disabled]{opacity:.45;cursor:not-allowed}" +
    ".aiq-count{font-family:var(--mono,monospace);font-size:12px;color:var(--f);margin-top:10px}" +
    ".aiq-dep{border:1px solid var(--h);border-radius:14px;padding:14px;margin-top:12px}.aiq-dep>header{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.aiq-dep>header b{font-size:15px}" +
    ".aiq-q{display:grid;gap:10px;padding:16px 0;border-top:1px solid var(--h)}.aiq-q:first-of-type{border-top:0;padding-top:4px}" +
    ".aiq-q>div:first-child{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.aiq-q strong{font-weight:600;font-size:15px}.aiq-q small{display:block;color:var(--d);font-size:13px;margin-top:2px;line-height:1.45}" +
    ".aiq-chip{flex:none;font-family:var(--mono,monospace);font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid var(--h);color:var(--f);white-space:nowrap}.aiq-chip.p{border-color:color-mix(in srgb,var(--g) 50%,transparent);color:var(--g)}" +
    ".aiq-ch{display:grid;gap:8px}.aiq-opt{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;min-height:46px;padding:10px 14px;border:1px solid var(--h);border-radius:12px;cursor:pointer;font-size:14px}" +
    ".aiq-opt:hover{border-color:color-mix(in srgb,var(--g) 50%,transparent)}.aiq-opt.on{border-color:var(--g);background:color-mix(in srgb,var(--g) 7%,transparent)}.aiq-opt input{accent-color:var(--g);width:18px;height:18px;margin:0}" +
    ".aiq-step{display:inline-flex;align-items:center;gap:12px}.aiq-step button{width:44px;height:44px;border-radius:50%;border:1px solid var(--g);background:transparent;color:var(--g);font-size:20px;cursor:pointer}.aiq-step button[disabled]{opacity:.35;cursor:not-allowed}.aiq-step output{min-width:28px;text-align:center;font:600 18px var(--mono,monospace)}" +
    ".aiq-sw{display:inline-flex;align-items:center;gap:12px;min-height:44px;cursor:pointer;font-size:14px}.aiq-sw input{position:absolute;opacity:0;width:1px;height:1px}.aiq-sw i{flex:none;width:44px;height:24px;border-radius:999px;background:var(--sw,#3a352c);position:relative;transition:background .2s}.aiq-sw i::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#f2ede4;transition:left .2s}" +
    ".aiq-sw input:checked+i{background:var(--g)}.aiq-sw input:checked+i::after{left:23px}.aiq-sw input:focus-visible+i,.aiq-opt input:focus-visible,.aiq-role:focus-visible,.aiq-step button:focus-visible{outline:2px solid var(--g);outline-offset:2px}" +
    ".aiq-btn{min-height:44px;padding:8px 16px;border-radius:999px;border:1px solid var(--g);background:transparent;color:var(--g);font:600 14px inherit;cursor:pointer}.aiq-sel{width:100%;min-height:44px;background:transparent;color:var(--t);border:1px solid var(--h);border-radius:12px;padding:8px 12px;font:inherit}" +
    ".aiq.lock .aiq-role,.aiq.lock .aiq-opt,.aiq.lock .aiq-sw,.aiq.lock .aiq-step button,.aiq.lock .aiq-btn,.aiq.lock .aiq-sel{pointer-events:none;opacity:.7}" +
    ".aiq-lines{display:flex;flex-direction:column;gap:8px}.aiq-line{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 16px;padding:14px 16px;border:1px solid var(--h);border-radius:14px;background:var(--c)}.aiq-line b{font-weight:600;font-size:15px}.aiq-line .am{font-family:var(--mono,monospace);font-weight:500;text-align:right;white-space:nowrap}" +
    ".aiq-line ul{grid-column:1/-1;margin:4px 0 0;padding:0;list-style:none;color:var(--d);font-size:13px;line-height:1.5}.aiq-line li::before{content:'– ';color:var(--f)}.aiq-line.cr .am{color:var(--ok,#A9BC85)}" +
    ".aiq-base ul{margin:6px 0 0;padding-left:0;list-style:none;font-size:14px;color:var(--d)}.aiq-base li{padding:3px 0}.aiq-base li::before{content:'✓ ';color:var(--ok,#A9BC85)}";

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function tpl(s, o) { return s.replace(/\{(\w+)\}/g, function (_, k) { return o[k]; }); }
  function money(n, cur) { return root.AiQuote.fmt(n, cur); }
  function conv(usd, cfg, cur) { return cur === "RUB" ? root.AiQuote.roundRub(usd, cfg) : usd; }

  /** mount(container, {cfg, lang, currency, state, locked, onChange(state)}) — state: {product, roles, departments, answers}. Mutated in place. */
  function mount(box, o) {
    if (!document.getElementById("aiq-style")) { var st = el("style"); st.id = "aiq-style"; st.textContent = CSS; document.head.appendChild(st); }
    var cfg = o.cfg, L = T[o.lang === "en" ? "en" : "ru"], en = o.lang === "en", S = o.state, P = cfg.products[S.product], focusKey = null;
    function nm(x) { return en ? x.en : x.ru; }
    function changed(key) { focusKey = key || null; if (o.onChange) o.onChange(S); render(); }
    function priceTxt(usd) { var mk = cfg.markets && o.state && cfg.markets[o.state.market], m = mk ? mk.mult : 1, cur = mk ? mk.currency : o.currency, v = m === 1 ? usd : Math.round((usd * m) / 5) * 5; return "+" + money(conv(v, cfg, cur), cur); }

    function roleToggles(list, min, max, onToggle, keyPrefix) {
      var grid = el("div", "aiq-roles"); grid.setAttribute("role", "group");
      cfg.roles.forEach(function (r) {
        var on = list.indexOf(r.id) >= 0, full = !on && list.length >= max;
        var b = el("button", "aiq-role"); b.type = "button"; b.setAttribute("aria-pressed", on ? "true" : "false"); b.dataset.k = keyPrefix + r.id;
        if (full) { b.disabled = true; b.title = (en ? "Maximum " : "Максимум ") + max; }
        b.appendChild(el("b", "", nm(r))); b.appendChild(el("span", "", en ? r.descEn : r.descRu));
        b.onclick = function () { onToggle(r.id, on); }; grid.appendChild(b);
      });
      return grid;
    }
    function toggleIn(list, id, on, min, max) { if (on) { if (list.length > 1 || min === 0) list.splice(list.indexOf(id), 1); } else if (list.length < max) list.push(id); }

    function render() {
      box.textContent = ""; box.className = "aiq" + (o.locked ? " lock" : "");
      if (S.product === "system") {
        var b = el("div", "aiq-block"); b.appendChild(el("h3", "", L.deps)); b.appendChild(el("p", "aiq-help", tpl(L.depsHelp, { min: P.departments.min, max: P.departments.max, rmin: P.roles.min, rmax: P.roles.max })));
        S.departments.forEach(function (d, di) {
          var dep = el("div", "aiq-dep"), h = el("header"); h.appendChild(el("b", "", (en ? cfg.departments : cfg.departments).filter(function (x) { return x.id === d.id; }).map(nm)[0]));
          if (S.departments.length > P.departments.min) { var rm = el("button", "aiq-btn", L.removeDept); rm.type = "button"; rm.onclick = function () { S.departments.splice(di, 1); changed(); }; h.appendChild(rm); }
          dep.appendChild(h);
          dep.appendChild(roleToggles(d.roles, P.roles.min, P.roles.max, function (id, on) { toggleIn(d.roles, id, on, 0, P.roles.max); changed("r" + di + id); }, "r" + di));
          dep.appendChild(el("div", "aiq-count", L.picked + ": " + d.roles.length + " " + L.of + " " + P.roles.max + " (" + (en ? "min " : "минимум ") + P.roles.min + ")"));
          b.appendChild(dep);
        });
        var free = cfg.departments.filter(function (x) { return !S.departments.some(function (d) { return d.id === x.id; }); });
        if (S.departments.length < P.departments.max && free.length) {
          var sel = el("select", "aiq-sel"); sel.setAttribute("aria-label", L.addDept); sel.style.marginTop = "12px";
          var o0 = el("option", "", "+ " + L.addDept); o0.value = ""; sel.appendChild(o0);
          free.forEach(function (x) { var op = el("option", "", nm(x)); op.value = x.id; sel.appendChild(op); });
          sel.onchange = function () { if (sel.value) { S.departments.push({ id: sel.value, roles: cfg.roles.slice(0, P.roles.min).map(function (r) { return r.id; }) }); changed(); } };
          b.appendChild(sel);
        }
        box.appendChild(b);
      } else {
        var rb = el("div", "aiq-block"); rb.appendChild(el("h3", "", P.roles.max === 1 ? L.roles1 : L.rolesN));
        rb.appendChild(el("p", "aiq-help", P.roles.max === 1 ? L.pick1 : tpl(L.pickN, { min: P.roles.min, max: P.roles.max })));
        if (P.roles.max === 1) {
          rb.appendChild(roleToggles(S.roles, 1, 1, function (id) { S.roles = [id]; changed("r" + id); }, "r"));
        } else {
          rb.appendChild(roleToggles(S.roles, P.roles.min, P.roles.max, function (id, on) { toggleIn(S.roles, id, on, 0, P.roles.max); changed("r" + id); }, "r"));
          rb.appendChild(el("div", "aiq-count", L.picked + ": " + S.roles.length + " " + L.of + " " + P.roles.max));
        }
        box.appendChild(rb);
      }
      var ob = el("div", "aiq-block"); ob.appendChild(el("h3", "", L.opts));
      cfg.options.forEach(function (op, qi) {
        var q = el("div", "aiq-q"), head = el("div"), tx = el("div"), v = S.answers[op.id];
        tx.appendChild(el("strong", "", en ? op.en : op.ru)); tx.appendChild(el("small", "", en ? op.helpEn : op.helpRu)); head.appendChild(tx);
        var inc = op.includedIn && op.includedIn.indexOf(S.product) >= 0;
        if (inc) { head.appendChild(el("span", "aiq-chip", L.inSystem)); q.appendChild(head); ob.appendChild(q); return; }
        var chip = null;
        if (op.type === "count") {
          var extra = (v - op.included) * op.each; chip = el("span", "aiq-chip" + (extra > 0 ? " p" : ""), extra > 0 ? priceTxt(extra) : L.base);
          head.appendChild(chip); q.appendChild(head);
          var step = el("div", "aiq-step"), mi = el("button", "", "−"), pl = el("button", "", "+"), out = el("output", "", String(v));
          mi.type = pl.type = "button"; mi.setAttribute("aria-label", "−"); pl.setAttribute("aria-label", "+"); mi.dataset.k = "q" + op.id + "m"; pl.dataset.k = "q" + op.id + "p";
          mi.disabled = v <= op.min; pl.disabled = v >= op.max;
          mi.onclick = function () { S.answers[op.id] = v - 1; changed(mi.dataset.k); }; pl.onclick = function () { S.answers[op.id] = v + 1; changed(pl.dataset.k); };
          step.appendChild(mi); step.appendChild(out); step.appendChild(pl); q.appendChild(step);
          q.appendChild(el("small", "", en ? "Each extra: " + priceTxt(op.each) : "Каждый следующий: " + priceTxt(op.each)));
        } else if (op.type === "flag") {
          chip = el("span", "aiq-chip" + (v && op.price ? " p" : ""), op.percent ? "+" + op.percent + "%" : priceTxt(op.price)); head.appendChild(chip); q.appendChild(head);
          var sw = el("label", "aiq-sw"), cb = el("input"); cb.type = "checkbox"; cb.checked = !!v; cb.dataset.k = "q" + op.id; var tr = el("i");
          cb.onchange = function () { S.answers[op.id] = cb.checked; changed(cb.dataset.k); };
          sw.appendChild(cb); sw.appendChild(tr); sw.appendChild(el("span", "", v ? L.on : L.off)); q.appendChild(sw);
        } else {
          q.appendChild(head); var grp = el("div", "aiq-ch"); grp.setAttribute("role", "radiogroup");
          op.choices.forEach(function (c) {
            var lab = el("label", "aiq-opt" + (v === c.v ? " on" : "")), rd = el("input"); rd.type = "radio"; rd.name = "aiq-" + op.id; rd.checked = v === c.v; rd.dataset.k = "q" + op.id + c.v;
            rd.onchange = function () { S.answers[op.id] = c.v; changed(rd.dataset.k); };
            lab.appendChild(rd); lab.appendChild(el("span", "", en ? c.en : c.ru)); lab.appendChild(el("span", "aiq-chip" + (c.price ? " p" : ""), c.price ? priceTxt(c.price) : L.base)); grp.appendChild(lab);
          });
          q.appendChild(grp);
        }
        ob.appendChild(q);
      });
      box.appendChild(ob);
      if (focusKey) { var f = box.querySelector('[data-k="' + focusKey + '"]'); if (f && !f.disabled) f.focus(); focusKey = null; }
    }
    render();
    return { rerender: render };
  }

  /** Lines of the price with what each one includes. */
  function renderBreakdown(box, r, cfg, lang, currency) {
    var en = lang === "en"; box.textContent = ""; box.className = "aiq";
    if (!r.ok) { box.appendChild(el("p", "aiq-help", T[en ? "en" : "ru"].rolesBad)); return; }
    var base = el("div", "aiq-block aiq-base"), P = cfg.products[r.product];
    base.appendChild(el("h3", "", en ? "Included in every configuration" : "Входит в любую конфигурацию"));
    var ul = el("ul"); (en ? P.includesEn : P.includesRu).forEach(function (x) { ul.appendChild(el("li", "", x)); }); base.appendChild(ul); box.appendChild(base);
    var wrap = el("div", "aiq-lines");
    r.lines.forEach(function (l) {
      var row = el("div", "aiq-line" + (l.kind === "credit" ? " cr" : "")); row.appendChild(el("b", "", en ? l.titleEn : l.titleRu)); row.appendChild(el("div", "am", money(l.amount, currency)));
      var w = en ? l.whatEn : l.whatRu; if (w && w.length) { var u = el("ul"); w.forEach(function (x) { u.appendChild(el("li", "", x)); }); row.appendChild(u); }
      wrap.appendChild(row);
    });
    box.appendChild(wrap);
  }

  root.AiQuoteUI = { mount: mount, renderBreakdown: renderBreakdown };
})(typeof self !== "undefined" ? self : this);
