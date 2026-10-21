import math
import mimetypes
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.accounts.models import User
from backend.accounts.storage import storage_used
from backend.accounts.usage import storage_limit
from backend.config import (
    ALLOWED_EXTENSIONS,
    AUDIO_EXTENSIONS,
    DOCUMENT_EXTENSIONS,
    MAX_UPLOAD_BYTES,
    TRANSCRIPT_LANGUAGES,
    UPLOAD_CHUNK_BYTES,
    UPLOAD_DIR,
)
from backend.core import jobs
from backend.core.dependencies import get_current_user
from backend.core.files import remove_files
from backend.courses.embeddings import (
    delete_course_vectors,
    delete_material_vectors,
    delete_note_vectors,
    remove_vectors,
)
from backend.courses.models import (
    Course,
    CourseLink,
    CourseMaterial,
    CourseMember,
    CourseNote,
    MaterialTranscript,
)
from backend.courses.note_index import cancel_note_index, schedule_note_index
from backend.courses.rag_pipeline import index_course_material
from backend.courses.schemas import (
    CourseCreate,
    CourseDetailOut,
    CourseLinkCreate,
    CourseLinkOut,
    CourseLinkUpdate,
    CourseMaterialOut,
    CourseMaterialUpdate,
    CourseNoteCreate,
    CourseNoteOut,
    CourseNoteUpdate,
    CourseOut,
    CourseOwner,
    CourseSummaryOut,
    CourseUpdate,
    MaterialKind,
    NoteKind,
    TranscriptOut,
    TranscriptRetry,
    TranscriptStatus,
    check_note_content,
)

# get_owned_course: only the owner, for changes; get_viewable_course: the owner or a member, for reading
from backend.courses.sharing import (
    check_course_limit,
    get_owned_course,
    get_viewable_course,
    member_courses,
    new_share_code,
)
from backend.courses.transcription import transcribe_material
from backend.database import get_db

router = APIRouter()


def course_fields(course: Course, is_owner: bool, member: Optional[CourseMember] = None) -> dict:
    """CourseOut's fields as the viewer sees them: a member gets the owner's name, their own
    last-opened time, and no course ID (only the owner can hand that out)."""
    data = CourseOut.model_validate(course).model_dump()
    if not is_owner:
        data.update(
            is_owner=False,
            owner=CourseOwner.model_validate(course.owner),
            share_code=None,
            last_opened_at=member.last_opened_at if member else None,
        )
    return data


def _get_course_item(db: Session, model, item_id: int, course: Course, label: str):
    """A material, note or link of the course; 404 when it belongs to another course."""
    item = db.query(model).filter(model.id == item_id, model.course_id == course.id).first()

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} with id {item_id} not found in this course."
        )

    return item


# sets only the fields the client sent
def _apply_update(item, changes):
    # only the fields the client sent are changed
    for field, value in changes.model_dump(mode="json", exclude_unset=True).items():
        setattr(item, field, value)


# makes a new course, within the course limit
@router.post("/", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(
    course_data: CourseCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    check_course_limit(db, current_user)

    new_course = Course(user_id=current_user.id, share_code=new_share_code(db), **course_data.model_dump(mode="json"))

    db.add(new_course)
    db.commit()
    db.refresh(new_course)

    return new_course


# a subquery counting a course's materials, links or notes
def _count_in_course(model, *conditions):
    return (
        select(func.count(model.id))
        .where(model.course_id == Course.id, *conditions)
        .correlate(Course)
        .scalar_subquery()
    )


def course_counts(db: Session, course_ids: List[int]) -> dict[int, tuple[int, int, int, int]]:
    """course id -> (documents, recordings, links, notes)."""
    if not course_ids:
        return {}
    rows = (
        db.query(
            Course.id,
            _count_in_course(CourseMaterial, CourseMaterial.kind == MaterialKind.document.value),
            _count_in_course(CourseMaterial, CourseMaterial.kind == MaterialKind.audio.value),
            _count_in_course(CourseLink),
            _count_in_course(CourseNote),
        )
        .filter(Course.id.in_(course_ids))
        .all()
    )
    return {course_id: tuple(counts) for course_id, *counts in rows}


@router.get("/", response_model=List[CourseSummaryOut])
def get_courses(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The user's own courses and the ones they added (marked is_owner false), together."""
    owned = db.query(Course).filter(Course.user_id == current_user.id).all()
    added = member_courses(db, current_user)
    counts = course_counts(db, [c.id for c in owned] + [c.id for c, _ in added])

    # one card of the courses grid
    def summary(fields: dict, course_id: int) -> CourseSummaryOut:
        documents, audio, links, notes = counts.get(course_id, (0, 0, 0, 0))
        return CourseSummaryOut(
            **fields, documents_count=documents, audio_count=audio, links_count=links, notes_count=notes
        )

    items = [summary(course_fields(c, True), c.id) for c in owned]
    items += [summary(course_fields(c, False, member), c.id) for c, member in added]
    # recently opened first; never-opened courses after them, newest change first
    items.sort(
        key=lambda c: (c.last_opened_at is not None, c.last_opened_at or c.updated_at, c.updated_at), reverse=True
    )
    return items


# a course's page, for its owner or a member; counts as opening it
@router.get("/{course_id}", response_model=CourseDetailOut)
def get_course_detail(course_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    course, is_owner = get_viewable_course(db, course_id, current_user)
    now = datetime.now(timezone.utc)

    if is_owner:
        # setting updated_at to itself stops its onupdate, so opening a course doesn't count as changing it
        db.query(Course).filter(Course.id == course.id).update(
            {Course.last_opened_at: now, Course.updated_at: Course.updated_at},
            synchronize_session=False,
        )
        member = None
    else:
        member = db.get(CourseMember, (course.id, current_user.id))
        member.last_opened_at = now
    db.commit()
    db.refresh(course)

    return CourseDetailOut(
        **course_fields(course, is_owner, member),
        materials=course.materials,
        # shared like the rest; members can read them, not change them
        notes=course.notes,
        links=course.links,
    )


# what the course page polls while files are indexing or recordings are transcribing;
# unlike the detail route it doesn't count as opening the course
@router.get("/{course_id}/materials", response_model=List[CourseMaterialOut])
def get_course_materials(course_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    course, _ = get_viewable_course(db, course_id, current_user)
    return course.materials


# renames a course or changes its description or color
@router.patch("/{course_id}", response_model=CourseOut)
def update_course(
    course_id: int, changes: CourseUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    course = get_owned_course(db, course_id, current_user)
    _apply_update(course, changes)

    db.commit()
    db.refresh(course)

    return CourseOut(**course_fields(course, True))


# deletes a course with its files, notes, links, summaries and AI vectors
@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(course_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = get_owned_course(db, course_id, current_user)
    file_paths = [material.file_path for material in course.materials]

    # materials, notes and links go with it through the cascade
    db.delete(course)
    db.commit()

    remove_files(file_paths)
    remove_vectors(delete_course_vectors, course_id)


# adds a typed or drawn note
@router.post("/{course_id}/notes", response_model=CourseNoteOut, status_code=status.HTTP_201_CREATED)
def add_course_note(
    course_id: int,
    note_data: CourseNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_owned_course(db, course_id, current_user)

    new_note = CourseNote(
        course_id=course_id, title=note_data.title, kind=note_data.kind.value, content=note_data.content
    )

    db.add(new_note)
    db.commit()
    db.refresh(new_note)

    if new_note.kind == NoteKind.text.value:
        schedule_note_index(new_note.id)

    return new_note


# changes a note; its AI indexing is rescheduled
@router.patch("/{course_id}/notes/{note_id}", response_model=CourseNoteOut)
def update_course_note(
    course_id: int,
    note_id: int,
    changes: CourseNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    course = get_owned_course(db, course_id, current_user)
    note = _get_course_item(db, CourseNote, note_id, course, "Note")

    if changes.content is not None:
        try:
            check_note_content(note.kind, changes.content)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    _apply_update(note, changes)

    db.commit()
    db.refresh(note)

    if note.kind == NoteKind.text.value:
        schedule_note_index(note.id)

    return note


# deletes a note and its AI vectors
@router.delete("/{course_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course_note(
    course_id: int, note_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    course = get_owned_course(db, course_id, current_user)
    note = _get_course_item(db, CourseNote, note_id, course, "Note")

    db.delete(note)
    db.commit()

    cancel_note_index(note_id)
    remove_vectors(delete_note_vectors, note_id)


# adds a link to the course
@router.post("/{course_id}/links", response_model=CourseLinkOut, status_code=status.HTTP_201_CREATED)
def add_course_link(
    course_id: int,
    link_data: CourseLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_owned_course(db, course_id, current_user)

    new_link = CourseLink(course_id=course_id, title=link_data.title, url=link_data.url)

    db.add(new_link)
    db.commit()
    db.refresh(new_link)

    return new_link


# changes a link's title or address
@router.patch("/{course_id}/links/{link_id}", response_model=CourseLinkOut)
def update_course_link(
    course_id: int,
    link_id: int,
    changes: CourseLinkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    course = get_owned_course(db, course_id, current_user)
    link = _get_course_item(db, CourseLink, link_id, course, "Link")
    _apply_update(link, changes)

    db.commit()
    db.refresh(link)

    return link


# deletes a link
@router.delete("/{course_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course_link(
    course_id: int, link_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    course = get_owned_course(db, course_id, current_user)
    link = _get_course_item(db, CourseLink, link_id, course, "Link")

    db.delete(link)
    db.commit()


# uploads a document or recording, within the size and storage limits, and queues its processing
@router.post("/{course_id}/upload", response_model=CourseMaterialOut, status_code=status.HTTP_201_CREATED)
def upload_course_material(
    course_id: int,
    file: UploadFile = File(...),
    # audio only: length measured by the browser, and the lecture's language (empty = detect)
    duration_sec: Optional[float] = Form(None),
    language: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_owned_course(db, course_id, current_user)

    file_extension = file.filename.split(".")[-1].lower() if "." in file.filename else ""

    if file_extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"File extension '.{file_extension}' is not allowed."
        )

    is_audio = file_extension in AUDIO_EXTENSIONS

    if duration_sec is not None and (not is_audio or not math.isfinite(duration_sec) or duration_sec < 0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="duration_sec must be a non-negative number, and only for audio.",
        )

    language = language or None
    if language is not None and (not is_audio or language not in TRANSCRIPT_LANGUAGES):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"language must be one of {sorted(TRANSCRIPT_LANGUAGES)}, and only for audio.",
        )

    remaining = storage_limit(current_user) - storage_used(db, current_user.id)
    # the smaller of the two limits decides how much may be saved, and which message a bigger file gets
    allowed = min(remaining, MAX_UPLOAD_BYTES)
    too_big = HTTPException(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        detail=(
            f"Files can be up to {MAX_UPLOAD_BYTES // 1024**2} MB."
            if allowed == MAX_UPLOAD_BYTES
            else "This file would go over your storage limit."
        ),
    )

    # the client-reported size can be missing or wrong, so this only rejects early; the copy below is the real check
    if file.size is not None and file.size > allowed:
        raise too_big

    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    file_path = f"{UPLOAD_DIR}/{unique_filename}"

    size_bytes = 0
    try:
        with open(file_path, "wb") as buffer:
            while chunk := file.file.read(UPLOAD_CHUNK_BYTES):
                size_bytes += len(chunk)
                if size_bytes > allowed:
                    break
                buffer.write(chunk)
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Could not save file: {str(e)}")

    if size_bytes > allowed:
        os.remove(file_path)
        raise too_big

    new_material = CourseMaterial(
        course_id=course_id,
        file_name=file.filename,
        file_path=file_path,
        kind=(MaterialKind.audio if is_audio else MaterialKind.document).value,
        mime_type=AUDIO_EXTENSIONS.get(file_extension) or DOCUMENT_EXTENSIONS[file_extension],
        duration_sec=duration_sec,
        size_bytes=size_bytes,
    )

    # recordings are transcribed before indexing; the transcript row tracks that work
    if is_audio:
        new_material.transcript = MaterialTranscript(status="pending", language=language)

    db.add(new_material)
    db.commit()
    db.refresh(new_material)

    if is_audio:
        jobs.submit(transcribe_material, new_material.id)
    else:
        jobs.submit(index_course_material, file_path, new_material.id, course_id)

    return new_material


# serves a course file to its owner or a member
@router.get("/{course_id}/materials/{material_id}/file")
def download_course_material(
    course_id: int, material_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    course, _ = get_viewable_course(db, course_id, current_user)
    material = _get_course_item(db, CourseMaterial, material_id, course, "Material")

    if not os.path.isfile(material.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This file is missing from storage.")

    # the stored file keeps the real extension even after the material is renamed
    extension = os.path.splitext(material.file_path)[1]
    # files uploaded before mime_type existed fall back to a guess
    media_type = material.mime_type or mimetypes.guess_type(material.file_path)[0] or "application/octet-stream"
    file_name = material.file_name
    if not file_name.lower().endswith(extension.lower()):
        file_name += extension

    # inline so PDFs and audio open in the browser; FileResponse answers Range requests, so audio can seek
    return FileResponse(
        material.file_path,
        media_type=media_type,
        filename=file_name,
        content_disposition_type="inline",
    )


# renames a course file
@router.patch("/{course_id}/materials/{material_id}", response_model=CourseMaterialOut)
def rename_course_material(
    course_id: int,
    material_id: int,
    changes: CourseMaterialUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    course = get_owned_course(db, course_id, current_user)
    material = _get_course_item(db, CourseMaterial, material_id, course, "Material")
    material.file_name = changes.file_name

    db.commit()
    db.refresh(material)

    return material


# deletes a course file and its AI vectors
@router.delete("/{course_id}/materials/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course_material(
    course_id: int, material_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    course = get_owned_course(db, course_id, current_user)
    material = _get_course_item(db, CourseMaterial, material_id, course, "Material")
    file_path = material.file_path

    db.delete(material)
    db.commit()

    remove_files([file_path])
    remove_vectors(delete_material_vectors, material_id)


# a recording's transcript; owner_only for changes
def _get_transcript(db: Session, course_id: int, material_id: int, user: User, owner_only: bool):
    if owner_only:
        course = get_owned_course(db, course_id, user)
    else:
        course, _ = get_viewable_course(db, course_id, user)
    material = _get_course_item(db, CourseMaterial, material_id, course, "Material")

    if material.transcript is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Only recordings have a transcript.")

    return material.transcript


# a recording's transcript, for its owner or a member
@router.get("/{course_id}/materials/{material_id}/transcript", response_model=TranscriptOut)
def get_material_transcript(
    course_id: int, material_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return _get_transcript(db, course_id, material_id, current_user, owner_only=False)


# transcribes a recording again, optionally in a set language
@router.post("/{course_id}/materials/{material_id}/transcript/retry", response_model=TranscriptOut)
def retry_material_transcript(
    course_id: int,
    material_id: int,
    retry: TranscriptRetry,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transcript = _get_transcript(db, course_id, material_id, current_user, owner_only=True)

    if transcript.status in (TranscriptStatus.pending.value, TranscriptStatus.processing.value):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This recording is already being transcribed.")

    # a finished transcript can be redone too, e.g. in another language
    transcript.status = TranscriptStatus.pending.value
    transcript.progress = 0
    transcript.error = None
    transcript.segments = None
    transcript.language = retry.language
    transcript.material.is_rag_indexed = False
    db.commit()
    db.refresh(transcript)

    jobs.submit(transcribe_material, material_id)

    return transcript
