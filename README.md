# Clinical Trial Pathway

**Live:** https://ravipalacharla.github.io/Pathway/

An animated timeline of one **patient** or **kit** in a clinical trial. Events are shown in date order along a curved (serpentine) path, and a marker travels the path as it draws. Hover over an event for details. Click an event with a related item to open that pathway: a patient's visit opens the kit dispensed there, and a kit's "Allocated To Patient" opens the patient.

- Plain HTML, CSS and JavaScript with D3 v7. No build step and no backend.
- It is a static site: copy the files to any web host and it works.
- Ported from `ChronlogicalLifeCycle` (the FastAPI + SQL Server version), keeping its look.

---

## 1. Run it locally

Browsers block a page from reading a CSV when you open it straight from disk (`file://`), so the page needs a small local web server:

```bash
cd ~/Documents/D3JSVisuals/Pathway
python3 -m http.server 8000
```

Open **http://localhost:8000**, and press `Ctrl+C` in the terminal to stop the server.

You can also right-click `index.html` in VS Code and choose **Open with Live Server**.

---

## 2. Using it

The page opens with the first patient in the list already playing.

1. In **Pathway For**, pick Patient or Kit.
2. In **Patient Number** (or **Kit Number**), type part of a number and pick it from the list. The pathway loads and plays.
3. The **summary line** shows the number of events, the date range and total days, plus a **status chip**:
   - patients: "Screen Failed", "Discontinued", or "Ongoing, last visit …"
   - kits: where the kit is now, e.g. "Available at Central Depot" or "Allocated To Patient 5011002"
4. The round button **pauses**, **plays**, and **replays** once playback has finished.
5. **CSV** downloads the events of the pathway on screen.
6. Events with a glowing outline link to a related patient or kit:
   - **with a mouse**, hover for details and click to open the related pathway
   - **on a touch screen**, tap an event to open a details card, then tap **Open kit … →**
   - **← Back** returns to where you were
7. The settings icon (top right) sets events per row, animation speed and colour theme.

---

## 3. Files

| File | What it does | Do you edit it? |
|---|---|---|
| `index.html` | Page layout: header, controls, settings panel, chart area | Titles and labels |
| `css/styles.css` | All styling (colours, fonts, controls, path, icons, tooltip) | Look and feel |
| `js/app.js` | Loads the CSV, module/key selection and search, related links and Back, export, settings | Rarely |
| `js/pathwayChart.js` | The serpentine layout, icons, tooltip and playback | Settings at the top (see section 5) |
| `lib/d3.v7.min.js` | D3 library v7.9.0, stored locally | No |
| `data/events.csv` | **The data the page shows** | **Yes, this is what you update** |
| `data/make_sample_data.py` | Generates the anonymised sample CSV | Only for new sample data |
| `reference/` | Original ChronlogicalLifeCycle code | No (not deployed) |
| `PROJECT_PLAN.md` | Project history and decisions | No (not deployed) |

---

## 4. Updating the data

The page reads **one file: `data/events.csv`**. To show different data, replace that file, keeping the same columns, and reload the page. No code changes are needed.

### Format

```csv
ModuleType,ModuleKey,EventDate,EventType,EventName,EventDetails,RelatedType,RelatedKey
Patient,5011001,2025-01-18 17:01,Visit,Randomization (Day 1 / Week 0),"Visit 2, dispensed kit 1007506",Kit,1007506
Kit,1007506,2025-01-18 17:01,Kit Update,Allocated To Patient,"Kit 1007506 status change: On Site to Allocated To Patient, dispensed to patient 5011001",Patient,5011001
```

| Column | Rules |
|---|---|
| `ModuleType` | `Patient` or `Kit` (capital first letter). Other values are ignored. |
| `ModuleKey` | The patient or kit number. Each distinct number becomes one pathway in the search list. |
| `EventDate` | `YYYY-MM-DD HH:MM`, for example `2025-01-18 17:01`. Events are sorted by this. |
| `EventType` | Shown in the tooltip (`Visit`, `Kit Update`, …). |
| `EventName` | The label above the event. It also decides the icon (see below). |
| `EventDetails` | Free text shown in the tooltip. Can be blank. |
| `RelatedType` | `Patient` or `Kit` if the event links to another pathway, otherwise blank. |
| `RelatedKey` | The linked patient or kit number, otherwise blank. |

You need one row per event. Text containing commas must be in double quotes (any spreadsheet export does this).

### Things to know

- **Links need both columns.** An event links to another pathway only if `RelatedType` and `RelatedKey` are both filled and that pathway exists in the file. Otherwise clicking shows "No events found".
- **Icons come from the event name:**
  - Patients: "Screening" → person, "Randomization" → clipboard, "Status" → flag, any other visit → medical cross. A small pill badge is added when the visit dispensed a kit.
  - Kits: "Allocated To Patient" → pill, "In Transit" → truck, anything else → box.
  - The rules are in `glyphFor` in `js/pathwayChart.js`.
- **Long visit names** are shortened for display ("Randomization (Day 1 / Week 0)" → "Randomization (Day 1)"). The list is `DISPLAY_NAMES` in `js/pathwayChart.js`. Add your study's names there, or leave them as they are.
- **Size:** the search list handles a few thousand keys comfortably. Each pathway reads well up to about 30 events.
- **Real study data:** once the CSV is on a public website, anyone can download it. Use anonymised data unless the site is access-controlled.
- **Browser caching:** after uploading a new CSV, press `Ctrl+F5` to bypass the cache if the page still shows the old data.

### Getting data from a database

The original system stored these events in `Chron_Event_Details` (see `reference/main.py`). Export these columns from it as CSV with the headers above:
- ModuleType, ModuleKey, EventDate (formatted `YYYY-MM-DD HH:MM`), EventType, EventName, EventDetails
- RelatedType and RelatedKey for links

`RelatedType` is new: fill it with `Kit` for patient dispensing events and `Patient` for kit allocation events.

To regenerate the sample data instead, run `python data/make_sample_data.py`. Add `--exclude-db <path to the real database>` to guarantee that no real number is reused.

---

## 5. Settings you can change

At the top of `js/pathwayChart.js`:

| Setting | Default | Effect |
|---|---|---|
| `MS_PER_EVENT` | `1000` | Playback time per event at 1x speed. |
| `ROW_SPACING` | `120` | Vertical distance between rows (px). |
| `CURVE_STRENGTH` | `80` | How wide the turn at the end of each row is. |
| `MAX_EVENT_SPACING` | `220` | Maximum horizontal distance between events (px). |
| `DISPLAY_NAMES` | three visit names | Long event names to shorten on the label. |

The colour themes are in `THEMES` in `js/app.js`, and the default colours are at the top of `css/styles.css`. The page title is in `index.html` (`<title>` and `<h1>`).

---

## 6. Reusing the chart in another page

`js/pathwayChart.js` is self-contained. It creates its own tooltip and details card, and only needs D3, the stylesheet and a list of events. This is how it could be embedded inside another visualization, for example opening a kit's pathway when someone clicks a depot in the DrugSupply chart.

```html
<link rel="stylesheet" href="css/styles.css">
<div id="myPathway"></div>
<script src="lib/d3.v7.min.js"></script>
<script src="js/pathwayChart.js"></script>
<script>
  d3.csv("data/events.csv").then(function (rows) {
    var parse = d3.timeParse("%Y-%m-%d %H:%M");
    var events = rows
      .filter(d => d.ModuleType === "Kit" && d.ModuleKey === "1007506")
      .map(d => Object.assign(d, { date: parse(d.EventDate) }))
      .sort((a, b) => a.date - b.date);

    pathwayChart.render(document.getElementById("myPathway"), events, {
      id: "Kit|1007506",                   // a new id starts playback from the beginning
      eventsPerRow: 7,                     // optional, default 7
      onEventClick: function (event) {     // optional: what happens when a linked event is clicked
        console.log("Open", event.RelatedType, event.RelatedKey);
      },
      onProgress: function (state) {       // optional: { playing, finished }, e.g. to update a button
      },
    });
  });
</script>
```

| Call | What it does |
|---|---|
| `pathwayChart.render(container, events, options)` | Draws the pathway in `container` and starts playing. Call it again to redraw, e.g. after a resize. |
| `pathwayChart.play()` / `pathwayChart.pause()` | Play (replays from the start once finished) or pause. |
| `pathwayChart.speed = 2` | Playback speed (1 = 1 second per event). |

Each event needs the CSV columns plus a `date` (a JavaScript Date) and must be sorted by date. The chart draws one pathway at a time; for several pathways side by side it would need a small change to keep separate playback state per chart.

The status chip and summary line belong to the page (`js/app.js`), not the chart, so another page can show its own.

---

## 7. Dependencies

| Dependency | Needed for | Notes |
|---|---|---|
| **D3 v7.9.0** | Everything | Included in `lib/`, so there is **no internet or CDN dependency**. |
| **A web server** of any kind | Serving the files | Static hosting is enough. No PHP, Node, Python or database is needed on the server. |
| **A modern browser** | Viewing | Current Chrome, Edge, Firefox or Safari. |
| Python 3 | Only for local testing and `make_sample_data.py` | Not needed on the website. |

There are no API keys, logins, cookies or tracking. Unlike the original, there is no server code, so nothing beyond these files can be exposed.

---

## 8. Deploying

### What to upload

```
index.html
css/styles.css
js/app.js
js/pathwayChart.js
lib/d3.v7.min.js
data/events.csv
```

That's about 580 KB in total. **Don't upload** `reference/`, `data/make_sample_data.py`, `PROJECT_PLAN.md` or this README.

Keep the folder structure as it is. All paths are relative, so it works in the site root or in any subfolder, for example `yoursite.com/pathway/`.

### Where to host

| Option | How |
|---|---|
| **Your own website** (cPanel, FTP, WordPress host) | Upload the files above into a folder such as `public_html/pathway/` with the host's file manager or an FTP client (e.g. FileZilla). Open `yoursite.com/pathway/`. |
| **GitHub Pages** (free) | Push the files to a GitHub repository, then go to Settings → Pages → deploy from branch. |
| **Netlify** (free tier) | Drag the folder onto app.netlify.com/drop. |
| **Azure Static Web Apps / AWS S3 / Google Cloud Storage** | Create a static website bucket or app and upload the files. No server configuration is needed. |

### Showing it inside another page

```html
<iframe src="https://yoursite.com/pathway/" width="100%" height="800" style="border:0"></iframe>
```

### After deploying, check that:

- the page loads with no "Could not load data" message
- picking Patient lists the patient numbers, and a pathway plays
- clicking a glowing event opens the related kit, and **← Back** returns

---

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Could not load data/events.csv" | You opened the page from disk, or the CSV is missing or has a different name. Use a web server and check `data/events.csv` exists. |
| A number isn't in the search list | Check `ModuleType` is exactly `Patient` or `Kit` for its rows. |
| Clicking an event says "No events found" | The `RelatedKey` doesn't exist as a pathway in the CSV, or `RelatedType` is wrong. |
| Events in the wrong order | Check `EventDate` uses `YYYY-MM-DD HH:MM`. |
| The page shows old data after an update | Browser cache. Press `Ctrl+F5`. |
