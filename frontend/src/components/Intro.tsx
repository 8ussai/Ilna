import { useTranslation } from 'react-i18next'

const features = [
  { key: 'workspace', path: 'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14l-4-3H6a2 2 0 0 1-2-2V5Z' },
  { key: 'quiz', path: 'M9 9a3 3 0 1 1 4.2 2.7c-.8.4-1.2 1-1.2 1.8M12 17h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z' },
  { key: 'feed', path: 'M4 6h16M4 12h16M4 18h10' },
] as const

export function Intro() {
  const { t } = useTranslation()

  return (
    <section>
      <h1 className="font-serif text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
        {t('intro.title')}
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{t('intro.body')}</p>

      <ul className="mt-8 space-y-5">
        {features.map((f) => (
          <li key={f.key} className="flex gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface text-accent">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={f.path} />
              </svg>
            </span>
            <div>
              <h2 className="font-medium">{t(`intro.${f.key}Title`)}</h2>
              <p className="mt-0.5 text-muted">{t(`intro.${f.key}Body`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
