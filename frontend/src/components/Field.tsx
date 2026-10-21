import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

export const controlClass =
  'h-11 w-full rounded-lg border border-line bg-card px-3 text-start text-fg placeholder:text-muted ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

type FieldProps = {
  label: string
  error?: string
  hint?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>

// a labeled text input with its hint or error
export function Field({ label, error, hint, className, ...input }: FieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${controlClass} ${error ? 'border-danger' : ''} ${className ?? ''}`}
        {...input}
      />
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  )
}

// the error or hint under a field
export function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) {
    return (
      <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm text-danger">
        {error}
      </p>
    )
  }
  if (hint) {
    return (
      <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
        {hint}
      </p>
    )
  }
  return null
}
