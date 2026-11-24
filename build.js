// 把 src/* 组装成单文件页面（index.html / m.html / player.html）
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const R = (p) => fs.readFileSync(path.join(ROOT, 'src', p), 'utf8');
const strip = (code) => code.replace(/^\s*<script>/,'').replace(/<\/script>\s*$/,'');

const tpl = R('index.template.html');
const css = R('style.css').trim();
const boot = strip(R('boot.js')).trim();
const app = strip(R('app.js')).trim();
const data = R('data.json').trim();
const lists = R('lists.json').trim();

const html = tpl
  .replace('{{CSS}}', () => '<style>\n' + css + '\n</style>')
  .replace('{{BOOT}}', () => '<script>\n' + boot + '\n</script>')
  .replace('{{DATA}}', () => '<script>\nwindow.__DATA__ = ' + data + ';\n</script>')
  .replace('{{LISTS}}', () => '<script>\nwindow.__LISTS__ = ' + lists + ';\n</script>')
  .replace('{{APP}}', () => '<script>\n' + app + '\n</script>');

for (const f of ['index.html', 'm.html', 'player.html']) {
  fs.writeFileSync(path.join(ROOT, f), html, 'utf8');
  console.log('built', f, html.length, 'chars');
}
