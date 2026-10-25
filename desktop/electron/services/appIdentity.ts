import { existsSync } from 'node:fs'
import path from 'node:path'
import type { BrowserWindow } from 'electron'
import { BRAND } from '../../src/brand/generated'

export type AppUserModelIdHost = {
  setAppUserModelId(id: string): void
}

// Must stay in sync with build.appId in desktop/package.json. Windows attributes
// toast notifications (and taskbar pinning) to this AppUserModelID; without an
// explicit call, notifications from a dev/unpackaged run can silently fail to show.
// 取品牌 appId —— 多品牌共存时避免任务栏/通知互相串扰。
export const WINDOWS_APP_USER_MODEL_ID = BRAND.appId

export function applyWindowsAppUserModelId(
  app: AppUserModelIdHost,
  platform: NodeJS.Platform = process.platform,
  appUserModelId: string = WINDOWS_APP_USER_MODEL_ID,
): boolean {
  if (platform !== 'win32') return false
  app.setAppUserModelId(appUserModelId)
  return true
}

type WindowsIconPaths = {
  desktopRoot: string
  resourcesPath: string
}

// BrowserWindow can read the bundled icon through Electron's ASAR-aware file
// APIs, but Explorer cannot. Keep a real ICO beside app.asar for new taskbar pins.
// 传入 instanceIcon 时优先用它,使每个实例的窗口/任务栏拿到自己的 logo。
export function resolveWindowsWindowIcon(
  paths: WindowsIconPaths,
  platform: NodeJS.Platform = process.platform,
  instanceIcon?: string | null,
): string | undefined {
  if (platform !== 'win32') return undefined
  return [
    ...(instanceIcon ? [instanceIcon] : []),
    path.join(paths.resourcesPath, 'app-icon.ico'),
    path.join(paths.desktopRoot, 'src-tauri', 'icons', 'icon.ico'),
  ].find(candidate => existsSync(candidate))
}

export function applyWindowsTaskbarIdentity(
  window: Pick<BrowserWindow, 'setAppDetails'>,
  paths: WindowsIconPaths & {
    isPackaged: boolean
    executablePath: string
    /** 实例图标(logo.ico),缺省用打包图标 */
    instanceIcon?: string | null
    /** 实例 AppUserModelID,缺省用品牌默认值 */
    appUserModelId?: string
    /** 任务栏/固定快捷方式的显示名,缺省用品牌产品名 */
    displayName?: string
    /** 重启命令行附加参数(如 --instance="..."),使"固定到任务栏"能重开同一实例 */
    relaunchArgs?: string
  },
  platform: NodeJS.Platform = process.platform,
): boolean {
  // A development launch targets electron.exe and needs the entry script and
  // dev-server environment. Do not turn its button into a production shortcut.
  if (platform !== 'win32' || !paths.isPackaged) return false
  const externalIcon = path.join(paths.resourcesPath, 'app-icon.ico')
  const iconPath = paths.instanceIcon && existsSync(paths.instanceIcon)
    ? paths.instanceIcon
    : (existsSync(externalIcon) ? externalIcon : paths.executablePath)
  window.setAppDetails({
    appId: paths.appUserModelId || WINDOWS_APP_USER_MODEL_ID,
    appIconPath: iconPath,
    appIconIndex: 0,
    relaunchCommand: `"${paths.executablePath}"${paths.relaunchArgs ? ` ${paths.relaunchArgs}` : ''}`,
    relaunchDisplayName: paths.displayName || BRAND.productName,
  })
  return true
}
