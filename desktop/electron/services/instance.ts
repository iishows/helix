import { app } from 'electron'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

/**
 * 实例（Chrome 式多 profile）。
 *
 * 一个安装包可以带任意多个实例。启动时用 --instance=<目录> 指定实例目录，
 * 目录里放一份 instance.json（只需 name 与 logo 两样），应用读它即为品牌：
 *
 *   D:\instances\工作\
 *     instance.json   { "name": "工作", "logo": "logo.png" }
 *     logo.png
 *     logo.ico        由 logo 生成，供桌面快捷方式图标用
 *     data\           数据目录（CLAUDE_CONFIG_DIR）
 *     electron\       Electron 缓存/存储（--user-data-dir）
 *
 * 不带 --instance 启动时保持原状：单实例、编译期固化品牌。
 */

export type InstanceConfig = {
  dir: string
  name: string
  logoPath: string | null
  accent: string | null
}

const INSTANCE_FLAG = '--instance='

/** 从命令行取 --instance=<dir>。带引号/空格均可，缺失或空串返回 null。 */
export function readInstanceArg(argv: readonly string[] = process.argv): string | null {
  const hit = argv.find(arg => arg.startsWith(INSTANCE_FLAG))
  if (!hit) return null
  const raw = hit.slice(INSTANCE_FLAG.length).trim().replace(/^"(.*)"$/, '$1').trim()
  return raw || null
}

/** 读取实例配置。目录缺失、json 损坏、字段非法时逐项退化为安全默认值。 */
export function resolveInstance(argv: readonly string[] = process.argv): InstanceConfig | null {
  const dirArg = readInstanceArg(argv)
  if (!dirArg) return null

  const dir = path.resolve(dirArg)
  let name = path.basename(dir) || 'Instance'
  let logoPath: string | null = null
  let accent: string | null = null

  const configFile = path.join(dir, 'instance.json')
  if (existsSync(configFile)) {
    try {
      const parsed = JSON.parse(readFileSync(configFile, 'utf8')) as Record<string, unknown>
      const rawName = typeof parsed.name === 'string' ? parsed.name.trim() : ''
      if (rawName) name = rawName
      const rawLogo = typeof parsed.logo === 'string' ? parsed.logo.trim() : ''
      if (rawLogo) {
        const candidate = path.resolve(dir, rawLogo)
        // 只接受实例目录内的真实文件，避免配置把图标指到目录之外
        if (candidate.startsWith(dir) && existsSync(candidate) && statSync(candidate).isFile()) {
          logoPath = candidate
        }
      }
      if (typeof parsed.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.accent.trim())) {
        accent = parsed.accent.trim()
      }
    } catch {
      /* 配置损坏:退化为目录名 + 无 logo */
    }
  }

  return { dir, name, logoPath, accent }
}

/**
 * 在启动最早期应用实例(必须在 acquireSingleInstanceLock 与 app.whenReady 之前调用)。
 *
 * - 数据目录:设 CLAUDE_CONFIG_DIR。它是配置源的最高优先级,且应用不会清除它
 *   (clearAppManagedPortableEnv 仅在 CC_HAHA_APP_PORTABLE_DIR=1 时才动手),
 *   因此后续 applyStartupPortableMode 会沿用该值。
 * - Electron 缓存:setPath('userData'),避免多个实例共用同一份存储。
 *
 * 单实例锁不在本函数处理:Electron 的锁按 userData 目录归属,而上面已让每个实例
 * 拥有独立 userData。因此不同实例互不干扰,同一实例重复启动会被锁挡下,并通过
 * second-instance 唤起已有窗口。CC_HAHA_ELECTRON_DISABLE_SINGLE_INSTANCE_LOCK
 * 保留为显式逃生开关(需在启动前由外部设置,见 singleInstance.ts)。
 */
export function applyInstanceBootstrap(instance: InstanceConfig, env: NodeJS.ProcessEnv = process.env): void {
  app.setName(instance.name)

  if (!env.CLAUDE_CONFIG_DIR) {
    env.CLAUDE_CONFIG_DIR = path.join(instance.dir, 'data')
  }
  app.setPath('userData', path.join(instance.dir, 'electron'))
}

/** 按实例目录派生稳定的 AppUserModelID,使任务栏/通知按实例分组。 */
export function instanceAppUserModelId(baseAppId: string, instance: InstanceConfig): string {
  const digest = createHash('sha1').update(instance.dir.toLowerCase()).digest('hex').slice(0, 8)
  return `${baseAppId}.instance.${digest}`
}

const BRAND_ARGV_PREFIX = '--cc-brand='

/**
 * 窗口/托盘图标路径。优先用 create-instance 生成的 .ico(Windows 下更锐利),
 * 否则退回用户给的原始图。
 */
export function instanceIconPath(instance: InstanceConfig): string | null {
  const ico = path.join(instance.dir, 'logo.ico')
  if (existsSync(ico)) return ico
  return instance.logoPath
}

/**
 * 传给渲染进程的品牌载荷(经 webPreferences.additionalArguments 同步送达)。
 *
 * 只带名称与强调色这两样小数据:它们必须在 renderer 模块加载时就位,好让
 * 模块级常量(如 About 页的仓库链接)与 i18n 的 {brand} 变量一次取到正确值。
 * logo 不在这里传(命令行有长度上限),由渲染层经 IPC 异步取 data URL。
 */
export function buildBrandArgv(instance: InstanceConfig): string {
  const payload = JSON.stringify({ name: instance.name, accent: instance.accent })
  return BRAND_ARGV_PREFIX + Buffer.from(payload, 'utf8').toString('base64')
}

const LOGO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
}

/**
 * 把 logo 读成 data URL 交给渲染层。
 *
 * 走 IPC 而不是命令行参数:命令行在 Windows 上有长度上限,大图会被截断;
 * 而 renderer 侧 CSP 已允许 `img-src data:`,data URL 是最省事的通路。
 */
export function readLogoDataUrl(logoPath: string | null): string | null {
  if (!logoPath || !existsSync(logoPath)) return null
  try {
    const mime = LOGO_MIME[path.extname(logoPath).toLowerCase()] ?? 'image/png'
    return `data:${mime};base64,${readFileSync(logoPath).toString('base64')}`
  } catch {
    return null
  }
}

/** 从命令行解析品牌载荷(preload 用;sandbox 下 preload 读不了文件,只能读 argv)。 */
export function parseBrandArgv(argv: readonly string[] = process.argv): { name: string; accent: string | null } | null {
  const hit = argv.find(arg => arg.startsWith(BRAND_ARGV_PREFIX))
  if (!hit) return null
  try {
    const json = Buffer.from(hit.slice(BRAND_ARGV_PREFIX.length), 'base64').toString('utf8')
    const parsed = JSON.parse(json) as { name?: unknown; accent?: unknown }
    if (typeof parsed.name !== 'string' || !parsed.name) return null
    return {
      name: parsed.name,
      accent: typeof parsed.accent === 'string' ? parsed.accent : null,
    }
  } catch {
    return null
  }
}
