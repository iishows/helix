#!/usr/bin/env node
/**
 * 创建一个 cc-haha 实例(Chrome 式多 profile),并在桌面建对应快捷方式。
 *
 * 一个实例 = 一个目录,里面只需「名称 + logo」两样:
 *
 *   D:\instances\工作\
 *     instance.json     { "name": "工作", "logo": "logo.png", "accent": "#6C5CE7" }
 *     logo.png          你给的图
 *     logo.ico          自动生成,供桌面快捷方式与任务栏图标用
 *     data\            数据目录(CLAUDE_CONFIG_DIR)
 *     electron\        Electron 缓存/存储(--user-data-dir)
 *
 * 用法:
 *   node tools/instance/create-instance.mjs --name 工作 --logo D:\pic\work.png
 *   node tools/instance/create-instance.mjs --name 个人 --logo a.png --dir D:\instances --accent "#4FD1E0"
 *   node tools/instance/create-instance.mjs --name 工作 --logo a.png --no-shortcut
 *   node tools/instance/create-instance.mjs --name 工作 --logo a.png --app "D:\Program Files\Helix"
 *
 * 缺省建在 %APPDATA%\Helix\profiles 下,与应用内「管理 Profile」共用同一份列表。
 * 之后双击桌面快捷方式即可;也可手动:
 *   "D:\...\Helix.exe" --instance="%APPDATA%\Helix\profiles\工作"
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve, basename, extname, parse } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')

// ---------------------------------------------------------------- 参数
const args = process.argv.slice(2)
const opt = name => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const has = name => args.includes(`--${name}`)

const name = opt('name')
const logo = opt('logo')
const accent = opt('accent')
// 默认与 GUI 的 profile 根目录保持一致(%APPDATA%\Helix\profiles),
// 这样应用内「管理 Profile」和本脚本看到的是同一份列表。
const defaultBaseDir = process.env.APPDATA
  ? join(process.env.APPDATA, 'Helix', 'profiles')
  : join(homedir(), 'cc-haha-instances')
const baseDir = resolve(opt('dir') || defaultBaseDir)
const appDir = opt('app') // 安装目录(含 Helix.exe);缺省则用构建产物
const noShortcut = has('no-shortcut')

if (!name) {
  console.error('用法: node tools/instance/create-instance.mjs --name <名称> --logo <图片> [--dir <父目录>] [--accent #RRGGBB] [--app <安装目录>] [--no-shortcut]')
  process.exit(2)
}

const ok = m => console.log(`  \x1b[32m✓\x1b[0m ${m}`)
const warn = m => console.log(`  \x1b[33m!\x1b[0m ${m}`)
console.log(`\n创建实例 \x1b[36m${name}\x1b[0m\n`)

// ---------------------------------------------------------------- 目录
const instDir = join(baseDir, name)
for (const sub of ['', 'data', 'electron']) mkdirSync(join(instDir, sub), { recursive: true })
ok(`实例目录 ${instDir}`)

// ---------------------------------------------------------------- logo
let logoRel = null
if (logo) {
  const src = resolve(logo)
  if (!existsSync(src)) { console.error(`logo 不存在: ${src}`); process.exit(2) }
  const ext = extname(src).toLowerCase() || '.png'
  const destName = `logo${ext}`
  copyFileSync(src, join(instDir, destName))
  logoRel = destName
  ok(`logo → ${destName}`)
  // 生成 .ico(快捷方式与任务栏图标用;Windows 下比 png 锐利)
  try {
    const mg = findMagick()
    if (mg) {
      execFileSync(mg, ['-background', 'none', src, '-define', 'icon:auto-resize=256,128,64,48,32,16',
        '-resize', '256x256', join(instDir, 'logo.ico')], { stdio: 'pipe' })
      ok('logo.ico(快捷方式/任务栏图标)')
    } else {
      warn('未找到 ImageMagick,跳过 logo.ico(将退回使用原图)')
    }
  } catch (e) {
    warn(`logo.ico 生成失败: ${e.message}`)
  }
} else {
  warn('未提供 --logo,该实例将使用应用内置图标')
}

// ---------------------------------------------------------------- instance.json
const config = { name }
if (logoRel) config.logo = logoRel
if (accent) config.accent = accent
writeFileSync(join(instDir, 'instance.json'), JSON.stringify(config, null, 2) + '\n', 'utf8')
ok('instance.json')

// ---------------------------------------------------------------- 桌面快捷方式
if (noShortcut) {
  warn('--no-shortcut:跳过桌面快捷方式')
} else {
  const exe = locateExe(appDir)
  if (!exe) {
    warn('未找到 Helix.exe,跳过快捷方式(可用 --app 指定安装目录)')
  } else {
    const lnk = join(desktopDir(), `${name}.lnk`)
    const icon = existsSync(join(instDir, 'logo.ico')) ? join(instDir, 'logo.ico') : exe
    try {
      createShortcut({ lnk, exe, instDir, icon })
      ok(`桌面快捷方式 ${lnk}`)
    } catch (e) {
      warn(`快捷方式创建失败: ${e.message}`)
    }
  }
}

console.log(`\n\x1b[32m✓\x1b[0m 实例 "${name}" 就绪`)
console.log(`  启动: "${locateExe(appDir) || '<安装目录>\\Helix.exe'}" --instance="${instDir}"\n`)

// ---------------------------------------------------------------- 辅助
function desktopDir() {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      '[Environment]::GetFolderPath("Desktop")'], { stdio: 'pipe' }).toString().trim()
    if (out) return out
  } catch { /* 回退 */ }
  return join(homedir(), 'Desktop')
}

function createShortcut({ lnk, exe, instDir, icon }) {
  // 通过 WScript.Shell 建 .lnk;参数里带引号路径,由 PowerShell 单引号包住。
  const ps = [
    '$ws = New-Object -ComObject WScript.Shell',
    `$sc = $ws.CreateShortcut('${lnk.replace(/'/g, "''")}')`,
    `$sc.TargetPath = '${exe.replace(/'/g, "''")}'`,
    `$sc.Arguments = '--instance="${instDir}"'`,
    `$sc.IconLocation = '${icon.replace(/'/g, "''")}'`,
    `$sc.WorkingDirectory = '${dirname(exe).replace(/'/g, "''")}'`,
    '$sc.Save()',
  ].join('; ')
  execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'pipe' })
}

/** 找安装好的 Helix.exe:优先 --app,其次构建产物,最后常见安装位置。 */
function locateExe(appDirOpt) {
  const candidates = [
    appDirOpt && join(resolve(appDirOpt), 'Helix.exe'),
    join(REPO, 'desktop', 'dist-brands', 'helix', 'win-unpacked', 'Helix.exe'),
    join(REPO, 'desktop', 'build-artifacts', 'electron', 'win-unpacked', 'Helix.exe'),
  ].filter(Boolean)
  return candidates.find(p => existsSync(p)) || null
}

function findMagick() {
  for (const c of ['magick', 'magick.exe']) {
    try { execFileSync(c, ['-version'], { stdio: 'pipe' }); return c } catch { /* 继续 */ }
  }
  return null
}
