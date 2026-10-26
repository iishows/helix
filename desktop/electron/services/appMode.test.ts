import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BRAND } from '../../src/brand/generated'
import {
  applyStartupPortableMode,
  brandDataDir,
  clearAppManagedPortableEnv,
  determineStartupPortableDir,
  getAppMode,
  seedBrandDataDir,
  setAppMode,
  systemClaudeConfigDir,
  type AppModeAppLike,
} from './appMode'

const tempDirs: string[] = []

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-haha-app-mode-'))
  tempDirs.push(dir)
  return dir
}

function app(root = tempDir()): AppModeAppLike & { root: string } {
  const exe = path.join(root, 'install', 'Claude Code Haha')
  const home = path.join(root, 'home')
  const userData = path.join(root, 'user-data')
  const appData = path.join(root, 'app-data')
  fs.mkdirSync(path.dirname(exe), { recursive: true })
  fs.writeFileSync(exe, '')
  return {
    root,
    getPath(name) {
      if (name === 'exe') return exe
      if (name === 'home') return home
      if (name === 'appData') return appData
      return userData
    },
  }
}

function writeMode(fakeApp: AppModeAppLike, value: unknown) {
  const userData = fakeApp.getPath('userData')
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(path.join(userData, 'app-mode.json'), JSON.stringify(value))
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('Electron app mode service', () => {
  it('preserves unknown startup pointer fields when migrating to another root', () => {
    const fakeApp = app()
    writeMode(fakeApp, { mode: 'default', portable_dir: null, future: { preserve: true } })
    const selected = path.join(fakeApp.root, 'migrated')
    setAppMode(fakeApp, { mode: 'portable', portableDir: selected }, {})
    expect(JSON.parse(fs.readFileSync(path.join(fakeApp.getPath('userData'), 'app-mode.json'), 'utf8')))
      .toMatchObject({ mode: 'portable', portable_dir: selected, future: { preserve: true } })
  })
  it('defaults to the brand data directory and ignores app-adjacent legacy data at runtime', () => {
    const fakeApp = app()
    const legacyDir = path.join(path.dirname(fakeApp.getPath('exe')), 'CLAUDE_CONFIG_DIR')
    fs.mkdirSync(legacyDir, { recursive: true })
    fs.writeFileSync(path.join(legacyDir, 'settings.json'), '{"legacy":true}')

    expect(systemClaudeConfigDir(fakeApp)).toBe(path.join(fakeApp.root, 'home', '.claude'))
    expect(brandDataDir(fakeApp)).toBe(path.join(fakeApp.root, 'app-data', BRAND.productName, 'data'))
    expect(determineStartupPortableDir(fakeApp, {})).toBeNull()

    // 默认模式也必须设 CLAUDE_CONFIG_DIR:否则 sidecar 会按 `?? ~/.claude` 回落到共享目录。
    const env: NodeJS.ProcessEnv = {}
    expect(applyStartupPortableMode(fakeApp, env)).toBe(brandDataDir(fakeApp))
    expect(env).toMatchObject({
      CLAUDE_CONFIG_DIR: brandDataDir(fakeApp),
      CC_HAHA_APP_PORTABLE_DIR: '1',
      WEBVIEW2_USER_DATA_FOLDER: path.join(brandDataDir(fakeApp), 'EBWebView'),
    })
    expect(getAppMode(fakeApp, env)).toEqual({
      mode: 'default',
      portableDir: null,
      activeConfigDir: brandDataDir(fakeApp),
      configDirSource: 'brand',
      brandConfigDir: brandDataDir(fakeApp),
      systemConfigDir: path.join(fakeApp.root, 'home', '.claude'),
    })
  })

  it('never reads ~/.claude unless the user explicitly picks it', () => {
    const fakeApp = app()
    const homeClaude = path.join(fakeApp.root, 'home', '.claude')
    fs.mkdirSync(homeClaude, { recursive: true })
    fs.writeFileSync(path.join(homeClaude, 'settings.json'), '{"shared":true}')

    const env: NodeJS.ProcessEnv = {}
    expect(applyStartupPortableMode(fakeApp, env)).toBe(brandDataDir(fakeApp))
    expect(env.CLAUDE_CONFIG_DIR).not.toBe(homeClaude)
    expect(getAppMode(fakeApp, env).configDirSource).toBe('brand')

    // 显式选择「共用 Claude Code 目录」后才落到 ~/.claude,并标成 portable。
    setAppMode(fakeApp, { mode: 'portable', portableDir: homeClaude }, env)
    const sharingEnv: NodeJS.ProcessEnv = {}
    expect(applyStartupPortableMode(fakeApp, sharingEnv)).toBe(homeClaude)
    expect(getAppMode(fakeApp, sharingEnv)).toMatchObject({
      mode: 'portable',
      activeConfigDir: homeClaude,
      configDirSource: 'portable',
    })
  })

  it('normalizes a legacy record that pointed the default mode at ~/.claude', () => {
    const fakeApp = app()
    const homeClaude = systemClaudeConfigDir(fakeApp)
    writeMode(fakeApp, { mode: 'portable', portable_dir: homeClaude })

    const env: NodeJS.ProcessEnv = {}
    // 旧记录无法与「用户主动选 ~/.claude」区分,按历史默认处理:改回品牌目录。
    expect(applyStartupPortableMode(fakeApp, env)).toBe(brandDataDir(fakeApp))
    expect(JSON.parse(fs.readFileSync(path.join(fakeApp.getPath('userData'), 'app-mode.json'), 'utf8')))
      .toMatchObject({ mode: 'default', portable_dir: null, brand_data_version: 1 })
  })

  it('keeps a genuinely custom legacy directory and only stamps the version marker', () => {
    const fakeApp = app()
    const customDir = path.join(fakeApp.root, 'my-own-data')
    writeMode(fakeApp, { mode: 'portable', portable_dir: customDir })

    const env: NodeJS.ProcessEnv = {}
    expect(applyStartupPortableMode(fakeApp, env)).toBe(customDir)
    expect(env.CLAUDE_CONFIG_DIR).toBe(customDir)
    expect(JSON.parse(fs.readFileSync(path.join(fakeApp.getPath('userData'), 'app-mode.json'), 'utf8')))
      .toMatchObject({ mode: 'portable', portable_dir: customDir, brand_data_version: 1 })
  })

  it('seeds credentials from the system directory once, without overwriting later edits', () => {
    const fakeApp = app()
    const target = brandDataDir(fakeApp)
    const source = systemClaudeConfigDir(fakeApp)
    fs.mkdirSync(source, { recursive: true })
    for (const file of ['.credentials.json', 'settings.json', 'config.json']) {
      fs.writeFileSync(path.join(source, file), `{"from":"system","file":"${file}"}`)
    }
    fs.writeFileSync(path.join(source, 'projects'), 'not-a-file')

    expect(seedBrandDataDir(target, source).sort()).toEqual(['.credentials.json', 'config.json', 'settings.json'])
    expect(fs.readFileSync(path.join(target, 'settings.json'), 'utf8')).toContain('system')

    // 第二次调用不覆盖用户在新目录里的改动,也不再报告复制(重启安全)。
    const edited = '{"from":"user"}'
    fs.writeFileSync(path.join(target, 'settings.json'), edited)
    expect(seedBrandDataDir(target, source)).toEqual([])
    expect(fs.readFileSync(path.join(target, 'settings.json'), 'utf8')).toBe(edited)
  })

  it('activates only an explicit absolute custom directory persisted in userData', () => {
    const fakeApp = app()
    const customDir = path.join(fakeApp.root, 'custom-data')
    writeMode(fakeApp, { mode: 'portable', portable_dir: customDir })
    const env: NodeJS.ProcessEnv = {}

    expect(determineStartupPortableDir(fakeApp, env)).toBe(customDir)
    expect(applyStartupPortableMode(fakeApp, env)).toBe(customDir)
    expect(env).toMatchObject({
      CLAUDE_CONFIG_DIR: customDir,
      CC_HAHA_APP_PORTABLE_DIR: '1',
      WEBVIEW2_USER_DATA_FOLDER: path.join(customDir, 'EBWebView'),
    })
    expect(getAppMode(fakeApp, env)).toEqual({
      mode: 'portable',
      portableDir: customDir,
      activeConfigDir: customDir,
      configDirSource: 'portable',
      brandConfigDir: brandDataDir(fakeApp),
      systemConfigDir: systemClaudeConfigDir(fakeApp),
    })
  })

  it('treats an externally supplied CLAUDE_CONFIG_DIR as a read-only override', () => {
    const fakeApp = app()
    const externalDir = path.join(fakeApp.root, 'external-data')
    const env: NodeJS.ProcessEnv = { CLAUDE_CONFIG_DIR: externalDir }

    expect(determineStartupPortableDir(fakeApp, env)).toBeNull()
    expect(applyStartupPortableMode(fakeApp, env)).toBeNull()
    expect(env).toEqual({ CLAUDE_CONFIG_DIR: externalDir })
    expect(getAppMode(fakeApp, env)).toEqual({
      mode: 'portable',
      portableDir: externalDir,
      activeConfigDir: externalDir,
      configDirSource: 'environment',
      brandConfigDir: brandDataDir(fakeApp),
      systemConfigDir: systemClaudeConfigDir(fakeApp),
    })
    expect(() => setAppMode(fakeApp, { mode: 'default', portableDir: null }, env))
      .toThrow('CLAUDE_CONFIG_DIR is controlled by the launch environment')
  })

  it('rejects relative or install-contained external custom directories', () => {
    const fakeApp = app()
    const installData = path.join(path.dirname(fakeApp.getPath('exe')), 'external-data')

    expect(() => applyStartupPortableMode(fakeApp, {
      CLAUDE_CONFIG_DIR: 'relative-data',
    })).toThrow('absolute path')
    expect(() => getAppMode(fakeApp, {
      CLAUDE_CONFIG_DIR: 'relative-data',
    })).toThrow('absolute path')
    expect(() => applyStartupPortableMode(fakeApp, {
      CLAUDE_CONFIG_DIR: installData,
    })).toThrow('outside the application install directory')
  })

  it('clears only an app-managed portable selection from a handed-off environment', () => {
    const customDir = path.join(tempDir(), 'custom-data')
    const managedEnv: NodeJS.ProcessEnv = {
      CLAUDE_CONFIG_DIR: customDir,
      CC_HAHA_APP_PORTABLE_DIR: '1',
      WEBVIEW2_USER_DATA_FOLDER: path.join(customDir, 'EBWebView'),
      APPDATA: 'C:\\Users\\someone\\AppData\\Roaming',
    }
    clearAppManagedPortableEnv(managedEnv)
    expect(managedEnv).toEqual({ APPDATA: 'C:\\Users\\someone\\AppData\\Roaming' })

    const externalEnv: NodeJS.ProcessEnv = { CLAUDE_CONFIG_DIR: customDir }
    clearAppManagedPortableEnv(externalEnv)
    expect(externalEnv).toEqual({ CLAUDE_CONFIG_DIR: customDir })
  })

  it('drops inherited app-managed env so switching back to ~/.claude survives relaunch', () => {
    const fakeApp = app()
    writeMode(fakeApp, { mode: 'default', portable_dir: null })
    const oldCustomDir = path.join(fakeApp.root, 'old-custom')
    const env: NodeJS.ProcessEnv = {
      CLAUDE_CONFIG_DIR: oldCustomDir,
      CC_HAHA_APP_PORTABLE_DIR: '1',
      WEBVIEW2_USER_DATA_FOLDER: path.join(oldCustomDir, 'EBWebView'),
    }

    // 旧的 app-managed 选择被丢弃后,重新解析为品牌默认目录(而不是残留的 old-custom)。
    expect(applyStartupPortableMode(fakeApp, env)).toBe(brandDataDir(fakeApp))
    expect(env.CLAUDE_CONFIG_DIR).toBe(brandDataDir(fakeApp))
    expect(env.CC_HAHA_APP_PORTABLE_DIR).toBe('1')
    expect(getAppMode(fakeApp, env)).toMatchObject({
      mode: 'default',
      activeConfigDir: brandDataDir(fakeApp),
    })
  })

  it('replaces an inherited app-managed env with the newly persisted custom directory', () => {
    const fakeApp = app()
    const newCustomDir = path.join(fakeApp.root, 'new-custom')
    writeMode(fakeApp, { mode: 'portable', portable_dir: newCustomDir })
    const env: NodeJS.ProcessEnv = {
      CLAUDE_CONFIG_DIR: path.join(fakeApp.root, 'old-custom'),
      CC_HAHA_APP_PORTABLE_DIR: '1',
      WEBVIEW2_USER_DATA_FOLDER: path.join(fakeApp.root, 'old-custom', 'EBWebView'),
    }

    expect(applyStartupPortableMode(fakeApp, env)).toBe(newCustomDir)
    expect(env.CLAUDE_CONFIG_DIR).toBe(newCustomDir)
    expect(env.WEBVIEW2_USER_DATA_FOLDER).toBe(path.join(newCustomDir, 'EBWebView'))
  })

  it.each([
    { mode: 'portable', portable_dir: null },
    { mode: 'portable', portable_dir: '' },
    { mode: 'portable', portable_dir: 'relative-data' },
    { mode: 'unknown', portable_dir: '/tmp/custom' },
  ])('falls back to the brand default for invalid custom metadata: %o', value => {
    const fakeApp = app()
    writeMode(fakeApp, value)

    expect(determineStartupPortableDir(fakeApp, {})).toBeNull()
    expect(getAppMode(fakeApp, {})).toMatchObject({
      mode: 'default',
      portableDir: null,
      activeConfigDir: brandDataDir(fakeApp),
      configDirSource: 'brand',
    })
  })

  it('persists one atomic system-owned mode record for a custom directory', () => {
    const fakeApp = app()
    const customDir = path.join(fakeApp.root, 'custom-data')
    const previousActive = path.join(fakeApp.root, 'previous-custom')

    setAppMode(fakeApp, { mode: 'portable', portableDir: customDir }, {
      CLAUDE_CONFIG_DIR: previousActive,
      CC_HAHA_APP_PORTABLE_DIR: '1',
    })

    expect(JSON.parse(fs.readFileSync(path.join(fakeApp.getPath('userData'), 'app-mode.json'), 'utf8'))).toEqual({
      mode: 'portable',
      portable_dir: customDir,
      brand_data_version: 1,
    })
    expect(fs.existsSync(path.join(customDir, 'app-mode.json'))).toBe(false)
    expect(fs.existsSync(path.join(previousActive, 'app-mode.json'))).toBe(false)
    expect(fs.readdirSync(fakeApp.getPath('userData'))).toEqual(['app-mode.json'])
  })

  it('switches back to the brand default without touching the custom directory', () => {
    const fakeApp = app()
    const customDir = path.join(fakeApp.root, 'custom-data')
    fs.mkdirSync(customDir, { recursive: true })
    fs.writeFileSync(path.join(customDir, 'settings.json'), '{"keep":true}')
    writeMode(fakeApp, { mode: 'portable', portable_dir: customDir })

    setAppMode(fakeApp, { mode: 'default', portableDir: null }, {
      CLAUDE_CONFIG_DIR: customDir,
      CC_HAHA_APP_PORTABLE_DIR: '1',
    })

    expect(JSON.parse(fs.readFileSync(path.join(fakeApp.getPath('userData'), 'app-mode.json'), 'utf8'))).toEqual({
      mode: 'default',
      portable_dir: null,
      brand_data_version: 1,
    })
    expect(fs.readFileSync(path.join(customDir, 'settings.json'), 'utf8')).toBe('{"keep":true}')
  })

  it.each([
    { label: 'missing', value: null },
    { label: 'empty', value: '   ' },
    { label: 'relative', value: 'relative-data' },
  ])('rejects a $label custom directory', ({ value }) => {
    const fakeApp = app()

    expect(() => setAppMode(fakeApp, { mode: 'portable', portableDir: value }, {})).toThrow()
    expect(fs.existsSync(path.join(fakeApp.getPath('userData'), 'app-mode.json'))).toBe(false)
  })

  it('rejects custom directories inside the application install tree, including symlink aliases', () => {
    const fakeApp = app()
    const installDir = path.dirname(fakeApp.getPath('exe'))
    const aliasedInstallDir = path.join(fakeApp.root, 'install-alias')
    fs.symlinkSync(installDir, aliasedInstallDir, 'dir')

    expect(() => setAppMode(fakeApp, {
      mode: 'portable',
      portableDir: path.join(installDir, 'data'),
    }, {})).toThrow('outside the application install directory')
    expect(() => setAppMode(fakeApp, {
      mode: 'portable',
      portableDir: path.join(aliasedInstallDir, 'data'),
    }, {})).toThrow('outside the application install directory')
  })

  it('does not partially mutate process.env when custom startup preparation fails', () => {
    const fakeApp = app()
    const customDir = path.join(fakeApp.root, 'custom-data')
    writeMode(fakeApp, { mode: 'portable', portable_dir: customDir })
    const env: NodeJS.ProcessEnv = {}
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
      throw new Error('mkdir failed')
    })

    expect(() => applyStartupPortableMode(fakeApp, env)).toThrow('mkdir failed')
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined()
    expect(env.CC_HAHA_APP_PORTABLE_DIR).toBeUndefined()
    expect(env.WEBVIEW2_USER_DATA_FOLDER).toBeUndefined()
  })

  it('keeps the previous mode record if the atomic replacement fails', () => {
    const fakeApp = app()
    const modeFile = path.join(fakeApp.getPath('userData'), 'app-mode.json')
    writeMode(fakeApp, { mode: 'default', portable_dir: null })
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('rename failed')
    })

    expect(() => setAppMode(fakeApp, {
      mode: 'portable',
      portableDir: path.join(fakeApp.root, 'custom-data'),
    }, {})).toThrow('rename failed')
    expect(JSON.parse(fs.readFileSync(modeFile, 'utf8'))).toEqual({
      mode: 'default',
      portable_dir: null,
    })
    expect(fs.readdirSync(fakeApp.getPath('userData'))).toEqual(['app-mode.json'])
  })
})
