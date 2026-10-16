import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { dismissReports, fetchAdminReports, removePost, removeReply } from '../../api/admin'
import type { AdminReportGroup } from '../../api/admin'
import { ApiError } from '../../api/client'
import type { Catalog } from '../../api/meta'
import { postOriginNames } from '../../catalog'
import { smallSecondaryButton } from '../../components/styles'
import { UserAvatar } from '../../components/UserAvatar'
import { formatDateTime, parseServerDate } from '../../dates'
import { PostThread } from './AdminPosts'
import { ReasonDialog } from './ReasonDialog'

type Status = 'loading' | 'ready' | 'error'
// what the Remove dialog acts on; from a report row, or from inside its opened thread
type Removing = { kind: 'post' | 'reply'; id: number }

// Open reports, one row per reported post or reply, most reported first.
// onChanged lets the tab's badge catch up after a removal or a dismissal.
export function AdminReports({ catalog, onChanged }: { catalog: Catalog | null; onChanged: () => void }) {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<AdminReportGroup[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [removing, setRemoving] = useState<Removing | null>(null)
  const [notice, setNotice] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(() => {
    fetchAdminReports()
      .then((list) => (setGroups(list), setStatus('ready')))
      .catch(() => setStatus('error'))
  }, [])
  useEffect(load, [load, reloadKey])

  function refresh(text: string) {
    setNotice(text)
    setReloadKey((k) => k + 1)
    onChanged()
  }

  async function dismiss(group: AdminReportGroup) {
    setNotice('')
    try {
      await dismissReports(group.target_type, group.target_id)
      refresh(t('admin.reports.dismissed', { ref: refOf(group) }))
    } catch (err) {
      setNotice(err instanceof ApiError && err.status === 0 ? t('errors.network') : t('errors.generic'))
    }
  }

  async function confirmRemove(reason: string) {
    if (!removing) return
    if (removing.kind === 'post') await removePost(removing.id, reason)
    else await removeReply(removing.id, reason)
    setRemoving(null)
    refresh(t(removing.kind === 'post' ? 'admin.posts.postRemoved' : 'admin.posts.replyRemoved', { id: removing.id }))
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted">{t('admin.reports.intro')}</p>

      {notice && (
        <p role="status" className="rounded-xl border border-line bg-card px-4 py-3 text-sm">
          {notice}
        </p>
      )}

      {status === 'loading' && <p className="py-10 text-center text-muted">{t('feed.loading')}</p>}
      {status === 'error' && (
        <p role="alert" className="py-10 text-center text-danger">
          {t('errors.generic')}
        </p>
      )}
      {status === 'ready' &&
        (groups.length === 0 ? (
          <p className="py-10 text-center text-muted">{t('admin.reports.none')}</p>
        ) : (
          <ul className="space-y-3">
            {groups.map((group) => (
              <li key={`${group.target_type}-${group.target_id}`}>
                <ReportRow
                  group={group}
                  catalog={catalog}
                  reloadKey={reloadKey}
                  onRemove={(target) => setRemoving(target)}
                  onDismiss={() => dismiss(group)}
                />
              </li>
            ))}
          </ul>
        ))}

      {removing && (
        <ReasonDialog
          title={t(removing.kind === 'post' ? 'admin.posts.removePostTitle' : 'admin.posts.removeReplyTitle', { id: removing.id })}
          explain={t(removing.kind === 'post' ? 'admin.posts.removePostExplain' : 'admin.posts.removeReplyExplain')}
          confirmLabel={t('admin.posts.removeConfirm')}
          onClose={() => setRemoving(null)}
          onConfirm={confirmRemove}
        />
      )}
    </section>
  )
}

const refOf = (group: AdminReportGroup) => `${group.target_type === 'post' ? 'P' : 'R'}${group.target_id}`

function ReportRow({
  group,
  catalog,
  reloadKey,
  onRemove,
  onDismiss,
}: {
  group: AdminReportGroup
  catalog: Catalog | null
  reloadKey: number
  onRemove: (target: Removing) => void
  onDismiss: () => void
}) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const names = postOriginNames(catalog, group, i18n.language)
  const origin = [names.major, names.university].filter(Boolean).join(' · ')

  return (
    <article className="rounded-2xl border border-danger/40 bg-card p-4">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
          {t('admin.reports.count', { count: group.reports_count })}
        </span>
        <span dir="ltr" className="font-medium">
          #{refOf(group)}
        </span>
        {group.target_type === 'reply' && (
          <span className="text-muted">
            {t('admin.reports.onPost')} <bdi dir="ltr">#P{group.post_id}</bdi>
          </span>
        )}
        <span className="text-muted">
          · {t(`tabs.${group.scope}`)}
          {origin && ` · ${origin}`}
        </span>
      </p>

      <div className="mt-3 flex items-start gap-3">
        <UserAvatar username={group.author.username} size={32} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-medium">
              {group.author.first_name} {group.author.last_name}
            </span>
            <span dir="ltr" className="text-muted">
              @{group.author.username}
            </span>
            <span className="text-muted">· {formatDateTime(parseServerDate(group.created_at), i18n.language)}</span>
          </p>
          <p dir="auto" className="mt-1 line-clamp-4 whitespace-pre-wrap break-words">
            {group.content}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5 rounded-xl bg-surface px-3 py-2.5 text-sm">
        {group.reports.map((report, i) => (
          <li key={i}>
            <span className="flex flex-wrap items-center gap-x-1.5">
              <span className="font-medium">{t(`report.reasons.${report.reason}`)}</span>
              <span className="text-muted">·</span>
              <span dir="ltr" className="text-muted">
                @{report.reporter.username}
              </span>
              <span className="text-muted">· {formatDateTime(parseServerDate(report.created_at), i18n.language)}</span>
            </span>
            {report.note && (
              <span dir="auto" className="mt-0.5 block text-muted">
                “{report.note}”
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onRemove({ kind: group.target_type, id: group.target_id })}
          className={`${smallSecondaryButton} text-danger`}
        >
          {t(group.target_type === 'post' ? 'admin.posts.removePost' : 'admin.posts.removeReply')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await onDismiss()
            setBusy(false)
          }}
          className={smallSecondaryButton}
        >
          {t('admin.reports.dismiss')}
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={smallSecondaryButton}>
          {open ? t('admin.posts.hideThread') : t('admin.reports.showThread')}
        </button>
      </div>

      {open && (
        <div className="mt-3">
          <PostThread
            key={reloadKey}
            postId={group.post_id}
            highlightReplyId={group.target_type === 'reply' ? group.target_id : null}
            catalog={catalog}
            onRemovePost={(post) => onRemove({ kind: 'post', id: post.id })}
            onRemoveReply={(reply) => onRemove({ kind: 'reply', id: reply.id })}
          />
        </div>
      )}
    </article>
  )
}
