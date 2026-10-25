# 品牌定制（白标）构建

一套配置驱动多品牌：**一份源码 + 每个品牌一份 `brand.json` → 各自独立的安装包**，
品牌名、logo、作者信息、社媒链接全部来自配置，不改代码。

## 快速开始

```bash
# 1. 复制示例品牌,改品牌名与作者
cp -r brands/helix brands/mybrand
# 编辑 brands/mybrand/brand.json,把 id 改成 mybrand

# 2. 放素材(路径相对 brands/mybrand/)
#    brand/mark.svg     侧边栏 logo(方形)
#    brand/icon.png     应用图标源图(>=512px,会自动切成各尺寸/ico/icns)
#    其它图标可直接引用仓库已有的 public/icons/*.svg

# 3. 校验配置(不写盘)
node tools/brand/apply.mjs mybrand --check

# 4. 构建(免安装目录 + NSIS 安装包)
node tools/brand/build.mjs mybrand

# 快速验证(只出免安装目录,最快)
node tools/brand/build.mjs mybrand --dir
```

产物：`desktop/dist-brands/<id>/`

## brand.json

完整字段见 `tools/brand/brand.schema.json`。最小示例：

```json
{
  "id": "mybrand",
  "productName": "MyBrand",
  "appId": "com.mybrand.desktop",
  "logo": { "mark": "brand/mark.svg", "appIcon": "brand/icon.png" },
  "author": {
    "name": "你的名字",
    "github": "https://github.com/you",
    "social": [
      { "name": "Bilibili", "url": "https://space.bilibili.com/xxx", "label": "xxx", "icon": "icons/bilibili.svg" }
    ]
  },
  "repo": { "url": "https://github.com/you/mybrand", "label": "you/mybrand" }
}
```

`id` 必填且须与目录名一致。`productName` / `appId` 必填。

## 品牌影响哪些位置

| 位置 | 来源字段 |
|---|---|
| 安装包名、快捷方式名、productName | `productName` |
| exe 名与内嵌图标/版本信息 | `productName` + `logo.appIcon` |
| 窗口标题（任务栏悬停/Alt-Tab） | `windowTitle`（缺省用 `productName`） |
| 侧边栏 logo | `logo.mark` |
| 侧边栏字标 | `productName`（或 `wordmarkSplit` 两段式） |
| About 页标题、作者、社媒链接、仓库 | `author` / `repo` / `social` |
| 应用图标、托盘图标、favicon、分享图、默认头像 | `logo.appIcon` |
| 系统通知标题 | `productName` |
| Windows AppUserModelID（通知/任务栏归属） | `appId` |
| i18n 界面文案里的品牌名 | `productName`（`{brand}` 变量） |

## 上游署名（强制保留）

cc-haha 采用 **cc-haha Community Source License 1.0**（source-available，非开源）：
个人使用、内部自用、非商业 fork 允许，**但必须保留署名**；换皮售卖/收费分发/商业再分发
须事先取得书面授权（relakkes@gmail.com）。

因此 About 页的 `Based on cc-haha` 声明是**强制项**，`apply.mjs` 会忽略配置中关闭它的尝试。

## 反复切换品牌

`apply.mjs` 是幂等的，且首次运行会把原件备份为 `*.brandorig`。切换品牌不会叠加改动：

```bash
node tools/brand/apply.mjs brandA
node tools/brand/apply.mjs brandB   # 从 brandorig 恢复后重新打补丁
```

## 构建脚本做了什么

`tools/brand/apply.mjs`：
1. 生成 `desktop/src/brand/generated.ts`（品牌数据模块，纯数据）
2. 复制品牌资源到 `desktop/public/brand/`
3. 改写 `desktop/index.html` 的 `<title>`、`desktop/package.json` 的 productName/appId/artifactName
4. 由 `logo.appIcon` 生成 `desktop/src-tauri/icons/` 全套尺寸（png/ico/icns/Square*），并覆盖 favicon/分享图/默认头像

`tools/brand/build.mjs`：调 `apply.mjs` → 编译 → 出免安装目录 → **rcedit 嵌图标/版本** → 出 NSIS 安装包 → 归档。

## 本机环境注意事项

- **网络**：直连 GitHub 与 Electron 官方 CDN 均不可用。构建脚本已内置镜像：
  Electron 二进制与 builder 工具链走 `npmmirror`，bun-baseline 运行时走 `ghfast.top`。
- **winCodeSign**：electron-builder 默认的 exe 资源编辑工具包含 macOS 符号链接，在 Windows
  无特权环境解压必然失败。构建脚本改用 `signAndEditExecutable=false` + 自行 rcedit，绕开该问题。
  因此产物**未做代码签名**；正式分发请自备证书。
- **原生构建**：需要 VS C++ 构建工具（本机已装 VS 2022 BuildTools）。
