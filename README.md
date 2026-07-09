# Tactical Plan — Interactive Dashboards

A dependency-free webapp for exploring and editing the tactical plan from
`Tactical_Plan.xlsx` (Master sheet, 97 tactics × 15 columns).

## Views

| View | What it shows |
|---|---|
| **By category** | Tactics grouped by the 5 categories — KPI tiles, tactics/priority/status/budget charts, and per-category detail cards with subcategory, deliverable, tactic, status, budget and function. |
| **By function** | The mirror view, grouped by the 10 functions, with category as the cross-detail. |
| **Data** | The full Master-sheet table. Click any cell to edit; constrained columns (Function, Category, Priority, Status, …) offer a dropdown of existing values plus free-text entry. Add rows, delete rows, export CSV, or reset to the original spreadsheet data. |

Every edit persists to `localStorage` and re-renders both dashboards
immediately. Filters (status, priority, free-text search) sit in one row above
each dashboard and scope every chart, KPI and detail card beneath them.

## Running it

No build step and no dependencies — it's plain HTML/CSS/JS:

```bash
cd plandashboard
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly from disk also works.)

## Structure

```
index.html        shell: hero, tabs, view container
css/styles.css    design tokens (Raleway, orange/deep-blue palette per design.md)
js/data.js        seed data extracted from the Excel Master sheet
js/store.js       localStorage-backed store with pub/sub
js/charts.js      SVG chart primitives (bars, stacked bars, donut, tooltips)
js/dashboards.js  the two grouped dashboard views
js/datapage.js    the editable data grid
js/app.js         hash routing + boot
```

## Design notes

- Visual language follows `design.md`: Raleway, primary orange `#EF5F17`,
  deep blues `#002C77`/`#1D468C`, 6px radii, soft shadows, uppercase buttons.
- Chart colors are validated for colorblind safety (CVD ΔE, lightness band,
  chroma, contrast): five fixed category hues, a single-hue ordinal ramp for
  priority, and reserved status colors always paired with a label.
- The 10 functions use a single hue with labels for identity (more than the
  8-hue categorical ceiling), and every chart value is also reachable in the
  detail tables.
- Data lives only in the browser; "Reset data" or the footer link restores
  the original spreadsheet contents.
