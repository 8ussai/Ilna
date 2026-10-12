import { request } from './client'

export type Named = { id: string; name_en: string; name_ar: string }
export type Major = Named
export type College = Named & { majors: Major[] }
export type University = Named & { domain: string; colleges: College[] }
export type Country = Named & { universities: University[] }
export type Catalog = { countries: Country[] }

export function fetchCatalog() {
  return request<Catalog>('/meta/universities')
}
