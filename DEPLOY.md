# 交接说明（给接手的人 / anti-gravity）

线上：<https://xiwhash.github.io/asmr-online/m.html>

## 两个仓库

| 仓库 | 作用 |
|---|---|
| `xiwhash/asmr-site-src` | **源码**（本仓库）。src/* + covers + build.js + check.js |
| `xiwhash/asmr-online` | **部署产物**：index.html / m.html / player.html + subs/ + covers/，GitHub Pages 从这里出 |
| `xiwhash/asmr-audio-1 … asmr-audio-11` | 音频（opus），每个约 850MB 一换，同样开了 Pages |

## 本地构建

```bash
node build.js      # src/* → index.html / m.html / player.html（三份内容一致）
node check.js index.html   # 校验：4 个 script 块语法 + data 能 JSON.parse
```

`build.js` 里占位符替换必须用函数形式 `s.replace(key, () => val)`；用字符串会被 `$&`、`$1` 之类吃掉内容。

## 发布

```bash
# 方法一：git
git clone https://github.com/xiwhash/asmr-online.git
cp index.html m.html player.html asmr-online/
cd asmr-online && git add -A && git commit -m "deploy" && git push
# 然后到 Actions 手动跑一次 pages.yml（或用 API dispatch）

# 方法二：Contents API（我原来用的）
PUT /repos/xiwhash/asmr-online/contents/{m,index,player}.html   （base64）
POST /repos/xiwhash/asmr-online/actions/workflows/pages.yml/dispatches  {"ref":"main"}
```

只 dispatch **一次**：连发多个会被 concurrency 取消，只保留最后一个。

## 数据结构（src/data.json）

```js
{
  "works": [{
    "rj": "RJ01152082", "title": "…", "circle": "蒼悦",
    "cover": "covers/RJ01152082.jpg", "n": 6,
    "tracks": [{ "i": 0, "f": "https://xiwhash.github.io/asmr-audio-9/RJ01152082/000.opus", "n": "Tr1 …", "d": 817 }],
    "rs": 0, "ft": []          // 可选：根轨时长和 / 文件夹树
  }],
  "subs": { "RJ01152082/000": [{ "t": 3.38, "s": "这是何等的污秽啊…" }] }
}
```

- 字幕 key 是 `RJ/三位序号`，序号是 **tracks 数组下标**；加/删轨必须重排 key，否则字幕错位。
- `src/lists.json` 是服务器下发的列表（`我标记的` / `xie`），本地改动存 localStorage 的 `asmr_lists_v1`，合并规则在 `__lLoad`。

## 音频托管约定（重要）

- 一律用 **GitHub Pages 直链**：`https://xiwhash.github.io/<repo>/<RJ>/<NNN>.opus`
- 不要换 jsDelivr：仓库变大后会 `403 Package size exceeded the configured limit of 50 MB`，新文件还会 404
- 新建音频仓库后要单独开 Pages：`POST /repos/{owner}/{repo}/pages` `{"source":{"branch":"main","path":"/"}}`
- 播放器里 `__swapHost` 会在出错时 Pages ⇄ jsDelivr 换源重试一次

## app.js 关键点

| 位置 | 作用 |
|---|---|
| `renderHome / renderWork / renderLists / renderListWorks` | 四个视图，手写 innerHTML |
| `__autoPath` | 进作品自动钻到「SEあり / 本編 / mp3」那层 |
| `playTrack` | 换轨：重建 cur、`buildLyric()` 重置、标题同步、预热下一轨 |
| `__pfKick / __pfUrl` | 起播加速：fetch 成 Blob 缓存 2 条，>24MB 不缓存 |
| `centerLine` | 字幕居中用 rect 差值，**别用 offsetTop**（`.lrow` 的 offsetParent 是 `#full`） |
| 滑动快进 | 横移 >12px 且大于竖移 1.3 倍，`dur/700` 秒每像素，松手才 seek |
| `__lMove / openMoveSheet` | 列表移动（点一下=移到这里，长按=只加入） |
| `PiP` / `FloatSub` | 系统画中画 / 透明悬浮歌词 |
| `window.__nav` | 调试入口：`__nav.home() / work(rj) / play(rj,i) / full() / lists() / list(id) / L()` |

## 踩过的坑

1. 发布新作品别用 `works.unshift()` 逐条插 —— 插 N 次顺序反 N 次。
2. 下载字幕别用固定大小阈值（写过 `size > 4096`），1~4KB 的小 `.vtt` 会被当失败丢掉。
3. `含SE / 无SE` 双目录同名轨会互相覆盖，选目录要按完整路径分组。
4. `#full` 是 `position:fixed`，`.lrow` 的 offsetParent 是它，基于 offsetTop 的居中一定偏。
5. 别用 PowerShell `Set-Content -Encoding UTF8` 改这些 JS，会把中文二次编码、正则和转义报废。
6. 列表合并：按 id 或名字认同一个列表；顺序以服务器为准；删除/移动要记在 `removed`/`added` 里，否则刷新回弹。

## 测试（可选）

`E:\92629\Downloads\_pl\` 里有一套 puppeteer-core 脚本（用系统 Edge，headless）：
`test-flow.js`（列表顺序/返回）、`test-pages.js`（换源后能否播）、`test-v3.js`（移动 + 悬浮歌词）、`test-live-url.js`（线上健康检查）。
