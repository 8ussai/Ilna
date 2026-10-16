import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from backend.backendConfig import NOTE_NAME_CHARS
from backend.core.apiDependencies import get_current_user
from backend.database import get_db
from backend.models.course import Course, CourseMaterial, CourseNote
from backend.models.study import QuizAttempt, StudyGeneration, StudyItem
from backend.models.user import User
from backend.routes.courses import get_owned_course
from backend.schemas.study import (
    AttemptCreate,
    AttemptOut,
    QuestionResult,
    StudyCreate,
    StudyItemOut,
    StudyItemSummaryOut,
    StudyItemUpdate,
    StudyKind,
    StudyStatus,
)
from backend.services import study_generator
from backend.services.usage import study_limit, study_usage
from backend.services.study_generator import generate_item, translate_item

router = APIRouter()


def _get_item(db: Session, course: Course, item_id: int) -> StudyItem:
    item = (
        db.query(StudyItem)
        .options(selectinload(StudyItem.attempts))
        .filter(StudyItem.id == item_id, StudyItem.course_id == course.id)
        .first()
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Summary or quiz with id {item_id} not found in this course.",
        )
    return item


def _content(item: StudyItem) -> dict:
    return json.loads(item.content) if item.content else {}


def _summary_out(item: StudyItem, model=StudyItemSummaryOut, **extra):
    content = _content(item)
    scores = [attempt.score for attempt in item.attempts]
    question_count = None
    if item.kind == StudyKind.quiz.value and item.main_language in content:
        question_count = len(content[item.main_language]["questions"])
    return model(
        id=item.id,
        course_id=item.course_id,
        kind=item.kind,
        title=item.title,
        titles={language: version["title"] for language, version in content.items()},
        status=item.status,
        error=item.error,
        error_code=study_generator.error_code(item.error),
        requested_language=item.requested_language,
        main_language=item.main_language,
        translation_status=item.translation_status,
        translation_error=item.translation_error,
        translation_error_code=study_generator.error_code(item.translation_error),
        view_language=item.view_language,
        options=json.loads(item.options),
        sources=json.loads(item.sources),
        question_count=question_count,
        attempts_count=len(scores),
        last_score=scores[-1] if scores else None,
        best_score=max(scores) if scores else None,
        created_at=item.created_at,
        updated_at=item.updated_at,
        **extra,
    )


def _item_out(item: StudyItem) -> StudyItemOut:
    content = _content(item)
    if item.kind == StudyKind.summary.value:
        return _summary_out(item, StudyItemOut, summary=content)
    # the answers and explanations stay on the server until an attempt is submitted
    quiz = {
        language: {
            "title": version["title"],
            "questions": [{"question": q["question"], "options": q["options"]} for q in version["questions"]],
        }
        for language, version in content.items()
    }
    return _summary_out(item, StudyItemOut, quiz=quiz)


def _attempt_out(item: StudyItem, attempt: QuizAttempt) -> AttemptOut:
    content = _content(item)
    answers = json.loads(attempt.answers)
    results = []
    for i, (chosen, question) in enumerate(zip(answers, content[item.main_language]["questions"])):
        results.append(QuestionResult(
            chosen=chosen,
            correct_index=question["correct_index"],
            is_correct=chosen == question["correct_index"],
            explanation={language: version["questions"][i]["explanation"] for language, version in content.items()},
        ))
    return AttemptOut(id=attempt.id, score=attempt.score, total=attempt.total, results=results, created_at=attempt.created_at)


def _snapshot_sources(db: Session, course: Course, data: StudyCreate) -> list[dict]:
    """The chosen sources as stored on the item; 400 when one can't be used."""
    material_ids = [s.id for s in data.sources if s.type == "material"]
    note_ids = [s.id for s in data.sources if s.type == "note"]
    materials = {
        m.id: m
        for m in db.query(CourseMaterial).filter(CourseMaterial.id.in_(material_ids), CourseMaterial.course_id == course.id)
    }
    notes = {n.id: n for n in db.query(CourseNote).filter(CourseNote.id.in_(note_ids), CourseNote.course_id == course.id)}

    snapshot = []
    for source in data.sources:
        if source.type == "material":
            material = materials.get(source.id)
            if material is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A chosen file or recording isn't in this course.")
            # a recording is indexed once it's transcribed, so this covers both
            if not material.is_rag_indexed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"\"{material.file_name}\" is still being prepared for AI. Try again when it's ready.",
                )
            snapshot.append({"type": "material", "id": material.id, "kind": material.kind, "name": material.file_name})
        else:
            note = notes.get(source.id)
            if note is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A chosen note isn't in this course.")
            if note.kind != "text":
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Drawn notes can't be read yet.")
            if not (note.title or "").strip() and not note.content.strip():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A chosen note is empty.")
            first_line = next((line.strip() for line in note.content.splitlines() if line.strip()), "")
            snapshot.append({"type": "note", "id": note.id, "kind": "text", "name": note.title or first_line[:NOTE_NAME_CHARS]})
    return snapshot


@router.post("/{course_id}/study", response_model=StudyItemOut, status_code=status.HTTP_202_ACCEPTED)
def create_study_item(
    course_id: int,
    data: StudyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Starts writing a summary or quiz; poll the list (or the item) until its status is done."""
    course = get_owned_course(db, course_id, current_user)

    if not study_generator.gemini_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Summaries and quizzes aren't set up yet.",
        )

    sources = _snapshot_sources(db, course, data)

    used, frees_at = study_usage(db, current_user.id, data.kind.value)
    limit = study_limit(current_user, data.kind.value)
    if used >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"You can make {limit} {'summaries' if data.kind == StudyKind.summary else 'quizzes'} a day. "
                   f"The next one is available at {frees_at.isoformat()}.",
        )

    options = {"length": data.length} if data.kind == StudyKind.summary else {"num_questions": data.num_questions}
    item = StudyItem(
        course_id=course.id,
        kind=data.kind.value,
        status=StudyStatus.pending.value,
        requested_language=data.language,
        options=json.dumps(options),
        sources=json.dumps(sources, ensure_ascii=False),
    )
    db.add(item)
    db.add(StudyGeneration(user_id=current_user.id, kind=data.kind.value))
    db.commit()
    db.refresh(item)

    study_generator.submit(generate_item, item.id)

    return _item_out(item)


@router.get("/{course_id}/study", response_model=List[StudyItemSummaryOut])
def get_study_items(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Newest first. Also what the course page polls while something is being written or translated."""
    course = get_owned_course(db, course_id, current_user)
    items = (
        db.query(StudyItem)
        .options(selectinload(StudyItem.attempts))
        .filter(StudyItem.course_id == course.id)
        .order_by(StudyItem.id.desc())
        .all()
    )
    return [_summary_out(item) for item in items]


@router.get("/{course_id}/study/{item_id}", response_model=StudyItemOut)
def get_study_item(
    course_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    course = get_owned_course(db, course_id, current_user)
    return _item_out(_get_item(db, course, item_id))


@router.patch("/{course_id}/study/{item_id}", response_model=StudyItemSummaryOut)
def update_study_item(
    course_id: int,
    item_id: int,
    changes: StudyItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rename it (null title = back to the generated one), or remember which language it's read in."""
    course = get_owned_course(db, course_id, current_user)
    item = _get_item(db, course, item_id)
    for field, value in changes.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return _summary_out(item)


@router.delete("/{course_id}/study/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_study_item(
    course_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # one still being written notices it's gone and stops
    course = get_owned_course(db, course_id, current_user)
    db.delete(_get_item(db, course, item_id))
    db.commit()


@router.post("/{course_id}/study/{item_id}/retry", response_model=StudyItemOut)
def retry_study_item(
    course_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tries a failed item again, or a failed translation. Doesn't count toward the daily limit."""
    course = get_owned_course(db, course_id, current_user)
    item = _get_item(db, course, item_id)

    if not study_generator.gemini_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Summaries and quizzes aren't set up yet.")

    if item.status == StudyStatus.failed.value:
        item.status = StudyStatus.pending.value
        item.error = None
        job = generate_item
    elif item.status == StudyStatus.done.value and item.translation_status == StudyStatus.failed.value:
        item.translation_status = StudyStatus.pending.value
        item.translation_error = None
        job = translate_item
    else:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="There's nothing to retry.")

    db.commit()
    db.refresh(item)
    study_generator.submit(job, item.id)
    return _item_out(item)


def _get_quiz(db: Session, course_id: int, item_id: int, user: User) -> StudyItem:
    course = get_owned_course(db, course_id, user)
    item = _get_item(db, course, item_id)
    if item.kind != StudyKind.quiz.value:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Only quizzes have attempts.")
    return item


@router.post("/{course_id}/study/{item_id}/attempts", response_model=AttemptOut, status_code=status.HTTP_201_CREATED)
def submit_quiz_attempt(
    course_id: int,
    item_id: int,
    attempt: AttemptCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Grades a finished quiz and keeps the result. Taking it again is just another attempt."""
    item = _get_quiz(db, course_id, item_id, current_user)
    if item.status != StudyStatus.done.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This quiz isn't ready yet.")

    # every language has the same options in the same order, so the main one's answers grade any of them
    questions = _content(item)[item.main_language]["questions"]
    if len(attempt.answers) != len(questions):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Send one answer per question ({len(questions)}), null for unanswered.",
        )
    if any(a is not None and not 0 <= a < len(q["options"]) for a, q in zip(attempt.answers, questions)):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="An answer isn't one of its question's options.")

    score = sum(a == q["correct_index"] for a, q in zip(attempt.answers, questions))
    new_attempt = QuizAttempt(item_id=item.id, answers=json.dumps(attempt.answers), score=score, total=len(questions))
    db.add(new_attempt)
    db.commit()
    db.refresh(new_attempt)

    return _attempt_out(item, new_attempt)


@router.get("/{course_id}/study/{item_id}/attempts", response_model=List[AttemptOut])
def get_quiz_attempts(
    course_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Every graded attempt, newest first."""
    item = _get_quiz(db, course_id, item_id, current_user)
    return [_attempt_out(item, attempt) for attempt in reversed(item.attempts)]
