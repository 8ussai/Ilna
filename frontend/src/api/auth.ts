import { authRequest, request } from './client'

export type Me = {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  country: string
  university: string
  college: string
  major: string
}

export function fetchMe() {
  return authRequest<Me>('/auth/me')
}

export type RegisterPayload = {
  username: string
  first_name: string
  last_name: string
  email: string
  password: string
  country: string
  university: string
  college: string
  major: string
}

export function register(payload: RegisterPayload) {
  return request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

// The backend uses OAuth2PasswordRequestForm, so login is form-encoded, not JSON.
export async function login(identifier: string, password: string): Promise<string> {
  const { access_token } = await request<{ access_token: string }>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: identifier, password }),
  })
  return access_token
}

const TOKEN_KEY = 'ilna-token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage may be blocked; user will just need to log in again next visit
  }
}
