// Arabic with English in brackets, like الانحدار الخطي (Linear Regression): each bracketed run with Latin
// letters is isolated, so a line break inside it doesn't scatter its words and brackets across the line ends
const LATIN_IN_BRACKETS = /(\([^()]*[A-Za-z][^()]*\))/

export function MixedText({ text }: { text: string }) {
  const parts = text.split(LATIN_IN_BRACKETS)
  if (parts.length === 1) return text
  // split with a capture group puts the matches at the odd indexes
  return <>{parts.map((part, i) => (i % 2 === 1 ? <bdi key={i}>{part}</bdi> : part))}</>
}
