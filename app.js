/* Pine Vault — app.js */
const KEY = 'pinevault:v1';
const HELPER_URL = 'pine-vault-autopaste.user.js?v=3';

const USERSCRIPT_SRC = `// ==UserScript==
// @name         Pine Vault auto-paste
// @namespace    pinevault
// @version      3.0
// @description  One click from Pine Vault: opens the TradingView Pine Editor, pastes your code and adds it to the chart
// @match        https://*.tradingview.com/*
// @match        https://inspirotech-inspire.github.io/Pine-Vault/*
// @match        https://inspirotech-inspire.github.io/pine-vault/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  if (window.top !== window) return;

  if (!/tradingview\\.com$/i.test(location.hostname)) {
    try {
      window.__PINEVAULT__ = { autoPaste: true, version: '3.0' };
      document.documentElement.setAttribute('data-pinevault-auto', '1');
      var announce = function () {
        try { document.dispatchEvent(new CustomEvent('pinevault:ready')); } catch (e) {}
      };
      announce();
      document.addEventListener('DOMContentLoaded', announce);
    } catch (e) {}
    return;
  }

  var KEY = 'pinevault', TS = 'pinevault_ts', raw = null;
  var m = location.hash.match(/pinevault=([A-Za-z0-9_-]+)/);
  try {
    if (m) {
      raw = m[1];
      sessionStorage.setItem(KEY, raw);
      sessionStorage.setItem(TS, String(Date.now()));
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    } else {
      var ts = Number(sessionStorage.getItem(TS) || 0);
      if (Date.now() - ts < 180000) raw = sessionStorage.getItem(KEY);
    }
  } catch (e) {}
  if (!raw) return;

  var code;
  try {
    var b = raw.split('-').join('+').split('_').join('/');
    while (b.length % 4) b += '=';
    var bin = atob(b);
    code = new TextDecoder().decode(Uint8Array.from(bin, function (c) { return c.charCodeAt(0); }));
  } catch (e) { return; }

  function finish(clear) {
    if (!clear) return;
    try { sessionStorage.removeItem(KEY); sessionStorage.removeItem(TS); } catch (e) {}
  }

  var box = null, hideTimer = null;
  function say(msg, opts) {
    opts = opts || {};
    (function put() {
      if (!document.body) { setTimeout(put, 100); return; }
      if (!box) {
        box = document.createElement('div');
        box.style.cssText = 'position:fixed;z-index:2147483647;bottom:16px;left:16px;max-width:380px;padding:12px 14px;border-radius:10px;font:13px/1.45 system-ui,-apple-system,sans-serif;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.45);display:flex;gap:10px;align-items:flex-start';
        document.body.appendChild(box);
      }
      box.style.background = opts.bad ? '#d93025' : '#2962ff';
      box.textContent = '';
      var txt = document.createElement('div');
      txt.textContent = 'Pine Vault: ' + msg;
      txt.style.flex = '1';
      box.appendChild(txt);
      if (opts.copy) {
        var cb = document.createElement('button');
        cb.textContent = 'Copy code';
        cb.style.cssText = 'font:inherit;cursor:pointer;border:0;border-radius:6px;padding:5px 10px;background:rgba(255,255,255,.22);color:#fff;white-space:nowrap';
        cb.onclick = function () {
          navigator.clipboard.writeText(code).then(function () {
            cb.textContent = 'Copied ✓';
          }, function () {
            var t = document.createElement('textarea');
            t.value = code;
            document.body.appendChild(t);
            t.select();
            try { document.execCommand('copy'); cb.textContent = 'Copied ✓'; }
            catch (e) { cb.textContent = 'Select + Ctrl/Cmd+C'; }
            t.remove();
          });
        };
        box.appendChild(cb);
      }
      clearTimeout(hideTimer);
      if (opts.autohide) hideTimer = setTimeout(function () { if (box) box.remove(); box = null; }, opts.autohide);
    })();
  }

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  async function waitFor(fn, t) {
    var s = Date.now();
    while (Date.now() - s < t) { var v = fn(); if (v) return v; await sleep(250); }
    return null;
  }

  function vis(e) { return !!e && e.getClientRects().length > 0; }

  function findBtn(sels, re) {
    var i, e;
    for (i = 0; i < sels.length; i++) { e = document.querySelector(sels[i]); if (vis(e)) return e; }
    var els = document.querySelectorAll('button,[role=tab],[role=button]');
    for (i = 0; i < els.length; i++) {
      e = els[i];
      if (!vis(e)) continue;
      var t = (e.getAttribute('aria-label') || '') + ' ' +
              (e.getAttribute('title') || '') + ' ' +
              (e.getAttribute('data-name') || '') + ' ' +
              e.textContent;
      if (re.test(t)) return e;
    }
    return null;
  }

  function isPineDom(dom) {
    if (!dom || !dom.closest) return false;
    return !!(dom.closest('[data-name="pine-editor"]') ||
              dom.closest('[data-name*="pine" i]') ||
              dom.closest('.pine-editor'));
  }

  function monacoEditors() {
    try {
      if (window.monaco && window.monaco.editor && window.monaco.editor.getEditors) {
        return window.monaco.editor.getEditors();
      }
    } catch (e) {}
    return [];
  }

  function pineEditor() {
    var eds = monacoEditors(), fallback = null, dom, model, lang;
    for (var i = 0; i < eds.length; i++) {
      dom = eds[i].getDomNode && eds[i].getDomNode();
      if (!dom || !vis(dom)) continue;
      model = eds[i].getModel && eds[i].getModel();
      lang = (model && model.getLanguageId && model.getLanguageId()) || '';
      if (/pine/i.test(lang)) return eds[i];
      if (!fallback && isPineDom(dom)) fallback = eds[i];
    }
    return fallback;
  }

  async function ensureEditor() {
    var ed = pineEditor();
    if (ed) return ed;
    for (var attempt = 0; attempt < 2; attempt++) {
      var btn = findBtn(
        ['[data-name="pine-dialog-button"]', 'button[data-name*="pine" i]'],
        /pine editor|^\\s*pine\\s*$/i
      );
      if (btn) btn.click();
      ed = await waitFor(pineEditor, 6000);
      if (ed) return ed;
      await sleep(700);
    }
    return null;
  }

  function setEditorCode(ed) {
    try {
      if (ed.setValue) { ed.setValue(code); return true; }
      var model = ed.getModel && ed.getModel();
      if (model && model.setValue) { model.setValue(code); return true; }
    } catch (e) {}
    try {
      var ta = document.querySelector('.monaco-editor textarea');
      if (!ta) return false;
      ta.focus();
      document.execCommand('selectAll');
      return document.execCommand('insertText', false, code);
    } catch (e) { return false; }
  }

  function editorHasCode(ed) {
    try {
      var model = ed.getModel && ed.getModel();
      var v = (model && model.getValue && model.getValue()) || '';
      if (v.replace(/\\s+/g, '') === code.replace(/\\s+/g, '')) return true;
      if (v.indexOf(code.slice(0, 40)) > -1) return true;
    } catch (e) {}
    return false;
  }

  function addButton() {
    return findBtn(
      ['[data-name="add-script-to-chart"]', 'button[title*="Add to chart" i]', 'button[aria-label*="Add to chart" i]'],
      /add to chart|update on chart/i
    );
  }

  async function run() {
    say('waiting for the chart to load…');
    var ready = await waitFor(function () {
      return document.querySelector('.chart-container') ||
             document.querySelector('.chart-page') ||
             document.querySelector('[data-name="legend"]');
    }, 45000);
    if (!ready) {
      say('the chart did not finish loading — copy the code and paste it manually.', { bad: true, copy: true });
      finish(false);
      return;
    }
    await sleep(1200);

    say('opening the Pine Editor…');
    var ed = await ensureEditor();
    if (!ed) {
      say('could not find the Pine Editor — copy the code and paste it manually.', { bad: true, copy: true });
      finish(false);
      return;
    }

    say('pasting your code…');
    await sleep(500);
    var ok = false;
    for (var i = 0; i < 3 && !ok; i++) {
      ed = pineEditor() || ed;
      if (!setEditorCode(ed)) { await sleep(500); continue; }
      await sleep(500);
      ok = editorHasCode(ed);
    }
    if (!ok) {
      say('the paste did not take — copy the code and paste it into the editor manually.', { bad: true, copy: true });
      finish(false);
      return;
    }

    say('adding to chart…');
    var add = await waitFor(function () {
      var b = addButton();
      return b && !b.disabled && b.getAttribute('aria-disabled') !== 'true' ? b : null;
    }, 10000);

    if (add) {
      add.click();
    } else {
      try {
        var ta = document.querySelector('.monaco-editor textarea');
        if (ta) {
          ta.focus();
          ['keydown', 'keyup'].forEach(function (t) {
            ta.dispatchEvent(new KeyboardEvent(t, {
              key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
              ctrlKey: true, metaKey: /Mac/.test(navigator.platform),
              bubbles: true, cancelable: true
            }));
          });
        }
      } catch (e) {}
    }

    await sleep(1200);
    say('done — your indicator should now be on the chart.', { autohide: 6000 });
    finish(true);
  }

  run().catch(function (e) {
    say('error: ' + (e && e.message ? e.message : e), { bad: true, copy: true });
    finish(false);
  });
})();`;

const SEED = [{
  id: 's1',
  name: 'Example: EMA Cross',
  desc: 'Simple fast/slow EMA crossover. Replace me with your own scripts.',
  tags: ['trend', 'example'],
  code: '//@version=6\\nindicator("EMA Cross", overlay=true)\\nfast = ta.ema(close, 9)\\nslow = ta.ema(close, 21)\\nplot(fast, "Fast", color.new(color.teal, 0))\\nplot(slow, "Slow", color.new(color.orange, 0))\\nplotshape(ta.crossover(fast, slow), "Buy", shape.triangleup, location.belowbar, color.green)\\nplotshape(ta.crossunder(fast, slow), "Sell", shape.triangledown, location.abovebar, color.red)\\n',
  updated: Date.now()
}];

let items = [], sel = null, editing = false, autoPaste = false;
const $ = id => document.getElementById(id);

/* ---------------- helper detection ---------------- */
function detectAutoPaste() {
  try {
    if (window.__PINEVAULT__ && window.__PINEVAULT__.autoPaste) return true;
    if (document.documentElement.hasAttribute('data-pinevault-auto')) return true;
  } catch (e) {}
  return false;
}

function refreshAutoPaste() {
  autoPaste = detectAutoPaste();
  const badge = $('auto-badge');
  if (badge) badge.hidden = !autoPaste;
  const us = $('us');
  if (us) {
    us.textContent = autoPaste ? 'Helper active' : 'Enable one-click';
    us.classList.toggle('ok', autoPaste);
  }
  let dismissed = false;
  try { dismissed = localStorage.getItem('pinevault:setup-dismissed') === '1'; } catch (e) {}
  const banner = $('banner');
  if (banner) banner.hidden = autoPaste || dismissed;
}

/* ---------------- storage ---------------- */
function normTv(s) {
  s = (s || '').trim();
  if (!s) return '';
  if (/^https:\\/\\/(www\\.)?tradingview\\.com\\//i.test(s)) return s;
  if (/^[A-Za-z0-9_-]+(;|%3B)[0-9a-f]+$/i.test(s)) return 'https://www.tradingview.com/pine/?id=' + encodeURIComponent(decodeURIComponent(s));
  return '';
}

function normalize(r) {
  if (!r || typeof r !== 'object' || typeof r.name !== 'string' || !r.name.trim()) return null;
  return {
    id: typeof r.id === 'string' && r.id ? r.id : 'i' + Math.random().toString(36).slice(2),
    name: r.name.trim(),
    desc: typeof r.desc === 'string' ? r.desc : '',
    tags: Array.isArray(r.tags) ? r.tags.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim()) : [],
    code: typeof r.code === 'string' ? r.code : '',
    tv: normTv(r.tv || ''),
    updated: typeof r.updated === 'number' ? r.updated : Date.now()
  };
}

function load() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (!Array.isArray(data)) data = SEED;
  items = data.map(normalize).filter(Boolean);
  if (!items.length) items = SEED.map(normalize).filter(Boolean);
  sel = items[0] ? items[0].id : null;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(items)); }
  catch (e) { toast('Could not save in this browser — use Export for a backup'); }
}

/* ---------------- helpers ---------------- */
let toastTimer = null;
function toast(m) {
  const t = $('toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props || {});
  kids.forEach(k => e.append(k));
  return e;
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const t = el('textarea', { value: text });
    document.body.append(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) {}
    t.remove();
    return ok;
  }
}

function tvUrl(code) {
  let s = '';
  new TextEncoder().encode(code).forEach(x => s += String.fromCharCode(x));
  const b = btoa(s).split('+').join('-').split('/').join('_').replace(/=+$/, '');
  return b.length > 150000
    ? 'https://www.tradingview.com/chart/'
    : 'https://www.tradingview.com/chart/#pinevault=' + b;
}

/* ---------------- one-click open ---------------- */
function openInTradingView(i) {
  const p = copy(i.code);
  const w = window.open(tvUrl(i.code), '_blank');
  if (!w) toast('Popup blocked — allow popups for this site, then try again');
  p.then(ok => {
    if (autoPaste) toast('TradingView opened — pasting your code…');
    else if (ok) toast('TradingView opened — code is on your clipboard, paste it in the Pine Editor');
    else toast('TradingView opened — use “Copy code”, then paste it in the Pine Editor');
  });
}

/* ---------------- helper install modal ---------------- */
function showHelperModal() {
  if (document.getElementById('helper-modal-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'helper-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:12px;padding:22px;max-width:760px;width:100%;margin:auto;font-size:14px;box-shadow:0 12px 40px rgba(0,0,0,.35)';

  modal.innerHTML = `
    <h2 style="margin:0 0 6px;font-size:18px">Enable one-click auto-paste</h2>
    <p style="color:var(--muted);margin:0 0 14px">
      Install this small userscript with <b>Tampermonkey</b> or <b>Violentmonkey</b>. After that,
      <b>Open in TradingView</b> will open the Pine Editor, paste your code and click <b>Add to chart</b> for you.
    </p>

    <h3 style="font-size:14px;margin:16px 0 6px">Option A — Paste into Tampermonkey (recommended)</h3>
    <ol style="color:var(--muted);padding-left:20px;margin:6px 0">
      <li>Click <b>Copy userscript</b> below.</li>
      <li>Open the Tampermonkey dashboard → click <b>+</b> → <b>Create a new script</b>.</li>
      <li>Select all in the editor, paste, and save with <kbd>Ctrl/Cmd+S</kbd>.</li>
      <li>Reload this page — you'll see the <b>Auto-paste on</b> badge.</li>
    </ol>

    <h3 style="font-size:14px;margin:16px 0 6px">Option B — Download and install</h3>
    <p style="color:var(--muted);margin:6px 0">
      Save the file, then double-click it, or drag it into the Tampermonkey dashboard.
    </p>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:16px 0">
      <button class="primary" data-act="copy">Copy userscript</button>
      <button data-act="download">Download .user.js</button>
      <button data-act="close">Close</button>
    </div>

    <p style="color:var(--muted);margin:8px 0 0;font-size:13px">
      Direct link to the hosted file (works if it exists on your site):
      <a href="${HELPER_URL}" target="_blank" rel="noopener">${HELPER_URL}</a>
    </p>

    <details style="margin-top:10px">
      <summary style="color:var(--muted);cursor:pointer;font-size:13px">Show userscript source</summary>
      <pre data-role="code" style="max-height:300px;overflow:auto;margin-top:8px"></pre>
    </details>
  `;

  const codeEl = modal.querySelector('[data-role="code"]');
  codeEl.textContent = USERSCRIPT_SRC;

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  modal.addEventListener('click', async e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'close') return close();
    if (act === 'copy') {
      const ok = await copy(USERSCRIPT_SRC);
      toast(ok ? 'Copied — paste it into Tampermonkey' : 'Copy failed — use “Show userscript source”');
    }
    if (act === 'download') {
      const blob = new Blob([USERSCRIPT_SRC], { type: 'application/javascript;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'pine-vault-autopaste.user.js';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('Downloaded — double-click it or drag into Tampermonkey');
    }
  });

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

/* ---------------- rendering ---------------- */
function renderList() {
  const f = $('q').value.toLowerCase().trim(), L = $('list');
  L.innerHTML = '';
  const shown = items.filter(i =>
    !f || i.name.toLowerCase().includes(f) || i.tags.some(t => t.toLowerCase().includes(f))
  );
  if (!shown.length) L.append(el('p', { className: 'muted', textContent: 'No indicators found.' }));
  shown.forEach(i => {
    const d = el('div', {
      className: 'item' + (i.id === sel ? ' active' : ''),
      onclick: () => { sel = i.id; editing = false; render(); }
    }, el('b', { textContent: i.name }));
    i.tags.forEach(t => d.append(el('span', { className: 'tag', textContent: t })));
    L.append(d);
  });
}

function renderView() {
  const v = $('view');
  v.innerHTML = '';
  if (editing) return renderForm(v);

  const i = items.find(x => x.id === sel);
  if (!i) {
    v.append(el('p', { className: 'muted', textContent: 'Add your first indicator to get started.' }));
    return;
  }

  v.append(
    el('h2', { textContent: i.name, style: 'margin:0 0 4px' }),
    el('p', { className: 'muted', textContent: i.desc || 'No description.' })
  );

  const row = el('div', { className: 'row' },
    el('button', { className: 'primary', textContent: 'Open in TradingView', onclick: () => openInTradingView(i) }),
    ...(i.tv ? [el('button', { textContent: 'Open saved script', onclick: () => window.open(i.tv, '_blank', 'noopener') })] : []),
    el('button', { textContent: 'Copy code', onclick: async () => toast(await copy(i.code) ? 'Copied' : 'Copy failed') }),
    el('button', {
      textContent: 'Download .pine',
      onclick: () => {
        const a = el('a', {
          href: URL.createObjectURL(new Blob([i.code], { type: 'text/plain' })),
          download: i.name.replace(/[^\w-]+/g, '_') + '.pine'
        });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
    }),
    el('button', { textContent: 'Edit', onclick: () => { editing = true; render(); } }),
    el('button', {
      className: 'danger', textContent: 'Delete',
      onclick: () => {
        if (confirm('Delete “' + i.name + '”?')) {
          items = items.filter(x => x.id !== i.id);
          sel = items[0] ? items[0].id : null;
          save(); render();
        }
      }
    })
  );
  v.append(row);

  const hint = el('p', { className: 'hint' });
  hint.textContent = autoPaste
    ? 'Auto-paste is on: one click opens TradingView, pastes this code into the Pine Editor and clicks “Add to chart”.'
    : 'The code is copied to your clipboard while TradingView opens. Enable the helper (top of the page) for a fully automatic paste.';
  v.append(hint);

  const steps = el('ol');
  (autoPaste ? [
    'Stay logged in to TradingView in this browser.',
    '“Open in TradingView” opens the Pine Editor, pastes the code and adds it to the chart for you.',
    'Nothing is saved or published — the script stays private to you.'
  ] : [
    'Stay logged in to TradingView in this browser.',
    'Click “Open in TradingView”: a new tab opens and the code is copied to your clipboard.',
    'Paste it into the Pine Editor (Ctrl/Cmd+V) and click “Add to chart”.',
    'Want it fully automatic? Install the helper once, reload this page, and the paste happens for you.'
  ]).forEach(s => steps.append(el('li', { textContent: s })));
  v.append(steps, el('pre', { textContent: i.code }));
}

function renderForm(v) {
  const i = items.find(x => x.id === sel) || { name: '', desc: '', tags: [], code: '//@version=6\\nindicator("My Indicator", overlay=true)\\n' };
  const n = el('input', { value: i.name, placeholder: 'Indicator name' });
  const d = el('input', { value: i.desc, placeholder: 'Short description' });
  const t = el('input', { value: i.tags.join(', '), placeholder: 'trend, momentum, volume' });
  const tv = el('input', { value: i.tv || '', placeholder: 'https://www.tradingview.com/pine/?id=USER%3B… or just USER;…' });
  const c = el('textarea', { value: i.code, spellcheck: false });

  c.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = c.selectionStart;
      c.setRangeText('    ', s, c.selectionEnd, 'end');
    }
  });

  v.append(
    el('label', { textContent: 'Name' }), n,
    el('label', { textContent: 'Description' }), d,
    el('label', { textContent: 'Tags (comma separated)' }), t,
    el('label', { textContent: 'TradingView saved-script link or ID (optional, opens the script directly)' }), tv,
    el('label', { textContent: 'Pine Script code' }), c,
    el('div', { className: 'row' },
      el('button', {
        className: 'primary', textContent: 'Save',
        onclick: () => {
          if (!n.value.trim()) return toast('Name is required');
          const rec = {
            id: items.find(x => x.id === sel) ? sel : 'i' + Date.now(),
            name: n.value.trim(),
            desc: d.value.trim(),
            tags: t.value.split(',').map(s => s.trim()).filter(Boolean),
            code: c.value,
            tv: normTv(tv.value),
            updated: Date.now()
          };
          const idx = items.findIndex(x => x.id === rec.id);
          idx >= 0 ? items[idx] = rec : items.unshift(rec);
          sel = rec.id; editing = false; save(); render(); toast('Saved');
        }
      }),
      el('button', { textContent: 'Cancel', onclick: () => { editing = false; render(); } })
    )
  );
}

function render() { renderList(); renderView(); }

/* ---------------- events ---------------- */
document.addEventListener('pinevault:ready', () => { refreshAutoPaste(); render(); });

$('q').oninput = renderList;

$('new').onclick = () => { sel = null; editing = true; render(); };

$('exp').onclick = () => {
  const a = el('a', {
    href: URL.createObjectURL(new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' })),
    download: 'pine-vault-backup.json'
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

$('imp').onclick = () => $('file').click();

$('us').onclick = () => {
  if (autoPaste) return toast('Auto-paste helper is active — just click “Open in TradingView”.');
  showHelperModal();
};

$('banner-install').onclick = () => {
  if (autoPaste) return toast('Auto-paste helper is already active.');
  showHelperModal();
};

$('banner-dismiss').onclick = () => {
  try { localStorage.setItem('pinevault:setup-dismissed', '1'); } catch (e) {}
  $('banner').hidden = true;
};

$('file').onchange = async e => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(data)) throw 0;
    let n = 0;
    data.forEach(r => {
      const rec = normalize(r);
      if (!rec) return;
      const k = items.findIndex(x => x.id === rec.id);
      if (k >= 0) items[k] = rec; else items.push(rec);
      n++;
    });
    save(); render();
    toast(n ? `Imported ${n} indicator${n > 1 ? 's' : ''}` : 'Nothing to import');
  } catch (_) { toast('Invalid backup file'); }
  e.target.value = '';
};

/* ---------------- boot ---------------- */
refreshAutoPaste();
load();
render();
