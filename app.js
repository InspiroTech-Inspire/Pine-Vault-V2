/* Pine Vault — app.js */
const KEY = 'pinevault:v1';
const HELPER = 'pine-vault-autopaste.user.js?v=3';
const SEED = [{
  id: 's1',
  name: 'Example: EMA Cross',
  desc: 'Simple fast/slow EMA crossover. Replace me with your own scripts.',
  tags: ['trend', 'example'],
  code: '//@version=6\nindicator("EMA Cross", overlay=true)\nfast = ta.ema(close, 9)\nslow = ta.ema(close, 21)\nplot(fast, "Fast", color.new(color.teal, 0))\nplot(slow, "Slow", color.new(color.orange, 0))\nplotshape(ta.crossover(fast, slow), "Buy", shape.triangleup, location.belowbar, color.green)\nplotshape(ta.crossunder(fast, slow), "Sell", shape.triangledown, location.abovebar, color.red)\n',
  updated: Date.now()
}];

let items = [], sel = null, editing = false, autoPaste = false;
const $ = id => document.getElementById(id);

/* ---------------- one-click helper detection ---------------- */
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
  if (/^https:\/\/(www\.)?tradingview\.com\//i.test(s)) return s;
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
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
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

/* ---------------- the one click ---------------- */
function openInTradingView(i) {
  const p = copy(i.code);                          // start clipboard write inside the click gesture
  const w = window.open(tvUrl(i.code), '_blank');  // synchronous → popup blockers allow it
  if (!w) toast('Popup blocked — allow popups for this site, then try again');
  p.then(ok => {
    if (autoPaste) toast('TradingView opened — pasting your code…');
    else if (ok) toast('TradingView opened — code is on your clipboard, paste it in the Pine Editor');
    else toast('TradingView opened — use “Copy code”, then paste it in the Pine Editor');
  });
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
  const i = items.find(x => x.id === sel) || { name: '', desc: '', tags: [], code: '//@version=6\nindicator("My Indicator", overlay=true)\n' };
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
  window.open(HELPER, '_blank');
  toast('Install the helper, then reload this page');
};

$('banner-install').onclick = () => {
  window.open(HELPER, '_blank');
  toast('Install the helper, then reload this page');
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