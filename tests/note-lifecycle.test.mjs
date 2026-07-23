import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public/js/note-lifecycle.js'), 'utf8');
const context = vm.createContext({ structuredClone, Date });
vm.runInContext(source, context, { filename: 'note-lifecycle.js' });
const Lifecycle = context.CareFlowNoteLifecycle;

function controllerAt(...dates) {
  let index = 0;
  return Lifecycle.create({ clock: () => new Date(dates[Math.min(index++, dates.length - 1)]) });
}

test('initial confirmation requires review and enables only confirmed copy', () => {
  const lifecycle = controllerAt('2026-07-23T08:15:00');
  assert.equal(lifecycle.getState().shiftDate, '23/07/2026');
  assert.equal(lifecycle.canCopy(), false);
  assert.equal(lifecycle.beginConfirmation(), false);
  assert.equal(lifecycle.openReview({ complete: true }), 'reviewingDraft');
  assert.equal(lifecycle.beginConfirmation(), 'confirmingDraft');
  assert.equal(lifecycle.completeConfirmation({
    confirmedAt: '2026-07-23T08:30:00.000Z',
    confirmationTime: '08:30:00',
    noteHtml: '<p>confirmada</p>',
    noteText: 'confirmada',
    formSnapshot: { patient: 1 },
  }), 'confirmed');
  assert.equal(lifecycle.canCopy(), true);
  assert.equal(lifecycle.getConfirmed().copied, false);
  assert.equal(lifecycle.hasExitRisk(), 'uncopied');
  assert.equal(lifecycle.markCopied(), true);
  assert.equal(lifecycle.hasExitRisk(), '');
});

test('editing blocks copy and discard restores the only confirmed version', () => {
  const lifecycle = controllerAt('2026-07-23T08:15:00');
  lifecycle.openReview({ complete: true });
  lifecycle.beginConfirmation();
  lifecycle.completeConfirmation({
    noteText: 'versión 1',
    formSnapshot: { nested: { value: 1 } },
  });
  lifecycle.markCopied();

  assert.equal(lifecycle.markChanged(), 'editing');
  assert.equal(lifecycle.canCopy(), false);
  assert.equal(lifecycle.hasExitRisk(), 'editing');
  assert.equal(lifecycle.openReview({ complete: true }), 'reviewingEdit');
  const restored = lifecycle.discardEditing();
  assert.equal(restored.noteText, 'versión 1');
  assert.equal(restored.copied, true);
  assert.equal(lifecycle.getState().phase, 'confirmed');
  assert.equal(lifecycle.canCopy(), true);
});

test('reconfirmation replaces rather than accumulates confirmed versions', () => {
  const lifecycle = controllerAt('2026-07-23T08:15:00');
  lifecycle.openReview({ complete: true });
  lifecycle.beginConfirmation();
  lifecycle.completeConfirmation({ noteText: 'versión 1', confirmationTime: '08:30:00' });
  lifecycle.markChanged();
  lifecycle.openReview({ complete: true });
  assert.equal(lifecycle.beginConfirmation(), 'confirmingEdit');
  lifecycle.completeConfirmation({ noteText: 'versión 2', confirmationTime: '09:45:00' });
  const state = lifecycle.getState();
  assert.equal(state.confirmed.noteText, 'versión 2');
  assert.equal(state.confirmed.confirmationTime, '09:45:00');
  assert.equal(state.confirmed.copied, false);
  assert.equal(Array.isArray(state.confirmed), false);
});

test('identity locks after confirmation and reset captures a new local date', () => {
  const lifecycle = controllerAt('2026-07-23T23:59:00', '2026-07-24T00:01:00');
  assert.equal(lifecycle.setIdentity({ type: 'cc', number: ' 123 ' }), true);
  assert.deepEqual(lifecycle.getState().identity, { type: 'cc', number: '123' });
  lifecycle.openReview({ complete: true });
  lifecycle.beginConfirmation();
  lifecycle.completeConfirmation({ noteText: 'confirmada' });
  assert.equal(lifecycle.setIdentity({ type: 'cc', number: '999' }), false);
  assert.equal(lifecycle.getState().identity.number, '123');
  lifecycle.reset();
  assert.equal(lifecycle.getState().shiftDate, '24/07/2026');
  assert.deepEqual(lifecycle.getState().identity, { type: '', number: '' });
});

test('lookup states are explicit and identity changes clear simulated results', () => {
  const lifecycle = controllerAt('2026-07-23T08:15:00');
  lifecycle.setIdentity({ type: 'birthCertificate', number: 'ABC' });
  assert.equal(lifecycle.setLookup('searching', 'Buscando'), true);
  assert.equal(lifecycle.setLookup('found', 'Demostración local'), true);
  lifecycle.setIdentity({ type: 'birthCertificate', number: 'ABD' });
  assert.equal(lifecycle.getState().lookup.status, 'idle');
  assert.equal(lifecycle.setLookup('unknown'), false);
});
