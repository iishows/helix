/**
 * 应用内 Profile 管理（Chrome 式）。
 *
 * 一个 profile 对应一个独立的数据目录与独立进程：切换 profile 不动当前窗口，
 * 而是新开一个窗口（见 services/profiles.ts 的 launchProfile 说明）。
 */
import { useCallback, useEffect, useState } from 'react'

import { getDesktopHost } from '@/lib/desktopHost'
import { useTranslation } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import type { DesktopProfileEntry } from '@/lib/desktopHost/types'

type CreateForm = {
  name: string
  logoPath: string | null
  seedFromCurrent: boolean
}

const EMPTY_FORM: CreateForm = { name: '', logoPath: null, seedFromCurrent: false }

export function ProfileManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslation()
  const host = getDesktopHost()

  const [profiles, setProfiles] = useState<DesktopProfileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM)
  const [pendingRemove, setPendingRemove] = useState<DesktopProfileEntry | null>(null)
  const [renaming, setRenaming] = useState<DesktopProfileEntry | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProfiles(await host.profiles.list())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [host])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  /** 统一的「跑个异步动作然后刷新列表」包装，避免每处重复 try/finally。 */
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleChooseLogo = async () => {
    const picked = await host.profiles.pickLogo()
    if (picked) setForm(prev => ({ ...prev, logoPath: picked }))
  }

  const handleCreate = async () => {
    const name = form.name.trim()
    if (!name) {
      setError(t('profiles.nameRequired'))
      return
    }
    if (profiles.some(p => p.name === name)) {
      setError(t('profiles.nameTaken'))
      return
    }
    await run(async () => {
      await host.profiles.create({
        name,
        logoPath: form.logoPath,
        seedFromCurrent: form.seedFromCurrent,
      })
      setCreating(false)
      setForm(EMPTY_FORM)
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={t('profiles.manage')}>
      <div className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="text-xs text-[var(--color-error)]">{error}</p>
        )}

        {loading && profiles.length === 0 ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : (
          <ul className="flex flex-col gap-1">
            {profiles.map(profile => (
              <li
                key={profile.dir || '__default__'}
                className="flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 hover:bg-[var(--color-surface-container)]"
              >
                <ProfileRowAvatar profile={profile} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm text-[var(--color-text-primary)]">{profile.name}</span>
                    {profile.isCurrent && (
                      <span className="rounded-full bg-[var(--color-surface-container)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-tertiary)]">
                        {t('profiles.current')}
                      </span>
                    )}
                    {profile.hasShortcut && (
                      <span title={t('profiles.createShortcut')} className="text-[11px] text-[var(--color-text-tertiary)]">.lnk</span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-[var(--color-text-tertiary)]" title={profile.dataDir}>
                    {profile.dataDir}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {!profile.isCurrent && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => host.profiles.launch(profile.dir))}>
                      {t('profiles.switchTo')}
                    </Button>
                  )}
                  {!profile.isDefault && (
                    <>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => host.profiles.createShortcut(profile.dir))}>
                        {t('profiles.createShortcut')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || profile.isCurrent}
                        onClick={() => { setRenaming(profile); setRenameValue(profile.name) }}
                      >
                        {t('profiles.rename')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || profile.isCurrent}
                        onClick={() => setPendingRemove(profile)}
                      >
                        {t('profiles.remove')}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {creating ? (
          <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
            <Input
              label={t('profiles.nameLabel')}
              placeholder={t('profiles.namePlaceholder')}
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => void handleChooseLogo()}>
                {t('profiles.chooseLogo')}
              </Button>
              <span className="truncate text-xs text-[var(--color-text-tertiary)]">
                {form.logoPath ?? t('profiles.logoLabel')}
              </span>
            </div>
            <label className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={form.seedFromCurrent}
                onChange={e => setForm(prev => ({ ...prev, seedFromCurrent: e.target.checked }))}
              />
              <span>
                {t('profiles.seedLabel')}
                <span className="block text-[var(--color-text-tertiary)]">{t('profiles.seedHint')}</span>
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => { setCreating(false); setForm(EMPTY_FORM) }}>
                {t('profiles.cancel')}
              </Button>
              <Button size="sm" variant="primary" loading={busy} onClick={() => void handleCreate()}>
                {t('profiles.confirmCreate')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button size="sm" variant="primary" disabled={busy} onClick={() => setCreating(true)}>
              {t('profiles.create')}
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        onConfirm={() => {
          const target = pendingRemove
          setPendingRemove(null)
          if (target) void run(() => host.profiles.remove(target.dir))
        }}
        title={t('profiles.removeConfirmTitle')}
        body={t('profiles.removeConfirmBody')}
        confirmLabel={t('profiles.remove')}
        cancelLabel={t('profiles.cancel')}
        confirmVariant="danger"
      />

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t('profiles.rename')}
      >
        <div className="flex flex-col gap-3">
          <Input
            label={t('profiles.nameLabel')}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setRenaming(null)}>
              {t('profiles.cancel')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={busy}
              onClick={() => {
                const target = renaming
                setRenaming(null)
                if (target && renameValue.trim()) void run(() => host.profiles.rename(target.dir, renameValue.trim()))
              }}
            >
              {t('profiles.rename')}
            </Button>
          </div>
        </div>
      </Modal>
    </Modal>
  )
}

/** 列表行图标：有自定义 logo 用 logo，否则退回首字母。 */
function ProfileRowAvatar({ profile }: { profile: DesktopProfileEntry }) {
  const [failed, setFailed] = useState(false)
  const src = profile.logoDataUrl

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className="size-7 shrink-0 rounded-[var(--radius-sm)] object-cover"
      />
    )
  }
  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-container)] text-xs text-[var(--color-text-secondary)]">
      {profile.name.slice(0, 1).toUpperCase()}
    </div>
  )
}
