import { useTranslation } from 'react-i18next'

// matches CONTACT_EMAIL in backend/backendConfig.py
export const SUPPORT_EMAIL = 'support@ilna-academic.com'

const features = [
  // a folder: courses holding files, links and notes
  { key: 'workspace', path: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z' },
  // a microphone: lectures recorded and transcribed
  { key: 'voice', path: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3ZM5 11a7 7 0 0 0 14 0M12 18v3' },
  // a spark: AI summaries and quizzes
  { key: 'quiz', path: 'M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4L12 3ZM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z' },
  // two arrows: courses shared between students
  { key: 'share', path: 'M17 3l4 4-4 4M21 7H9a4 4 0 0 0-4 4M7 21l-4-4 4-4M3 17h12a4 4 0 0 0 4-4' },
  // lines of posts: the campus blogs
  { key: 'feed', path: 'M4 5h16v11H9l-5 4V5ZM8 9h8M8 12h5' },
  // people: friends
  { key: 'friends', path: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.2.6 3.5 2.8 3.5 6' },
] as const

// What Ilna is, beside the sign-in card on the landing page.
export function Intro() {
  const { t } = useTranslation()

  return (
    <section>
      <h1 className="font-serif text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
        {t('intro.title')}
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{t('intro.body')}</p>

      <ul className="mt-8 grid gap-5 sm:grid-cols-2">
        {features.map((f) => (
          <li key={f.key} className="flex gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface text-accent">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={f.path} />
              </svg>
            </span>
            <div>
              <h2 className="font-medium">{t(`intro.${f.key}Title`)}</h2>
              <p className="mt-0.5 text-sm leading-relaxed text-muted">{t(`intro.${f.key}Body`)}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-muted">
        {t('intro.free')}{' '}
        {t('intro.support')}{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className="font-medium text-accent hover:underline">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </section>
  )
}
