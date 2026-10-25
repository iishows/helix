import { getDesktopHost } from '../lib/desktopHost'
import { BRAND as DEFAULT_BRAND, type Brand } from './generated'

/**
 * 运行期品牌。
 *
 * 实例模式启动时,主进程把「名称 + 强调色」经 webPreferences.additionalArguments
 * 送进渲染进程,preload 读出后挂在 desktopHost.app.brand 上——这条通路是同步的,
 * 因此在**模块加载阶段**就能取到,模块级常量(About 页的仓库链接、i18n 的 {brand}
 * 变量)也会是正确值。logo 体积大,不走命令行,由 loadBrandLogo() 经 IPC 取 data URL。
 *
 * sandbox 下渲染层拿不到 process,所以这里只能经 desktopHost 读取。
 */

function readInjectedBrand(): { name: string; accent: string | null } | null {
  try {
    return getDesktopHost().app.brand ?? null
  } catch {
    return null
  }
}

const injected = readInjectedBrand()

/** 当前生效的品牌:实例注入值优先,否则回退编译期默认品牌。 */
export const BRAND: Brand = injected
  ? {
      ...DEFAULT_BRAND,
      productName: injected.name,
      windowTitle: injected.name,
      accent: injected.accent,
    }
  : DEFAULT_BRAND

/** 是否运行在实例模式(由 --instance 启动)。 */
export const IS_INSTANCE = injected !== null

/**
 * 取实例 logo 的 data URL。实例模式下由主进程读好送来;无实例返回 null
 * (调用方回退到内置 logo,即 BRAND.logo.mark)。
 */
export async function loadBrandLogo(): Promise<string | null> {
  if (!IS_INSTANCE) return null
  try {
    return (await getDesktopHost().app.getBrandLogo()) ?? null
  } catch {
    return null
  }
}

/**
 * 把取回的实例 logo 写进 BRAND,供各处(侧边栏、About 页)统一使用。
 * BRAND 是本模块自有的对象,后续渲染读取即可看到更新。
 */
export function setBrandLogo(url: string | null): void {
  if (url) BRAND.logo = { ...BRAND.logo, mark: url }
}

/**
 * 应用品牌强调色。
 *
 * 主题把强调色拆成一族变量(--cc-ac / -ac2 / -soft / -soft-hover / -border /
 * -ink / -ac-rgb),只改 --cc-ac 会留下一圈默认赤陶色。这里按品牌色整体重算这一族:
 * 派生色用 color-mix 生成,保证明暗两套主题下都与品牌色协调。
 * 写在 documentElement 的行内样式上,优先级高于任何主题选择器。
 */
export function applyBrandAccent(): void {
  if (!BRAND.accent) return
  const ac = BRAND.accent
  const rgb = hexToRgbTriple(ac)
  if (!rgb) return
  try {
    const s = document.documentElement.style
    const mix = (pct: number, base: string) => `color-mix(in oklab, ${ac} ${pct}%, ${base})`
    s.setProperty('--cc-ac', ac)
    s.setProperty('--cc-ac2', mix(86, 'black'))
    s.setProperty('--cc-ac-soft', mix(12, 'white'))
    s.setProperty('--cc-ac-soft-hover', mix(18, 'white'))
    s.setProperty('--cc-ac-border', mix(32, 'white'))
    s.setProperty('--cc-ac-ink', mix(88, 'black'))
    s.setProperty('--cc-ac-rgb', rgb)
  } catch {
    /* 非 DOM 环境忽略 */
  }
}

/** #RRGGBB → "r, g, b"(供 rgba(var(--cc-ac-rgb), a) 这类用法)。 */
function hexToRgbTriple(hex: string): string | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim())
  const digits = m?.[1]
  if (!digits) return null
  const n = parseInt(digits, 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

/** 应用品牌窗口标题。 */
export function applyBrandTitle(): void {
  try {
    document.title = BRAND.windowTitle || BRAND.productName
  } catch {
    /* 非 DOM 环境忽略 */
  }
}
