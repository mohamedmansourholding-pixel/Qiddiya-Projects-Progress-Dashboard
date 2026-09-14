# Qiddiya Car Park — Dashboard (GitHub Pages)

This folder is the full, self-contained static site. Design, data, and
configuration are now in separate files:

```
index.html          ← structure, CSS, and layout only — no data, no title text
app.js               ← all logic: filtering, KPI calculations, charts, rendering
chart.umd.js          ← Chart.js library (vendored locally, no external CDN needed)
data.json            ← ALL dashboard data (submittals, concrete, progress)
config.json          ← dashboard title / branding / logo path
logo.png             ← company logo shown in the header
scripts/
  generate_data.py    ← regenerates data.json from the source Excel files
```

Nothing about the design, layout, charts, filters, or calculations changed —
`app.js` and `index.html` contain the same logic and markup as before, just
with the data and title text extracted into their own files. (Note: the
Mobilization tab was removed and the two remaining sections — Submittals/
Schedule and Concrete Works — were merged into a single always-visible page,
per a later request, so there is no tab bar anymore.)

The header's "TODAY" date updates automatically to the visitor's actual
current date every time the page loads — it is not read from data.json. The
small line underneath it ("Data as of …") shows the latest submission date
actually found in the current `data.json`, so you can always tell how fresh
the underlying data is, separately from today's date.

## Updating with a new Excel export

**You only ever need to replace `data.json`.** Never edit `index.html` or
`app.js` for a data refresh.

Two ways to produce a new `data.json`:

### Option A — run the script (recommended)
1. Put the three updated source files somewhere (they can keep their
   original names):
   `Qiddiya_-_Car_Park_-_Report.xls`, `Qty_Con.xlsx`, `Mobilization_WBS_111.xlsx`
2. From the `scripts/` folder, run:
   ```
   pip install pandas openpyxl xlrd
   python generate_data.py --submittals "path/to/Report.xls" --qtycon "path/to/Qty_Con.xlsx" --mobilization "path/to/Mobilization_WBS_111.xlsx" --out ../data.json
   ```
3. Commit the updated `data.json` and push — GitHub Pages will pick it up
   automatically.

### Option B — ask Claude
Upload the new Excel file(s) in a chat and ask Claude to regenerate
`data.json` using the same structure as before (point it at this
`generate_data.py` script if you have it handy) — then download the file and
replace it in your GitHub repo.

## Changing the title / branding

Edit **`config.json`** only:

```json
{
  "pageTitle": "Browser tab title",
  "logoSrc": "logo.png",
  "orgName": "Used as the logo's alt text",
  "orgDivision": "Small caption next to the logo",
  "projectTitle": "Main heading (H1). Can include HTML, e.g. a hyperlink.",
  "tagline": "Subtitle under the heading. {{totalCount}} is replaced automatically with the live submittal count."
}
```

`projectTitle` is inserted as HTML (not plain text), so you can make part of
it a link — that's how "Qiddiya" links out to the GitHub repo in the current
version:
```json
"projectTitle": "<a href=\"https://github.com/...\" target=\"_blank\">Qiddiya</a> projects"
```

To change the logo, replace `logo.png` with a new image (keep the same
filename, or update `logoSrc` to the new filename).

No HTML editing required for any of this — just save the JSON file (and swap
the logo image if needed) and refresh.

## Deploying to GitHub Pages

1. Copy all files in this folder (keeping the exact folder structure,
   including the `scripts/` subfolder) into your GitHub repo — e.g. into the
   repo root, or a `/docs` folder if that's what your Pages source is set to.
2. Commit and push.
3. In the repo's **Settings → Pages**, make sure the source branch/folder
   matches where you placed these files.
4. Open the published URL — the dashboard fetches `config.json` and
   `data.json` at load time, so it will always reflect whatever is currently
   committed.

## Important: local testing

Because the dashboard now loads `data.json` and `config.json` via `fetch()`,
opening `index.html` directly by double-clicking it (a `file://` URL) will
**not** work in most browsers — they block that kind of local file request
for security reasons. This is not a problem on GitHub Pages (it's served
over `https://`), but if you want to test locally first, run a tiny local
web server from this folder, e.g.:

```
python -m http.server 8000
```

then open `http://localhost:8000/index.html`.
