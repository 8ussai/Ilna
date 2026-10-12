from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.backendConfig import STORAGE_LIMIT_BYTES
from backend.core.apiDependencies import get_current_user
from backend.database import get_db
from backend.models.user import User
from backend.schemas.user import StorageOut
from backend.services.storage import storage_used

router = APIRouter()


@router.get("/storage", response_model=StorageOut)
def get_storage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return StorageOut(used_bytes=storage_used(db, current_user.id), limit_bytes=STORAGE_LIMIT_BYTES)
