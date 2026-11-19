# Design Orbit

One piece of design inspiration a day, stitched into a net of satellites around the globe.
The net is made of bands of rectangular windows, like a geodesic dome of screens. Each window is a panel. Every new entry lights up the next one, so the archive spreads across the sphere over time.

## Add today's inspiration

**From the site (owner):** unlock with the lock icon (bottom left), then press **+ Add** (top right).
Choose, drop or paste an image, give it a title (the date defaults to today) and optionally a note, and press
**Light up a panel**. The panel appears on the globe straight away and opens so you can add keywords, links
and comments. Press **Save to GitHub** when you're done: the image goes into `entries/` and the entry into
`data/entries.json`. The live site updates about a minute later (until then, a reload may not show it yet).

**Videos:** in **+ Add** you can also choose a video. Videos live in this repo, so the limit is 25 MB; a bigger one (up
to 5 minutes long) gets a **Shrink to fit** step that re-records it smaller in your browser (it plays through once, max
1280px, saved as WebM). The site takes one still for the card and lists, plus four small frames that the globe flips through. The
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
`comments` are easiest to add from the site itself.
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
  under it (scroll to make it stronger or weaker); `←`/`→` step through the panel's images ,
  `Esc` closes.
- **Related on your globe** suggests up to four other panels, ranked by shared keywords (rarer ones count more), links
  to the same website, and similar colours (read from each image). Each suggestion shows why; click to fly to it.

## Editing a panel (owner)

Open any lit panel. Under the image:

- **Credit**: under the title, add who made it (and a link to their portfolio or source). Visitors see "By …".
  You can also fill this in when adding a panel.
- **Copy image** (on the image, owner only): copies the picture to the clipboard in one click, ready to paste into
  Figma, a doc or a chat. On a video it copies the frame that's showing; SVG logos are copied at 1600px.
- **Paste from clipboard** (in **+ Add** and **Replace**): one click drops in whatever image you last copied.
- **Replace** (on the image or video): swap the panel's image or video for another. Its title, keywords, links and
  comments stay as they are. The old file stays in the repo or bucket, unused.
- **Keywords**: they float in their container. Type in the search box to add more: suggestions come from
  `data/keywords.json` (~300 design terms) plus keywords you've used before, and misspellings get a "did you mean?"
  correction first. `↑`/`↓` + `Enter` to add, `×` to remove (hover a keyword to stop it moving).
- **Links**: paste a link, tag it **Website**, **Image** or **Source**. As many as you like.
- **Comments**: dated notes on the panel (`⌘/Ctrl + Enter` to post).

Changes are kept in your browser as a draft (images too, so a reload won't lose them) until you save:

- **Save to GitHub** uploads new images, then merges your changes into `data/entries.json`. The first time, it asks for a
  [fine-grained token](https://github.com/settings/personal-access-tokens/new) with access to **only this repo** and
  **Contents: Read and write**. The site updates about a minute later.
- **Download JSON** gives you the updated `entries.json` (and any new images) to commit yourself.

## Web-friendly formats

- **Images** you add are converted to **WebP** automatically (and resized to at most 1600px). SVG and GIF files are kept
  as they are, and an image that would come out bigger as WebP is left alone.
- **Videos** get a **Convert to WebM** button in the Add dialog. It's optional: it re-records the video in your browser
  (it plays through once), usually much smaller. If it wouldn't save anything, the original is kept.

## Big videos (optional): Cloudflare R2

Videos normally live in this repo, which limits them to 25 MB. To add full-size videos (up to 1 GB each), connect a
Cloudflare R2 bucket. Stills, frames and everything else still save to GitHub.

1. Create a free Cloudflare account, open **R2 Object Storage** and enable it (it asks for a payment card; the first
   10 GB are free).
2. **Create bucket**, e.g. `design-orbit`.
3. In the bucket's **Settings**:
   - **Public access → Public Development URL → Enable**. Copy the address (looks like `https://pub-xxxx.r2.dev`).
   - **CORS policy → Add**, and paste:
     ```json
     [{ "AllowedOrigins": ["https://arthur1005.github.io"],
        "AllowedMethods": ["GET", "HEAD", "PUT"],
        "AllowedHeaders": ["*"],
        "MaxAgeSeconds": 3600 }]
     ```
4. Back on the R2 overview: **Manage API tokens → Create Account API token**, permission **Object Read & Write**,
   limited to this bucket. Copy the **Access Key ID** and **Secret Access Key** (shown once). Keep these private.
5. Put the **account ID** (shown on the R2 overview), the **bucket name** and the **public address** into `config.js`.

The first time you save a video, the site asks for the Access Key ID and Secret Access Key and keeps them in that
browser only. The save bar shows upload progress.

### Storage meter

When you're unlocked, a **Storage** button sits beside the lock. It shows how full the video bucket is against the free
10 GB (added up from the size of each video you add through the site) and how big this repo is against GitHub's 1 GB
guideline. It turns amber at 80% and red at 95%, and the Add dialog warns you before a video takes you past 80% or over
the free allowance, with the rough monthly cost.

## Visitor comments (optional)

Visitors can leave a comment on any panel, with their name if they like. Comments only show once you approve them.
This uses a free [Supabase](https://supabase.com) project as the comment store, and stays off until you set it up:

1. Create a free Supabase account and a new project (any name and region).
2. In the project, open **SQL Editor → New query**, paste in everything from [`supabase/setup.sql`](supabase/setup.sql),
   **change the passphrase on the last line** to a long one only you know, and press **Run**.
3. Open **Project Settings → API** (or the **Connect** button) and copy the **Project URL** and the **publishable / anon key**.
4. Put those two values into `config.js` in this repo and commit. They are safe to publish: the database only lets the
   public read approved comments and submit new ones.

After that, when you're unlocked a **Comments** button appears in the top bar with a count of comments waiting. The first
time, it asks for your passphrase (kept in that browser only). Approve or delete from there; you can also delete an
approved visitor comment from its panel.

## Progress calendar

The **Calendar** button (top right) shows your current streak and opens a month view:

- **Done**: at least one entry that day
- **2+ entries**: brighter, with a count badge
- **Missed**: a past day with no entry (counted from your first-ever entry)
- **Today**: outlined until you add something; it never counts as missed while the day is still going

Hover a day to light up its panels on the globe; click it to turn the globe to them and list that day's entries
(click one to open it). On phones the calendar sits under its button and the picked day's projects appear as cards
along the bottom of the screen. Stats show current streak, best streak, days done / days tracked, and total entries.
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

**Cursor:** over the globe the cursor is a reticle (thin ring + blue dot); over a lit panel it becomes viewfinder
brackets. In follow mode the ring is dashed and spins.

The core is frosted glass, so the far side of the net shows faintly through it. The **?** button (bottom right) shows these hints; it opens by itself on a first visit.

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
details.js          credit, links, comments
comments.js         visitor comments + approval (Supabase, optional)
config.js           settings for visitor comments (Supabase) and big videos (R2)
r2.js               uploads videos to the R2 bucket
storage.js          storage meter and limit warnings
supabase/setup.sql  one-time database setup for visitor comments
related.js          related-panel suggestions
lightbox.js         full-screen image viewer
cursor.js           custom globe cursors
add.js              “+ Add” dialog for new panels
calendar.js         progress calendar and streaks
data/entries.json   your archive
data/keywords.json  vocabulary for keyword suggestions
entries/            images (entries/frames/ for video stills)
vendor/             Three.js r170 (MIT), vendored so there's no CDN dependency
fonts/              Orbitron (logo), Octarine (titles), Organo (keywords), see fonts/README.md
```

## Updating files

`tools/stamp.py` gives every script and the stylesheet a version tag in `index.html` (the git pre-commit hook runs it). Each device then always loads one matching set of files, and an old cached page reloads itself to the current one. If you edit files by hand, run `python3 tools/stamp.py` before committing.
