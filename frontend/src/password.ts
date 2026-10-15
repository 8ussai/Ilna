// same rules as backend/core/security.py (PASSWORD_RULES)
export const PASSWORD_RULES = [
  { key: 'length', test: (p: string) => p.length >= 8 },
  { key: 'lower', test: (p: string) => /[a-z]/.test(p) },
  { key: 'upper', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'number', test: (p: string) => /[0-9]/.test(p) },
  { key: 'symbol', test: (p: string) => /[^A-Za-z0-9\s]/.test(p) },
] as const

export function isStrongPassword(password: string) {
  return PASSWORD_RULES.every((rule) => rule.test(password))
}
