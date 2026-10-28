"""
Generate anonymised sample data for the Clinical Trial Pathway page.

Output: events.csv (next to this script)
Columns: ModuleType, ModuleKey, EventDate, EventType, EventName, EventDetails, RelatedType, RelatedKey

The numbers use the real formats (patients 50SSNNN, kits 7 digits) but are invented.
Pass the real database with --exclude-db to guarantee no real number is reused:
    python make_sample_data.py --exclude-db path/to/demo_database.db

Run once. A fixed random seed means the same file is produced every time.
"""

import argparse
import csv
import random
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

random.seed(2025)

DATA_CUTOFF = datetime(2025, 6, 30, 18, 0)
SITES = [11, 17, 23, 28, 34, 39, 45, 52]
PATIENT_COUNT = 40

# Visit schedule: (event name, days after randomization). Screening is 14 days before randomization.
VISITS = [
    ("Randomization (Day 1 / Week 0)", 0),
    ("Day 7 / Week 1", 7),
    ("Day 14 / Week 2", 14),
    ("Week 4", 28),
    ("Week 8", 56),
    ("Week 12", 84),
    ("Week 16", 112),
    ("Week 20", 140),
]

# The first patient in the list (lowest site, patient 001) completes every visit,
# so the serpentine shows more than one row as soon as you open it
SHOWCASE_SITE = min(SITES)

# Kit route from central depot to patient
KIT_ROUTE = [
    "Available at Central Depot",
    "Authorized",
    "Assigned to Depot Transfer",
    "In Transit",
    "At Depot",
    "Available at Depot Unrestricted",
    "Allocated To Site",
    "Authorized",
    "In Transit",
    "On Site",
    "Allocated To Patient",
]

# Where kits that were never dispensed end up (index of their last route step), with weights
UNDISPENSED_ENDS = [(0, 40), (5, 45), (9, 10), (3, 5)]


def business_time(day):
    """A random time between 08:00 and 18:00 on the given day."""
    return day.replace(hour=8, minute=0, second=0, microsecond=0) + timedelta(minutes=random.randint(0, 600))


def fmt(dt):
    return dt.strftime("%Y-%m-%d %H:%M")


def load_real_keys(db_path):
    if not db_path:
        return set()
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    keys = {r[0] for r in conn.execute("SELECT DISTINCT ModuleKey FROM Chron_Event_Details")}
    keys |= {r[0].strip() for r in conn.execute("SELECT Relatedkey FROM Chron_Event_Details WHERE Relatedkey <> ''")}
    conn.close()
    return keys


def unique_kit_number(used):
    while True:
        number = str(random.randint(1_000_000, 9_999_999))
        if number not in used:
            used.add(number)
            return number


def kit_route_dates(end_date, steps):
    """Dates for the first `steps` route events, working backwards from the last one."""
    # Typical gaps (days) before each step, from the step before it
    gaps = [None, (10, 40), (0, 0.3), (3, 7), (4, 9), (5, 14), (5, 30), (0, 0.01), (0, 0.2), (2, 5), (3, 30)]
    dates = [end_date]
    for i in range(steps - 1, 0, -1):
        low, high = gaps[i]
        dates.insert(0, dates[0] - timedelta(days=random.uniform(low, high), minutes=random.randint(1, 90)))
    return dates


def kit_events(kit, end_date, steps, patient=None, site=None):
    rows = []
    dates = kit_route_dates(end_date, steps)
    for i in range(steps):
        name = KIT_ROUTE[i]
        previous = KIT_ROUTE[i - 1] if i else "Received"
        details = f"Kit {kit} status change: {previous} to {name}"
        if name == "In Transit":
            details += " (to depot)" if i == 3 else f" (to site {site})"
        related_type = related_key = ""
        if name == "Allocated To Patient":
            details += f", dispensed to patient {patient}"
            related_type, related_key = "Patient", patient
        rows.append(["Kit", kit, fmt(dates[i]), "Kit Update", name, details, related_type, related_key])
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exclude-db", help="real database whose keys must not be reused")
    args = parser.parse_args()

    used = load_real_keys(args.exclude_db)
    rows = []

    # Patients
    patients_per_site = {}
    for index in range(PATIENT_COUNT):
        showcase = index == 0
        site = SHOWCASE_SITE if showcase else random.choice(SITES)
        patients_per_site[site] = patients_per_site.get(site, 0) + 1
        patient = f"50{site:02d}{patients_per_site[site]:03d}"
        if patient in used:
            continue
        used.add(patient)

        start = datetime(2025, 1, 6) + timedelta(days=0 if showcase else random.randint(0, 140))
        screening = business_time(start)
        rows.append(["Patient", patient, fmt(screening), "Visit", "Screening", "Visit 1", "", ""])

        # About half the patients fail screening, as in the real data
        if not showcase and random.random() < 0.5:
            status_date = screening + timedelta(days=random.randint(5, 14), minutes=random.randint(1, 120))
            if status_date < DATA_CUTOFF:
                rows.append(["Patient", patient, fmt(status_date), "Visit", "Patient Status Change",
                             "Status: Screen Failed", "", ""])
            continue

        randomization = business_time(screening + timedelta(days=14 + random.randint(-2, 3)))
        # Most patients continue until the data cut-off, some discontinue early
        stops_after = len(VISITS) if showcase else random.choice([len(VISITS)] * 3 + [4, 3])
        for number, (visit, offset) in enumerate(VISITS[:stops_after], start=2):
            visit_date = business_time(randomization + timedelta(days=offset + random.randint(-1, 2)))
            if visit_date > DATA_CUTOFF:
                break
            kit = unique_kit_number(used)
            rows.append(["Patient", patient, fmt(visit_date), "Visit", visit,
                         f"Visit {number}, dispensed kit {kit}", "Kit", kit])
            rows.extend(kit_events(kit, visit_date, len(KIT_ROUTE), patient=patient, site=site))
        else:
            if stops_after < len(VISITS):
                status_date = visit_date + timedelta(days=random.randint(3, 10), minutes=random.randint(1, 120))
                if status_date < DATA_CUTOFF:
                    rows.append(["Patient", patient, fmt(status_date), "Visit", "Patient Status Change",
                                 "Status: Discontinued", "", ""])

    # Kits that were never dispensed
    dispensed = sum(1 for r in rows if r[0] == "Kit" and r[4] == "Allocated To Patient")
    ends, weights = zip(*UNDISPENSED_ENDS)
    for _ in range(300 - dispensed):
        last_step = random.choices(ends, weights)[0]
        end_date = business_time(datetime(2025, 1, 10) + timedelta(days=random.randint(0, 165)))
        rows.extend(kit_events(unique_kit_number(used), end_date, last_step + 1, site=random.choice(SITES)))

    rows.sort(key=lambda r: (r[0], r[1], r[2]))

    out_path = Path(__file__).with_name("events.csv")
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["ModuleType", "ModuleKey", "EventDate", "EventType", "EventName",
                         "EventDetails", "RelatedType", "RelatedKey"])
        writer.writerows(rows)

    patients = {r[1] for r in rows if r[0] == "Patient"}
    kits = {r[1] for r in rows if r[0] == "Kit"}
    print(f"Wrote {len(rows)} events to {out_path}")
    print(f"  {len(patients)} patients, {len(kits)} kits ({dispensed} dispensed)")


if __name__ == "__main__":
    main()
