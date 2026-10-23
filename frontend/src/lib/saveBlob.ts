// saves data the page already has (a fetched file, a made PDF) to the computer under the given name
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  // give the browser a moment to start the download before the URL goes away
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// a note or file title made safe to save on any system: no characters Windows forbids, not too long
export function safeFileName(name: string, fallback: string) {
  const clean = name
    // characters Windows forbids, and control characters
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Windows drops trailing dots and spaces
    .replace(/[. ]+$/, '')
    .slice(0, 120)
    .trim()
  return clean || fallback
}
