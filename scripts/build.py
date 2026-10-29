#!/usr/bin/env python3
"""Create a reproducible Bob package using only Python's standard library."""
import hashlib
import json
import sys
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
src = root / 'src'
assert len(sys.argv) == 3 and sys.argv[2] in ('public', 'local'), 'Run npm run build or npm run build:public'
public_build = sys.argv[2] == 'public'
info_bytes = Path(sys.argv[1]).read_bytes()
info = json.loads(info_bytes)
package = json.loads((root / 'package.json').read_text())
assert info['version'] == package['version'], 'Version mismatch'
assert info['category'] == 'translate'
model = next(option for option in info['options'] if option['identifier'] == 'modelChoice')
assert model['type'] == 'menu', 'Invalid model menu'
if public_build:
    assert model['defaultValue'] == 'manual'
    assert model['menuValues'] == [{'title': '自定义模型或路由组', 'value': 'manual'}]
else:
    assert model['defaultValue'] == '', 'Do not pin a model'
    assert len(model['menuValues']) > 2, 'The model menu must come from Magpie'
files = ['info.json', 'main.js', 'core.js', 'stream.js', 'icon.png', 'LICENSE', 'THIRD_PARTY_NOTICES']
contents = {}
for name in files:
    contents[name] = info_bytes if name == 'info.json' else ((root if name in ('LICENSE', 'THIRD_PARTY_NOTICES') else src) / name).read_bytes()
assert contents['icon.png'].startswith(b'\x89PNG\r\n\x1a\n'), 'Missing PNG icon'
output = root / ('dist/public' if public_build else 'dist') / ('magpie-' + info['version'] + '.bobplugin')
output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(output, 'w', compression=ZIP_DEFLATED) as archive:
    for name in files:
        entry = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        archive.writestr(entry, contents[name])
with ZipFile(output) as archive:
    assert archive.namelist() == files
    assert archive.testzip() is None
    for name in files:
        assert archive.read(name) == contents[name]
digest = hashlib.sha256(output.read_bytes()).hexdigest()
(output.parent / (output.name + '.sha256')).write_text(digest + '  ' + output.name + '\n')
print(str(output))
print('SHA-256: ' + digest)
