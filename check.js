// 校验单文件页面：脚本块语法 + 数据可解析
const fs = require('node:fs');
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
console.log(f, '| script 块', n, '失败', bad, '| 字节', Buffer.byteLength(h), '| 作品', D ? D.works.length : '-', '| 字幕', D ? Object.keys(D.subs).length : '-');
process.exitCode = bad || !D ? 1 : 0;
