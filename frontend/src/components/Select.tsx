import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { controlClass, FieldMessage } from './Field'

export type Option = { value: string; label: string }

type SelectProps = {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  disabled?: boolean
  error?: string
}

// Searchable dropdown (combobox pattern): a button that opens a listbox with a search box.
export function Select({ label, value, options, onChange, disabled, error }: SelectProps) {
  const { t } = useTranslation()
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  }, [options, query])

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open) search.current?.focus()
  }, [open])

  useEffect(() => {
    if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, id])

  function openList() {
    setQuery('')
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  function choose(option: Option) {
    onChange(option.value)
    setOpen(false)
    button.current?.focus()
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[active]) choose(filtered[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      button.current?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={root} className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <button
        ref={button}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        className={`${controlClass} flex items-center justify-between gap-2 ${error ? 'border-danger' : ''}`}
      >
        <span className={`truncate ${selected ? '' : 'text-muted'}`}>{selected?.label ?? t('auth.select')}</span>
        <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-line bg-card p-2 shadow-sm">
          <input
            ref={search}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={filtered.length ? `${id}-opt-${active}` : undefined}
            aria-label={label}
            value={query}
            placeholder={t('auth.search')}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onSearchKeyDown}
            className="mb-2 h-9 w-full rounded-md border border-line bg-bg px-2 text-sm placeholder:text-muted"
          />
          <ul id={`${id}-list`} role="listbox" aria-label={label} className="max-h-56 overflow-y-auto">
            {filtered.map((o, i) => (
              <li
                key={o.value}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                className={`cursor-pointer rounded-md px-2 py-2 text-sm ${i === active ? 'bg-surface' : ''} ${
                  o.value === value ? 'font-semibold text-accent' : ''
                }`}
              >
                {o.label}
              </li>
            ))}
            {filtered.length === 0 && <li className="px-2 py-2 text-sm text-muted">{t('auth.noResults')}</li>}
          </ul>
        </div>
      )}

      <FieldMessage id={id} error={error} />
    </div>
  )
}
