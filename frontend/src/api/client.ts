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
    throw new ApiError(response.status, body?.detail)
  }
  return body as T
}
