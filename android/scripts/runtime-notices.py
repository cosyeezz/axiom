"""Merge actual Gradle runtime licenses with Go notices; fail closed on unknown licenses.
Run after notices.mjs and :app:collectReleaseNoticeInputs, before assembling APKs.
Only exact resolved GAVs are queried; POMs supply license declarations, not a second resolver.
"""
import hashlib, io, json, re, urllib.request, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = {'m': 'http://maven.apache.org/POM/4.0.0'}
MARKER = '\n=== Gradle production runtime dependencies ===\n'

def pom_licenses(group, artifact, version, seen=None):
    key = (group, artifact, version)
    seen = set() if seen is None else seen
    if key in seen or len(seen) > 8: raise ValueError(f'POM parent cycle: {key}')
    seen.add(key)
    if not all(re.fullmatch(r'[A-Za-z0-9_.+-]+', x) for x in key): raise ValueError(f'Unsafe coordinate: {key}')
    base = 'https://dl.google.com/dl/android/maven2/' if group.startswith('androidx.') else 'https://repo.maven.apache.org/maven2/'
    url = f'{base}{group.replace(".", "/")}/{artifact}/{version}/{artifact}-{version}.pom'
    with urllib.request.urlopen(url, timeout=30) as response: root = ET.fromstring(response.read())
    licenses = [(n.findtext('m:name', namespaces=NS) or '', n.findtext('m:url', namespaces=NS) or '') for n in root.findall('m:licenses/m:license', NS)]
    if licenses: return licenses, url
    parent = root.find('m:parent', NS)
    if parent is None: raise ValueError(f'No declared license or parent: {key}')
    return pom_licenses(*(parent.findtext('m:' + field, namespaces=NS) for field in ['groupId','artifactId','version']), seen)

def embedded_notices(data, prefix=''):
    out = []
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for info in archive.infolist():
            if info.is_dir(): continue
            name = info.filename
            if re.search(r'(?:^|/)(?:LICENSE|NOTICE|COPYING|COPYRIGHT)(?:[._-]|$)', name, re.I):
                if info.file_size > 2_000_000: raise ValueError(f'Unexpected license size: {name}')
                out.append((prefix + name, archive.read(info).decode('utf-8')))
            elif name == 'classes.jar' or (name.startswith('libs/') and name.endswith('.jar')):
                out.extend(embedded_notices(archive.read(info), prefix + name + '!/'))
    return out

def main():
    inputs = json.loads((ROOT / 'app/build/notices/runtime-inputs.json').read_text(encoding='utf-8'))
    if not inputs: raise ValueError('Empty runtime artifacts')
    components, sections, apache = [], [], None
    for item in inputs:
        gav = f'{item["group"]}:{item["artifact"]}:{item["version"]}'
        data = Path(item['path']).read_bytes()
        licenses, source = pom_licenses(item['group'], item['artifact'], item['version'])
        if not licenses or not all('apache' in name.lower() and '2.0' in name for name, _ in licenses):
            raise ValueError(f'Unreviewed license: {gav}: {licenses}')
        files = embedded_notices(data)
        for _, text in files:
            if 'Apache License' in text and 'Version 2.0, January 2004' in text and 'END OF TERMS AND CONDITIONS' in text: apache = text
        components.append({'coordinate': gav, 'sha256': hashlib.sha256(data).hexdigest(), 'license': 'Apache-2.0', 'licenseSource': source})
        sections.append(f'\n{gav}\nLicense: Apache-2.0 (full text below)\nDeclaration: {source}\n' + ''.join(f'\n--- {gav}!/{name} ---\n{text}\n' for name, text in files))
    if apache is None: raise ValueError('No complete Apache-2.0 license in runtime artifacts')
    assets = ROOT / 'app/src/main/assets/THIRD-PARTY-NOTICES.txt'
    go = assets.read_text(encoding='utf-8').split(MARKER, 1)[0]
    assets.write_text(go + MARKER + ''.join(sections) + '\n--- Shared Apache-2.0 license text ---\n' + apache, encoding='utf-8')
    manifest = ROOT / 'app/build/notices/runtime-components.json'
    manifest.write_text(json.dumps(components, indent=2) + '\n', encoding='utf-8')
    print(f'Collected {len(components)} actual Gradle runtime components; kept Go notices and embedded license/notice text.')

if __name__ == '__main__': main()
