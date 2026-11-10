#!/usr/bin/env python3
"""Create the portable handover ZIP using only the Python standard library."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--name', default='haven-foundation-0.1.0-alpha.1.zip')
parser.add_argument('--output-dir', type=Path, default=root.parent / 'output')
args = parser.parse_args()
destination = args.output_dir.resolve()
if destination == root or root in destination.parents:
    raise SystemExit('Choose an output directory outside the project to avoid recursive packaging.')
destination.mkdir(parents=True, exist_ok=True)
name = args.name
if Path(name).name != name or not name.endswith('.zip'):
    raise SystemExit('Archive name must be a ZIP basename.')
excluded = {'releases', 'node_modules', '.angular', '.git', 'target', 'test-results', 'playwright-report', '__pycache__', 'gen'}
with zipfile.ZipFile(destination / name, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    manifest = []
    for file in sorted(root.rglob('*')):
        relative = file.relative_to(root)
        if not file.is_file() or file.is_symlink() or any(p in excluded for p in relative.parts):
            continue
        if file.name == 'ARTIFACT-MANIFEST.json' or file.name.startswith('.env') or file.suffix in {'.tmp', '.log', '.tsbuildinfo'}:
            continue
        if relative.parts[:4] in {('apps', 'game', 'src-tauri', 'icons')} and any(p in {'android', 'ios'} for p in relative.parts):
            continue
        archive.write(file, str(Path('haven-foundation') / relative))
        manifest.append({'path': relative.as_posix(), 'bytes': file.stat().st_size, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
    archive.writestr('haven-foundation/ARTIFACT-MANIFEST.json', json.dumps({'files': manifest}, indent=2) + '\n')
with zipfile.ZipFile(destination / name) as archive:
    if archive.testzip() is not None:
        raise SystemExit('Archive integrity failure')
digest = hashlib.sha256((destination / name).read_bytes()).hexdigest()
(destination / 'SHA256SUMS.txt').write_text(f'{digest}  {name}\n')
print(f'{destination / name}\nSHA-256 {digest}\n{(destination / name).stat().st_size:,} bytes')
