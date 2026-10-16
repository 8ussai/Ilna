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
  created_at: string
  // turned on by the admin: more summaries, quizzes and storage, and a gold name
  is_premium: boolean
  // made by the admin: reads the blogs but can't post, reply, vote or use Contact us; its email isn't real
  is_test: boolean
}

export function fetchMe() {
  return authRequest<Me>('/auth/me')
}

export function changePassword(current_password: string, new_password: string) {
  return authRequest<null>('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password, new_password }),
  })
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

// register emails a 6-digit code; entering it here verifies the account and logs in
export async function verifyOtp(email: string, code: string): Promise<string> {
  const { access_token } = await request<{ access_token: string }>('/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
  return access_token
}

export function resendOtp(email: string) {
  return request<null>('/auth/resend-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}

// always succeeds for any email or username, so it doesn't tell which accounts exist; a code is emailed if one does
export function forgotPassword(identifier: string) {
  return request<null>('/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier }),
  })
}

// the emailed code and a new password; logs in, and every other session is logged out
export async function resetPassword(identifier: string, code: string, new_password: string): Promise<string> {
  const { access_token } = await request<{ access_token: string }>('/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, code, new_password }),
  })
  return access_token
}

// login answers 403 with this detail when the password is right but the email was never verified
export function unverifiedEmail(detail: unknown): string | null {
  if (detail && typeof detail === 'object' && 'code' in detail && detail.code === 'email_not_verified' && 'email' in detail) {
    return String(detail.email)
  }
  return null
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
