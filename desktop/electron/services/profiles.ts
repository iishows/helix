/**
 * Profile 管理（Chrome 式多 profile）的主进程侧实现。
 *
 * 一个 profile = profiles 根目录下的一个子目录，里面只需要「名称 + logo」：
 *
 *   %APPDATA%\Helix\profiles\工作\
 *     instance.json   { "name": "工作", "logo": "logo.png", "accent": "#6C5CE7" }
 *     logo.png        用户给的图
 *     logo.ico        由 logo.png 生成，供快捷方式/任务栏图标用
 *     data\           数据目录（CLAUDE_CONFIG_DIR）
 *     electron\       Electron 缓存/存储（--user-data-dir）
 *
 * 列表首位永远有一个 default 条目，代表「不带 --instance 启动」的原始状态。
 * 它的数据目录是 CLI 共享的配置目录（如 ~/.claude），**不归本应用私有**，
 * 因此只登记、不可改名或删除。
 */
import { app, shell } from 'electron'
import { spawn } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { BRAND } from '../../src/brand/generated'
import { readLogoDataUrl, resolveInstance, type InstanceConfig } from './instance'

export type ProfileEntry = {
  /** profile 目录；default 条目为空串。 */
  dir: string
  name: string
  /** logo 的 data URL，供渲染层直接 <img src>。 */
  logoDataUrl: string | null
  accent: string | null
  /** default 条目为 true：数据目录属其它工具共享，禁止改名/删除。 */
  isDefault: boolean
  /** 是否为当前进程正在运行的 profile。 */
  isCurrent: boolean
  /** 该 profile 的数据目录（CLAUDE_CONFIG_DIR 落点）。 */
  dataDir: string
  /** 桌面快捷方式是否已存在。 */
  hasShortcut: boolean
}

export type CreateProfileInput = {
  name: string
  logoPath?: string | null
  accent?: string | null
  /** 从当前 profile 复制凭据与设置做初始化（不复制会话历史）。 */
  seedFromCurrent?: boolean
}

/**
 * profiles 根目录：%APPDATA%\<产品名>\profiles。
 *
 * 这里的目录名必须跨实例恒定，所以既不能用 app.getPath('userData')（实例模式下已被
 * applyInstanceBootstrap 改成 <实例目录>\electron，会把新 profile 嵌进当前实例），
 * 也不能用 app.getName()（实例模式已被 setName 改成实例名）。用烘焙的产品名。
 */
export function profilesRoot(): string {
  return path.join(app.getPath('appData'), BRAND.productName, 'profiles')
}

const ILLEGAL_IN_NAME = /[\\/:*?"<>|]/g

/** 把用户输入的名称收敛成可作为目录名的字符串。 */
export function sanitizeProfileDirName(name: string): string {
  const cleaned = name.replace(ILLEGAL_IN_NAME, '').replace(/\.+$/, '').trim()
  return cleaned || 'profile'
}

function profileDirByName(name: string): string {
  return path.join(profilesRoot(), sanitizeProfileDirName(name))
}

/**
 * 把 PNG 包成单尺寸 .ico。
 *
 * Vista 以后的 .ico 允许直接内嵌 PNG 数据，所以不需要象素级转码：读 IHDR 取宽高，
 * 拼一个 ICONDIR + 一条 ICONDIRENTRY 再把 PNG 原样接在后面即可。
 * 这样就不依赖 ImageMagick —— 用户机器上不一定装了它。
 */
function pngToIco(png: Buffer): Buffer | null {
  // 8 字节 PNG 签名 + 4 字节长度 + 4 字节 'IHDR' + 4 宽 + 4 高
  if (png.length < 24) return null
  if (png.readUInt32BE(0) !== 0x89504e47 || png.readUInt32BE(4) !== 0x0d0a1a0a) return null
  if (png.toString('ascii', 12, 16) !== 'IHDR') return null

  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  // ICO 用 0 表示 256；大于 256 的图需要缩放，这里不做（交给调用方退化）
  if (width < 1 || height < 1 || width > 256 || height > 256) return null

  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // image count
  header.writeUInt8(width === 256 ? 0 : width, 6)
  header.writeUInt8(height === 256 ? 0 : height, 7)
  header.writeUInt8(0, 8) // palette size
  header.writeUInt8(0, 9) // reserved
  header.writeUInt16LE(1, 10) // color planes
  header.writeUInt16LE(32, 12) // bits per pixel
  header.writeUInt32LE(png.length, 14) // payload size
  header.writeUInt32LE(22, 18) // payload offset

  return Buffer.concat([header, png])
}

/** 生成 logo.ico；只在输入是 PNG 时可行。返回是否成功。 */
function generateIco(logoPath: string, outIco: string): boolean {
  try {
    if (path.extname(logoPath).toLowerCase() !== '.png') return false
    const ico = pngToIco(readFileSync(logoPath))
    if (!ico) return false
    writeFileSync(outIco, ico)
    return true
  } catch {
    return false
  }
}

/** 快捷方式存放目录（桌面）。 */
function desktopDir(): string {
  try {
    return app.getPath('desktop')
  } catch {
    return ''
  }
}

function shortcutPathFor(name: string): string {
  return path.join(desktopDir(), `${sanitizeProfileDirName(name)}.lnk`)
}

/**
 * 列出所有 profile：default 恒在首位，其后是 profiles 根目录下各子目录。
 * 目录里没有 instance.json 的会被忽略（不是 profile，可能是别人放的杂物）。
 */
export function listProfiles(currentDir: string | null, defaultDataDir: string): ProfileEntry[] {
  const entries: ProfileEntry[] = [
    {
      dir: '',
      name: '默认',
      logoDataUrl: null,
      accent: null,
      isDefault: true,
      isCurrent: currentDir === null,
      dataDir: defaultDataDir,
      hasShortcut: false,
    },
  ]

  const root = profilesRoot()
  if (existsSync(root)) {
    let names: string[] = []
    try {
      names = readdirSync(root)
    } catch {
      names = []
    }
    for (const name of names) {
      const dir = path.join(root, name)
      try {
        if (!statSync(dir).isDirectory()) continue
      } catch {
        continue
      }
      if (!existsSync(path.join(dir, 'instance.json'))) continue
      const instance = resolveInstance([`--instance=${dir}`])
      if (!instance) continue
      entries.push(entryFromInstance(instance, currentDir))
    }
  }

  return entries
}

function entryFromInstance(instance: InstanceConfig, currentDir: string | null): ProfileEntry {
  return {
    dir: instance.dir,
    name: instance.name,
    logoDataUrl: readLogoDataUrl(instance.logoPath),
    accent: instance.accent,
    isDefault: false,
    isCurrent: currentDir !== null && path.resolve(currentDir) === instance.dir,
    dataDir: path.join(instance.dir, 'data'),
    hasShortcut: existsSync(shortcutPathFor(instance.name)),
  }
}

/** 把当前 profile 的凭据与设置复制进新 profile 的 data 目录（不含会话历史）。 */
const SEED_FILES = ['.credentials.json', 'settings.json', 'config.json']

function seedDataDir(targetDataDir: string, sourceDataDir: string): string[] {
  const copied: string[] = []
  for (const file of SEED_FILES) {
    const src = path.join(sourceDataDir, file)
    if (!existsSync(src)) continue
    try {
      copyFileSync(src, path.join(targetDataDir, file))
      copied.push(file)
    } catch {
      /* 单个文件复制失败不影响整体创建 */
    }
  }
  return copied
}

export type CreateProfileResult = {
  dir: string
  name: string
  icoGenerated: boolean
  seeded: string[]
}

/** 创建一个新 profile 目录，并按需复制 logo、生成 .ico、写入 instance.json。 */
export function createProfile(
  input: CreateProfileInput,
  defaultDataDir: string,
): CreateProfileResult {
  const name = input.name.trim()
  if (!name) throw new Error('profile name is required')

  const dir = profileDirByName(name)
  if (existsSync(path.join(dir, 'instance.json'))) {
    throw new Error(`profile already exists: ${name}`)
  }

  for (const sub of ['', 'data', 'electron']) {
    mkdirSync(path.join(dir, sub), { recursive: true })
  }

  let logoRel: string | null = null
  let icoGenerated = false
  if (input.logoPath) {
    const src = path.resolve(input.logoPath)
    if (!existsSync(src)) throw new Error(`logo not found: ${src}`)
    const ext = path.extname(src).toLowerCase() || '.png'
    logoRel = `logo${ext}`
    copyFileSync(src, path.join(dir, logoRel))
    icoGenerated = generateIco(path.join(dir, logoRel), path.join(dir, 'logo.ico'))
  }

  const config: Record<string, string> = { name }
  if (logoRel) config.logo = logoRel
  if (input.accent) config.accent = input.accent
  writeFileSync(path.join(dir, 'instance.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8')

  const seeded = input.seedFromCurrent ? seedDataDir(path.join(dir, 'data'), defaultDataDir) : []

  return { dir, name, icoGenerated, seeded }
}

/**
 * 启动另一个 profile：新开一个进程，当前窗口不受影响。
 *
 * 走独立进程而不是复用现有窗口，是因为数据目录与 Electron 缓存都在启动最早期由
 * 命令行决定（见 instance.ts 的 applyInstanceBootstrap），进程内无法切换。
 */
export function launchProfile(dir: string): void {
  const exe = process.execPath
  const args = [`--instance=${dir}`]

  if (!app.isPackaged) {
    // 开发态下 execPath 是 electron 本体，还需要补上应用入口
    args.unshift(app.getAppPath())
  }

  const child = spawn(exe, args, {
    detached: true,
    stdio: 'ignore',
    cwd: path.dirname(exe),
  })
  child.unref()
}

/** 为 profile 创建桌面快捷方式，图标优先用该 profile 的 logo.ico。 */
export function createProfileShortcut(entry: ProfileEntry, exePath: string): string {
  const lnk = shortcutPathFor(entry.name)
  const ico = path.join(entry.dir, 'logo.ico')
  const icon = existsSync(ico) ? ico : exePath

  const created = shell.writeShortcutLink(lnk, {
    target: exePath,
    args: `--instance="${entry.dir}"`,
    icon,
    iconIndex: 0,
    cwd: path.dirname(exePath),
    description: `${entry.name} - ${app.getName()}`,
  })
  if (!created) throw new Error('failed to write shortcut')
  return lnk
}

/** 删除 profile。default 与正在运行的 profile 不允许删除。 */
export function deleteProfile(entry: ProfileEntry): void {
  if (entry.isDefault) throw new Error('the default profile cannot be deleted')
  if (entry.isCurrent) throw new Error('the running profile cannot be deleted')
  if (!entry.dir.startsWith(profilesRoot())) {
    throw new Error('refusing to delete outside the profiles directory')
  }
  rmSync(entry.dir, { recursive: true, force: true })
  try {
    rmSync(shortcutPathFor(entry.name), { force: true })
  } catch {
    /* 快捷方式不存在或删不掉都不算失败 */
  }
}

/** 重命名 profile：改 instance.json 的 name，并把目录一并改名以保持一致。 */
export function renameProfile(entry: ProfileEntry, newName: string): void {
  if (entry.isDefault) throw new Error('the default profile cannot be renamed')
  if (entry.isCurrent) throw new Error('the running profile cannot be renamed')
  const name = newName.trim()
  if (!name) throw new Error('profile name is required')

  const configFile = path.join(entry.dir, 'instance.json')
  const parsed = JSON.parse(readFileSync(configFile, 'utf8')) as Record<string, unknown>
  parsed.name = name
  writeFileSync(configFile, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')

  const target = profileDirByName(name)
  if (path.resolve(target) !== path.resolve(entry.dir) && !existsSync(target)) {
    renameSync(entry.dir, target)
  }
}
