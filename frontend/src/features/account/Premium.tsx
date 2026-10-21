import { useTranslation } from 'react-i18next'

import { Dialog } from '../../components/Dialog'
import { primaryButtonInline } from '../../components/styles'

// a premium student's name and username are gold; the crown says it without relying on color
export const goldClass = 'text-gold'

export function PremiumCrown({ className = 'size-4' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <svg viewBox="0 0 24 24" className={`inline-block shrink-0 align-[-0.125em] text-gold ${className}`} fill="currentColor" role="img" aria-label={t('premium.label')}>
      <title>{t('premium.label')}</title>
      <path d="M3 7.5 7.5 11 12 4l4.5 7L21 7.5 19 18H5L3 7.5ZM5 20h14v1.5H5V20Z" />
    </svg>
  )
}

// "First Last" with the crown, gold when premium
export function UserName({
  user,
  className = '',
}: {
  user: { first_name: string; last_name: string; is_premium?: boolean }
  className?: string
}) {
  return (
    <span className={`${user.is_premium ? goldClass : ''} ${className}`}>
      {user.first_name} {user.last_name}
      {user.is_premium && (
        <>
          {' '}
          <PremiumCrown />
        </>
      )}
    </span>
  )
}

// What premium includes. Nobody can buy it yet; the admin turns it on.
export function PremiumDialog({ isPremium, onClose }: { isPremium: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const perks = (['study', 'courses', 'storage', 'friends', 'color', 'name'] as const).map((key) => t(`premium.perks.${key}`))

  return (
    <Dialog title={isPremium ? t('premium.youArePremium') : t('premium.upgrade')} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gold/15">
            <PremiumCrown className="size-7" />
          </span>
          <p className="font-medium">{isPremium ? t('premium.activeIntro') : t('premium.soon')}</p>
        </div>
        <ul className="space-y-2 text-sm">
          {perks.map((perk) => (
            <li key={perk} className="flex items-start gap-2">
              <span aria-hidden="true" className="w-4 text-center text-gold">
                ✓
              </span>
              <span>{perk}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={primaryButtonInline}>
            {t('premium.ok')}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
