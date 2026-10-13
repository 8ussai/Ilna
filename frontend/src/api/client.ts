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
    if (response.status === 401) onUnauthorized?.()
    const body = await response.json().catch(() => null)
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
      if (xhr.status === 401) onUnauthorized?.()
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
