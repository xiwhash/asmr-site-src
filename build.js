// 把 src/* 组装成单文件页面（index.html / m.html / player.html）
// 字幕按作品拆到 subs/<RJ>.json，页面只内联作品目录（约 120KB），播放时按需加载字幕。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const R = (p) => fs.readFileSync(path.join(ROOT, 'src', p), 'utf8');
const strip = (code) => code.replace(/^\s*<script>/,'').replace(/<\/script>\s*$/,'');

const tpl = R('index.template.html');
const css = R('style.css').trim();
const boot = strip(R('boot.js')).trim();
const app = strip(R('app.js')).trim();
const D = JSON.parse(R('data.json'));
const lists = R('lists.json').trim();

/* ---- 字幕拆分 ---- */
const SUBS_DIR = path.join(ROOT, 'subs');
fs.rmSync(SUBS_DIR, { recursive: true, force: true });
fs.mkdirSync(SUBS_DIR, { recursive: true });
const perWork = {};
for (const key of Object.keys(D.subs || {})) {
  const [rj, idx] = key.split('/');
  (perWork[rj] = perWork[rj] || {})[idx] = D.subs[key];
}
const subv = {};
let subBytes = 0;
for (const rj of Object.keys(perWork).sort()) {
  const body = JSON.stringify(perWork[rj]);
  fs.writeFileSync(path.join(SUBS_DIR, rj + '.json'), body, 'utf8');
  subv[rj] = crypto.createHash('sha1').update(body).digest('hex').slice(0, 8);
  subBytes += Buffer.byteLength(body);
}
const inlineData = JSON.stringify({ works: D.works, subs: {}, subv });

const html = tpl
  .replace('{{CSS}}', () => '<style>\n' + css + '\n</style>')
  .replace('{{BOOT}}', () => '<script>\n' + boot + '\n</script>')
  .replace('{{DATA}}', () => '<script>\nwindow.__DATA__ = ' + inlineData + ';\n</script>')
  .replace('{{LISTS}}', () => '<script>\nwindow.__LISTS__ = ' + lists + ';\n</script>')
  .replace('{{APP}}', () => '<script>\n' + app + '\n</script>');

for (const f of ['index.html', 'm.html', 'player.html']) {
  fs.writeFileSync(path.join(ROOT, f), html, 'utf8');
  console.log('built', f, html.length, 'chars');
}
console.log('subs', Object.keys(subv).length, 'files,', subBytes, 'bytes ->', path.relative(ROOT, SUBS_DIR) + '/');
