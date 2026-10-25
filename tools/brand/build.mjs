#!/usr/bin/env node
/**
 * 按品牌独立构建 cc-haha 安装包。
 *
 * 流程: 应用品牌 → 编译 → electron-builder 出免安装目录 → rcedit 嵌入品牌图标
 *      与版本信息 → 基于该目录出 NSIS 安装包 → 归档到 desktop/dist-brands/<id>/
 *
 * 用法:
 *   node tools/brand/build.mjs helix              # 完整构建(免安装目录 + NSIS 安装包)
 *   node tools/brand/build.mjs helix --dir        # 只出免安装目录(快速验证)
 *   node tools/brand/build.mjs helix --skip-build # 跳过编译,复用上次编译产物
 *
 * 分两步打包(rcedit 手嵌图标)的原因:
 *   electron-builder 默认在打包时调用 winCodeSign 工具包来编辑 exe 资源,而该工具包
 *   内含 macOS 符号链接,在 Windows 无特权环境下解压必然失败(报 libcrypto.dylib
 *   symlink 错误),导致既拿不到安装包、exe 也嵌不上图标。这里改为:
 *   signAndEditExecutable=false 让 electron-builder 跳过该步,再由本脚本用 rcedit
 *   自行嵌入图标/版本信息,最后用 --prepackaged 出安装包。效果一致且不依赖 winCodeSign。
 *
 * 网络(已内置): Electron 二进制与 builder 工具链走 npmmirror;sidecar 交叉编译所需
 *   的 bun-baseline 运行时若缺失会从 ghfast 镜像补齐。
 */
import { readFileSync, existsSync, mkdirSync, cpSync, rmSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const DESKTOP = join(REPO, 'desktop')
const ARTIFACTS = join(DESKTOP, 'build-artifacts', 'electron')
const UNPACKED = join(ARTIFACTS, 'win-unpacked')

const ELECTRON_MIRROR = 'https://registry.npmmirror.com/-/binary/electron/'
const BUILDER_MIRROR = 'https://registry.npmmirror.com/-/binary/electron-builder-binaries/'
const BUN_MIRROR = 'https://ghfast.top/https://github.com/oven-sh/bun/releases/download'

const argv = process.argv.slice(2)
const flags = argv.filter(a => a.startsWith('--'))
const brandId = argv.find(a => !a.startsWith('--'))
if (!brandId) {
  console.error('用法: node tools/brand/build.mjs <brandId> [--dir] [--skip-build]')
  process.exit(2)
}
const DIR_ONLY = flags.includes('--dir')
const SKIP_BUILD = flags.includes('--skip-build')

const step = m => console.log(`\n\x1b[36m▶\x1b[0m ${m}`)
const warn = m => console.log(`  \x1b[33m!\x1b[0m ${m}`)
const ok = m => console.log(`  \x1b[32m✓\x1b[0m ${m}`)

const env = { ...process.env, ELECTRON_MIRROR, ELECTRON_BUILDER_BINARIES_MIRROR: BUILDER_MIRROR }
const baselineBun = ensureBaselineBun()
if (baselineBun) env.PATH = dirname(baselineBun) + (process.platform === 'win32' ? ';' : ':') + env.PATH

const run = (cmd, args, opts = {}) => {
  console.log(`  $ ${cmd} ${args.join(' ')}`)
  execFileSync(cmd, args, { cwd: opts.cwd || DESKTOP, stdio: 'inherit', env, ...opts })
}
const builder = args => run('node', [join(DESKTOP, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js'), ...args])

// 1) 应用品牌
step(`应用品牌 ${brandId}`)
run('node', [join(HERE, 'apply.mjs'), brandId], { cwd: REPO, env: process.env })

const cfg = JSON.parse(readFileSync(join(REPO, 'brands', brandId, 'brand.json'), 'utf8'))
const pkg = JSON.parse(readFileSync(join(DESKTOP, 'package.json'), 'utf8'))
const version = pkg.version

// 2) 编译
if (SKIP_BUILD) warn('--skip-build:复用上次编译产物')
else { step('编译 (sidecars + renderer + electron)'); run('bun', ['run', 'electron:build']) }

// 3) 出免安装目录(跳过 exe 资源编辑,避免 winCodeSign)
step('打包免安装目录')
builder(['--publish', 'never', '--dir', '-c.win.signAndEditExecutable=false'])

// 4) rcedit 嵌入品牌图标与版本信息
step('嵌入品牌图标与版本信息')
const exeName = `${cfg.productName}.exe`
const exePath = join(UNPACKED, exeName)
if (existsSync(exePath)) embedExeResources(exePath, cfg, version)
else warn(`未找到 ${exeName},跳过图标嵌入`)

// 5) 出 NSIS 安装包(基于已就绪目录)
if (DIR_ONLY) {
  warn('--dir:跳过安装包生成')
} else {
  step('生成 NSIS 安装包')
  builder(['--publish', 'never', '--prepackaged', UNPACKED, '--win', 'nsis', '--x64'])
}

// 6) 归档
step('归档产物')
const OUT_ROOT = join(DESKTOP, 'dist-brands', brandId)
rmSync(OUT_ROOT, { recursive: true, force: true })
mkdirSync(OUT_ROOT, { recursive: true })
let archived = 0
for (const entry of readdirSync(ARTIFACTS)) {
  const full = join(ARTIFACTS, entry)
  if (statSync(full).isDirectory()) {
    if (/unpacked/.test(entry)) { cpSync(full, join(OUT_ROOT, entry), { recursive: true }); archived++ }
    continue
  }
  if (/\.(exe|msi|zip|blockmap|yml)$/.test(entry)) { cpSync(full, join(OUT_ROOT, entry)); archived++ }
}
if (archived === 0) warn('未找到产物')
else { ok(`产物 ${archived} 项 → desktop/dist-brands/${brandId}/`); for (const f of readdirSync(OUT_ROOT)) console.log(`      ${f}`) }

console.log(`\n\x1b[32m✓\x1b[0m 品牌 ${cfg.productName} (${brandId}) 构建完成\n`)

// ---------------------------------------------------------------- 辅助
function embedExeResources(exe, cfg, version) {
  const rce = locateRcedit()
  if (!rce) { warn('未找到 rcedit,跳过(图标保持 electron 默认)'); return }
  const ico = join(DESKTOP, 'src-tauri', 'icons', 'icon.ico')
  const args = [exe]
  if (existsSync(ico)) args.push('--set-icon', ico)
  args.push(
    '--set-version-string', 'ProductName', cfg.productName,
    '--set-version-string', 'FileDescription', cfg.productName,
    '--set-version-string', 'CompanyName', cfg.author?.name || cfg.productName,
    '--set-version-string', 'LegalCopyright', cfg.attribution?.copyright || '',
    '--set-version-string', 'OriginalFilename', basename(exe),
    '--set-file-version', version,
    '--set-product-version', version,
  )
  try {
    execFileSync(rce, args, { stdio: 'inherit' })
    ok(`${basename(exe)} ← 品牌图标 + ${cfg.productName} v${version}`)
  } catch (e) {
    warn(`rcedit 失败: ${e.message}`)
  }
}

/** rcedit 是可再分发小工具。优先用缓存里的,其次 electron-winstaller 自带的,最后从镜像取。 */
function locateRcedit() {
  const cacheRoot = join(process.env.LOCALAPPDATA || homedir(), 'electron-builder', 'Cache', 'winCodeSign')
  const found = findFile(cacheRoot, 'rcedit-x64.exe', 2)
  if (found) return found
  const vendor = join(DESKTOP, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe')
  if (existsSync(vendor)) return vendor
  try {
    const dest = join(DESKTOP, 'build-artifacts', 'rcedit-x64.exe')
    mkdirSync(dirname(dest), { recursive: true })
    execFileSync('curl', ['-sL', '--noproxy', '*', '-o', dest,
      'https://ghfast.top/https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe'], { stdio: 'inherit' })
    return existsSync(dest) ? dest : null
  } catch { return null }
}

function findFile(dir, name, depth) {
  if (depth < 0 || !existsSync(dir)) return null
  for (const e of readdirSync(dir)) {
    const full = join(dir, e)
    try {
      if (statSync(full).isDirectory()) {
        const hit = findFile(full, name, depth - 1)
        if (hit) return hit
      } else if (e.toLowerCase() === name.toLowerCase()) return full
    } catch { /* 跳过不可读项 */ }
  }
  return null
}

function ensureBaselineBun() {
  const bunVer = safeExec('bun', ['--version'])?.trim()
  if (!bunVer) return null
  const dir = join(homedir(), '.bun', 'install', 'cache', 'bun-windows-x64-baseline')
  const exe = join(dir, 'bun.exe')
  if (existsSync(exe)) return exe
  warn(`缺少 bun baseline 运行时,从镜像补齐 (bun v${bunVer})`)
  try {
    mkdirSync(dir, { recursive: true })
    const zip = join(dir, 'bun-baseline.zip')
    execFileSync('curl', ['-sL', '--noproxy', '*', '-o', zip, `${BUN_MIRROR}/bun-v${bunVer}/bun-windows-x64-baseline.zip`], { stdio: 'inherit' })
    execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dir}' -Force`], { stdio: 'inherit' })
    rmSync(zip, { force: true })
    return existsSync(exe) ? exe : null
  } catch (e) { warn(`补齐失败: ${e.message}`); return null }
}

function safeExec(cmd, args) {
  try { return execFileSync(cmd, args, { stdio: 'pipe' }).toString() } catch { return null }
}
