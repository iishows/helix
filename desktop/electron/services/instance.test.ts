/**
 * services/instance.ts 的单测。
 *
 * 重点是不变量：
 * - 命令行解析（--instance=<dir>，含引号/空格/缺失）
 * - instance.json 逐项退化（损坏、越界 logo、非法 accent）
 * - applyInstanceBootstrap 的设置项，尤其**不得**再强制禁用单实例锁
 *   （回归护栏：那会让同一 profile 重复启动时无限多开）
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setName = vi.fn()
const setPath = vi.fn()

vi.mock('electron', () => ({
  app: {
    setName: (name: string) => setName(name),
    setPath: (name: string, value: string) => setPath(name, value),
  },
}))

const { applyInstanceBootstrap, readInstanceArg, resolveInstance } = await import('./instance')

let tempDir = ''

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'instance-test-'))
  setName.mockClear()
  setPath.mockClear()
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('readInstanceArg', () => {
  it('读取 --instance=<dir>', () => {
    expect(readInstanceArg(['electron', '--instance=D:\\instances\\work'])).toBe('D:\\instances\\work')
  })

  it('剥掉包裹的引号（路径含空格）', () => {
    expect(readInstanceArg(['--instance="D:\\my folder\\work"'])).toBe('D:\\my folder\\work')
  })

  it('缺失、空串、纯空白均返回 null', () => {
    expect(readInstanceArg(['electron'])).toBeNull()
    expect(readInstanceArg(['--instance='])).toBeNull()
    expect(readInstanceArg(['--instance=   '])).toBeNull()
    expect(readInstanceArg(['--instance=""'])).toBeNull()
  })
})

describe('resolveInstance', () => {
  it('无 --instance 时返回 null（保持单实例原状）', () => {
    expect(resolveInstance(['electron'])).toBeNull()
  })

  it('无 instance.json 时名称退化为目录名', () => {
    const dir = path.join(tempDir, '工作')
    mkdirSync(dir, { recursive: true })

    const instance = resolveInstance(['--instance=' + dir])

    expect(instance).not.toBeNull()
    expect(instance!.dir).toBe(path.resolve(dir))
    expect(instance!.name).toBe('工作')
    expect(instance!.logoPath).toBeNull()
    expect(instance!.accent).toBeNull()
  })

  it('读取 instance.json 的 name/logo/accent', () => {
    const dir = path.join(tempDir, 'work')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'logo.png'), 'fake-png')
    writeFileSync(
      path.join(dir, 'instance.json'),
      JSON.stringify({ name: '工作台', logo: 'logo.png', accent: '#1a2b3c' }),
    )

    const instance = resolveInstance(['--instance=' + dir])!

    expect(instance.name).toBe('工作台')
    expect(instance.logoPath).toBe(path.join(path.resolve(dir), 'logo.png'))
    expect(instance.accent).toBe('#1a2b3c')
  })

  it('拒绝指向目录之外的 logo', () => {
    const dir = path.join(tempDir, 'work')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      path.join(dir, 'instance.json'),
      JSON.stringify({ name: 'x', logo: '..\\outside.png' }),
    )

    expect(resolveInstance(['--instance=' + dir])!.logoPath).toBeNull()
  })

  it('非法 accent 被丢弃', () => {
    const dir = path.join(tempDir, 'work')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      path.join(dir, 'instance.json'),
      JSON.stringify({ name: 'x', accent: 'red' }),
    )

    expect(resolveInstance(['--instance=' + dir])!.accent).toBeNull()
  })

  it('instance.json 损坏时逐项退化为默认值', () => {
    const dir = path.join(tempDir, 'broken')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'instance.json'), '{ not json')

    const instance = resolveInstance(['--instance=' + dir])!

    expect(instance.name).toBe('broken')
    expect(instance.logoPath).toBeNull()
    expect(instance.accent).toBeNull()
  })
})

describe('applyInstanceBootstrap', () => {
  const instance = {
    dir: path.resolve('D:\\instances\\work'),
    name: '工作',
    logoPath: null,
    accent: null,
  }

  it('设置应用名、配置目录与 Electron 缓存目录', () => {
    const env: NodeJS.ProcessEnv = {}
    applyInstanceBootstrap(instance, env)

    expect(setName).toHaveBeenCalledWith('工作')
    expect(env.CLAUDE_CONFIG_DIR).toBe(path.join(instance.dir, 'data'))
    expect(setPath).toHaveBeenCalledWith('userData', path.join(instance.dir, 'electron'))
  })

  it('不覆盖外部已指定的 CLAUDE_CONFIG_DIR', () => {
    const env: NodeJS.ProcessEnv = { CLAUDE_CONFIG_DIR: 'D:\\custom' }
    applyInstanceBootstrap(instance, env)

    expect(env.CLAUDE_CONFIG_DIR).toBe('D:\\custom')
  })

  // 回归护栏：曾经这里置 1 强制禁用单实例锁，导致同一 profile 点几次就开几个窗口。
  // 现在锁交给 Electron 按 userData 隔离处理，本函数不得再设置该变量。
  it('不再强制禁用单实例锁', () => {
    const env: NodeJS.ProcessEnv = {}
    applyInstanceBootstrap(instance, env)

    expect(env.CC_HAHA_ELECTRON_DISABLE_SINGLE_INSTANCE_LOCK).toBeUndefined()
  })

  it('外部显式设置的逃生开关保持原样', () => {
    const env: NodeJS.ProcessEnv = { CC_HAHA_ELECTRON_DISABLE_SINGLE_INSTANCE_LOCK: '1' }
    applyInstanceBootstrap(instance, env)

    expect(env.CC_HAHA_ELECTRON_DISABLE_SINGLE_INSTANCE_LOCK).toBe('1')
  })
})
