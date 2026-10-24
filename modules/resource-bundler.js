/* ProtoTweak — bundle static folder resources into self-contained HTML */
(function () {
  'use strict';

  const PT = window.PT;
  const MAX_ASSET = 4 * 1024 * 1024;
  const cache = new Map();

  function normalize(path) {
    return String(path || '').replace(/^\/+/, '').replace(/\\/g, '/');
  }

  function resolvePath(basePath, ref) {
    if (!ref || /^(https?:|data:|blob:|mailto:|tel:|#|\/\/)/i.test(ref)) return '';
    try {
      const url = new URL(ref, 'https://prototweak.local/' + normalize(basePath));
      return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    } catch (e) {
      return '';
    }
  }

  function findAsset(assets, path) {
    if (!path) return null;
    const target = normalize(path);
    if (assets.has(target)) return assets.get(target);
    const lower = target.toLowerCase();
    for (const [key, value] of assets) {
      if (key.toLowerCase() === lower) return value;
    }
    return null;
  }

  function readText(file) {
    if (file.text) return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('read failed'));
      reader.readAsText(file, 'utf-8');
    });
  }

  function readDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('read failed'));
      reader.readAsDataURL(file);
    });
  }

  async function dataUrlFor(file) {
    if (!file || file.size > MAX_ASSET) return '';
    if (cache.has(file)) return cache.get(file);
    try {
      const value = await readDataUrl(file);
      cache.set(file, value);
      return value;
    } catch (e) {
      return '';
    }
  }

  async function inlineCss(css, cssPath, assets, depth) {
    if (!css || depth > 4) return css || '';
    let out = css;

    // Static @import (best effort, one level at a time).
    const importRe = /@import\s+(?:url\(\s*)?['"]?([^'")\s]+)['"]?\s*\)?\s*;?/gi;
    const imports = [];
    out.replace(importRe, (m, ref) => { imports.push({ m, ref }); return m; });
    for (const item of imports) {
      const path = resolvePath(cssPath, item.ref);
      const asset = findAsset(assets, path);
      if (!asset) continue;
      try {
        const nested = await readText(asset);
        out = out.replace(item.m, await inlineCss(nested, path, assets, depth + 1));
      } catch (e) { /* ignore */ }
    }

    const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
    const replacements = [];
    out.replace(urlRe, (m, quote, ref) => { replacements.push({ m, ref }); return m; });
    for (const item of replacements) {
      const path = resolvePath(cssPath, item.ref);
      const asset = findAsset(assets, path);
      if (!asset) continue;
      const data = await dataUrlFor(asset);
      if (data) out = out.split(item.m).join('url("' + data + '")');
    }
    return out;
  }

  async function inlineStyleAttr(value, basePath, assets) {
    if (!value || value.indexOf('url(') === -1) return value;
    return inlineCss(value, basePath, assets, 0);
  }

  async function inlineSrcset(value, basePath, assets) {
    if (!value) return value;
    const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
    const mapped = [];
    for (const part of parts) {
      const bits = part.split(/\s+/);
      const data = await dataUrlFor(findAsset(assets, resolvePath(basePath, bits[0])));
      if (data) {
        bits[0] = data;
        mapped.push(bits.join(' '));
      }
    }
    return mapped.length ? mapped.join(', ') : value;
  }

  async function bundle(html, htmlPath, fileRecords) {
    const assets = new Map();
    for (const record of fileRecords || []) {
      if (record && record.file) assets.set(normalize(record.path), record.file);
    }

    let doc;
    try {
      doc = new DOMParser().parseFromString(html, 'text/html');
    } catch (e) {
      return html;
    }
    const basePath = normalize(htmlPath);

    const links = Array.from(doc.querySelectorAll('link[href]'));
    for (const link of links) {
      const rel = (link.getAttribute('rel') || '').toLowerCase();
      const href = link.getAttribute('href') || '';
      const path = resolvePath(basePath, href);
      const asset = findAsset(assets, path);
      if (!asset) continue;
      if (rel.indexOf('stylesheet') !== -1) {
        try {
          const css = await readText(asset);
          const style = doc.createElement('style');
          style.setAttribute('data-pt-bundled', 'css');
          style.textContent = await inlineCss(css, path, assets, 0);
          link.replaceWith(style);
        } catch (e) { /* ignore */ }
      } else if (rel.indexOf('icon') !== -1) {
        const data = await dataUrlFor(asset);
        if (data) link.setAttribute('href', data);
      }
    }

    const styles = Array.from(doc.querySelectorAll('style'));
    for (const style of styles) {
      style.textContent = await inlineCss(style.textContent || '', basePath, assets, 0);
    }

    const styled = Array.from(doc.querySelectorAll('[style]'));
    for (const el of styled) {
      const value = el.getAttribute('style') || '';
      if (value.indexOf('url(') !== -1) el.setAttribute('style', await inlineStyleAttr(value, basePath, assets));
    }

    const scripts = Array.from(doc.querySelectorAll('script[src]'));
    for (const script of scripts) {
      const path = resolvePath(basePath, script.getAttribute('src') || '');
      const asset = findAsset(assets, path);
      if (!asset) continue;
      try {
        const js = (await readText(asset)).replace(/<\/script/gi, '<\\/script');
        script.removeAttribute('src');
        script.textContent = js;
      } catch (e) { /* ignore */ }
    }

    const media = Array.from(doc.querySelectorAll('img[src], source[src], video[poster], audio[src]'));
    for (const el of media) {
      const attr = el.hasAttribute('src') ? 'src' : 'poster';
      const path = resolvePath(basePath, el.getAttribute(attr) || '');
      const data = await dataUrlFor(findAsset(assets, path));
      if (data) el.setAttribute(attr, data);
    }

    const srcsets = Array.from(doc.querySelectorAll('[srcset]'));
    for (const el of srcsets) {
      const value = el.getAttribute('srcset') || '';
      const mapped = await inlineSrcset(value, basePath, assets);
      if (mapped !== value) el.setAttribute('srcset', mapped);
    }

    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  }

  PT.bundler = { bundle };
})();
