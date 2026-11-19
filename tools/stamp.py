#!/usr/bin/env python3
"""Stamp every local script and the stylesheet in index.html with a short content hash.

Browsers and GitHub Pages cache files for a while. Without this, a phone can end up
running a new main.js with an old style.css (or the reverse), which is what pushed the
globe off-centre once. With it, a changed file gets a new address, so it is always
fetched fresh, and files that didn't change stay cached.

Run before each commit (the git pre-commit hook does it):  python3 tools/stamp.py
"""
import hashlib, json, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
html_path = root / 'index.html'
html = html_path.read_text()

def h(name):
    return hashlib.sha1((root / name).read_bytes()).hexdigest()[:8]

modules = sorted(p.name for p in root.glob('*.js'))
vendor = {'three': 'vendor/three.module.min.js', 'three/addons/OrbitControls.js': 'vendor/OrbitControls.js'}

imports = {k: f'./{v}?v={h(v)}' for k, v in vendor.items()}
for m in modules:
    imports[f'./{m}'] = f'./{m}?v={h(m)}'
imap = json.dumps({'imports': imports}, indent=2).replace('\n', '\n    ')
html = re.sub(r'(<script type="importmap">)[\s\S]*?(</script>)', lambda m: f'{m[1]}\n    {imap}\n  {m[2]}', html, count=1)

html = re.sub(r'href="style\.css(\?v=\w+)?"', f'href="style.css?v={h("style.css")}"', html)
for m in modules:
    html = re.sub(rf'src="{re.escape(m)}(\?v=\w+)?"', f'src="{m}?v={h(m)}"', html)

# one id for the whole build; the page compares it with version.json and reloads if it is stale
build = hashlib.sha1(''.join(imports.values()).encode() + h('style.css').encode()).hexdigest()[:10]
html = re.sub(r'<meta name="build" content="\w*" />', f'<meta name="build" content="{build}" />', html)
html_path.write_text(html)
(root / 'version.json').write_text(json.dumps({'build': build}) + '\n')
print('build', build)
