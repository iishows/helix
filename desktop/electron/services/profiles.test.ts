/**
 * services/profiles.ts 的单测。
 *
 * 重点是安全相关的不变量：名称收敛（防路径穿越）、拒绝删/改越界目录、
 * 以及手写的 PNG→ICO 打包是否正确。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// profiles.ts 会在运行时 import electron，测试里必须顶掉；
// userData 指向每个用例各自的临时目录。
let userDataDir = ''
let appDataDir = ''
let desktopDir = ''

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'desktop') return desktopDir
      if (name === 'appData') return appDataDir
      return userDataDir
    },
    getName: () => 'Helix',
    isPackaged: true,
    getAppPath: () => userDataDir,
  },
  shell: { writeShortcutLink: vi.fn(() => true) },
}))

const { createProfile, deleteProfile, listProfiles, profilesRoot, renameProfile, sanitizeProfileDirName } =
  await import('./profiles')

/** 1x1 的合法 PNG，用来验证 ICO 打包。 */
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

let sandbox = ''
let logoFile = ''

beforeEach(() => {
  sandbox = mkdtempSync(path.join(tmpdir(), 'profiles-test-'))
  userDataDir = path.join(sandbox, 'userData')
  appDataDir = path.join(sandbox, 'AppData')
  desktopDir = path.join(sandbox, 'Desktop')
  mkdirSync(userDataDir, { recursive: true })
  mkdirSync(appDataDir, { recursive: true })
  mkdirSync(desktopDir, { recursive: true })
  logoFile = path.join(sandbox, 'logo.png')
  writeFileSync(logoFile, ONE_PX_PNG)
})

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true })
})

describe('sanitizeProfileDirName', () => {
  it('strips path separators so a name cannot escape the profiles root', () => {
    expect(sanitizeProfileDirName('../../etc')).toBe('....etc')
    expect(sanitizeProfileDirName('a/b\\c')).toBe('abc')
    expect(sanitizeProfileDirName('C:work')).toBe('Cwork')
  })

  it('strips characters Windows forbids in filenames', () => {
    expect(sanitizeProfileDirName('a*b?c"d<e>f|g')).toBe('abcdefg')
  })

  it('falls back when the name reduces to nothing', () => {
    expect(sanitizeProfileDirName('   ')).toBe('profile')
    expect(sanitizeProfileDirName('///')).toBe('profile')
  })
})

describe('listProfiles', () => {
  it('always leads with the default entry and marks the current profile', () => {
    const entries = listProfiles(null, '/shared/config')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ isDefault: true, isCurrent: true, dataDir: '/shared/config', dir: '' })
  })

  it('ignores directories that are not profiles', () => {
    mkdirSync(path.join(profilesRoot(), 'not-a-profile'), { recursive: true })
    const entries = listProfiles(null, '/shared/config')
    expect(entries).toHaveLength(1)
  })

  it('includes created profiles and flags the running one', () => {
    const created = createProfile({ name: '工作' }, '/shared/config')
    const entries = listProfiles(created.dir, '/shared/config')
    const work = entries.find(e => e.name === '工作')
    expect(work).toMatchObject({ isCurrent: true, isDefault: false })
    expect(work?.dataDir).toBe(path.join(created.dir, 'data'))
  })
})

describe('createProfile', () => {
  it('writes instance.json with name, logo and accent, and packs a PNG logo into .ico', () => {
    const result = createProfile({ name: '工作', logoPath: logoFile, accent: '#6C5CE7' }, '/shared/config')

    const config = JSON.parse(readFileSync(path.join(result.dir, 'instance.json'), 'utf8'))
    expect(config).toEqual({ name: '工作', logo: 'logo.png', accent: '#6C5CE7' })
    expect(result.icoGenerated).toBe(true)

    // 校验 ICO 头：type=1(icon)、count=1，且内嵌的正是原始 PNG。
    const ico = readFileSync(path.join(result.dir, 'logo.ico'))
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(1)
    expect(ico.readUInt32LE(14)).toBe(ONE_PX_PNG.length)
    expect(ico.subarray(22)).toEqual(ONE_PX_PNG)
  })

  it('creates the data and electron subdirectories', () => {
    const result = createProfile({ name: '个人' }, '/shared/config')
    expect(() => readFileSync(path.join(result.dir, 'data', 'x'))).toThrow()
    expect(readFileSync(path.join(result.dir, 'instance.json'), 'utf8')).toContain('个人')
    expect(listProfiles(null, '/shared').some(e => e.name === '个人')).toBe(true)
  })

  it('rejects a duplicate name instead of overwriting', () => {
    createProfile({ name: '工作' }, '/shared/config')
    expect(() => createProfile({ name: '工作' }, '/shared/config')).toThrow(/already exists/)
  })

  it('rejects a missing logo file', () => {
    expect(() => createProfile({ name: '工作', logoPath: path.join(sandbox, 'nope.png') }, '/x'))
      .toThrow(/logo not found/)
  })

  it('requires a name', () => {
    expect(() => createProfile({ name: '  ' }, '/x')).toThrow(/name is required/)
  })

  it('roots profiles under appData, not the per-instance userData', () => {
    // 回归：实例模式下 userData 会被指向 <实例>\electron，
    // 若用它拼根目录，新 profile 就会嵌进当前实例里。
    expect(profilesRoot()).toBe(path.join(appDataDir, 'Helix', 'profiles'))
    expect(profilesRoot()).not.toContain('userData')
  })

  it('copies only credentials and settings when seeding, never history', () => {
    const source = path.join(sandbox, 'sourceData')
    mkdirSync(source, { recursive: true })
    writeFileSync(path.join(source, '.credentials.json'), '{}')
    writeFileSync(path.join(source, 'settings.json'), '{}')
    mkdirSync(path.join(source, 'projects'), { recursive: true })

    const result = createProfile({ name: '工作', seedFromCurrent: true }, source)
    expect(result.seeded.sort()).toEqual(['.credentials.json', 'settings.json'])
    expect(readFileSync(path.join(result.dir, 'data', 'settings.json'), 'utf8')).toBe('{}')
    // 会话历史目录不应被带过来
    expect(() => readFileSync(path.join(result.dir, 'data', 'projects'))).toThrow()
  })
})

describe('deleteProfile / renameProfile', () => {
  it('refuses to delete the default profile', () => {
    const def = listProfiles(null, '/shared')[0]!
    expect(() => deleteProfile(def)).toThrow(/default profile cannot be deleted/)
  })

  it('refuses to delete the profile that is currently running', () => {
    const created = createProfile({ name: '工作' }, '/shared')
    const entry = listProfiles(created.dir, '/shared').find(e => e.name === '工作')!
    expect(() => deleteProfile(entry)).toThrow(/running profile cannot be deleted/)
  })

  it('refuses to touch a directory outside the profiles root', () => {
    const outside = path.join(sandbox, 'elsewhere')
    mkdirSync(outside, { recursive: true })
    const rogue = {
      dir: outside, name: 'rogue', logoDataUrl: null, accent: null,
      isDefault: false, isCurrent: false, dataDir: outside, hasShortcut: false,
    }
    expect(() => deleteProfile(rogue)).toThrow(/outside the profiles directory/)
  })

  it('deletes a real profile directory', () => {
    const created = createProfile({ name: '工作' }, '/shared')
    const entry = listProfiles(null, '/shared').find(e => e.name === '工作')!
    deleteProfile(entry)
    expect(listProfiles(null, '/shared').some(e => e.name === '工作')).toBe(false)
    expect(created.dir).not.toBe('')
  })

  it('refuses to rename the default profile', () => {
    const def = listProfiles(null, '/shared')[0]!
    expect(() => renameProfile(def, 'x')).toThrow(/default profile cannot be renamed/)
  })

  it('renames a profile and keeps the directory in sync', () => {
    createProfile({ name: '工作' }, '/shared')
    const entry = listProfiles(null, '/shared').find(e => e.name === '工作')!
    renameProfile(entry, '工作区')

    const renamed = listProfiles(null, '/shared').find(e => e.name === '工作区')
    expect(renamed).toBeDefined()
    expect(renamed!.dir).toContain('工作区')
  })
})
