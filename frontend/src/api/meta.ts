import { authRequest, request } from './client'

export type Named = { id: string; name_en: string; name_ar: string }
type Major = Named
type College = Named & { majors: Major[] }
// domain: the students' email domain; addresses at it or its subdomains can sign up
export type University = Named & { domain: string; colleges: College[] }
type Country = Named & { universities: University[] }
export type Catalog = { countries: Country[] }

// the universities, colleges and majors offered at sign-up
export function fetchCatalog() {
  return request<Catalog>('/meta/universities')
}

type MaintenanceState = 'off' | 'scheduled' | 'on'

// backend/maintenance/schemas.py; times are UTC strings
export type MaintenanceStatus = {
  state: MaintenanceState
  message: string | null
  starts_at: string | null
  ends_at: string | null
  // the countdown runs on the server's clock, not the visitor's
  server_now: string
  // a test user's login opened from the admin panel, which may use the site while it's closed
  bypass: boolean
}

// sends the login if there is one, so the server can tell a test user opened from the admin panel
export function fetchStatus() {
  return authRequest<MaintenanceStatus>('/meta/status')
}
