import { useCallback } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { BRAND } from '../brand/runtime'
import { en, type TranslationKey } from './locales/en'
import { zh } from './locales/zh'
import { zh as zhTW } from './locales/zh-TW'
import { jp } from './locales/jp'
import { kr } from './locales/kr'
import type { Locale } from './locale'

const translations: Record<Locale, Record<string, string>> = {
  en,
  zh,
  'zh-TW': zhTW,
  jp,
  kr,
}

/**
 * Translate a key with optional interpolation params.
 * Falls back to the key itself if no translation is found.
 *
 * @example
 * translate('en', 'settings.providers.connected', { latency: '42' })
 * // => "Connected (42ms)"
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  let text = translations[locale]?.[key] ?? translations.en[key] ?? key
  // 品牌变量(产品名/副标题/作者/署名)自动可用,locales 里写 {brand} 等即可。
  const all: Record<string, string | number> = {
    brand: BRAND.productName,
    tagline: BRAND.tagline,
    author: BRAND.author.name,
    attribution: BRAND.attribution.text,
    repoLabel: BRAND.repo.label ?? BRAND.repoUrl.replace(/^https?:\/\/(www\.)?/, ''),
    ...params,
  }
  for (const [k, v] of Object.entries(all)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
  }
  return text
}

/**
 * React hook that returns a `t()` function bound to the current locale.
 * Re-renders when the locale changes.
 *
 * @example
 * const t = useTranslation()
 * t('sidebar.newSession')  // => "New session" or "新建会话"
 */
export function useTranslation() {
  const locale = useSettingsStore((s) => s.locale)
  return useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(locale, key, params),
    [locale],
  )
}

/**
 * Get a translation outside of React (e.g. in stores).
 * Reads the current locale from the Zustand store directly.
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const locale = useSettingsStore.getState().locale
  return translate(locale, key, params)
}

export type { TranslationKey }
export type { Locale } from './locale'
