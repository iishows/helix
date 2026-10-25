# 实例模式（Chrome 式多开）

一套安装包跑多个实例：每个实例 = **一个目录 + 一个名称 + 一个 logo**，应用启动时读它即为品牌。
新增实例**不需要重新构建**。

## 1. 建实例

**应用内**：侧边栏底部的头像按钮 → 「管理 Profile」→「添加 Profile」，可填名称、选图标、
勾选「从当前 Profile 复制凭据与设置」（不复制会话历史），也可直接建桌面快捷方式。

**命令行**：

```bash
node tools/instance/create-instance.mjs --name 工作 --logo D:\pic\work.png
node tools/instance/create-instance.mjs --name 个人 --logo D:\pic\me.png --accent "#12A594"
```

参数：`--name`(必填) `--logo`(必填) `--dir`(父目录，默认 `%APPDATA%\Helix\profiles`)
`--accent`(品牌色) `--app`(安装目录) `--no-shortcut`。

产出：

```
%APPDATA%\Helix\profiles\工作\
  instance.json     { "name": "工作", "logo": "logo.png", "accent": "#E5484D" }
  logo.png          你给的图
  logo.ico          自动生成，供快捷方式与任务栏图标
  data\             数据目录（CLAUDE_CONFIG_DIR）
  electron\         Electron 缓存/存储（--user-data-dir）
```

并在桌面建好快捷方式（图标 = 该实例 logo）。GUI 与命令行共用同一目录，看到同一份列表。

## 1.1 列表首位的「默认」Profile

不带 `--instance` 启动的那个状态在列表里显示为 **默认**。它的数据目录是 Claude Code 的共享配置
目录（如 `~/.claude`），**不只属于本应用**（终端里的 CLI、claude-code-router 也读它），
因此只登记、**不可改名或删除**；其数据也不会被搬到 `profiles/` 下。

## 2. 启动 / 运维

```powershell
# 启动全部实例
powershell -File tools/ps/instances.ps1 -Action start -Root "$env:APPDATA\Helix\profiles"

# 列出
powershell -File tools/ps/instances.ps1 -Action list -Root "$env:APPDATA\Helix\profiles"

# 停止（只关实例，绝不动默认实例）
powershell -File tools/ps/instances.ps1 -Action stop -Root "$env:APPDATA\Helix\profiles"

# 截图各实例窗口（供核验）
powershell -File tools/ps/instances.ps1 -Action shot -Root "$env:APPDATA\Helix\profiles"

# 给某个实例补桌面快捷方式
powershell -File tools/ps/instances.ps1 -Action shortcut -Root "$env:APPDATA\Helix\profiles" -Name 工作
```

排查窗口状态时用 `tools/ps/helix-windows.ps1`：它按 PID 列出每个 Helix 进程的实例标识与窗口标题，
用来区分「原实例（无 `--instance`）」与各 profile。

也可直接启动：

```
"D:\...\Helix.exe" --instance="D:\instances\工作"
```

**不带 `--instance` 启动时行为与改造前一致**（单实例、使用构建期固化的默认品牌）。

## 3. 品牌随实例生效的位置

| 位置 | 说明 |
|---|---|
| 窗口标题 / 任务栏悬停 / Alt-Tab | 实例名称 |
| 侧边栏 logo | 实例 logo |
| 侧边栏字标、About 页标题 | 实例名称 |
| 系统通知标题 | 实例名称 |
| 品牌强调色（`--cc-ac` 全族） | 实例 accent |
| 窗口/托盘图标、任务栏按钮 | 实例 `logo.ico` |
| Windows AppUserModelID | 由实例目录派生，任务栏/通知按实例分组 |
| 数据目录、端口、Electron 缓存 | 各实例独立 |

## 4. 实现要点（改代码时注意）

- **品牌载荷走 `additionalArguments` 同步注入**：渲染层 sandbox 开启，preload 读不了文件；
  而 About 页的仓库链接等是**模块级常量**，必须在 renderer 模块加载时就位，所以名称/强调色
  用命令行同步传入（见 `desktop/electron/services/instance.ts` 的 `buildBrandArgv`、
  `desktop/electron/preload.ts`）。
- **logo 走 IPC 异步取 data URL**：命令行在 Windows 有长度上限，大图会被截断；
  renderer CSP 已允许 `img-src data:`。挂载前在 `desktop/src/main.tsx` 里取回。
- **品牌色要改一整族变量**：主题把强调色拆成 `--cc-ac / -ac2 / -soft / -soft-hover / -border / -ink / -ac-rgb`，
  只改 `--cc-ac` 会留下一圈默认赤陶色。见 `desktop/src/brand/runtime.ts` 的 `applyBrandAccent`。
- **`stop` 必须按进程树清理**：渲染/GPU 子进程命令行里没有 `--instance`，需按 `--user-data-dir`
  与父子关系连带清理，否则残留进程会锁住 `dist-brands` 里的文件，导致下次构建 EPERM 失败。
- 品牌解析入口是 `desktop/src/brand/runtime.ts`（不是 `generated.ts`）；`generated.ts` 是构建期
  生成的**默认品牌**，实例模式在其之上覆盖。
- **`electron/ipc/capabilities.ts` 不能 import `node:path`**（或任何 `node:` 内置模块）。
  该模块会被打进**沙箱 preload**，而沙箱 preload 里 `require("node:path")` 会直接抛错，
  导致整个 preload 加载失败 → `window.desktopHost` 不存在 → 应用卡在启动错误页
  （表现为「本地服务启动失败 / API error 404」，且窗口标题回退成产品名）。
  新增 IPC 频道校验时，路径判断请用正则自写。
- **profiles 根目录不能用 `app.getPath('userData')`**，也不能用 `app.getName()`：
  实例模式下 `applyInstanceBootstrap` 会把 userData 改成 `<实例>\electron`、
  把 name 改成实例名。应使用**烘焙的产品名**（`BRAND.productName`）拼
  `%APPDATA%\<产品名>\profiles`，见 `desktop/electron/services/profiles.ts` 的 `profilesRoot`。
