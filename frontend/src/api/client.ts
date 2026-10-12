const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
  status: number
  detail: unknown

  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : `Request failed (${status})`)
    this.status = status
    this.detail = detail
  }
}

// status 0 means the request never reached the server
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, init)
  } catch {
    throw new ApiError(0, 'network')
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) onUnauthorized?.()
    throw new ApiError(response.status, body?.detail)
  }
  return body as T
}

let authToken: string | null = null
let onUnauthorized: (() => void) | null = null

// App keeps these in sync with the logged-in session.
export function setAuth(token: string | null, handleUnauthorized: (() => void) | null) {
  authToken = token
  onUnauthorized = handleUnauthorized
}

export function authRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`)
  return request<T>(path, { ...init, headers })
}
