"""Adds to Git every file of the built site (app/public/Nishikigoi-beta/preview/dist) that the pages need, so a fresh clone can be served as it is.

    python tools/track-dist.py            adds the files (git add -f) and lists how many
    python tools/track-dist.py --list     only lists them

The site is edited by hand in dist/ (there is no build step on this computer), and dist/ is in .gitignore, so every file the pages use has to
be added with -f. Run this after adding a page, a script, a stylesheet or a new bundle under _astro/. It follows what the pages really load:
  - every .html page, sw.js and the favicons
  - everything in assets/ (shared scripts, vendor libraries, the error page)
  - the _astro/ css/js files that a page links (old bundles nobody links are left out)
  - the dist/ (Tabler) and preview/ files that a page or a stylesheet links, with the fonts and images those stylesheets point to
static/ (the demo images of the Tabler template) is not used by any page and stays out.
"""
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(REPO, 'app', 'public', 'Nishikigoi-beta', 'preview', 'dist')

needed = set()


def add(rel):
    rel = rel.replace('\\', '/').lstrip('./')
    full = os.path.join(DIST, rel)
    if os.path.isfile(full) and not rel.endswith('.map'):
        needed.add(rel)
        return True
    return False


def read(rel):
    with open(os.path.join(DIST, rel), encoding='utf8', errors='ignore') as fh:
        return fh.read()


for name in sorted(os.listdir(DIST)):
    if name.endswith('.html') or name in ('sw.js', 'favicon.ico', 'favicon-dev.ico'):
        add(name)
for root, _dirs, names in os.walk(os.path.join(DIST, 'assets')):
    for name in names:
        add(os.path.relpath(os.path.join(root, name), DIST))

# what the pages (and then the stylesheets they link) point to
queue = [n for n in list(needed) if n.endswith('.html')]
seen = set()
link = re.compile(r'''["'(=\s](?:\./|/)?((?:_astro|dist|preview)/[\w./@%\-]+\.(?:css|js|woff2?|ttf|eot|svg|png|jpe?g|gif|webp|ico))''')
while queue:
    rel = queue.pop()
    if rel in seen:
        continue
    seen.add(rel)
    text = read(rel)
    for match in link.finditer(text):
        target = match.group(1)
        if add(target) and target.endswith(('.css', '.js')):
            queue.append(target)
    if rel.endswith('.css'):
        base = os.path.dirname(rel)
        for match in re.finditer(r'url\(\s*["\']?([^)"\'#?]+)', text):
            target = match.group(1)
            if target.startswith(('data:', 'http', '//')):
                continue
            path = os.path.normpath(os.path.join(base, target)).replace('\\', '/')
            add(path)

files = sorted(needed)
if '--list' in sys.argv:
    print('\n'.join(files))
    print(len(files), 'files')
    sys.exit(0)

prefix = os.path.relpath(DIST, REPO).replace('\\', '/') + '/'
for start in range(0, len(files), 200):
    chunk = [prefix + f for f in files[start:start + 200]]
    subprocess.run(['git', 'add', '-f', '--'] + chunk, cwd=REPO, check=True)
print(len(files), 'files added to Git')
