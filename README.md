# Design Orbit

One piece of design inspiration a day, stitched into a net of satellites around the globe.
Each triangle in the net is a panel. Every new entry lights up the next one, so the archive spreads across the sphere over time.

## Add today's inspiration

1. Put the image in `entries/` (e.g. `entries/2026-11-15-swiss-poster.jpg`). JPG, PNG, WebP or SVG all work; around 1200px wide is plenty.
2. Add an entry to `data/entries.json`:

   ```json
   {
     "date": "2026-11-15",
     "title": "Swiss poster, 1959",
     "image": "entries/2026-11-15-swiss-poster.jpg",
     "note": "Why it inspired me…",
     "link": "https://source-of-the-work",
     "tags": ["poster", "type"]
   }
   ```

3. Commit and push. The panel lights up on the next page load.

Entries are sorted by `date`, so the order in the file doesn't matter. `note`, `link` and `tags` are optional.
The net starts with 320 panels and automatically subdivides into a denser net when you outgrow it.

The three `sample` entries are placeholders. Delete them (and their SVGs in `entries/`) once you've added your own.

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
- Link straight to a day with `#day-12`

## Structure

```
index.html          page shell
style.css           styles
main.js             the globe (Three.js)
data/entries.json   your archive
entries/            images
vendor/             Three.js r170 (MIT), vendored so there's no CDN dependency
```
