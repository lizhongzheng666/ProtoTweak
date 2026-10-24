/* ProtoTweak — resilient annotation anchors */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  const SKIP_CLASS = /^(active|selected|hover|focus|open|show|visible|in-view|is-|has-|pt-|__pt|wb-|__wb|fade|reveal|animate)/i;
  const LEGACY_AID_ATTR = 'data-wb-aid';
  const MAX_TEXT = 160;

  function docNow() {
    return PT.stage && PT.stage.getDoc();
  }

  function stableClasses(el) {
    if (!el || !el.classList) return [];
    return Array.from(el.classList)
      .filter((c) => c && c.length <= 48 && !SKIP_CLASS.test(c) && !/[^a-zA-Z0-9_-]/.test(c))
      .slice(0, 3);
  }

  function uniqueId(el) {
    if (!el || !el.id) return false;
    const d = docNow();
    if (!d) return false;
    if (el.id.indexOf('__pt') === 0 || el.id.indexOf('pt-') === 0 ||
        el.id.indexOf('__wb') === 0 || el.id.indexOf('wb-') === 0) return false;
    try {
      const list = d.querySelectorAll('#' + Core.cssEscape(el.id));
      return list.length === 1;
    } catch (e) {
      return false;
    }
  }

  function generateSelector(el) {
    const d = docNow();
    if (!d || !el || el.nodeType !== 1) return '';
    if (el === d.documentElement) return 'html';
    if (el === d.body) return 'body';
    if (uniqueId(el)) return '#' + Core.cssEscape(el.id);

    const parts = [];
    let cur = el;
    let guard = 0;
    while (cur && cur.nodeType === 1 && cur !== d.documentElement && guard++ < 40) {
      if (cur === d.body) {
        parts.unshift('body');
        break;
      }
      if (cur !== el && uniqueId(cur)) {
        parts.unshift('#' + Core.cssEscape(cur.id));
        break;
      }
      let part = cur.tagName.toLowerCase();
      const classes = stableClasses(cur);
      if (classes.length) part += '.' + classes.map((c) => Core.cssEscape(c)).join('.');
      const parent = cur.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
        if (sameTag.length > 1) part += ':nth-of-type(' + (sameTag.indexOf(cur) + 1) + ')';
      }
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function textSnapshot(el) {
    if (!el) return '';
    return Core.normalizeText(el.textContent || el.getAttribute('aria-label') || el.getAttribute('alt') || '').slice(0, MAX_TEXT);
  }

  function ancestorTrail(el) {
    const d = docNow();
    const trail = [];
    let cur = el ? el.parentElement : null;
    let guard = 0;
    while (cur && cur !== d.documentElement && guard++ < 6) {
      let sig = cur.tagName.toLowerCase();
      if (cur.id) sig += '#' + cur.id;
      else {
        const cls = stableClasses(cur);
        if (cls.length) sig += '.' + cls[0];
      }
      trail.push(sig);
      cur = cur.parentElement;
    }
    return trail;
  }

  function indexAmongSiblings(el) {
    if (!el || !el.parentElement) return 0;
    return Array.from(el.parentElement.children).filter((c) => c.tagName === el.tagName).indexOf(el);
  }

  function fingerprint(el) {
    if (!el) return {};
    const rect = PT.stage && PT.stage.isReady() ? PT.stage.docRect(el) : null;
    const attrs = {};
    ['name', 'type', 'href', 'src', 'alt', 'role'].forEach((name) => {
      const v = el.getAttribute && el.getAttribute(name);
      if (v) attrs[name] = String(v).slice(0, 180);
    });
    return {
      tag: el.tagName ? el.tagName.toLowerCase() : '',
      id: el.id || '',
      classes: stableClasses(el),
      text: textSnapshot(el),
      ancestorTrail: ancestorTrail(el),
      index: indexAmongSiblings(el),
      rect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) } : null,
      attrs
    };
  }

  function ensureAid(el) {
    if (!el) return '';
    let aid = el.getAttribute('data-pt-aid');
    const legacyAid = el.getAttribute(LEGACY_AID_ATTR);
    if (!aid && legacyAid) {
      // Migrate the old editor attribute in place; keep the same aid value so
      // old annotation JSON still resolves through anchor.aid.
      aid = legacyAid;
      el.setAttribute('data-pt-aid', legacyAid);
    }
    if (aid) {
      if (legacyAid) el.removeAttribute(LEGACY_AID_ATTR);
      return aid;
    }
    const d = docNow();
    let candidate = '';
    do {
      candidate = 'pt-a-' + Core.shortId();
    } while (d && (d.querySelector('[data-pt-aid="' + candidate.replace(/"/g, '\\"') + '"]') ||
      d.querySelector('[' + LEGACY_AID_ATTR + '="' + candidate.replace(/"/g, '\\"') + '"]')));
    el.setAttribute('data-pt-aid', candidate);
    return candidate;
  }

  function queryByAid(aid, d) {
    if (!aid) return null;
    const doc = d || docNow();
    if (!doc) return null;
    const value = String(aid).replace(/"/g, '\\"');
    try {
      const current = doc.querySelector('[data-pt-aid="' + value + '"]');
      if (current) return current;
      return doc.querySelector('[' + LEGACY_AID_ATTR + '="' + value + '"]');
    } catch (e) {
      return null;
    }
  }

  function querySelectorAllSafe(selector, d) {
    if (!selector) return [];
    const doc = d || docNow();
    if (!doc) return [];
    try { return Array.from(doc.querySelectorAll(selector)); } catch (e) { return []; }
  }

  function score(el, fp) {
    if (!el || !fp) return -Infinity;
    let s = 0;
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (fp.tag && tag !== fp.tag) return -Infinity;
    const text = textSnapshot(el);
    let textMatched = false;
    if (fp.text) {
      if (text === fp.text) { s += 70; textMatched = true; }
      else if (text.indexOf(fp.text) === 0) { s += 46; textMatched = true; }
      else if (text.indexOf(fp.text) !== -1) { s += 26; textMatched = true; }
      else if (fp.text.indexOf(text) === 0 && text.length > 6) { s += 14; textMatched = true; }
      else s -= 36;
    } else {
      textMatched = true;
    }
    if (fp.id && el.id === fp.id) s += 28;
    const classes = stableClasses(el);
    const classHits = (fp.classes || []).filter((c) => classes.indexOf(c) !== -1).length;
    s += classHits * 9;
    const trail = ancestorTrail(el);
    const trailHits = (fp.ancestorTrail || []).filter((sig) => trail.indexOf(sig) !== -1).length;
    s += trailHits * 7;
    if (indexAmongSiblings(el) === fp.index) s += 8;
    if (fp.rect) {
      const r = PT.stage && PT.stage.isReady() ? PT.stage.docRect(el) : null;
      if (r) {
        const dx = (r.x + r.w / 2) - (fp.rect.x + fp.rect.w / 2);
        const dy = (r.y + r.h / 2) - (fp.rect.y + fp.rect.h / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        s += Math.max(0, 18 - dist / 80);
      }
    }
    if (fp.attrs) {
      Object.keys(fp.attrs).forEach((name) => {
        const v = el.getAttribute && el.getAttribute(name);
        if (v && v === fp.attrs[name]) s += 7;
      });
    }
    if (!textMatched && fp.text) s -= 20;
    return s;
  }

  function resolve(annotation, d) {
    if (!annotation) return null;
    const doc = d || docNow();
    if (!doc) return null;
    const anchor = annotation.anchor || {};
    const aid = anchor.aid || annotation.aid;
    const byAid = queryByAid(aid, doc);
    if (byAid && byAid.isConnected) return byAid;

    const selector = annotation.selector || anchor.selector || '';
    const candidates = querySelectorAllSafe(selector, doc);
    if (candidates.length) {
      let best = null;
      let bestScore = -Infinity;
      candidates.forEach((el) => {
        const sc = score(el, anchor);
        if (sc > bestScore) { bestScore = sc; best = el; }
      });
      const threshold = anchor.text ? 34 : 18;
      if (best && bestScore >= threshold) return best;
    }

    if (anchor.tag) {
      const pool = querySelectorAllSafe(anchor.tag, doc);
      let best = null;
      let bestScore = -Infinity;
      pool.forEach((el) => {
        const sc = score(el, anchor);
        if (sc > bestScore) { bestScore = sc; best = el; }
      });
      if (best && bestScore >= 40) return best;
    }
    return null;
  }

  function elementLabel(el) {
    if (!el || el.nodeType !== 1) return '';
    let out = el.tagName.toLowerCase();
    if (el.id) out += '#' + el.id;
    else {
      const cls = stableClasses(el);
      if (cls.length) out += '.' + cls[0];
    }
    return out;
  }

  function elementPath(el) {
    const d = docNow();
    if (!d || !el) return '';
    const parts = [];
    let cur = el;
    let guard = 0;
    while (cur && cur.nodeType === 1 && cur !== d.documentElement && guard++ < 8) {
      let p = cur.tagName.toLowerCase();
      if (cur.id) p += '#' + cur.id;
      else {
        const cls = stableClasses(cur);
        if (cls.length) p += '.' + cls[0];
      }
      parts.unshift(p);
      if (cur === d.body) break;
      cur = cur.parentElement;
    }
    return parts.join(' › ');
  }

  function selectorFromElement(el) {
    return generateSelector(el);
  }

  PT.anchors = {
    generateSelector,
    selectorFromElement,
    textSnapshot,
    fingerprint,
    ensureAid,
    queryByAid,
    resolve,
    elementLabel,
    elementPath,
    stableClasses,
    score
  };
})();
