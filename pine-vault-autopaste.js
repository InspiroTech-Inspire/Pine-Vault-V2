// ==UserScript==
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

  /* =========================================================================
     1) On the Pine Vault site: just announce that the helper is installed,
        so the site can show "Auto-paste on" and skip the setup banner.
     ========================================================================= */
  if (!/tradingview\.com$/i.test(location.hostname)) {
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

  /* =========================================================================
     2) On TradingView: read the code from the URL hash (or sessionStorage)
     ========================================================================= */
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

  /* =========================================================================
     3) On-screen status banner (with a manual "Copy code" button)
     ========================================================================= */
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

  /* =========================================================================
     4) Page helpers
     ========================================================================= */
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
        /pine editor|^\s*pine\s*$/i
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
    // last-resort DOM path
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
      if (v.replace(/\s+/g, '') === code.replace(/\s+/g, '')) return true;
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

  /* =========================================================================
     5) The automated flow
     ========================================================================= */
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
})();