import { authRequest } from './client'

// matches ReportReason in backend/blog/schemas.py
export const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

// a 409 means this user already reported it
export function reportContent(kind: 'post' | 'reply', id: number, reason: ReportReason, note: string) {
  return authRequest<{ detail: string }>(`/${kind === 'post' ? 'posts' : 'replies'}/${id}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, note: note.trim() || null }),
  })
}
