"""Writes a course's summaries and quizzes with Gemini, in Arabic and English.

The text is what's already stored for AI search: a file's or recording's chunks, read straight from Chroma
(so the embedding model is never loaded), and a typed note's current text from the database (always up to
date, unlike its embedding, which waits for the note to go quiet). The main language is written first and
the other is a translation of it, so both versions say the same thing and a quiz keeps its option order.

Gemini is a network call, not local compute, so this runs on its own small pool instead of waiting behind
a transcription in the jobs queue. Work cut off by a restart is found again on startup (main.py).
"""

import json
import os
import random
import re
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor

from langchain_google_genai import ChatGoogleGenerativeAI

from backend.config import (
    GEMINI_MODEL,
    QUIZ_OPTIONS_PER_QUESTION,
    STUDY_ATTEMPTS,
    STUDY_MAX_OVERLAP_CHARS,
    STUDY_MAX_PROMPT_CHARS,
)
from backend.courses.embeddings import material_chunks
from backend.courses.models import CourseMaterial, CourseNote
from backend.database import SessionLocal
from backend.study.models import StudyItem
from backend.study.schemas import QuizContent, QuizQuestion, SummaryContent

LANGUAGE_NAMES = {"ar": "Arabic", "en": "English"}

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ai-study")
_llm_lock = threading.Lock()
_llm = None


# the failures a user can be told about, by code; the page shows its own words for each, in its language
ERRORS = {
    "quota": "Gemini's usage limit was reached. Try again later.",
    "no_text": "The chosen files, recordings and notes have no text to read, or were deleted.",
    "empty_answer": "Gemini sent back an empty answer.",
    "no_summary": "Gemini couldn't write a summary of this material.",
    "no_questions": "Gemini couldn't write questions from this material.",
    "bad_translation": "The translation didn't keep the original's structure.",
}


def error_code(message: str | None) -> str | None:
    """The code of a stored error message; "other" for anything unexpected."""
    if message is None:
        return None
    return next((code for code, text in ERRORS.items() if text == message), "other")


class StudyError(Exception):
    """A known failure, stored as its ERRORS message."""

    # the message shown for this error code
    def __init__(self, code: str):
        super().__init__(ERRORS[code])


# raised when a summary or quiz is deleted while it's being written, so the job stops quietly
class _ItemDeleted(Exception):
    pass


# whether a Gemini API key is set
def gemini_configured() -> bool:
    return bool(os.getenv("GOOGLE_API_KEY"))


# the Gemini client, made on first use so the server starts without an API key
def _get_llm() -> ChatGoogleGenerativeAI:
    # made on first use, so the server starts (and everything else works) without an API key
    global _llm
    with _llm_lock:
        if _llm is None:
            _llm = ChatGoogleGenerativeAI(model=GEMINI_MODEL, temperature=0.3, timeout=300, max_retries=2)
        return _llm


# runs a writing job on its own thread, so the request that started it can return
def submit(job, *args):
    # runs the job, logging any failure it didn't handle itself
    def run():
        try:
            job(*args)
        except Exception:
            # a job reports its own failures; this only keeps one that slips through from vanishing
            traceback.print_exc()

    _executor.submit(run)


# --- reading the sources ---


# seconds as m:ss or h:mm:ss, for the timestamps in a recording's text
def _timestamp(seconds: float) -> str:
    seconds = int(seconds)
    h, m, s = seconds // 3600, seconds % 3600 // 60, seconds % 60
    return f"{h}:{m:02}:{s:02}" if h else f"{m}:{s:02}"


def _strip_overlap(previous: str, text: str) -> str:
    """Drops the start of a chunk that repeats the end of the one before it."""
    for size in range(min(len(previous), len(text), STUDY_MAX_OVERLAP_CHARS), 19, -1):
        if previous.endswith(text[:size]):
            return text[size:].lstrip()
    return text


# a file's or recording's indexed text, with page or timestamp markers, overlaps removed
def _material_text(material: CourseMaterial) -> str:
    lines, previous, page = [], "", None
    for text, metadata in material_chunks(material.id):
        if material.kind == "audio":
            lines.append(f"[{_timestamp(metadata.get('start_sec') or 0)}] {text}")
            continue
        if metadata.get("page") is not None and metadata["page"] != page:
            page = metadata["page"]
            lines.append(f"[Page {page + 1}]")
        lines.append(_strip_overlap(previous, text) if previous else text)
        previous = text
    return "\n".join(lines).strip()


def _gather(db, sources: list[dict]) -> list[str]:
    """One labelled block of text per source that still exists and has something in it."""
    blocks = []
    for source in sources:
        if source["type"] == "material":
            material = db.get(CourseMaterial, source["id"])
            if material is None:
                continue
            label = "Recording" if material.kind == "audio" else "File"
            name, text = material.file_name, _material_text(material)
        else:
            note = db.get(CourseNote, source["id"])
            if note is None or note.kind != "text":
                continue
            label = "Note"
            name = note.title or source["name"]
            text = note.content.strip()
        if text:
            blocks.append(f'=== {label}: "{name}" ===\n{text}')
    return blocks


_ARABIC = re.compile(r"[؀-ۿ]")
_LATIN = re.compile(r"[A-Za-z]")


# "ar" or "en": whichever script most of the letters are in
def _detect_language(text: str) -> str:
    # whichever script most of the letters are in
    return "ar" if len(_ARABIC.findall(text)) > len(_LATIN.findall(text)) else "en"


# cuts text into pieces of at most size characters, at line breaks where it can
def _split(text: str, size: int) -> list[str]:
    if len(text) <= size:
        return [text]
    pieces, current = [], ""
    for line in text.splitlines():
        for start in range(0, max(len(line), 1), size):
            segment = line[start : start + size]
            if current and len(current) + len(segment) + 1 > size:
                pieces.append(current)
                current = ""
            current = f"{current}\n{segment}" if current else segment
    if current:
        pieces.append(current)
    return pieces


def _parts(blocks: list[str]) -> list[str]:
    """The source blocks packed into as few parts as fit in one request each (usually just one)."""
    parts, current = [], ""
    for block in blocks:
        for piece in _split(block, STUDY_MAX_PROMPT_CHARS):
            if current and len(current) + len(piece) + 2 > STUDY_MAX_PROMPT_CHARS:
                parts.append(current)
                current = ""
            current = f"{current}\n\n{piece}" if current else piece
    if current:
        parts.append(current)
    return parts


# --- prompts ---

MATERIAL_NOTES = """About the material:
- Files are the student's course documents; [Page N] marks where a page starts.
- Recordings are automatic transcripts of lectures; [m:ss] marks the time. They can contain speech-recognition mistakes: read past obvious ones, and skip small talk and announcements.
- Notes are the student's own notes.
Use only what the material says; don't add facts from outside it."""

SUMMARY_LENGTHS = {
    "brief": "Keep it brief: an overview of 2-3 sentences, 3-6 sections with 2-4 points each, and up to 8 key terms.",
    "detailed": (
        "Make it detailed and complete: an overview paragraph, one section per topic the material covers (up to 15), "
        "3-8 points each, and up to 25 key terms. Keep the important definitions, formulas, steps and examples."
    ),
}


# how Gemini should write in the chosen language (Arabic keeps English terms in brackets)
def _language_rules(language: str) -> str:
    if language == "ar":
        return (
            "Write everything in Modern Standard Arabic. The first time a technical term appears, "
            "follow it with the English term in brackets, for example: الانحدار الخطي (Linear Regression). "
            "Every key term is written that way too, Arabic then English in brackets. Use one pair of brackets only: "
            "a symbol or abbreviation goes inside it, as in الوزن (Weight, w). Use the Arabic terms common in "
            "Arab universities; where there's none, keep the English term."
        )
    return "Write everything in English."


# the prompt for a summary of the material
def _summary_prompt(text: str, length: str, language: str) -> str:
    return f"""You are a university teaching assistant. Write a study summary of the course material below, for a student revising for an exam.

{SUMMARY_LENGTHS[length]}
{_language_rules(language)}

{MATERIAL_NOTES}

Material:
{text}"""


# the prompt for notes on one part of a material too long to read at once
def _notes_prompt(text: str, part: int, parts: int, language: str) -> str:
    return f"""You are a university teaching assistant. This is part {part} of {parts} of a course's material, too long to read at once. Write thorough study notes on this part: every topic, definition, formula and example in it, as headed bullet lists. The notes from all parts will be combined into one summary afterwards.

{_language_rules(language)}

{MATERIAL_NOTES}

Material (part {part} of {parts}):
{text}"""


# the prompt for a multiple-choice quiz on the material
def _quiz_prompt(text: str, count: int, language: str) -> str:
    return f"""You are a university teaching assistant. Write a multiple-choice quiz of exactly {count} questions on the course material below, to check that a student understands it before an exam.

- Each question has exactly {QUIZ_OPTIONS_PER_QUESTION} options and exactly one correct answer.
- Test understanding of the important ideas, not trivia like page numbers or what the lecturer joked about.
- Make the wrong options plausible and about as long as the right one. Don't use "all of the above" or "none of the above".
- Spread the questions across the whole material, not just its start.
- Each question must make sense on its own, without the material in front of the student.
{_language_rules(language)}

{MATERIAL_NOTES}

Material:
{text}"""


# the prompt to translate a summary or quiz, keeping its exact shape
def _translate_prompt(content, kind: str, source: str, target: str) -> str:
    if kind == "summary":
        shape = (
            "the same number of sections, the same number of points in each section, and the same number of key terms"
        )
    else:
        shape = f"the same number of questions, each with the same {QUIZ_OPTIONS_PER_QUESTION} options"
    return f"""Translate this study {kind} from {LANGUAGE_NAMES[source]} to {LANGUAGE_NAMES[target]}, for a university student.

- Return exactly the same structure: {shape}, all in the same order.
- Translate faithfully: don't add, drop, merge or reorder anything. Keep formulas, code, numbers and units as they are.
{_language_rules(target)}

{json.dumps(content.model_dump(), ensure_ascii=False, indent=1)}"""


# --- writing ---


# asks Gemini for an answer in the given shape
def _ask(schema, prompt: str):
    result = _get_llm().with_structured_output(schema).invoke(prompt)
    if result is None:
        raise StudyError("empty_answer")
    return result


# drops empty points, sections and key terms from Gemini's summary
def _clean_summary(summary: SummaryContent) -> SummaryContent:
    sections = []
    for section in summary.sections:
        points = [p.strip() for p in section.points if p.strip()]
        if section.heading.strip() and points:
            sections.append({"heading": section.heading.strip(), "points": points})
    terms = [
        {"term": t.term.strip(), "definition": t.definition.strip()}
        for t in summary.key_terms
        if t.term.strip() and t.definition.strip()
    ]
    return SummaryContent(
        title=summary.title.strip(), overview=summary.overview.strip(), sections=sections, key_terms=terms
    )


# writes a summary; long material is first turned into notes part by part
def _write_summary(parts: list[str], length: str, language: str) -> SummaryContent:
    if len(parts) == 1:
        text = parts[0]
    else:
        # too long for one request: notes on each part first, then one summary of all the notes
        notes = [
            _get_llm().invoke(_notes_prompt(part, i, len(parts), language)).text for i, part in enumerate(parts, 1)
        ]
        text = "\n\n".join(notes)
    summary = _clean_summary(_ask(SummaryContent, _summary_prompt(text, length, language)))
    if not summary.sections:
        raise StudyError("no_summary")
    return summary


# keeps only questions with a question, 4 non-empty options and a valid answer
def _valid_questions(questions: list[QuizQuestion]) -> list[QuizQuestion]:
    valid = []
    for q in questions:
        options = [o.strip() for o in q.options]
        if (
            q.question.strip()
            and len(options) == QUIZ_OPTIONS_PER_QUESTION
            and all(options)
            and len({o.casefold() for o in options}) == QUIZ_OPTIONS_PER_QUESTION
            and 0 <= q.correct_index < QUIZ_OPTIONS_PER_QUESTION
        ):
            valid.append(
                QuizQuestion(
                    question=q.question.strip(),
                    options=options,
                    correct_index=q.correct_index,
                    explanation=q.explanation.strip(),
                )
            )
    return valid


# mixes up a question's options, since models tend to put the right answer first
def _shuffled(q: QuizQuestion) -> QuizQuestion:
    # models tend to put the right answer first
    order = list(range(QUIZ_OPTIONS_PER_QUESTION))
    random.shuffle(order)
    return QuizQuestion(
        question=q.question,
        options=[q.options[i] for i in order],
        correct_index=order.index(q.correct_index),
        explanation=q.explanation,
    )


# writes a quiz, sharing the questions out over a long material's parts
def _write_quiz(parts: list[str], count: int, language: str) -> QuizContent:
    total = sum(len(part) for part in parts)
    title, questions = "", []
    for part in parts:
        # a long material's questions are shared out by how much of it each part holds
        wanted = count if len(parts) == 1 else max(1, round(count * len(part) / total))
        best = []
        for _ in range(STUDY_ATTEMPTS):
            result = _ask(QuizContent, _quiz_prompt(part, wanted, language))
            title = title or result.title.strip()
            valid = _valid_questions(result.questions)
            if len(valid) > len(best):
                best = valid
            if len(best) >= wanted:
                break
        questions += best[:wanted]
    if not questions:
        raise StudyError("no_questions")
    return QuizContent(title=title, questions=[_shuffled(q) for q in questions[:count]])


# whether a translation kept the original's sections, points, terms or questions
def _same_shape(original, translated, kind: str) -> bool:
    if kind == "summary":
        return (
            len(translated.sections) == len(original.sections)
            and all(len(t.points) == len(o.points) for t, o in zip(translated.sections, original.sections))
            and len(translated.key_terms) == len(original.key_terms)
        )
    return len(translated.questions) == len(original.questions) and all(
        len(q.options) == QUIZ_OPTIONS_PER_QUESTION for q in translated.questions
    )


# translates a summary or quiz, asking again if the shape came back wrong
def _translate(original, kind: str, source: str, target: str):
    schema = SummaryContent if kind == "summary" else QuizContent
    prompt = _translate_prompt(original, kind, source, target)
    for _ in range(STUDY_ATTEMPTS):
        translated = _ask(schema, prompt)
        if _same_shape(original, translated, kind):
            if kind == "quiz":
                # the answer is the original's; options are in the same order, so the index carries over
                for question, source_question in zip(translated.questions, original.questions):
                    question.correct_index = source_question.correct_index
            return translated
    raise StudyError("bad_translation")


# the error text saved on a failed summary or quiz
def _message(error: Exception) -> str:
    if isinstance(error, StudyError):
        return str(error)
    text = str(error)
    if "RESOURCE_EXHAUSTED" in text or "429" in text:
        return ERRORS["quota"]
    return f"Gemini couldn't finish this: {text}"[:500]


# --- jobs ---


# the summary or quiz again, read fresh; stops the job if it was deleted meanwhile
def _reload(db, item_id: int) -> StudyItem:
    # a query, not db.get, so a row deleted by another request is noticed instead of read from the session
    item = db.query(StudyItem).filter(StudyItem.id == item_id).first()
    if item is None:
        raise _ItemDeleted()
    return item


def generate_item(item_id: int):
    """Writes the main version, then the translation."""
    db = SessionLocal()
    try:
        item = _reload(db, item_id)
        if item.status != "done":
            item.status = "processing"
            item.error = None
            db.commit()

            blocks = _gather(db, json.loads(item.sources))
            if not blocks:
                raise StudyError("no_text")
            language = item.requested_language or _detect_language("\n".join(blocks))
            parts = _parts(blocks)
            options = json.loads(item.options)
            print(
                f"[Study] Writing {item.kind} {item_id} in {language} from {len(blocks)} sources "
                f"({sum(map(len, parts))} characters, {len(parts)} part(s))"
            )

            if item.kind == "summary":
                content = _write_summary(parts, options["length"], language)
            else:
                content = _write_quiz(parts, options["num_questions"], language)

            item = _reload(db, item_id)
            item.main_language = language
            item.content = json.dumps({language: content.model_dump()}, ensure_ascii=False)
            item.status = "done"
            item.translation_status = "pending"
            item.translation_error = None
            db.commit()
            print(f"[Study] {item.kind.capitalize()} {item_id} written")

    except _ItemDeleted:
        db.rollback()
        print(f"[Study] Item {item_id} was deleted while it was being written")
        return

    except Exception as e:
        db.rollback()
        print(f"[Study] Writing item {item_id} failed: {e}")
        item = db.query(StudyItem).filter(StudyItem.id == item_id).first()
        if item is not None:
            item.status = "failed"
            item.error = _message(e)
            db.commit()
        return

    finally:
        db.close()

    translate_item(item_id)


def translate_item(item_id: int):
    """Makes the other language's version from the main one."""
    db = SessionLocal()
    try:
        item = _reload(db, item_id)
        if item.status != "done" or item.translation_status == "done":
            return
        item.translation_status = "processing"
        item.translation_error = None
        db.commit()

        source = item.main_language
        target = "en" if source == "ar" else "ar"
        schema = SummaryContent if item.kind == "summary" else QuizContent
        original = schema.model_validate(json.loads(item.content)[source])
        translated = _translate(original, item.kind, source, target)

        item = _reload(db, item_id)
        content = json.loads(item.content)
        content[target] = translated.model_dump()
        item.content = json.dumps(content, ensure_ascii=False)
        item.translation_status = "done"
        db.commit()
        print(f"[Study] Item {item_id} translated to {target}")

    except _ItemDeleted:
        db.rollback()

    except Exception as e:
        db.rollback()
        print(f"[Study] Translating item {item_id} failed: {e}")
        item = db.query(StudyItem).filter(StudyItem.id == item_id).first()
        if item is not None:
            item.translation_status = "failed"
            item.translation_error = _message(e)
            db.commit()

    finally:
        db.close()


def requeue_unfinished(db) -> int:
    """Queues every item a restart cut off; returns how many."""
    unwritten = (
        db.query(StudyItem.id).filter(StudyItem.status.in_(["pending", "processing"])).order_by(StudyItem.id).all()
    )
    untranslated = (
        db.query(StudyItem.id)
        .filter(StudyItem.status == "done", StudyItem.translation_status.in_(["pending", "processing"]))
        .order_by(StudyItem.id)
        .all()
    )
    for (item_id,) in unwritten:
        submit(generate_item, item_id)
    for (item_id,) in untranslated:
        submit(translate_item, item_id)
    return len(unwritten) + len(untranslated)
