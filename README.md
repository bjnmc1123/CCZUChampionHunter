# 赛事猎手 · site/（S-网页 独占）

纯静态报表 + 本地服务 + 8443 TLS 反代 + 樱花穿透。页面数据全部来自 `../tools/out/*.json`（只读），打包进 `data/data.js`，不手抄数字。

## 纯静态部署（GitHub → Vercel → 阿里云域名）

页面本身是纯静态：`index.html` + `app.js` + `style.css` + `data/data.js`，没有 `/api/` 依赖，所有资源都是相对路径，双击 `index.html` 也能看。

**进仓库的文件**：`index.html`、`app.js`、`style.css`、`data/data.js`、`vercel.json`、`README.md`、`.gitignore`
**不进仓库**（见 `.gitignore`）：`serve.py`、`启动.cmd`、`更新并部署.cmd`、`make_cert.ps1`、`certs/`、`_smoke.js`、`_check_bundle.py`、`__pycache__/`

### 一次性上线步骤

1. GitHub 新建空仓库（公开/私有都行），把本目录推上去（仓库根目录 = 本目录）：
   ```
   git init && git add -A && git commit -m "init static site"
   git remote add origin <仓库地址>
   git branch -M main && git push -u origin main
   ```
2. Vercel：用 GitHub 登录 → **Add New → Project → Import** 该仓库 → Framework Preset 选 **Other** → Build Command / Output Directory **都留空**（根目录静态文件）→ Deploy。
3. 阿里云 DNS：给自己域名的子域加一条 **CNAME**，记录值 `cname.vercel-dns.com`（主机记录如 `sh`）。
4. Vercel 项目 → Settings → Domains → 添加 `sh.你的域名`，等验证通过（HTTPS 证书 Vercel 自动签）。

注意：
- `*.vercel.app` 国内基本打不开，绑自己的域名才有用。
- 域名解析到 Vercel 不需要备案；以后要走阿里云 CDN 才需要备案（约 20 个工作日）。

### 数据更新（静态部署后必须手动重新部署）

静态站的 `data/data.js` 是快照，不会自己变。改完 `../tools/out/` 的数据后：

1. 双击 `更新并部署.cmd`（= 用项目 venv 跑 `serve.py --bundle-only` 重打包 → `git add/commit` → `git push`）
2. Vercel 收到 push 自动重新部署，约 1 分钟生效

或者手动三步：`..\.venv\Scripts\python.exe serve.py --bundle-only` → `git commit -am "update data"` → `git push`。

> 本地动态版（`启动.cmd` + 樱花隧道）和静态版渲染的是同一套前端文件，区别只有：静态版没有 `/api/health`、没有 8443 反代、数据靠 push 更新。

## 双击入口

`启动.cmd`（双击）

1. `chcp 65001`，用项目 venv `..\.venv\Scripts\python.exe` 跑 `serve.py`
2. `serve.py` 把 `tools/out/` 6 份 json 打包成 `data/data.js`（页面因此双击 html 也能看）
3. 起 `http://127.0.0.1:8770/`（本地页面）
4. 起 `https://127.0.0.1:8443/`（自签证书；樱花节点拦明文，隧道必须走这个）
5. 拉起 `frpc.exe` 用 X 项目那条隧道，打印公网入口
6. 关窗口 = 停服务 + 反代 + frpc

参数：`启动.cmd --local` 只本地（不起 8443/穿透）；`--no-browser` 不自动开浏览器。

## 端口与路径

| 端口 | 用途 |
|---|---|
| 8770 | 赛事猎手页面（明文，本地看） |
| 8443 | TLS 反代（隧道映射的就是这个） |
| 8765 | X 项目台（上游，**不归本目录**，不碰） |
| 8766 | NoticeHub 在用（**不碰**） |

8443 反代分流：

- `/sh/…` → `127.0.0.1:8770`（赛事猎手，`/sh` 自动 301 到 `/sh/`）
- 其余 `/` → `127.0.0.1:8765`（X 项目台）
  - 先探测 8765 响应头 `X-Studio: xiaozhi-studio`；不是 X（没启动、或被别的程序占着）就返回提示页，不转发别人的内容。

## 文件

| 文件 | 说明 |
|---|---|
| `启动.cmd` | 唯一双击入口（英文内容，避免 cmd 解析 UTF-8 批处理的坑） |
| `serve.py` | 打包数据 + 8770 静态服务 + 8443 反代 + frpc 拉起与清理 |
| `index.html` / `style.css` / `app.js` | 单页报表：时间报表 / 可报清单 / 分值测算 / 快速入口 / 口径溯源 |
| `data/data.js` | 自动生成，**勿手改**；由 serve.py 从 tools/out 打包 |
| `certs/` | 自签证书（cert.pem / key.pem），`make_cert.ps1` 生成，有效期 10 年 |
| `make_cert.ps1` | 生成自签证书（Windows 自带 PowerShell 5.1，不依赖 openssl） |
| `vercel.json` | Vercel 静态部署配置（framework: null、cleanUrls、data.js 不缓存） |
| `.gitignore` | 只让静态站点文件进仓库；服务端/证书/测试脚本排除 |
| `更新并部署.cmd` | 双击 = 重打包 data.js → git commit → push（Vercel 自动重新部署） |

## 页面口径（2026-11-14 第 14 轮改版）

- **时间报表组内按日期升序**：每个状态分组内按「从今天起最近的截止」排，没有日期的排后面再按序号；不硬编码顺序。
- **轴点日期规则**：从今天起最近的官方截止（`reg` / `school` 等官方节点区间结束日里取最早一个 ≥ 今天，多批次取最近一批）→ 没有则取推算最早值 → 再没有则取最近的未来官方节点。所以 2 号大挑显示**院内 11-18**（不是学校 11-22）、47 蓝桥显示 **12-18**（不是最晚批次 2027-04-26）。
- 时间轴只放「可赶 / 下届待发」两类有日期的点；进行中、待补、已结束不上轴。
- **回到顶部**：右下角固定圆按钮（`.to-top`，44×44，科技蓝 `#0284C7` 白 ↑），滚动超过 400px 才加 `.show` 淡入（opacity + translateY，0.2s），点击 `window.scrollTo({top:0,behavior:'smooth'})`；`z-index:50` 低于抽屉的 60，抽屉打开时被盖住；窄屏 40×40、贴边 16px；页脚底部留 76px。
- **时间轴**（时间报表顶部）：今天 → 今天+365 天，12 个月份列（`2026·11` … `2027·10`），年份并入列头；点只写新序号，title 给名称/日期/来源；点击平滑滚动到对应行并高亮 2 秒（`jumpTo`）。
- **图例可筛选**：标题行右侧两个按钮（官方截止 / 推算时间），点击切换该类点显隐（`toggleSource` 重渲染，列内点数、空列、`aria-pressed` 同步），置灰 + 删除线表示已隐藏；只影响时间轴。图例圆点复用 `.tl-dot.off` / `.tl-dot.est`。「今天」用红色小块说明。
- 隐藏横向滚动条：`.tw / .tl-wrap / .drawer-body` 加 `scrollbar-width:none` + `::-webkit-scrollbar{display:none}`，滚动能力保留。
- 配色：顶部 `linear-gradient(135deg, #0EA5E9 → #0284C7 → #0369A1)` 科技蓝，白字；主色 `#0284C7`；C 档徽标青绿 `#0F766E`。
- 页面正文不放实现说明；数据来源与生成时间只在页脚一行小字。
- **序号重排**：可报 A/B/C 55 项 = 新序号 1—55（原 CSV 顺序）；D 档 59 项 = 56—114。明细保留「原序号」与 CSV 行号。
- 状态 5 类：可赶 / 进行中 / 已结束 / 待补 / 下届待发。官方优先；无官方可判按推算最早值判；`时间来源=estimated` 状态后贴「推算时间」标签；`single=true` → 下届待发。
- 可操作视图（时间报表 / 可报清单 / 测算）只列 A/B/C 55 项；D 只在统计卡的总表 / D 卡里可查。
- 节点/状态依据里的 Markdown `**` 在页面按纯文本显示（`plain()`）。
- `python serve.py --bundle-only`：只重新打包 `data/data.js`，不起服务。
- Ⅱ/Ⅲ 级：页面目前只有Ⅰ级 114 项；学校不公开发布 Ⅱ/Ⅲ 级名单，等 `tools/out` 有新数据再接。

## 纪律（别踩）

- 隧道凭据（访问密钥/隧道ID）在 `H:\Projects\Xiaozhi_learn\docs\pasw.txt`，**启动时现读**，不复制进 `site/`、不写日志、不打印。
- 隧道映射本机 8443。8443 被占用（X 的 `serve.py` 穿透模式）时本服务打印提示并退出，**不杀进程**。
- 8765/8766 被别的程序占着（NoticeHub），**不抢、不 taskkill**。
- 免费号上限 2 条隧道；X 那条是线上入口，**不新建、不改隧道**。
- 页面只读 tools/out；改数字去改 tools/ 的生成脚本，再重跑。

## 自检

```powershell
curl.exe -k -s -o NUL -w "local  %{http_code}`n" http://127.0.0.1:8770/
curl.exe -k -s -o NUL -w "tls    %{http_code}`n" https://127.0.0.1:8443/sh/
curl.exe -k -s -o NUL -w "x-root %{http_code}`n" https://127.0.0.1:8443/
curl.exe -k -s -o NUL -w "public %{http_code}`n" https://frp-dad.com:57328/sh/
```

`/api/health` 返回条数与数据包生成时间。

页面渲染自检（Node 本地跑 app.js + 最小 DOM 桩，不联网）：

```powershell
node _smoke.js          # 全部 PASS 即页面各视图渲染正常
python _check_bundle.py # 缺 json / json 坏 时打包应拒绝且不覆盖旧 data.js
```

启动时数据打包是**严格模式**：`tools/out/` 六份 json 缺任何一份或解析失败，打印是哪份并退出，不会拿旧 `data.js` 硬起。启动日志第一行形如：

```
数据打包：源目录 mtime 2026-11-12 20:51:04 ／ 生成时间 2026-11-12T20:51:04+08:00 ／ data.js 2026-11-12 20:59:52
```

## 已知限制

- 自签证书：浏览器首次打开公网地址会警告，点「继续前往」。
- X 项目台和本服务不能同时占 8443；本服务关闭后 X 才能按原方式启动穿透。
- 数据时间待补项（107 项）就是待补，不按往届推算；「推定」档位须核当届简章。
