import { ApiError, request } from './client'

// sessionStorage, so the admin login ends when the tab is closed; kept apart from the student login
const ADMIN_TOKEN_KEY = 'ilna-admin-token'

export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAdminToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token)
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {
    // storage may be blocked; the admin just logs in again after a reload
  }
}

let onAdminUnauthorized: (() => void) | null = null

// AdminApp sets this so an expired admin login goes back to the code form
export function setAdminUnauthorizedHandler(handler: (() => void) | null) {
  onAdminUnauthorized = handler
}

export async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getAdminToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  try {
    return await request<T>(`/admin${path}`, { ...init, headers }, false)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) onAdminUnauthorized?.()
    throw err
  }
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function requestAdminCode(email: string) {
  return request<{ detail: string }>('/admin/request-code', json({ email }), false)
}

export async function verifyAdminCode(email: string, code: string) {
  const { access_token } = await request<{ access_token: string; expires_at: string }>(
    '/admin/verify-code',
    json({ email, code }),
    false,
  )
  return access_token
}

export function fetchAdminSession() {
  return adminRequest<{ email: string }>('/session')
}
