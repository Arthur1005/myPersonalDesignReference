# Design Orbit

One piece of design inspiration a day, stitched into a net of satellites around the globe.
The net is made of bands of rectangular windows, like a geodesic dome of screens. Each window is a panel. Every new entry lights up the next one, so the archive spreads across the sphere over time.

## Add today's inspiration

1. Put the image in `entries/` (e.g. `entries/2026-11-15-swiss-poster.jpg`). JPG, PNG, WebP or SVG all work; around 1200px wide is plenty.
2. Add an entry to `data/entries.json`:

   ```json
   {
     "date": "2026-11-15",
     "title": "Swiss poster, 1959",
     "image": "entries/2026-11-15-swiss-poster.jpg",
     "note": "Why it inspired me…",
     "links": [{ "type": "source", "url": "https://source-of-the-work" }],
     "keywords": ["poster", "swiss style", "typography"]
   }
   ```

3. Commit and push. The panel lights up on the next page load.

Entries are sorted by `date`, so the order in the file doesn't matter. Everything after `image` is optional, and
`similar` / `comments` are easiest to add from the site itself.
The net starts with ~300 panels (10° bands) and automatically adds bands when you outgrow it (378, then 458, …). Images are cropped to fill their window, centred, and always stay upright.

The three `sample` entries are placeholders. Delete them (and their SVGs in `entries/`) once you've added your own.

## Owner PIN and guests

Visitors land on **Enter as guest**. A small **I’m Arthur** link underneath leads to the 6-digit PIN:

- **Owner (PIN)**: can add and edit keywords, links, similar projects and comments. Tick *Remember on this device* to skip the PIN next time.
- **Guest**: view only — no editing controls are shown.

Use the **Owner · Lock** / **Guest · Unlock** button under the title to switch.

The PIN is stored only as a slow PBKDF2 hash in `gate.js` (with instructions there for changing it). Since this is a static
site, the PIN locks the editing *interface*; what actually protects the repo is the GitHub token below, which only
lives in your own browser. Without it, nobody can save anything.

## Editing a panel (owner)

Open any lit panel. Under the image:

- **Keywords**: they float in their container. Type in the search box to add more: suggestions come from
  `data/keywords.json` (~300 design terms) plus keywords you've used before, and misspellings get a "did you mean?"
  correction first. `↑`/`↓` + `Enter` to add, `×` to remove (hover a keyword to stop it moving).
- **Links**: paste a link, tag it **Website**, **Image** or **Source**. As many as you like.
- **Similar projects**: **+ Add from your device** (or drag images in). Big photos are resized to 1600px and saved as WebP
  into `entries/similar/`. Each gets an editable caption.
- **Comments**: dated notes on the panel (`⌘/Ctrl + Enter` to post).

Changes are kept in your browser as a draft (images too, so a reload won't lose them) until you save:

- **Save to GitHub** uploads new images, then merges your changes into `data/entries.json`. The first time, it asks for a
  [fine-grained token](https://github.com/settings/personal-access-tokens/new) with access to **only this repo** and
  **Contents: Read and write**. The site updates about a minute later.
- **Download JSON** gives you the updated `entries.json` (and any new images) to commit yourself.

## Progress calendar

The **Calendar** button (top right) shows your current streak and opens a month view:

- **Done**: at least one entry that day
- **2+ entries**: brighter, with a count badge
- **Missed**: a past day with no entry (counted from your first-ever entry)
- **Today**: outlined until you add something; it never counts as missed while the day is still going

Hover a day to light up its panels on the globe; click it to turn the globe to them and list that day's entries
(click one to open it). Stats show current streak, best streak, days done / days tracked, and total entries.
Dates come from each entry's `date` field, so add entries with the day you actually found them. Link straight to it with `?calendar`.

## Run locally

Any static server works:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly from disk won't work because browsers block loading `entries.json` over `file://`.)

## Publish on GitHub Pages

Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)`**.
The site will appear at `https://<username>.github.io/myPersonalDesignReference/`.

## Interactions

- Drag to orbit, scroll to zoom
- Hover a panel to see its title, click to open it
- `←` / `→` step between days, `Esc` closes
- Link straight to a panel with `#day-12`

## Structure

```
index.html          page shell
style.css           styles
main.js             the globe (Three.js)
gate.js             PIN / guest entry screen
store.js            drafts, image uploads, Save to GitHub / Download
keywords.js         floating keyword chips, search, spelling suggestions
details.js          links, similar projects, comments
calendar.js         progress calendar and streaks
data/entries.json   your archive
data/keywords.json  vocabulary for keyword suggestions
entries/            images (entries/similar/ for similar projects)
vendor/             Three.js r170 (MIT), vendored so there's no CDN dependency
fonts/              Orbitron (logo), Octarine (titles), Organo (keywords), see fonts/README.md
```
