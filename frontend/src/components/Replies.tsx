import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../api/client'
import { createReply, deleteReply, fetchReplies, setReplyAnonymity, voteReply } from '../api/replies'
import type { Reply } from '../api/replies'
import { formatDateTime, parseServerDate } from '../dates'
import { useReadOnly } from '../readOnly'
import { applyVote } from '../votes'
import { anonymousName, AnonymitySwitchButton, AuthorAvatar, AuthorName, isAnonymousAuthor, OwnAnonymousTag } from './Anonymous'
import { Composer } from './Composer'
import { DeleteButton } from './DeleteButton'
import { goldClass } from './Premium'
import { ReportButton } from './ReportButton'
import { VoteButtons } from './VoteButtons'

// deeper replies stop indenting so threads stay readable on phones
const MAX_INDENT = 5

type Actions = {
  // the reply opened from a link (#reply-<id>), shown highlighted
  highlightId: number | null
  childrenOf: Map<number | null, Reply[]>
  onReply: (parentId: number, content: string, isAnonymous: boolean) => Promise<void>
  onVote: (reply: Reply, dir: 1 | -1) => Promise<void>
  onDelete: (reply: Reply) => Promise<void>
  onSwitchAnonymity: (reply: Reply) => Promise<void>
}

// Mirrors the backend: a reply with answers becomes a placeholder; otherwise it goes, along with
// any placeholders above it that are now empty.
function withoutReply(list: Reply[], target: Reply): Reply[] {
  if (list.some((r) => r.parent_id === target.id)) {
    return list.map((r) =>
      r.id === target.id
        ? { ...r, is_deleted: true, content: '', author: null, user_id: null, my_vote: 0, votes_count: 0, is_anonymous: false, is_mine: false }
        : r,
    )
  }

  let next = list.filter((r) => r.id !== target.id)
  let parentId = target.parent_id
  while (parentId !== null) {
    const parent = next.find((r) => r.id === parentId)
    if (!parent?.is_deleted || next.some((r) => r.parent_id === parentId)) break
    next = next.filter((r) => r.id !== parentId)
    parentId = parent.parent_id
  }
  return next
}

function countDescendants(id: number, childrenOf: Map<number | null, Reply[]>): number {
  return (childrenOf.get(id) ?? []).reduce((sum, child) => sum + 1 + countDescendants(child.id, childrenOf), 0)
}

function ReplyItem({ reply, depth, actions }: { reply: Reply; depth: number; actions: Actions }) {
  const { t, i18n } = useTranslation()
  const readOnly = useReadOnly()
  const [replying, setReplying] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [voting, setVoting] = useState(false)
  const [error, setError] = useState('')

  const children = actions.childrenOf.get(reply.id) ?? []
  const created = parseServerDate(reply.created_at)
  const { author } = reply

  async function vote(dir: 1 | -1) {
    setVoting(true)
    setError('')
    try {
      await actions.onVote(reply, dir)
    } catch {
      setError(t('errors.generic'))
    } finally {
      setVoting(false)
    }
  }

  async function switchAnonymity() {
    setError('')
    try {
      await actions.onSwitchAnonymity(reply)
    } catch {
      setError(t('errors.generic'))
    }
  }

  async function remove() {
    setError('')
    try {
      await actions.onDelete(reply)
    } catch {
      setError(t('errors.generic'))
    }
  }

  const highlighted = reply.id === actions.highlightId

  return (
    <li id={`reply-${reply.id}`} className="scroll-mt-32">
      <div className={highlighted ? '-mx-2 rounded-lg bg-accent/10 px-2 py-1.5 ring-1 ring-accent/40' : undefined}>
        <div className="flex items-center gap-2 text-sm">
          {author ? (
            <>
              <AuthorAvatar author={author} size={28} />
              <AuthorName author={author} className="truncate font-medium" />
              {reply.is_anonymous ? (
                reply.is_mine && <OwnAnonymousTag />
              ) : (
                <span className={`truncate ${author.is_premium ? goldClass : 'text-muted'}`}>@{author.username}</span>
              )}
            </>
          ) : (
            <span className="text-muted italic">{t('replies.deletedAuthor')}</span>
          )}
          <span aria-hidden="true" className="text-muted">
            ·
          </span>
          <time dateTime={created.toISOString()} className="shrink-0 text-muted">
            {formatDateTime(created, i18n.language)}
          </time>
          <span dir="ltr" className="shrink-0 text-muted">
            #R{reply.id}
          </span>
        </div>

        {reply.is_deleted ? (
          <p className="mt-1.5 text-muted italic">{t(reply.removed_by_admin ? 'replies.removedByAdmin' : 'replies.deleted')}</p>
        ) : (
          <p dir="auto" className="mt-1.5 whitespace-pre-wrap break-words">
            {reply.content}
          </p>
        )}

        <div className="-ms-1.5 mt-1 flex flex-wrap items-center gap-1">
          {!reply.is_deleted && (
            <>
              <VoteButtons count={reply.votes_count} myVote={reply.my_vote} disabled={voting} onVote={vote} />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setReplying((open) => !open)}
                  aria-expanded={replying}
                  className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg"
                >
                  {t('replies.reply')}
                </button>
              )}
            </>
          )}
          {children.length > 0 && (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg"
            >
              {collapsed
                ? t('replies.show', { count: countDescendants(reply.id, actions.childrenOf) })
                : t('replies.hide')}
            </button>
          )}
          {!reply.is_deleted && reply.is_mine && !reply.anonymity_switched && (
            <AnonymitySwitchButton isAnonymous={reply.is_anonymous} onSwitch={switchAnonymity} />
          )}
          {!reply.is_deleted && reply.is_mine && <DeleteButton question={t('replies.confirmDelete')} onConfirm={remove} />}
          {!reply.is_deleted && !reply.is_mine && <ReportButton kind="reply" id={reply.id} />}
        </div>

        {error && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      {replying && (
        <div className="mt-2">
          <Composer
            label={t('replies.composerLabel')}
            placeholder={t('replies.placeholderTo', {
              name: !author ? '' : isAnonymousAuthor(author) ? anonymousName(t, author) : author.first_name,
            })}
            submitLabel={t('replies.reply')}
            anonymousLabel={t('anonymous.replyAnonymously')}
            rows={2}
            autoFocus
            onCancel={() => setReplying(false)}
            onSubmit={async (content, isAnonymous) => {
              await actions.onReply(reply.id, content, isAnonymous)
              setReplying(false)
              setCollapsed(false)
            }}
          />
        </div>
      )}

      {children.length > 0 && !collapsed && (
        <ReplyList
          replies={children}
          depth={depth + 1}
          actions={actions}
          className={depth < MAX_INDENT ? 'mt-3 ms-3 border-s-2 border-line ps-3 sm:ms-4 sm:ps-4' : 'mt-3'}
        />
      )}
    </li>
  )
}

function ReplyList({ replies, depth, actions, className }: { replies: Reply[]; depth: number; actions: Actions; className?: string }) {
  return (
    <ul className={`space-y-4 ${className ?? ''}`}>
      {replies.map((reply) => (
        <ReplyItem key={reply.id} reply={reply} depth={depth} actions={actions} />
      ))}
    </ul>
  )
}

type Status = 'loading' | 'ready' | 'error'

// The thread under a post; onCountChange keeps the post's reply count in sync.
// highlightId is a reply to scroll to and highlight once the thread loads.
export function RepliesSection({
  postId,
  highlightId = null,
  onCountChange,
}: {
  postId: number
  highlightId?: number | null
  onCountChange: (delta: number) => void
}) {
  const { t } = useTranslation()
  const readOnly = useReadOnly()
  const [replies, setReplies] = useState<Reply[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const scrolledRef = useRef(false)

  useEffect(() => {
    if (status !== 'ready' || highlightId === null || scrolledRef.current) return
    scrolledRef.current = true
    document.getElementById(`reply-${highlightId}`)?.scrollIntoView({ block: 'center' })
  }, [status, highlightId])

  useEffect(() => {
    let ignore = false
    fetchReplies(postId)
      .then((list) => {
        if (ignore) return
        setReplies(list)
        setStatus('ready')
      })
      .catch(() => {
        if (!ignore) setStatus('error')
      })
    return () => {
      ignore = true
    }
  }, [postId, reloadKey])

  // keep the server's order (best-voted, then oldest) within each level
  const childrenOf = new Map<number | null, Reply[]>()
  for (const reply of replies) {
    const siblings = childrenOf.get(reply.parent_id) ?? []
    siblings.push(reply)
    childrenOf.set(reply.parent_id, siblings)
  }

  function patchReply(id: number, changes: Partial<Reply>) {
    setReplies((current) => current.map((r) => (r.id === id ? { ...r, ...changes } : r)))
  }

  async function add(parentId: number | null, content: string, isAnonymous: boolean) {
    const reply = await createReply(postId, content, parentId, isAnonymous)
    setReplies((current) => [...current, reply])
    onCountChange(1)
  }

  const actions: Actions = {
    highlightId,
    childrenOf,
    onReply: add,
    async onVote(reply, dir) {
      patchReply(reply.id, applyVote(reply, dir))
      try {
        const result = await voteReply(reply.id, dir)
        patchReply(reply.id, { my_vote: result.vote_dir, votes_count: result.votes_count })
      } catch (err) {
        patchReply(reply.id, { my_vote: reply.my_vote, votes_count: reply.votes_count })
        throw err
      }
    },
    async onDelete(reply) {
      try {
        await deleteReply(reply.id)
      } catch (err) {
        // already gone counts as deleted
        if (!(err instanceof ApiError && err.status === 404)) throw err
      }
      setReplies((current) => withoutReply(current, reply))
      onCountChange(-1)
    },
    async onSwitchAnonymity(reply) {
      const updated = await setReplyAnonymity(reply.id, !reply.is_anonymous)
      patchReply(reply.id, updated)
    },
  }

  const topLevel = childrenOf.get(null) ?? []

  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      {readOnly ? (
        <p className="text-sm text-muted">{t('testAccount.noReply')}</p>
      ) : (
        <Composer
          label={t('replies.composerLabel')}
          placeholder={t('replies.placeholder')}
          submitLabel={t('replies.reply')}
          anonymousLabel={t('anonymous.replyAnonymously')}
          rows={2}
          onSubmit={(content, isAnonymous) => add(null, content, isAnonymous)}
        />
      )}

      {status === 'loading' && (
        <p className="text-center text-sm text-muted" role="status">
          {t('feed.loading')}
        </p>
      )}

      {status === 'error' && (
        <p className="text-center text-sm text-muted">
          {t('replies.loadFailed')}{' '}
          <button
            type="button"
            onClick={() => {
              setStatus('loading')
              setReloadKey((k) => k + 1)
            }}
            className="font-medium text-accent hover:underline"
          >
            {t('auth.retry')}
          </button>
        </p>
      )}

      {status === 'ready' && topLevel.length === 0 && (
        <p className="text-center text-sm text-muted">{t('replies.empty')}</p>
      )}

      {status === 'ready' && topLevel.length > 0 && <ReplyList replies={topLevel} depth={0} actions={actions} />}
    </div>
  )
}
