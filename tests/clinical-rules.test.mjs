import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public/js/clinical-rules.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context, { filename: 'clinical-rules.js' });
const clinical = context.CareFlowClinical;

function sampleScore(expression) {
  const text = expression.replace(/−/g, '-').replace(',', '.').replace(/[+]/g, '')
    .replace(/\s*\([^)]*\)\s*$/, '').trim();
  let match = text.match(/^(-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)$/);
  if (match) return (Number(match[1]) + Number(match[2])) / 2;
  match = text.match(/^≥\s*(-?\d+(?:\.\d+)?)$/);
  if (match) return Number(match[1]);
  match = text.match(/^≤\s*(-?\d+(?:\.\d+)?)$/);
  if (match) return Number(match[1]);
  match = text.match(/^<\s*(-?\d+(?:\.\d+)?)$/);
  if (match) return Number(match[1]) - 1;
  match = text.match(/^>\s*(-?\d+(?:\.\d+)?)$/);
  if (match) return Number(match[1]) + 1;
  return Number(text);
}

test('the generated clinical source preserves the authorized workbook inventory', () => {
  assert.equal(clinical.source.sha256, '6d45de79d248f9902d0db9592bb18721704cfcda2383de2213ffd0b3f8d23b47');
  assert.equal(clinical.source.sheets.length, 9);
  assert.equal(clinical.scales.length, 28);
  assert.equal(clinical.devices.length, 49);
  assert.equal(clinical.devices.reduce((total, device) => total + device.statuses.length, 0), 382);
  assert.equal(clinical.pendingRules.length, 90);
  assert.equal(clinical.pendingRules.filter((rule) => rule.priority === 'Alta').length, 57);
  assert.equal(clinical.pendingRules.filter((rule) => rule.priority === 'Media').length, 33);
  assert.equal(clinical.unassignedFlatStatusAliases.length, 11);
});

test('all documented scale categories resolve in both directions', () => {
  for (const scale of clinical.scales) {
    assert.ok(scale.id && scale.name && scale.short);
    if (scale.captureMode === 'manual') {
      assert.equal(scale.id, 'isaac');
      assert.equal(scale.min, null);
      assert.equal(scale.max, null);
      assert.equal(clinical.resolveScaleMeaning(scale.id, 12), null);
      continue;
    }
    assert.ok(scale.mappings.length > 0, `${scale.short} has no source categories`);
    for (const mapping of scale.mappings) {
      const score = sampleScore(mapping.score);
      const resolved = clinical.resolveScaleMeaning(scale.id, score);
      assert.equal(resolved?.meaning, mapping.meaning, `${scale.short} / ${mapping.score}`);
      const reverse = clinical.resolveScaleSelection(scale.id, mapping.meaning);
      assert.equal(reverse?.range, mapping.score);
    }
  }
  assert.equal(clinical.getScale('maddox').max, 4);
  assert.equal(clinical.getScale('mna').max, 30);
  assert.equal(clinical.resolveScaleMeaning('mna', 20), null);
});

test('Glasgow enforces strict boundaries and preserves documented exceptions', () => {
  assert.equal(clinical.validateGlasgowNeuro({
    score: 15,
    neurologicalState: '',
  }).forcedState, 'Alerta y orientado en tiempo, lugar y persona');
  assert.equal(clinical.validateGlasgowNeuro({
    score: 15,
    neurologicalState: 'Confuso / agitado',
  }).valid, false);
  assert.equal(clinical.validateGlasgowNeuro({
    score: 13,
    neurologicalState: 'Confuso / agitado',
  }).forcedState, '');
  assert.ok(clinical.validateGlasgowNeuro({
    score: 13,
    neurologicalState: 'Confuso / agitado',
  }).compatibleStates.length > 1);
  assert.equal(clinical.validateGlasgowNeuro({ score: 7 }).forcedState, 'Coma moderado – Glasgow 6–8');
  assert.equal(clinical.validateGlasgowNeuro({ score: 4 }).forcedState, 'Coma profundo – Glasgow < 6');
  assert.equal(clinical.validateGlasgowNeuro({
    noEvaluable: true,
    neurologicalState: '',
  }).forcedState, 'Sedoanalgesiado – escala Ramsay / RASS');
  assert.equal(clinical.validateGlasgowNeuro({
    score: 15,
    neurologicalState: 'Afásico con comprensión conservada',
  }).valid, true);
  assert.ok(clinical.validateGlasgowNeuro({
    score: '',
    range: '9–12',
    neurologicalState: 'Coma superficial – Glasgow 9–12',
  }).valid);
});

test('respiratory requirements expose only source-backed devices and parameters', () => {
  assert.equal(clinical.respiratory.length, 15);
  const highFlow = clinical.getRespiratoryRequirement('Oxigenoterapia de alto flujo (OAF / Optiflow)');
  assert.equal(highFlow.autoDevice, 'Cánula de alto flujo (OAF/Optiflow)');
  assert.deepEqual(
    Array.from(highFlow.fields, (field) => [field.id, field.min, field.max]),
    [['fio2', 21, 100], ['flujo', 10, 60]],
  );
  const invasive = clinical.getRespiratoryRequirement('Ventilación mecánica invasiva – modo SIMV');
  assert.equal(invasive.requiresOneOf.length, 3);
  assert.equal(invasive.autoDevice, undefined);
  assert.equal(clinical.getRespiratoryRequirement('Destete / weaning ventilatorio en progreso').fields.length, 0);
});

test('every device has typed parameters, specific unique states and stable IDs', () => {
  const deviceIds = new Set();
  const statusIds = new Set();
  for (const device of clinical.devices) {
    assert.ok(!deviceIds.has(device.id), `duplicate device id ${device.id}`);
    deviceIds.add(device.id);
    assert.ok(device.fields.length > 0, `${device.name} has no parameters`);
    assert.ok(device.frequency);
    assert.ok(device.sourceParameter);
    assert.ok(device.statuses.length > 0, `${device.name} has no statuses`);
    for (const status of device.statuses) {
      assert.ok(!statusIds.has(status.id), `duplicate status id ${status.id}`);
      statusIds.add(status.id);
    }
  }
  assert.equal(clinical.getDevice('Catéter venoso periférico (CVP)').fields.some((field) => field.id === 'fechaInsercion'), true);
  assert.equal(clinical.getDevice('Cánula de Guedel').fields.some((field) => field.id === 'fechaInsercion'), false);
  assert.equal(clinical.getDevice('Bomba de infusión de medicamentos').fields[0].type, 'repeatable');
});

test('parameter validation enforces source ranges, options, dates and conditional Maddox limits', () => {
  for (const device of clinical.devices) {
    for (const field of device.fields) {
      assert.equal(clinical.validateParameterValue(field, '', {}).valid, false, `${device.name} / ${field.label}`);
      if (field.allowNotApplicable) assert.equal(clinical.validateParameterValue(field, 'No aplica', {}).valid, true);
      else assert.equal(clinical.validateParameterValue(field, 'No aplica', {}).valid, false);
      if (field.type === 'select') {
        assert.equal(clinical.validateParameterValue(field, field.options[0], {}).valid, true);
        assert.equal(clinical.validateParameterValue(field, '__invalid__', {}).valid, false);
      }
    }
  }
  const cvp = clinical.getDevice('Catéter venoso periférico (CVP)');
  const grade = cvp.fields.find((field) => field.id === 'gradoFlebitis');
  assert.equal(clinical.validateParameterValue(grade, 5, { escalaFlebitis: 'Maddox' }).valid, false);
  assert.equal(clinical.validateParameterValue(grade, 4, { escalaFlebitis: 'Maddox' }).valid, true);
  assert.equal(clinical.validateParameterValue(grade, 5, { escalaFlebitis: 'VIP' }).valid, true);
  assert.equal(clinical.validateParameterValue({ type: 'date', required: true }, '2026-02-29').valid, false);
  assert.equal(clinical.validateParameterValue({ type: 'date', required: true }, '2024-02-29').valid, true);
});

test('all 90 pending rules link explicitly to valid device-specific state IDs', () => {
  const validStatusIds = new Set(clinical.devices.flatMap((device) => device.statuses.map((status) => status.id)));
  for (const rule of clinical.pendingRules) {
    assert.ok(rule.statusIds.length > 0, `pending row ${rule.sourceRow} is unlinked`);
    rule.statusIds.forEach((id) => assert.ok(validStatusIds.has(id), `${rule.id} points to ${id}`));
  }
  const cvp = clinical.getDevice('Catéter venoso periférico (CVP)');
  const phlebitis = cvp.statuses.find((status) => status.label.startsWith('Flebitis grado II'));
  const generated = clinical.getGeneratedPendings(cvp.id, phlebitis.id);
  assert.ok(generated.some((pending) => pending.sourceRow === 6));
  assert.ok(generated.every((pending) => ['Alta', 'Media'].includes(pending.priority)));
});

test('education rules allow repetition and report only documented incompatibilities', () => {
  const repeated = [
    { id: '1', recipient: 'Paciente', topic: 'Tema A' },
    { id: '2', recipient: 'Paciente', topic: 'Tema B', noCompanion: true },
  ];
  assert.deepEqual(Array.from(clinical.validateEducation(repeated)), []);
  assert.ok(clinical.validateEducation([
    ...repeated,
    { id: '3', recipient: 'No fue posible brindar educación – paciente sin condiciones' },
  ]).some((issue) => issue.code === 'patient-condition-conflict'));
  assert.ok(clinical.validateEducation([
    { id: '4', recipient: 'Paciente y familiar', topic: 'Mismo tema' },
    { id: '5', recipient: 'Paciente', topic: 'Mismo tema' },
  ]).some((issue) => issue.type === 'warning'));
  assert.ok(clinical.validateEducation([
    { id: '6', recipient: 'Sin acompañante', standaloneNoCompanion: true },
    { id: '7', recipient: 'Familiar directo (cónyuge / padre / madre / hijo/a)', topic: 'Tema' },
  ]).some((issue) => issue.code === 'standalone-no-companion-conflict'));
  assert.ok(clinical.validateEducation([
    { id: '8', destinatario: 'Paciente', tema: 'Tema' },
    { id: '9', destinatario: 'No fue posible brindar educación – paciente sin condiciones' },
  ]).some((issue) => issue.code === 'patient-condition-conflict'));
});
