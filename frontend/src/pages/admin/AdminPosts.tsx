import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ADMIN_POSTS_PAGE,
  deleteAdminPost,
  fetchAdminPost,
  fetchAdminPosts,
  findAdminReply,
  MAX_PIN_HOURS,
  pinAdminPost,
  removePost,
  removeReply,
} from '../../api/admin'
import type { AdminPost, AdminReply } from '../../api/admin'
import { ApiError } from '../../api/client'
import type { Catalog } from '../../api/meta'
import type { PostScope } from '../../api/posts'
import { postOriginNames } from '../../catalog'
import { DeleteButton } from '../../components/DeleteButton'
import { Field } from '../../components/Field'
import { Select } from '../../components/Select'
import { secondaryButtonInline, smallPrimaryButton, smallSecondaryButton } from '../../components/styles'
import { UserAvatar } from '../../components/UserAvatar'
import { formatDateTime, parseServerDate } from '../../dates'
import { AdminPostComposer } from './AdminPostComposer'
import { ReasonDialog } from './ReasonDialog'

type Status = 'loading' | 'ready' | 'error'
type Removing = { kind: 'post'; post: AdminPost } | { kind: 'reply'; reply: AdminReply; postId: number }

const SCOPES: PostScope[] = ['general', 'university', 'college', 'major']
const SEARCH_DELAY_MS = 300
// "P42", "#p42", "R17", "# R 17"
const ID_RE = /^#?\s*([pr])\s*(\d+)$/i

export function AdminPosts({ catalog }: { catalog: Catalog | null }) {
  const { t } = useTranslation()
  const [scope, setScope] = useState<PostScope | ''>('')
  const [query, setQuery] = useState('')
  const [posts, setPosts] = useState<AdminPost[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<Status>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  // the thread opened from the ID box, shown above the list
  const [jumped, setJumped] = useState<{ postId: number; replyId: number | null } | null>(null)
  const [removing, setRemoving] = useState<Removing | null>(null)
  const [notice, setNotice] = useState('')
  const [adminOnly, setAdminOnly] = useState(false)
  const [composing, setComposing] = useState(false)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      setStatus('loading')
      fetchAdminPosts(scope, query.trim(), 0, adminOnly)
        .then((page) => {
          if (cancelled) return
          setPosts(page.items)
          setTotal(page.total)
          setStatus('ready')
        })
        .catch(() => !cancelled && setStatus('error'))
    }, SEARCH_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [scope, query, adminOnly, reloadKey])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await fetchAdminPosts(scope, query.trim(), posts.length, adminOnly)
      setPosts((current) => [...current, ...page.items.filter((p) => !current.some((c) => c.id === p.id))])
      setTotal(page.total)
    } catch {
      setNotice(t('errors.generic'))
    } finally {
      setLoadingMore(false)
    }
  }

  async function confirmRemove(reason: string) {
    if (!removing) return
    if (removing.kind === 'post') {
      await removePost(removing.post.id, reason)
      setPosts((current) => current.filter((p) => p.id !== removing.post.id))
      setTotal((n) => n - 1)
      if (jumped?.postId === removing.post.id) setJumped(null)
      setNotice(t('admin.posts.postRemoved', { id: removing.post.id }))
    } else {
      await removeReply(removing.reply.id, reason)
      setNotice(t('admin.posts.replyRemoved', { id: removing.reply.id }))
    }
    setRemoving(null)
    // threads and reply counts reload with the list
    setReloadKey((k) => k + 1)
  }

  const scopeOptions = [
    { value: '', label: t('admin.posts.allBlogs') },
    ...SCOPES.map((s) => ({ value: s, label: t(`tabs.${s}`) })),
  ]

  return (
    <section className="space-y-4">
      {composing ? (
        <AdminPostComposer
          catalog={catalog}
          onCancel={() => setComposing(false)}
          onPosted={(post) => {
            setComposing(false)
            setNotice(t('admin.adminPosts.posted', { id: post.id }))
            setReloadKey((k) => k + 1)
          }}
        />
      ) : (
        <button type="button" onClick={() => (setNotice(''), setComposing(true))} className={smallPrimaryButton}>
          {t('admin.adminPosts.new')}
        </button>
      )}

      <JumpToId onFound={(target) => (setNotice(''), setJumped(target))} />

      {jumped && (
        <div className="rounded-2xl border border-accent/40 bg-accent/5 p-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <p className="text-sm font-medium">
              {jumped.replyId !== null
                ? t('admin.posts.foundReply', { reply: jumped.replyId, post: jumped.postId })
                : t('admin.posts.foundPost', { id: jumped.postId })}
            </p>
            <button type="button" onClick={() => setJumped(null)} className={smallSecondaryButton}>
              {t('admin.posts.close')}
            </button>
          </div>
          <PostThread
            key={`${jumped.postId}-${reloadKey}`}
            postId={jumped.postId}
            highlightReplyId={jumped.replyId}
            catalog={catalog}
            onRemovePost={(post) => setRemoving({ kind: 'post', post })}
            onRemoveReply={(reply) => setRemoving({ kind: 'reply', reply, postId: jumped.postId })}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
        <Select label={t('admin.posts.blog')} value={scope} options={scopeOptions} onChange={(v) => setScope(v as PostScope | '')} />
        <Field
          label={t('admin.posts.search')}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('admin.posts.searchPlaceholder')}
          autoComplete="off"
        />
      </div>
      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={adminOnly} onChange={(e) => setAdminOnly(e.target.checked)} className="size-4 accent-[var(--accent)]" />
        {t('admin.adminPosts.onlyMine')}
      </label>

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
      {status === 'ready' && (
        <>
          <p className="text-sm text-muted">{t('admin.posts.count', { count: total })}</p>
          {posts.length === 0 ? (
            <p className="py-10 text-center text-muted">{t('admin.posts.none')}</p>
          ) : (
            <ul className="space-y-3">
              {posts.map((post) => (
                <li key={post.id}>
                  <PostRow
                    post={post}
                    catalog={catalog}
                    reloadKey={reloadKey}
                    onChanged={(updated) => setPosts((current) => current.map((p) => (p.id === updated.id ? updated : p)))}
                    onDeleted={() => {
                      setPosts((current) => current.filter((p) => p.id !== post.id))
                      setTotal((n) => n - 1)
                      setNotice(t('admin.adminPosts.deleted', { id: post.id }))
                    }}
                    onRemovePost={() => setRemoving({ kind: 'post', post })}
                    onRemoveReply={(reply) => setRemoving({ kind: 'reply', reply, postId: post.id })}
                  />
                </li>
              ))}
            </ul>
          )}
          {posts.length < total && (
            <div className="text-center">
              <button type="button" onClick={loadMore} disabled={loadingMore} className={secondaryButtonInline}>
                {loadingMore ? t('feed.loading') : t('admin.users.loadMore', { count: Math.min(ADMIN_POSTS_PAGE, total - posts.length) })}
              </button>
            </div>
          )}
        </>
      )}

      {removing && (
        <ReasonDialog
          title={
            removing.kind === 'post'
              ? t('admin.posts.removePostTitle', { id: removing.post.id })
              : t('admin.posts.removeReplyTitle', { id: removing.reply.id })
          }
          explain={t(removing.kind === 'post' ? 'admin.posts.removePostExplain' : 'admin.posts.removeReplyExplain')}
          confirmLabel={t('admin.posts.removeConfirm')}
          onClose={() => setRemoving(null)}
          onConfirm={confirmRemove}
        />
      )}
    </section>
  )
}

function JumpToId({ onFound }: { onFound: (target: { postId: number; replyId: number | null }) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const match = ID_RE.exec(value.trim())
    if (!match) {
      setError(t('admin.posts.idInvalid'))
      return
    }
    const id = Number(match[2])
    setBusy(true)
    try {
      if (match[1].toLowerCase() === 'p') {
        await fetchAdminPost(id)
        onFound({ postId: id, replyId: null })
      } else {
        const found = await findAdminReply(id)
        onFound({ postId: found.post_id, replyId: found.reply_id })
      }
      setValue('')
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? t('admin.posts.idNotFound') : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <Field
          label={t('admin.posts.jump')}
          dir="ltr"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="P42 / R17"
          autoComplete="off"
          error={error || undefined}
        />
      </div>
      <button type="submit" disabled={busy} className={`${smallPrimaryButton} mb-[1px] h-11 px-4`}>
        {t('admin.posts.open')}
      </button>
    </form>
  )
}

function useOriginText(post: AdminPost, catalog: Catalog | null) {
  const { i18n } = useTranslation()
  const names = postOriginNames(catalog, post, i18n.language)
  // the blog the post is in, then where its author was
  const parts =
    post.scope === 'university'
      ? [names.university]
      : post.scope === 'college'
        ? [names.college, names.university]
        : [names.major, names.university]
  return parts.filter(Boolean).join(' · ')
}

function PostHeader({ post, catalog }: { post: AdminPost; catalog: Catalog | null }) {
  const { t, i18n } = useTranslation()
  const originText = useOriginText(post, catalog)
  return (
    <header className="flex items-start gap-3">
      <UserAvatar username={post.author.username} size={36} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2">
          <span className="font-medium">
            {post.author.first_name} {post.author.last_name}
          </span>
          <span className="text-sm text-muted">@{post.author.username}</span>
          {post.is_admin_post && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">{t('settings.notifications.adminBadge')}</span>
          )}
        </p>
        <p className="text-sm text-muted">
          <span className="font-medium text-fg">{t(`tabs.${post.scope}`)}</span>
          {originText && ` · ${originText}`}
        </p>
        <p className="text-sm text-muted">
          {formatDateTime(parseServerDate(post.created_at), i18n.language)}
          <span dir="ltr" className="ms-2">
            #P{post.id}
          </span>
        </p>
      </div>
    </header>
  )
}

function PostRow({
  post,
  catalog,
  reloadKey,
  onChanged,
  onDeleted,
  onRemovePost,
  onRemoveReply,
}: {
  post: AdminPost
  catalog: Catalog | null
  reloadKey: number
  onChanged: (post: AdminPost) => void
  onDeleted: () => void
  onRemovePost: () => void
  onRemoveReply: (reply: AdminReply) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <article className="rounded-2xl border border-line bg-card p-4">
      <PostHeader post={post} catalog={catalog} />
      <p dir="auto" className="mt-3 line-clamp-4 whitespace-pre-wrap break-words">
        {post.content}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="me-2 text-sm text-muted">
          {t('admin.posts.score', { count: post.votes_count })} · {t('replies.count', { count: post.replies_count })}
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={smallSecondaryButton}>
          {open ? t('admin.posts.hideThread') : t('admin.posts.showThread')}
        </button>
        {post.is_admin_post ? (
          <DeleteButton
            question={t('admin.adminPosts.confirmDelete')}
            onConfirm={async () => {
              await deleteAdminPost(post.id)
              onDeleted()
            }}
          />
        ) : (
          <button type="button" onClick={onRemovePost} className={`${smallSecondaryButton} text-danger`}>
            {t('admin.posts.removePost')}
          </button>
        )}
      </div>
      {post.is_admin_post && <PinControls post={post} onChanged={onChanged} />}
      {open && <Thread key={reloadKey} postId={post.id} highlightReplyId={null} onRemoveReply={onRemoveReply} />}
    </article>
  )
}

// a post found by its ID (or a reported one): the whole post with its thread
export function PostThread({
  postId,
  highlightReplyId,
  catalog,
  onRemovePost,
  onRemoveReply,
}: {
  postId: number
  highlightReplyId: number | null
  catalog: Catalog | null
  onRemovePost: (post: AdminPost) => void
  onRemoveReply: (reply: AdminReply) => void
}) {
  const { t } = useTranslation()
  const { data, status } = useThread(postId)
  if (status !== 'ready' || !data) return <ThreadStatus status={status} />
  const { post } = data
  return (
    <article className="rounded-2xl border border-line bg-card p-4">
      <PostHeader post={post} catalog={catalog} />
      <p dir="auto" className="mt-3 whitespace-pre-wrap break-words">
        {post.content}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="me-2 text-sm text-muted">
          {t('admin.posts.score', { count: post.votes_count })} · {t('replies.count', { count: post.replies_count })}
        </span>
        <button type="button" onClick={() => onRemovePost(post)} className={`${smallSecondaryButton} text-danger`}>
          {t('admin.posts.removePost')}
        </button>
      </div>
      <ReplyTree replies={data.replies} highlightReplyId={highlightReplyId} onRemoveReply={onRemoveReply} />
    </article>
  )
}

function useThread(postId: number) {
  const [data, setData] = useState<{ post: AdminPost; replies: AdminReply[] } | null>(null)
  const [status, setStatus] = useState<Status | 'gone'>('loading')
  const load = useCallback(() => {
    fetchAdminPost(postId)
      .then((d) => (setData(d), setStatus('ready')))
      .catch((err) => setStatus(err instanceof ApiError && err.status === 404 ? 'gone' : 'error'))
  }, [postId])
  useEffect(load, [load])
  return { data, status }
}

function ThreadStatus({ status }: { status: Status | 'gone' }) {
  const { t } = useTranslation()
  if (status === 'loading') return <p className="py-4 text-sm text-muted">{t('feed.loading')}</p>
  return <p className="py-4 text-sm text-muted">{t(status === 'gone' ? 'admin.posts.gone' : 'errors.generic')}</p>
}

function Thread({
  postId,
  highlightReplyId,
  onRemoveReply,
}: {
  postId: number
  highlightReplyId: number | null
  onRemoveReply: (reply: AdminReply) => void
}) {
  const { data, status } = useThread(postId)
  if (status !== 'ready' || !data) return <ThreadStatus status={status} />
  return <ReplyTree replies={data.replies} highlightReplyId={highlightReplyId} onRemoveReply={onRemoveReply} />
}

function ReplyTree({
  replies,
  highlightReplyId,
  onRemoveReply,
}: {
  replies: AdminReply[]
  highlightReplyId: number | null
  onRemoveReply: (reply: AdminReply) => void
}) {
  const { t } = useTranslation()
  if (replies.length === 0) return <p className="mt-4 text-sm text-muted">{t('admin.posts.noReplies')}</p>

  const childrenOf = new Map<number | null, AdminReply[]>()
  for (const reply of replies) childrenOf.set(reply.parent_id, [...(childrenOf.get(reply.parent_id) ?? []), reply])

  const branch = (parentId: number | null, depth: number) => (
    <ul className={depth === 0 ? 'mt-4 space-y-3 border-t border-line pt-4' : 'mt-3 space-y-3 border-s-2 border-line ps-4'}>
      {(childrenOf.get(parentId) ?? []).map((reply) => (
        <li key={reply.id}>
          <ReplyItem reply={reply} highlighted={reply.id === highlightReplyId} onRemove={() => onRemoveReply(reply)} />
          {childrenOf.has(reply.id) && branch(reply.id, depth + 1)}
        </li>
      ))}
    </ul>
  )
  return branch(null, 0)
}

function ReplyItem({ reply, highlighted, onRemove }: { reply: AdminReply; highlighted: boolean; onRemove: () => void }) {
  const { t, i18n } = useTranslation()
  useEffect(() => {
    if (highlighted) document.getElementById(`admin-reply-${reply.id}`)?.scrollIntoView({ block: 'center' })
  }, [highlighted, reply.id])

  return (
    <div
      id={`admin-reply-${reply.id}`}
      className={highlighted ? '-mx-2 rounded-lg bg-accent/10 px-2 py-1.5 ring-1 ring-accent/40' : undefined}
    >
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        {reply.author ? (
          <>
            <span className="font-medium">
              {reply.author.first_name} {reply.author.last_name}
            </span>
            <span className="text-muted">@{reply.author.username}</span>
          </>
        ) : (
          <span className="text-muted italic">{t('replies.deletedAuthor')}</span>
        )}
        <span className="text-muted">· {formatDateTime(parseServerDate(reply.created_at), i18n.language)}</span>
        <span dir="ltr" className="text-muted">
          #R{reply.id}
        </span>
        {!reply.is_deleted && <span className="text-muted">· {t('admin.posts.score', { count: reply.votes_count })}</span>}
      </p>
      {reply.is_deleted ? (
        <p className="mt-1 text-muted italic">{t(reply.removed_by_admin ? 'replies.removedByAdmin' : 'replies.deleted')}</p>
      ) : (
        <>
          <p dir="auto" className="mt-1 whitespace-pre-wrap break-words">
            {reply.content}
          </p>
          <button type="button" onClick={onRemove} className={`${smallSecondaryButton} mt-2 text-danger`}>
            {t('admin.posts.removeReply')}
          </button>
        </>
      )}
    </div>
  )
}

function PinControls({ post, onChanged }: { post: AdminPost; onChanged: (post: AdminPost) => void }) {
  const { t, i18n } = useTranslation()
  const [hours, setHours] = useState('24')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const until = post.pinned_until ? parseServerDate(post.pinned_until) : null
  const pinned = post.is_pinned
  const value = Number(hours)
  const valid = Number.isInteger(value) && value >= 1 && value <= MAX_PIN_HOURS

  async function pin(pinHours: number | null) {
    setBusy(true)
    setError('')
    try {
      onChanged(await pinAdminPost(post.id, pinHours))
    } catch {
      setError(t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm">
      <span className="me-1">
        {pinned && until
          ? `📌 ${t('admin.adminPosts.pinnedUntil', { date: formatDateTime(until, i18n.language) })}`
          : t('admin.adminPosts.notPinned')}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_PIN_HOURS}
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        aria-label={t('admin.adminPosts.hours')}
        className="h-9 w-20 rounded-lg border border-line bg-card px-2 text-fg"
      />
      <span className="text-muted">{t('admin.adminPosts.hours')}</span>
      <button type="button" disabled={busy || !valid} onClick={() => pin(value)} className={smallSecondaryButton}>
        {pinned ? t('admin.adminPosts.repin') : t('admin.adminPosts.pin')}
      </button>
      {pinned && (
        <button type="button" disabled={busy} onClick={() => pin(null)} className={smallSecondaryButton}>
          {t('admin.adminPosts.unpin')}
        </button>
      )}
      {!valid && <span className="text-danger">{t('admin.adminPosts.pinRange', { max: MAX_PIN_HOURS })}</span>}
      {error && (
        <span role="alert" className="text-danger">
          {error}
        </span>
      )}
    </div>
  )
}
