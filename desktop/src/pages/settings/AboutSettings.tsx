import { useState, useEffect, type ReactNode } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink, MessageSquareWarning, ScrollText, Star, UserRound } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTranslation } from '../../i18n'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import {
  SettingsBlock,
  SettingsGroup,
  SettingsPageHeader,
  SettingsRow,
  SettingsSection,
  SettingsSwitchRow,
} from '@/components/settings/SettingsSection'
import type { UpdateProxyMode } from '../../types/settings'
import { MarkdownRenderer } from '../../components/markdown/MarkdownRenderer'
import { useUpdateStore } from '../../stores/updateStore'
import { formatBytes } from '../../lib/formatBytes'
import { getDesktopHost } from '../../lib/desktopHost'
import { publicAssetPath } from '../../lib/publicAsset'
import { BrandSeal } from '../../components/composite/BrandSeal'
import { BRAND } from '../../brand/runtime'
import { isValidHttpProxyUrl } from '../settings/shared'
// 许可全文随仓库分发,构建期内联 —— 图形应用许可页展示完整许可证(许可证第 4(a) 条)。
import BRAND_LICENSE_TEXT from '../../../../LICENSE?raw'
import BRAND_LICENSE_DOCUMENT from '../../../../THIRD_PARTY_LICENSES.md?raw'

/**
 * The About panel: version, update channel and the project's links.
 *
 * Moved verbatim out of `Settings.tsx`. Its repo/social constants come along because
 * nothing else in that file referenced them; `isValidHttpProxyUrl` stayed in
 * `./shared`, since the General panel needs it too.
 */

// 全部来自品牌配置(desktop/src/brand/generated.ts),不再硬编码。
const GITHUB_REPO = BRAND.repo.url ?? BRAND.repoUrl
const GITHUB_ISSUES = BRAND.repo.issues ?? `${GITHUB_REPO}/issues`
const GITHUB_RELEASES = BRAND.repo.releases ?? `${GITHUB_REPO}/releases`
const AUTHOR_GITHUB = BRAND.author.github ?? GITHUB_REPO
const GITHUB_LABEL = BRAND.repo.label ?? GITHUB_REPO.replace(/^https?:\/\/(www\.)?/, '')
const SOCIAL_LINKS = BRAND.author.social
const AUTHOR_NAME = BRAND.author.name
const ATTRIBUTION = BRAND.attribution

function openUrl(url: string) {
  void getDesktopHost().shell.open(url).catch(() => window.open(url, '_blank'))
}

export function AboutSettings() {
  const t = useTranslation()
  const [version, setVersion] = useState('')
  const updateProxy = useSettingsStore((s) => s.updateProxy)
  const setUpdateProxy = useSettingsStore((s) => s.setUpdateProxy)
  const autoUpdateEnabled = useSettingsStore((s) => s.autoUpdateEnabled)
  const setAutoUpdateEnabled = useSettingsStore((s) => s.setAutoUpdateEnabled)
  const updateStatus = useUpdateStore((s) => s.status)
  const availableVersion = useUpdateStore((s) => s.availableVersion)
  const releaseNotes = useUpdateStore((s) => s.releaseNotes)
  const progressPercent = useUpdateStore((s) => s.progressPercent)
  const downloadedBytes = useUpdateStore((s) => s.downloadedBytes)
  const totalBytes = useUpdateStore((s) => s.totalBytes)
  const error = useUpdateStore((s) => s.error)
  const checkedAt = useUpdateStore((s) => s.checkedAt)
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates)
  const installUpdate = useUpdateStore((s) => s.installUpdate)
  const initialize = useUpdateStore((s) => s.initialize)
  const [showUpdateProxyAdvanced, setShowUpdateProxyAdvanced] = useState(false)
  const [updateProxyDraft, setUpdateProxyDraft] = useState(updateProxy)
  const [updateProxySaveError, setUpdateProxySaveError] = useState<string | null>(null)
  const [isSavingUpdateProxy, setIsSavingUpdateProxy] = useState(false)
  const [isSavingAutoUpdate, setIsSavingAutoUpdate] = useState(false)
  const [autoUpdateSaveError, setAutoUpdateSaveError] = useState<string | null>(null)
  const [licensesOpen, setLicensesOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    getDesktopHost().app.getVersion()
      .then((value) => {
        if (!cancelled) setVersion(value)
      })
      .catch(() => {
        if (!cancelled) setVersion('')
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (autoUpdateEnabled) void initialize()
  }, [autoUpdateEnabled, initialize])

  useEffect(() => {
    setUpdateProxyDraft(updateProxy)
    setUpdateProxySaveError(null)
  }, [updateProxy])

  const checkedAtText =
    checkedAt
      ? new Date(checkedAt).toLocaleString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          month: 'short',
          day: 'numeric',
        })
      : null
  const updateProxyModes: Array<{ value: UpdateProxyMode; label: string; description: string }> = [
    {
      value: 'system',
      label: t('update.proxyModeSystem'),
      description: t('update.proxyModeSystemDescription'),
    },
    {
      value: 'manual',
      label: t('update.proxyModeManual'),
      description: t('update.proxyModeManualDescription'),
    },
  ]
  const manualProxyUrl = updateProxyDraft.url.trim()
  const manualProxyError =
    updateProxyDraft.mode === 'manual' && !manualProxyUrl
      ? t('update.proxyUrlRequired')
      : updateProxyDraft.mode === 'manual' && !isValidHttpProxyUrl(manualProxyUrl)
        ? t('update.proxyUrlInvalid')
        : null
  const updateProxyDirty =
    updateProxyDraft.mode !== updateProxy.mode ||
    updateProxyDraft.url.trim() !== updateProxy.url.trim()

  const saveUpdateProxy = async () => {
    if (manualProxyError) {
      setUpdateProxySaveError(manualProxyError)
      return
    }

    setIsSavingUpdateProxy(true)
    setUpdateProxySaveError(null)
    try {
      await setUpdateProxy({
        mode: updateProxyDraft.mode,
        url: manualProxyUrl,
      })
    } catch (error) {
      setUpdateProxySaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsSavingUpdateProxy(false)
    }
  }

  const saveAutoUpdateEnabled = async (enabled: boolean) => {
    setIsSavingAutoUpdate(true)
    setAutoUpdateSaveError(null)
    try {
      await setAutoUpdateEnabled(enabled)
    } catch (error) {
      setAutoUpdateSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsSavingAutoUpdate(false)
    }
  }

  const hasKnownProgress = typeof totalBytes === 'number' && totalBytes > 0
  const downloadedText = formatBytes(downloadedBytes)
  const updateDescription = (() => {
    if (updateStatus === 'checking') return t('update.checking')
    if (error) return t('update.failed', { error })
    if (updateStatus === 'downloading') {
      return hasKnownProgress
        ? t('update.progress', { progress: String(progressPercent) })
        : t('update.progressBytes', { downloaded: downloadedText })
    }
    if (updateStatus === 'downloaded') return t('update.downloaded')
    if (updateStatus === 'installing') return t('update.installing')
    if (updateStatus === 'restarting') return t('update.restarting')
    if (updateStatus === 'available' && availableVersion) return t('update.newVersion', { version: availableVersion })
    if (updateStatus === 'up-to-date') return t('update.upToDate', { version: version || t('update.currentVersionUnknown') })
    return t('update.idle')
  })()

  const selectedUpdateProxyMode = updateProxyModes.find((mode) => mode.value === updateProxyDraft.mode)

  if (licensesOpen) {
    return <LicensesPanel onBack={() => setLicensesOpen(false)} />
  }

  return (
    <div className="w-full min-w-0">
      <SettingsPageHeader title={t('settings.tab.about')} />

      <SettingsGroup className="mt-7">
        {/* Product identity */}
        <SettingsBlock className="flex items-center gap-4 py-4">
          <BrandSeal size="lg" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-[var(--color-text-primary)]">{BRAND.productName}</div>
            {version && (
              <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
                <span>{t('settings.about.version')} {version}</span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => openUrl(GITHUB_RELEASES)}
                  className="font-medium text-[var(--color-text-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
                >
                  {t('settings.about.changelog')}
                </button>
              </div>
            )}
          </div>
        </SettingsBlock>
        <LinkRow
          icon={<img src={publicAssetPath('icons/github.svg')} alt="GitHub" className="h-4 w-4 opacity-70" />}
          title={GITHUB_LABEL}
          description={t('settings.about.starHint')}
          onClick={() => openUrl(GITHUB_REPO)}
          external
        />
        <LinkRow
          icon={<MessageSquareWarning size={16} strokeWidth={1.75} aria-hidden="true" />}
          title={t('settings.about.feedback')}
          description={t('settings.about.feedbackDesc')}
          onClick={() => openUrl(GITHUB_ISSUES)}
          external
        />
        {/* 作者 —— 来自品牌配置(author)。未配置作者则不渲染。 */}
        {AUTHOR_NAME && (
          <LinkRow
            icon={
              BRAND.author.avatar ? (
                <img src={publicAssetPath(BRAND.author.avatar)} alt="" className="h-4 w-4 rounded-full object-cover" />
              ) : (
                <UserRound size={16} strokeWidth={1.75} aria-hidden="true" />
              )
            }
            title={AUTHOR_NAME}
            description={BRAND.tagline || undefined}
            onClick={() => openUrl(AUTHOR_GITHUB)}
            external
          />
        )}
        <LinkRow
          icon={<Star size={16} strokeWidth={1.75} aria-hidden="true" />}
          title={t('settings.about.community')}
          description={t('settings.about.communityDesc')}
          onClick={() => openUrl(GITHUB_REPO)}
          external
        />
        {/* 许可与上游署名 —— cc-haha 许可证第 4 条要求图形应用在可正常访问的
            About/法律页面展示来源署名;第 4(a) 条要求随分发提供完整许可证。
            两者都在此入口后的许可页里,品牌配置无法移除。 */}
        <LinkRow
          icon={<ScrollText size={16} strokeWidth={1.75} aria-hidden="true" />}
          title={t('settings.about.licenses')}
          description={t('settings.about.licensesDesc')}
          onClick={() => setLicensesOpen(true)}
        />
      </SettingsGroup>

      <SettingsSection
        title={t('settings.about.updates')}
        description={t('settings.about.updatesDesc')}
        action={(
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void checkForUpdates()}
            loading={updateStatus === 'checking'}
          >
            {t('update.checkNow')}
          </Button>
        )}
      >
        <SettingsGroup>
          <SettingsSwitchRow
            title={t('update.autoUpdate')}
            description={t('update.autoUpdateDescription')}
            checked={autoUpdateEnabled}
            disabled={isSavingAutoUpdate}
            onChange={(enabled) => void saveAutoUpdateEnabled(enabled)}
            footer={autoUpdateSaveError ? (
              <p role="alert" className="text-xs leading-[1.5] text-[var(--color-error)]">
                {t('update.autoUpdateSaveFailed', { error: autoUpdateSaveError })}
              </p>
            ) : undefined}
          />
          <SettingsRow
            title={(
              <span className="inline-flex flex-wrap items-center gap-2">
                <span>{t('settings.about.version')}</span>
                <span className="font-mono text-xs font-normal text-[var(--color-text-secondary)]">
                  {version || t('update.currentVersionUnknown')}
                </span>
                {availableVersion && (
                  <Badge tone="info" size="sm">
                    {t('update.availableLabel')} {availableVersion}
                  </Badge>
                )}
              </span>
            )}
            description={(
              <>
                <span className={`block ${error ? 'text-[var(--color-error)]' : ''}`}>{updateDescription}</span>
                {checkedAtText && (
                  <span className="mt-0.5 block">{t('update.checkedAt', { time: checkedAtText })}</span>
                )}
              </>
            )}
          >
            {availableVersion && (
              <Button
                size="base"
                onClick={() => void installUpdate()}
                loading={updateStatus === 'downloading' || updateStatus === 'installing' || updateStatus === 'restarting'}
                disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
              >
                {updateStatus === 'downloaded'
                  ? t('update.installAndRestart')
                  : updateStatus === 'installing'
                    ? t('update.installing')
                    : updateStatus === 'restarting'
                      ? t('update.restarting')
                      : t('update.now')}
              </Button>
            )}
          </SettingsRow>

          {(updateStatus === 'downloading' || updateStatus === 'restarting') && (
            <SettingsBlock>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-container-high)]">
                {hasKnownProgress || updateStatus === 'restarting' ? (
                  <div
                    className="h-full bg-[var(--color-info)] transition-all duration-300"
                    style={{ width: `${Math.min(progressPercent, 100)}%` }}
                  />
                ) : (
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--color-info)]" />
                )}
              </div>
              {!hasKnownProgress && updateStatus === 'downloading' && downloadedBytes > 0 && (
                <p className="mt-1 font-mono text-[11px] tabular-nums text-[var(--color-text-tertiary)]">
                  {downloadedText}
                </p>
              )}
            </SettingsBlock>
          )}

          {releaseNotes && availableVersion && (
            <SettingsBlock>
              <div className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                {t('update.releaseNotes')}
              </div>
              <div className="mt-2 rounded-[var(--radius-md)] bg-[var(--color-surface-container)] px-3 py-2">
                <MarkdownRenderer
                  content={releaseNotes}
                  variant="document"
                  className="text-[13px] leading-6 text-[var(--color-text-secondary)] [&_h1]:text-[15px] [&_h2]:text-sm [&_h3]:text-[13px] [&_p]:text-[13px] [&_p]:leading-6"
                />
              </div>
            </SettingsBlock>
          )}

          <div>
            <button
              type="button"
              onClick={() => setShowUpdateProxyAdvanced((value) => !value)}
              className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-border-focus)]"
              aria-expanded={showUpdateProxyAdvanced}
            >
              <span>{t('update.proxyAdvanced')}</span>
              {showUpdateProxyAdvanced
                ? <ChevronUp size={14} strokeWidth={1.75} aria-hidden="true" className="text-[var(--color-text-tertiary)]" />
                : <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" className="text-[var(--color-text-tertiary)]" />}
            </button>

            {showUpdateProxyAdvanced && (
              <div className="space-y-3 px-4 pb-4">
                <SegmentedControl<UpdateProxyMode>
                  label={t('update.proxyAdvanced')}
                  layout="fill"
                  size="sm"
                  value={updateProxyDraft.mode}
                  onChange={(mode) => {
                    setUpdateProxyDraft((current) => ({ ...current, mode }))
                    setUpdateProxySaveError(null)
                  }}
                  items={updateProxyModes.map(({ value, label }) => ({ value, label }))}
                />
                {selectedUpdateProxyMode && (
                  <p className="text-xs leading-[1.5] text-[var(--color-text-tertiary)]">{selectedUpdateProxyMode.description}</p>
                )}

                {updateProxyDraft.mode === 'manual' && (
                  <div>
                    <Input
                      id="update-proxy-url"
                      label={t('update.proxyUrl')}
                      size="md"
                      className="font-mono text-xs"
                      value={updateProxyDraft.url}
                      placeholder="http://127.0.0.1:7890"
                      autoComplete="off"
                      aria-invalid={manualProxyError ? true : undefined}
                      onChange={(event) => {
                        setUpdateProxyDraft((current) => ({ ...current, url: event.target.value }))
                        setUpdateProxySaveError(null)
                      }}
                    />
                    <p className={`mt-1 text-xs leading-[1.5] ${manualProxyError ? 'text-[var(--color-error)]' : 'text-[var(--color-text-tertiary)]'}`}>
                      {manualProxyError ?? t('update.proxyUrlHint')}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 text-xs leading-[1.5] text-[var(--color-text-tertiary)]">
                    {t('update.proxyScopeHint')}
                  </p>
                  <Button
                    size="base"
                    variant="secondary"
                    className="shrink-0 whitespace-nowrap"
                    disabled={!updateProxyDirty || !!manualProxyError || isSavingUpdateProxy}
                    loading={isSavingUpdateProxy}
                    onClick={() => void saveUpdateProxy()}
                  >
                    {t('update.proxySave')}
                  </Button>
                </div>

                {updateProxySaveError && (
                  <p className="text-xs leading-[1.5] text-[var(--color-error)]">
                    {updateProxySaveError}
                  </p>
                )}
              </div>
            )}
          </div>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={t('settings.about.socialMedia')}>
        <SettingsGroup>
          {SOCIAL_LINKS.map((link) => (
            <LinkRow
              key={link.name}
              icon={
                link.icon ? (
                  <img src={publicAssetPath(link.icon)} alt={link.name} className="h-4 w-4 opacity-60" />
                ) : (
                  <ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" />
                )
              }
              title={link.label}
              meta={link.name}
              onClick={() => openUrl(link.url)}
            />
          ))}
        </SettingsGroup>
      </SettingsSection>
    </div>
  )
}

/**
 * 许可与来源署名页。
 *
 * cc-haha Community Source License 1.0 第 4 条要求:图形应用须在「可正常访问的
 * About 或法律页面」显著展示来源署名与链接(第 4(b) 条),须随分发材料提供完整
 * 许可证文本(第 4(a) 条),并在修改发行版中显著标注非官方身份(第 4(c) 条)。
 * 三者集中在此页,便于一处满足、一处审查。署名文本来自品牌配置,不可移除。
 */
function LicensesPanel({ onBack }: { onBack: () => void }) {
  const t = useTranslation()

  return (
    <div className="w-full min-w-0">
      <Button variant="ghost" size="base" className="-ml-3" icon={<ArrowLeft size={14} strokeWidth={1.75} />} onClick={onBack}>
        {t('settings.licenses.back')}
      </Button>

      <SettingsPageHeader title={t('settings.licenses.title')} description={t('settings.licenses.description')} className="mt-4" />

      <SettingsSection title={t('settings.licenses.attribution')}>
        <SettingsBlock className="py-4 text-[13px] leading-6 text-[var(--color-text-secondary)]">
          <p>
            <span className="font-medium text-[var(--color-text-primary)]">{ATTRIBUTION.text}</span>
            {': '}
            <button
              type="button"
              className="cursor-pointer text-[var(--color-text-accent)] underline underline-offset-2"
              onClick={() => openUrl(ATTRIBUTION.url)}
            >
              {ATTRIBUTION.url}
            </button>
          </p>
          <p className="mt-1">{ATTRIBUTION.copyright}</p>
        </SettingsBlock>
      </SettingsSection>

      <SettingsSection title={t('settings.licenses.unofficialTitle')}>
        <SettingsBlock className="py-4 text-[13px] leading-6 text-[var(--color-text-secondary)]">
          <p>{t('settings.licenses.unofficialBody', { brand: BRAND.productName })}</p>
          <p className="mt-2 font-medium text-[var(--color-text-primary)]">{t('settings.licenses.changesTitle')}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>{t('settings.licenses.changeBranding')}</li>
            <li>{t('settings.licenses.changeIdentity')}</li>
            <li>{t('settings.licenses.changeCommunity')}</li>
          </ul>
        </SettingsBlock>
      </SettingsSection>

      <SettingsSection title={t('settings.licenses.licenseTitle')}>
        <SettingsBlock className="py-4">
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-[var(--color-surface-container)] p-3 font-mono text-[11px] leading-5 text-[var(--color-text-secondary)]">
            {BRAND_LICENSE_TEXT}
          </pre>
        </SettingsBlock>
      </SettingsSection>

      <SettingsSection title={t('settings.licenses.thirdPartyTitle')}>
        <SettingsBlock className="py-4">
          <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-[var(--color-surface-container)] p-3 font-mono text-[11px] leading-5 text-[var(--color-text-secondary)]">
            {BRAND_LICENSE_DOCUMENT}
          </pre>
        </SettingsBlock>
      </SettingsSection>
    </div>
  )
}

/**
 * A whole-row link inside a settings group. The hover fill follows the card's
 * rounded corners on the first and last row, since the group itself does not
 * clip (it hosts dropdowns elsewhere).
 */
function LinkRow({ icon, title, description, meta, external = false, onClick, ...rest }: {
  icon: ReactNode
  title: string
  description?: string
  meta?: string
  external?: boolean
  onClick: () => void
  'aria-haspopup'?: 'dialog'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors first:rounded-t-[calc(var(--radius-lg)-1px)] last:rounded-b-[calc(var(--radius-lg)-1px)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-border-focus)]"
    >
      <span className="flex w-4 shrink-0 justify-center text-[var(--color-text-tertiary)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-[var(--color-text-primary)]">{title}</span>
        {description && <span className="mt-0.5 block text-xs leading-[1.5] text-[var(--color-text-tertiary)]">{description}</span>}
      </span>
      {meta && <span className="shrink-0 text-xs text-[var(--color-text-tertiary)]">{meta}</span>}
      {external && <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-[var(--color-text-tertiary)]" />}
    </button>
  )
}
