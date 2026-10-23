import json
from typing import Optional

from backend.config import CATALOG_PATH

with open(CATALOG_PATH, encoding="utf-8") as f:
    CATALOG = json.load(f)


# the item with this id in a catalog list, or None
def _find(items: list, item_id: str) -> Optional[dict]:
    return next((item for item in items if item["id"] == item_id), None)


def validate_selection(country_id: str, university_id: str, college_id: str, major_id: str) -> dict:
    """Return the matching university entry, or raise ValueError if the chain is not valid."""
    country = _find(CATALOG["countries"], country_id)
    if country is None:
        raise ValueError("Unknown country.")

    university = _find(country["universities"], university_id)
    if university is None:
        raise ValueError("University does not belong to the selected country.")

    college = _find(university["colleges"], college_id)
    if college is None:
        raise ValueError("College does not belong to the selected university.")

    if _find(college["majors"], major_id) is None:
        raise ValueError("Major does not belong to the selected college.")

    return university


def is_student_email(email: str, university: dict) -> bool:
    """Whether an email is at the university's student domain or one of its subdomains.
    Same rule as isStudentEmail in frontend/src/features/auth/RegisterForm.tsx."""
    domain = email.rsplit("@", 1)[-1].lower()
    return domain == university["domain"] or domain.endswith("." + university["domain"])


def locate(kind: str, item_id: str) -> Optional[dict]:
    """The university, college and major ids for a university, college or major id ("" below the level asked for),
    or None if there's no such one. College and major ids are unique across the catalog."""
    for country in CATALOG["countries"]:
        for university in country["universities"]:
            if kind == "university" and university["id"] == item_id:
                return {"university": university["id"], "college": "", "major": ""}
            for college in university["colleges"]:
                if kind == "college" and college["id"] == item_id:
                    return {"university": university["id"], "college": college["id"], "major": ""}
                for major in college["majors"]:
                    if kind == "major" and major["id"] == item_id:
                        return {"university": university["id"], "college": college["id"], "major": major["id"]}
    return None
