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

// status 0 means the request never reached the server;
// admin requests pass notifyUnauthorized = false so a 401 there doesn't log the student out
export async function request<T>(path: string, init?: RequestInit, notifyUnauthorized = true): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, init)
  } catch {
    throw new ApiError(0, 'network')
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (notifyUnauthorized) checkSession(response.status, body?.detail)
    throw new ApiError(response.status, body?.detail)
  }
  return body as T
}

let authToken: string | null = null
// matches ACCOUNT_SUSPENDED in backend/core/apiDependencies.py
export const ACCOUNT_SUSPENDED = 'Account suspended'
// matches TEST_ACCOUNT_OFF: the admin turned this test account off
export const TEST_ACCOUNT_OFF = 'Test account turned off'

// why the session ended: the login ran out, the admin banned the account, or turned the test account off
export type LogoutReason = 'expired' | 'suspended' | 'testOff'

let onUnauthorized: ((reason: LogoutReason) => void) | null = null

// told when a request is refused because the site is closed for maintenance; the session stays
let onMaintenance: (() => void) | null = null

export function setMaintenanceHandler(handler: (() => void) | null) {
  onMaintenance = handler
}

// the 503 detail while the site is closed (backend/services/maintenance.py closed_detail)
function isMaintenanceDetail(detail: unknown) {
  return !!detail && typeof detail === 'object' && 'code' in detail && detail.code === 'maintenance'
}

function checkSession(status: number, detail: unknown) {
  if (status === 401) onUnauthorized?.('expired')
  else if (status === 403 && detail === ACCOUNT_SUSPENDED) onUnauthorized?.('suspended')
  else if (status === 403 && detail === TEST_ACCOUNT_OFF) onUnauthorized?.('testOff')
  else if (status === 503 && isMaintenanceDetail(detail)) onMaintenance?.()
}

// App keeps these in sync with the logged-in session.
export function setAuth(token: string | null, handleUnauthorized: ((reason: LogoutReason) => void) | null) {
  authToken = token
  onUnauthorized = handleUnauthorized
}

export function authRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`)
  return request<T>(path, { ...init, headers })
}

// a file the API only serves to its owner, so it can't be a plain <a href> or <img src>
export async function authBlob(path: string): Promise<Blob> {
  const headers = new Headers()
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`)
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, { headers })
  } catch {
    throw new ApiError(0, 'network')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    checkSession(response.status, body?.detail)
    throw new ApiError(response.status, body?.detail)
  }
  return response.blob()
}

// fetch can't report upload progress, so uploads go through XHR; onProgress gets 0..1
export function authUpload<T>(
  path: string,
  form: FormData,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE_URL}${path}`)
    if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`)
    xhr.responseType = 'json'

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as T)
        return
      }
      checkSession(xhr.status, xhr.response?.detail)
      reject(new ApiError(xhr.status, xhr.response?.detail))
    }
    xhr.onerror = () => reject(new ApiError(0, 'network'))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))

    if (signal?.aborted) {
      reject(new DOMException('Upload cancelled', 'AbortError'))
      return
    }
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(form)
  })
}
