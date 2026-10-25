import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { createElectronHost } from '../src/lib/desktopHost/electronHost'
import type { DesktopHostUnlisten } from '../src/lib/desktopHost/types'
import type { ElectronEventChannel, ElectronIpcChannel } from './ipc/channels'

// 实例品牌载荷由主进程经 additionalArguments 送进本进程;sandbox 下 preload
// 读不了文件,但能读 process.argv,因此名称/强调色在这里同步取出。
const brandArg = process.argv.find(arg => arg.startsWith('--cc-brand='))
let brand: { name: string; accent: string | null } | null = null
if (brandArg) {
  try {
    const parsed = JSON.parse(Buffer.from(brandArg.slice('--cc-brand='.length), 'base64').toString('utf8'))
    if (typeof parsed?.name === 'string' && parsed.name) {
      brand = { name: parsed.name, accent: typeof parsed.accent === 'string' ? parsed.accent : null }
    }
  } catch {
    brand = null
  }
}

const electronHost = createElectronHost({
  brand,
  getPathForFile(file) {
    return webUtils.getPathForFile(file)
  },
  invoke<T>(channel: ElectronIpcChannel, payload?: unknown): Promise<T> {
    return ipcRenderer.invoke(channel, payload) as Promise<T>
  },
  subscribe<T>(
    channel: ElectronEventChannel,
    handler: (payload: T) => void,
  ): Promise<DesktopHostUnlisten> {
    const listener = (_event: Electron.IpcRendererEvent, payload: T) => handler(payload)
    ipcRenderer.on(channel, listener)
    return Promise.resolve(() => {
      ipcRenderer.removeListener(channel, listener)
    })
  },
})

contextBridge.exposeInMainWorld('desktopHost', electronHost)
