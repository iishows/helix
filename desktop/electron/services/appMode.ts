import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { BRAND } from '../../src/brand/generated'
import type { AppModeConfig, AppModeSetInput } from '../../src/lib/desktopHost/types'

const APP_MODE_FILE = 'app-mode.json'

/**
 * 旧版本的「默认」模式把便携目录写成系统目录(~/.claude),与 Claude Code CLI
 * 及其他品牌共用一份数据。该标记表示 app-mode.json 已按品牌目录语义归一化过,
 * 避免每次启动都重复改写用户的选择。
 */
const BRAND_DATA_VERSION = 1

export type AppModeAppLike = {
  getPath(name: 'exe' | 'home' | 'userData' | 'appData'): string
}

type PersistedAppModeConfig = {
  mode?: string
  portable_dir?: string | null
  brand_data_version?: number
}

export function systemClaudeConfigDir(app: AppModeAppLike): string {
  return path.join(app.getPath('home'), '.claude')
}

/**
 * 本品牌的默认数据目录:%APPDATA%\<productName>\data。
 *
 * 与 profiles\<name>\data 同构(都是应用私有、按品牌/实例隔离),因此默认 profile
 * 与自建 profile 的目录语义一致,不再与 Claude Code CLI 共享 ~/.claude。
 */
export function brandDataDir(app: AppModeAppLike): string {
  return path.join(app.getPath('appData'), BRAND.productName, 'data')
}

/** 目录相等判断;Windows 路径大小写不敏感。 */
export function sameDir(a: string, b: string): boolean {
  const resolvedA = path.resolve(a)
  const resolvedB = path.resolve(b)
  return process.platform === 'win32'
    ? resolvedA.toLowerCase() === resolvedB.toLowerCase()
    : resolvedA === resolvedB
}

/**
 * 迁移时只搬运「能让你免于重新登录」的最小集合。
 * 会话历史(projects/)、索引库与 traces 等大件一律不搬 —— 见 seedBrandDataDir 注释。
 */
export const SEED_FILES = ['.credentials.json', 'settings.json', 'config.json']

/**
 * 首次启用品牌默认目录时,从原目录复制凭据与配置,避免用户重新登录。
 *
 * 只复制 SEED_FILES 且只在目标缺失时复制,因此可反复调用(重启安全)、不会覆盖
 * 用户在新目录里的既有改动。大件(会话历史、db、traces、voice)刻意不搬。
 */
export function seedBrandDataDir(targetDir: string, sourceDir: string): string[] {
  if (sameDir(targetDir, sourceDir)) return []

  const copied: string[] = []
  for (const file of SEED_FILES) {
    const target = path.join(targetDir, file)
    if (fs.existsSync(target)) continue
    const source = path.join(sourceDir, file)
    if (!fs.existsSync(source)) continue
    try {
      fs.mkdirSync(targetDir, { recursive: true })
      fs.copyFileSync(source, target)
      copied.push(file)
    } catch {
      /* 单个文件复制失败不应阻断启动 */
    }
  }
  return copied
}

function readAppModeConfig(configDir: string): PersistedAppModeConfig | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(configDir, APP_MODE_FILE), 'utf8')) as PersistedAppModeConfig
    return {
      mode: typeof parsed.mode === 'string' ? parsed.mode.toLowerCase() : 'default',
      portable_dir: typeof parsed.portable_dir === 'string' ? parsed.portable_dir.trim() : null,
      brand_data_version: typeof parsed.brand_data_version === 'number' ? parsed.brand_data_version : undefined,
    }
  } catch {
    return null
  }
}

/**
 * 把历史遗留的「默认」模式记录归一化到品牌目录语义。
 *
 * 旧版本在未选择自定义目录时,会把便携目录持久化成 ~/.claude —— 与用户主动选择
 * 「共用 Claude Code 目录」的记录形状完全相同,无法从内容上区分。因此只对**没有**
 * 版本标记、且便携目录恰好等于系统目录的记录做一次改写;其余记录(指向别的自定义
 * 目录、或已带标记的)仅补写版本标记,保留用户原意。
 */
function normalizeLegacyDefault(app: AppModeAppLike): void {
  const userData = app.getPath('userData')
  const config = readAppModeConfig(userData)
  if (!config || config.brand_data_version === BRAND_DATA_VERSION) return

  const isLegacyDefault =
    config.mode === 'portable' &&
    Boolean(config.portable_dir) &&
    sameDir(config.portable_dir!, systemClaudeConfigDir(app))

  writeAppModeConfig(userData, isLegacyDefault
    ? { mode: 'default', portable_dir: null, brand_data_version: BRAND_DATA_VERSION }
    : { brand_data_version: BRAND_DATA_VERSION })
}

function writeAppModeConfig(configDir: string, config: PersistedAppModeConfig): void {
  fs.mkdirSync(configDir, { recursive: true })
  const target = path.join(configDir, APP_MODE_FILE)
  const temporary = path.join(configDir, `.${APP_MODE_FILE}.${randomUUID()}.tmp`)
  let previous: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(target, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) previous = parsed as Record<string, unknown>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  try {
    const descriptor = fs.openSync(temporary, 'wx', 0o600)
    try {
      fs.writeFileSync(descriptor, JSON.stringify({ ...previous, ...config }, null, 2))
      fs.fsyncSync(descriptor)
    } finally { fs.closeSync(descriptor) }
    fs.renameSync(temporary, target)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

function assertWritableDataDir(configDir: string): void {
  try {
    fs.mkdirSync(configDir, { recursive: true })
    const probeDir = fs.mkdtempSync(path.join(configDir, '.cc-haha-write-test-'))
    try {
      fs.writeFileSync(path.join(probeDir, 'probe'), '')
    } finally {
      fs.rmSync(probeDir, { recursive: true, force: true })
    }
  } catch {
    throw new Error(`Data storage directory is not writable: ${configDir}`)
  }
}

function resolveWithExistingAncestor(inputPath: string): string {
  let existingPath = path.resolve(inputPath)
  const missingSegments: string[] = []
  while (!fs.existsSync(existingPath)) {
    const parent = path.dirname(existingPath)
    if (parent === existingPath) return path.resolve(inputPath)
    missingSegments.unshift(path.basename(existingPath))
    existingPath = parent
  }
  return path.join(fs.realpathSync.native(existingPath), ...missingSegments)
}

function isPathAtOrBelow(parentDir: string, candidateDir: string): boolean {
  const relative = path.relative(
    resolveWithExistingAncestor(parentDir),
    resolveWithExistingAncestor(candidateDir),
  )
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

export function normalizedCustomDir(app: AppModeAppLike, value: string | null | undefined): string {
  const selectedDir = value?.trim()
  if (!selectedDir) throw new Error('Choose an absolute custom data directory')
  if (!path.isAbsolute(selectedDir)) throw new Error('Custom data storage must use an absolute path')

  const normalized = path.resolve(selectedDir)
  if (isPathAtOrBelow(path.dirname(app.getPath('exe')), normalized)) {
    throw new Error('Custom data storage must stay outside the application install directory')
  }
  return normalized
}

function externallyControlled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.CLAUDE_CONFIG_DIR && env.CC_HAHA_APP_PORTABLE_DIR !== '1')
}

// The app-managed portable selection is process-local derived state; the
// persisted app-mode.json stays the source of truth. Strip it before this
// environment reaches another process (app.relaunch(), the NSIS installer
// spawned by quitAndInstall()), otherwise the child would trust a snapshot
// that may no longer match the persisted mode (#1160).
export function clearAppManagedPortableEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env.CC_HAHA_APP_PORTABLE_DIR !== '1') return
  delete env.CLAUDE_CONFIG_DIR
  delete env.CC_HAHA_APP_PORTABLE_DIR
  delete env.WEBVIEW2_USER_DATA_FOLDER
}

export function determineStartupPortableDir(
  app: AppModeAppLike,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (env.CLAUDE_CONFIG_DIR) return null

  const config = readAppModeConfig(app.getPath('userData'))
  if (config?.mode !== 'portable' || !config.portable_dir || !path.isAbsolute(config.portable_dir)) return null

  try {
    return normalizedCustomDir(app, config.portable_dir)
  } catch {
    return null
  }
}

export function applyStartupPortableMode(
  app: AppModeAppLike,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  // app.relaunch() inherits process.env. Discard the previous app-managed
  // selection so the persisted two-mode record remains authoritative.
  clearAppManagedPortableEnv(env)
  normalizeLegacyDefault(app)

  // 环境变量接管时只做规范化,并把归属权留给外部;不写 CC_HAHA_APP_PORTABLE_DIR,
  // 这样 getAppMode() 仍会把它标成 'environment'。
  if (env.CLAUDE_CONFIG_DIR && env.CLAUDE_CONFIG_DIR !== '') {
    const normalized = normalizedCustomDir(app, env.CLAUDE_CONFIG_DIR)
    env.CLAUDE_CONFIG_DIR = normalized
    return null
  }

  const configDir = determineStartupPortableDir(app, env) ?? brandDataDir(app)

  // 走品牌默认目录时,从系统目录补一次凭据/配置,免得升级后要重新登录。
  // 用户显式选了别的目录(persisted)时不搬 —— 那是他自己管的路径。
  if (sameDir(configDir, brandDataDir(app))) {
    seedBrandDataDir(configDir, systemClaudeConfigDir(app))
  }

  const webViewDataDir = path.join(configDir, 'EBWebView')
  fs.mkdirSync(webViewDataDir, { recursive: true })
  env.CLAUDE_CONFIG_DIR = configDir
  // 标记为「应用托管」:setAppMode() 只有看到它才允许在应用内切换数据目录
  // (否则一律按外部环境变量接管而拒绝写入)。
  env.CC_HAHA_APP_PORTABLE_DIR = '1'
  env.WEBVIEW2_USER_DATA_FOLDER = webViewDataDir
  return configDir
}

export function getAppMode(
  app: AppModeAppLike,
  env: NodeJS.ProcessEnv = process.env,
): AppModeConfig {
  // 两个候选目录一并回传,设置界面要显示「默认落点」与「共用 Claude Code 的目标」。
  const paths = { brandConfigDir: brandDataDir(app), systemConfigDir: systemClaudeConfigDir(app) }

  const envConfigDir = env.CLAUDE_CONFIG_DIR
    ? normalizedCustomDir(app, env.CLAUDE_CONFIG_DIR)
    : null

  if (envConfigDir) {
    // 应用自己写进去的品牌目录 ≈ 默认模式;外部注入的才是 'environment'。
    const appManaged = env.CC_HAHA_APP_PORTABLE_DIR === '1'
    const isBrandDefault = appManaged && sameDir(envConfigDir, paths.brandConfigDir)

    return {
      ...paths,
      mode: isBrandDefault ? 'default' : 'portable',
      portableDir: isBrandDefault ? null : envConfigDir,
      activeConfigDir: envConfigDir,
      configDirSource: appManaged ? (isBrandDefault ? 'brand' : 'portable') : 'environment',
    }
  }

  const persistedCustomDir = determineStartupPortableDir(app, env)
  if (persistedCustomDir) {
    return {
      ...paths,
      mode: 'portable',
      portableDir: persistedCustomDir,
      activeConfigDir: persistedCustomDir,
      configDirSource: 'portable',
    }
  }

  return {
    ...paths,
    mode: 'default',
    portableDir: null,
    activeConfigDir: paths.brandConfigDir,
    configDirSource: 'brand',
  }
}

export function setAppMode(
  app: AppModeAppLike,
  input: AppModeSetInput,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (externallyControlled(env)) {
    throw new Error('CLAUDE_CONFIG_DIR is controlled by the launch environment')
  }

  if (input.mode === 'default') {
    writeAppModeConfig(app.getPath('userData'), {
      mode: 'default',
      portable_dir: null,
      brand_data_version: BRAND_DATA_VERSION,
    })
    return
  }
  if (input.mode !== 'portable') throw new Error(`Unsupported app mode: ${String(input.mode)}`)

  const selectedDir = normalizedCustomDir(app, input.portableDir)
  if (fs.existsSync(selectedDir) && !fs.statSync(selectedDir).isDirectory()) {
    throw new Error(`Custom data storage path is not a directory: ${selectedDir}`)
  }
  assertWritableDataDir(selectedDir)
  writeAppModeConfig(app.getPath('userData'), {
    mode: 'portable',
    portable_dir: selectedDir,
    // 用户显式选择后即打标,后续启动不再重复归一化。
    brand_data_version: BRAND_DATA_VERSION,
  })
}
