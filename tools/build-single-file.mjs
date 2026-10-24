/* ProtoTweak - inline assets into a single offline HTML file.
 * Node.js built-ins only; no npm dependencies.
 *
 * Usage:
 *   node tools/build-single-file.mjs
 *   node tools/build-single-file.mjs --entry index.html --out dist/ProtoTweak.html
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.argv[1] ? path.dirname(process.argv[1]) : '.', '..');
const args = process.argv.slice(2);

function arg(name, fallback) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const entry = path.resolve(root, arg('--entry', 'index.html'));
const out = path.resolve(root, arg('--out', 'dist/ProtoTweak.html'));
const appDir = path.dirname(entry);

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function inlineCss(html, baseDir) {
  return html.replace(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/gi, (match, href) => {
    if (/^(https?:)?\/\//i.test(href)) throw new Error('External stylesheet is not allowed: ' + href);
    const file = path.resolve(baseDir, href);
    const css = read(file);
    return '<style data-pt-inlined="' + path.basename(file) + '">\n' + css + '\n</style>';
  });
}

function inlineScripts(html, baseDir) {
  return html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/gi, (match, src) => {
    if (/^(https?:)?\/\//i.test(src)) throw new Error('External script is not allowed: ' + src);
    const file = path.resolve(baseDir, src);
    let js = read(file);
    js = js.replace(/<\/script/gi, '<\\/script');
    return '<script data-pt-inlined="' + path.basename(file) + '">\n' + js + '\n</script>';
  });
}

if (!fs.existsSync(entry)) {
  console.error('Entry not found:', entry);
  process.exit(1);
}

let html = read(entry);
html = inlineCss(html, appDir);
html = inlineScripts(html, appDir);

const leftovers = [];
if (/<script\b[^>]*\bsrc=/i.test(html)) leftovers.push('script src');
if (/<link\b[^>]*rel="stylesheet"/i.test(html)) leftovers.push('stylesheet link');
if (leftovers.length) {
  console.error('Inlining failed, leftovers:', leftovers.join(', '));
  process.exit(1);
}

const stamp = new Date().toISOString();
const banner = '<!-- ProtoTweak single-file build - ' + stamp + ' -->\n';
if (!/^<!doctype/i.test(html.trim())) html = '<!doctype html>\n' + html;
html = html.replace(/^(<!doctype[^>]*>)/i, '$1\n' + banner);
html = html.replace('</head>', '<meta name="generator" content="ProtoTweak single-file build ' + stamp + '">\n</head>');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('Built:', out);
console.log('Size:', kb + ' KB');
console.log('Scripts inlined:', (html.match(/data-pt-inlined="/g) || []).length);
if (/https?:\/\/(?!www\.w3\.org)/i.test(html)) {
  console.log('Note: the page still contains user-content http(s) references.');
}
