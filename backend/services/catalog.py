import json
from pathlib import Path
from typing import Optional

CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "universities.json"

with open(CATALOG_PATH, encoding="utf-8") as f:
    CATALOG = json.load(f)


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


def email_matches_domain(email: str, domain: str) -> bool:
    email_domain = email.rsplit("@", 1)[-1].lower()
    # the university domain itself or one of its subdomains (e.g. std.ksu.edu.sa)
    return email_domain == domain or email_domain.endswith("." + domain)
