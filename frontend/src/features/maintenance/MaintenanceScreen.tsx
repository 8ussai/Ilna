import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDateTime } from '../../lib/dates'
import { countdownParts } from './maintenance'
import { Header } from '../../components/Header'

type MaintenanceScreenProps = {
  message: string
  endsAt: Date
  // the server's clock in ms
  serverNow: () => number
  // once, when the countdown reaches zero
  onReached?: () => void
}

// The message and the countdown. The maintenance page shows it full size; the admin panel shows it as a preview.
export function MaintenanceScreen({ message, endsAt, serverNow, onReached }: MaintenanceScreenProps) {
  const { t, i18n } = useTranslation()
  const [now, setNow] = useState(serverNow)
  const reachedRef = useRef(false)

  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), 1000)
    return () => clearInterval(timer)
  }, [serverNow])

  const left = endsAt.getTime() - now
  useEffect(() => {
    // a new end time (extended by the admin) starts the countdown over
    if (left > 0) reachedRef.current = false
    else if (!reachedRef.current) {
      reachedRef.current = true
      onReached?.()
    }
  }, [left, onReached])

  const parts = countdownParts(left)
  const units = [
    { value: parts.days, label: t('maintenance.units.days') },
    { value: parts.hours, label: t('maintenance.units.hours') },
    { value: parts.minutes, label: t('maintenance.units.minutes') },
    { value: parts.seconds, label: t('maintenance.units.seconds') },
  ]

  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="font-serif text-3xl font-semibold sm:text-4xl">{t('maintenance.title')}</h1>
      <p dir="auto" className="mt-4 max-w-xl whitespace-pre-wrap break-words text-lg text-muted">
        {message}
      </p>

      {left > 0 ? (
        <>
          {/* the boxes change every second, so screen readers get the end time instead */}
          <div aria-hidden="true" className="mt-8 flex gap-2 sm:gap-3" dir="ltr">
            {units.map((unit) => (
              <div key={unit.label} className="w-16 rounded-xl border border-line bg-card px-2 py-3 sm:w-20">
                <div className="font-serif text-3xl font-semibold tabular-nums sm:text-4xl">{String(unit.value).padStart(2, '0')}</div>
                <div className="mt-1 text-xs text-muted">{unit.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted">{t('maintenance.backAt', { time: formatDateTime(endsAt, i18n.language) })}</p>
        </>
      ) : (
        <p role="status" className="mt-8 text-lg font-medium">
          {t('maintenance.opening')}
        </p>
      )}
    </div>
  )
}

// What every visitor sees while the site is closed.
export function MaintenancePage(props: MaintenanceScreenProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <MaintenanceScreen {...props} />
      </main>
    </div>
  )
}
