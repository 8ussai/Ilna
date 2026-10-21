import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from backend.admin.models import AdminLog
from backend.admin.post_routes import shown_as
from backend.admin.schemas import (
    AdminReportEntry,
    AdminReportGroup,
    OpenCount,
    ReportTarget,
)
from backend.blog.models import Report
from backend.core.dependencies import get_admin
from backend.database import get_db, utc_now

router = APIRouter()


# open reports with their reporter and target, newest first
def _open_reports(db: Session) -> list[Report]:
    return (
        db.query(Report)
        .options(joinedload(Report.reporter), joinedload(Report.post), joinedload(Report.reply))
        .filter(Report.status == "open")
        .order_by(Report.created_at.desc(), Report.id.desc())
        .all()
    )


@router.get("/reports", response_model=list[AdminReportGroup], dependencies=[Depends(get_admin)])
def list_reports(db: Session = Depends(get_db)):
    """Open reports, one row per reported post or reply, most reported first."""
    groups: dict[tuple[str, int], AdminReportGroup] = {}
    for report in _open_reports(db):
        if report.post is not None:
            key, post, item = ("post", report.post_id), report.post, report.post
        elif report.reply is not None and not report.reply.is_deleted:
            key, post, item = ("reply", report.reply_id), report.reply.post, report.reply
        else:
            # the content is already gone; nothing to act on
            continue

        entry = AdminReportEntry(
            reason=report.reason, note=report.note, reporter=report.reporter, created_at=report.created_at
        )
        group = groups.get(key)
        if group is None:
            groups[key] = AdminReportGroup(
                target_type=key[0],
                target_id=key[1],
                post_id=post.id,
                content=item.content,
                author=item.author,
                scope=post.scope,
                university=post.university,
                college=post.college,
                major=post.major,
                created_at=item.created_at,
                reports_count=1,
                latest_at=report.created_at,
                reports=[entry],
                shown_as=shown_as(db, item),
                images=item.images if key[0] == "post" else [],
            )
        else:
            group.reports_count += 1
            group.reports.append(entry)

    return sorted(groups.values(), key=lambda g: (g.reports_count, g.latest_at), reverse=True)


@router.get("/reports/count", response_model=OpenCount, dependencies=[Depends(get_admin)])
def count_reports(db: Session = Depends(get_db)):
    """How many posts and replies are waiting, for the tab's badge."""
    return OpenCount(count=len(list_reports(db)))


@router.post("/reports/dismiss", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(get_admin)])
def dismiss_reports(data: ReportTarget, db: Session = Depends(get_db)):
    """Closes the open reports on one item and leaves the content up. Nobody is notified."""
    column = Report.post_id if data.target_type == "post" else Report.reply_id
    reports = db.query(Report).filter(column == data.target_id, Report.status == "open").all()
    if not reports:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No open reports on that")

    now = utc_now()
    for report in reports:
        report.status = "dismissed"
        report.resolved_at = now
    db.add(
        AdminLog(
            action="dismiss_reports",
            target_type=data.target_type,
            target_id=data.target_id,
            details=json.dumps({"reports": len(reports), "reasons": sorted({r.reason for r in reports})}),
        )
    )
    db.commit()
