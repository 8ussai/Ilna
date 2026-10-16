import { authRequest, request } from './client'

export type Named = { id: string; name_en: string; name_ar: string }
export type Major = Named
export type College = Named & { majors: Major[] }
export type University = Named & { domain: string; colleges: College[] }
export type Country = Named & { universities: University[] }
export type Catalog = { countries: Country[] }

export function fetchCatalog() {
  return request<Catalog>('/meta/universities')
}

export type MaintenanceState = 'off' | 'scheduled' | 'on'

// backend/schemas/maintenance.py; times are UTC strings
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
