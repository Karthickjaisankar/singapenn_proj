import pandas as pd
from datetime import datetime
from dataclasses import dataclass
from typing import Optional
import re


@dataclass
class CrimeRecord:
    sl_no: int
    district: str
    police_station: str
    year: int
    fir_number: str
    section: str
    head: str
    penetrative_type: str
    date_of_occurrence: Optional[datetime]
    date_of_report: Optional[datetime]
    place_of_crime: str
    severity: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    hour: Optional[int] = None
    time_slot: Optional[str] = None


def normalize_text(text: str) -> str:
    if not isinstance(text, str):
        return ""
    return text.strip()


def normalize_head(head: str) -> str:
    head = normalize_text(head).lower()
    if "child marriage" in head and "rape" in head:
        return "child_marriage_rape"
    elif "child marriage" in head:
        return "child_marriage_other"
    elif "sc/st" in head and "rape" in head:
        return "sc_st_rape"
    elif "sc/st" in head:
        return "sc_st_other"
    elif "rape" in head:
        return "pocso_rape"
    else:
        return "pocso_other"


def normalize_penetrative(penet: str) -> str:
    penet = normalize_text(penet).lower()
    if "penetrative" in penet and "non" not in penet:
        return "Penetrative"
    elif "non" in penet:
        return "Non-Penetrative"
    return "Unknown"


def parse_date(date_str: str) -> Optional[datetime]:
    if not isinstance(date_str, str) or not date_str.strip():
        return None
    date_str = date_str.strip()

    # Strip trailing Hrs/hrs/HRS
    date_str = re.sub(r'\s+(hrs|Hrs|HRS)\s*\.?$', '', date_str, flags=re.IGNORECASE)

    date_formats = [
        "%d.%m.%Y at %H.%M",     # 09.03.2022 at 12.00
        "%d.%m.%Y",
        "%d.%m.%y",
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d/%m/%y",
        "%d-%m-%Y",
        "%d-%m-%y",
    ]

    for fmt in date_formats:
        try:
            return datetime.strptime(date_str, fmt)
        except:
            pass
    return None


def load_crimes_from_excel(filepath: str) -> list[CrimeRecord]:
    """Load and normalize POCSO crime data from Excel."""
    df = pd.read_excel(filepath, header=1)

    crimes = []
    for idx, row in df.iterrows():
        try:
            sl_no = int(row.iloc[0]) if pd.notna(row.iloc[0]) else idx
            district = normalize_text(row.iloc[1])
            police_station = normalize_text(row.iloc[2])
            year = int(row.iloc[3]) if pd.notna(row.iloc[3]) else None
            fir_number = normalize_text(row.iloc[4])
            section = normalize_text(row.iloc[5])
            head = normalize_head(row.iloc[6])
            penetrative_type = normalize_penetrative(row.iloc[7])
            date_of_occurrence = parse_date(str(row.iloc[8])) if pd.notna(row.iloc[8]) else None
            date_of_report = parse_date(str(row.iloc[9])) if pd.notna(row.iloc[9]) else None
            place_of_crime = normalize_text(row.iloc[10])

            if not place_of_crime or not district or not year:
                continue

            crime = CrimeRecord(
                sl_no=sl_no,
                district=district,
                police_station=police_station,
                year=year,
                fir_number=fir_number,
                section=section,
                head=head,
                penetrative_type=penetrative_type,
                date_of_occurrence=date_of_occurrence,
                date_of_report=date_of_report,
                place_of_crime=place_of_crime,
            )
            crimes.append(crime)
        except Exception as e:
            print(f"Error parsing row {idx}: {e}")
            continue

    return crimes
