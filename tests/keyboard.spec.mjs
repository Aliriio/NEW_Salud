import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

const QA_NOTE_FINGERPRINTS = [
  '5eccbc1bd26bd402a395a88137df2c145c751024649aafe0f040220179f8f635',
  'b17c35aa2196d3f6af3eb14376cb7959d3e2c168c9210201faf954f94f03b34a',
  '572f27624f890c9343dfecb70ef45a060a24dfc6e24df45f9f184d94b9c10797',
  'fc48325f40f71c610cef2c7dc6f94805678ac961da3254dd530a50b8e473382e',
];
const measuringLegacyBaseline = process.env.STATIC_ROOT === 'docs';
const printExpertMetrics = process.env.PRINT_EXPERT_METRICS === '1';
const navigationModeKey = 'cf_keyboard_navigation_mode';

async function authenticate(page) {
  await page.goto('/login.html');
  await page.evaluate(() => {
    sessionStorage.setItem('cf_auth', '1');
    sessionStorage.setItem('cf_user', 'demo@santafe.com');
  });
}

async function openDelivery(page, { qa = true, navigationMode = 'agile' } = {}) {
  await authenticate(page);
  await page.evaluate(({ key, mode }) => {
    if (mode == null) localStorage.removeItem(key);
    else localStorage.setItem(key, mode);
  }, { key: navigationModeKey, mode: navigationMode });
  await page.goto(`/entrega.html${qa ? '?qa=1' : ''}`);
  await expect(page.locator('#deliveryWorkflow')).toBeVisible();
}

async function loadQaScenario(page) {
  const injector = page.locator('#demoEscenariosBtn');
  await expect(injector).toBeVisible();
  await injector.click();
  await expect(page.locator('#noteSection')).toHaveJSProperty('open', true);
}

async function closeReview(page) {
  const review = page.locator('#noteSection');
  if (await review.evaluate((dialog) => dialog.open)) {
    await page.locator('#noteDrawerClose').click();
    await expect(review).toHaveJSProperty('open', false);
    await expect(page.locator('#demoEscenariosBtn')).toBeFocused();
  }
}

async function confirmOpenReview(page) {
  const confirm = page.locator('#drawerConfirmBtn');
  await expect(confirm).toBeVisible();
  await expect(page.locator('#drawerCopyBtn')).toBeHidden();
  await confirm.click();
  await expect(page.locator('#previewDraftState')).toHaveText('Confirmada');
  await expect(page.locator('#drawerCopyBtn')).toBeVisible();
  await expect(page.locator('#drawerCopyBtn')).toBeEnabled();
}

async function loadCompleteQa(page, options = {}) {
  await openDelivery(page, options);
  await loadQaScenario(page);
  await closeReview(page);
}

async function completePatientThroughUi(page) {
  await page.locator('#patientIdType').selectOption('cc');
  await page.locator('#patientIdNumber').fill('123456789');
  const sex = page.locator('#sexoSeg [role="radio"]').first();
  await sex.focus();
  await sex.press('Enter');
  await page.locator('#dobFecha').fill('01/01/1990');
  await page.locator('#dobFecha').press('Enter');
  await page.locator('#posicion').fill('Decúbito supino (dorsal)');
  await page.locator('#posicion').press('Enter');
  await page.locator('#numCama').fill('12');
  await page.locator('#numCama').press('Enter');
  await page.locator('#numHabitacion').fill('304');
  await page.locator('#numHabitacion').press('Enter');
  await page.locator('#servicio').fill('Medicina Interna');
  await page.locator('#servicio').press('Enter');
  await expect(page.locator('[data-flow-continue="patient"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#faseB')).toBeVisible();
  await expect(page.locator('#estadoNeurologico')).toBeFocused();
}

async function dispatchPrintable(page, key, modifiers = {}) {
  await page.evaluate(({ character, flags }) => {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
      key: character,
      bubbles: true,
      cancelable: true,
      ...flags,
    }));
  }, { character: key, flags: modifiers });
}

async function dispatchAltGraph(page, key) {
  await page.evaluate((character) => {
    const event = new KeyboardEvent('keydown', {
      key: character,
      ctrlKey: true,
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'getModifierState', {
      value: (modifier) => modifier === 'AltGraph',
    });
    document.activeElement?.dispatchEvent(event);
  }, key);
}

async function activeFieldId(page) {
  return page.evaluate(() => document.activeElement?.closest?.('[data-field-id]')?.dataset.fieldId || '');
}

async function catalogFirst(page, key) {
  return page.evaluate((catalogKey) => window.notaListas?.listas?.[catalogKey]?.[0] || '', key);
}

async function addAssessmentScale(page, scaleName) {
  const search = page.locator('#escalasPicker-search');
  await search.fill(scaleName);
  await expect(page.locator('#escalasPicker-listbox .cbx-opt')).toHaveCount(1);
  await search.press('Enter');
  await expect.poll(() => page.evaluate((name) => (
    window.NotaCampos.state.escalas.some((scale) => scale.nombre === name)
  ), scaleName), { message: `La escala ${scaleName} no se agregó desde el selector` }).toBe(true);
}

async function paeChoiceWithoutEp(page) {
  return page.evaluate(() => {
    for (const area of window.notaListas?.areas || []) {
      for (const [diagnosis, data] of Object.entries(window.datosProPai?.[area.key] || {})) {
        if ((data.rc || []).length && !(data.ep || []).length && (data.noc || []).length && (data.nic || []).length) {
          return { area: area.label, diagnosis };
        }
      }
    }
    return null;
  });
}

async function recoverCompositeFocusWithTab(page, selectors) {
  for (let count = 0; count < 30; count += 1) {
    const inside = await page.evaluate((candidateSelectors) => candidateSelectors.some((selector) => (
      document.activeElement?.matches?.(selector)
    )), selectors);
    if (inside) return true;
    await page.keyboard.press('Tab');
  }
  return false;
}

async function completeMinimumNoteWithKeyboard(page) {
  const idType = page.locator('#patientIdType');
  await expect(idType).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#patientIdNumber')).toBeFocused();
  await page.keyboard.insertText('123456789');
  await page.keyboard.press('Enter');
  const firstSex = page.locator('#sexoSeg [role="radio"]').first();
  await expect(firstSex).toBeFocused();
  await expect(page.locator('#patientContextPanel')).toHaveAttribute('data-lookup-status', 'integrationPending');
  await page.keyboard.press('Enter');
  await expect(page.locator('#dobFecha')).toBeFocused();
  await page.keyboard.insertText('01011990');
  await page.keyboard.press('Enter');
  await expect(page.locator('#posicion')).toBeFocused();
  await page.keyboard.insertText('decubito supino (dorsal)');
  await page.keyboard.press('Enter');
  await expect(page.locator('#numCama')).toBeFocused();
  await page.keyboard.insertText('12');
  await page.keyboard.press('Enter');
  await expect(page.locator('#numHabitacion')).toBeFocused();
  await page.keyboard.insertText('304');
  await page.keyboard.press('Enter');
  await expect(page.locator('#servicio')).toBeFocused();
  await page.keyboard.insertText('Medicina Interna');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-flow-continue="patient"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#estadoNeurologico')).toBeFocused();

  const states = [
    ['NEURO', '#estadoHemodinamico'],
    ['HEMO', '#estadoRespiratorio'],
    ['RESP', '#escalasPicker-search'],
  ];
  for (const [key, next] of states) {
    await page.keyboard.insertText(await catalogFirst(page, key));
    await page.keyboard.press('Enter');
    await expect(page.locator(next)).toBeFocused();
  }
  await expect(page.locator('#escalasPicker-search')).toBeFocused();
  await page.keyboard.press(measuringLegacyBaseline ? 'Tab' : 'ArrowRight');
  await expect(page.locator('#sinEscalasBtn')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-flow-continue="faseB"]')).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.locator('#diagnosticoMedico')).toBeFocused();
  await page.keyboard.insertText('Diagnóstico médico sintético');
  await page.keyboard.press('Enter');
  await expect(page.locator('#aislamiento')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#estadoDental')).toBeFocused();
  await page.keyboard.insertText(await catalogFirst(page, 'DENTAL'));
  await page.keyboard.press('Enter');
  await expect(page.locator('#dispositivosPicker-search')).toBeFocused();
  await page.keyboard.press(measuringLegacyBaseline ? 'Tab' : 'ArrowRight');
  await expect(page.locator('#sinDispositivosBtn')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-flow-continue="faseC"]')).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.locator('#regionesPicker-search')).toBeFocused();
  await page.keyboard.press(measuringLegacyBaseline ? 'Tab' : 'ArrowRight');
  await expect(page.locator('#sinAlteracionesBtn')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#eduQuick .edu-quick-btn').first()).toBeFocused();
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('[data-flow-continue="faseD"]')).toBeFocused();
  await page.keyboard.press('Enter');

  const areaSearch = page.locator('#searchAreas');
  if (!await areaSearch.evaluate((element) => element === document.activeElement)) {
    await expect(page.locator('#routeSwitch [role="radio"][aria-checked="true"]')).toBeFocused();
    await page.keyboard.press('Tab');
  }
  await expect(areaSearch).toBeFocused();
  const choice = await paeChoiceWithoutEp(page);
  expect(choice).not.toBeNull();
  await page.keyboard.insertText(choice.area);
  await page.keyboard.press('Enter');
  await expect(page.locator('#step2')).toHaveClass(/active/);
  await page.keyboard.insertText(choice.diagnosis);
  await page.keyboard.press('Enter');
  await expect(page.locator('#step3')).toHaveClass(/active/);
  await expect(page.locator('#step4')).toBeHidden();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(page.locator('#rcConfirmBtn')).toBeEnabled();
  if (measuringLegacyBaseline) {
    expect(await recoverCompositeFocusWithTab(page, ['#searchRc', '#rcList .option'])).toBe(true);
  }
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('#step5')).toHaveClass(/active/);
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  if (measuringLegacyBaseline) {
    expect(await recoverCompositeFocusWithTab(page, ['#searchNic', '#intervenciones .option'])).toBe(true);
  }
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Enter');

  await expect(page.locator('#respuestaIntervenciones')).toBeFocused();
  await page.keyboard.insertText('Respuesta favorable al cuidado');
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('#tendenciaEvolutiva')).toBeFocused();
  await page.keyboard.insertText(await catalogFirst(page, 'TENDENCIA'));
  await page.keyboard.press('Enter');
  await expect(page.locator('#metaSeg [role="radio"][tabindex="0"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#criterioClinico')).toBeFocused();
  await page.keyboard.insertText('Objetivo clínico alcanzado');
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('#pendientes')).toBeFocused();
  await page.keyboard.insertText('Continuar vigilancia clínica');
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('#otrosComentarios')).toBeFocused();
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('#noteSection')).toHaveJSProperty('open', true);
}

async function resetSection(page, sectionId) {
  await page.locator(`[data-reset-section="${sectionId}"]`).click();
  await expect(page.locator('#resetDialog')).toHaveJSProperty('open', true);
  await page.locator('#resetSectionBtn').click();
  await expect(page.locator('#resetDialog')).toHaveJSProperty('open', false);
}

async function preparePaeAtRc(page, options = {}) {
  await loadCompleteQa(page, options);
  await page.locator('#flowTabFasePAE').click();
  await resetSection(page, 'fasePAE');

  await page.locator('#areas [role="gridcell"]:not(.option--add)').first().click();
  await expect(page.locator('#step2')).toHaveClass(/active/);

  await page.locator('#diagnosticos [role="gridcell"]:not(.option--add)').first().click();
  await expect(page.locator('#step3')).toHaveClass(/active/);
}

async function installClipboardStub(page, mode) {
  await page.addInitScript((selectedMode) => {
    window.__clipboardCalls = 0;
    window.__clipboardText = '';
    window.__execCalls = 0;
    window.__fallbackText = '';

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: ['absent', 'fallback-success'].includes(selectedMode) ? undefined : {
        writeText: async (text) => {
          window.__clipboardCalls += 1;
          window.__clipboardText = text;
          if (selectedMode === 'reject') throw new Error('denied');
        },
      },
    });

    document.execCommand = (command) => {
      window.__execCalls += 1;
      window.__fallbackText = document.activeElement?.value || '';
      return command === 'copy' && selectedMode === 'fallback-success';
    };
  }, mode);
}

async function noteFingerprint(page) {
  const snapshot = await page.evaluate(() => {
    const note = document.getElementById('noteContent');
    const html = note.innerHTML
      .replace(/(<strong>Fecha:<\/strong>)\s*\d{2}\/\d{2}\/\d{4}\s*&nbsp;\s*(<strong>Hora:<\/strong>)\s*[^<]+/, '$1 &lt;DATE&gt; &nbsp; $2 &lt;TIME&gt;')
      .replace(/(Se entrega paciente <strong>.*?<\/strong>, de )<strong>.*?<\/strong>( de edad,)/, '$1<strong>&lt;AGE&gt;</strong>$2')
      .trim();
    const text = noteToPlainText(note)
      .replace(/Fecha:\s*\d{2}\/\d{2}\/\d{4}\s+Hora:\s*[^\n]+/, 'Fecha: <DATE> Hora: <TIME>')
      .replace(/(Se entrega paciente .*?, de ).*?( de edad,)/, '$1<AGE>$2')
      .trim();
    return `${html}\n---TEXT---\n${text}`;
  });
  return createHash('sha256').update(snapshot).digest('hex');
}

test('QA controls only mount with ?qa=1', async ({ page }) => {
  await openDelivery(page, { qa: false });
  await expect(page.locator('#demoEscenariosBtn')).toHaveCount(0);
  await expect(page.locator('#demoPatientLookup')).toHaveCount(0);

  await page.goto('/entrega.html?qa=1');
  await expect(page.locator('#demoEscenariosBtn')).toBeVisible();
  await expect(page.locator('#demoPatientLookup')).toBeVisible();
});

test('patient identity is required and verification runs silently when the number loses focus', async ({ page }) => {
  await openDelivery(page, { qa: false });
  expect(await page.evaluate(() => typeof window.CareFlowQaPatientLookup)).toBe('undefined');
  await expect(page.locator('#shiftDate')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Buscar paciente' })).toHaveCount(0);
  await expect(page.locator('#patientLookupStatus')).toHaveCount(0);

  await page.locator('#flowTabPatient').press('Control+Enter');
  await expect(page.locator('#noteSection')).toHaveJSProperty('open', false);
  await expect(page.locator('#patientIdType')).toBeFocused();

  await page.locator('#patientIdType').selectOption('liveBirthCertificate');
  await page.locator('#patientIdNumber').fill('CNV-2026-001');
  await page.locator('#sexoSeg [role="radio"]').first().focus();
  await expect(page.locator('#patientContextPanel')).toHaveAttribute('data-lookup-status', 'integrationPending');

  await page.locator('#numCama').fill('22');
  await expect(page.locator('#patientContextPanel')).toHaveAttribute('data-lookup-status', 'integrationPending');
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([navigationModeKey]);
});

test('future patient lookup states remain inspectable only through QA controls', async ({ page }) => {
  await openDelivery(page);
  const selector = page.locator('#demoPatientLookupState');
  const context = page.locator('#patientContextPanel');

  for (const value of ['idle', 'searching', 'found', 'notFound', 'error']) {
    await selector.selectOption(value);
    await expect(context).toHaveAttribute('data-lookup-status', value);
  }
  await expect(page.locator('#patientRegisterPending')).toHaveCount(0);
});

test('confirmed identity locks and an incomplete pending edition can be discarded exactly', async ({ page }) => {
  await openDelivery(page);
  await loadQaScenario(page);
  const originalPending = await page.locator('#pendientes').inputValue();
  await confirmOpenReview(page);
  await expect(page.locator('#noteContent')).not.toContainText('Pendiente de confirmación');
  const confirmedHtml = await page.locator('#noteContent').innerHTML();
  await expect(page.locator('#patientIdType')).toBeDisabled();
  await expect(page.locator('#patientIdNumber')).toHaveAttribute('readonly', '');
  await closeReview(page);

  await page.locator('#flowTabFaseF').click();
  await page.locator('#pendientes').fill('');
  await expect(page.locator('#noteStatus')).toContainText('Pendiente: Pendientes para el siguiente turno');
  await expect(page.locator('#workflowDiscardBtn')).toBeVisible();
  await expect(page.locator('#drawerCopyBtn')).toBeHidden();

  await page.locator('#workflowDiscardBtn').click();
  await expect(page.locator('#dependentChangeDialog')).toHaveJSProperty('open', true);
  await page.locator('[data-dependent-confirm]').click();
  await expect(page.locator('#dependentChangeDialog')).toHaveJSProperty('open', false);
  await expect(page.locator('#pendientes')).toHaveValue(originalPending);
  await expect(page.locator('#noteStatus')).toContainText('Nota confirmada');

  await page.locator('#noteToggleBtn').click();
  await expect(page.locator('#drawerCopyBtn')).toBeEnabled();
  expect(await page.locator('#noteContent').innerHTML()).toBe(confirmedHtml);
});

test('six-tab stepper uses roving focus with manual activation', async ({ page }) => {
  await openDelivery(page);
  await loadQaScenario(page);
  await closeReview(page);

  const tabs = page.locator('#flowNav [role="tab"]');
  await expect(tabs).toHaveCount(6);
  await expect(page.locator('#flowNav [role="tab"]:not([disabled])')).toHaveCount(6);

  const first = tabs.nth(0);
  const second = tabs.nth(1);
  await first.focus();
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('ArrowRight');
  await expect(second).toBeFocused();
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(second).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('#flowNav [role="tab"][tabindex="0"]')).toHaveCount(1);

  await page.keyboard.press('Enter');
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#faseB')).toBeVisible();
});

test('smart entry focuses only useful pending controls and opens their choices', async ({ page }) => {
  await openDelivery(page, { qa: false });
  await expect(page.locator('#patientIdType')).toBeFocused();
  await expect(page.locator('#patientBlockTitle')).not.toHaveAttribute('tabindex', /.+/);
  await expect(page.locator('.obs-info')).not.toHaveAttribute('tabindex', /.+/);
  await expect(page.locator('#otrosComentarios')).toHaveAttribute('aria-describedby', 'otrosComentariosHelp');

  await completePatientThroughUi(page);
  await expect(page.locator('#faseB')).toBeVisible();
  await expect(page.locator('#estadoNeurologico')).toBeFocused();
  await expect(page.locator('#estadoNeurologico')).toHaveAttribute('aria-expanded', 'true');

  const paeTab = page.locator('#flowTabFasePAE');
  await paeTab.focus();
  await paeTab.press('Enter');
  await expect(page.locator('#searchAreas')).toBeFocused();
  await expect(page.locator('#areas')).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#routeSwitch [role="radio"][aria-checked="true"]')).toBeFocused();
});

test('Tab alternates the current field and section navigator while Shift+Tab stays native', async ({ page, browserName }) => {
  await openDelivery(page, { qa: false });
  const idType = page.locator('#patientIdType');
  await expect(idType).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#flowTabPatient')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(idType).toBeFocused();

  await completePatientThroughUi(page);
  const neuro = page.locator('#estadoNeurologico');
  await expect(neuro).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(page.locator('#flowTabFaseB')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(neuro).toBeFocused();
  await expect(neuro).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Shift+Tab');
  // WebKit headless follows the macOS keyboard-access preference and can skip
  // buttons. Safari real is checked with Full Keyboard Access in the manual matrix.
  if (browserName !== 'webkit') await expect(page.locator('#shortcutsBtn')).toBeFocused();
});

test('Tab from a tentatively focused section enters its first useful field', async ({ page }) => {
  await openDelivery(page, { qa: false });
  await completePatientThroughUi(page);
  await page.keyboard.press('Tab');
  await expect(page.locator('#flowTabFaseB')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#flowTabFaseC')).toBeFocused();
  await expect(page.locator('#faseB')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('#faseC')).toBeVisible();
  await expect(page.locator('#diagnosticoMedico')).toBeFocused();
});

test('Tab return restores a multiselect query, popup and exact field', async ({ page }) => {
  await loadCompleteQa(page);
  await page.locator('#flowTabFaseB').click();
  const search = page.locator('#escalasPicker-search');
  await search.focus();
  await search.fill('gla');
  await page.keyboard.press('Tab');
  await expect(page.locator('#flowTabFaseB')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('gla');
  await expect(search).toHaveAttribute('aria-expanded', 'true');
});

test('typing from a tentatively focused tab stays in the active section', async ({ page }) => {
  await openDelivery(page, { qa: false });
  await completePatientThroughUi(page);
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#flowTabFaseC')).toBeFocused();
  await dispatchPrintable(page, 'ñ');
  await expect(page.locator('#estadoNeurologico')).toBeFocused();
  await expect(page.locator('#estadoNeurologico')).toHaveValue('ñ');
  await expect(page.locator('#faseB')).toBeVisible();
  await expect(page.locator('#faseC')).toBeHidden();
});

test('review actions exist in the accessible flow only for a complete note', async ({ page }) => {
  await openDelivery(page);
  await expect(page.locator('#noteToggleBtn')).toBeHidden();
  await expect(page.locator('#copyBtn')).toBeHidden();
  await loadQaScenario(page);
  await closeReview(page);
  await expect(page.locator('#noteToggleBtn')).toBeVisible();
  await expect(page.locator('#copyBtn')).not.toHaveAttribute('hidden', '');
});

test('expert minimum note completes through the real UI with keyboard only', async ({ page }) => {
  test.setTimeout(60_000);
  await openDelivery(page, { qa: false });
  await page.evaluate(() => window.CareFlowMetrics.reset());
  await completeMinimumNoteWithKeyboard(page);

  const result = await page.evaluate(() => {
    const snapshot = window.CareFlowMetrics.snapshot();
    return {
      pointerActions: snapshot.events.filter((event) => event.type === 'pointer-action').length,
      tabs: snapshot.events.filter((event) => event.type === 'keyboard-action' && event.action === 'tab').length,
      keyboardActions: snapshot.events.filter((event) => event.type === 'keyboard-action').length,
      focusTransitions: snapshot.events.filter((event) => event.type === 'focus-transition').length,
      unexpectedBody: document.activeElement === document.body,
      complete: !document.getElementById('copyBtn').disabled,
    };
  });
  if (measuringLegacyBaseline || printExpertMetrics) {
    console.log(`${measuringLegacyBaseline ? 'LEGACY_KEYBOARD_BASELINE' : 'CURRENT_KEYBOARD_METRICS'} ${JSON.stringify(result)}`);
  }
  expect(result.pointerActions).toBe(0);
  expect(result.unexpectedBody).toBe(false);
  expect(result.complete).toBe(true);
  if (!measuringLegacyBaseline) expect(result.tabs).toBe(0);
});

test('shortcuts stay scoped to the delivery surface and active dialog', async ({ page }) => {
  await openDelivery(page);

  await page.locator('[data-cf-avatar]').focus();
  await page.keyboard.press('Shift+/');
  await expect(page.locator('#shortcutsDialog')).toHaveJSProperty('open', false);

  await page.locator('#flowTabPatient').focus();
  await page.keyboard.press('Shift+/');
  await expect(page.locator('#shortcutsDialog')).toHaveJSProperty('open', true);
  await expect(page.locator('#shortcutsDialog')).toContainText('Ayuda de teclado');

  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#shortcutsDialog')).toHaveJSProperty('open', true);
  await expect(page.locator('#noteSection')).toHaveJSProperty('open', false);
  await page.keyboard.press('Escape');
  await expect(page.locator('#shortcutsDialog')).toHaveJSProperty('open', false);
  await expect(page.locator('#flowTabPatient')).toBeFocused();
});

test('navigation mode defaults safely, updates help without clinical changes and persists', async ({ page }) => {
  await loadCompleteQa(page, { navigationMode: null });
  const before = await page.evaluate(() => ({
    state: JSON.stringify(window.NotaCampos.state),
    note: document.getElementById('noteContent').innerHTML,
  }));

  const opener = page.locator('#shortcutsBtn');
  await opener.click();
  const modeSwitch = page.locator('#keyboardNavigationMode');
  await expect(modeSwitch).toHaveAttribute('role', 'switch');
  await expect(modeSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#keyboardNavigationModeCurrent')).toHaveText('Estándar activo');
  await expect(page.locator('#shortcutsSpatialRow')).toBeHidden();
  await modeSwitch.click();
  await expect(modeSwitch).toBeFocused();
  await expect(modeSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#keyboardNavigationModeCurrent')).toHaveText('Ágil activo');
  await expect(page.locator('#shortcutsSpatialRow')).toBeVisible();
  await expect(page.locator('#keyboardNavigationModeDescription')).toContainText('Shift + flechas cambia de campo');
  await expect(page.locator('#actionAnnouncer')).toContainText('Navegación Ágil activada');
  expect(await page.evaluate(() => localStorage.getItem('cf_keyboard_navigation_mode'))).toBe('agile');
  expect(await page.evaluate(() => ({
    state: JSON.stringify(window.NotaCampos.state),
    note: document.getElementById('noteContent').innerHTML,
  }))).toEqual(before);

  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await page.reload();
  await expect(page.locator('#deliveryWorkflow')).toBeVisible();
  await page.locator('#shortcutsBtn').click();
  await expect(page.locator('#keyboardNavigationMode')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#shortcutsSpatialRow')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('cf_keyboard_navigation_mode', 'valor-invalido'));
  await page.reload();
  await page.locator('#shortcutsBtn').click();
  await expect(page.locator('#keyboardNavigationMode')).toHaveAttribute('aria-checked', 'false');
});

test('standard keeps native Shift+arrows and Agile reserves them for spatial navigation', async ({ page }) => {
  await loadCompleteQa(page, { navigationMode: 'standard' });
  await page.locator('#flowTabPatient').click();
  const bed = page.locator('#numCama');
  const room = page.locator('#numHabitacion');
  await bed.focus();
  await bed.evaluate((input) => input.setSelectionRange(1, 1));
  await bed.press('Shift+ArrowRight');
  await expect(bed).toBeFocused();
  expect(await bed.evaluate((input) => [input.selectionStart, input.selectionEnd])).toEqual([1, 2]);
  await bed.press('Tab');
  await expect(room).toBeFocused();

  await page.locator('#shortcutsBtn').click();
  await page.locator('#keyboardNavigationMode').click();
  await page.keyboard.press('Escape');
  await bed.focus();
  await bed.evaluate((input) => input.setSelectionRange(1, 1));
  await bed.press('Shift+ArrowRight');
  await expect(room).toBeFocused();
  expect(await bed.evaluate((input) => [input.selectionStart, input.selectionEnd])).toEqual([1, 1]);

  await room.evaluate((input) => input.setSelectionRange(1, 2));
  await room.press('Shift+ArrowLeft');
  await expect(bed).toBeFocused();
  expect(await room.evaluate((input) => [input.selectionStart, input.selectionEnd])).toEqual([1, 2]);
});

test('blocked or invalid navigation storage falls back to Standard', async ({ page }) => {
  await page.addInitScript((key) => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function patchedGetItem(candidate) {
      if (this === localStorage && candidate === key) throw new DOMException('blocked', 'SecurityError');
      return getItem.call(this, candidate);
    };
    Storage.prototype.setItem = function patchedSetItem(candidate, value) {
      if (this === localStorage && candidate === key) throw new DOMException('blocked', 'SecurityError');
      return setItem.call(this, candidate, value);
    };
  }, navigationModeKey);
  await authenticate(page);
  await page.goto('/entrega.html');
  await expect(page.locator('#deliveryWorkflow')).toBeVisible();
  await page.locator('#shortcutsBtn').click();
  await expect(page.locator('#keyboardNavigationMode')).toHaveAttribute('aria-checked', 'false');
  await page.locator('#keyboardNavigationMode').click();
  await expect(page.locator('#keyboardNavigationMode')).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await page.locator('#shortcutsBtn').click();
  await expect(page.locator('#keyboardNavigationMode')).toHaveAttribute('aria-checked', 'false');
});

test('QA scenario opens a modal review and traps/restores focus', async ({ page }) => {
  await openDelivery(page);
  await loadQaScenario(page);

  const review = page.locator('#noteSection');
  await expect(review).toBeVisible();
  await expect(page.locator('#noteContent')).not.toBeEmpty();
  await expect.poll(() => page.evaluate(() => document.querySelector('#noteSection')?.contains(document.activeElement))).toBe(true);

  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.querySelector('#noteSection')?.contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(review).toHaveJSProperty('open', false);
  await expect(page.locator('#demoEscenariosBtn')).toBeFocused();
});

test('an invalid combobox draft blocks review', async ({ page }) => {
  await openDelivery(page, { qa: false });

  await page.locator('#patientIdType').selectOption('cc');
  await page.locator('#patientIdNumber').fill('123456789');
  const sex = page.locator('#sexoSeg [role="radio"]').first();
  await sex.focus();
  await sex.press('Enter');
  await page.locator('#dobFecha').fill('01/01/1990');
  await page.locator('#dobFecha').press('Enter');
  await page.locator('#posicion').fill('Decúbito supino (dorsal)');
  await page.locator('#posicion').press('Enter');
  await page.locator('#numCama').fill('12');
  await page.locator('#numCama').press('Enter');
  await page.locator('#numHabitacion').fill('304');
  await page.locator('#numHabitacion').press('Enter');
  await page.locator('#servicio').fill('Medicina Interna');
  await page.locator('#servicio').press('Enter');
  await page.locator('#flowTabPatient').click();

  const service = page.locator('#servicio');
  await service.fill('Unidad que no existe');
  await page.keyboard.press('Shift+Enter');
  await expect(service).toHaveAttribute('aria-invalid', 'true');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#noteSection')).toHaveJSProperty('open', false);
  await expect(service).toBeFocused();
});

test('two-level Tab traversal keeps useful focus and direct writing recovers it from body', async ({ page, browserName }) => {
  await openDelivery(page);

  const invariant = () => page.evaluate(() => {
    const active = document.activeElement;
    return {
      connected: !!active?.isConnected,
      body: active === document.body,
      disabled: !!active?.matches?.(':disabled'),
      concealed: !!active?.closest?.('[hidden], [inert]'),
    };
  });

  expect(await invariant()).toEqual({ connected: true, body: false, disabled: false, concealed: false });
  // El WebKit headless no expone la preferencia macOS “Full Keyboard Access”;
  // su smoke automatizado cubre el bloque clínico continuo y el ciclo modal se
  // verifica aparte. Safari real se cubre en la matriz manual con esa opción activa.
  const iterations = browserName === 'webkit' ? 6 : 12;
  for (let index = 0; index < iterations; index += 1) {
    await page.keyboard.press('Tab');
    const state = await invariant();
    if (state.body) {
      await dispatchPrintable(page, 'ñ');
      await expect(page.locator('#servicio')).toBeFocused();
      await expect(page.locator('#servicio')).toHaveValue('ñ');
      break;
    }
    expect(state).toEqual({ connected: true, body: false, disabled: false, concealed: false });
  }
});

test('direct writing preserves Unicode from field controls, shell and lost focus', async ({ page }) => {
  await openDelivery(page, { qa: false });
  await completePatientThroughUi(page);

  const noScales = page.locator('#sinEscalasBtn');
  const scaleSearch = page.locator('#escalasPicker-search');
  await noScales.focus();
  await dispatchPrintable(page, 'ñ');
  await expect(scaleSearch).toBeFocused();
  await expect(scaleSearch).toHaveValue('ñ');

  await page.evaluate(() => document.activeElement?.blur());
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await dispatchPrintable(page, 'á');
  await expect(scaleSearch).toBeFocused();
  await expect(scaleSearch).toHaveValue('ñá');

  await page.locator('[data-cf-avatar]').focus();
  await page.keyboard.press('r');
  await expect(scaleSearch).toBeFocused();
  await expect(scaleSearch).toHaveValue('ñár');

  await page.locator('[data-cf-avatar]').focus();
  await dispatchAltGraph(page, '@');
  await expect(scaleSearch).toBeFocused();
  await expect(scaleSearch).toHaveValue('ñár@');

  await page.locator('[data-cf-avatar]').focus();
  await dispatchPrintable(page, 'Dead');
  await expect(scaleSearch).toBeFocused();
  await expect(scaleSearch).toHaveValue('ñár@');
  await page.keyboard.insertText('é');
  await expect(scaleSearch).toHaveValue('ñár@é');
  await expect(page.locator('#dispositivosPicker-search')).toHaveValue('');
});

test('direct writing uses the active PAE search from options and completed headers', async ({ page }) => {
  await preparePaeAtRc(page);
  const firstRc = page.locator('#rcList [role="gridcell"]').first();
  await firstRc.focus();
  await dispatchPrintable(page, 'ñ');
  await expect(page.locator('#searchRc')).toBeFocused();
  await expect(page.locator('#searchRc')).toHaveValue('ñ');

  await page.locator('#searchRc').fill('');
  await firstRc.click();
  await page.locator('#rcConfirmBtn').click();
  const completedHeader = page.locator('#step3 > .step-header');
  await expect(completedHeader).toHaveAttribute('role', 'button');
  await completedHeader.focus();
  await dispatchPrintable(page, 'á');
  await expect(page.locator('#step3')).toHaveClass(/active/);
  await expect(page.locator('#searchRc')).toBeFocused();
  await expect(page.locator('#searchRc')).toHaveValue('á');
});

test('reverse PAE uses Shift+arrows to bridge findings and live diagnoses', async ({ page }) => {
  await loadCompleteQa(page);
  await page.locator('#flowTabFasePAE').click();
  await resetSection(page, 'fasePAE');
  await page.locator('#routeSwitch [data-mode="reverse"]').click();
  const search = page.locator('#searchFindings');
  await search.fill('dolor');
  await search.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(page.locator('#dxLive')).toBeVisible();

  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => document.querySelector('#findingsList')?.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => page.evaluate(() => document.querySelector('#reverseResults')?.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(() => page.evaluate(() => document.querySelector('#findingsList')?.contains(document.activeElement))).toBe(true);
  await expect(page.locator('#flowTabFasePAE')).toHaveAttribute('aria-selected', 'true');
});

test('PAE spatial entry restores selected options according to travel direction', async ({ page }) => {
  await preparePaeAtRc(page);
  const rcOptions = page.locator('#rcList [role="gridcell"]:not(.option--add)');
  expect(await rcOptions.count()).toBeGreaterThan(1);
  await rcOptions.nth(0).click();
  await rcOptions.nth(1).click();
  const firstId = await rcOptions.nth(0).getAttribute('id');
  const lastId = await rcOptions.nth(1).getAttribute('id');
  await page.locator('#rcConfirmBtn').click();

  const nextStepSearch = page.locator('#step4:not([hidden]) #searchEp, #step5.active [role="gridcell"]').first();
  await nextStepSearch.focus();
  await page.keyboard.press('Shift+ArrowUp');
  await expect(page.locator(`#${lastId}`)).toBeFocused();

  await page.keyboard.press('Shift+ArrowUp');
  await expect(page.locator('#diagnosticos .selected')).toBeFocused();
  await page.keyboard.press('Shift+ArrowDown');
  await expect(page.locator(`#${firstId}`)).toBeFocused();
});

test('combobox keeps invalid draft and Escape restores its confirmed value', async ({ page }) => {
  await loadCompleteQa(page);
  await page.locator('#flowTabPatient').click();

  const position = page.locator('#posicion');
  await position.fill('Decúbito supino (dorsal)');
  await position.press('Enter');
  await expect.poll(() => page.evaluate(() => window.NotaCampos.state.posicion))
    .toBe('Decúbito supino (dorsal)');

  await position.focus();
  await position.fill('decubito supino');
  await expect.poll(() => page.evaluate(() => window.NotaCampos.state.posicion)).toBe('');
  await position.press('Shift+Enter');

  await expect(position).toHaveValue('decubito supino');
  await expect(position).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#posicion-feedback')).toContainText('Seleccione una opción válida');
  await expect(page.locator('#noteSection')).toHaveJSProperty('open', false);

  await position.press('Escape');
  await expect(position).toHaveValue('Decúbito supino (dorsal)');
  await expect(position).toHaveAttribute('aria-invalid', 'false');
  await expect.poll(() => page.evaluate(() => window.NotaCampos.state.posicion))
    .toBe('Decúbito supino (dorsal)');

  await position.fill('decubito supino (dorsal)');
  await position.press('Shift+Enter');
  await expect(position).toHaveValue('Decúbito supino (dorsal)');
  await expect(page.locator('#flowTabFaseB')).toHaveAttribute('aria-selected', 'true');
});

test('PAE grid semantics, focus reflow, explicit confirmation and undo remain coherent', async ({ page }) => {
  await preparePaeAtRc(page);

  const rc = page.locator('#rcList');
  const cells = rc.locator('[role="gridcell"]');
  await expect(rc).toHaveAttribute('role', 'grid');
  await expect(rc).toHaveAttribute('aria-multiselectable', 'true');
  await expect(rc).toHaveAttribute('aria-label', /.+/);
  await expect(cells).not.toHaveCount(0);
  await expect(rc.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
  expect(await cells.evaluateAll((nodes) => nodes.filter((node) => (
    node.getAttribute('aria-selected') !== String(node.classList.contains('multi-selected'))
  )).length)).toBe(0);

  const search = page.locator('#searchRc');
  await search.focus();
  await search.press('Shift+Enter');
  await expect(rc.locator('.multi-selected')).toHaveCount(0);
  await expect(page.locator('#rcConfirmBtn')).toBeDisabled();
  await expect(page.locator('#step3')).toHaveClass(/active/);

  const first = cells.first();
  await first.focus();
  const focusedId = await first.getAttribute('id');
  await page.setViewportSize({ width: 919, height: 900 });
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe(focusedId);
  await expect(rc.locator(':scope > [role="row"]')).not.toHaveCount(0);

  await first.press('Space');
  await expect(first).toHaveClass(/multi-selected/);
  await expect(first).toHaveAttribute('aria-selected', 'true');

  await first.press('Delete');
  await expect(first).not.toHaveClass(/multi-selected/);
  await expect(first).toHaveAttribute('aria-selected', 'false');
  await expect(first).toBeFocused();

  const undo = page.locator('#undoToast [data-undo-action]');
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(first).toHaveClass(/multi-selected/);
  await expect(first).toHaveAttribute('aria-selected', 'true');

  await first.focus();
  await first.press('Shift+Enter');
  await expect(page.locator('#step3')).not.toHaveClass(/active/);
});

test('Ctrl+Enter reviews without copying and later edits create a pending edition', async ({ page }) => {
  await installClipboardStub(page, 'success');
  await loadCompleteQa(page);

  await page.locator('#flowTabFaseF').click();
  const observations = page.locator('#otrosComentarios');
  await observations.focus();
  await observations.press('Control+Enter');
  await expect(page.locator('#noteSection')).toHaveJSProperty('open', true);
  expect(await page.evaluate(() => window.__clipboardCalls)).toBe(0);

  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#drawerConfirmBtn')).toBeFocused();
  expect(await page.evaluate(() => window.__clipboardCalls)).toBe(0);

  await page.keyboard.press('Enter');
  await expect(page.locator('#drawerCopyBtn')).toBeEnabled();
  await expect(page.locator('#drawerCopyBtn')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__clipboardCalls)).toBe(1);
  await expect(page.locator('#drawerCopyBtn')).toHaveClass(/copied/);
  expect(await page.evaluate(() => window.__clipboardText.trim().length)).toBeGreaterThan(0);

  await page.keyboard.press('Escape');
  await expect(observations).toBeFocused();
  await observations.fill(`${await observations.inputValue()} Ajuste posterior.`);
  await expect(page.locator('#noteStatus')).toContainText('Edición pendiente');
  await expect(page.locator('#workflowDiscardBtn')).toBeVisible();
  await expect(page.locator('#drawerCopyBtn')).toBeHidden();

  await page.locator('#copyBtn').click();
  await expect(page.locator('#drawerConfirmBtn')).toHaveText('Confirmar cambios');
  await expect(page.locator('#drawerCopyBtn')).toBeHidden();
  await page.locator('#drawerConfirmBtn').click();
  await expect(page.locator('#previewDraftState')).toHaveText('Confirmada');
  await expect(page.locator('#drawerCopyBtn')).toBeEnabled();
  await expect(page.locator('#noteContent')).toContainText('Ajuste posterior.');
});

test('rejected Clipboard API plus failed fallback never reports copy success', async ({ page }) => {
  await installClipboardStub(page, 'reject');
  await openDelivery(page);
  await loadQaScenario(page);
  await confirmOpenReview(page);

  const copy = page.locator('#drawerCopyBtn');
  await copy.click();
  await expect.poll(() => page.evaluate(() => window.__clipboardCalls)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__execCalls)).toBe(1);
  await expect(copy).not.toHaveClass(/copied/);
  await expect(copy).toHaveText('Copiar nota');
  await expect(page.locator('#previewStatus')).toContainText('No fue posible copiar');
  await expect(page.locator('#actionAnnouncer')).toContainText('No fue posible copiar');
});

test('missing Clipboard API succeeds only when the fallback confirms copy', async ({ page }) => {
  await installClipboardStub(page, 'fallback-success');
  await openDelivery(page);
  await loadQaScenario(page);
  await confirmOpenReview(page);

  await page.locator('#drawerCopyBtn').click();
  await expect.poll(() => page.evaluate(() => window.__clipboardCalls)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__execCalls)).toBe(1);
  expect(await page.evaluate(() => window.__fallbackText.trim().length)).toBeGreaterThan(0);
  await expect(page.locator('#drawerCopyBtn')).toHaveClass(/copied/);
});

test('invalid optional healing date blocks review and Escape restores empty', async ({ page }) => {
  await loadCompleteQa(page);
  await page.locator('#flowTabFaseC').click();

  const search = page.locator('#dispositivosPicker-search');
  await search.fill('Sonda nasogástrica (SNG)');
  await search.press('Enter');

  const cards = page.locator('#dispositivosList .multi-add-item');
  await expect(cards).toHaveCount(2);
  const card = cards.last();
  const insertion = card.locator('.dev-fecha-ins');
  const healing = card.locator('.dev-fecha-cur');
  const deviceState = card.locator('.dev-estado');

  await insertion.fill('01/01/2020');
  await insertion.press('Enter');
  await deviceState.fill('Permeable y funcional');
  await deviceState.press('Enter');
  await healing.fill('31/02/2020');
  await healing.press('Tab');

  await expect(healing).toHaveAttribute('aria-invalid', 'true');
  await expect(card.locator('.clinical-date-feedback:not([hidden])')).toContainText('fecha real');
  await expect(page.locator('#copyBtn')).toBeDisabled();

  await healing.focus();
  await healing.press('Control+Enter');
  await expect(page.locator('#noteSection')).toHaveJSProperty('open', false);
  await expect(healing).toBeFocused();

  await healing.press('Escape');
  await expect(healing).toHaveValue('');
  await expect(healing).toHaveAttribute('aria-invalid', 'false');
  await healing.press('Shift+Backspace');
  await expect(cards).toHaveCount(2);

  await healing.press('Control+Enter');
  await expect(page.locator('#noteSection')).toHaveJSProperty('open', true);
});

test('assessment scales render catalog bounds and steps and keep decimal increments exact', async ({ page }) => {
  test.setTimeout(60_000);
  await loadCompleteQa(page, { navigationMode: 'agile' });
  await page.locator('#flowTabFaseB').click();
  const catalog = await page.evaluate(() => window.notaListas.escalas.map((scale) => ({ ...scale })));
  const used = new Set(await page.evaluate(() => window.NotaCampos.state.escalas.map((scale) => scale.nombre)));
  for (const scale of catalog) {
    if (!used.has(scale.nombre)) await addAssessmentScale(page, scale.nombre);
  }

  const rendered = await page.evaluate(() => window.notaListas.escalas.map((meta) => {
    const item = window.NotaCampos.state.escalas.find((scale) => scale.nombre === meta.nombre);
    const input = item ? document.getElementById(`escala-puntaje-${item.id}`) : null;
    return {
      corto: meta.corto,
      state: item ? { min: item.min, max: item.max, step: item.step } : null,
      dom: input ? { min: Number(input.min), max: Number(input.max), step: Number(input.step) } : null,
      expected: { min: meta.min, max: meta.max, step: meta.step ?? 1 },
    };
  }));
  for (const scale of rendered) {
    expect(scale.state, `${scale.corto} missing from state`).toEqual(scale.expected);
    expect(scale.dom, `${scale.corto} missing from DOM`).toEqual(scale.expected);
  }

  const ids = await page.evaluate(() => Object.fromEntries(['IMC', 'MNA'].map((shortName) => {
    const item = window.NotaCampos.state.escalas.find((scale) => scale.corto === shortName);
    return [shortName, item ? `escala-puntaje-${item.id}` : ''];
  })));
  const imc = page.locator(`#${ids.IMC}`);
  const mna = page.locator(`#${ids.MNA}`);
  await imc.fill('10.2');
  await imc.press('ArrowUp');
  await expect(imc).toHaveValue('10.3');
  expect(await imc.inputValue()).not.toContain('00000000000000004');
  await imc.fill('70');
  await imc.press('ArrowUp');
  await expect(imc).toHaveValue('70');
  await imc.fill('10');
  await imc.press('ArrowDown');
  await expect(imc).toHaveValue('10');
  await imc.fill('9.9');
  await expect(imc).toHaveAttribute('aria-invalid', 'true');

  await mna.fill('1');
  await mna.press('ArrowUp');
  await expect(mna).toHaveValue('1.5');

  const origin = page.locator('#escalasList .escala-puntaje').first();
  const originId = await origin.getAttribute('id');
  const originValue = await origin.inputValue();
  await origin.focus();
  await origin.press('Shift+ArrowDown');
  await expect.poll(() => page.evaluate((id) => document.activeElement?.id !== id, originId)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('escala-puntaje'))).toBe(true);
  await expect(origin).toHaveValue(originValue);
});

test('confirmation dialogs support directional actions, contain focus and restore the invoker', async ({ page }) => {
  await loadCompleteQa(page);
  await page.locator('#flowTabFaseB').click();
  const imcName = await page.evaluate(() => window.notaListas.escalas.find((scale) => scale.corto === 'IMC').nombre);
  await addAssessmentScale(page, imcName);
  const trigger = page.locator('#sinEscalasBtn');
  await trigger.click();
  const dialog = page.locator('#dependentChangeDialog');
  const cancel = page.locator('[data-dependent-cancel]');
  const confirm = page.locator('[data-dependent-confirm]');
  await expect(dialog).toHaveJSProperty('open', true);
  await expect(cancel).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(confirm).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(confirm).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(confirm).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  expect(await page.evaluate(() => document.querySelector('#dependentChangeDialog').contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveJSProperty('open', false);
  await expect(trigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => ({
    scales: window.NotaCampos.state.escalas.length,
    none: window.NotaCampos.state.sinEscalas,
  }))).toEqual({ scales: 3, none: false });

  await page.setViewportSize({ width: 390, height: 844 });
  const resetTrigger = page.locator('[data-reset-section="faseB"]');
  await resetTrigger.click();
  const resetDialog = page.locator('#resetDialog');
  const resetCancel = page.locator('#resetCancelBtn');
  const resetSectionButton = page.locator('#resetSectionBtn');
  const resetAll = page.locator('#resetAllBtn');
  await expect(resetDialog).toHaveJSProperty('open', true);
  await expect(resetCancel).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(resetSectionButton).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(resetAll).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(resetAll).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(resetSectionButton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(resetDialog).toHaveJSProperty('open', false);
  await expect.poll(() => page.evaluate(() => window.NotaCampos.state.escalas.length)).toBe(0);
});

test('resetting Patient preserves cumulative access but blocks review and copy', async ({ page }) => {
  await loadCompleteQa(page);
  await expect(page.locator('#flowNav [role="tab"]:not([disabled])')).toHaveCount(6);

  await page.locator('#flowTabPatient').click();
  await resetSection(page, 'patient');
  await expect(page.locator('#sexo')).toHaveValue('___');
  await expect(page.locator('#dobFecha')).toHaveValue('');
  await expect(page.locator('#flowNav [role="tab"]:not([disabled])')).toHaveCount(6);

  await page.locator('#flowTabFaseB').click();
  await expect(page.locator('#faseB')).toBeVisible();
  await expect(page.locator('#copyBtn')).toBeDisabled();
  await expect(page.locator('#noteToggleBtn')).toBeDisabled();

  await page.locator('#flowTabFaseB').focus();
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#noteSection')).toHaveJSProperty('open', false);
  await expect(page.locator('#flowTabPatient')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#flowNav [role="tab"]:not([disabled])')).toHaveCount(6);
});

test('dependent PAE changes are idempotent, cancellable and focus their exact trigger', async ({ page }) => {
  await loadCompleteQa(page);
  const originalNote = await page.locator('#noteContent').innerHTML();
  await page.locator('#flowTabFasePAE').click();

  const sameArea = page.locator('#areas [data-area="Respiratorias"]');
  await sameArea.click();
  await expect(page.locator('#dependentChangeDialog')).toHaveCount(0);
  expect(await page.locator('#noteContent').innerHTML()).toBe(originalNote);

  await page.locator('#step1 .step-header').click();
  const differentArea = page.locator('#areas [role="gridcell"]:not([data-area="Respiratorias"])').first();
  await differentArea.click();
  await expect(page.locator('#dependentChangeDialog')).toHaveJSProperty('open', true);
  await expect(page.locator('#dependentChangeDescription')).toContainText('Se reiniciarán');

  await page.keyboard.press('Escape');
  await expect(page.locator('#dependentChangeDialog')).toHaveJSProperty('open', false);
  await expect(differentArea).toBeFocused();
  expect(await page.locator('#noteContent').innerHTML()).toBe(originalNote);

  await differentArea.click();
  await page.locator('[data-dependent-confirm]').click();
  await expect(page.locator('#dependentChangeDialog')).toHaveJSProperty('open', false);
  await expect(page.locator('#step2')).toHaveClass(/active/);
  await expect(page.locator('#diagnosticos .selected')).toHaveCount(0);
  await expect(page.locator('#copyBtn')).toBeDisabled();
});

test('standard preserves native modified editing while plain arrows stay inside editors', async ({ page }) => {
  await loadCompleteQa(page, { navigationMode: 'standard' });
  await page.locator('#flowTabPatient').click();
  const bed = page.locator('#numCama');
  await bed.focus();
  await bed.evaluate((input) => input.setSelectionRange(1, 1));
  await bed.press('Shift+ArrowRight');
  await expect(bed).toBeFocused();
  expect(await bed.evaluate((input) => [input.selectionStart, input.selectionEnd])).toEqual([1, 2]);
  await bed.evaluate((input) => input.setSelectionRange(2, 2));
  await bed.press('ArrowLeft');
  expect(await bed.evaluate((input) => input.selectionStart)).toBe(1);
  await expect(page.locator('#flowTabPatient')).toHaveAttribute('aria-selected', 'true');

  await page.locator('#flowTabFaseF').click();
  const observations = page.locator('#otrosComentarios');
  await observations.fill('AB');
  await observations.evaluate((input) => input.setSelectionRange(2, 2));
  await observations.press('ArrowLeft');
  expect(await observations.evaluate((input) => input.selectionStart)).toBe(1);
  await expect(page.locator('#flowTabFaseF')).toHaveAttribute('aria-selected', 'true');

  const response = page.locator('#respuestaIntervenciones');
  await response.fill('Primera línea\nSegunda línea');
  await response.evaluate((input) => input.setSelectionRange(input.value.length, input.value.length));
  await response.press('ArrowDown');
  await expect(response).toBeFocused();
  await response.press('Shift+ArrowDown');
  await expect(response).toBeFocused();
});

test('unmodified arrows keep radios, comboboxes and compound fields inside their owner', async ({ page }) => {
  await loadCompleteQa(page);
  await page.locator('#flowTabPatient').click();

  const firstSex = page.locator('#sexoSeg [role="radio"]').first();
  const lastSex = page.locator('#sexoSeg [role="radio"]').last();
  await firstSex.focus();
  await firstSex.press('ArrowLeft');
  await expect(firstSex).toBeFocused();
  await firstSex.press('ArrowUp');
  await expect(firstSex).toBeFocused();
  await firstSex.press('ArrowRight');
  await expect(lastSex).toBeFocused();
  await lastSex.press('ArrowRight');
  await expect(lastSex).toBeFocused();
  expect(await activeFieldId(page)).toBe('patient-sex');

  const position = page.locator('#posicion');
  await position.focus();
  await position.press('ArrowDown');
  await position.press('End');
  const activeAtEnd = await position.getAttribute('aria-activedescendant');
  expect(activeAtEnd).toBeTruthy();
  await position.press('ArrowDown');
  await expect(position).toHaveAttribute('aria-activedescendant', activeAtEnd);
  await expect(position).toBeFocused();
  expect(await activeFieldId(page)).toBe('patient-position');

  const dob = page.locator('#dobFecha');
  await dob.focus();
  await dob.evaluate((input) => input.setSelectionRange(input.value.length, input.value.length));
  await dob.press('ArrowRight');
  const calendar = page.locator('#dobFecha').locator('xpath=following-sibling::button[contains(@class,"clinical-date-cal")]');
  await expect(calendar).toBeFocused();
  expect(await activeFieldId(page)).toBe('patient-dob');
});

test('plain arrow boundaries stay in-field and Shift+arrows move spatially across desktop layouts', async ({ page }) => {
  await loadCompleteQa(page);
  await page.locator('#flowTabPatient').click();
  const bed = page.locator('#numCama');
  const room = page.locator('#numHabitacion');
  await bed.focus();
  await bed.evaluate((input) => input.setSelectionRange(input.value.length, input.value.length));
  await bed.press('ArrowRight');
  await expect(bed).toBeFocused();
  expect(await activeFieldId(page)).toBe('patient-bed');
  await bed.press('Shift+ArrowRight');
  await expect(room).toBeFocused();
  await expect(page.locator('#flowTabPatient')).toHaveAttribute('aria-selected', 'true');

  const desktopMatrix = [
    [1280, 900], [1920, 940], [1536, 752], [2560, 1300], [2048, 1056], [1707, 880],
    [1280, 627], [960, 470],
  ];
  for (const [width, height] of desktopMatrix) {
    await page.setViewportSize({ width, height });
    await expect(room).toBeFocused();
    await bed.focus();
    await bed.evaluate((input) => input.setSelectionRange(input.value.length, input.value.length));
    const direction = await page.evaluate(() => {
      const origin = document.getElementById('numCama').getBoundingClientRect();
      const target = document.getElementById('numHabitacion').getBoundingClientRect();
      return Math.abs(target.left - origin.left) > Math.abs(target.top - origin.top) ? 'ArrowRight' : 'ArrowDown';
    });
    await bed.press(`Shift+${direction}`);
    await expect(room).toBeFocused();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(room).toBeFocused();
  await bed.focus();
  await bed.evaluate((input) => input.setSelectionRange(input.value.length, input.value.length));
  const mobileDirection = await page.evaluate(() => {
    const bedRect = document.getElementById('numCama').getBoundingClientRect();
    const roomRect = document.getElementById('numHabitacion').getBoundingClientRect();
    return Math.abs(roomRect.left - bedRect.left) > Math.abs(roomRect.top - bedRect.top)
      ? 'ArrowRight'
      : 'ArrowDown';
  });
  await bed.press(`Shift+${mobileDirection}`);
  await expect(room).toBeFocused();

  const continueButton = page.locator('[data-flow-continue="patient"]');
  await continueButton.focus();
  await continueButton.press('ArrowDown');
  await expect(page.locator('#flowTabPatient')).toHaveAttribute('aria-selected', 'true');
});

test('section footer actions are spatial destinations without joining the Tab toggle', async ({ page }) => {
  await loadCompleteQa(page);
  await page.locator('#flowTabPatient').click();
  const service = page.locator('#servicio');
  await service.focus();
  await service.evaluate((input) => input.setSelectionRange(input.value.length, input.value.length));
  await service.press('Shift+ArrowDown');
  const continueButton = page.locator('[data-flow-continue="patient"]');
  await expect(continueButton).toBeFocused();
  await continueButton.press('Shift+ArrowRight');
  const reset = page.locator('[data-reset-section="patient"]');
  await expect(reset).toBeFocused();
  await reset.press('Tab');
  await expect(page.locator('#flowTabPatient')).not.toBeFocused();
});

test('combobox popovers stay inside representative desktop and zoom-equivalent viewports', async ({ page }) => {
  await loadCompleteQa(page);
  await page.locator('#flowTabPatient').click();
  const service = page.locator('#servicio');
  const matrix = [
    [1280, 900], [1920, 940], [1536, 752], [2560, 1300], [2048, 1056], [1707, 880],
    [1280, 627], [960, 470],
  ];
  for (const [width, height] of matrix) {
    await page.setViewportSize({ width, height });
    await service.focus();
    await service.press('ArrowDown');
    const geometry = await page.evaluate(() => {
      const list = document.getElementById('servicio-listbox');
      const activeId = document.getElementById('servicio').getAttribute('aria-activedescendant');
      const active = activeId ? document.getElementById(activeId) : null;
      const rect = list.getBoundingClientRect();
      const activeRect = active?.getBoundingClientRect();
      return {
        hidden: list.hidden,
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        activeInside: !activeRect || (activeRect.top >= rect.top - 1 && activeRect.bottom <= rect.bottom + 1),
        viewport: { width: window.visualViewport?.width || innerWidth, height: window.visualViewport?.height || innerHeight },
      };
    });
    expect(geometry.hidden).toBe(false);
    expect(geometry.rect.left).toBeGreaterThanOrEqual(0);
    expect(geometry.rect.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
    expect(geometry.rect.top).toBeGreaterThanOrEqual(0);
    expect(geometry.rect.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
    expect(geometry.activeInside).toBe(true);
    await service.press('Escape');
  }
});

test('twenty-five device lifecycles leave no portal or duplicate state behind', async ({ page, browserName }) => {
  test.setTimeout(60_000);
  test.skip(browserName !== 'chromium', 'The listener lifecycle is engine-independent and is stress-tested once.');
  await loadCompleteQa(page);
  await page.locator('#flowTabFaseC').click();
  const search = page.locator('#dispositivosPicker-search');

  for (let cycle = 0; cycle < 25; cycle += 1) {
    await search.fill('Sonda nasogástrica (SNG)');
    await search.press('Enter');
    const cards = page.locator('#dispositivosList .multi-add-item');
    await expect(cards).toHaveCount(2);
    await cards.last().locator('.dev-estado').focus();
    await expect(page.locator('body > .cbx-list[id^="dev-estado-"]:not([hidden])')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('body > .cbx-list[id^="dev-estado-"]:not([hidden])')).toHaveCount(0);
    await cards.last().locator('.multi-add-remove').click();
    await expect(cards).toHaveCount(1);
    await expect(page.locator('body > .cbx-list[id^="dev-estado-"]')).toHaveCount(0);
  }

  const names = await page.evaluate(() => window.NotaCampos.state.dispositivos.map((item) => item.nombre));
  expect(new Set(names).size).toBe(names.length);
});

test('internal navigation warns about uncopied changes without storing the draft', async ({ page }) => {
  await openDelivery(page, { qa: false });
  await page.locator('#numCama').fill('12');
  await page.locator('.cf-nav-item[href="dashboard.html#inicio"]').click();

  await expect(page.locator('#dependentChangeDialog')).toHaveJSProperty('open', true);
  await expect(page.locator('#dependentChangeDescription')).toContainText('borrador sin confirmar');
  await page.keyboard.press('Escape');
  await expect(page.locator('#dependentChangeDialog')).toHaveJSProperty('open', false);
  await expect(page.locator('.cf-nav-item[href="dashboard.html#inicio"]')).toBeFocused();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([navigationModeKey]);
});

test('in-memory interaction metrics never capture clinical values or persist data', async ({ page }) => {
  await openDelivery(page, { qa: false });
  await page.evaluate(() => window.CareFlowMetrics.reset());
  const bed = page.locator('#numCama');
  await bed.focus();
  await bed.pressSequentially('VALOR-CLINICO-PRIVADO');
  await page.keyboard.press('Tab');

  const audit = await page.evaluate(() => {
    const snapshot = window.CareFlowMetrics.snapshot();
    return {
      snapshot,
      localKeys: Object.keys(localStorage),
      sessionKeys: Object.keys(sessionStorage),
    };
  });
  const serialized = JSON.stringify(audit.snapshot);
  expect(serialized).not.toContain('VALOR-CLINICO-PRIVADO');
  expect(audit.snapshot.events.length).toBeGreaterThan(0);
  expect(audit.snapshot.events.every((event) => Object.keys(event).every((key) => [
    'type', 'atMs', 'targetId', 'stageId', 'modality', 'action', 'outcome', 'from', 'to', 'count',
  ].includes(key)))).toBe(true);
  expect(audit.localKeys.every((key) => key === navigationModeKey)).toBe(true);
  expect([...audit.localKeys, ...audit.sessionKeys].some((key) => /metric|telemetr/i.test(key))).toBe(false);
});

test('the four QA notes keep frozen clinical HTML and plain-text fingerprints', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'One deterministic engine is sufficient for clinical-content snapshots.');
  await openDelivery(page);

  const actual = [];
  for (let index = 0; index < 4; index += 1) {
    await loadQaScenario(page);
    actual.push(await noteFingerprint(page));
    await closeReview(page);
  }
  expect(actual).toEqual(QA_NOTE_FINGERPRINTS);
});
