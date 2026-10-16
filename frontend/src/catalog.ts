import type { Me } from './api/auth'
import type { Catalog, Named } from './api/meta'

// The user's country/university/college/major names from the catalog, in the current language.
export function catalogNames(catalog: Catalog | null, me: Me, lang: string) {
  const name = (item?: Named) => (item ? (lang === 'ar' ? item.name_ar : item.name_en) : undefined)
  const country = catalog?.countries.find((c) => c.id === me.country)
  const university = country?.universities.find((u) => u.id === me.university)
  const college = university?.colleges.find((c) => c.id === me.college)
  const major = college?.majors.find((m) => m.id === me.major)
  return { country: name(country), university: name(university), college: name(college), major: name(major) }
}

// A post's university, college and major names; university ids are unique across countries.
export function postOriginNames(catalog: Catalog | null, post: { university: string; college: string; major: string }, lang: string) {
  const name = (item?: Named) => (item ? (lang === 'ar' ? item.name_ar : item.name_en) : undefined)
  const university = catalog?.countries.flatMap((c) => c.universities).find((u) => u.id === post.university)
  const college = university?.colleges.find((c) => c.id === post.college)
  const major = college?.majors.find((m) => m.id === post.major)
  return { university: name(university), college: name(college), major: name(major) }
}
