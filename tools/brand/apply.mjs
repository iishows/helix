#!/usr/bin/env node
/**
 * 把 brands/<id>/brand.json 应用为一个品牌构建基线。
 *
 * 做四件事(全部幂等,可反复切换品牌):
 *   1. 生成 desktop/src/brand/generated.ts —— 品牌数据模块(纯数据,零 import)
 *   2. 把品牌资源复制进 desktop/public/brand/,运行时按 /brand/<file> 引用
 *   3. 改写 desktop/index.html 的 <title> 与 desktop/package.json 的 productName/appId/win.icon
 *   4. 由 logo.appIcon 生成 desktop/src-tauri/icons/ 下全套尺寸(png/ico/icns/Square*)
 *
 * 用法:
 *   node tools/brand/apply.mjs helix              # 应用品牌
 *   node tools/brand/apply.mjs helix --check      # 只校验,不写盘
 *   node tools/brand/apply.mjs --list             # 列出全部品牌
 *
 * 原始文件首次运行时备份为 *.brandorig,后续每次都从备份恢复再打补丁,
 * 因此反复应用不同品牌不会叠加改动。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, cpSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve, basename, extname, relative, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const BRANDS_DIR = join(REPO, 'brands')

const ok = m => console.log(`  \x1b[32m✓\x1b[0m ${m}`)
const warn = m => console.log(`  \x1b[33m!\x1b[0m ${m}`)
const fail = m => { console.error(`  \x1b[31m✗\x1b[0m ${m}`); process.exitCode = 1 }

// ---------------------------------------------------------------- 参数解析
const argv = process.argv.slice(2)
const flags = argv.filter(a => a.startsWith('--'))
const positional = argv.filter(a => !a.startsWith('--'))
const CHECK = flags.includes('--check')
const LIST = flags.includes('--list')

if (LIST) {
  const ids = existsSync(BRANDS_DIR)
    ? readdirSync(BRANDS_DIR).filter(d => existsSync(join(BRANDS_DIR, d, 'brand.json')))
    : []
  console.log(ids.length ? ids.map(i => `  ${i}`).join('\n') : '  (无品牌)')
  process.exit(0)
}

const brandId = positional[0]
if (!brandId) {
  console.error('用法: node tools/brand/apply.mjs <brandId> [--check]   |   --list')
  process.exit(2)
}

const brandDir = join(BRANDS_DIR, brandId)
if (!existsSync(join(brandDir, 'brand.json'))) {
  console.error(`找不到品牌配置: brands/${brandId}/brand.json`)
  process.exit(2)
}

const cfg = JSON.parse(readFileSync(join(brandDir, 'brand.json'), 'utf8'))

// ---------------------------------------------------------------- 校验
console.log(`\n品牌 \x1b[36m${brandId}\x1b[0m  (${CHECK ? '校验模式,不写盘' : '应用中'})\n`)

if (cfg.id !== brandId) fail(`brand.json 的 id "${cfg.id}" 与目录名 "${brandId}" 不一致`)
for (const k of ['productName', 'appId']) if (!cfg[k]) fail(`缺少必填字段 ${k}`)
if (cfg.appId && !/^[a-zA-Z0-9.-]+$/.test(cfg.appId)) fail(`appId 含非法字符: ${cfg.appId}`)
if (cfg.author && !cfg.author.name) fail('author 存在但缺少 name')

// 上游署名是许可证要求,强制保留 —— 配置里不许关掉
const ATTR = {
  text: cfg.attribution?.text || 'Based on cc-haha',
  url: cfg.attribution?.url || 'https://github.com/NanmiCoder/cc-haha',
  copyright: cfg.attribution?.copyright || 'Copyright (c) 2026 cc-haha',
}
if (cfg.attribution && cfg.attribution.required === false) {
  warn('配置要求去掉上游署名,已强制保留(cc-haha 许可证要求)')
}
ok('品牌配置校验通过')

// ---------------------------------------------------------------- 资源复制
const ASSET_OUT = join(REPO, 'desktop', 'public', 'brand')
// 品牌自带的图标复制进 public/brand;引用了仓库公共 icons/ 的保持原路径
const assetUrlFor = (relPath, fallbackName) => {
  if (!relPath) return null
  const normalized = relPath.replace(/\\/g, '/')
  if (normalized.startsWith('icons/')) return normalized // public/icons 已存在
  const src = join(brandDir, normalized)
  if (!existsSync(src)) { fail(`资源不存在: brands/${brandId}/${normalized}`); return null }
  const dest = join(ASSET_OUT, fallbackName || basename(normalized))
  if (!CHECK) copyFileSync(src, dest)
  return 'brand/' + (fallbackName || basename(normalized))
}

if (!CHECK) {
  rmSync(ASSET_OUT, { recursive: true, force: true })
  mkdirSync(ASSET_OUT, { recursive: true })
}

const logoMark = assetUrlFor(cfg.logo?.mark, 'mark' + extname(cfg.logo?.mark || '.svg'))
const logoWordmark = assetUrlFor(cfg.logo?.wordmark, 'wordmark' + extname(cfg.logo?.wordmark || '.svg'))
const authorAvatar = assetUrlFor(cfg.author?.avatar, 'avatar' + extname(cfg.author?.avatar || '.png'))
const communityQr = assetUrlFor(cfg.community?.qr, 'qr' + extname(cfg.community?.qr || '.png'))

const social = (cfg.author?.social || []).map((s, i) => {
  const ext = s.icon ? extname(s.icon) : '.svg'
  const icon = s.icon ? assetUrlFor(s.icon, `${s.name.toLowerCase()}-${i}${ext}`) : null
  return { name: s.name, url: s.url, label: s.label || s.url, icon }
})

if (logoMark) ok(`logo 标记 → ${logoMark}`)
if (social.length) ok(`社媒链接 ${social.length} 条`)
ok(`作者: ${cfg.author?.name || '(未设置)'}`)

// 应用图标同时覆盖 favicon / 分享图 / 默认头像(app-icon.png|svg 是它们的共同来源)。
// src-tauri/app-icon.png 是平台图标(cargo/tauri 与图标生成脚本)的规范源,
// 上游约定它与 public/app-icon.png 逐字节相同 —— 三处都从同一份品牌图原样拷贝,
// 否则换品牌后 src-tauri 那份会停留在旧品牌上(测试 icon-assets 会拦下)。
const appIconSrc = cfg.logo?.appIcon ? join(brandDir, cfg.logo.appIcon.replace(/\\/g, '/')) : null
if (appIconSrc && existsSync(appIconSrc)) {
  const overwrite = (rel) => {
    const target = join(REPO, 'desktop', rel)
    if (!CHECK) {
      mkdirSync(dirname(target), { recursive: true })
      cpSync(appIconSrc, target)
    }
  }
  if (!CHECK) {
    try {
      overwrite(join('public', 'app-icon.png'))
      overwrite(join('dist', 'app-icon.png'))
      overwrite(join('src-tauri', 'app-icon.png'))
      ok('覆盖 public/dist/src-tauri app-icon.png (favicon/分享图/默认头像/平台图标源)')
    } catch (e) {
      warn(`app-icon 覆盖失败: ${e.message}`)
    }
  }
  if (logoMark && cfg.logo?.mark && /\.svg$/i.test(cfg.logo.mark)) {
    if (!CHECK) {
      try {
        cpSync(join(brandDir, cfg.logo.mark.replace(/\\/g, '/')), join(REPO, 'desktop', 'public', 'app-icon.svg'))
        ok('覆盖 public/app-icon.svg')
      } catch { /* 可选 */ }
    }
  }
}

// ---------------------------------------------------------------- 生成 TS 模块
const generated = `// 由 tools/brand/apply.mjs 生成 —— 请勿手改。
// 品牌: ${brandId} / ${cfg.productName}
// 改品牌请编辑 brands/${brandId}/brand.json 后重新运行构建。

export type BrandSocialLink = {
  name: string
  url: string
  label: string
  icon: string | null
}

export type BrandAttribution = {
  text: string
  url: string
  copyright: string
}

export type Brand = {
  id: string
  productName: string
  windowTitle: string
  appId: string
  tagline: string
  accent: string | null
  /** 侧边栏字标的两段式写法(第二段着品牌色),如 ["cc-","haha"];null 则整名显示 */
  wordmarkSplit: [string, string] | null
  /** 仓库链接(取 repo.url,缺省回退到上游署名地址) */
  repoUrl: string
  logo: { mark: string | null; wordmark: string | null }
  author: {
    name: string
    github: string | null
    avatar: string | null
    social: BrandSocialLink[]
  }
  repo: {
    url: string | null
    issues: string | null
    releases: string | null
    label: string | null
  }
  communityQr: string | null
  attribution: BrandAttribution
}

export const BRAND: Brand = ${JSON.stringify({
  id: cfg.id,
  productName: cfg.productName,
  windowTitle: cfg.windowTitle || cfg.productName,
  appId: cfg.appId,
  tagline: cfg.tagline || '',
  accent: cfg.accent || null,
  wordmarkSplit: Array.isArray(cfg.wordmarkSplit) && cfg.wordmarkSplit.length === 2 ? cfg.wordmarkSplit : null,
  repoUrl: cfg.repo?.url || ATTR.url,
  logo: { mark: logoMark, wordmark: logoWordmark },
  author: { name: cfg.author?.name || '', github: cfg.author?.github || null, avatar: authorAvatar, social },
  repo: {
    url: cfg.repo?.url || null,
    issues: cfg.repo?.issues || null,
    releases: cfg.repo?.releases || null,
    label: cfg.repo?.label || null,
  },
  communityQr,
  attribution: ATTR,
}, null, 2)}
`
if (!CHECK) {
  mkdirSync(join(REPO, 'desktop', 'src', 'brand'), { recursive: true })
  writeFileSync(join(REPO, 'desktop', 'src', 'brand', 'generated.ts'), generated, 'utf8')
}
ok('生成 desktop/src/brand/generated.ts')

// ---------------------------------------------------------------- index.html 标题
const htmlPath = join(REPO, 'desktop', 'index.html')
const htmlOrig = htmlPath + '.brandorig'
if (!existsSync(htmlOrig)) { if (!CHECK) copyFileSync(htmlPath, htmlOrig) }
if (!CHECK) {
  let html = readFileSync(existsSync(htmlOrig) ? htmlOrig : htmlPath, 'utf8')
  const title = cfg.windowTitle || cfg.productName
  const before = html
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
  if (html === before) warn('index.html 未找到 <title>,标题未改写')
  else ok(`窗口标题 → ${title}`)
  writeFileSync(htmlPath, html, 'utf8')
}

// ---------------------------------------------------------------- package.json
const pkgPath = join(REPO, 'desktop', 'package.json')
const pkgOrig = pkgPath + '.brandorig'
if (!existsSync(pkgOrig)) { if (!CHECK) copyFileSync(pkgPath, pkgOrig) }
if (!CHECK) {
  const pkg = JSON.parse(readFileSync(existsSync(pkgOrig) ? pkgOrig : pkgPath, 'utf8'))
  pkg.productName = cfg.productName
  pkg.build = pkg.build || {}
  pkg.build.appId = cfg.appId
  pkg.build.productName = cfg.productName
  pkg.build.win = { ...(pkg.build.win || {}), icon: 'src-tauri/icons/icon.ico' }
  pkg.build.nsis = { ...(pkg.build.nsis || {}), shortcutName: cfg.productName }
  // 产物名原本硬编码为 Claude-Code-Haha-*,改为按品牌命名
  const safeName = cfg.productName.replace(/[^A-Za-z0-9._-]+/g, '-')
  pkg.build.artifactName = `${safeName}-\${version}-\${os}-\${arch}.\${ext}`
  // 自动更新源:上游默认是 NanmiCoder/cc-haha。若不改写,`electron-builder --publish always`
  // 会把本品牌的更新指向 cc-haha,用户升级后会被替换成 cc-haha 本身。
  // 从 brand.json 的 repo.url(github.com/<owner>/<repo>)派生,避免依赖 schema 中不存在的 publish 字段;
  // repo 非必填,schema.required 只有 id/productName/appId,故缺失时仅告警。
  const repoMatch = /github\.com\/([^/]+)\/([^/?#]+)/.exec(cfg.repo?.url || '')
  if (repoMatch) {
    const repoName = repoMatch[2].replace(/\.git$/, '')
    pkg.build.publish = [{ provider: 'github', owner: repoMatch[1], repo: repoName }]
    ok(`publish → ${repoMatch[1]}/${repoName}`)
  } else {
    warn('brand.json 缺少 repo.url,发布源仍指向上游 cc-haha,请勿使用 --publish always')
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  ok(`productName/appId → ${cfg.productName} / ${cfg.appId}`)
}

// ---------------------------------------------------------------- 应用图标
if (appIconSrc && existsSync(appIconSrc)) {
  if (CHECK) ok(`图标源就绪: ${cfg.logo.appIcon}`)
  else {
    const outDir = join(REPO, 'desktop', 'src-tauri', 'icons')
    try {
      genIcons(appIconSrc, outDir)
      ok('生成 src-tauri/icons 全套尺寸 (png/ico/icns/Square*)')
    } catch (e) {
      warn(`图标生成失败(不影响代码改造): ${e.message}`)
    }
  }
} else if (cfg.logo?.appIcon) {
  warn(`图标源缺失: ${cfg.logo.appIcon} —— 沿用现有图标`)
}

console.log(CHECK ? '\n校验完成。\n' : `\n品牌 ${cfg.productName} 已就绪,可以构建。\n`)

// ---------------------------------------------------------------- 辅助
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function genIcons(src, outDir) {
  const mg = findMagick()
  if (!mg) throw new Error('未找到 ImageMagick(magick)')
  mkdirSync(outDir, { recursive: true })
  const png = (size, name) =>
    execFileSync(mg, ['-background', 'none', src, '-resize', `${size}x${size}`, join(outDir, name)], { stdio: 'pipe' })

  for (const s of [32, 64, 128, 256, 512]) png(s, `${s}x${s}.png`)
  png(256, '128x128@2x.png')
  execFileSync(mg, ['-background', 'none', src, '-resize', '512x512', join(outDir, 'icon.png')], { stdio: 'pipe' })
  execFileSync(mg, ['-background', 'none', src, '-define', 'icon:auto-resize=256,128,64,48,32,16',
    '-resize', '256x256', join(outDir, 'icon.ico')], { stdio: 'pipe' })
  for (const s of [30, 44, 71, 89, 107, 142, 150, 284, 310]) png(s, `Square${s}x${s}Logo.png`)
  try {
    execFileSync(mg, ['-background', 'none', src, '-resize', '512x512', join(outDir, 'icon.icns')], { stdio: 'pipe' })
  } catch { /* macOS 图标非必需(本机为 Windows 目标) */ }
}

function findMagick() {
  for (const c of ['magick', 'magick.exe']) {
    try { execFileSync(c, ['-version'], { stdio: 'pipe' }); return c } catch { /* 继续 */ }
  }
  return null
}
