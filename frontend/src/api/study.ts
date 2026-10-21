import { authRequest } from './client'

export type StudyKind = 'summary' | 'quiz'
type StudyStatus = 'pending' | 'processing' | 'done' | 'failed'
export type StudyLanguage = 'ar' | 'en'
export const STUDY_LANGUAGES: StudyLanguage[] = ['en', 'ar']
// each language named in itself, like a language menu, whatever language the page is in
export const LANGUAGE_NAMES: Record<StudyLanguage, string> = { en: 'English', ar: 'العربية' }

// why writing or translating one failed (the backend's study_generator.ERRORS)
type StudyErrorCode = 'quota' | 'no_text' | 'empty_answer' | 'no_summary' | 'no_questions' | 'bad_translation' | 'other'

export type SummaryLength = 'brief' | 'detailed'
export const QUESTION_COUNTS = [5, 10, 15, 20] as const
export type QuestionCount = (typeof QUESTION_COUNTS)[number]

// the backend's STUDY_MAX_SOURCES
export const STUDY_MAX_SOURCES = 50

export type StudySource = {
  type: 'material' | 'note'
  id: number
  kind: 'document' | 'audio' | 'text'
  // as it was named when the item was made
  name: string
}

// a card in the Summaries & quizzes tab
export type StudyItemSummary = {
  id: number
  course_id: number
  kind: StudyKind
  // the user's own title; null = show titles[language]
  title: string | null
  // the generated title of each version that's ready
  titles: Partial<Record<StudyLanguage, string>>
  status: StudyStatus
  // the English detail, and a code to word it in the page's language
  error: string | null
  error_code: StudyErrorCode | null
  requested_language: StudyLanguage | null
  // set once the main version is written
  main_language: StudyLanguage | null
  // the other language's version, made after the main one
  translation_status: StudyStatus | null
  translation_error: string | null
  translation_error_code: StudyErrorCode | null
  // the language it was last read in; null = its main language
  view_language: StudyLanguage | null
  options: { length?: SummaryLength; num_questions?: QuestionCount }
  sources: StudySource[]
  question_count: number | null
  attempts_count: number
  last_score: number | null
  best_score: number | null
  created_at: string
  updated_at: string
}

type StudyCreateInput = {
  kind: StudyKind
  sources: { type: 'material' | 'note'; id: number }[]
  // the main language; null = the material's own
  language: StudyLanguage | null
  length?: SummaryLength
  num_questions?: QuestionCount
}

const json = { 'Content-Type': 'application/json' }

// a course's summaries and quizzes, newest first
export function fetchStudyItems(courseId: number) {
  return authRequest<StudyItemSummary[]>(`/courses/${courseId}/study`)
}

// starts writing it; the result comes back pending
export function createStudyItem(courseId: number, input: StudyCreateInput) {
  return authRequest<StudyItemSummary>(`/courses/${courseId}/study`, { method: 'POST', headers: json, body: JSON.stringify(input) })
}

// a failed item, or a failed translation, tried again
export function retryStudyItem(courseId: number, itemId: number) {
  return authRequest<StudyItemSummary>(`/courses/${courseId}/study/${itemId}/retry`, { method: 'POST' })
}

// deletes a summary or quiz
export function deleteStudyItem(courseId: number, itemId: number) {
  return authRequest<null>(`/courses/${courseId}/study/${itemId}`, { method: 'DELETE' })
}

// still being written, or its other language still being made
export function isStudyItemWorking(item: StudyItemSummary) {
  return (
    item.status === 'pending' ||
    item.status === 'processing' ||
    (item.status === 'done' && (item.translation_status === 'pending' || item.translation_status === 'processing'))
  )
}

// the language it opens in: the one last chosen for it, else its main one
export function studyLanguage(item: StudyItemSummary): StudyLanguage | null {
  return item.view_language ?? item.main_language
}

export type SummaryContent = {
  title: string
  overview: string
  sections: { heading: string; points: string[] }[]
  key_terms: { term: string; definition: string }[]
}

// a question as it's shown while taking the quiz: no answer, no explanation
export type QuizPublic = {
  title: string
  questions: { question: string; options: string[] }[]
}

// one summary or quiz with its content, by language (only the versions that are ready)
export type StudyItem = StudyItemSummary & {
  summary: Partial<Record<StudyLanguage, SummaryContent>> | null
  quiz: Partial<Record<StudyLanguage, QuizPublic>> | null
}

// one summary or quiz with its content
export function fetchStudyItem(courseId: number, itemId: number) {
  return authRequest<StudyItem>(`/courses/${courseId}/study/${itemId}`)
}

// rename it (null = back to the generated title), or remember the language it's read in
export function updateStudyItem(courseId: number, itemId: number, changes: { title?: string | null; view_language?: StudyLanguage }) {
  return authRequest<StudyItemSummary>(`/courses/${courseId}/study/${itemId}`, { method: 'PATCH', headers: json, body: JSON.stringify(changes) })
}

type QuestionResult = {
  chosen: number | null
  correct_index: number
  is_correct: boolean
  // by language, like the quiz itself
  explanation: Partial<Record<StudyLanguage, string>>
}

// one graded go at a quiz
export type QuizAttempt = {
  id: number
  score: number
  total: number
  results: QuestionResult[]
  created_at: string
}

// one answer per question, in order; null = left unanswered (counts as wrong)
export function submitQuizAttempt(courseId: number, itemId: number, answers: (number | null)[]) {
  return authRequest<QuizAttempt>(`/courses/${courseId}/study/${itemId}/attempts`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ answers }),
  })
}

// newest first
export function fetchQuizAttempts(courseId: number, itemId: number) {
  return authRequest<QuizAttempt[]>(`/courses/${courseId}/study/${itemId}/attempts`)
}
