import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const docsDir = path.join(root, 'docs');

async function filesBelow(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function htmlTags(source) {
  return source.match(/<[^!][^>]*>/gs) || [];
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[1] ?? match[2]) : null;
}

function nonEmptyUniqueStrings(value, label, { allowEmpty = false } = {}) {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  if (!allowEmpty) assert.ok(value.length > 0, `${label} must not be empty`);
  value.forEach((entry, index) => {
    assert.equal(typeof entry, 'string', `${label}[${index}] must be a string`);
    assert.ok(entry.trim(), `${label}[${index}] must not be blank`);
  });
  assert.equal(new Set(value).size, value.length, `${label} contains duplicates`);
}

test('all shipped JavaScript parses', async () => {
  const scripts = [];
  for (const directory of [publicDir, docsDir]) {
    for (const relative of await filesBelow(directory)) {
      if (relative.endsWith('.js')) scripts.push(path.join(directory, relative));
    }
  }
  assert.ok(scripts.length > 0, 'No JavaScript files found');
  for (const script of scripts) {
    await assert.doesNotReject(
      execFileAsync(process.execPath, ['--check', script]),
      `Syntax check failed for ${path.relative(root, script)}`,
    );
  }
});

test('HTML IDs are unique and local ID references resolve', async () => {
  const referenceAttributes = ['for', 'aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-errormessage'];
  for (const directory of [publicDir, docsDir]) {
    for (const relative of (await filesBelow(directory)).filter((file) => file.endsWith('.html'))) {
      const file = path.join(directory, relative);
      const source = await readFile(file, 'utf8');
      const tags = htmlTags(source);
      const ids = new Map();

      for (const tag of tags) {
        const id = attribute(tag, 'id');
        if (!id) continue;
        ids.set(id, (ids.get(id) || 0) + 1);
      }

      const duplicates = [...ids].filter(([, count]) => count > 1).map(([id]) => id);
      assert.deepEqual(duplicates, [], `${path.relative(root, file)} has duplicate IDs`);

      for (const tag of tags) {
        for (const name of referenceAttributes) {
          const raw = attribute(tag, name);
          if (raw === null) continue;
          const references = name === 'for' ? [raw] : raw.trim().split(/\s+/).filter(Boolean);
          assert.ok(references.length > 0, `${path.relative(root, file)} has an empty ${name}`);
          for (const reference of references) {
            assert.ok(ids.has(reference), `${path.relative(root, file)}: ${name} references missing #${reference}`);
          }
        }
      }
    }
  }
});

test('delivery accessibility ownership stays explicit in source markup', async () => {
  for (const directory of [publicDir, docsDir]) {
    const file = path.join(directory, 'entrega.html');
    const source = await readFile(file, 'utf8');
    const tags = htmlTags(source);
    const liveRegions = tags.filter((tag) => attribute(tag, 'aria-live') !== null);
    assert.equal(liveRegions.length, 1, `${path.relative(root, file)} must have one live region`);
    assert.equal(attribute(liveRegions[0], 'id'), 'actionAnnouncer', 'The shared announcer must own live output');

    const noteTag = tags.find((tag) => attribute(tag, 'id') === 'noteContent');
    assert.ok(noteTag, `${path.relative(root, file)} lacks #noteContent`);
    assert.equal(attribute(noteTag, 'aria-live'), null, 'The full clinical note must not be a live region');

    const stepHeaders = tags.filter((tag) => /(?:^|\s)step-header(?:\s|$)/.test(attribute(tag, 'class') || ''));
    assert.ok(stepHeaders.length > 0, 'No PAE step headers were found');
    stepHeaders.forEach((tag) => {
      assert.equal(attribute(tag, 'role'), null, 'Inactive PAE headers must not claim button semantics in HTML');
      assert.equal(attribute(tag, 'tabindex'), null, 'Inactive PAE headers must not enter the tab order');
    });

    const lifecycle = source.indexOf('js/note-lifecycle.js');
    const core = source.indexOf('js/interaction-core.js');
    const fields = source.indexOf('js/nota-campos.js');
    const app = source.indexOf('js/app.js');
    assert.ok(lifecycle >= 0 && lifecycle < app, 'Lifecycle state must load before app.js');
    assert.ok(core >= 0 && core < fields && fields < app, 'Interaction scripts must preserve core → fields → app order');
  }
});

test('public and docs deploy trees are exact mirrors', async () => {
  const publicFiles = await filesBelow(publicDir);
  const docsFiles = await filesBelow(docsDir);
  assert.deepEqual(docsFiles, publicFiles, 'public/ and docs/ contain different file sets');
  for (const relative of publicFiles) {
    const [publicBytes, docsBytes] = await Promise.all([
      readFile(path.join(publicDir, relative)),
      readFile(path.join(docsDir, relative)),
    ]);
    assert.ok(publicBytes.equals(docsBytes), `Mirror mismatch: ${relative}`);
  }
});

test('the QA scenario injector is source-gated by ?qa=1', async () => {
  for (const directory of [publicDir, docsDir]) {
    const html = await readFile(path.join(directory, 'entrega.html'), 'utf8');
    const source = await readFile(path.join(directory, 'js', 'demo-escenarios.js'), 'utf8');
    const gate = /new URLSearchParams\(window\.location\.search\)\.get\(['"]qa['"]\)\s*!==\s*['"]1['"]\)\s*return\s*;/;
    assert.match(source, gate, `${path.basename(directory)} QA injector lacks an early ?qa=1 return gate`);
    assert.ok(source.indexOf('URLSearchParams') < source.indexOf('createElement'), 'QA gate must run before DOM injection');
    assert.match(html, /<script\s+src=["']js\/demo-escenarios\.js(?:\?[^"']*)?["'][^>]*><\/script>/i);
  }
});

test('clinical catalogs are internally coherent', async () => {
  const context = vm.createContext({ window: {} });
  for (const relative of ['js/app-data.js', 'js/nota-listas.js']) {
    const filename = path.join(publicDir, relative);
    vm.runInContext(await readFile(filename, 'utf8'), context, { filename });
  }

  const data = context.window.datosProPai;
  const catalog = context.window.notaListas;
  assert.ok(data && typeof data === 'object' && !Array.isArray(data), 'datosProPai is missing');
  assert.ok(catalog && typeof catalog === 'object', 'notaListas is missing');
  assert.ok(Array.isArray(catalog.areas) && catalog.areas.length > 0, 'notaListas.areas is empty');

  const areaKeys = catalog.areas.map((area) => area?.key);
  nonEmptyUniqueStrings(areaKeys, 'notaListas.areas keys');
  nonEmptyUniqueStrings(catalog.areas.map((area) => area?.label), 'notaListas.areas labels');
  assert.deepEqual([...areaKeys].sort(), Object.keys(data).sort(), 'Area catalog and PAE data keys diverge');

  let diagnosisCount = 0;
  for (const areaKey of areaKeys) {
    const diagnoses = data[areaKey];
    assert.ok(diagnoses && typeof diagnoses === 'object' && !Array.isArray(diagnoses), `${areaKey} diagnoses are invalid`);
    assert.ok(Object.keys(diagnoses).length > 0, `${areaKey} has no diagnoses`);
    for (const [diagnosisName, diagnosis] of Object.entries(diagnoses)) {
      diagnosisCount += 1;
      const prefix = `${areaKey} / ${diagnosisName}`;
      assert.ok(diagnosisName.trim(), `${areaKey} has a blank diagnosis name`);
      nonEmptyUniqueStrings(diagnosis.rc, `${prefix} rc`);
      nonEmptyUniqueStrings(diagnosis.ep, `${prefix} ep`, { allowEmpty: true });
      nonEmptyUniqueStrings(diagnosis.noc, `${prefix} noc`);
      nonEmptyUniqueStrings(diagnosis.nic, `${prefix} nic`);
      nonEmptyUniqueStrings(diagnosis.trans, `${prefix} trans`, { allowEmpty: true });
      assert.ok(diagnosis.b6_por_noc && typeof diagnosis.b6_por_noc === 'object', `${prefix} lacks B6 mappings`);
      assert.deepEqual(Object.keys(diagnosis.b6_por_noc).sort(), [...diagnosis.noc].sort(), `${prefix} NOC/B6 keys diverge`);
      for (const [noc, levels] of Object.entries(diagnosis.b6_por_noc)) {
        nonEmptyUniqueStrings(levels, `${prefix} B6 ${noc}`);
      }
    }
  }
  assert.ok(diagnosisCount > 0, 'No diagnoses were checked');

  assert.ok(catalog.listas && typeof catalog.listas === 'object', 'notaListas.listas is missing');
  for (const [name, values] of Object.entries(catalog.listas)) nonEmptyUniqueStrings(values, `notaListas.listas.${name}`);
  assert.ok(Array.isArray(catalog.escalas) && catalog.escalas.length > 0, 'No assessment scales found');
  for (const [index, scale] of catalog.escalas.entries()) {
    assert.ok(scale.nombre?.trim() && scale.corto?.trim(), `Scale ${index} lacks names`);
    assert.ok(Number.isFinite(scale.min) && Number.isFinite(scale.max) && scale.min <= scale.max, `Scale ${scale.corto} has invalid bounds`);
    if (scale.step !== undefined) {
      assert.ok(Number.isFinite(scale.step) && scale.step > 0, `Scale ${scale.corto} has an invalid step`);
    }
  }

  const fieldsSource = await readFile(path.join(publicDir, 'js', 'nota-campos.js'), 'utf8');
  const qaSource = await readFile(path.join(publicDir, 'js', 'demo-escenarios.js'), 'utf8');
  assert.doesNotMatch(fieldsSource, /\.step\s*\|\|\s*1/, 'Assessment fields must not replace valid decimal steps');
  assert.doesNotMatch(qaSource, /\.step\s*\|\|\s*1/, 'QA hydration must not replace valid decimal steps');
  assert.match(fieldsSource, /\.step\s*\?\?\s*1/, 'Assessment fields need a nullish step fallback');
});
