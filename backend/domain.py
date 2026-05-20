"""
Domain knowledge for Tamil Nadu POCSO crime prevention system.
Single source of truth for section mappings, severity, and operational thresholds.
"""

# POCSO Act 2012 — section number → metadata
POCSO_SECTIONS: dict[str, dict] = {
    "4":  {"desc": "Penetrative sexual assault",              "severity": "severe",   "ipc": "376"},
    "6":  {"desc": "Aggravated penetrative sexual assault",   "severity": "severe",   "ipc": "376A"},
    "8":  {"desc": "Sexual assault (non-penetrative)",        "severity": "moderate", "ipc": "354"},
    "10": {"desc": "Aggravated sexual assault",               "severity": "moderate", "ipc": "354A"},
    "12": {"desc": "Sexual harassment",                       "severity": "low",      "ipc": "354A"},
    "14": {"desc": "Use of child for pornographic purposes",  "severity": "severe",   "ipc": "67B IT"},
    "17": {"desc": "Abetment of an offence",                  "severity": "moderate", "ipc": "107"},
    "19": {"desc": "Failure to report offence",               "severity": "low",      "ipc": "202"},
}

# Normalized crime heads that always require a direct FIR (women/child crimes)
MANDATORY_FIR_HEADS: set[str] = {
    "pocso_rape",
    "child_marriage_rape",
    "sc_st_rape",
}

# DSR/CSR/FIR reporting workflow states in order
REPORT_WORKFLOW: list[str] = ["dsr", "csr", "fir", "chargesheet", "closed"]

# Report status values
REPORT_STATUSES: list[str] = ["open", "escalated", "chargesheet", "closed"]

# Patrol anomaly thresholds
PATROL_STATIONARY_THRESHOLD_MINUTES: int = 120   # flag vehicle stopped > 2 hours
PATROL_MIN_KM_PER_SHIFT: float = 10.0            # flag vehicle covering < 10 km in 8-hr shift

# Time-of-day slot boundaries (hour ranges, 24h)
TIME_SLOTS: dict[str, tuple[int, int]] = {
    "morning":   (6,  12),
    "afternoon": (12, 18),
    "night":     (18, 6),   # wraps midnight
}

# Severity weights for risk scoring (used in hotspot clustering)
SEVERITY_WEIGHTS: dict[str, float] = {
    "severe":   3.0,
    "moderate": 1.5,
    "low":      0.7,
}

# Crime head display labels
CRIME_HEAD_LABELS: dict[str, str] = {
    "pocso_rape":          "POCSO — Penetrative Rape",
    "pocso_other":         "POCSO — Other Offences",
    "child_marriage_rape": "Child Marriage + Rape",
    "child_marriage_other":"Child Marriage — Other",
    "sc_st_rape":          "SC/ST — Rape",
    "sc_st_other":         "SC/ST — Other",
}
