import importlib.util, io, json, tempfile, unittest, zipfile
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('notices', Path(__file__).with_name('runtime-notices.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

class NoticeTests(unittest.TestCase):
    def test_parent_pom_license(self):
        parent = b'<project xmlns="http://maven.apache.org/POM/4.0.0"><licenses><license><name>Apache 2.0</name><url>https://example.invalid/license</url></license></licenses></project>'
        child = b'<project xmlns="http://maven.apache.org/POM/4.0.0"><parent><groupId>example</groupId><artifactId>parent</artifactId><version>1</version></parent></project>'
        with patch.object(m.urllib.request, 'urlopen', side_effect=[io.BytesIO(child),io.BytesIO(parent)]):
            licenses, source = m.pom_licenses('example','child','1')
        self.assertEqual(licenses[0][0], 'Apache 2.0'); self.assertIn('parent-1.pom',source)

    def test_nested_notices_and_fail_closed_regeneration(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); assets=root/'app/src/main/assets/THIRD-PARTY-NOTICES.txt'; assets.parent.mkdir(parents=True)
            assets.write_text('original Go license\n',encoding='utf-8')
            jar=io.BytesIO()
            with zipfile.ZipFile(jar,'w') as z: z.writestr('META-INF/NOTICE','embedded attribution')
            artifact=root/'core.aar'
            with zipfile.ZipFile(artifact,'w') as z:
                z.writestr('META-INF/androidx/LICENSE.txt','Apache License\nVersion 2.0, January 2004\nEND OF TERMS AND CONDITIONS')
                z.writestr('classes.jar',jar.getvalue())
                z.writestr('lint.jar',b'not a runtime jar')
            manifest=root/'app/build/notices/runtime-inputs.json'; manifest.parent.mkdir(parents=True)
            manifest.write_text(json.dumps([{'group':'androidx.core','artifact':'core','version':'1.15.0','path':str(artifact)}]),encoding='utf-8')
            with patch.object(m,'ROOT',root), patch.object(m,'pom_licenses',return_value=([('Apache 2.0','url')],'pom')):
                m.main(); first=assets.read_text(encoding='utf-8'); m.main()
            self.assertEqual(first,assets.read_text(encoding='utf-8'))
            self.assertTrue(first.startswith('original Go license\n'))
            self.assertIn('embedded attribution',first); self.assertIn('androidx.core:core:1.15.0',first)
            with patch.object(m,'ROOT',root),patch.object(m,'pom_licenses',return_value=([('Unknown','url')],'pom')):
                with self.assertRaises(ValueError): m.main()
            self.assertEqual(first,assets.read_text(encoding='utf-8'))

if __name__=='__main__': unittest.main()
