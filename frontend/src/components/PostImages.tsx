import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { PostImage } from '../api/posts'

// the student site and the admin panel fetch pictures with their own logins
export type ImageFetcher = (image: PostImage) => Promise<Blob>

// Pictures are only served with the login header, so each is fetched into an object URL once it's
// near the screen, and released when the post goes away.
function useImageUrl(image: PostImage, fetchImage: ImageFetcher, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const fetchRef = useRef(fetchImage)
  useLayoutEffect(() => {
    fetchRef.current = fetchImage
  })

  useEffect(() => {
    if (!enabled) return
    let objectUrl: string | null = null
    let ignore = false
    fetchRef.current(image)
      .then((blob) => {
        if (ignore) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!ignore) setFailed(true)
      })
    return () => {
      ignore = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [image, enabled])

  return { url, failed }
}

function useNearScreen<T extends Element>() {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: '400px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [near])
  return { ref, near }
}

function Tile({
  image,
  index,
  count,
  fetchImage,
  className,
  onOpen,
}: {
  image: PostImage
  index: number
  count: number
  fetchImage: ImageFetcher
  className: string
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const { ref, near } = useNearScreen<HTMLButtonElement>()
  const { url, failed } = useImageUrl(image, fetchImage, near)
  // one picture keeps its own shape (within limits); several share a grid
  const style = count === 1 ? { aspectRatio: `${Math.max(image.width / image.height, 0.6)}` } : undefined

  return (
    <button
      ref={ref}
      type="button"
      disabled={!url}
      onClick={onOpen}
      style={style}
      aria-label={t('images.open', { number: index + 1, count })}
      className={`relative block w-full overflow-hidden rounded-lg bg-surface ${className}`}
    >
      {url && <img src={url} alt="" className="size-full object-cover" draggable={false} />}
      {failed && <span className="absolute inset-0 grid place-items-center text-sm text-muted">{t('images.loadFailed')}</span>}
      {image.is_animated && url && (
        <span className="absolute bottom-2 start-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-semibold text-white">GIF</span>
      )}
    </button>
  )
}

// The grid under a post's text: one picture wide, two side by side, three with the first wide, four as 2×2.
export function PostImages({ images, fetchImage }: { images: PostImage[]; fetchImage: ImageFetcher }) {
  const [openAt, setOpenAt] = useState<number | null>(null)
  if (images.length === 0) return null

  const count = images.length
  const tileClass = (i: number) => {
    if (count === 1) return 'max-h-[32rem]'
    if (count === 3 && i === 0) return 'col-span-2 aspect-[2/1]'
    return 'aspect-[4/3]'
  }

  return (
    <>
      <div className={`mt-3 grid gap-1.5 ${count === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {images.map((image, i) => (
          <Tile
            key={image.id}
            image={image}
            index={i}
            count={count}
            fetchImage={fetchImage}
            className={tileClass(i)}
            onOpen={() => setOpenAt(i)}
          />
        ))}
      </div>
      {openAt !== null && (
        <Viewer images={images} start={openAt} fetchImage={fetchImage} onClose={() => setOpenAt(null)} />
      )}
    </>
  )
}

function ViewerImage({ image, fetchImage, label }: { image: PostImage; fetchImage: ImageFetcher; label: string }) {
  const { t } = useTranslation()
  const { url, failed } = useImageUrl(image, fetchImage, true)
  if (failed) return <p className="text-white/80">{t('images.loadFailed')}</p>
  if (!url) return <p className="text-white/80">{t('feed.loading')}</p>
  return <img src={url} alt={label} className="max-h-full max-w-full object-contain" draggable={false} />
}

// Full screen, one picture at a time: arrows or ← → to move, Esc or the backdrop to close.
function Viewer({
  images,
  start,
  fetchImage,
  onClose,
}: {
  images: PostImage[]
  start: number
  fetchImage: ImageFetcher
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const [index, setIndex] = useState(start)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  })
  const count = images.length
  const rtl = i18n.dir() === 'rtl'

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        // the arrow pointing toward the next picture moves forward, in either reading direction
        const forward = (e.key === 'ArrowRight') !== rtl
        setIndex((i) => (i + (forward ? 1 : count - 1)) % count)
      } else if (e.key === 'Tab') {
        // only the viewer's own buttons take focus while it's open
        const buttons = [...document.querySelectorAll<HTMLElement>('[data-viewer-control]')]
        const at = buttons.indexOf(document.activeElement as HTMLElement)
        e.preventDefault()
        buttons[(at + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
      if (opener?.isConnected) opener.focus()
    }
  }, [count, rtl])

  const label = t('images.alt', { number: index + 1, count })
  const navButton = 'absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 sm:p-10"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <ViewerImage key={images[index].id} image={images[index]} fetchImage={fetchImage} label={label} />

      <button
        ref={closeRef}
        type="button"
        data-viewer-control
        onClick={onClose}
        aria-label={t('images.close')}
        className="absolute end-3 top-3 grid size-11 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      {count > 1 && (
        <>
          <button
            type="button"
            data-viewer-control
            onClick={() => setIndex((i) => (i + count - 1) % count)}
            aria-label={t('images.previous')}
            className={`${navButton} start-3`}
          >
            <svg viewBox="0 0 24 24" className="size-6 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            data-viewer-control
            onClick={() => setIndex((i) => (i + 1) % count)}
            aria-label={t('images.next')}
            className={`${navButton} end-3`}
          >
            <svg viewBox="0 0 24 24" className="size-6 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          <p className="absolute bottom-4 start-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white rtl:translate-x-1/2">
            {index + 1} / {count}
          </p>
        </>
      )}
    </div>
  )
}
