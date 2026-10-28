# Pathway – Project Plan

## Goal

Port the **IRT Pathway Visualization** from `ChronlogicalLifeCycle` into a standalone static web page, the same way DrugSupply was done. **Keep its look and intent:**
- pick a Patient or Kit and watch its events play out in order along the curved serpentine path
- hover for details, and click through to related items (patient ↔ kit)

It uses anonymised sample data and needs no backend, so it can be uploaded to a website as plain static files.

## Scope

**In scope**
1. **Pathway timeline** for **Patient** and **Kit** only.
2. The original look:
   - header and control bar
   - serpentine path with the blue gradient
   - progress marker that travels the path, with events popping in as it reaches them
   - tooltips
   - theme colours (`#00A3E0`, `#005587`, …)
3. **Even spacing** of events (as now).
4. **Related links:** Patient → the kits dispensed to them, and Kit → the patient it was allocated to.
5. **Export CSV** of the selected pathway.
6. **Settings** (gear): events per row, animation speed, colour theme.

**Out of scope (for now):** the Audit Analysis page, Site and Shipment modules, time-proportional spacing, real study data, any backend or database.

## Data (anonymised sample)

One CSV file, `data/events.csv`, created once by `data/make_sample_data.py`. The columns mirror the original `Chron_Event_Details` table, minus the ones that were always empty (EventUser, BlindedName). It adds **RelatedType**, so links no longer have to be guessed from the number format.

| Column | Example | Notes |
|---|---|---|
| ModuleType | Kit | `Patient` or `Kit` |
| ModuleKey | K-20417 | Invented formats: `P-1001` for patients, `K-20001` for kits |
| EventDate | 2025-03-27 15:12 | Date and time |
| EventType | Kit Update | `Visit` (patients) or `Kit Update` (kits) |
| EventName | Allocated To Patient | Shown as the event label |
| EventDetails | Status change: On Site → Allocated To Patient | Shown in the tooltip |
| RelatedType | Patient | `Patient`, `Kit` or blank |
| RelatedKey | P-1007 | The linked item, or blank |

**What the sample models** (based on the real data's patterns):
- **About 40 patients:** Screening → Randomization (Day 1) → Week 1 → Week 2 → Week 4 → Week 8 → Week 12 → Week 16 → Week 20. A kit is dispensed at Randomization and at each later visit. Some patients stop early. The first patient in the list (5011001) completes every visit, so the serpentine shows two rows straight away.
- **About 300 kits:** Available at Central Depot → Authorized → In Transit (to depot) → At Depot → Allocated To Site → In Transit (to site) → On Site → Allocated To Patient. Kits that were never dispensed stop part-way.
- **Links match in both directions.** A patient's dispensing event names the kit, and that kit's "Allocated To Patient" event names the same patient on the same date.

## How it will be built

**Tech:** plain HTML, CSS and JavaScript with **D3 v7**, stored locally in `lib/` as in DrugSupply. It has no backend, CDN or build step. Everything the FastAPI server did happens in the browser:
- listing keys
- loading a pathway
- search
- icons and display names
- related links
- CSV export

**Files**

```
Pathway/
├── index.html            header, control bar, settings panel, chart area
├── css/styles.css        styles from reference/timeline-styles.css
├── js/app.js             load CSV, module/key selection, search, links, export, settings
├── js/pathwayChart.js    serpentine layout, drawing, playback
├── lib/d3.v7.min.js
├── data/                 events.csv + make_sample_data.py
├── reference/            original code (not deployed)
├── README.md             data updates, dependencies, deployment (written at the end)
└── PROJECT_PLAN.md
```

**Kept from the original** (`reference/timeline-app.js`, `timeline.html`, `timeline-styles.css`):
- page layout, colours and fonts
- the serpentine layout and curve logic
- the gradient path that draws itself as the marker moves
- events popping in with a small "bounce"
- tooltips with clickable related links
- the timeline info summary
- the settings panel

**Changed or fixed:**

| Issue in the original | In the port |
|---|---|
| Whole folder served publicly, including `.env` and the database | No server code; only the page files and an anonymised CSV are published |
| Shipment numbers turned into broken "Patient" links | Links come from the explicit RelatedType column |
| Search used a `prompt()` popup that repeated after module switches | A type-ahead search box: type part of a key and pick it from the list |
| Playback couldn't be paused or stopped | One small button: play / pause / replay (as in DrugSupply) |
| Events per row showed 7 but used 5; 10 per row overflowed | The setting matches what's drawn, and the chart width fits the page |
| Events and marker drifted out of sync at row turns | Each event appears exactly when the marker reaches it |
| Emoji icons look different on Windows and Mac | **Simple SVG icons** (person, clipboard, clinic, pill, box, truck) in the theme colour |
| Jumping to a related item could leave the key dropdown blank | The search box always shows the current key, plus a "← Back" link after a jump |
| Export wrote files on the server | The CSV is built in the browser and downloaded directly |
| Empty "User" line in tooltips | Removed (the column was always empty) |

## Steps

**Status:** steps 1–4 done (Oct 2026) and waiting for a visual review. Keys use the real formats (patients `50SSNNN`, kits 7 digits), and no generated number exists in the real database. The page title is "Clinical Trial Pathway". The controls say "Pathway For" and "Patient Number" / "Kit Number" instead of "Module Type" / "Module Key" (the CSV columns keep the original database names).

**Added after review:**
- The page opens with the first patient already playing.
- A status chip in the summary line (patient outcome or kit location), plus total days.
- A tap-friendly details card for touch screens.
- The chart is self-contained, so it can be reused inside other visualizations (see README section 6).

**Possible next steps:**
- shareable links (`?patient=…`)
- "+12d" time-gap labels
- stepping through events with the arrow keys
- a list view
- automatic events per row

1. **Sample data:** write `make_sample_data.py` and generate `events.csv`. Check that the links match in both directions.
2. **Page and chart, static:** port the page and styles, load the CSV, add module and key selection with search, and draw the serpentine path with SVG icons. Check the layout at 5, 7 and 10 per row.
3. **Playback and links:** add the play/pause/replay button with the marker and events in sync, tooltips with related links, Back, and the settings panel.
4. **Export and polish:** client-side CSV export, a check at different widths and in the browser, and the README.
5. **Visual review** with you after step 2, and again at the end.

## How to run

```bash
cd C:\prj\Pathway
python -m http.server 8000
# open http://localhost:8000
```
