/**
 * 当前 profile 的图标。
 *
 * 非实例模式（default profile）下 getBrandLogo 会回退到品牌内置 logo，
 * 因此这里总能拿到一张图；加载失败时退回首字母。
 */
import { useEffect, useState } from 'react'

import { getDesktopHost } from '@/lib/desktopHost'
import { BRAND } from '@/brand/runtime'

export function ProfileAvatar({ size = 24 }: { size?: number }) {
  const [logo, setLogo] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getDesktopHost().app.getBrandLogo().then(value => {
      if (!cancelled) setLogo(value)
    }).catch(() => {
      if (!cancelled) setLogo(null)
    })
    return () => { cancelled = true }
  }, [])

  const style = { width: size, height: size }

  if (logo && !failed) {
    return (
      <img
        src={logo}
        alt=""
        style={style}
        onError={() => setFailed(true)}
        className="shrink-0 rounded-[var(--radius-sm)] object-cover"
      />
    )
  }

  return (
    <span
      style={style}
      className="flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-container)] text-[11px] text-[var(--color-text-secondary)]"
    >
      {BRAND.productName.slice(0, 1).toUpperCase()}
    </span>
  )
}
