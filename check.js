// 校验单文件页面：脚本块语法 + 内联目录可解析 + 拆分出的字幕文件齐全
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const f = process.argv[2] || 'index.html';
const h = fs.readFileSync(f, 'utf8');
let pos = 0, n = 0, bad = 0;
for (;;) {
  const s = h.indexOf('<script', pos);
  if (s < 0) break;
  const o = h.indexOf('>', s);
  const e = h.indexOf('</script>', o);
  n++;
  try { new vm.Script(h.slice(o + 1, e)); } catch (err) { bad++; console.log('block' + n, 'FAIL', err.message.slice(0, 80)); }
  pos = e + 9;
}
const i = h.indexOf('{"works"');
let k = i, d = 0, inS = false, es = false;
for (; k < h.length; k++) {
  const c = h[k];
  if (inS) { if (es) es = false; else if (c === '\\') es = true; else if (c === '"') inS = false; }
  else { if (c === '"') inS = true; else if (c === '{') d++; else if (c === '}') { d--; if (d === 0) { k++; break; } } }
}
let D = null;
try { D = JSON.parse(h.slice(i, k)); } catch (e) { console.log('data FAIL', e.message.slice(0, 90)); }
let tracks = 0, missing = 0;
if (D) {
  const dir = path.join(path.dirname(path.resolve(f)), 'subs');
  for (const rj of Object.keys(D.subv || {})) {
    const fp = path.join(dir, rj + '.json');
    if (!fs.existsSync(fp)) { missing++; continue; }
    try { tracks += Object.keys(JSON.parse(fs.readFileSync(fp, 'utf8'))).length; } catch (e) { missing++; }
  }
}
console.log(f, '| script 块', n, '失败', bad, '| 字节', Buffer.byteLength(h),
  '| 作品', D ? D.works.length : '-', '| 字幕文件', D ? Object.keys(D.subv || {}).length : '-',
  '| 字幕轨', tracks, '| 缺失', missing);
process.exitCode = bad || !D || missing ? 1 : 0;
