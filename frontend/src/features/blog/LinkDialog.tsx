import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '../../components/Dialog'
import { primaryButton } from '../../components/styles'
import { formatNamedLink, namedLinkHref } from './links'

const fieldClass =
  'h-11 w-full rounded-lg border border-line bg-bg px-3 text-fg placeholder:text-muted focus:border-accent focus:outline-none'

// The composer's Link button opens this: text to show and a web address, inserted as [text](address).
// initialText is what was selected in the text box, if anything.
export function LinkDialog({
  initialText,
  onInsert,
  onClose,
}: {
  initialText: string
  onInsert: (link: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const textId = useId()
  const addressId = useId()
  const [text, setText] = useState(initialText)
  const [address, setAddress] = useState('')
  const [error, setError] = useState('')

  // checks the address, then hands back the finished link
  function submit(e: FormEvent) {
    e.preventDefault()
    // stops the post's own form from submitting too: this one is rendered inside the page's tree
    e.stopPropagation()
    const href = namedLinkHref(address.trim())
    if (!href) {
      setError(t('composer.linkInvalid'))
      return
    }
    onInsert(formatNamedLink(text, href))
  }

  return (
    <Dialog title={t('composer.linkTitle')} onClose={onClose} centered>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor={textId} className="text-sm font-medium">
            {t('composer.linkText')}
          </label>
          <input
            id={textId}
            value={text}
            dir="auto"
            maxLength={300}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('composer.linkTextPlaceholder')}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={addressId} className="text-sm font-medium">
            {t('composer.linkAddress')}
          </label>
          <input
            id={addressId}
            value={address}
            dir="ltr"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setAddress(e.target.value)
              setError('')
            }}
            placeholder="https://"
            aria-invalid={error ? true : undefined}
            className={fieldClass}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface hover:text-fg">
            {t('feed.cancel')}
          </button>
          <button type="submit" disabled={!address.trim()} className={`${primaryButton} h-10 w-auto`}>
            {t('composer.linkInsert')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
