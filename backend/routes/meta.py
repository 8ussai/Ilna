from fastapi import APIRouter

from backend.services.catalog import CATALOG

router = APIRouter()


@router.get("/universities")
def get_universities():
    return CATALOG
