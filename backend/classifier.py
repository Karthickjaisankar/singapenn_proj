import re
from enum import Enum
from typing import Optional
from backend.data_loader import CrimeRecord


class SeverityLevel(str, Enum):
    LOW = "low"
    MODERATE = "moderate"
    SEVERE = "severe"


# POCSO section numbers grouped by severity tier (Act sections 3–21)
_POCSO_SEVERE   = {3, 4, 5, 6, 14, 15}   # penetrative assault / CSAM
_POCSO_MODERATE = {7, 8, 9, 10, 17, 18}  # non-penetrative / abetment / attempt
_POCSO_LOW      = {11, 12, 19, 20, 21}   # harassment / failure-to-report / procedural


def _pocso_section_numbers(section_str: str) -> set[int]:
    """
    Extract POCSO section numbers from strings like:
      "5(l) r/w 6 POCSO", "9(m) r/w 10 POCSO r/w 354 IPC",
      "POCSO Act 5(1), 5(m), 6(1)", "11(1), 12 of Protection of Children..."
    Handles common data-entry variants: POSCO typo, reversed keyword order,
    full act name, and run-together text like "ofpocsoAct".
    """
    # Normalise: collapse spaces and upper-case for keyword matching
    s = section_str

    # Keywords that identify this as a POCSO record (including typos / full name)
    _POCSO_KW = re.compile(
        r'P\.?O\.?C\.?S\.?O|POSCO|Protection\s+of\s+Chil\w+\s+(?:From|Against)\s+Sexual',
        re.IGNORECASE,
    )
    if not _POCSO_KW.search(s):
        return set()

    # Split on the keyword — numbers may appear BEFORE or AFTER
    parts = _POCSO_KW.split(s, maxsplit=1)
    before, after = parts[0], parts[1] if len(parts) > 1 else ""

    nums_before = {int(n) for n in re.findall(r'\b(\d{1,2})\b', before) if 3 <= int(n) <= 21}
    if nums_before:
        return nums_before

    # Reversed pattern: "POCSO Act 5(1), 5(m), 6(1)"
    nums_after = {int(n) for n in re.findall(r'\b(\d{1,2})\b', after) if 3 <= int(n) <= 21}
    return nums_after


def _has_rape_section(section_str: str) -> bool:
    """IPC 376 family or BNS 64/65/66/70 (rape / aggravated rape / gang rape)."""
    s = section_str.upper()
    if re.search(r'\b376\b', s):
        return True
    # BNS rape sections — must confirm "BNS" present to avoid false matches
    if re.search(r'\b6[4-6]\b', s) and 'BNS' in s:
        return True
    if re.search(r'\b70\b', s) and 'BNS' in s:
        return True
    return False


def _classify_from_section(section_str: str) -> Optional[tuple[str, float]]:
    """
    Classify severity from the SECTION column string.
    Returns (severity, weight) or None if the string is empty / unparseable.

    Priority order: POCSO sections → IPC/BNS rape → SC/ST aggravated →
                    IPC molestation → BNS assault → child marriage → kidnapping
    """
    if not section_str or section_str.strip().lower() in ("", "nan", "none"):
        return None

    # ── 1. POCSO section numbers (dominant path for ~95% of cases) ────────
    pocso_nums = _pocso_section_numbers(section_str)
    if pocso_nums:
        if pocso_nums & _POCSO_SEVERE:
            return "severe", 3.0
        if pocso_nums & _POCSO_MODERATE:
            return "moderate", 1.5
        if pocso_nums & _POCSO_LOW:
            return "low", 0.7

    # ── 2. IPC 376 / BNS 64-66 / BNS 70 (explicit rape charge) ──────────
    if _has_rape_section(section_str):
        return "severe", 3.0

    # ── 3. SC/ST Act 3(2)(v)(a) — aggravated offence with caste element ──
    if re.search(r'3\(2\)\(v\w*\)', section_str, re.IGNORECASE):
        return "severe", 3.0

    # ── 4. IPC 354 family (molestation / non-penetrative assault) ────────
    if re.search(r'\b354\b', section_str):
        return "moderate", 1.5

    # ── 5. BNS non-penetrative assault sections (74, 75, 77, 78) ─────────
    if re.search(r'\b7[4578]\b', section_str) and re.search(r'\bBNS\b', section_str, re.IGNORECASE):
        return "moderate", 1.5

    # ── 6. Child Marriage Act (without penetrative POCSO already matched) ─
    if re.search(r'\bPCMA\b|\bchild\s+marriage\b', section_str, re.IGNORECASE):
        return "moderate", 1.5

    # ── 7. Missing-person / kidnapping (Girl Missing cases — IPC 363/366,
    #        BNS 87/99) filed before FIR alteration to POCSO ──────────────
    if re.search(r'\b(?:363|366)\b', section_str):
        return "moderate", 1.5
    if re.search(r'\b(?:87|99)\b', section_str) and re.search(r'\bBNS\b', section_str, re.IGNORECASE):
        return "moderate", 1.5

    return None


def classify_crime(crime: CrimeRecord) -> tuple[SeverityLevel, float]:
    """
    Classify crime severity.
    Primary: SECTION column (section-string parsing via legal sections reference).
    Fallback: HEAD + PENETRATIVE_TYPE columns.
    """
    result = _classify_from_section(getattr(crime, "section", ""))
    if result:
        sev, weight = result
        return SeverityLevel(sev), weight

    # Fallback for records with missing/unparseable SECTION data
    head = crime.head.lower()
    is_penetrative = crime.penetrative_type.lower() == "penetrative"
    has_child_marriage = "child_marriage" in head
    has_sc_st = "sc_st" in head

    if "rape" in head and is_penetrative:
        return SeverityLevel.SEVERE, 3.0
    elif "rape" in head and not is_penetrative:
        return SeverityLevel.MODERATE, 1.5
    elif has_child_marriage or has_sc_st:
        return SeverityLevel.MODERATE, 1.5
    else:
        return SeverityLevel.LOW, 0.7


def classify_crimes_batch(crimes: list[CrimeRecord]) -> list[CrimeRecord]:
    """Classify all crimes and attach severity scores."""
    for crime in crimes:
        severity, _ = classify_crime(crime)
        crime.severity = severity.value
    return crimes


def get_severity_weight(severity: str) -> float:
    weights = {
        "severe":   3.0,
        "moderate": 1.5,
        "low":      0.7,
    }
    return weights.get(severity, 0.5)
