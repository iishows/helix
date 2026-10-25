import { existsSync } from 'node:fs'
import path from 'node:path'
import type { App, Tray } from 'electron'
import { BRAND } from '../../src/brand/generated'

type ElectronTrayRuntime = Pick<typeof import('electron'), 'Menu' | 'Tray' | 'nativeImage'>

export type TrayController = {
  tray: Tray
  dispose(): void
}

export function resolveTrayIconPath(desktopRoot: string, instanceIcon?: string | null): string {
  const candidates = [
    ...(instanceIcon ? [instanceIcon] : []),
    path.join(desktopRoot, 'src-tauri', 'icons', 'icon.png'),
    path.join(desktopRoot, 'public', 'app-icon.png'),
    path.join(desktopRoot, 'dist', 'app-icon.png'),
  ]
  const resolved = candidates.find(candidate => existsSync(candidate))
  if (!resolved) {
    throw new Error(`Electron tray icon not found under ${desktopRoot}`)
  }
  return resolved
}

export function shouldInstallTray(platform = process.platform): boolean {
  return platform !== 'darwin'
}

export async function installTray({
  app,
  desktopRoot,
  show,
  quit,
  instanceIcon,
  electronRuntime,
}: {
  app: App
  desktopRoot: string
  show: () => void
  quit: () => void
  /** 实例图标路径(logo.png/ico),缺省用打包图标 */
  instanceIcon?: string | null
  electronRuntime?: ElectronTrayRuntime
}): Promise<TrayController> {
  const { Menu, Tray, nativeImage } = electronRuntime ?? await import('electron')
  const icon = nativeImage.createFromPath(resolveTrayIconPath(desktopRoot, instanceIcon))
  const tray = new Tray(icon)
  tray.setToolTip(app.name || BRAND.productName)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Show ${BRAND.productName}`, click: show },
    { type: 'separator' },
    { label: `Quit ${BRAND.productName}`, click: quit },
  ]))
  tray.on('click', show)

  return {
    tray,
    dispose() {
      tray.destroy()
    },
  }
}
