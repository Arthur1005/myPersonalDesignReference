# Design Orbit

One piece of design inspiration a day, stitched into a net of satellites around the globe.
The net is made of bands of rectangular windows, like a geodesic dome of screens. Each window is a panel. Every new entry lights up the next one, so the archive spreads across the sphere over time.

## Add today's inspiration

**From the site (owner):** unlock with the lock icon (bottom left), then press **+ Add** (top right).
Choose, drop or paste an image, give it a title (the date defaults to today) and optionally a note, and press
**Light up a panel**. The panel appears on the globe straight away and opens so you can add keywords, links, similar
projects and comments. Press **Save to GitHub** when you're done: the image goes into `entries/` and the entry into
`data/entries.json`. The live site updates about a minute later (until then, a reload may not show it yet).

**Videos:** in **+ Add** you can also choose a short video (MP4 or WebM, up to 25 MB; videos live in this repo, so keep
them light). The site takes one still for the card and lists, plus four small frames that the globe flips through. The
clip itself only loads when the panel is opened: it loops, a click pauses or plays it, the bar at the bottom scrubs, and
**Magnify** opens the current frame under the magnifying glass.

**By hand:** put the image in `entries/` and add an entry to `data/entries.json`:

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

Entries are sorted by `date`, so the order in the file doesn't matter. Everything after `image` is optional, and
`similar` / `comments` are easiest to add from the site itself.
The net starts with ~300 panels (10° bands) and automatically adds bands when you outgrow it (378, then 458, …). Images are cropped to fill their window, centred, and always stay upright.

The three `sample` entries are placeholders. Delete them (and their SVGs in `entries/`) once you've added your own.

## Welcome panel and owner login

Visitors see a short welcome panel (once per browser session) and then browse the site read-only.

To edit, click the **lock icon** in the bottom-left corner and type your 6-digit PIN. The page reloads with editing
unlocked: the lock turns blue and **+ Add** appears. Tick *Remember on this device* to stay unlocked on that browser;
click the blue lock again to lock straight away.

The PIN is stored only as a slow PBKDF2 hash in `gate.js` (with instructions there for changing it). Since this is a static
site, the PIN locks the editing *interface*; what actually protects the repo is the GitHub token below, which only
lives in your own browser. Without it, nobody can save anything.

## In each panel

- **Click the image to enlarge it.** In the viewer the cursor becomes a magnifying glass that enlarges just the spot
  under it (scroll to make it stronger or weaker); `←`/`→` step through the panel's images (main + similar projects),
  `Esc` closes.
- **Related on your globe** suggests up to four other panels, ranked by shared keywords (rarer ones count more), links
  to the same website, and similar colours (read from each image). Each suggestion shows why; click to fly to it.

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

The **?** button (bottom right) shows these hints; it opens by itself on a first visit.

- Drag to turn, scroll to zoom. Or click once on the globe (not on a lit panel) and it follows your cursor; click again
  (or press `Esc`) to release. A hint beside the cursor says what a click will do
- Hover a panel to see its title, click to open it
- `←` / `→` step between days, `Esc` closes
- Link straight to a panel with `#day-12`

## Structure

```
index.html          page shell
style.css           styles
main.js             the globe (Three.js)
gate.js             welcome panel + owner login (lock icon)
store.js            drafts, image uploads, Save to GitHub / Download
keywords.js         floating keyword chips, search, spelling suggestions
details.js          links, similar projects, comments
related.js          related-panel suggestions
lightbox.js         full-screen image viewer
add.js              “+ Add” dialog for new panels
calendar.js         progress calendar and streaks
data/entries.json   your archive
data/keywords.json  vocabulary for keyword suggestions
entries/            images (entries/similar/ for similar projects)
vendor/             Three.js r170 (MIT), vendored so there's no CDN dependency
fonts/              Orbitron (logo), Octarine (titles), Organo (keywords), see fonts/README.md
```
