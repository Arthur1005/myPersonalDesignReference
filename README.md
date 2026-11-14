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
     "link": "https://source-of-the-work",
     "keywords": ["poster", "swiss style", "typography"]
   }
   ```

3. Commit and push. The panel lights up on the next page load.

Entries are sorted by `date`, so the order in the file doesn't matter. `note`, `link` and `keywords` are optional.
The net starts with ~300 panels (10° bands) and automatically adds bands when you outgrow it (378, then 458, …). Images are cropped to fill their window, centred, and always stay upright.

The three `sample` entries are placeholders. Delete them (and their SVGs in `entries/`) once you've added your own.

## Keywords

Each panel has a **Keywords** section. To edit keywords, open the site with `?edit` on the end of the address
(e.g. `https://arthur1005.github.io/myPersonalDesignReference/?edit`). Your browser remembers it; `?edit=off` turns it off.
Visitors never see the editing controls.

In edit mode:

- Type in the search box under the keywords. Suggestions come from `data/keywords.json` (~300 design terms) plus any
  keyword you've used before. If you misspell something, the corrected word is suggested first ("did you mean?").
- `↑` / `↓` to choose, `Enter` to add, `Backspace` in an empty box removes the last keyword, `×` removes any keyword.
- Anything not in the list can still be added as a new keyword.
- Changes are kept in your browser as a draft until you save:
  - **Save to GitHub** writes them straight into `data/entries.json` in this repo. The first time, it asks for a
    [fine-grained token](https://github.com/settings/personal-access-tokens/new) — give it access to **only this repo**
    with **Contents: Read and write**. It's stored in that browser only. The site updates about a minute later.
  - **Download JSON** gives you the updated `entries.json` to commit yourself.

To grow the suggestion list, add words to `data/keywords.json`.

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
keywords.js         keyword chips, search, spelling suggestions, saving
data/entries.json   your archive
data/keywords.json  vocabulary for keyword suggestions
entries/            images
vendor/             Three.js r170 (MIT), vendored so there's no CDN dependency
```
