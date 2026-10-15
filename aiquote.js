/* METRAWEN AI quote calculator. One file, no dependencies, used by the OS and by the website proposal page.
   Source of truth: metrawen-os/src/pricing/aiquote.cjs + config/pricing/ai-quote.json. Copies elsewhere must stay byte-identical (scripts/check-site-sync.mjs). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AiQuote = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function isInt(n) { return typeof n === "number" && isFinite(n) && Math.floor(n) === n; }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function roleName(cfg, id, lang) { var r = cfg.roles.filter(function (x) { return x.id === id; })[0]; return r ? r[lang] : id; }
  function deptName(cfg, id, lang) { var d = cfg.departments.filter(function (x) { return x.id === id; })[0]; return d ? d[lang] : id; }

  /** Smallest valid configuration of a product: its price equals the "from" price shown publicly. */
  function defaultInput(cfg, product) {
    var p = cfg.products[product];
    if (!p) throw new Error("Unknown product: " + product);
    var ids = cfg.roles.map(function (r) { return r.id; });
    var inp = { product: product, answers: {}, auditCredit: false };
    cfg.options.forEach(function (o) {
      inp.answers[o.id] = o.type === "count" ? o.included : o.type === "flag" ? !!o.default : o.default;
    });
    if (product === "system") {
      inp.departments = [
        { id: cfg.departments[0].id, roles: ids.slice(0, p.roles.min) },
        { id: cfg.departments[1].id, roles: ids.slice(0, p.roles.min) }
      ];
    } else {
      inp.roles = ids.slice(0, p.roles.min);
    }
    return inp;
  }

  function checkRoles(cfg, list, min, max, field, errors) {
    var ids = cfg.roles.map(function (r) { return r.id; });
    if (!Array.isArray(list) || list.length < min || list.length > max) { errors.push({ field: field, message: "Choose from " + min + " to " + max + " roles" }); return; }
    if (uniq(list).length !== list.length) errors.push({ field: field, message: "A role can be chosen once" });
    list.forEach(function (r) { if (ids.indexOf(r) < 0) errors.push({ field: field, message: "Unknown role: " + r }); });
  }

  function normalizeAnswers(cfg, product, raw, errors) {
    var out = {}; raw = raw || {};
    cfg.options.forEach(function (o) {
      var v = raw[o.id];
      if (v === undefined || v === null || v === "") v = o.type === "count" ? o.included : o.type === "flag" ? !!o.default : o.default;
      if (o.type === "count") {
        v = Number(v);
        if (!isInt(v) || v < o.min || v > o.max) { errors.push({ field: o.id, message: "Choose from " + o.min + " to " + o.max }); v = o.included; }
      } else if (o.type === "flag") {
        v = v === true || v === "true" || v === 1;
      } else {
        if (!o.choices.some(function (c) { return c.v === v; })) { errors.push({ field: o.id, message: "Unknown choice" }); v = o.default; }
      }
      out[o.id] = v;
    });
    return out;
  }

  function roundRub(usd, cfg) { return Math.round((usd * cfg.rubRate) / cfg.rubRound) * cfg.rubRound; }

  /** compute(cfg, input) -> { ok:false, errors } or { ok:true, ... } with every line of the price visible. */
  function compute(cfg, input) {
    var errors = [], inp = input || {};
    var p = cfg.products[inp.product];
    if (!p) return { ok: false, errors: [{ field: "product", message: "Unknown product" }] };
    var mk = (cfg.markets && cfg.markets[inp.market]) || null;
    var mult = mk ? mk.mult : 1, auditPrice = mk ? mk.audit : cfg.audit.price;
    var currency = mk ? mk.currency : (inp.currency === "RUB" ? "RUB" : "USD");
    function scale(n) { return mult === 1 ? n : Math.round((n * mult) / 5) * 5; }
    var answers = normalizeAnswers(cfg, inp.product, inp.answers, errors);
    var lines = [], base = 0, roleCount = 0, deptCount = 0;

    function roleLine(roleId, first, prefixRu, prefixEn) {
      var amount = first ? p.firstRole : p.nextRole, t = cfg.lineTexts.role;
      lines.push({ id: "role:" + (prefixRu || "") + roleId, kind: "role", titleRu: (prefixRu ? prefixRu + ": " : t.ru + ": ") + roleName(cfg, roleId, "ru"), titleEn: (prefixEn ? prefixEn + ": " : t.en + ": ") + roleName(cfg, roleId, "en"), amount: amount, whatRu: t.whatRu, whatEn: t.whatEn });
      base += amount; roleCount++;
    }
    function linkLine(prefixRu, prefixEn) {
      var t = cfg.lineTexts.link;
      lines.push({ id: "link:" + (prefixRu || ""), kind: "link", titleRu: prefixRu ? t.ru + ": " + prefixRu : t.ru, titleEn: prefixEn ? t.en + ": " + prefixEn : t.en, amount: p.link, whatRu: t.whatRu, whatEn: t.whatEn });
      base += p.link;
    }

    if (inp.product === "system") {
      var deps = inp.departments;
      if (!Array.isArray(deps) || deps.length < p.departments.min || deps.length > p.departments.max) errors.push({ field: "departments", message: "Choose from " + p.departments.min + " to " + p.departments.max + " departments" });
      else {
        if (uniq(deps.map(function (d) { return d.id; })).length !== deps.length) errors.push({ field: "departments", message: "A department can be chosen once" });
        deps.forEach(function (d, i) {
          if (!cfg.departments.some(function (x) { return x.id === d.id; })) errors.push({ field: "departments", message: "Unknown department: " + d.id });
          checkRoles(cfg, d.roles, p.roles.min, p.roles.max, "departments[" + i + "].roles", errors);
        });
      }
      if (!errors.length) {
        deps.forEach(function (d) {
          var nRu = "Отдел «" + deptName(cfg, d.id, "ru") + "»", nEn = "Department “" + deptName(cfg, d.id, "en") + "”";
          d.roles.forEach(function (r, i) { roleLine(r, i === 0, nRu, nEn); });
          linkLine(nRu, nEn); deptCount++;
        });
        var o = cfg.lineTexts.orchestration;
        lines.push({ id: "orchestration", kind: "orchestration", titleRu: o.ru, titleEn: o.en, amount: p.orchestration, whatRu: o.whatRu, whatEn: o.whatEn });
        base += p.orchestration;
      }
    } else {
      checkRoles(cfg, inp.roles, p.roles.min, p.roles.max, "roles", errors);
      if (!errors.length) {
        inp.roles.forEach(function (r, i) { roleLine(r, i === 0); });
        if (p.link > 0 && inp.roles.length >= 2) linkLine();
      }
    }
    if (errors.length) return { ok: false, errors: errors };

    var optTotal = 0, monthlyExtra = 0, optLines = [];
    cfg.options.forEach(function (o) {
      var v = answers[o.id], amount = 0, mo = 0;
      if (o.includedIn && o.includedIn.indexOf(inp.product) >= 0) return;
      if (o.type === "count") amount = (v - o.included) * o.each;
      else if (o.type === "flag") { if (o.percent) return; amount = v ? o.price : 0; mo = v && o.monthly ? o.monthly : 0; }
      else { var c = o.choices.filter(function (x) { return x.v === v; })[0]; amount = c.price; mo = c.monthly || 0; }
      monthlyExtra += mo;
      if (amount > 0) {
        var title = o.type === "choice" ? o.lineRu + ": " + o.choices.filter(function (x) { return x.v === v; })[0].ru.replace(/\s*\(.*$/, "") : o.type === "count" ? o.lineRu + ": " + (v - o.included) : o.lineRu;
        var titleEn = o.type === "choice" ? o.lineEn + ": " + o.choices.filter(function (x) { return x.v === v; })[0].en.replace(/\s*\(.*$/, "") : o.type === "count" ? o.lineEn + ": " + (v - o.included) : o.lineEn;
        optLines.push({ id: "option:" + o.id, kind: "option", titleRu: title, titleEn: titleEn, amount: amount, whatRu: o.whatRu, whatEn: o.whatEn });
        optTotal += amount;
      }
    });
    lines = lines.concat(optLines);
    var subtotal = base + optTotal;

    var urgentOpt = cfg.options.filter(function (o) { return o.id === "urgent"; })[0];
    var urgentAmount = answers.urgent && urgentOpt ? Math.round((subtotal * urgentOpt.percent) / 100) : 0;
    if (urgentAmount > 0) { var u = cfg.lineTexts.urgent; lines.push({ id: "urgent", kind: "urgent", titleRu: u.ru + " (+" + urgentOpt.percent + "%)", titleEn: u.en + " (+" + urgentOpt.percent + "%)", amount: urgentAmount, whatRu: u.whatRu, whatEn: u.whatEn }); }

    if (mult !== 1) {
      lines = lines.map(function (l) { var x = {}; for (var k in l) x[k] = l[k]; x.amount = scale(l.amount); return x; });
      subtotal = lines.filter(function (l) { return l.kind !== "urgent"; }).reduce(function (a, l) { return a + l.amount; }, 0);
      urgentAmount = lines.filter(function (l) { return l.kind === "urgent"; }).reduce(function (a, l) { return a + l.amount; }, 0);
    }
    var credit = 0;
    if (inp.auditCredit) {
      credit = Math.min(auditPrice, subtotal + urgentAmount);
      var c = cfg.lineTexts.credit;
      lines.push({ id: "credit", kind: "credit", titleRu: c.ru, titleEn: c.en, amount: -credit, whatRu: c.whatRu, whatEn: c.whatEn });
    }

    var monthly = p.monthly.base + monthlyExtra;
    if (p.monthly.perExtraRole && roleCount > p.monthly.extraRoleAfter) monthly += (roleCount - p.monthly.extraRoleAfter) * p.monthly.perExtraRole;
    if (p.monthly.perExtraDepartment && deptCount > p.monthly.extraDepartmentAfter) monthly += (deptCount - p.monthly.extraDepartmentAfter) * p.monthly.perExtraDepartment;

    monthly = scale(monthly);
    var total = subtotal + urgentAmount - credit;
    if (currency === "RUB") {
      lines = lines.map(function (l) { var x = {}; for (var k in l) x[k] = l[k]; x.amount = roundRub(l.amount, cfg); return x; });
      total = lines.reduce(function (s, l) { return s + l.amount; }, 0);
      monthly = roundRub(monthly, cfg); subtotal = lines.filter(function (l) { return l.kind !== "credit" && l.kind !== "urgent"; }).reduce(function (s, l) { return s + l.amount; }, 0);
      credit = credit ? -lines.filter(function (l) { return l.kind === "credit"; })[0].amount : 0;
    }
    var pct = cfg.paymentTerms.ai, first = Math.round((total * pct[0]) / 100);
    var schedule = [{ percent: pct[0], amount: first }, { percent: pct[1], amount: total - first }];

    return {
      ok: true, product: inp.product, serviceCode: p.serviceCode, currency: currency, lines: lines,
      subtotal: subtotal, credit: credit, total: total, monthly: monthly, schedule: schedule,
      roleCount: roleCount, departmentCount: deptCount, answers: answers,
      from: currency === "RUB" ? roundRub(scale(p.from), cfg) : scale(p.from), market: mk ? inp.market : null, auditPrice: currency === "RUB" ? roundRub(auditPrice, cfg) : auditPrice, configVersion: cfg.version
    };
  }

  function fmt(n, currency) {
    var s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return (n < 0 ? "−" : "") + (currency === "RUB" ? s + " ₽" : "$" + s.replace(/ /g, ","));
  }

  return { compute: compute, defaultInput: defaultInput, fmt: fmt, roundRub: roundRub };
});
