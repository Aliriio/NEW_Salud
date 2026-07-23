const datosProPai = window.datosProPai;

/* Tipo de nota que genera esta página (un futuro recibo.html solo cambia esto) */
const NOTE_TYPE = 'entrega';
/* Dirección funcional del futuro autocompletado cruzado: Entrega ← Recibo y Recibo ← Entrega. */
const RELATED_NOTE_TYPE = NOTE_TYPE === 'entrega' ? 'recibo' : 'entrega';
const NoteLifecycle = window.CareFlowNoteLifecycle;
const noteLifecycle = NoteLifecycle?.create();
if (!noteLifecycle) throw new Error('[CareFlow] No fue posible iniciar el ciclo de vida de la nota.');

/* Áreas clínicas con etiqueta amigable: key = clave exacta de datosProPai,
   label = nombre oficial mostrado en UI y en la nota (nota-listas.js). */
const NOTA_AREAS = (window.notaListas?.areas)
    || Object.keys(window.datosProPai || {}).map((k) => ({ key: k, label: k }));
const areaLabel = (key) => NOTA_AREAS.find((a) => a.key === key)?.label || key || '';

let currentStep = 1;
let activeFlowStage = 'patient';
let previewReturnFocus = null;
let lastLogicalSectionId = 'patient';
let sectionTypeaheadBuffer = '';
let sectionTypeaheadTimer = null;
let optionActivationAdvances = null;
const SECTION_TYPEAHEAD_DELAY = 1500;
const KEYBOARD_NAVIGATION_MODE_KEY = 'cf_keyboard_navigation_mode';
const KEYBOARD_NAVIGATION_MODES = new Set(['standard', 'agile']);
let keyboardNavigationMode = 'standard';
let maxReachedStep = 1;  // paso más profundo alcanzado: habilita volver a pasos ya recorridos
let noteVisible = false;  // La nota empieza oculta
let reversePanelContext = false;
let flowNavRovingId = 'patient';
let revisionTrackingEnabled = false;
let suppressRevisionTracking = false;
const stageFocusMemory = new Map();
const validatedStages = new Set();
let interactionRegistry = null;
let interactionFocus = null;
let interactionIssues = null;
let interactionAnnouncer = null;
let interactionOverlays = null;
let interactionOrigin = null;
let interactionChanges = null;
let interactionMetrics = null;
let keyboardController = null;
let writingTargetRegistry = null;
let fieldNavigationRegistry = null;
let tabLevelController = null;
let spatialNavigator = null;

const selected = {
    area: null,
    areaNombre: null,
    diagnostico: null,
    diagnosticoNombre: null,
    datosDiag: null,
    rc: [],                // "Relacionado con" elegidos (textos)
    ep: [],                // "Evidenciado por" elegidos (textos)
    nics: [],
    customNics: [],        // intervenciones NIC personalizadas (subconjunto de nics)
    noc: null,             // índice numérico, o 'custom' si es personalizado
    nocNombre: null,
    nocCustom: false,      // true cuando el NOC fue escrito por el usuario
    b6Escala: null,        // escala B6 activa (array de niveles) usada en el paso 5
    b6EscalaId: null,      // id de la escala elegida para un NOC personalizado
    b6CustomNiveles: [],   // niveles crudos de una escala B6 personalizada (para reeditar)
    b6Puntuacion: null,
    b6Descripcion: null,
};

/* ─── Familias de escala B6 canónicas presentes en los datos (NANDA-NOC).
   Se ofrecen como opciones cuando el NOC es personalizado. La primera es la estándar. ─── */
const B6_ESCALAS = [
    { id: 'compromiso',  nombre: 'Grado de compromiso',         niveles: ['1. Severamente comprometido', '2. Sustancialmente comprometido', '3. Moderadamente comprometido', '4. Levemente comprometido', '5. No comprometido (óptimo)'] },
    { id: 'frecuencia',  nombre: 'Frecuencia de demostración',  niveles: ['1. Nunca demostrado', '2. Raramente demostrado', '3. A veces demostrado', '4. Frecuentemente demostrado', '5. Siempre demostrado'] },
    { id: 'desviacion',  nombre: 'Desviación del rango normal', niveles: ['1. Desviación grave del rango normal', '2. Desviación sustancial del rango normal', '3. Desviación moderada del rango normal', '4. Desviación leve del rango normal', '5. Sin desviación del rango normal'] },
    { id: 'severidad',   nombre: 'Severidad',                   niveles: ['1. Grave', '2. Sustancial', '3. Moderado', '4. Leve', '5. Ninguno'] },
    { id: 'extension',   nombre: 'Cantidad / extensión',        niveles: ['1. Ninguno', '2. Escaso', '3. Moderado', '4. Sustancial', '5. Extenso'] },
    { id: 'satisfaccion',nombre: 'Nivel de satisfacción',       niveles: ['1. Nada satisfecho', '2. Algo satisfecho', '3. Moderadamente satisfecho', '4. Muy satisfecho', '5. Completamente satisfecho'] },
    { id: 'conocimiento',nombre: 'Nivel de conocimiento',       niveles: ['1. Ningún conocimiento', '2. Conocimiento escaso', '3. Conocimiento moderado', '4. Conocimiento sustancial', '5. Conocimiento extenso'] },
];

/* Escala estándar (la primera familia) — usada por defecto y como respaldo */
const STANDARD_B6 = B6_ESCALAS[0].niveles;

const els = {
    progressFill:   document.getElementById('progressFill'),
    progressLabel:  document.getElementById('progressLabel'),
    areas:          document.getElementById('areas'),
    diagnosticos:   document.getElementById('diagnosticos'),
    intervenciones: document.getElementById('intervenciones'),
    nocs:           document.getElementById('nocs'),
    evaluaciones:   document.getElementById('evaluaciones'),
    noteSection:    document.getElementById('noteSection'),
    dxLive:         document.getElementById('dxLive'),
    dxLiveCount:    document.getElementById('dxLiveCount'),
    noteContent:    document.getElementById('noteContent'),
    noteStatus:     document.getElementById('noteStatus'),
    noteToggleBtn:  document.getElementById('noteToggleBtn'),
    noteDrawerClose: document.getElementById('noteDrawerClose'),
    noteDrawerScrim: document.getElementById('noteDrawerScrim'),
    drawerCopyBtn:  document.getElementById('drawerCopyBtn'),
    drawerConfirmBtn: document.getElementById('drawerConfirmBtn'),
    drawerDiscardBtn: document.getElementById('drawerDiscardBtn'),
    workflowDiscardBtn: document.getElementById('workflowDiscardBtn'),
    previewStatus:  document.getElementById('previewStatus'),
    previewLaunchStatus: document.getElementById('previewLaunchStatus'),
    previewDraftState: document.getElementById('previewDraftState'),
    actionAnnouncer: document.getElementById('actionAnnouncer'),
    keyboardCoach: document.getElementById('keyboardCoach'),
    shortcutsBtn: document.getElementById('shortcutsBtn'),
    shortcutsDialog: document.getElementById('shortcutsDialog'),
    shortcutsClose: document.getElementById('shortcutsClose'),
    shortcutsDialogDescription: document.getElementById('shortcutsDialogDescription'),
    shortcutsTabDescription: document.getElementById('shortcutsTabDescription'),
    shortcutsSpatialRow: document.getElementById('shortcutsSpatialRow'),
    keyboardNavigationMode: document.getElementById('keyboardNavigationMode'),
    keyboardNavigationModeCurrent: document.getElementById('keyboardNavigationModeCurrent'),
    keyboardNavigationModeDescription: document.getElementById('keyboardNavigationModeDescription'),
    dependentChangeDialog: document.getElementById('dependentChangeDialog'),
    dependentChangeTitle: document.getElementById('dependentChangeTitle'),
    dependentChangeDescription: document.getElementById('dependentChangeDescription'),
    dependentChangeCancel: document.getElementById('dependentChangeCancel'),
    dependentChangeConfirm: document.getElementById('dependentChangeConfirm'),
    resetDialog:    document.getElementById('resetDialog'),
    resetDialogDescription: document.getElementById('resetDialogDescription'),
    resetDialogSectionName: document.getElementById('resetDialogSectionName'),
    resetSectionBtn: document.getElementById('resetSectionBtn'),
    resetAllBtn:    document.getElementById('resetAllBtn'),
    resetCancelBtn: document.getElementById('resetCancelBtn'),
    copyBtn:        document.getElementById('copyBtn'),
    nicConfirmBtn:  document.getElementById('nicConfirmBtn'),
    nicConfirmHint: document.getElementById('nicConfirmHint'),
    searchAreas:    document.getElementById('searchAreas'),
    searchDiag:     document.getElementById('searchDiag'),
    rcList:         document.getElementById('rcList'),
    epList:         document.getElementById('epList'),
    searchRc:       document.getElementById('searchRc'),
    searchEp:       document.getElementById('searchEp'),
    rcConfirmBtn:   document.getElementById('rcConfirmBtn'),
    rcConfirmHint:  document.getElementById('rcConfirmHint'),
    epConfirmBtn:   document.getElementById('epConfirmBtn'),
    epConfirmHint:  document.getElementById('epConfirmHint'),
    searchNic:      document.getElementById('searchNic'),
    servicio:       document.getElementById('servicio'),
    sexo:           document.getElementById('sexo'),
    dobFecha:       document.getElementById('dobFecha'),
    dobFeedback:    document.getElementById('dobFeedback'),
    patientContextPanel: document.getElementById('patientContextPanel'),
    patientIdType:  document.getElementById('patientIdType'),
    patientIdNumber: document.getElementById('patientIdNumber'),
    metaLograda:       document.getElementById('metaLograda'),
    metaBlock:         document.getElementById('metaBlock'),
    otrosComentarios:  document.getElementById('otrosComentarios'),
    // Ruta por hallazgos (integrada en los pasos 1 y 2)
    routeSwitch:       document.getElementById('routeSwitch'),
    searchFindings:    document.getElementById('searchFindings'),
    findingsList:      document.getElementById('findingsList'),
    reverseResults:    document.getElementById('reverseResults'),
    findingKindFilters: document.getElementById('findingKindFilters'),
    selectedFindingsWrap: document.getElementById('selectedFindingsWrap'),
    selectedFindings:  document.getElementById('selectedFindings'),
};

/* ─── Registro de pasos (única fuente de verdad del flujo) ───
   Cada paso se identifica por su número (= id del <article> DOM step${num}).
   `present()` decide si el paso aplica al diagnóstico actual (EP no existe en los
   diagnósticos "Riesgo de…"). `kind` 'multi' = selección múltiple con confirmación. */
const inReverse = () => reverse.mode === 'reverse';
const STEPS = [
    // Pasos 1 y 2 dependen de la ruta: por condición clínica (principal) o por hallazgos.
    { num: 1, key: 'identify',
      label:     () => inReverse() ? 'Hallazgos clínicos' : 'Condiciones clínicas',
      container: () => inReverse() ? els.findingsList : els.areas,
      search:    () => inReverse() ? els.searchFindings : els.searchAreas,
      present: () => true },
    { num: 2, key: 'diag',
      label:     () => 'Diagnóstico (NANDA)',
      container: () => els.diagnosticos,
      search:    () => els.searchDiag,
      // En la ruta por hallazgos el diagnóstico se elige del panel lateral en vivo,
      // así que este paso no aparece en el acordeón hasta volver a la ruta principal.
      present: () => !inReverse() || !!selected.diagnostico },
    { num: 3, key: 'rc',    label: () => 'Relacionado con',          container: () => els.rcList,         search: () => els.searchRc,    present: () => (selected.datosDiag?.rc || []).length > 0 },
    { num: 4, key: 'ep',    label: () => 'Evidenciado por',          container: () => els.epList,         search: () => els.searchEp,    present: () => (selected.datosDiag?.ep || []).length > 0 },
    { num: 5, key: 'noc',   label: () => 'Resultado esperado (NOC)', container: () => els.nocs,           search: () => null,            present: () => true },
    { num: 6, key: 'nic',   label: () => 'Intervenciones NIC',       container: () => els.intervenciones, search: () => els.searchNic,   present: () => true },
    { num: 7, key: 'b6',    label: () => 'Evaluación B6',            container: () => els.evaluaciones,   search: () => null,            present: () => true },
];
const stepLabel = (s) => (typeof s.label === 'function' ? s.label() : s.label);
const stepByNum = (n) => STEPS.find((s) => s.num === n);
const activeSteps = () => STEPS.filter((s) => s.present());
const activePos = (n) => activeSteps().findIndex((s) => s.num === n) + 1;  // 1-based
const totalActive = () => activeSteps().length;
const nextActiveNum = (n) => { const a = activeSteps(); const i = a.findIndex((s) => s.num === n); return i >= 0 && i < a.length - 1 ? a[i + 1].num : null; };

function normalizeKeyboardNavigationMode(value) {
    return KEYBOARD_NAVIGATION_MODES.has(value) ? value : 'standard';
}

function readKeyboardNavigationMode() {
    try {
        return normalizeKeyboardNavigationMode(window.localStorage.getItem(KEYBOARD_NAVIGATION_MODE_KEY));
    } catch (_) {
        return 'standard';
    }
}

function persistKeyboardNavigationMode(mode) {
    try {
        window.localStorage.setItem(KEYBOARD_NAVIGATION_MODE_KEY, mode);
        return true;
    } catch (_) {
        return false;
    }
}

function isAgileNavigation() {
    return keyboardNavigationMode === 'agile';
}

function applyKeyboardNavigationMode(value, { persist = false, announce = false } = {}) {
    const mode = normalizeKeyboardNavigationMode(value);
    keyboardNavigationMode = mode;
    document.documentElement.dataset.keyboardNavigation = mode;

    const agile = mode === 'agile';
    if (els.keyboardNavigationMode) {
        els.keyboardNavigationMode.dataset.mode = mode;
        els.keyboardNavigationMode.setAttribute('aria-checked', agile ? 'true' : 'false');
        els.keyboardNavigationMode.title = agile
            ? 'Cambiar a navegación Estándar'
            : 'Cambiar a navegación Ágil';
    }
    if (els.keyboardNavigationModeCurrent) {
        els.keyboardNavigationModeCurrent.textContent = `${agile ? 'Ágil' : 'Estándar'} activo`;
    }
    document.querySelectorAll('[data-navigation-mode-label]').forEach((label) => {
        label.classList.toggle('is-active', label.dataset.navigationModeLabel === mode);
    });
    if (els.shortcutsDialogDescription) {
        els.shortcutsDialogDescription.textContent = agile
            ? 'La navegación Ágil conserva las flechas dentro de cada campo y añade desplazamiento espacial entre campos.'
            : 'La navegación Estándar conserva el recorrido habitual del navegador y todos los controles accesibles.';
    }
    if (els.keyboardNavigationModeDescription) {
        els.keyboardNavigationModeDescription.textContent = agile
            ? 'Tab alterna entre el campo actual y las secciones; Shift + flechas cambia de campo.'
            : 'Tab avanza secuencialmente y Shift + flechas conserva su comportamiento nativo.';
    }
    if (els.shortcutsTabDescription) {
        els.shortcutsTabDescription.textContent = agile
            ? 'Alternar entre el campo actual y las secciones.'
            : 'Avanzar mediante el recorrido estándar.';
    }
    if (els.shortcutsSpatialRow) els.shortcutsSpatialRow.hidden = !agile;
    if (els.keyboardCoach) {
        els.keyboardCoach.innerHTML = agile
            ? '<kbd>Flechas</kbd> dentro del campo · <kbd>Shift</kbd> + <kbd>flechas</kbd> cambiar campo · <kbd>Tab</kbd> secciones · <kbd>Shift</kbd> + <kbd>Enter</kbd> continuar'
            : '<kbd>Tab</kbd> siguiente · <kbd>Shift</kbd> + <kbd>Tab</kbd> anterior · <kbd>Flechas</kbd> dentro del campo · <kbd>Shift</kbd> + <kbd>Enter</kbd> continuar';
    }
    if (persist) persistKeyboardNavigationMode(mode);
    if (announce) announceAction(`Navegación ${agile ? 'Ágil' : 'Estándar'} activada.`);
    return mode;
}

/* ─── Flujo global de Nota de entrega ───
   El PAE conserva su controlador interno; este nivel solo decide qué etapa mayor
   está visible y resume el trabajo ya realizado. */
const FLOW_STAGE_ORDER = ['patient', 'faseB', 'faseC', 'faseD', 'fasePAE', 'faseF'];
// Este latch expresa “Paciente estuvo completo alguna vez”. Un reinicio parcial
// no vuelve a bloquear etapas ya habilitadas; la nota/copia sí exigen validez actual.
let patientGateEverUnlocked = false;

function announceAction(message) {
    if (!message) return;
    if (interactionAnnouncer?.announce) {
        interactionAnnouncer.announce(message);
        return;
    }
    if (!els.actionAnnouncer || els.actionAnnouncer.textContent === message) return;
    els.actionAnnouncer.textContent = '';
    requestAnimationFrame(() => { els.actionAnnouncer.textContent = message; });
}

window.CareFlowAnnounce = announceAction;

function markDraftRevision() {
    if (!revisionTrackingEnabled || suppressRevisionTracking) return;
    noteLifecycle.markChanged();
}

function lifecyclePhase() {
    return noteLifecycle.getPhase();
}

function isConfirmedPhase() {
    return lifecyclePhase() === NoteLifecycle.PHASES.CONFIRMED;
}

function isEditingPhase() {
    return [
        NoteLifecycle.PHASES.EDITING,
        NoteLifecycle.PHASES.REVIEWING_EDIT,
        NoteLifecycle.PHASES.CONFIRMING_EDIT,
    ].includes(lifecyclePhase());
}

function renderPatientContext() {
    const { lookup, identity, hasConfirmed } = noteLifecycle.getContext();
    if (els.patientIdType && els.patientIdType.value !== identity.type) els.patientIdType.value = identity.type;
    if (els.patientIdNumber && els.patientIdNumber.value !== identity.number) els.patientIdNumber.value = identity.number;
    if (els.patientContextPanel) els.patientContextPanel.dataset.lookupStatus = lookup.status;

    const locked = hasConfirmed;
    if (els.patientIdType) {
        els.patientIdType.disabled = locked;
        els.patientIdType.setAttribute('aria-disabled', locked ? 'true' : 'false');
    }
    if (els.patientIdNumber) {
        els.patientIdNumber.readOnly = locked;
        els.patientIdNumber.setAttribute('aria-readonly', locked ? 'true' : 'false');
    }
}

function syncPatientIdentity({ changed = true } = {}) {
    const accepted = noteLifecycle.setIdentity({
        type: els.patientIdType?.value || '',
        number: els.patientIdNumber?.value || '',
    });
    if (!accepted) {
        renderPatientContext();
        return false;
    }
    if (changed) markDraftRevision();
    renderPatientContext();
    return true;
}

function setPatientLookupState(status, message = '', { announce = false } = {}) {
    if (!noteLifecycle.setLookup(status, message)) return false;
    renderPatientContext();
    if (announce && message) announceAction(message);
    return true;
}

/*
 * Punto de integración deliberadamente local y silencioso.
 * Mientras no exista backend ni un esquema confirmado para Recibo, no devuelve
 * pacientes ni aplica datos clínicos simulados. La futura implementación deberá
 * consultar la última nota confirmada del tipo RELATED_NOTE_TYPE y mapear solo
 * los campos clínicos cuya relación haya sido validada por enfermería.
 */
async function findLatestRelatedNoteForPatient(identity) {
    void identity;
    void RELATED_NOTE_TYPE;
    return { status: NoteLifecycle.LOOKUP_STATES.INTEGRATION_PENDING };
}

let patientLookupRequest = 0;

async function verifyPatientOnIdentifierExit() {
    syncPatientIdentity({ changed: false });
    const identity = noteLifecycle.getContext().identity;
    if (!identity.type || !identity.number || noteLifecycle.getConfirmationMeta()) {
        setPatientLookupState(NoteLifecycle.LOOKUP_STATES.IDLE);
        return;
    }

    const request = ++patientLookupRequest;
    setPatientLookupState(NoteLifecycle.LOOKUP_STATES.SEARCHING);
    try {
        const result = await findLatestRelatedNoteForPatient({
            type: identity.type,
            number: identity.number,
            noteType: NOTE_TYPE,
            relatedNoteType: RELATED_NOTE_TYPE,
        });
        const currentIdentity = noteLifecycle.getContext().identity;
        if (request !== patientLookupRequest
            || currentIdentity.type !== identity.type
            || currentIdentity.number !== identity.number) return;
        setPatientLookupState(result?.status || NoteLifecycle.LOOKUP_STATES.NOT_FOUND);
    } catch {
        if (request !== patientLookupRequest) return;
        setPatientLookupState(NoteLifecycle.LOOKUP_STATES.ERROR);
    }
}

function setupPatientContext() {
    renderPatientContext();
    els.patientIdType?.addEventListener('change', () => {
        patientLookupRequest += 1;
        syncPatientIdentity();
        updateNote();
    });
    els.patientIdType?.addEventListener('keydown', (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            const count = els.patientIdType.options.length;
            els.patientIdType.selectedIndex = Math.max(0, Math.min(count - 1, els.patientIdType.selectedIndex + direction));
            syncPatientIdentity({ changed: false });
            updateNote();
            return;
        }
        if (event.key !== 'Enter' || event.shiftKey) return;
        event.preventDefault();
        if (!els.patientIdType.value) {
            announceAction('Seleccione un tipo de identificación.');
            return;
        }
        syncPatientIdentity({ changed: false });
        els.patientIdNumber?.focus();
    });
    els.patientIdNumber?.addEventListener('input', () => {
        patientLookupRequest += 1;
        syncPatientIdentity();
        updateNote();
    });
    els.patientIdNumber?.addEventListener('blur', verifyPatientOnIdentifierExit);
    els.patientIdNumber?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        requestAnimationFrame(() => focusSexo());
    });

    if (new URLSearchParams(window.location.search).get('qa') === '1') {
        window.CareFlowQaPatientLookup = (status) => setPatientLookupState(status);
    }
}

function openAppEditorDraft() {
    const inline = [...document.querySelectorAll('.custom-form-input')]
        .find((input) => input.value.trim() !== (input.dataset.initialValue || '').trim());
    if (inline) return inline;
    const customScale = document.getElementById('b6CustomScale');
    if (!customScale || customScale.hidden || !selected.nocCustom || selected.b6EscalaId !== '__custom__') return null;
    const inputs = [...customScale.querySelectorAll('.b6-cs-input')];
    const current = inputs.map((input) => input.value.trim()).filter(Boolean);
    const saved = (selected.b6CustomNiveles || []).map((value) => String(value).trim()).filter(Boolean);
    return JSON.stringify(current) === JSON.stringify(saved) ? null : (inputs[0] || customScale);
}

function hasUncopiedChanges() {
    return !!noteLifecycle.hasExitRisk() || !!openAppEditorDraft();
}

function blockOnOpenAppEditorDraft() {
    const editor = openAppEditorDraft();
    if (!editor) return false;
    const stageId = editor.closest?.('[data-flow-stage]')?.dataset.flowStage;
    if (stageId && stageId !== activeFlowStage) activateFlowStage(stageId, { focus: false, reason: 'validation' });
    const step = editor.closest?.('.step[data-step]');
    if (step && !step.classList.contains('active')) activateStep(Number(step.dataset.step), { focus: false });
    requestAnimationFrame(() => {
        editor.focus?.();
        scrollSoft(editor, 'nearest');
    });
    announceAction('Confirme o cancele el editor personalizado antes de continuar.');
    return true;
}

function stableFocusId(element) {
    if (!element || !(element instanceof Element)) return '';
    return element.id || element.dataset.focusId || '';
}

function rememberStageFocus(element) {
    const stage = element?.closest?.('[data-flow-stage]');
    const id = stableFocusId(element);
    const actionable = element?.matches?.([
        'input:not([type="hidden"])', 'textarea', 'select',
        'button:not(.reset-icon-btn):not(.clinical-date-cal)',
        '[role="option"]', '[role="radio"]', '[role="gridcell"]',
    ].join(','));
    if (!stage?.dataset.flowStage || !id || !actionable || element.closest('dialog')) return;
    stageFocusMemory.set(stage.dataset.flowStage, id);
}

function restoreStageFocus(stageId) {
    const remembered = stageFocusMemory.get(stageId);
    if (!remembered) return false;
    const target = document.getElementById(remembered)
        || document.querySelector(`[data-focus-id="${CSS.escape(remembered)}"]`);
    const stage = document.querySelector(`[data-flow-stage="${stageId}"]:not([hidden])`);
    if (!target || !stage?.contains(target) || target.closest('[hidden], [inert]')
        || target.disabled || target.getAttribute('aria-disabled') === 'true') return false;
    target.focus();
    scrollSoft(target, 'nearest');
    return true;
}

let pendingDependentChange = null;
let undoTimer = null;
let undoContextRevision = 0;

function ensureDependentChangeDialog() {
    let dialog = document.getElementById('dependentChangeDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'dependentChangeDialog';
    dialog.className = 'reset-dialog dependent-change-dialog';
    dialog.setAttribute('aria-labelledby', 'dependentChangeTitle');
    dialog.setAttribute('aria-describedby', 'dependentChangeDescription');
    dialog.innerHTML = `
        <div class="reset-dialog-icon" aria-hidden="true">!</div>
        <h2 id="dependentChangeTitle">Confirmar cambio</h2>
        <p id="dependentChangeDescription"></p>
        <div class="reset-dialog-actions" data-dialog-actions>
            <button type="button" class="reset-dialog-cancel" data-dependent-cancel>Cancelar</button>
            <button type="button" class="reset-dialog-section" data-dependent-confirm>Aplicar cambio</button>
        </div>`;
    document.body.appendChild(dialog);
    setupDialogActionNavigation(dialog);
    const cancel = dialog.querySelector('[data-dependent-cancel]');
    const confirm = dialog.querySelector('[data-dependent-confirm]');
    cancel.addEventListener('click', () => dialog.close('cancel'));
    confirm.addEventListener('click', () => dialog.close('confirm'));
    dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        dialog.close('cancel');
    });
    dialog.addEventListener('close', () => {
        interactionOverlays?.remove('dependent-change', { restoreFocus: false });
        const request = pendingDependentChange;
        pendingDependentChange = null;
        if (!request) return;
        if (dialog.returnValue === 'confirm') request.onConfirm();
        else {
            request.onCancel?.();
            requestAnimationFrame(() => {
                if (!request.trigger?.isConnected) return;
                request.trigger.focus?.({ preventScroll: true });
                request.trigger.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
            });
        }
    });
    return dialog;
}

function requestDependentChange({ title, description, confirmLabel = 'Aplicar cambio', trigger, onConfirm, onCancel }) {
    const dialog = ensureDependentChangeDialog();
    pendingDependentChange = { trigger: trigger || document.activeElement, onConfirm, onCancel };
    dialog.querySelector('#dependentChangeTitle').textContent = title;
    dialog.querySelector('#dependentChangeDescription').textContent = description;
    dialog.querySelector('[data-dependent-confirm]').textContent = confirmLabel;
    dialog.returnValue = '';
    if (interactionOverlays && !interactionOverlays.get('dependent-change')) {
        interactionOverlays.push({
            id: 'dependent-change',
            element: dialog,
            invoker: trigger || document.activeElement,
            modal: true,
            onClose: () => { if (dialog.open) dialog.close('cancel'); },
        });
    }
    dialog.showModal();
    requestAnimationFrame(() => dialog.querySelector('[data-dependent-cancel]')?.focus());
}

function runDependentChange(options) {
    if (!interactionChanges) {
        requestDependentChange(options);
        return Promise.resolve({ status: 'pending' });
    }
    return interactionChanges.run({
        requiresConfirmation: true,
        confirm: () => new Promise((resolve) => {
            requestDependentChange({
                ...options,
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false),
            });
        }),
        apply: () => {
            cancelPendingUndo();
            return options.onConfirm();
        },
    });
}

function cancelPendingUndo() {
    undoContextRevision += 1;
    clearTimeout(undoTimer);
    undoTimer = null;
    const toast = document.getElementById('undoToast');
    if (!toast) return;
    toast.hidden = true;
    const button = toast.querySelector('[data-undo-action]');
    if (button) button.onclick = null;
}

function offerUndo(message, undo) {
    let toast = document.getElementById('undoToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'undoToast';
        toast.className = 'undo-toast';
        toast.innerHTML = '<span data-undo-message></span><button type="button" data-undo-action>Deshacer</button>';
        document.body.appendChild(toast);
    }
    clearTimeout(undoTimer);
    const contextRevision = undoContextRevision;
    const button = toast.querySelector('[data-undo-action]');
    toast.querySelector('[data-undo-message]').textContent = message;
    toast.hidden = false;
    button.onclick = () => {
        if (contextRevision !== undoContextRevision) return;
        clearTimeout(undoTimer);
        toast.hidden = true;
        undo();
        announceAction('Acción deshecha.');
    };
    undoTimer = setTimeout(() => { toast.hidden = true; }, 8000);
    announceAction(`${message}. Puede deshacer durante ocho segundos.`);
}

window.CareFlowUndo = offerUndo;
window.CareFlowCancelUndo = cancelPendingUndo;
window.CareFlowConfirmChange = runDependentChange;

let allowNavigationOnce = false;

function setupExitGuard() {
    window.addEventListener('beforeunload', (event) => {
        if (allowNavigationOnce || !hasUncopiedChanges()) return;
        event.preventDefault();
        event.returnValue = '';
    });

    document.addEventListener('click', (event) => {
        if (allowNavigationOnce) return;
        if (!hasUncopiedChanges()) return;
        const link = event.target.closest('a[href]');
        const logout = event.target.closest('[data-cf-logout]');
        if ((!link || link.target === '_blank' || link.hasAttribute('download')) && !logout) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        runDependentChange({
            title: '¿Salir de esta nota?',
            description: (() => {
                const risk = noteLifecycle.hasExitRisk();
                if (risk === 'uncopied') {
                    return 'La nota está confirmada, pero todavía no se ha copiado al sistema institucional. Si sale ahora, esta versión local se perderá.';
                }
                if (risk === 'editing') {
                    return 'Hay cambios pendientes de confirmación. Si sale ahora, la edición se perderá y CareFlow no podrá recuperarla sin backend.';
                }
                return 'Hay un borrador sin confirmar. Si sale ahora, se perderá porque CareFlow todavía no lo almacena.';
            })(),
            confirmLabel: 'Salir de la nota',
            trigger: logout || link,
            onConfirm: () => {
                allowNavigationOnce = true;
                if (logout) logout.click();
                else window.location.assign(link.href);
                window.setTimeout(() => { allowNavigationOnce = false; }, 1000);
            },
        });
    }, true);
}

function isPatientGateUnlocked() {
    if (!patientGateEverUnlocked && flowStageState('patient').complete) patientGateEverUnlocked = true;
    return patientGateEverUnlocked;
}

function syncIssueAccessibility(issues) {
    const activeControls = new Set();
    issues.forEach((issue) => {
        if (!validatedStages.has(issue.stageId) || !issue.controlId) return;
        const control = document.getElementById(issue.controlId);
        if (!control) return;
        activeControls.add(control);
        // Los componentes que ya exponen aria-invalid conservan su propiedad del
        // estado; el registro global solo crea y luego retira atributos propios.
        if (!control.hasAttribute('aria-invalid')) control.dataset.careflowOwnedInvalid = 'true';
        control.setAttribute('aria-invalid', 'true');
        if (!control.hasAttribute('aria-errormessage')) {
            const errorId = `careflow-error-${issue.controlId}`;
            let error = document.getElementById(errorId);
            if (!error) {
                error = document.createElement('span');
                error.id = errorId;
                error.className = 'sr-only';
                error.dataset.careflowIssueMessage = 'true';
                control.insertAdjacentElement('afterend', error);
            }
            error.textContent = issue.message;
            control.setAttribute('aria-errormessage', errorId);
            control.dataset.careflowOwnedErrorMessage = 'true';
        }
    });
    document.querySelectorAll('[data-careflow-owned-invalid="true"]').forEach((control) => {
        if (activeControls.has(control)) return;
        control.removeAttribute('aria-invalid');
        delete control.dataset.careflowOwnedInvalid;
        if (control.dataset.careflowOwnedErrorMessage === 'true') {
            document.getElementById(control.getAttribute('aria-errormessage'))?.remove();
            control.removeAttribute('aria-errormessage');
            delete control.dataset.careflowOwnedErrorMessage;
        }
    });
}

function collectFormIssues() {
    const issues = [];
    const add = (issue) => issues.push(issue);
    if (!els.patientIdType?.value) {
        add({
            id: 'app-patient-id-type', stageId: 'patient', controlId: 'patientIdType', type: 'missing',
            message: 'Tipo de identificación', order: 0,
            focus: () => { els.patientIdType?.focus(); return true; },
        });
    }
    if (!els.patientIdNumber?.value?.trim()) {
        add({
            id: 'app-patient-id-number', stageId: 'patient', controlId: 'patientIdNumber', type: 'missing',
            message: 'Número de identificación', order: 1,
            focus: () => { els.patientIdNumber?.focus(); return true; },
        });
    }
    const sexMissing = !els.sexo || els.sexo.value === '___';
    if (sexMissing) {
        add({
            id: 'app-patient-sex', stageId: 'patient', controlId: 'sexoSeg', type: 'missing',
            message: 'Sexo del paciente', order: 2,
            focus: () => {
                document.getElementById('sexoSeg')?.querySelector('[role="radio"]')?.focus();
                return true;
            },
        });
    }
    const dob = validateDOB();
    if (!dob.valid) {
        add({
            id: 'app-patient-dob', stageId: 'patient', controlId: 'dobFecha',
            type: els.dobFecha?.value?.trim() ? 'invalid' : 'missing',
            message: 'Fecha de nacimiento válida', order: 3,
            focus: (options = {}) => {
                els.dobFecha?.focus();
                if (options.report !== false) els.dobFecha?._notaDateControl?.reportValidity?.();
                return true;
            },
        });
    }

    const clinicalByStage = new Map();
    (window.NotaCampos?.getIssues?.() || []).forEach((issue) => {
        const stageId = issue.stageId === 'faseA' ? 'patient' : issue.stageId;
        const count = clinicalByStage.get(stageId) || 0;
        clinicalByStage.set(stageId, count + 1);
        const bucketOffset = issue.bucket === 'cierre' ? 70 : 10;
        add({ ...issue, id: `clinical-${issue.id}`, stageId, order: bucketOffset + count });
    });

    activeSteps().forEach((step, index) => {
        if (stepHasSelection(step.num)) return;
        add({
            id: `app-pae-step-${step.num}`,
            stageId: 'fasePAE',
            controlId: step.search?.()?.id || step.container?.()?.id || `step${step.num}`,
            type: 'missing',
            message: `${stepLabel(step)} (PAE, paso ${activePos(step.num)})`,
            order: index,
            focus: () => {
                goToStepSection(step.num);
                return true;
            },
        });
    });

    if (!els.metaLograda?.value) {
        add({
            id: 'app-fasef-meta', stageId: 'faseF', controlId: 'metaSeg', type: 'missing',
            message: 'Estado de la meta (NOC) al cierre', order: 60,
            focus: () => { focusMeta(); return true; },
        });
    }
    const ordered = issues.sort((a, b) => {
        const stageDiff = FLOW_STAGE_ORDER.indexOf(a.stageId) - FLOW_STAGE_ORDER.indexOf(b.stageId);
        return stageDiff || (a.order ?? 0) - (b.order ?? 0);
    });
    interactionIssues?.replace('delivery-form', ordered);
    syncIssueAccessibility(ordered);
    return ordered;
}

function flowStageState(id) {
    const nc = window.NotaCampos;
    const missing = collectFormIssues().filter((issue) => issue.stageId === id).map((issue) => issue.message);
    let summary = '';

    if (id === 'patient') {
        const s = nc?.state;
        summary = [s?.numHabitacion ? `Hab. ${s.numHabitacion}` : '', s?.servicio || ''].filter(Boolean).join(' · ');
    } else if (id === 'faseB' || id === 'faseC' || id === 'faseD') {
        summary = nc?.phaseStatus()?.[id]?.summary || '';
    } else if (id === 'fasePAE') {
        summary = selected.diagnosticoNombre || selected.areaNombre || '';
    } else if (id === 'faseF') {
        summary = nc?.state?.tendencia || '';
    }

    return { complete: missing.length === 0, missing, summary };
}

function updateFlowNavigator() {
    const unlocked = isPatientGateUnlocked();
    FLOW_STAGE_ORDER.forEach((id) => {
        const btn = document.querySelector(`[data-flow-target="${id}"]`);
        if (!btn) return;
        const state = flowStageState(id);
        const locked = id !== 'patient' && !unlocked;
        btn.disabled = locked;
        btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
        btn.setAttribute('aria-selected', id === activeFlowStage ? 'true' : 'false');
        btn.tabIndex = !locked && id === flowNavRovingId ? 0 : -1;
        const stage = document.querySelector(`[data-flow-stage="${id}"]`);
        if (stage) stage.inert = locked;
        btn.classList.toggle('flow-nav-item--complete', state.complete);
        btn.classList.toggle('flow-nav-item--active', id === activeFlowStage);
        if (id === activeFlowStage) btn.setAttribute('aria-current', 'step');
        else btn.removeAttribute('aria-current');
        const summary = btn.querySelector(`[data-flow-summary="${id}"]`);
        if (summary) {
            const text = locked ? 'Bloqueado' : state.complete ? (state.summary || 'Completo') : id === activeFlowStage ? 'En curso' : (state.summary || 'Pendiente');
            summary.textContent = text.length > 38 ? `${text.slice(0, 38)}…` : text;
        }
    });
}

function focusFlowStageEntry(id, reason = 'advance') {
    const issue = collectFormIssues().find((entry) => entry.stageId === id);
    if (issue?.focus) {
        issue.focus({ report: false });
        return;
    }
    if (reason === 'correction' && restoreStageFocus(id)) return;
    if (id === 'patient') {
        const target = els.patientIdType || document.getElementById('sexoSeg')?.querySelector('[role="radio"]');
        target?.focus();
    } else if (id === 'fasePAE') {
        focusStepEntry(currentStep);
    } else {
        window.NotaCampos?.focusPhase(id, 1);
    }
}

function activateFlowStage(id, opts = {}) {
    if (!FLOW_STAGE_ORDER.includes(id)) return false;
    if (id !== 'patient' && !isPatientGateUnlocked()) {
        const message = document.querySelector('[data-flow-message="patient"]');
        if (message) message.textContent = 'Complete los datos del paciente para habilitar las demás secciones.';
        return false;
    }
    const previousStage = activeFlowStage;
    document.querySelectorAll('[data-flow-stage]').forEach((stage) => {
        stage.hidden = stage.dataset.flowStage !== id;
    });
    activeFlowStage = id;
    if (previousStage !== id) {
        interactionMetrics?.record('stage-transition', {
            from: previousStage,
            to: id,
            modality: interactionOrigin?.current?.({ maxAge: 1500 }) || 'programmatic',
        });
    }
    flowNavRovingId = id;
    if (id !== 'fasePAE') reversePanelContext = false;
    window.NotaCampos?.closeMenus?.();
    updateFlowNavigator();
    updateLayout();
    const stage = document.querySelector(`[data-flow-stage="${id}"]`);
    stage?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    requestAnimationFrame(() => syncVisibleOptionGrids(stage));
    if (opts.focus !== false) focusFlowStageEntry(id, opts.reason || 'advance');
    return true;
}

function focusPatientPending() {
    const s = window.NotaCampos?.state;
    const target = !els.patientIdType?.value ? els.patientIdType
        : !els.patientIdNumber?.value?.trim() ? els.patientIdNumber
        : (!els.sexo || els.sexo.value === '___') ? document.getElementById('sexoSeg')?.querySelector('[role="radio"]')
        : !validateDOB().valid ? els.dobFecha
        : !s?.posicion ? document.getElementById('posicion')
        : !s?.numCama ? document.getElementById('numCama')
        : !s?.numHabitacion ? document.getElementById('numHabitacion')
        : !s?.servicio ? document.getElementById('servicio') : null;
    if (target?.id === 'posicion' || target?.id === 'servicio') {
        window.NotaCampos?.reportField?.(target.id);
    }
    target?.focus();
    scrollSoft(target);
    return !!target;
}

function continueFlowStage(id, { focus = true } = {}) {
    validatedStages.add(id);
    window.NotaCampos?.commitDrafts?.(id);
    const state = flowStageState(id);
    interactionMetrics?.record('validation', {
        stageId: id,
        outcome: state.complete ? 'passed' : 'blocked',
        count: state.missing.length,
    });
    const message = document.querySelector(`[data-flow-message="${id}"]`);
    if (!state.complete) {
        if (message) message.textContent = `Pendiente: ${state.missing[0]}`;
        announceAction(`${state.missing.length} pendiente${state.missing.length === 1 ? '' : 's'}. Primero: ${state.missing[0]}.`);
        const issue = interactionIssues?.first({ stageId: id })
            || collectFormIssues().find((entry) => entry.stageId === id);
        if (issue?.focus) issue.focus();
        else if (id === 'patient') focusPatientPending();
        else window.NotaCampos?.focusFirstPending(id);
        return false;
    }
    if (message) message.textContent = '';
    const index = FLOW_STAGE_ORDER.indexOf(id);
    const next = FLOW_STAGE_ORDER[index + 1];
    if (next) activateFlowStage(next, { focus, reason: 'advance' });
    else if (id === 'faseF') toggleNote(true);
    return true;
}

function setupGlobalFlow() {
    const nav = document.getElementById('flowNav');
    const buttons = [...document.querySelectorAll('[data-flow-target]')];
    buttons.forEach((btn) => {
        btn.addEventListener('click', (event) => activateFlowStage(btn.dataset.flowTarget, {
            focus: shouldMoveFocusAfterActivation(event),
            reason: 'correction',
        }));
    });
    nav?.addEventListener('keydown', (event) => {
        const current = event.target.closest('[data-flow-target]');
        if (!current) return;
        if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
        const available = buttons.filter((button) => !button.disabled);
        const index = available.indexOf(current);
        let target = null;
        if (event.key === 'ArrowRight' && index < available.length - 1) target = available[index + 1];
        else if (event.key === 'ArrowLeft' && index > 0) target = available[index - 1];
        else if (event.key === 'Home') target = available[0];
        else if (event.key === 'End') target = available[available.length - 1];
        else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            enterFromFlowNavigator(current);
            return;
        }
        if (!target) return;
        event.preventDefault();
        flowNavRovingId = target.dataset.flowTarget;
        buttons.forEach((button) => { button.tabIndex = button === target ? 0 : -1; });
        target.focus();
        target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
    });
    document.querySelectorAll('[data-flow-continue]').forEach((btn) => {
        btn.addEventListener('click', (event) => continueFlowStage(btn.dataset.flowContinue, {
            focus: shouldMoveFocusAfterActivation(event),
        }));
    });
    activateFlowStage('patient', { focus: false });
}

function isEditableElement(el) {
    const tag = el?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable;
}

function activateOptionWithIntent(option, advance) {
    if (!option) return;
    const previous = optionActivationAdvances;
    optionActivationAdvances = advance;
    try { option.click(); }
    finally { optionActivationAdvances = previous; }
}

function shouldAdvanceOption() {
    return optionActivationAdvances !== false;
}

function shouldMoveFocusAfterActivation(event) {
    if (optionActivationAdvances !== null) return true;
    if (event?.detail === 0) return true;
    const origin = interactionOrigin?.current?.({ maxAge: 1200 });
    return !['mouse', 'touch', 'pen'].includes(origin);
}

/* ─── ¿El paso tiene selección válida? ─── */
function stepHasSelection(n) {
    switch (n) {
        case 1: return inReverse() ? reverse.findingKeys.length > 0 : selected.area !== null;
        case 2: return selected.diagnostico !== null;
        case 3: return selected.rc.length > 0;
        case 4: return selected.ep.length > 0;
        case 5: return selected.noc !== null;
        case 6: return selected.nics.length > 0;
        case 7: return selected.b6Puntuacion !== null;
        default: return false;
    }
}

/* ─── Texto resumen corto para el header del paso completado ─── */
function getSummaryForStep(n) {
    const multiSummary = (arr, sing, plur) => arr.length === 1 ? `1 ${sing}` : `${arr.length} ${plur}`;
    switch (n) {
        case 1:
            return inReverse()
                ? multiSummary(reverse.findingKeys, 'hallazgo', 'hallazgos')
                : (selected.areaNombre || '');
        case 2: {
            const d = selected.diagnosticoNombre || '';
            return d.length > 52 ? d.slice(0, 52) + '…' : d;
        }
        case 3: return multiSummary(selected.rc, 'factor relacionado', 'factores relacionados');
        case 4: return multiSummary(selected.ep, 'signo/síntoma', 'signos/síntomas');
        case 5: {
            const n3 = selected.nocNombre || '';
            return n3.length > 48 ? n3.slice(0, 48) + '…' : n3;
        }
        case 6: return multiSummary(selected.nics, 'NIC seleccionada', 'NIC seleccionadas');
        case 7: {
            if (!selected.b6Puntuacion) return '';
            const raw = selected.b6Descripcion || '';
            const label = raw.replace(/^\d+\s*[.,\-=:]\s*/, '');
            return `Nivel ${selected.b6Puntuacion} — ${label}`;
        }
        default: return '';
    }
}

/* ─── Actualiza los resúmenes en headers de pasos completados ─── */
function updateStepSummaries() {
    STEPS.forEach((s) => {
        const stepEl = document.getElementById(`step${s.num}`);
        if (!stepEl) return;
        const summaryEl = stepEl.querySelector('.step-summary');
        if (!summaryEl) return;
        summaryEl.textContent = stepEl.classList.contains('completed') ? getSummaryForStep(s.num) : '';
    });
}

/* ─── Actualiza barra de progreso y label textual (sobre los pasos activos) ─── */
function updateProgress() {
    const total = totalActive();
    const pos = activePos(currentStep);
    let pct = total ? ((pos - 1) / total) * 100 : 0;
    if (selected.b6Puntuacion) pct = 100;
    els.progressFill.style.width = `${pct}%`;
    els.progressFill.parentElement?.setAttribute('aria-valuenow', String(Math.round(pct)));

    if (els.progressLabel) {
        if (inReverse() && !selected.diagnostico) {
            // Identificación por hallazgos: el progreso depende del diagnóstico aún no elegido
            els.progressLabel.textContent = 'Identifique el diagnóstico por signos y factores';
        } else {
            els.progressLabel.textContent = selected.b6Puntuacion
                ? 'PAE completado ✓'
                : `PAE — Paso ${pos} de ${total} — ${(() => { const s = stepByNum(currentStep); return s ? stepLabel(s) : ''; })()}`;
        }
    }
}

/* ─── Activa un paso y marca como completados los anteriores con selección válida ───
   Oculta los pasos no presentes (p. ej. EP en diagnósticos "Riesgo de…"). */
function syncStepHeaderAction(header, interactive) {
    if (!header) return;
    if (interactive) {
        header.setAttribute('role', 'button');
        header.setAttribute('tabindex', '0');
        header.setAttribute('aria-expanded', 'false');
    } else {
        header.removeAttribute('role');
        header.removeAttribute('tabindex');
        header.removeAttribute('aria-expanded');
    }
}

function activateStep(n, opts = {}) {
    STEPS.forEach((s) => {
        const stepEl = document.getElementById(`step${s.num}`);
        if (!stepEl) return;
        const header = stepEl.querySelector('.step-header');

        // Pasos que no aplican al diagnóstico actual: ocultos y fuera del flujo
        if (!s.present()) {
            stepEl.hidden = true;
            stepEl.classList.remove('active', 'completed');
            syncStepHeaderAction(header, false);
            return;
        }
        stepEl.hidden = false;
        stepEl.classList.remove('active');

        // Badge contiguo según posición en el flujo activo (EP oculto no deja hueco)
        const badge = stepEl.querySelector('.step-badge');
        if (badge) badge.textContent = String(activePos(s.num));

        // Título dinámico (pasos 1 y 2 cambian según la ruta)
        const titleEl = stepEl.querySelector('[data-step-title]');
        if (titleEl) titleEl.textContent = stepLabel(s);

        if (s.num < n && stepHasSelection(s.num)) {
            stepEl.classList.add('completed');
        } else if (s.num === n) {
            stepEl.classList.remove('completed');
        } else {
            if (!stepHasSelection(s.num)) stepEl.classList.remove('completed');
        }
        syncStepHeaderAction(header, stepEl.classList.contains('completed'));
    });

    const stepEl = document.getElementById(`step${n}`);
    stepEl?.classList.add('active');
    currentStep = n;
    if (n !== 1) reversePanelContext = false;
    rememberLogicalSection(n);
    if (n > maxReachedStep) maxReachedStep = n;
    updateProgress();
    updateStepSummaries();

    // Al (re)entrar a un paso multi-select, refrescar su botón de confirmación
    if (n === 3) updateRcConfirmBtn();
    if (n === 4) updateEpConfirmBtn();
    if (n === 6) updateNicConfirmBtn();

    syncNotePanelHeight();
    updateLayout();
    // La estructura ARIA debe estar estable antes de entregar el foco. Mover una
    // opción enfocada entre filas puede hacer que el navegador lo envíe a <body>.
    syncVisibleOptionGrids(stepEl);

    if (opts.focus) {
        scrollSoft(stepEl, 'nearest');   // acompaña visualmente al usuario
        focusStepEntry(n);
    }
}

/* ─── Fecha de nacimiento: usa el mismo campo clínico DD/MM/AAAA de dispositivos ─── */
function todayIsoLocal() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/* Calcula el texto de edad apropiado según el rango etario */
function calcAgeText(birthDate, today) {
    let years = today.getFullYear() - birthDate.getFullYear();
    const bdThisYear = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
    if (today < bdThisYear) years--;

    if (years >= 2) return `${years} años`;

    let months = (today.getFullYear() - birthDate.getFullYear()) * 12
               + (today.getMonth() - birthDate.getMonth());
    if (today.getDate() < birthDate.getDate()) months--;
    if (months < 0) months = 0;

    if (months >= 1) return months === 1 ? '1 mes' : `${months} meses`;

    const days = Math.floor((today - birthDate) / 86400000);
    return days === 1 ? '1 día' : `${days} días`;
}

/* Valida la fecha de nacimiento y devuelve { valid, ageText, errorMsg } */
function validateDOB() {
    // El campo es un input de texto DD/MM/AAAA; el ISO (fuente de verdad) vive en dataset.iso
    const value = els.dobFecha?.dataset.iso || '';
    if (!value) return { valid: false, ageText: '', errorMsg: '' };
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const common = window.NotaCampos?.validateDate(value, { min: '1900-01-01', max: todayIsoLocal(), required: true });
    if (!common?.valid) return { valid: false, ageText: '', errorMsg: common?.message || 'Fecha de nacimiento inválida' };
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return { valid: false, ageText: '', errorMsg: 'Use una fecha con año de cuatro dígitos' };
    const anio = Number(match[1]);
    const mes = Number(match[2]);
    const dia = Number(match[3]);
    const birth = new Date(anio, mes - 1, dia);
    if (birth > todayStart) {
        return { valid: false, ageText: '', errorMsg: 'La fecha de nacimiento no puede ser futura' };
    }

    return { valid: true, ageText: calcAgeText(birth, todayStart), errorMsg: '' };
}

/* Actualiza el estado de error del DOB y propaga cambios.
   La edad válida NO se muestra aquí — solo aparece en la nota generada. */
function onDobChange(dateValidation) {
    const result = dateValidation && !dateValidation.valid && !dateValidation.empty
        ? { valid: false, ageText: '', errorMsg: dateValidation.message }
        : validateDOB();
    const fb     = els.dobFeedback;
    els.dobFecha?.classList.toggle('clinical-date-invalid', !!result.errorMsg);
    if (result.errorMsg) {
        if (fb) { fb.textContent = result.errorMsg; fb.className = 'dob-feedback error'; }
    } else if (result.valid) {
        // Edad visible junto a la fecha: el usuario confirma el dato sin buscarlo en la nota
        if (fb) { fb.textContent = `Edad: ${result.ageText}`; fb.className = 'dob-feedback ok'; }
    } else {
        if (fb) { fb.textContent = ''; fb.className = 'dob-feedback'; }
    }

    updateNote();
    syncNotePanelHeight();
}

/* ─── Grupo segmentado genérico (radiogroup) ───
   ←/→ cambian la opción dentro del campo; los bordes no hacen wrap. */
function setupSegmentedGroup(group, hidden, { onChange, onConfirm } = {}) {
    if (!group || !hidden) return;
    const btns = [...group.querySelectorAll('[role="radio"]')];

    const select = (btn) => {
        if (!btn) return;
        btns.forEach((b) => {
            const on = b === btn;
            b.setAttribute('aria-checked', on ? 'true' : 'false');
            b.tabIndex = on ? 0 : -1;
        });
        hidden.value = btn.dataset.value;
        if (onChange) onChange();
    };

    group.addEventListener('click', (e) => {
        const btn = e.target.closest('[role="radio"]');
        if (btn) { select(btn); btn.focus(); }
    });

    group.addEventListener('keydown', (e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key.startsWith('Arrow') && (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey)) return;
        const idx = btns.indexOf(document.activeElement);
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            const next = btns[Math.min(Math.max(idx, 0) + 1, btns.length - 1)];
            if (next) { select(next); next.focus(); }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const prev = btns[Math.max(idx - 1, 0)];
            if (prev) { select(prev); prev.focus(); }
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
        } else if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            const edge = e.key === 'Home' ? btns[0] : btns.at(-1);
            select(edge); edge.focus();
        } else if (e.key === ' ') {
            e.preventDefault();
            const cur = btns[idx] || btns[0];
            select(cur); cur.focus();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const cur = btns[idx] || btns[0];
            select(cur);
            if (onConfirm) onConfirm(); else cur.focus();
        }
    });
}

/* Sexo: respalda el valor en #sexo (hidden) conservando el centinela '___'.
   Enter confirma y avanza al campo de fecha de nacimiento. */
function setupSexoControl() {
    const toDate = () => { els.dobFecha?.focus(); };
    setupSegmentedGroup(document.getElementById('sexoSeg'), els.sexo, {
        onChange: updateNote,
        onConfirm: toDate,
    });
}

/* Meta: respalda el valor en #metaLograda (hidden), '' = sin elegir.
   Enter confirma y avanza al criterio clínico. */
function setupMetaControl() {
    const toCriterio = () => { const c = document.getElementById('criterioClinico'); c?.focus(); scrollSoft(c); };
    setupSegmentedGroup(document.getElementById('metaSeg'), els.metaLograda, {
        onChange: updateNote,
        onConfirm: toCriterio,
    });
}

/* Enfoca el chip tabulable del estado de meta (encadena el cierre tras elegir B6) */
function focusMeta() {
    const group = document.getElementById('metaSeg');
    if (!group) return;
    const target = group.querySelector('[role="radio"][tabindex="0"]') || group.querySelector('[role="radio"]');
    target?.focus();
}

/* Enfoca el chip tabulable de Sexo (vuelta atrás desde el campo de día) */
function focusSexo() {
    const group = document.getElementById('sexoSeg');
    const target = group?.querySelector('[role="radio"][tabindex="0"]') || group?.querySelector('[role="radio"]');
    target?.focus();
}

/* Configura navegación por teclado, auto-avance y formato de los campos DOB */
function setupDobNavigation() {
    const field = els.dobFecha;
    const next = document.getElementById('posicion') || els.servicio;
    if (!field) return;
    window.NotaCampos?.setupDateInput(field, (_value, result) => onDobChange(result), {
        required: true,
        min: '1900-01-01',
        max: todayIsoLocal(),
        nextFocus: () => {
            next?.focus();
            next?.select?.();
        },
    });
}

/* ─── Ajusta el techo del panel de nota al alto real del workflow ─── */
function syncNotePanelHeight() {
    const noteSection  = document.querySelector('.note-section');
    const noteContent  = document.getElementById('noteContent');
    if (!noteSection || !noteContent) return;
    noteSection.style.maxHeight = `${window.innerHeight}px`;
    noteContent.style.maxHeight = 'none';
}

/* ─── Decide qué panel lateral se muestra y el ancho del formulario ───
   Ruta por hallazgos (aún sin diagnóstico) → diagnósticos posibles en vivo.
   Nota completa → panel de nota. En otro caso, formulario a todo el ancho. */
function updateLayout() {
    const showDx = activeFlowStage === 'fasePAE'
        && currentStep === 1
        && inReverse()
        && !selected.diagnostico
        && reversePanelContext;
    if (els.dxLive) els.dxLive.hidden = !showDx;
    if (els.noteSection && els.noteSection.tagName !== 'DIALOG') els.noteSection.hidden = !noteVisible;
    document.querySelector('.content')?.classList.toggle('has-aside', showDx);
    document.querySelector('.container')?.classList.toggle('container--with-aside', showDx);
    document.querySelector('.cf-page-head')?.classList.toggle('page-head--with-aside', showDx);
    syncDxLiveOffset();
}

function syncDxLiveOffset() {
    if (!els.dxLive) return;
    const step1 = document.getElementById('step1');
    const content = document.querySelector('.content');
    const stacked = window.matchMedia?.('(max-width: 860px)').matches;
    if (!step1 || !content || stacked || els.dxLive.hidden) {
        els.dxLive.style.removeProperty('--dx-live-offset');
        return;
    }
    const offset = Math.max(0, step1.getBoundingClientRect().top - content.getBoundingClientRect().top);
    els.dxLive.style.setProperty('--dx-live-offset', `${Math.round(offset)}px`);
}

/* ─── Muestra u oculta el bloque de estado de meta ─── */
function showMetaBlock(visible = true) {
    if (!els.metaBlock) return;
    els.metaBlock.hidden = false;
    syncNotePanelHeight();
    if (visible && activeFlowStage === 'faseF') scrollSoft(els.metaBlock, 'nearest');
}

/* ─── Colapsa el último paso (B6) sin avanzar a un paso inexistente ─── */
function collapseStep5() {
    const b6El = document.getElementById('step7');
    if (!b6El) return;
    b6El.classList.add('completed');
    b6El.classList.remove('active');
    const header = b6El.querySelector('.step-header');
    syncStepHeaderAction(header, true);
    updateProgress();
    updateStepSummaries();
    syncNotePanelHeight();
}

/* ─── Habilita la navegación regresiva haciendo clic en los headers completados ─── */
function enableStepNavigation() {
    STEPS.forEach((s) => {
        const stepEl = document.getElementById(`step${s.num}`);
        if (!stepEl) return;
        const header = stepEl.querySelector('.step-header');
        if (!header) return;

        const handleNav = (event) => {
            if (!stepEl.classList.contains('completed')) return;
            const moveFocus = !event || event.type === 'keydown' || shouldMoveFocusAfterActivation(event);
            goToStepSection(s.num, -1, moveFocus);
        };

        header.addEventListener('click', handleNav);
        header.addEventListener('keydown', (e) => {
            if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleNav(e);
            }
        });
    });
}

/* ─── Botón de confirmación de un paso multi-select (NIC, RC, EP) ─── */
function updateMultiConfirmBtn(btn, hint, count, hintZero, sing, plur) {
    if (!btn) return;
    if (count === 0) {
        btn.disabled = true;
        if (hint) hint.textContent = hintZero;
    } else {
        btn.disabled = false;
        if (hint) hint.textContent = count === 1 ? `1 ${sing}` : `${count} ${plur}`;
    }
}
function updateNicConfirmBtn() {
    updateMultiConfirmBtn(els.nicConfirmBtn, els.nicConfirmHint, selected.nics.length,
        'Seleccione al menos una intervención', 'intervención seleccionada', 'intervenciones seleccionadas');
}
function updateRcConfirmBtn() {
    updateMultiConfirmBtn(els.rcConfirmBtn, els.rcConfirmHint, selected.rc.length,
        'Seleccione al menos un factor relacionado', 'factor seleccionado', 'factores seleccionados');
}
function updateEpConfirmBtn() {
    updateMultiConfirmBtn(els.epConfirmBtn, els.epConfirmHint, selected.ep.length,
        'Seleccione al menos un signo o síntoma', 'signo/síntoma seleccionado', 'signos/síntomas seleccionados');
}

/* ─── Toggle de visibilidad de la nota clínica ─── */
function toggleNote(force, invoker = null) {
    const next = typeof force === 'boolean' ? force : !noteVisible;
    if (next && blockOnOpenAppEditorDraft()) return;
    if (next) {
        const confirmedCommit = isConfirmedPhase();
        if (confirmedCommit) suppressRevisionTracking = true;
        window.NotaCampos?.commitDrafts?.();
        if (confirmedCommit) suppressRevisionTracking = false;
    }
    if (next && !isNoteComplete().complete) {
        const issue = collectFormIssues()[0];
        if (issue) {
            validatedStages.add(issue.stageId);
            collectFormIssues();
            activateFlowStage(issue.stageId, { focus: false, reason: 'validation' });
            issue.focus?.();
            announceAction(`No se puede revisar. Primero: ${issue.message}.`);
        }
        updateCopyBtnState();
        return;
    }
    if (next) noteLifecycle.openReview({ complete: true });
    const nativeDialog = els.noteSection?.tagName === 'DIALOG' && typeof els.noteSection.showModal === 'function';
    if (next === noteVisible && (nativeDialog ? els.noteSection?.open === next : els.noteSection?.hidden === !next)) return;
    noteVisible = next;

    if (noteVisible) {
        const confirmed = noteLifecycle.getConfirmed();
        if (isConfirmedPhase() && confirmed?.noteHtml) els.noteContent.innerHTML = confirmed.noteHtml;
        window.NotaCampos?.closeMenus?.();
        previewReturnFocus = invoker?.isConnected ? invoker : document.activeElement;
        if (interactionOverlays && !interactionOverlays.get('note-review')) {
            interactionOverlays.push({
                id: 'note-review',
                element: els.noteSection,
                invoker: previewReturnFocus,
                modal: true,
                onClose: () => toggleNote(false),
            });
        }
        if (nativeDialog) {
            els.noteSection.removeAttribute('hidden');
            if (!els.noteSection.open) els.noteSection.showModal();
        } else if (els.noteSection) {
            els.noteSection.hidden = false;
        }
        if (els.noteDrawerScrim) els.noteDrawerScrim.hidden = nativeDialog;
        els.noteContent.hidden = false;
        els.noteToggleBtn?.setAttribute('aria-expanded', 'true');
        document.body.classList.add('note-drawer-open');
        syncNotePanelHeight();
        requestAnimationFrame(() => els.noteDrawerClose?.focus());
    } else {
        noteLifecycle.closeReview();
        if (nativeDialog && els.noteSection.open) els.noteSection.close();
        else if (els.noteSection) els.noteSection.hidden = true;
        interactionOverlays?.remove('note-review', { restoreFocus: false });
        if (els.noteDrawerScrim) els.noteDrawerScrim.hidden = true;
        els.noteToggleBtn?.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('note-drawer-open');
        const target = previewReturnFocus?.isConnected ? previewReturnFocus : els.noteToggleBtn;
        previewReturnFocus = null;
        requestAnimationFrame(() => target?.focus());
    }
    updateCopyBtnState();
}

/* ─── Bloquea/desbloquea el paso 1 del PAE según datos del paciente ─── */
function updateStep1Lock() {
    const step1El = document.getElementById('step1');
    if (!step1El) return;
    const locked = !isPatientGateUnlocked();
    step1El.classList.toggle('step--locked', locked);

    if (locked) {
        // Replegar paso 1 si está activo
        if (step1El.classList.contains('active')) {
            step1El.classList.remove('active');
            const header = step1El.querySelector('.step-header');
            syncStepHeaderAction(header, false);
        }
    } else {
        // Expandir paso 1 solo si el usuario aún no ha avanzado más allá
        if (!step1El.classList.contains('active') && !step1El.classList.contains('completed') && currentStep <= 1) {
            activateStep(1);
        }
    }
}

/* ─── Verifica si la nota está completa ───
   Los faltantes se acumulan en el ORDEN NARRATIVO de la nota, de modo que
   "Pendiente: X" siempre señale el primer hueco en orden de lectura. */
function isNoteComplete() {
    const missing = collectFormIssues().map((issue) => issue.message);
    return { complete: missing.length === 0, missing };
}

/* ─── Badges de completitud "n/m" por fase (✓ al completar) ─── */
function updatePhaseBadges() {
    const nc = window.NotaCampos;
    if (!nc) return;
    const st = nc.phaseStatus();
    // Fase F incluye el estado de la meta, que vive en app.js
    st.faseF.total += 1;
    if (els.metaLograda?.value) st.faseF.done += 1;
    ['faseB', 'faseC', 'faseD', 'faseF'].forEach((id) => {
        const badge = document.querySelector(`[data-phase-badge="${id}"]`);
        if (!badge) return;
        const { done, total } = st[id];
        const complete = done >= total;
        badge.textContent = complete ? '✓ Completo' : 'Pendiente';
        badge.classList.toggle('phase-badge--done', complete);
    });
}

/* ─── Rayitas doradas alrededor del botón "Ver nota" al aparecer ─── */
function triggerBtnBurst(btn) {
    const burst = document.createElement('span');
    burst.className = 'btn-burst';
    btn.appendChild(burst);
    for (let i = 0; i < 8; i++) {
        const wrap = document.createElement('span');
        wrap.className = 'btn-burst-ray-w';
        wrap.style.transform = `rotate(${i * 45}deg)`;
        const ray = document.createElement('span');
        ray.className = 'btn-burst-ray';
        wrap.appendChild(ray);
        burst.appendChild(wrap);
    }
    setTimeout(() => burst.remove(), 650);
}

/* ─── Habilita/deshabilita el botón copiar y muestra el estado ─── */
function updateCopyBtnState() {
    const { complete, missing } = isNoteComplete();
    if (!els.copyBtn || !els.noteStatus) return;
    const phase = lifecyclePhase();
    const confirmed = noteLifecycle.getConfirmationMeta();
    const editing = isEditingPhase();
    const reviewingDraft = phase === NoteLifecycle.PHASES.REVIEWING_DRAFT;
    const reviewingEdit = phase === NoteLifecycle.PHASES.REVIEWING_EDIT;
    const canCopy = noteLifecycle.canCopy();

    if (complete) {
        els.copyBtn.hidden = false;
        els.copyBtn.disabled = false;
        els.copyBtn.removeAttribute('aria-disabled');
        els.copyBtn.textContent = editing ? 'Revisar cambios' : canCopy ? 'Ver nota confirmada' : 'Revisar nota';
        els.noteStatus.className = 'note-status complete';
        els.noteStatus.textContent = editing
            ? 'Edición pendiente · confirme o descarte los cambios.'
            : canCopy
                ? (confirmed?.copied ? '✓ Nota confirmada y copiada' : '✓ Nota confirmada · lista para copiar')
                : '✓ Nota lista para revisión final';
    } else {
        const reviewHadFocus = document.activeElement === els.copyBtn || document.activeElement === els.noteToggleBtn;
        els.copyBtn.hidden = true;
        els.copyBtn.disabled = true;
        els.copyBtn.setAttribute('aria-disabled', 'true');
        els.copyBtn.textContent = 'Revisar nota';
        els.noteStatus.className = 'note-status incomplete';
        els.noteStatus.textContent = `Pendiente: ${missing[0]}`;
        if (reviewHadFocus) {
            requestAnimationFrame(() => collectFormIssues()[0]?.focus?.({ report: false }));
        }
    }

    if (els.drawerCopyBtn) {
        els.drawerCopyBtn.hidden = !canCopy;
        els.drawerCopyBtn.disabled = !canCopy;
        els.drawerCopyBtn.setAttribute('aria-disabled', canCopy ? 'false' : 'true');
    }
    if (els.drawerConfirmBtn) {
        const showConfirm = reviewingDraft || reviewingEdit;
        els.drawerConfirmBtn.hidden = !showConfirm;
        els.drawerConfirmBtn.disabled = !complete;
        els.drawerConfirmBtn.setAttribute('aria-disabled', complete ? 'false' : 'true');
        els.drawerConfirmBtn.textContent = reviewingEdit ? 'Confirmar cambios' : 'Confirmar nota';
    }
    if (els.drawerDiscardBtn) {
        els.drawerDiscardBtn.hidden = !reviewingEdit;
    }
    if (els.workflowDiscardBtn) {
        els.workflowDiscardBtn.hidden = !editing;
    }
    if (els.noteToggleBtn) {
        els.noteToggleBtn.hidden = !complete;
        els.noteToggleBtn.disabled = !complete;
        els.noteToggleBtn.setAttribute('aria-disabled', complete ? 'false' : 'true');
        if (!complete) els.noteToggleBtn.setAttribute('aria-expanded', 'false');
    }
    if (els.previewLaunchStatus) {
        els.previewLaunchStatus.textContent = complete
            ? (editing ? 'Edición pendiente' : canCopy ? 'Nota confirmada' : 'Nota lista para revisar')
            : `${missing.length} pendiente${missing.length === 1 ? '' : 's'}`;
    }
    if (els.previewStatus) {
        els.previewStatus.className = `note-drawer-status ${complete ? 'complete' : 'incomplete'}`;
        els.previewStatus.textContent = complete
            ? (reviewingEdit
                ? 'Revise la edición. La copia seguirá bloqueada hasta confirmar estos cambios.'
                : reviewingDraft
                    ? 'La nota está completa. Confírmela para habilitar la copia.'
                    : canCopy
                        ? (confirmed?.copied
                            ? 'Esta es la versión confirmada que ya fue copiada.'
                            : 'Esta es la versión confirmada disponible para copiar.')
                        : 'La nota está completa y lista para revisión final.')
            : `${missing.length} campo${missing.length === 1 ? '' : 's'} pendiente${missing.length === 1 ? '' : 's'}. Primero: ${missing[0]}.`;
    }
    if (els.previewDraftState) {
        els.previewDraftState.textContent = reviewingEdit || editing
            ? 'Edición pendiente'
            : canCopy ? 'Confirmada' : reviewingDraft ? 'Revisión' : 'Borrador';
    }

    renderPatientContext();
    updatePhaseBadges();
    updateStep1Lock();
    updateFlowNavigator();
    updateLayout();
}

/* ─── Crea una tarjeta de opción ─── */
function createOption(title, desc, dataset = {}) {
    const div = document.createElement('div');
    div.className = 'option';
    Object.entries(dataset).forEach(([k, v]) => { div.dataset[k] = v; });
    div.innerHTML = `<span class="check-mark" aria-hidden="true">✓</span><h4>${title}</h4>${desc ? `<p>${desc}</p>` : ''}`;
    return div;
}

/* ─── Normaliza texto para comparar sin acentos ni mayúsculas ─── */
function normalizeText(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* ─── ¿El usuario prefiere movimiento reducido? ─── */
const prefersReducedMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─── Desplaza un elemento a la vista de forma suave y mínima (sin saltos bruscos) ─── */
function scrollSoft(el, block = 'nearest') {
    if (!el) return;
    try {
        el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block, inline: 'nearest' });
    } catch (_) {
        el.scrollIntoView(false);
    }
}

/* ─── Opciones actualmente visibles de un contenedor (omite las filtradas) ─── */
function visibleOptions(container) {
    return [...container.querySelectorAll('.option')].filter((o) => o.style.display !== 'none');
}

function visibleSelectableOptions(container) {
    return visibleOptions(container).filter((o) =>
        !o.classList.contains('option--add') && !o.querySelector('.custom-form'));
}

/* ─── Mueve el foco a una opción aplicando roving tabindex (modelo NOC/B6) ─── */
function focusOption(opt, container) {
    if (!opt) return;
    container.querySelectorAll('.option').forEach((o) => o.setAttribute('tabindex', '-1'));
    opt.setAttribute('tabindex', '0');
    opt.focus();
    scrollSoft(opt, 'nearest');
}

function syncOptionSelectionState(container) {
    if (!container) return;
    container.querySelectorAll('.option').forEach((option) => {
        const selectedNow = option.classList.contains('selected') || option.classList.contains('multi-selected');
        option.setAttribute('aria-selected', selectedNow ? 'true' : 'false');
    });
}

function unwrapOptionGridRows(container) {
    if (!container) return;
    [...container.querySelectorAll(':scope > .option-grid-row')].forEach((row) => {
        while (row.firstChild) container.insertBefore(row.firstChild, row);
        row.remove();
    });
}

/* ─── Marca roles ARIA, ids e índice de orden tras cada render ───
   No toca el roving tabindex (eso lo hace primeRoving, solo en listas roving). */
function markOptions(container) {
    unwrapOptionGridRows(container);
    container.setAttribute('role', 'grid');
    if (!container.hasAttribute('aria-label') && !container.hasAttribute('aria-labelledby')) {
        const heading = container.closest('.step, .dx-live')?.querySelector('h3, h4');
        container.setAttribute('aria-label', heading?.textContent?.trim() || 'Opciones disponibles');
    }
    if (container.dataset.selectionMode === 'multiple') container.setAttribute('aria-multiselectable', 'true');
    else container.removeAttribute('aria-multiselectable');
    const opts = [...container.querySelectorAll('.option')];
    opts.forEach((o, i) => {
        o.setAttribute('role', 'gridcell');
        if (!o.id) o.id = `${container.id}-opt-${i}`;
        if (!o.hasAttribute('tabindex')) o.setAttribute('tabindex', '-1');
        let cell = o.querySelector(':scope > .option-gridcell');
        if (!cell) {
            cell = document.createElement('div');
            cell.className = 'option-gridcell';
            while (o.firstChild) cell.appendChild(o.firstChild);
            o.appendChild(cell);
        }
        cell.setAttribute('role', 'presentation');
        // Orden clínico original (data order), asignado solo la 1ª vez tras el render
        if (o.dataset.ord === undefined) o.dataset.ord = String(i);
    });
    syncOptionSelectionState(container);
    requestAnimationFrame(() => syncOptionGridMetadata(container));
}

function syncOptionGridMetadata(container) {
    if (!container?.isConnected || container.closest('[hidden]')) return;
    const items = visibleOptions(container);
    if (!items.length) {
        unwrapOptionGridRows(container);
        container.setAttribute('aria-rowcount', '0');
        container.setAttribute('aria-colcount', '0');
        return;
    }
    const columns = Math.max(1, gridColumns(items));
    container.setAttribute('aria-colcount', String(columns));
    container.setAttribute('aria-rowcount', String(Math.ceil(items.length / columns)));

    const rows = [...container.querySelectorAll(':scope > .option-grid-row')];
    const structureMatches = rows.length === Math.ceil(items.length / columns)
        && rows.every((row, rowIndex) => {
            const expected = items.slice(rowIndex * columns, (rowIndex + 1) * columns);
            const actual = [...row.children].filter((child) => child.classList.contains('option'));
            return actual.length === expected.length && actual.every((item, index) => item === expected[index]);
        });

    if (structureMatches) {
        rows.forEach((row, rowIndex) => {
            row.setAttribute('aria-rowindex', String(rowIndex + 1));
            [...row.children].forEach((item, column) => {
                item.removeAttribute('aria-rowindex');
                item.setAttribute('aria-colindex', String(column + 1));
            });
        });
        return;
    }

    const focused = container.contains(document.activeElement) ? document.activeElement : null;
    unwrapOptionGridRows(container);
    items.forEach((item) => {
        item.removeAttribute('aria-rowindex');
        item.removeAttribute('aria-colindex');
    });
    for (let start = 0; start < items.length; start += columns) {
        const rowItems = items.slice(start, start + columns);
        const row = document.createElement('div');
        row.className = 'option-grid-row';
        row.setAttribute('role', 'row');
        row.setAttribute('aria-rowindex', String(Math.floor(start / columns) + 1));
        container.insertBefore(row, rowItems[0]);
        rowItems.forEach((item, column) => {
            item.setAttribute('aria-colindex', String(column + 1));
            row.appendChild(item);
        });
    }
    if (focused?.isConnected && focused.getClientRects().length) {
        try { focused.focus({ preventScroll: true }); } catch (_) { focused.focus(); }
    }
}

function syncVisibleOptionGrids(root = document) {
    const grids = new Set();
    if (root?.matches?.('.options[role="grid"]')) grids.add(root);
    root?.querySelectorAll?.('.options[role="grid"]').forEach((grid) => grids.add(grid));
    grids.forEach((grid) => {
        if (grid.getClientRects().length) syncOptionGridMetadata(grid);
    });
}

/* ─── Roving tabindex: exactamente una opción tabulable (solo listas NOC/B6) ─── */
function primeRoving(container) {
    const opts = [...container.querySelectorAll('.option')];
    const visible = opts.filter((o) => o.style.display !== 'none');
    opts.forEach((o) => o.setAttribute('tabindex', '-1'));
    if (!visible.length) return;
    const sel = visible.find((o) => o.classList.contains('selected') || o.classList.contains('multi-selected'));
    (sel || visible[0]).setAttribute('tabindex', '0');
}

/* ─── Nº de columnas de la rejilla, según la posición visual real ─── */
function gridColumns(items) {
    if (items.length < 2) return 1;
    const top0 = items[0].getBoundingClientRect().top;
    let c = 1;
    for (let i = 1; i < items.length; i++) {
        if (Math.abs(items[i].getBoundingClientRect().top - top0) < 2) c++;
        else break;
    }
    return c;
}

function isRightGridEdge(current, items) {
    if (!current) return false;
    const rect = current.getBoundingClientRect();
    const row = items.filter((item) => Math.abs(item.getBoundingClientRect().top - rect.top) < 2);
    return row.every((item) => item.getBoundingClientRect().right <= rect.right + 2);
}

function isLeftGridEdge(current, items) {
    if (!current) return false;
    const rect = current.getBoundingClientRect();
    const row = items.filter((item) => Math.abs(item.getBoundingClientRect().top - rect.top) < 2);
    return row.every((item) => item.getBoundingClientRect().left >= rect.left - 2);
}

function closestOptionByVertical(source, targetContainer) {
    const targets = visibleOptions(targetContainer);
    if (!source || !targets.length) return null;
    const sourceRect = source.getBoundingClientRect();
    const sourceY = sourceRect.top + sourceRect.height / 2;
    return targets.reduce((best, opt) => {
        const rect = opt.getBoundingClientRect();
        const score = Math.abs((rect.top + rect.height / 2) - sourceY);
        return !best || score < best.score ? { opt, score } : best;
    }, null)?.opt || null;
}

function focusClosestOptionByVertical(source, targetContainer) {
    const target = closestOptionByVertical(source, targetContainer);
    if (!target) return false;
    focusOption(target, targetContainer);
    return true;
}

function optionCenter(opt) {
    const rect = opt.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        rect,
    };
}

function nearestOptionInDirection(current, items, direction) {
    if (!current) return null;
    const origin = optionCenter(current);
    const candidates = items
        .filter((item) => item !== current)
        .map((item) => ({ item, pos: optionCenter(item) }))
        .filter(({ pos }) => {
            const verticalOverlap = Math.max(0, Math.min(origin.rect.bottom, pos.rect.bottom)
                - Math.max(origin.rect.top, pos.rect.top));
            const horizontalOverlap = Math.max(0, Math.min(origin.rect.right, pos.rect.right)
                - Math.max(origin.rect.left, pos.rect.left));
            if (direction === 'right') return pos.x > origin.x + 2 && verticalOverlap > 2;
            if (direction === 'left') return pos.x < origin.x - 2 && verticalOverlap > 2;
            if (direction === 'down') return pos.y > origin.y + 2 && horizontalOverlap > 2;
            if (direction === 'up') return pos.y < origin.y - 2 && horizontalOverlap > 2;
            return false;
        })
        .map(({ item, pos }) => {
            const dx = pos.x - origin.x;
            const dy = pos.y - origin.y;
            const primary = (direction === 'right' || direction === 'left') ? Math.abs(dx) : Math.abs(dy);
            const secondary = (direction === 'right' || direction === 'left') ? Math.abs(dy) : Math.abs(dx);
            return { item, score: primary * primary + secondary * secondary * 1.6 };
        })
        .sort((a, b) => a.score - b.score);
    return candidates[0]?.item || null;
}

function closestRightOptionByVertical(source, targetContainer) {
    const targets = visibleOptions(targetContainer);
    if (!source || !targets.length) return null;
    const sourceRect = source.getBoundingClientRect();
    const sourceY = sourceRect.top + sourceRect.height / 2;
    return targets.reduce((best, opt) => {
        const rect = opt.getBoundingClientRect();
        const vertical = Math.abs((rect.top + rect.height / 2) - sourceY);
        if (!best || vertical < best.vertical - 2 || (Math.abs(vertical - best.vertical) <= 2 && rect.right > best.right)) {
            return { opt, vertical, right: rect.right };
        }
        return best;
    }, null)?.opt || null;
}

function focusClosestRightOptionByVertical(source, targetContainer) {
    const target = closestRightOptionByVertical(source, targetContainer);
    if (!target) return false;
    focusOption(target, targetContainer);
    return true;
}

function confirmButtonForStep(stepNum) {
    return ({ 3: els.rcConfirmBtn, 4: els.epConfirmBtn, 6: els.nicConfirmBtn })[stepNum] || null;
}

function focusConfirmButtonForStep(stepNum) {
    const btn = confirmButtonForStep(stepNum);
    if (!btn || btn.disabled) return false;
    btn.focus();
    scrollSoft(btn, 'nearest');
    return true;
}

function focusLastOptionForStep(stepNum) {
    const container = stepByNum(stepNum)?.container?.();
    const items = visibleOptions(container);
    if (!items.length) return false;
    const target = container.querySelector('.option.selected, .option.multi-selected') || items[items.length - 1];
    focusOption(target, container);
    return true;
}

function selectedOptionIn(container) {
    return container?.querySelector('.option.selected, .option.multi-selected') || null;
}

function revealSelectedOption(container, searchBox) {
    let target = selectedOptionIn(container);
    if (!target) return null;
    if (searchBox?.value && target.style.display === 'none') {
        searchBox.value = '';
        searchBox.dispatchEvent(new Event('input', { bubbles: true }));
        target = selectedOptionIn(container) || target;
    }
    return target;
}

function focusStep1FromBelow() {
    const container = inReverse() ? els.findingsList : els.areas;
    const target = revealSelectedOption(container, stepByNum(1)?.search?.());
    if (!target) return focusStepEntry(1);
    focusOption(target, container);
    return true;
}

/* ─── MODO NAVEGACIÓN: teclado sobre las opciones (foco en la opción, roving) ───
   Flechas grid-aware (↑/↓ por fila, ←/→ por columna); Enter selecciona/alterna;
   Shift+Enter avanza (multi). Escribir una letra → vuelve al buscador y filtra
   (opts.searchInput); si no hay buscador, type-ahead. Los bordes conservan foco. */
function enableOptionKeyboard(container, opts = {}) {
    if (!container || container.dataset.kbReady) return;
    container.dataset.kbReady = '1';

    const toSearch = () => {
        const s = opts.searchInput;
        if (!s) return false;
        s.focus();
        const len = s.value.length;
        s.setSelectionRange?.(len, len);
        return true;
    };

    container.addEventListener('keydown', (e) => {
        // No interceptar mientras se escribe en un editor inline (opción personalizada)
        if (e.target.closest('.custom-form')) return;
        if (isEditableElement(e.target) || (e.target.tagName === 'BUTTON' && !e.target.classList.contains('option'))) return;
        const isQuestionKey = e.key === '?' || (e.key === '/' && e.shiftKey);
        if (isQuestionKey || (e.key === '/' && !e.shiftKey)) return;
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.altKey)) return;
        // Shift + flechas pertenece exclusivamente al navegador espacial entre campos.
        if (e.key.startsWith('Arrow') && (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey)) return;
        const items = visibleOptions(container);
        if (!items.length) return;
        const current = document.activeElement?.closest?.('.option');
        const idx = current ? items.indexOf(current) : -1;

        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault();
                if (current) {
                    const target = nearestOptionInDirection(current, items, 'right');
                    if (target) focusOption(target, container);
                } else focusOption(items[0], container);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (current) {
                    const target = nearestOptionInDirection(current, items, 'left');
                    if (target) focusOption(target, container);
                } else focusOption(items[0], container);
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (current) {
                    const target = nearestOptionInDirection(current, items, 'down');
                    if (target) focusOption(target, container);
                }
                else focusOption(items[0], container);
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (current) {
                    const target = nearestOptionInDirection(current, items, 'up');
                    if (target) focusOption(target, container);
                }
                break;
            case 'Home':
                e.preventDefault();
                focusOption(items[0], container);
                break;
            case 'End':
                e.preventDefault();
                focusOption(items[items.length - 1], container);
                break;
            case ' ':
                if (e.ctrlKey || e.metaKey || e.altKey) break;
                if (current && !current.querySelector('.custom-form')) {
                    e.preventDefault();
                    activateOptionWithIntent(current, false);
                }
                break;
            case 'Enter':
                if (e.shiftKey) {                   // Shift+Enter: confirmar y avanzar (multi)
                    if (opts.multi && opts.onAdvance) {
                        e.preventDefault();
                        opts.onAdvance();
                    } else {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!advanceCurrentSectionByShortcut()) {
                            announceAction('Seleccione y confirme una opción antes de continuar.');
                        }
                    }
                    break;
                }
                if (current && !current.querySelector('.custom-form')) {
                    e.preventDefault();
                    activateOptionWithIntent(current, true);
                }
                break;
            case 'Escape':
                if (opts.searchInput) {
                    e.preventDefault();
                    toSearch();
                }
                break;
            case 'Backspace':
            case 'Delete':
                if (opts.multi && current?.classList.contains('multi-selected')
                    && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    e.preventDefault();
                    activateOptionWithIntent(current, false);
                    focusOption(current, container);
                }
                break;
            default:
                // WritingTargetRegistry conserva el primer carácter y resuelve el
                // destino de escritura de forma uniforme para todas las listas.
                break;
        }
    });
}

/* ─── Lista con foco-en-opción (roving): NOC y B6. Llamar tras cada render. ─── */
function setupOptionList(container, opts = {}) {
    if (!container) return;
    container.dataset.selectionMode = opts.multi ? 'multiple' : 'single';
    markOptions(container);
    primeRoving(container);
    enableOptionKeyboard(container, opts);
}

/* ─── MODO BÚSQUEDA → NAVEGACIÓN: conecta un buscador con su lista ───
   Enter o ↓ entran a la primera opción; las flechas simples nunca salen del campo. */
function wireSearch(input, container, stepNum) {
    if (!input || !container) return;
    ensureSearchResultsStatus(input, container);
    input.addEventListener('input', () => filterOptions(container, input.value));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.altKey)) return;
        if ((e.key === 'Backspace' || e.key === 'Delete') && !input.value
            && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const selectedOptions = visibleOptions(container).filter((option) => option.classList.contains('multi-selected'));
            const last = selectedOptions.at(-1);
            if (last) {
                e.preventDefault();
                focusOption(last, container);
                announceAction('Elemento seleccionado enfocado. Presione otra vez para quitarlo.');
                return;
            }
        }
        if (e.key === 'Enter') {
            const confirmBtn = confirmButtonForStep(stepNum);
            if (e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                if (confirmBtn && !confirmBtn.disabled) confirmBtn.click();
                else if (!advanceCurrentSectionByShortcut()) {
                    announceAction('Seleccione y confirme una opción antes de continuar.');
                }
                return;
            }
            const selectable = visibleSelectableOptions(container);
            if (selectable.length === 1) {
                e.preventDefault();
                selectable[0].click();
                return;
            }
            const items = visibleOptions(container);
            const first = selectable[0] || items[0];
            if (first) { e.preventDefault(); focusOption(first, container); }
        } else if (e.key === 'ArrowDown') {
            const items = visibleOptions(container);
            const first = visibleSelectableOptions(container)[0] || items[0];
            if (first) { e.preventDefault(); focusOption(first, container); }
        }
    });
}

function focusRouteSwitch() {
    const btn = els.routeSwitch?.querySelector(`[data-mode="${reverse.mode}"]`)
        || els.routeSwitch?.querySelector('[role="radio"]');
    if (!btn) return false;
    btn.focus();
    scrollSoft(els.routeSwitch, 'nearest');
    return true;
}

function focusFindingKindFilter() {
    const btn = els.findingKindFilters?.querySelector(`[aria-checked="true"]`)
        || els.findingKindFilters?.querySelector('[role="radio"]');
    if (!btn) return false;
    btn.focus();
    scrollSoft(els.findingKindFilters, 'nearest');
    return true;
}

function resetSectionTypeahead() {
    sectionTypeaheadBuffer = '';
    clearTimeout(sectionTypeaheadTimer);
    sectionTypeaheadTimer = null;
}

function rememberLogicalSection(id) {
    if (id == null) return;
    if (lastLogicalSectionId !== id) resetSectionTypeahead();
    lastLogicalSectionId = id;
}

function activeLogicalSectionId() {
    const id = currentSectionId();
    if (id != null) {
        rememberLogicalSection(id);
        return id;
    }
    return lastLogicalSectionId;
}

function containerForSection(id) {
    if (typeof id !== 'number') return null;
    return stepByNum(id)?.container?.() || null;
}

function searchForActiveSection(origin = document.activeElement) {
    const id = activeLogicalSectionId();
    if (typeof id === 'number') return stepByNum(id)?.search?.() || null;
    if (typeof id === 'string' && id.startsWith('fase')) {
        return window.NotaCampos?.searchForPhase(id, origin) || null;
    }
    return null;
}

function optionTypeaheadText(opt) {
    return normalizeText(opt.querySelector('h4')?.textContent || opt.textContent || '').trim();
}

function runSectionTypeahead(key, sectionId = activeLogicalSectionId()) {
    if (!key || key.length !== 1 || typeof sectionId !== 'number') return false;
    const container = containerForSection(sectionId);
    const items = container ? visibleSelectableOptions(container) : [];
    if (!items.length) {
        resetSectionTypeahead();
        return false;
    }

    sectionTypeaheadBuffer += normalizeText(key);
    clearTimeout(sectionTypeaheadTimer);
    sectionTypeaheadTimer = setTimeout(resetSectionTypeahead, SECTION_TYPEAHEAD_DELAY);

    const match = items.find((opt) => optionTypeaheadText(opt).startsWith(sectionTypeaheadBuffer));
    if (!match) return false;
    focusOption(match, container);
    return true;
}

function focusRouteSearch(mode = reverse.mode) {
    const box = mode === 'reverse' ? els.searchFindings : els.searchAreas;
    if (!box) return false;
    box.focus();
    box.select?.();
    return true;
}

function sendCharToSectionSearch(ch, box) {
    if (!box || ch.length !== 1) return false;
    box.focus();
    const start = box.value.length;
    const end = box.value.length;
    box.value = box.value.slice(0, start) + ch + box.value.slice(end);
    const caret = start + ch.length;
    box.setSelectionRange?.(caret, caret);
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}

function sendDeleteToSectionSearch(key, box) {
    if (!box || (key !== 'Backspace' && key !== 'Delete')) return false;
    if (!box.value) return false;
    box.focus();
    const pos = box.value.length;
    box.value = box.value.slice(0, pos - 1) + box.value.slice(pos);
    box.setSelectionRange?.(pos - 1, pos - 1);
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}

/* ─── Enfoca el punto de entrada natural de un paso (buscador o 1ª opción) ───
   Síncrono: se invoca tras activar el paso, cuando su contenido ya es visible. */
function focusStepEntry(n) {
    if (n === 1 && focusRouteSearch()) return;
    const st = stepByNum(n);
    const searchBox = st && st.search && st.search();
    if (searchBox) { searchBox.focus(); return; }
    if (n === 7) {   // B6: si hay selector de escala visible, enfócalo primero
        const picker = document.getElementById('b6ScalePicker');
        const sel = document.getElementById('b6ScaleSelect');
        if (picker && !picker.hidden && sel) { sel.focus(); return; }
    }
    const container = st && st.container();
    if (!container) return;
    const first = visibleOptions(container)[0];
    if (first) focusOption(first, container);
}

/* ─── Enfoca la opción tabulable de un contenedor (la previamente elegida, gracias
   al roving tabindex), para corregir una selección de un vistazo. ─── */
function focusContainerTabbable(container, searchBox = null) {
    if (!container) return;
    const target = revealSelectedOption(container, searchBox)
        || container.querySelector('.option[tabindex="0"]')
        || visibleOptions(container)[0];
    if (target) focusOption(target, container);
}

/* ─── Activa un paso y aterriza en él: en la opción ya elegida (revisar/corregir)
   o, si aún no hay selección, en su punto de entrada (buscador o 1ª opción). ─── */
function goToStepSection(n, dir = 0, focus = true) {
    activateStep(n);
    scrollSoft(document.getElementById(`step${n}`), 'nearest');
    if (!focus) return;
    if (n === 1) {
        if (dir < 0 && focusStep1FromBelow()) return;
        focusStepEntry(n);
        return;
    }
    const container = stepByNum(n)?.container();
    if (stepHasSelection(n)) focusContainerTabbable(container, stepByNum(n)?.search?.());
    else focusStepEntry(n);
}

/* ─── Registro ordenado de secciones del flujo, con disponibilidad y enfoque ───
   Los pasos se generan desde los pasos ACTIVOS (EP se excluye en diagnósticos
   "Riesgo de…"). `has()` = alcanzable ahora; `focus(dir)` enfoca según dirección. */
function sectionList() {
    const steps = activeSteps().map((s) => ({
        id: s.num,
        has: () => {
            if (!isPatientGateUnlocked()) return false;
            if (s.num === 1) return !document.getElementById('step1')?.classList.contains('step--locked');
            if (s.num === 2 && inReverse()) return reverse.findingKeys.length > 0 || maxReachedStep >= 2;
            return maxReachedStep >= s.num;
        },
        focus: (dir) => goToStepSection(s.num, dir),
    }));
    const phase = (id) => ({ id, has: () => isPatientGateUnlocked(), focus: (dir) => window.NotaCampos?.focusPhase(id, dir) });
    return [
        { id: 'patient', has: () => true, focus: (dir) => {
            const t = dir < 0 ? document.getElementById('servicio') : document.getElementById('sexoSeg')?.querySelector('[role="radio"]');
            t?.focus(); t?.select?.(); scrollSoft(t);
        } },
        phase('faseB'),
        phase('faseC'),
        phase('faseD'),
        ...steps,
        phase('faseF'),
        { id: 'obs',  has: () => isPatientGateUnlocked(), focus: () => { els.otrosComentarios?.focus(); scrollSoft(els.otrosComentarios); } },
        { id: 'note', has: () => !els.copyBtn?.disabled, focus: () => { els.copyBtn?.focus(); scrollSoft(els.copyBtn); } },
        { id: 'copy', has: () => noteVisible && !els.drawerCopyBtn?.disabled, focus: () => { els.drawerCopyBtn?.focus(); scrollSoft(els.drawerCopyBtn); } },
    ];
}

/* ─── Identifica en qué sección está el foco actualmente ───
   Cualquier elemento dentro de un .step pertenece a ese paso (cubre buscadores,
   opciones, filtros y barras de confirmación, en ambas rutas). */
function resolveLogicalSection(a = document.activeElement) {
    if (!a) return null;
    // Los puntos de salida viven dentro de contenedores más amplios; deben ganar
    // antes que .phase para no quedar absorbidos por faseF.
    if (a === els.otrosComentarios) return 'obs';
    if (a === els.noteToggleBtn || a === els.copyBtn) return 'note';
    if (a === els.drawerCopyBtn) return 'copy';
    if (a.closest?.('.patient-block')) return 'patient';
    if (a.closest?.('#dxLive')) return 1;
    const stepEl = a.closest?.('.step');
    if (stepEl && stepEl.dataset.step) return Number(stepEl.dataset.step);
    const phaseEl = a.closest?.('.phase');
    if (phaseEl && phaseEl.dataset.section) return phaseEl.dataset.section;
    return null;
}

function currentSectionId() {
    return resolveLogicalSection(document.activeElement);
}

/* ─── Mueve el foco a la sección adyacente disponible (delta: +1 sig., -1 ant.) ─── */
function focusAdjacentSection(fromId, delta, allowStageChange = false) {
    const list = sectionList().filter((s) => s.has());
    const idx = list.findIndex((s) => s.id === fromId);
    if (idx < 0) return false;
    const target = list[idx + delta];
    if (!target) return false;
    const sourceStage = typeof fromId === 'number' ? 'fasePAE' : fromId;
    const targetStage = typeof target.id === 'number' ? 'fasePAE' : target.id;
    if (!allowStageChange && sourceStage !== targetStage) return false;
    if (typeof target.id === 'number' && !activateFlowStage('fasePAE', { focus: false })) return false;
    else if (FLOW_STAGE_ORDER.includes(target.id) && !activateFlowStage(target.id, { focus: false })) return false;
    target.focus(delta);
    return true;
}

function advanceCurrentSectionByShortcut() {
    if (blockOnOpenAppEditorDraft()) return true;
    const id = currentSectionId();
    if (id == null) return false;

    if (id === 'patient') {
        if (!isPatientGateUnlocked()) return false;
        return focusAdjacentSection('patient', +1, true);   // → Fase B (estado clínico)
    }
    if (typeof id === 'string' && id.startsWith('fase')) {
        // Fase incompleta → primer control pendiente; completa → sección siguiente
        if (window.NotaCampos?.focusFirstPending(id)) return true;
        return focusAdjacentSection(id, +1, true);
    }
    if (typeof id === 'number') {
        const confirmBtn = confirmButtonForStep(id);
        if (confirmBtn) {
            if (confirmBtn.disabled) return false;
            confirmBtn.click();
            return true;
        }
        if (id === 1 && inReverse() && !selected.diagnostico) {
            if (!reverse.findingKeys.length) return false;
            confirmFindings();
            return true;
        }
        if (stepHasSelection(id)) return focusAdjacentSection(id, +1, true);
        return false;
    }
    if (id === 'obs') {
        if (!isNoteComplete().complete) return false;
        toggleNote(true);
        return true;
    }
    if (id === 'note') {
        if (els.drawerCopyBtn?.disabled) return false;
        if (!noteVisible) {
            toggleNote(true);
            requestAnimationFrame(() => {
                els.drawerCopyBtn?.focus();
                scrollSoft(els.drawerCopyBtn);
            });
        } else {
            els.drawerCopyBtn.focus();
            scrollSoft(els.drawerCopyBtn);
        }
        return true;
    }
    if (id === 'copy') {
        if (els.drawerCopyBtn?.disabled) return false;
        els.drawerCopyBtn.click();
        return true;
    }
    return false;
}

function formSurfaceContains(target) {
    if (target?.closest?.('[data-keyboard-surface="delivery"], #noteToggleBtn')) return true;
    return activeFlowStage === 'fasePAE' && !!target?.closest?.('#dxLive') && isInteractionElementVisible(els.dxLive);
}

function isInteractionElementVisible(element) {
    if (!element?.isConnected || element.disabled || element.getAttribute?.('aria-disabled') === 'true') return false;
    if (element.closest?.('[hidden], [inert], [aria-hidden="true"]')) return false;
    return element.getClientRects?.().length > 0;
}

function isWritingElement(element) {
    if (!isInteractionElementVisible(element) || element.readOnly) return false;
    if (element.isContentEditable) return true;
    if (element.tagName === 'TEXTAREA') return true;
    if (element.tagName !== 'INPUT') return false;
    return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']
        .includes((element.type || 'text').toLowerCase());
}

function writingScopeId(origin = document.activeElement) {
    const completedHeader = origin?.closest?.('.step.completed > .step-header[role="button"]');
    if (completedHeader) return Number(completedHeader.closest('.step')?.dataset.step);
    if (activeFlowStage === 'fasePAE') return currentStep;
    return activeFlowStage;
}

function writingTargetsForScope(scopeId) {
    if (typeof scopeId === 'string') {
        const adapted = window.NotaCampos?.writingTargets?.(scopeId);
        if (adapted?.length) return adapted.filter(isWritingElement);
    }
    let root = null;
    if (typeof scopeId === 'number') root = document.getElementById(`step${scopeId}`);
    else root = document.querySelector(`[data-flow-stage="${scopeId}"]:not([hidden])`);
    if (!root) return [];
    return [...root.querySelectorAll('input:not([type="hidden"]), textarea, [contenteditable="true"]')]
        .filter(isWritingElement);
}

function primaryWritingTarget(scopeId, origin) {
    if (typeof scopeId === 'number') return stepByNum(scopeId)?.search?.() || null;
    if (typeof scopeId === 'string' && scopeId.startsWith('fase')) {
        return window.NotaCampos?.searchForPhase?.(scopeId, origin) || null;
    }
    if (scopeId === 'patient') return window.NotaCampos?.searchForPhase?.('patient', origin) || null;
    return null;
}

function issueWritingTarget(scopeId, targets) {
    const stageId = typeof scopeId === 'number' ? 'fasePAE' : scopeId;
    const issues = collectFormIssues().filter((issue) => (
        issue.stageId === stageId
        && (typeof scopeId !== 'number' || issue.id === `app-pae-step-${scopeId}`)
    ));
    for (const issue of issues) {
        const control = document.getElementById(issue.controlId);
        const target = isWritingElement(control)
            ? control
            : [...(control?.querySelectorAll?.('input:not([type="hidden"]), textarea, [contenteditable="true"]') || [])]
                .find(isWritingElement);
        if (target && targets.includes(target)) return target;
    }
    return null;
}

function activateCompletedStepForWriting(origin) {
    const header = origin?.closest?.('.step.completed > .step-header[role="button"]');
    const step = Number(header?.closest('.step')?.dataset.step);
    if (!header || !step) return null;
    goToStepSection(step, 0, false);
    return step;
}

function isDirectWritingEvent(event) {
    if (!event || event.defaultPrevented || event.isComposing || event.keyCode === 229) return false;
    if (event.key === 'Dead') {
        const altGraph = event.getModifierState?.('AltGraph') === true;
        return !event.metaKey && (!event.ctrlKey || altGraph) && (!event.altKey || altGraph);
    }
    if (!event.key || Array.from(event.key).length !== 1 || !event.key.trim()) return false;
    if (event.key === '/' || event.key === '?') return false;
    const altGraph = event.getModifierState?.('AltGraph') === true;
    if (event.metaKey || (event.ctrlKey && !altGraph) || (event.altKey && !altGraph)) return false;
    return true;
}

function writingTargetAccepts(target, character) {
    if (!target) return false;
    if (character === 'Dead') return true;
    if (target._notaDateControl) return /^\d$/u.test(character);
    if (target.tagName === 'INPUT' && (target.type || '').toLowerCase() === 'number') {
        return /^[\d.,+-]$/u.test(character);
    }
    return true;
}

function runRadioTypeahead(character, origin) {
    const group = origin?.closest?.('[role="radiogroup"]');
    if (!group || group === els.routeSwitch || group === els.findingKindFilters) return false;
    const items = [...group.querySelectorAll('[role="radio"]')].filter(isInteractionElementVisible);
    if (!items.length) return false;
    sectionTypeaheadBuffer += normalizeText(character);
    clearTimeout(sectionTypeaheadTimer);
    sectionTypeaheadTimer = setTimeout(resetSectionTypeahead, SECTION_TYPEAHEAD_DELAY);
    const match = items.find((item) => normalizeText(item.textContent).trim().startsWith(sectionTypeaheadBuffer));
    if (!match) return false;
    match.focus();
    return true;
}

function routeDirectWriting(event, origin = event.target) {
    const activatedStep = activateCompletedStepForWriting(origin);
    const scopeId = activatedStep ?? writingScopeId(origin);
    if (scopeId == null || (typeof scopeId === 'string' && scopeId !== activeFlowStage)) return false;

    if (event.key !== 'Dead' && runRadioTypeahead(event.key, origin)) return true;

    const targets = writingTargetsForScope(scopeId);
    const contextual = formSurfaceContains(origin) ? primaryWritingTarget(scopeId, origin) : null;
    if (contextual && targets.includes(contextual)) writingTargetRegistry?.remember(scopeId, contextual);
    const pending = issueWritingTarget(scopeId, targets);
    const primary = primaryWritingTarget(scopeId, origin);
    let target = writingTargetRegistry?.resolve({ scopeId, targets, pending, primary }) || pending || primary;
    if (!writingTargetAccepts(target, event.key)) {
        target = [pending, primary, ...targets].find((candidate) => writingTargetAccepts(candidate, event.key)) || null;
    }

    if (target && isWritingElement(target)) {
        writingTargetRegistry?.remember(scopeId, target);
        if (event.key === 'Dead') {
            target.focus();
            scrollSoft(target, 'nearest');
            return { handled: true, preventDefault: false, stopPropagation: false };
        }
        resetSectionTypeahead();
        const inserted = writingTargetRegistry?.insert(target, event.key);
        if (inserted) scrollSoft(target, 'nearest');
        return !!inserted;
    }
    if (event.key === 'Dead') return false;
    return runSectionTypeahead(event.key, scopeId);
}

function spatialScopeRoot() {
    return document.querySelector(`[data-flow-stage="${activeFlowStage}"]:not([hidden])`);
}

function focusSpatialUnit(element, { caret = 'end' } = {}) {
    if (!element) return;
    const option = element.closest?.('.option');
    if (option) focusOption(option, option.closest('.options'));
    else element.focus?.();
    if ((element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')
        && caret === 'end' && typeof element.setSelectionRange === 'function') {
        const end = String(element.value ?? '').length;
        try { element.setSelectionRange(end, end); } catch (_) { /* tipo de input sin selección */ }
    }
    try { element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' }); }
    catch (_) { scrollSoft(element, 'nearest'); }
}

function genericFieldToken(root, target = document.activeElement) {
    if (!root || !target || !root.contains(target)) return null;
    const token = {
        focusId: stableFocusId(target),
        optionId: target.closest?.('.option')?.id || '',
        popupOpen: target.getAttribute?.('aria-expanded') === 'true',
    };
    if (typeof target.selectionStart === 'number' && typeof target.selectionEnd === 'number') {
        token.selectionStart = target.selectionStart;
        token.selectionEnd = target.selectionEnd;
    }
    return token;
}

function resolveFieldToken(root, token) {
    if (!root || !token) return null;
    const candidates = [token.optionId, token.focusId].filter(Boolean);
    for (const id of candidates) {
        const target = document.getElementById(id)
            || document.querySelector(`[data-focus-id="${CSS.escape(id)}"]`);
        if (target && root.contains(target) && isInteractionElementVisible(target)) return target;
    }
    return null;
}

function fieldRadioEntry(root) {
    return root?.querySelector?.('[role="radio"][aria-checked="true"]')
        || root?.querySelector?.('[role="radio"][tabindex="0"]')
        || root?.querySelector?.('[role="radio"]');
}

function genericFieldEntry(definition, context = {}) {
    const root = typeof definition.root === 'function' ? definition.root() : definition.root;
    if (!root) return false;
    const adapter = window.NotaCampos?.fieldAdapter?.(definition.adapterTarget?.() || definition.anchor?.() || root);
    if (adapter) {
        const target = context.reason === 'tab-return'
            ? adapter.restoreFocus?.(context.token, context)
            : adapter.enter?.(context);
        if (target) focusSpatialUnit(target, { caret: context.reason === 'tab-return' ? 'preserve' : 'end' });
        return !!target;
    }
    let target = context.reason === 'tab-return' ? resolveFieldToken(root, context.token) : null;
    target = target || fieldRadioEntry(root);
    target = target || (typeof definition.anchor === 'function' ? definition.anchor() : definition.anchor);
    target = target || root.querySelector?.([
        'input:not([type="hidden"]):not([disabled])', 'textarea:not([disabled])', 'select:not([disabled])',
        'button:not([disabled])', '[role="option"]', '[contenteditable="true"]',
    ].join(','));
    if (!target || !isInteractionElementVisible(target)) return false;
    focusSpatialUnit(target, { caret: context.reason === 'tab-return' ? 'preserve' : 'end' });
    if (context.reason === 'tab-return' && typeof target.setSelectionRange === 'function'
        && Number.isFinite(context.token?.selectionStart) && Number.isFinite(context.token?.selectionEnd)) {
        try { target.setSelectionRange(context.token.selectionStart, context.token.selectionEnd); } catch (_) { /* control no seleccionable */ }
    }
    return true;
}

function selectedPaeOptions(container) {
    return visibleOptions(container).filter((option) => (
        option.classList.contains('selected') || option.classList.contains('multi-selected')
        || option.getAttribute('aria-selected') === 'true'
    ));
}

function closestSelectedToOrigin(options, originRect) {
    if (!options.length || !originRect) return options[0] || null;
    const originY = originRect.top + originRect.height / 2;
    return options.reduce((best, option) => {
        const rect = option.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - originY);
        return !best || distance < best.distance ? { option, distance } : best;
    }, null)?.option || options[0];
}

function enterPaeStep(stepNum, context = {}) {
    const step = stepByNum(stepNum);
    if (!step || !step.present()) return false;
    activateStep(stepNum, { focus: false });
    const root = document.getElementById(`step${stepNum}`);
    const restored = context.reason === 'tab-return' ? resolveFieldToken(root, context.token) : null;
    if (restored) {
        focusSpatialUnit(restored, { caret: 'preserve' });
        return true;
    }
    const container = step.container?.();
    let selectedOptions = selectedPaeOptions(container);
    if (!selectedOptions.length && stepHasSelection(stepNum) && step.search?.()?.value) {
        step.search().value = '';
        step.search().dispatchEvent(new Event('input', { bubbles: true }));
        selectedOptions = selectedPaeOptions(container);
    }
    let target = null;
    if (selectedOptions.length === 1) target = selectedOptions[0];
    else if (selectedOptions.length > 1) {
        if (context.direction === 'up') target = selectedOptions.at(-1);
        else if (context.direction === 'left' || context.direction === 'right') {
            target = closestSelectedToOrigin(selectedOptions, context.originRect);
        } else target = selectedOptions[0];
    }
    if (target) {
        focusOption(target, container);
        return true;
    }
    const search = step.search?.();
    if (search && isInteractionElementVisible(search)) {
        search.focus();
        focusSpatialUnit(search);
        return true;
    }
    if (stepNum === 7) {
        const scale = document.getElementById('b6ScaleSelect');
        if (scale && isInteractionElementVisible(scale)) {
            focusSpatialUnit(scale);
            return true;
        }
    }
    const first = visibleOptions(container)[0];
    if (first) {
        focusOption(first, container);
        return true;
    }
    return false;
}

function fieldDefinition({ id, stageId, root, anchor, kind = 'field', enabled, enter, contains, adapterTarget }) {
    const rootFn = typeof root === 'function' ? root : () => document.querySelector(root);
    const anchorFn = typeof anchor === 'function' ? anchor : () => (anchor ? document.querySelector(anchor) : rootFn());
    const definition = {
        id, stageId, kind, root: rootFn, anchor: anchorFn, enabled,
        contains: contains || ((target) => !!rootFn()?.contains(target)),
        captureFocus: (target) => {
            const adapter = window.NotaCampos?.fieldAdapter?.(adapterTarget?.() || anchorFn());
            return adapter?.captureFocus?.() || genericFieldToken(rootFn(), target);
        },
        enter: (context = {}) => (enter ? enter(context) : genericFieldEntry(definition, context)),
        restoreFocus: (token, context = {}) => (enter
            ? enter({ ...context, token, reason: 'tab-return' })
            : genericFieldEntry(definition, { ...context, token, reason: 'tab-return' })),
        commitDraft: (options = {}) => window.NotaCampos?.fieldAdapter?.(adapterTarget?.() || anchorFn())?.commitDraft?.(options) ?? true,
        closePopup: () => window.NotaCampos?.fieldAdapter?.(adapterTarget?.() || anchorFn())?.closePopup?.({ preserveQuery: true }),
        adapterTarget,
    };
    return definition;
}

function registerNavigationField(config) {
    const definition = fieldDefinition(config);
    const unregister = fieldNavigationRegistry.register(definition);
    const mark = () => {
        const root = definition.root();
        if (root) root.dataset.fieldId = definition.id;
    };
    mark();
    return { definition, unregister, mark };
}

function internalFieldControls(root, origin) {
    if (!root) return [];
    const raw = [...root.querySelectorAll([
        'input:not([type="hidden"]):not([disabled])', 'textarea:not([disabled])', 'select:not([disabled])',
        'button:not([disabled])', '[role="option"]', '[contenteditable="true"]',
    ].join(','))];
    const units = [];
    const seen = new Set();
    raw.forEach((element) => {
        if (!isInteractionElementVisible(element)) return;
        let unit = element;
        const group = element.closest('[role="radiogroup"]');
        if (group) unit = group.contains(origin)
            ? origin.closest?.('[role="radio"]')
            : fieldRadioEntry(group);
        if (!unit || seen.has(unit)) return;
        seen.add(unit);
        units.push(unit);
    });
    return units;
}

function setupInternalFieldNavigation(root) {
    if (!root || root.dataset.internalFieldNavigation === 'true') return;
    root.dataset.internalFieldNavigation = 'true';
    root.addEventListener('keydown', (event) => {
        if (event.defaultPrevented || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
        if (!event.key.startsWith('Arrow')) return;
        if (event.target.closest('[role="radiogroup"], .cbx-list, .options')) return;
        const direction = event.key.slice(5).toLowerCase();
        if (isEditableElement(event.target) && !editorCanLeaveWithArrow(event.target, direction)) return;
        const candidates = internalFieldControls(root, event.target).filter((control) => control !== event.target);
        if (!candidates.length) return;
        const moved = spatialNavigator?.move({ origin: event.target, direction, candidates, scopeId: activeFlowStage });
        if (moved) event.preventDefault();
    });
}

function setupFieldNavigationRegistry() {
    const fields = [
        ['patient-id-type', 'patient', '#patientIdType', '#patientIdType'],
        ['patient-id-number', 'patient', '#patientIdNumber', '#patientIdNumber'],
        ['patient-sex', 'patient', '#sexoSeg', '#sexoSeg'],
        ['patient-dob', 'patient', () => document.getElementById('dobFecha')?.closest('.field-group'), '#dobFecha'],
        ['patient-position', 'patient', '[data-cbx="posicion"]', '#posicion'],
        ['patient-bed', 'patient', '#numCama', '#numCama'],
        ['patient-room', 'patient', '#numHabitacion', '#numHabitacion'],
        ['patient-service', 'patient', '[data-cbx="servicio"]', '#servicio'],
        ['clinical-neuro', 'faseB', '[data-estado="estadoNeurologico"]', '#estadoNeurologico'],
        ['clinical-hemo', 'faseB', '[data-estado="estadoHemodinamico"]', '#estadoHemodinamico'],
        ['clinical-resp', 'faseB', '[data-estado="estadoRespiratorio"]', '#estadoRespiratorio'],
        ['clinical-scales', 'faseB', '#escalasBlock', '#escalasPicker .multi-add-input'],
        ['diagnosis-medical', 'faseC', '#diagnosticoMedico', '#diagnosticoMedico'],
        ['diagnosis-isolation', 'faseC', '[data-cbx="aislamiento"]', '#aislamiento'],
        ['diagnosis-dental', 'faseC', '[data-cbx="estadoDental"]', '#estadoDental'],
        ['diagnosis-devices', 'faseC', '#dispositivosBlock', '#dispositivosPicker .multi-add-input'],
        ['findings-regions', 'faseD', '#regionesBlock', '#regionesPicker .multi-add-input'],
        ['findings-education', 'faseD', '#educacionBlock', '#educacionPicker .multi-add-input, #eduQuick button'],
        ['delivery-response', 'faseF', '#respuestaIntervenciones', '#respuestaIntervenciones'],
        ['delivery-trend', 'faseF', '[data-cbx="tendenciaEvolutiva"]', '#tendenciaEvolutiva'],
        ['delivery-meta', 'faseF', '#metaSeg', '#metaSeg'],
        ['delivery-criterion', 'faseF', '#criterioClinico', '#criterioClinico'],
        ['delivery-pending', 'faseF', '#pendientes', '#pendientes'],
        ['delivery-observations', 'faseF', '#otrosComentarios', '#otrosComentarios'],
    ];
    fields.forEach(([id, stageId, root, anchor]) => {
        const record = registerNavigationField({ id, stageId, root, anchor });
        if (['patient-dob', 'clinical-scales', 'diagnosis-devices', 'findings-regions', 'findings-education'].includes(id)) {
            setupInternalFieldNavigation(record.definition.root());
        }
    });

    registerNavigationField({
        id: 'pae-route', stageId: 'fasePAE', root: '#routeSwitch', anchor: '#routeSwitch',
        enabled: () => !document.getElementById('step1')?.classList.contains('step--locked'),
    });
    STEPS.forEach((step) => registerNavigationField({
        id: `pae-step-${step.num}`,
        stageId: 'fasePAE',
        root: () => document.getElementById(`step${step.num}`),
        anchor: () => {
            const root = document.getElementById(`step${step.num}`);
            if (!root) return null;
            if (!root.classList.contains('active')) return root.querySelector('.step-header') || root;
            if (step.num === 1) return root.querySelector(`[data-route="${inReverse() ? 'reverse' : 'main'}"]`) || root;
            return root.querySelector('.step-content') || root;
        },
        contains: (target) => {
            const root = document.getElementById(`step${step.num}`);
            if (!root?.contains(target)) return false;
            return step.num !== 1 || !els.routeSwitch?.contains(target);
        },
        enabled: () => step.present() && (step.num === currentStep || stepHasSelection(step.num) || maxReachedStep >= step.num),
        enter: (context) => enterPaeStep(step.num, context),
    }));
    document.querySelectorAll('#step1 [data-route]').forEach((routeBody) => { routeBody.dataset.fieldId = 'pae-step-1'; });
    registerNavigationField({
        id: 'pae-reverse-diagnoses', stageId: 'fasePAE', root: '#dxLive', anchor: '#dxLive',
        enabled: () => inReverse() && isInteractionElementVisible(els.dxLive) && visibleOptions(els.reverseResults).length > 0,
        enter: (context = {}) => {
            const options = selectedPaeOptions(els.reverseResults);
            const target = options.length
                ? (context.direction === 'up' ? options.at(-1) : closestSelectedToOrigin(options, context.originRect))
                : visibleOptions(els.reverseResults)[0];
            if (!target) return false;
            focusOption(target, els.reverseResults);
            return true;
        },
    });

    FLOW_STAGE_ORDER.forEach((stageId) => {
        const primarySelector = stageId === 'faseF' ? '#copyBtn' : `[data-flow-continue="${stageId}"]`;
        const primary = document.querySelector(primarySelector);
        if (primary) registerNavigationField({
            id: `${stageId}-primary-action`, stageId, kind: 'action', root: primarySelector, anchor: primarySelector,
            enabled: () => isInteractionElementVisible(primary) && !primary.disabled,
        });
        const resetSelector = `[data-reset-section="${stageId}"]`;
        if (document.querySelector(resetSelector)) registerNavigationField({
            id: `${stageId}-reset-action`, stageId, kind: 'action', root: resetSelector, anchor: resetSelector,
        });
    });
}

function currentNavigationField(origin = document.activeElement) {
    return fieldNavigationRegistry?.find(origin, { stageId: activeFlowStage }) || null;
}

function moveSpatialFocus(origin, direction) {
    const field = currentNavigationField(origin);
    if (!field || !spatialNavigator) return false;
    const finish = (moved) => {
        if (!moved) return false;
        try { field.commitDraft?.({ report: false }); } catch (_) { /* el issue conserva el borrador */ }
        try { field.closePopup?.(); } catch (_) { /* el foco ya está en el destino */ }
        return true;
    };
    const originRect = origin?.getBoundingClientRect?.() || fieldNavigationRegistry.anchor(field)?.getBoundingClientRect?.();
    if (activeFlowStage === 'fasePAE' && inReverse()) {
        const bridgeId = field.id === 'pae-step-1' && direction === 'right'
            ? 'pae-reverse-diagnoses'
            : field.id === 'pae-reverse-diagnoses' && direction === 'left'
                ? 'pae-step-1'
                : '';
        const bridge = bridgeId ? fieldNavigationRegistry.get(bridgeId) : null;
        if (bridge && fieldNavigationRegistry.available(bridge)) {
            return finish(bridge.enter({ direction, reason: 'spatial', origin, originRect }) !== false);
        }
    }
    const candidates = fieldNavigationRegistry.values({ stageId: activeFlowStage });
    let filtered = candidates.filter((candidate) => candidate.id !== field.id);
    if (field.kind === 'field' && direction === 'down') {
        const fields = filtered.filter((candidate) => candidate.kind === 'field');
        const actions = filtered.filter((candidate) => candidate.kind === 'action');
        if (actions.length && !fields.some((candidate) => {
            const originRect = fieldNavigationRegistry.anchor(field)?.getBoundingClientRect();
            const rect = fieldNavigationRegistry.anchor(candidate)?.getBoundingClientRect();
            return originRect && rect && rect.top > originRect.top;
        })) {
            const safe = actions.find((candidate) => candidate.id.endsWith('primary-action')) || actions[0];
            filtered = safe ? [safe] : actions.slice(0, 1);
        }
    }
    return finish(!!spatialNavigator.move({
        origin: field,
        direction,
        scopeId: activeFlowStage,
        candidates: filtered,
    }));
}

function moveScaleScoreSpatial(origin, direction) {
    if (!origin?.matches?.('.escala-puntaje') || !spatialNavigator) return false;
    const scores = [...document.querySelectorAll('#escalasList .escala-puntaje')]
        .filter((input) => input !== origin && isInteractionElementVisible(input));
    return !!spatialNavigator.move({
        origin,
        direction,
        scopeId: 'faseB',
        candidates: scores,
    });
}

function focusFlowNavigator(stageId = activeFlowStage) {
    const tab = document.querySelector(`[data-flow-target="${stageId}"]:not([disabled])`)
        || document.querySelector(`[data-flow-target="${activeFlowStage}"]:not([disabled])`);
    if (!tab) return false;
    flowNavRovingId = tab.dataset.flowTarget;
    updateFlowNavigator();
    tab.focus();
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    return true;
}

function enterFromFlowNavigator(tab) {
    const stageId = tab?.dataset?.flowTarget;
    if (!stageId || tab.disabled) return false;
    const sameStage = stageId === activeFlowStage;
    flowNavRovingId = stageId;
    if (!sameStage) {
        if (!activateFlowStage(stageId, { focus: false, reason: 'correction' })) return false;
        if (flowStageState(stageId).complete && tabLevelController?.restore(stageId)) return true;
        focusFlowStageEntry(stageId, 'correction');
        return true;
    }
    if (tabLevelController?.restore(stageId)) return true;
    focusFlowStageEntry(stageId, 'correction');
    return true;
}

function handleTabLevel(event, target = event.target) {
    if (!isAgileNavigation()) return false;
    if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
    const navTab = target.closest?.('#flowNav [role="tab"]');
    if (navTab) return enterFromFlowNavigator(navTab);
    const field = currentNavigationField(target);
    if (!field || field.kind !== 'field') return false;
    tabLevelController?.leaveField(field, target);
    return focusFlowNavigator(activeFlowStage);
}

function textareaCaretLine(textarea, index) {
    const style = getComputedStyle(textarea);
    const mirror = document.createElement('div');
    const properties = [
        'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
        'textTransform', 'textIndent', 'wordSpacing', 'tabSize',
    ];
    properties.forEach((property) => { mirror.style[property] = style[property]; });
    Object.assign(mirror.style, {
        position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden',
        whiteSpace: 'pre-wrap', overflowWrap: 'break-word', overflow: 'hidden',
    });
    mirror.textContent = String(textarea.value || '').slice(0, index);
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const top = marker.offsetTop;
    mirror.remove();
    return top;
}

function editorCanLeaveWithArrow(target, direction) {
    if (!['left', 'right', 'up', 'down'].includes(direction)) return false;
    if (target.tagName === 'SELECT' || target.isContentEditable) return false;
    const type = (target.type || '').toLowerCase();
    if (target.tagName === 'INPUT' && ['number', 'range', 'date', 'time', 'datetime-local', 'month', 'week'].includes(type)) return false;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    if (!Number.isFinite(start) || start !== end) return false;
    const length = String(target.value ?? '').length;
    if (direction === 'left') return start === 0;
    if (direction === 'right') return end === length;
    if (target.tagName !== 'TEXTAREA') return true;
    const caretTop = textareaCaretLine(target, start);
    const edgeTop = textareaCaretLine(target, direction === 'up' ? 0 : length);
    return Math.abs(caretTop - edgeTop) < 2;
}

function metricStageId(target) {
    return target?.closest?.('[data-flow-stage]')?.dataset.flowStage
        || String(resolveLogicalSection(target) ?? activeFlowStage ?? '');
}

function metricKeyAction(event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) return 'review';
    if (event.key === 'Enter' && event.shiftKey) return 'continue';
    if (event.key === '?' || (event.key === '/' && event.shiftKey)) return 'shortcuts';
    if (event.key === '/' && !event.shiftKey) return 'search';
    const named = {
        Tab: 'tab', Enter: 'confirm', ' ': 'toggle', Escape: 'cancel',
        Backspace: 'backspace', Delete: 'delete', Home: 'first', End: 'last',
        ArrowLeft: 'arrow', ArrowRight: 'arrow', ArrowUp: 'arrow', ArrowDown: 'arrow',
    };
    return named[event.key] || null;
}

function handleShiftContinue() {
    if (blockOnOpenAppEditorDraft()) return true;
    const sectionId = currentSectionId();
    if (sectionId == null) return false;
    if (sectionId === 'obs' || sectionId === 'note' || sectionId === 'copy') {
        if (!advanceCurrentSectionByShortcut()) {
            const first = isNoteComplete().missing[0];
            if (first) announceAction(`No se puede continuar. Primero: ${first}.`);
        }
        return true;
    }
    if (activeFlowStage !== 'fasePAE') {
        continueFlowStage(activeFlowStage);
        return true;
    }
    validatedStages.add('fasePAE');
    collectFormIssues();
    if (!advanceCurrentSectionByShortcut()) {
        const step = stepByNum(currentStep);
        announceAction(`Complete ${step ? stepLabel(step) : 'el paso actual'} antes de continuar.`);
        focusStepEntry(currentStep);
    }
    return true;
}

function openShortcutsDialog(source) {
    if (!els.shortcutsDialog || els.shortcutsDialog.open) return false;
    const eventInvoker = source?.currentTarget;
    const directInvoker = source?.nodeType === Node.ELEMENT_NODE ? source : null;
    const invoker = eventInvoker || directInvoker || document.activeElement;
    if (interactionOverlays && !interactionOverlays.get('shortcuts')) {
        interactionOverlays.push({
            id: 'shortcuts',
            element: els.shortcutsDialog,
            invoker,
            modal: true,
            onClose: () => {
                if (els.shortcutsDialog.open) els.shortcutsDialog.close();
            },
        });
    }
    els.shortcutsDialog.showModal();
    requestAnimationFrame(() => els.shortcutsClose?.focus());
    return true;
}

function closeShortcutsDialog() {
    if (!els.shortcutsDialog?.open) return;
    els.shortcutsDialog.close();
}

function keepTabInsideDialog(event, dialog) {
    if (event.key !== 'Tab' || !dialog) return false;
    const controls = [...dialog.querySelectorAll([
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
    ].join(','))].filter((control) => !control.closest('[hidden], [inert], [aria-hidden="true"]'));
    if (!controls.length) return false;
    const currentIndex = controls.indexOf(document.activeElement);
    const nextIndex = currentIndex < 0
        ? (event.shiftKey ? controls.length - 1 : 0)
        : (currentIndex + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
    controls[nextIndex].focus();
    return true;
}

function moveDialogActionFocus(dialog, origin, direction) {
    if (!dialog || !['left', 'right', 'up', 'down'].includes(direction)) return false;
    const button = origin?.closest?.('[data-dialog-actions] button');
    const group = button?.closest?.('[data-dialog-actions]');
    if (!button || !group || !dialog.contains(group)) return false;
    const buttons = [...group.querySelectorAll('button:not([disabled])')]
        .filter((candidate) => isInteractionElementVisible(candidate));
    if (buttons.length < 2 || !buttons.includes(button)) return false;

    const centers = buttons.map((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return { candidate, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    const current = centers.find(({ candidate }) => candidate === button);
    const horizontal = direction === 'left' || direction === 'right';
    const sign = direction === 'right' || direction === 'down' ? 1 : -1;
    const next = centers
        .filter(({ candidate }) => candidate !== button)
        .map((entry) => {
            const mainDelta = ((horizontal ? entry.x : entry.y) - (horizontal ? current.x : current.y)) * sign;
            if (mainDelta <= 2) return null;
            const crossDelta = Math.abs((horizontal ? entry.y : entry.x) - (horizontal ? current.y : current.x));
            return { ...entry, score: mainDelta + crossDelta * 2 };
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score)[0]?.candidate;
    const fallbackIndex = Math.max(0, Math.min(
        buttons.length - 1,
        buttons.indexOf(button) + (sign > 0 ? 1 : -1),
    ));
    const destination = next || buttons[fallbackIndex];
    destination?.focus({ preventScroll: true });
    return !!destination;
}

function setupDialogActionNavigation(dialog) {
    if (!dialog || dialog.dataset.actionNavigation === 'true') return;
    dialog.dataset.actionNavigation = 'true';
    dialog.addEventListener('keydown', (event) => {
        if (event.defaultPrevented || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
        if (!event.key.startsWith('Arrow')) return;
        const direction = event.key.slice(5).toLowerCase();
        if (!moveDialogActionFocus(dialog, event.target, direction)) return;
        event.preventDefault();
        event.stopPropagation();
    });
}

function primaryReviewAction() {
    if (els.drawerConfirmBtn && !els.drawerConfirmBtn.hidden && !els.drawerConfirmBtn.disabled) return els.drawerConfirmBtn;
    if (els.drawerCopyBtn && !els.drawerCopyBtn.hidden && !els.drawerCopyBtn.disabled) return els.drawerCopyBtn;
    if (els.drawerDiscardBtn && !els.drawerDiscardBtn.hidden) return els.drawerDiscardBtn;
    return els.noteDrawerClose;
}

function setupInteractionCore() {
    const core = window.CareFlowInteraction;
    const surface = document.querySelector('[data-keyboard-surface="delivery"]');
    if (!core || !surface) {
        console.error('[CareFlow] No fue posible iniciar el núcleo de interacción.');
        return;
    }

    interactionRegistry = new core.InteractionRegistry();
    FLOW_STAGE_ORDER.forEach((id) => {
        interactionRegistry.register({
            id,
            root: () => document.querySelector(`[data-flow-stage="${id}"]`),
            commitDrafts: () => window.NotaCampos?.commitDrafts?.(id),
            getIssues: () => window.NotaCampos?.getIssues?.(id) || [],
            focusEntry: ({ reason = 'advance' } = {}) => focusFlowStageEntry(id, reason),
            focusIssue: () => window.NotaCampos?.focusFirstPending?.(id),
            continue: () => continueFlowStage(id),
            search: (origin) => window.NotaCampos?.searchForPhase?.(id, origin),
            restoreFocus: () => restoreStageFocus(id),
            writingTargets: () => writingTargetsForScope(id === 'fasePAE' ? currentStep : id),
            activateForWriting: (origin) => {
                const scopeId = id === 'fasePAE' ? currentStep : id;
                return primaryWritingTarget(scopeId, origin) || writingTargetsForScope(scopeId)[0] || null;
            },
            fallbackTypeahead: (character) => id === 'fasePAE' && runSectionTypeahead(character, currentStep),
        });
    });
    interactionRegistry.register({ id: 'obs', root: () => els.otrosComentarios, priority: 20 });
    interactionRegistry.register({ id: 'note', root: () => els.copyBtn, priority: 20 });
    interactionRegistry.register({ id: 'copy', root: () => els.drawerCopyBtn, priority: 20 });
    interactionRegistry.register({ id: 'confirm-note', root: () => els.drawerConfirmBtn, priority: 20 });
    interactionRegistry.register({ id: 'discard-note', root: () => els.drawerDiscardBtn, priority: 20 });

    interactionFocus = new core.FocusManager({ registry: interactionRegistry, root: document });
    interactionFocus.startTracking(document);
    interactionIssues = new core.IssueRegistry({
        focusManager: interactionFocus,
        stageOrder: FLOW_STAGE_ORDER,
    });
    interactionAnnouncer = new core.ActionAnnouncer({ region: els.actionAnnouncer, dedupeMs: 650 });
    interactionOverlays = new core.OverlayManager({ focusManager: interactionFocus });
    interactionOrigin = new core.InteractionOrigin({ target: document }).start();
    interactionChanges = new core.ChangeTransaction();
    interactionMetrics = new core.InteractionMetrics({ limit: 3000 });
    writingTargetRegistry = new core.WritingTargetRegistry({
        isAvailable: (element) => isWritingElement(element),
    });
    fieldNavigationRegistry = new core.FieldNavigationRegistry({
        isAvailable: (field, anchor) => !!anchor && isInteractionElementVisible(anchor),
    });
    tabLevelController = new core.TabLevelController({ registry: fieldNavigationRegistry });
    setupFieldNavigationRegistry();
    spatialNavigator = new core.SpatialNavigator({
        isAvailable: (element) => isInteractionElementVisible(element),
        focus: (element) => focusSpatialUnit(element),
    });
    window.CareFlowMetrics = Object.freeze({
        snapshot: () => interactionMetrics.snapshot(),
        reset: () => interactionMetrics.reset(),
    });

    const showKeyboardCoach = () => {
        document.documentElement.dataset.inputModality = 'keyboard';
        if (els.keyboardCoach) els.keyboardCoach.hidden = false;
    };
    document.addEventListener('keydown', (event) => {
        showKeyboardCoach();
        const insideOverlay = interactionOverlays?.contains?.(event.target);
        if (!formSurfaceContains(event.target) && !insideOverlay) return;
        const action = metricKeyAction(event);
        if (!action) return;
        interactionMetrics.record('keyboard-action', {
            action,
            targetId: stableFocusId(event.target),
            stageId: metricStageId(event.target),
            modality: 'keyboard',
        });
    }, true);
    document.addEventListener('pointerdown', (event) => {
        document.documentElement.dataset.inputModality = 'pointer';
        if (!formSurfaceContains(event.target)) return;
        interactionMetrics.record('pointer-action', {
            action: 'activate',
            targetId: stableFocusId(event.target),
            stageId: metricStageId(event.target),
            modality: event.pointerType || 'pointer',
        });
    }, true);

    const openReview = () => {
        toggleNote(true);
        return true;
    };

    keyboardController = new core.KeyboardController({
        target: document,
        capture: false,
        surface: ({ target, event }) => formSurfaceContains(target) || isDirectWritingEvent(event),
        registry: interactionRegistry,
        overlays: interactionOverlays,
        origin: interactionOrigin,
        handlers: {
            overlay: ({ event, key, overlay, target }) => {
                showKeyboardCoach();
                if (overlay?.modal !== false && keepTabInsideDialog(event, overlay?.element)) return true;
                if (key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey) {
                    if (overlay?.id === 'note-review') primaryReviewAction()?.focus();
                    return true;
                }
                return false;
            },
            editor: ({ event, key, target }) => {
                showKeyboardCoach();
                const direction = key.startsWith('Arrow') ? key.slice(5).toLowerCase() : null;
                if (isAgileNavigation() && direction && event.shiftKey
                    && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    if (target.matches('.escala-puntaje')) {
                        moveScaleScoreSpatial(target, direction);
                        return true;
                    }
                    moveSpatialFocus(target, direction);
                    return true;
                }
                if (target.closest('.custom-form')) return false;
                if (handleTabLevel(event, target)) return true;
                if (key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey) return openReview();
                if (key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    return handleShiftContinue();
                }
                return false;
            },
            global: ({ event, key, target }) => {
                showKeyboardCoach();
                if (handleTabLevel(event, target)) return true;
                if (key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    return handleShiftContinue();
                }
                if (key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey) return openReview();
                if (core.isEditableTarget(target)) return false;
                const direction = key.startsWith('Arrow') ? key.slice(5).toLowerCase() : null;
                if (isAgileNavigation() && direction && event.shiftKey
                    && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    moveSpatialFocus(target, direction);
                    return true;
                }
                const isQuestionKey = key === '?' || (key === '/' && event.shiftKey);
                if (isQuestionKey && !event.ctrlKey && !event.metaKey && !event.altKey) return openShortcutsDialog();
                if (key === '/' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    const box = searchForActiveSection(target);
                    if (!box) return false;
                    box.focus();
                    box.select?.();
                    return true;
                }
                if (!isDirectWritingEvent(event)) return false;
                return routeDirectWriting(event, target);
            },
        },
    }).start();
}

/* ─── Puntúa la relevancia de una opción frente al texto buscado ─── */
function scoreOption(opt, q) {
    const title = normalizeText(opt.querySelector('h4')?.textContent || '');
    if (title.startsWith(q)) return 3;                                  // prefijo del título
    if (title.split(/\s+/).some((w) => w.startsWith(q))) return 2;      // prefijo de palabra
    if (title.includes(q)) return 1;                                    // substring en título
    return 0;                                                           // solo en la descripción
}

/* ─── Filtra y ordena opciones por búsqueda (acento-insensible + ranking) ───
   Reordena el DOM solo durante búsqueda activa; al limpiar, restaura el orden
   clínico original (data-ord). Las tarjetas "+ agregar"/personalizadas van al final. */
function filterOptions(container, query) {
    const q = normalizeText(query.trim());
    const focusedOption = container.contains(document.activeElement)
        ? document.activeElement.closest?.('.option')
        : null;
    const all = [...container.querySelectorAll('.option')];
    const isSpecial = (o) => o.classList.contains('option--add') || o.classList.contains('option--custom');
    const special = all.filter(isSpecial);
    const regular = all.filter((o) => !isSpecial(o));
    const ord = (o) => Number(o.dataset.ord || 0);

    // Visibilidad
    regular.forEach((o) => { o.style.display = !q || normalizeText(o.textContent).includes(q) ? '' : 'none'; });
    special.forEach((o) => { o.style.display = ''; });

    // Orden: por relevancia durante búsqueda; por orden clínico original al limpiar
    if (q) {
        regular.sort((a, b) => scoreOption(b, q) - scoreOption(a, q) || ord(a) - ord(b));
    } else {
        regular.sort((a, b) => ord(a) - ord(b));
    }
    regular.forEach((o) => container.appendChild(o));   // appendChild mueve el nodo existente
    special.sort((a, b) => ord(a) - ord(b)).forEach((o) => container.appendChild(o));

    const visibleCount = regular.filter((o) => o.style.display !== 'none').length;
    updateSearchResultsStatus(container, q, visibleCount);

    // Re-preparar roles y roving tabindex sobre las opciones que quedaron visibles
    markOptions(container);
    primeRoving(container);
    if (focusedOption?.isConnected && focusedOption.style.display !== 'none') {
        focusOption(focusedOption, container);
    }
}

function ensureSearchResultsStatus(input, container) {
    if (!input || !container) return null;
    if (!container.id) container.id = `${input.id || 'search'}Results`;
    const id = `${container.id}Status`;
    let status = document.getElementById(id);
    if (!status) {
        status = document.createElement('p');
        status.id = id;
        status.className = 'search-results-status';
        container.before(status);
    }
    input.setAttribute('aria-controls', container.id);
    const describedBy = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    describedBy.add(id);
    input.setAttribute('aria-describedby', [...describedBy].join(' '));
    container.setAttribute('aria-label', `Resultados de ${input.getAttribute('aria-label') || 'la búsqueda'}`);
    container.dataset.resultsStatus = id;
    return status;
}

function updateSearchResultsStatus(container, query, count) {
    const status = document.getElementById(container?.dataset.resultsStatus || '');
    if (!status) return;
    if (!query) {
        status.textContent = '';
        status.classList.remove('search-results-status--empty');
        return;
    }
    status.textContent = count
        ? `${count} resultado${count === 1 ? '' : 's'}.`
        : 'Sin coincidencias en la lista.';
    status.classList.toggle('search-results-status--empty', count === 0);
    announceAction(status.textContent);
}

/* ─── (Obsoleto) El preview lateral de transversales se retiró; las transversales
   siguen incluyéndose en la nota generada. No-op para los llamados existentes. ─── */
function renderTransversales() {}

/* ─── Aplica la condición clínica elegida en el paso 1 del PAE ───
   `key` es la clave exacta de datosProPai; null limpia la identificación. */
function applyAreaSelection(key, opts = {}) {
    if (key == null) {
        // El usuario vació el área: se limpia la identificación (conserva datos del paciente)
        if (selected.area) { clearIdentification(); activateStep(1); }
        return true;
    }
    if (!isPatientGateUnlocked()) return false;
    if (!datosProPai[key]) return false;

    if (selected.area === key) {
        els.areas.querySelectorAll('.option').forEach((o) => o.classList.toggle('selected', o.dataset.area === key));
        syncOptionSelectionState(els.areas);
        if (opts.advancePae !== false) {
            activateFlowStage('fasePAE', { focus: false });
            activateStep(2, { focus: opts.focus !== false });
        } else activateStep(1);
        announceAction('Condición clínica confirmada. La información posterior se conservó.');
        return true;
    }

    const hasDownstream = !!selected.diagnostico
        || selected.rc.length > 0 || selected.ep.length > 0 || selected.nics.length > 0
        || selected.noc !== null || selected.b6Puntuacion !== null;
    if (selected.area && hasDownstream && !opts.confirmed) {
        runDependentChange({
            title: '¿Cambiar la condición clínica?',
            description: 'Se reiniciarán el diagnóstico de enfermería, los factores relacionados, los signos, el resultado NOC, las intervenciones NIC y la evaluación B6. Los demás datos de la nota se conservarán.',
            confirmLabel: 'Cambiar condición',
            trigger: opts.trigger || document.activeElement,
            onConfirm: () => applyAreaSelection(key, { ...opts, confirmed: true }),
        });
        return false;
    }

    selected.area = key;
    selected.areaNombre = areaLabel(key);
    selected.diagnostico = null; selected.diagnosticoNombre = null;
    selected.datosDiag = null; selected.rc = []; selected.ep = [];
    selected.nics = []; selected.customNics = [];
    selected.noc = null; selected.nocNombre = null; selected.nocCustom = false;
    selected.b6Escala = null; selected.b6EscalaId = null; selected.b6CustomNiveles = [];
    selected.b6Puntuacion = null; selected.b6Descripcion = null;

    els.areas.querySelectorAll('.option').forEach((o) => o.classList.toggle('selected', o.dataset.area === key));
    syncOptionSelectionState(els.areas);

    [2, 3, 4, 5, 6, 7].forEach(n => document.getElementById(`step${n}`)?.classList.remove('completed'));
    maxReachedStep = 1;   // el avance posterior ya no es válido: se eligió otra área
    showMetaBlock(false);

    els.searchDiag.value = '';
    loadDiagnosticos(key);
    if (opts.advancePae !== false) {
        activateStep(2, { focus: opts.focus !== false });
        activateFlowStage('fasePAE', { focus: opts.focus !== false });
    } else activateStep(1);
    renderTransversales(null);
    markDraftRevision();
    updateNote();
    return true;
}

/* ─── Carga áreas / condiciones clínicas ─── */
function loadAreas() {
    els.areas.innerHTML = '';
    NOTA_AREAS.forEach(({ key, label }) => {
        if (!datosProPai[key]) return;
        const count = Object.keys(datosProPai[key]).length;
        const opt = createOption(label, `${count} diagnóstico(s) de enfermería`, { area: key });
        els.areas.appendChild(opt);
    });
    setupOptionList(els.areas, { searchInput: els.searchAreas, stepNum: 1 });

    els.areas.onclick = (e) => {
        const option = e.target.closest('.option');
        if (!option) return;
        const advance = shouldAdvanceOption();
        applyAreaSelection(option.dataset.area, {
            focus: advance && shouldMoveFocusAfterActivation(e),
            advancePae: advance,
            trigger: option,
        });
    };
}

/* ─── Carga diagnósticos ─── */
function loadDiagnosticos(area) {
    els.diagnosticos.innerHTML = '';
    const diagnosticos = datosProPai[area] || {};

    Object.entries(diagnosticos).forEach(([nombre, datos]) => {
        const nocPreview = (datos.noc || []).slice(0, 2).join(' · ');
        const opt = createOption(nombre, `NOC: ${nocPreview}${(datos.noc || []).length > 2 ? '…' : ''}`, { diagnostico: nombre });
        els.diagnosticos.appendChild(opt);
    });
    setupOptionList(els.diagnosticos, { searchInput: els.searchDiag, stepNum: 2 });

    const applyDiagnosis = (option, confirmed = false, advance = shouldAdvanceOption(), moveFocus = true) => {
        if (!option || option.style.display === 'none') return;
        const nextDiagnosis = option.dataset.diagnostico;

        if (selected.diagnostico === nextDiagnosis) {
            els.diagnosticos.querySelectorAll('.option').forEach((o) => o.classList.toggle('selected', o === option));
            syncOptionSelectionState(els.diagnosticos);
            if (advance) proceedAfterDiag(selected.datosDiag, { advance: true, focus: moveFocus });
            announceAction('Diagnóstico confirmado. La información posterior se conservó.');
            return;
        }

        const hasDownstream = selected.rc.length > 0 || selected.ep.length > 0
            || selected.nics.length > 0 || selected.noc !== null || selected.b6Puntuacion !== null;
        if (selected.diagnostico && hasDownstream && !confirmed) {
            runDependentChange({
                title: '¿Cambiar el diagnóstico de enfermería?',
                description: 'Se reiniciarán los factores relacionados, los signos, el resultado NOC, las intervenciones NIC y la evaluación B6.',
                confirmLabel: 'Cambiar diagnóstico',
                trigger: option,
                onConfirm: () => applyDiagnosis(option, true, advance, moveFocus),
            });
            return;
        }

        els.diagnosticos.querySelectorAll('.option').forEach((o) => o.classList.remove('selected'));
        option.classList.add('selected');
        syncOptionSelectionState(els.diagnosticos);

        selected.diagnostico = nextDiagnosis;
        selected.diagnosticoNombre = selected.diagnostico;
        selected.datosDiag = diagnosticos[selected.diagnostico];
        selected.rc = []; selected.ep = [];
        selected.nics = []; selected.customNics = [];
        selected.noc = null; selected.nocNombre = null; selected.nocCustom = false;
        selected.b6Escala = null; selected.b6EscalaId = null; selected.b6CustomNiveles = [];
        selected.b6Puntuacion = null; selected.b6Descripcion = null;

        [3, 4, 5, 6, 7].forEach(n => document.getElementById(`step${n}`)?.classList.remove('completed'));
        maxReachedStep = 2;   // el avance posterior ya no es válido: se eligió otro diagnóstico
        showMetaBlock(false);

        renderTransversales(selected.datosDiag);
        proceedAfterDiag(selected.datosDiag, { advance, focus: moveFocus });
        markDraftRevision();
        updateNote();
    };

    els.diagnosticos.onclick = (e) => {
        const option = e.target.closest('.option');
        applyDiagnosis(option, false, shouldAdvanceOption(), shouldMoveFocusAfterActivation(e));
    };
}

/* ─── Pasos comunes tras elegir diagnóstico: carga RC/EP y entra a "Relacionado con".
   RC siempre existe; EP solo en diagnósticos no-riesgo (si falta, ese paso se oculta). */
function proceedAfterDiag(datos, { advance = true, focus = true } = {}) {
    els.searchRc.value = ''; els.searchEp.value = ''; els.searchNic.value = '';
    loadRc(datos);
    loadEp(datos);
    if (!advance) return;
    if ((datos.rc || []).length) {
        activateStep(3, { focus });          // → Relacionado con
    } else {                                        // defensivo: sin RC, ir directo a NOC
        loadNocs(datos);
        activateStep(5, { focus });
    }
}

/* ─── Picker multi-select genérico (usado por RC y EP; mismo patrón que NIC) ─── */
function loadMultiPicker({ container, items, selArr, searchInput, stepNum, onAdvance, updateBtn }) {
    container.innerHTML = '';
    items.forEach((txt, i) => {
        const opt = createOption(txt, 'Seleccione para marcar o desmarcar', { idx: String(i) });
        if (selArr.includes(txt)) opt.classList.add('multi-selected');
        container.appendChild(opt);
    });
    setupOptionList(container, {
        searchInput,
        multi: true,
        stepNum,
        onAdvance,
        onBottomEdge: () => focusConfirmButtonForStep(stepNum),
    });
    updateBtn();

    container.onclick = (e) => {
        const option = e.target.closest('.option');
        if (!option || option.style.display === 'none') return;
        const txt = items[Number(option.dataset.idx)];
        if (option.classList.contains('multi-selected')) {
            option.classList.remove('multi-selected');
            const i = selArr.indexOf(txt); if (i >= 0) selArr.splice(i, 1);
            offerUndo('Se quitó una selección', () => {
                if (!selArr.includes(txt)) selArr.splice(Math.min(Math.max(i, 0), selArr.length), 0, txt);
                option.classList.add('multi-selected');
                syncOptionSelectionState(container);
                updateBtn();
                updateNote();
            });
        } else {
            option.classList.add('multi-selected');
            selArr.push(txt);
        }
        syncOptionSelectionState(container);
        updateBtn();
        if (searchInput) {
            searchInput.value = '';
            filterOptions(container, '');
        }
        updateNote();
    };
}

/* ─── Carga "Relacionado con" (multi-select con búsqueda) ─── */
function loadRc(datos) {
    loadMultiPicker({
        container: els.rcList, items: datos.rc || [], selArr: selected.rc,
        searchInput: els.searchRc, stepNum: 3, updateBtn: updateRcConfirmBtn,
        onAdvance: () => { if (!els.rcConfirmBtn?.disabled) els.rcConfirmBtn.click(); },
    });
}

/* ─── Carga "Evidenciado por" (multi-select con búsqueda) ─── */
function loadEp(datos) {
    loadMultiPicker({
        container: els.epList, items: datos.ep || [], selArr: selected.ep,
        searchInput: els.searchEp, stepNum: 4, updateBtn: updateEpConfirmBtn,
        onAdvance: () => { if (!els.epConfirmBtn?.disabled) els.epConfirmBtn.click(); },
    });
}

/* ─── Confirmación de RC → EP (si existe) o NOC ─── */
function proceedAfterRc({ focus = true } = {}) {
    if (selected.rc.length === 0) return;
    if ((selected.datosDiag?.ep || []).length) {
        activateStep(4, { focus });          // → Evidenciado por
    } else {
        loadNocs(selected.datosDiag);
        activateStep(5, { focus });          // → NOC
    }
}

/* ─── Confirmación de EP → NOC ─── */
function proceedAfterEp({ focus = true } = {}) {
    if (selected.ep.length === 0) return;
    loadNocs(selected.datosDiag);
    activateStep(5, { focus });              // → NOC
}

/* ─── Escapa texto del usuario para insertarlo de forma segura en innerHTML ─── */
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

/* ─── Une una lista de textos (escapados) en lenguaje natural: "A, B y C" ─── */
function joinClause(arr) {
    const items = arr.map(escapeHtml);
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
}

/* ─── Lista de viñetas para un grupo denso de la nota (mismo <ul><li> que NIC/
   transversales, para consistencia visual y copia en texto plano). items ya escapados. ─── */
function noteListHtml(items) {
    return `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
}

/* ─── Formatea texto libre (observaciones): escapa HTML, preserva saltos
   de línea como <br> y convierte viñetas "- " / "* " en "• " ─── */
function formatFreeText(text) {
    return text
        .split('\n')
        .map((line) => escapeHtml(line).replace(/^(\s*)[-*]\s+/, '$1• '))
        .join('<br>');
}

/* ─── Editor inline reutilizable para registrar una opción personalizada ─── */
function buildCustomForm({ placeholder, value = '', onCommit, onCancel }) {
    const form = document.createElement('div');
    form.className = 'custom-form';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'custom-form-input';
    input.placeholder = placeholder;
    input.maxLength = 160;
    input.value = value || '';
    input.dataset.initialValue = value || '';
    input.setAttribute('aria-label', placeholder);

    const actions = document.createElement('div');
    actions.className = 'custom-form-actions';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'custom-form-add';
    addBtn.textContent = 'Agregar';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'custom-form-cancel';
    cancelBtn.setAttribute('aria-label', 'Cancelar');
    cancelBtn.textContent = '✕';
    actions.append(addBtn, cancelBtn);
    form.append(input, actions);

    const commit = () => {
        const v = input.value.trim();
        if (v) {
            input.setAttribute('aria-invalid', 'false');
            onCommit(v);
            return;
        }
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        announceAction('Escriba un valor antes de confirmar.');
    };
    input.addEventListener('input', () => input.setAttribute('aria-invalid', 'false'));
    addBtn.addEventListener('click', commit);
    cancelBtn.addEventListener('click', () => onCancel && onCancel());
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.altKey)) {
            e.preventDefault();
            e.stopPropagation();
            announceAction('Confirme o cancele el editor personalizado antes de revisar la nota.');
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            commit();
        }
        else if (e.key === 'Escape') { e.preventDefault(); onCancel && onCancel(); }
    });
    // Los clics dentro del editor no deben propagarse al onclick del contenedor
    form.addEventListener('click', (e) => e.stopPropagation());
    // Enfocar tras la inserción (setTimeout sí dispara en pestañas en segundo plano)
    setTimeout(() => input.focus(), 0);
    return form;
}

/* ─── Tarjeta "+ agregar personalizada" (punteada) ─── */
function buildAddCard(titulo) {
    const add = document.createElement('div');
    add.className = 'option option--add';
    add.innerHTML = `<h4><span class="option-add-icon">+</span> ${titulo}</h4>` +
                    `<p>Agrégalo si no está en la lista</p>`;
    return add;
}

/* ─── Banner del paso 5: deja claro que la escala B6 evalúa el NOC elegido ─── */
function renderB6NocRef(nocNombre) {
    const ref = document.getElementById('b6NocRef');
    if (!ref) return;
    if (nocNombre) {
        const disp = selected.nocCustom ? escapeHtml(nocNombre) : nocNombre;
        ref.innerHTML = `Evaluando el resultado esperado (NOC): <strong>${disp}</strong>`;
        ref.hidden = false;
    } else {
        ref.hidden = true;
        ref.innerHTML = '';
    }
}

/* ─── Pasos comunes tras definir el NOC (predefinido o personalizado) ─── */
function proceedAfterNoc(datos, { advance = true, focus = true } = {}) {
    selected.nics = [];
    selected.customNics = [];
    selected.b6Escala = null;
    selected.b6EscalaId = null;
    selected.b6CustomNiveles = [];
    selected.b6Puntuacion = null;
    selected.b6Descripcion = null;
    const b6Picker = document.getElementById('b6ScalePicker');
    const b6Custom = document.getElementById('b6CustomScale');
    if (b6Picker) b6Picker.hidden = true;
    if (b6Custom) { b6Custom.hidden = true; b6Custom.innerHTML = ''; }
    [6, 7].forEach((n) => document.getElementById(`step${n}`)?.classList.remove('completed'));
    maxReachedStep = 5;   // el avance posterior ya no es válido: se eligió otro NOC
    showMetaBlock(false);
    els.searchNic.value = '';
    loadIntervenciones(datos);
    if (advance) activateStep(6, { focus });
    updateNote();
}

/* ─── Si no queda ninguna NIC, limpia el paso B6 ─── */
function clearB6IfNoNics() {
    if (selected.nics.length === 0) {
        selected.b6Puntuacion = null; selected.b6Descripcion = null;
        els.evaluaciones.innerHTML = '';
        showMetaBlock(false);
        document.getElementById('step7')?.classList.remove('completed', 'active');
        if (maxReachedStep > 6) maxReachedStep = 6;
    }
}

/* ─── Abre el editor inline para agregar una NIC personalizada ─── */
function openNicCustomForm(datos) {
    const add = document.querySelector('#nicCustomControls .nic-custom-add');
    if (!add) return;
    const form = buildCustomForm({
        placeholder: 'Escriba la intervención NIC…',
        onCommit: (v) => {
            if (!selected.nics.includes(v)) {
                selected.customNics.push(v);
                selected.nics.push(v);
            }
            loadIntervenciones(datos);   // re-render: muestra la nueva tarjeta + "agregar"
            updateNote();
            els.searchNic?.focus();      // devolver el foco al combobox para seguir
        },
        onCancel: () => { loadIntervenciones(datos); els.searchNic?.focus(); },
    });
    add.replaceWith(form);
}

/* ─── Quita una NIC personalizada ─── */
function removeNicCustom(datos, nic) {
    const index = selected.customNics.indexOf(nic);
    const selectedIndex = selected.nics.indexOf(nic);
    const b6Snapshot = {
        b6Escala: selected.b6Escala,
        b6EscalaId: selected.b6EscalaId,
        b6CustomNiveles: [...selected.b6CustomNiveles],
        b6Puntuacion: selected.b6Puntuacion,
        b6Descripcion: selected.b6Descripcion,
    };
    selected.customNics = selected.customNics.filter((n) => n !== nic);
    selected.nics = selected.nics.filter((n) => n !== nic);
    clearB6IfNoNics();
    loadIntervenciones(datos);
    updateNote();
    requestAnimationFrame(() => {
        const chips = [...document.querySelectorAll('#nicCustomControls [data-nic-custom]')];
        const target = chips[Math.min(Math.max(index, 0), chips.length - 1)]
            || document.querySelector('#nicCustomControls .nic-custom-add')
            || els.searchNic;
        target?.focus();
    });
    offerUndo('Intervención personalizada eliminada', () => {
        if (!selected.customNics.includes(nic)) selected.customNics.splice(Math.max(0, index), 0, nic);
        if (!selected.nics.includes(nic)) selected.nics.splice(Math.max(0, selectedIndex), 0, nic);
        Object.assign(selected, b6Snapshot);
        loadIntervenciones(datos);
        if (b6Snapshot.b6Puntuacion != null) loadEvaluaciones(selected.datosDiag, selected.nocNombre);
        updateNote();
        document.querySelector(`#nicCustomControls [data-nic-custom="${CSS.escape(nic)}"]`)?.focus();
    });
}

function renderNicCustomControls(datos) {
    document.getElementById('nicCustomControls')?.remove();
    const controls = document.createElement('div');
    controls.id = 'nicCustomControls';
    controls.className = 'custom-selection-controls';
    controls.setAttribute('aria-label', 'Intervenciones personalizadas');
    selected.customNics.forEach((nic) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'custom-selection-chip';
        chip.dataset.nicCustom = nic;
        chip.setAttribute('aria-label', `Quitar intervención personalizada: ${nic}`);
        chip.setAttribute('aria-keyshortcuts', 'Delete Backspace Shift+Backspace');
        chip.textContent = `${nic} ×`;
        chip.addEventListener('click', () => removeNicCustom(datos, nic));
        chip.addEventListener('keydown', (event) => {
            if (!['Delete', 'Backspace'].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
            event.preventDefault();
            removeNicCustom(datos, nic);
        });
        controls.appendChild(chip);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'nic-custom-add custom-selection-add';
    add.textContent = '+ Otra intervención personalizada';
    add.addEventListener('click', () => openNicCustomForm(datos));
    controls.appendChild(add);
    els.intervenciones.after(controls);
}

/* ─── Carga intervenciones NIC (multi-select con botón de confirmación) ─── */
function loadIntervenciones(datos) {
    els.intervenciones.innerHTML = '';
    const nics = datos.nic || [];

    nics.forEach((nic, i) => {
        const opt = createOption(nic, 'Seleccione para marcar o desmarcar', { nic: String(i) });
        if (selected.nics.includes(nic)) opt.classList.add('multi-selected');
        els.intervenciones.appendChild(opt);
    });

    renderNicCustomControls(datos);
    // Modo navegación (multi): Enter alterna la NIC enfocada; Shift+Enter o el botón
    // Continuar avanzan (sin avances accidentales). El buscador entrega aquí con Enter/↓.
    setupOptionList(els.intervenciones, {
        searchInput: els.searchNic,
        multi: true,
        stepNum: 6,
        onAdvance: () => { if (!els.nicConfirmBtn?.disabled) els.nicConfirmBtn.click(); },
        onBottomEdge: () => focusConfirmButtonForStep(6),
    });

    updateNicConfirmBtn();

    els.intervenciones.onclick = (e) => {
        if (e.target.closest('.custom-form')) return;            // clics dentro del editor

        const option = e.target.closest('.option');
        if (!option || option.style.display === 'none') return;

        // NIC predefinida: alternar selección
        const nicText = nics[Number(option.dataset.nic)];
        if (option.classList.contains('multi-selected')) {
            option.classList.remove('multi-selected');
            const removedIndex = selected.nics.indexOf(nicText);
            const b6Snapshot = {
                b6Escala: selected.b6Escala,
                b6EscalaId: selected.b6EscalaId,
                b6CustomNiveles: [...selected.b6CustomNiveles],
                b6Puntuacion: selected.b6Puntuacion,
                b6Descripcion: selected.b6Descripcion,
            };
            selected.nics = selected.nics.filter((n) => n !== nicText);
            offerUndo('Se quitó una intervención NIC', () => {
                if (!selected.nics.includes(nicText)) {
                    selected.nics.splice(Math.min(Math.max(removedIndex, 0), selected.nics.length), 0, nicText);
                }
                Object.assign(selected, b6Snapshot);
                option.classList.add('multi-selected');
                syncOptionSelectionState(els.intervenciones);
                if (b6Snapshot.b6Puntuacion != null) loadEvaluaciones(selected.datosDiag, selected.nocNombre);
                updateNicConfirmBtn();
                updateNote();
            });
        } else {
            option.classList.add('multi-selected');
            selected.nics.push(nicText);
        }
        syncOptionSelectionState(els.intervenciones);
        els.searchNic.value = '';
        filterOptions(els.intervenciones, '');
        clearB6IfNoNics();
        updateNicConfirmBtn();
        updateNote();
    };
}

function commitNocSelection(datos, { id, name, custom, confirmed = false, trigger, advance = shouldAdvanceOption(), focus = true } = {}) {
    const sameSelection = selected.noc === id && selected.nocNombre === name;
    if (sameSelection) {
        loadNocs(datos);
        if (advance) {
            loadIntervenciones(datos);
            activateStep(6, { focus });
        } else {
            requestAnimationFrame(() => {
                const chosen = els.nocs.querySelector('.option.selected') || visibleOptions(els.nocs)[0];
                if (chosen) focusOption(chosen, els.nocs);
            });
        }
        announceAction('Resultado NOC confirmado. Las intervenciones y la evaluación se conservaron.');
        return;
    }

    const hasDownstream = selected.nics.length > 0 || selected.b6Puntuacion !== null;
    if (selected.noc !== null && hasDownstream && !confirmed) {
        runDependentChange({
            title: '¿Cambiar el resultado NOC?',
            description: 'Se reiniciarán las intervenciones NIC seleccionadas y la evaluación B6.',
            confirmLabel: 'Cambiar resultado',
            trigger: trigger || document.activeElement,
            onConfirm: () => commitNocSelection(datos, { id, name, custom, confirmed: true, trigger, advance, focus }),
        });
        return;
    }

    // Cualquier deshacer pendiente pertenece al contexto del NOC anterior.
    // Invalidarlo antes de cambiar evita restaurar NIC/B6 bajo otro resultado.
    cancelPendingUndo();
    selected.noc = id;
    selected.nocNombre = name;
    selected.nocCustom = !!custom;
    markDraftRevision();
    loadNocs(datos);
    proceedAfterNoc(datos, { advance, focus });
    if (!advance) {
        requestAnimationFrame(() => {
            const chosen = els.nocs.querySelector('.option.selected') || visibleOptions(els.nocs)[0];
            if (chosen) focusOption(chosen, els.nocs);
        });
    }
}

/* ─── Abre el editor inline para definir un NOC personalizado ─── */
function openNocCustomForm(datos, prefill) {
    const slot = document.querySelector('#nocCustomControls .noc-custom-action');
    if (!slot) return;
    const form = buildCustomForm({
        placeholder: 'Escriba el resultado esperado (NOC)…',
        value: prefill || '',
        onCommit: (v) => {
            commitNocSelection(datos, {
                id: 'custom',
                name: v,
                custom: true,
                trigger: document.activeElement,
            });
        },
        onCancel: () => loadNocs(datos),
    });
    slot.replaceWith(form);
}

function renderNocCustomControls(datos) {
    document.getElementById('nocCustomControls')?.remove();
    const controls = document.createElement('div');
    controls.id = 'nocCustomControls';
    controls.className = 'custom-selection-controls';
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'noc-custom-action custom-selection-add';
    if (selected.nocCustom && selected.nocNombre) {
        action.classList.add('custom-selection-add--selected');
        action.textContent = `Resultado personalizado: ${selected.nocNombre} · Editar`;
        action.setAttribute('aria-label', `Editar resultado personalizado: ${selected.nocNombre}`);
    } else {
        action.textContent = '+ Otro resultado personalizado';
    }
    action.addEventListener('click', () => openNocCustomForm(datos, selected.nocCustom ? selected.nocNombre : ''));
    controls.appendChild(action);
    els.nocs.after(controls);
}

/* ─── Carga resultados NOC ─── */
function loadNocs(datos) {
    els.nocs.innerHTML = '';
    const nocs = datos.noc || [];

    nocs.forEach((noc, i) => {
        const escala = datos.b6_por_noc?.[noc];
        const opt = createOption(noc, escala ? `Escala B6: ${escala.length} niveles` : 'Escala B6: 5 niveles', { noc: String(i) });
        els.nocs.appendChild(opt);
    });

    // Restaurar selección predefinida previa
    if (selected.noc !== null && selected.noc !== 'custom') {
        els.nocs.querySelectorAll('.option')[selected.noc]?.classList.add('selected');
    }

    setupOptionList(els.nocs, { stepNum: 5 });
    renderNocCustomControls(datos);

    els.nocs.onclick = (e) => {
        if (e.target.closest('.custom-form')) return;           // clics dentro del editor
        const option = e.target.closest('.option');
        if (!option) return;

        // NOC predefinido
        const nextNoc = Number(option.dataset.noc);
        commitNocSelection(datos, {
            id: nextNoc,
            name: nocs[nextNoc],
            custom: false,
            trigger: option,
            focus: shouldMoveFocusAfterActivation(e),
        });
    };
}

/* ─── Parsea nivel B6 ─── */
function parseB6(nivel) {
    const t = nivel.trim();
    const m = t.match(/^(\d+)/);   // nivel numérico, sea cual sea el separador (. , - = …)
    return m ? { puntuacion: m[1], descripcion: t } : { puntuacion: '', descripcion: t };
}

/* ─── Renderiza las tarjetas de nivel de una escala y enlaza su selección ─── */
function renderB6Levels(escala) {
    els.evaluaciones.innerHTML = '';
    escala.forEach((nivel, i) => {
        const { puntuacion, descripcion } = parseB6(nivel);
        const opt = createOption(`Nivel ${puntuacion}`, descripcion, { nivel: String(i) });
        if (selected.b6Descripcion && selected.b6Descripcion === descripcion) {
            opt.classList.add('selected');   // restaurar selección previa
        }
        els.evaluaciones.appendChild(opt);
    });
    setupOptionList(els.evaluaciones, { stepNum: 7 });

    els.evaluaciones.onclick = (e) => {
        const option = e.target.closest('.option');
        if (!option) return;

        els.evaluaciones.querySelectorAll('.option').forEach((o) => o.classList.remove('selected'));
        option.classList.add('selected');
        syncOptionSelectionState(els.evaluaciones);

        const parsed = parseB6(escala[Number(option.dataset.nivel)]);
        selected.b6Puntuacion = parsed.puntuacion;
        selected.b6Descripcion = parsed.descripcion;

        showMetaBlock(true);
        updateNote();
        if (shouldAdvanceOption()) {
            collapseStep5();
            // Continuar en la etapa global de Evaluación y entrega.
            activateFlowStage('faseF', { focus: shouldMoveFocusAfterActivation(e) });
        }
    };
}

/* ─── Llena el selector de escala (una sola vez) ─── */
function populateB6ScaleSelect() {
    const sel = document.getElementById('b6ScaleSelect');
    if (!sel || sel.dataset.ready) return;
    sel.innerHTML = B6_ESCALAS.map((e) => `<option value="${e.id}">${e.nombre}</option>`).join('')
        + '<option value="__custom__">+ Crear escala personalizada…</option>';
    sel.dataset.ready = '1';
    sel.addEventListener('change', onB6ScaleChange);
    let scaleFocusAt = 0;
    sel.addEventListener('focus', () => { scaleFocusAt = performance.now(); });
    const confirmScale = (e) => {
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || !sel.value) return;
        e.preventDefault();
        onB6ScaleChange();
        requestAnimationFrame(() => {
            const target = sel.value === '__custom__'
                ? document.querySelector('#b6CustomScale .b6-cs-input')
                : visibleOptions(els.evaluaciones)[0];
            if (target?.classList.contains('option')) focusOption(target, els.evaluaciones);
            else target?.focus();
        });
    };
    sel.addEventListener('keydown', confirmScale);
    sel.addEventListener('keyup', (e) => {
        if (performance.now() - scaleFocusAt > 20) confirmScale(e);
    });
}

/* ─── Cambio de escala (solo NOC personalizado) ─── */
function onB6ScaleChange() {
    const sel = document.getElementById('b6ScaleSelect');
    const customWrap = document.getElementById('b6CustomScale');
    if (!sel) return;

    // Cambiar de escala invalida el nivel elegido previamente
    selected.b6EscalaId = sel.value;
    selected.b6Puntuacion = null;
    selected.b6Descripcion = null;
    showMetaBlock(false);
    if (document.getElementById('step7')?.classList.contains('completed')) activateStep(7);

    if (sel.value === '__custom__') {
        if (customWrap) { customWrap.hidden = false; renderCustomScaleEditor(); }
        // Los niveles aparecen solo si ya se construyó una escala personalizada
        if (selected.b6CustomNiveles && selected.b6CustomNiveles.length) {
            selected.b6Escala = selected.b6CustomNiveles.map((t, i) => `${i + 1}. ${escapeHtml(t)}`);
            renderB6Levels(selected.b6Escala);
        } else {
            selected.b6Escala = null;
            els.evaluaciones.innerHTML = '';
        }
    } else {
        if (customWrap) customWrap.hidden = true;
        selected.b6Escala = (B6_ESCALAS.find((e) => e.id === sel.value) || B6_ESCALAS[0]).niveles;
        renderB6Levels(selected.b6Escala);
    }
    updateNote();
    syncNotePanelHeight();
}

/* ─── Fila del editor de escala personalizada ─── */
function buildScaleRow(i, txt) {
    const row = document.createElement('div');
    row.className = 'b6-cs-row';
    const badge = document.createElement('span');
    badge.className = 'b6-cs-badge';
    badge.textContent = String(i + 1);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'b6-cs-input';
    input.placeholder = 'Descripción del nivel…';
    input.maxLength = 120;
    input.value = txt || '';
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'b6-cs-remove';
    rm.setAttribute('aria-label', 'Quitar nivel');
    rm.textContent = '✕';
    row.append(badge, input, rm);
    return row;
}

function renumberScaleRows(list) {
    [...list.children].forEach((r, i) => {
        const b = r.querySelector('.b6-cs-badge');
        if (b) b.textContent = String(i + 1);
    });
}

/* ─── Editor para construir una escala B6 personalizada (N niveles) ─── */
function renderCustomScaleEditor() {
    const wrap = document.getElementById('b6CustomScale');
    if (!wrap) return;
    wrap.innerHTML = '';

    const niveles = (selected.b6CustomNiveles && selected.b6CustomNiveles.length)
        ? selected.b6CustomNiveles.slice()
        : ['', '', ''];

    const intro = document.createElement('p');
    intro.className = 'b6-cs-intro';
    intro.textContent = 'Defina los niveles de menor (1) a mayor logro. Mínimo 2.';
    wrap.appendChild(intro);

    const list = document.createElement('div');
    list.className = 'b6-cs-list';
    niveles.forEach((txt, i) => list.appendChild(buildScaleRow(i, txt)));
    wrap.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'b6-cs-actions';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'b6-cs-add';
    addBtn.textContent = '+ Agregar nivel';
    const useBtn = document.createElement('button');
    useBtn.type = 'button';
    useBtn.className = 'b6-cs-use';
    useBtn.textContent = 'Usar esta escala';
    actions.append(addBtn, useBtn);
    wrap.appendChild(actions);

    const feedback = document.createElement('div');
    feedback.className = 'b6-cs-feedback';
    wrap.appendChild(feedback);

    addBtn.addEventListener('click', () => {
        const row = buildScaleRow(list.children.length, '');
        list.appendChild(row);
        renumberScaleRows(list);
        syncNotePanelHeight();
        row.querySelector('.b6-cs-input')?.focus();
    });
    const removeScaleRow = (row) => {
        if (list.children.length <= 2) { feedback.textContent = 'La escala debe tener al menos 2 niveles.'; return; }
        const rows = [...list.querySelectorAll('.b6-cs-row')];
        const idx = rows.indexOf(row);
        row?.remove();
        renumberScaleRows(list);
        const nextRow = list.querySelectorAll('.b6-cs-row')[Math.min(idx, list.children.length - 1)];
        nextRow?.querySelector('.b6-cs-input')?.focus();
        syncNotePanelHeight();
    };
    list.addEventListener('click', (e) => {
        const rm = e.target.closest('.b6-cs-remove');
        if (!rm) return;
        removeScaleRow(rm.closest('.b6-cs-row'));
    });
    list.addEventListener('keydown', (e) => {
        if (!e.target.classList.contains('b6-cs-input')) return;
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        const inputs = [...list.querySelectorAll('.b6-cs-input')];
        const idx = inputs.indexOf(e.target);
        e.preventDefault();
        if (idx < inputs.length - 1) inputs[idx + 1].focus();
        else useBtn.focus();
    });
    useBtn.addEventListener('click', () => {
        const niv = [...list.querySelectorAll('.b6-cs-input')].map((i) => i.value.trim()).filter(Boolean);
        if (niv.length < 2) { feedback.textContent = 'Escriba al menos 2 niveles para crear la escala.'; return; }
        feedback.textContent = '';
        selected.b6CustomNiveles = niv;
        selected.b6Escala = niv.map((t, i) => `${i + 1}. ${escapeHtml(t)}`);
        selected.b6Puntuacion = null;
        selected.b6Descripcion = null;
        renderB6Levels(selected.b6Escala);
        const firstLevel = visibleOptions(els.evaluaciones)[0];
        if (firstLevel) focusOption(firstLevel, els.evaluaciones);
        updateNote();
        syncNotePanelHeight();
    });
}

/* ─── Carga el paso 5 (evaluación B6) ───
   NOC predefinido → su escala propia (o estándar si no tiene).
   NOC personalizado → selector de escala (familias canónicas + personalizada). */
function loadEvaluaciones(datos, nocNombre) {
    renderB6NocRef(nocNombre);
    const picker = document.getElementById('b6ScalePicker');
    const customWrap = document.getElementById('b6CustomScale');

    if (selected.nocCustom) {
        if (picker) picker.hidden = false;
        populateB6ScaleSelect();
        const sel = document.getElementById('b6ScaleSelect');

        if (!selected.b6EscalaId) {                 // primera vez: escala estándar por defecto
            selected.b6EscalaId = B6_ESCALAS[0].id;
            selected.b6Escala = B6_ESCALAS[0].niveles;
        }
        if (sel) sel.value = selected.b6EscalaId;

        if (selected.b6EscalaId === '__custom__') {
            if (customWrap) { customWrap.hidden = false; renderCustomScaleEditor(); }
            if (selected.b6CustomNiveles && selected.b6CustomNiveles.length) {
                selected.b6Escala = selected.b6CustomNiveles.map((t, i) => `${i + 1}. ${escapeHtml(t)}`);
                renderB6Levels(selected.b6Escala);
            } else {
                els.evaluaciones.innerHTML = '';
            }
        } else {
            if (customWrap) customWrap.hidden = true;
            renderB6Levels(selected.b6Escala);
        }
        return;
    }

    // NOC predefinido
    if (picker) picker.hidden = true;
    if (customWrap) customWrap.hidden = true;
    let escala = Array.isArray(datos.b6_por_noc?.[nocNombre])
        ? datos.b6_por_noc[nocNombre].filter((n) => parseB6(n).puntuacion)
        : [];
    if (!escala.length) escala = STANDARD_B6;
    selected.b6Escala = escala;
    renderB6Levels(escala);
}

/* ─── Obtiene el valor del estado de meta ─── */
function getMetaLograda() {
    return els.metaLograda?.value || '___';
}

/* ─── Genera y actualiza la nota de enfermería ───
   Sigue párrafo a párrafo la plantilla oficial de NOTA DE ENTREGA DE TURNO
   (NOTA_FINAL_ENTREGA.docx). Los campos vacíos se muestran como "___". */
function renderNote({ confirmationTime = null } = {}) {
    const nc = window.NotaCampos;
    const s = nc?.state;
    const hasData = (els.sexo && els.sexo.value !== '___')
        || selected.areaNombre || selected.diagnosticoNombre
        || (s && (s.posicion || s.estadoNeurologico));

    if (!hasData) {
        els.noteContent.innerHTML =
            '<p class="empty-state">Complete los datos del paciente, el estado clínico y el plan de atención para generar la nota de entrega de turno.</p>';
        updateCopyBtnState();
        return;
    }

    const lifecycleContext = noteLifecycle.getContext();
    const confirmationMeta = noteLifecycle.getConfirmationMeta();
    const fecha = lifecycleContext.shiftDate;
    const hora = confirmationTime
        || (lifecyclePhase() === NoteLifecycle.PHASES.CONFIRMED
            ? confirmationMeta?.confirmationTime
            : '')
        || 'Pendiente de confirmación';

    const dobResult  = validateDOB();
    const edadTexto  = dobResult.valid ? dobResult.ageText : '';
    const metaEstado = els.metaLograda?.value || '';
    const gap = '___';
    /* Quita el punto final de un valor que se inserta a mitad de frase: la plantilla
       ya aporta su propia puntuación y si no, quedan artefactos tipo "enfermedad., con". */
    const sinPuntoFinal = (x) => String(x || '').replace(/\s*\.\s*$/, '');
    // Campo con valor → negrita; vacío → hueco visible "___"
    const v = (x) => `<strong>${x ? escapeHtml(x) : gap}</strong>`;
    // Igual que v(), para valores seguidos de coma/punto en la redacción
    const vMid = (x) => v(sinPuntoFinal(x));
    const sexoVal = els.sexo?.value !== '___' ? els.sexo?.value : '';
    // "en posición Posición de Fowler…" → "en posición Fowler…"
    const posDisp = (s?.posicion || '').replace(/^Posición de /i, '');

    /* La nota se arma por BLOQUES: cada bloque es un párrafo o una sección y se
       separa del siguiente con una línea en blanco (lo aporta .note-block, no
       <br> sueltos). Dentro de un bloque los saltos son simples: <br> para líneas
       y <ul> para listas, que quedan pegadas a su texto guía. Así la separación
       es consistente por construcción, con pocos o con muchos datos. */
    const blocks = [];

    // Encabezado
    blocks.push(
        `<strong class="note-title">NOTA DE ENTREGA DE TURNO</strong><br>` +
        `<strong>Fecha:</strong> ${fecha} &nbsp; <strong>Hora:</strong> ${hora}<br>` +
        `Fundación Clínica Santa Fe de Bogotá`
    );

    // Párrafo 1 — identificación, ubicación y estado clínico
    let p1 = `Se entrega paciente ${v(sexoVal)}, de ${v(edadTexto)} de edad, `
        + `en posición ${v(posDisp)} en cama ${v(s?.numCama)} de la habitación ${v(s?.numHabitacion)}, `
        + `ubicado en el servicio de ${v(s?.servicio)}, correspondiente al área clínica de ${v(selected.areaNombre)}. `
        + `Al momento de la entrega, el paciente se encuentra ${v(s?.estadoNeurologico)}, ${v(s?.estadoHemodinamico)} `
        + `y ${v(s?.estadoRespiratorio)}.`;
    if (s?.sinEscalas) p1 += ` No se aplicaron escalas de valoración durante el turno.`;
    else if ((s?.escalas?.length || 0) <= 2) {
        // Pocas escalas: en línea
        p1 += ` Se registraron las siguientes escalas de valoración: ${v(nc?.formatEscalas())}.`;
    } else {
        // Muchas escalas: lista de viñetas bajo el mismo texto guía
        p1 += ` Se registraron las siguientes escalas de valoración:${noteListHtml(nc.escalasItems().map(escapeHtml))}`;
    }
    blocks.push(p1);

    // Párrafo 2 — diagnóstico médico, aislamiento, dispositivos y estado dental
    const aisl = s?.aislamiento && s.aislamiento !== 'No aplica' ? `, en ${escapeHtml(s.aislamiento)},` : ',';
    let p2 = `Paciente con ${vMid(s?.diagnosticoMedico)}${aisl} `;
    if (s?.sinDispositivos) p2 += `sin dispositivos invasivos o de soporte reportados. `;
    else if ((s?.dispositivos?.length || 0) <= 1) {
        // Un solo dispositivo: en línea
        p2 += `portador de ${v(nc?.formatDispositivos())}. `;
    } else {
        // Varios dispositivos (nombre + fechas + estado): lista de viñetas
        p2 += `portador de:${noteListHtml(nc.dispositivosItems().map(escapeHtml))}`;
    }
    p2 += `Presenta estado dental ${v(s?.estadoDental)}. `
        + `Se reporta a enfermero/a entrante el estado actual de cada dispositivo.`;
    blocks.push(p2);

    // Párrafo 3 — medidas de seguridad institucionales (texto fijo)
    blocks.push(
        `Se confirman medidas de seguridad institucionales al momento de la entrega, `
        + `incluyendo manilla de identificación, barandas elevadas y demás medidas según protocolo.`
    );

    // Párrafo 4 — hallazgos de valoración física y educación (opcional)
    let p4;
    if (s?.sinAlteraciones) {
        p4 = `Durante el turno no se identificaron alteraciones relevantes adicionales.`;
    } else if ((s?.regiones?.length || 0) <= 3) {
        // Pocas alteraciones: en línea
        p4 = `Durante el turno se identificaron alteraciones relevantes en ${v(nc?.formatRegiones())} `
            + `y sin otros hallazgos de importancia adicionales.`;
    } else {
        // Muchas alteraciones: lista de viñetas; el resto de la frase se cierra aparte
        p4 = `Durante el turno se identificaron alteraciones relevantes en:${noteListHtml(nc.regionesItems().map(escapeHtml))}`
            + `Sin otros hallazgos de importancia adicionales.`;
    }
    const eduFrase = nc?.formatEducacion();
    if (eduFrase) p4 += ` ${escapeHtml(eduFrase)}`;
    p4 += ` Se reportan estos hallazgos como parte del resumen clínico de entrega.`;
    blocks.push(p4);

    // Párrafo 5 — PAE: diagnóstico NANDA priorizado, RC/EP y NOC
    let p5 = `Durante el turno se trabajó el diagnóstico prioritario ${v(selected.diagnosticoNombre)}`;
    if (selected.rc.length) p5 += `, relacionado con <strong>${joinClause(selected.rc)}</strong>`;
    if (selected.ep.length) p5 += `, evidenciado por <strong>${joinClause(selected.ep)}</strong>`;
    p5 += `. `;
    const nocDisp = selected.nocNombre
        ? sinPuntoFinal(selected.nocCustom ? escapeHtml(selected.nocNombre) : selected.nocNombre)
        : gap;
    p5 += `El resultado esperado (NOC) establecido fue: <strong>${nocDisp}</strong>, `
        + `con seguimiento durante el turno a continuación descrito.`;
    blocks.push(p5);

    // Intervenciones NIC (la lista va pegada a su encabezado, sin <br> intermedio)
    const nicsHtml = selected.nics.length
        ? noteListHtml(selected.nics.map((n) => (selected.customNics.includes(n) ? escapeHtml(n) : n)))
        : `<br><em>Pendiente de selección</em>`;
    blocks.push(`<strong class="note-heading">INTERVENCIONES NIC REALIZADAS DURANTE EL TURNO</strong>${nicsHtml}`);

    // Intervenciones transversales
    const trans = selected.datosDiag?.trans || [];
    if (trans.length) {
        blocks.push(`<strong class="note-heading">INTERVENCIONES TRANSVERSALES REALIZADAS</strong>${noteListHtml(trans)}`);
    }

    // Evaluación del turno — indicador B6 + respuesta + tendencia
    let ev = `<strong class="note-heading">EVALUACIÓN DEL TURNO</strong><br>`;
    if (selected.b6Puntuacion && selected.nocNombre) {
        const b6Desc = (selected.b6Descripcion || '').replace(/^\d+\s*[.,\-=:]\s*/, '');
        ev += `Indicador B6 para «${nocDisp}»: puntuación <strong>${selected.b6Puntuacion}</strong> — ${b6Desc}.<br>`;
    } else {
        ev += `Indicador B6: <strong>${gap}</strong>.<br>`;
    }
    ev += `Se evidencia ${vMid(s?.respuesta)}, con ${v(s?.tendencia)} respecto al inicio del mismo. `
        + `Estos hallazgos son reportados al enfermero/a que recibe el turno.`;
    blocks.push(ev);

    // Entrega del turno — meta, criterio, estado de salida y pendientes
    let en = `<strong class="note-heading">ENTREGA DEL TURNO</strong><br>`
        + `Dadas estas intervenciones y al finalizar el turno, se evaluó la meta del cuidado, `
        + `la cual se encuentra ${v(metaEstado)}, evidenciado por ${vMid(s?.criterioClinico)}. `
        + `Se hace entrega del paciente en posición ${v(posDisp)}, con ${v(nc?.formatVigentes())}, `
        + `medidas de seguridad confirmadas${aisl === ',' ? '' : aisl.replace(/,$/, '')}. `
        + `Se comunican verbalmente y por escrito los siguientes pendientes para continuidad del cuidado `
        + `en el próximo turno: ${v(s?.pendientes)}`;
    blocks.push(en);

    // Observaciones adicionales (campo opcional)
    const comentarios = els.otrosComentarios?.value.trim();
    if (comentarios) {
        blocks.push(`<strong class="note-heading">Observaciones:</strong><br>${formatFreeText(comentarios)}`);
    }

    els.noteContent.innerHTML = blocks.map((b) => `<div class="note-block">${b}</div>`).join('');
    updateCopyBtnState();
}

function updateNote() {
    markDraftRevision();
    renderNote();
}

function cloneFormData(value) {
    if (value == null) return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function captureFormSnapshot() {
    return {
        notaCampos: window.NotaCampos?.captureState?.() || cloneFormData(window.NotaCampos?.state || {}),
        selected: cloneFormData(selected),
        reverse: cloneFormData(reverse),
        scalar: {
            sexo: els.sexo?.value || '___',
            dob: els.dobFecha?.value || '',
            dobIso: els.dobFecha?.dataset.iso || '',
            meta: els.metaLograda?.value || '',
            observations: els.otrosComentarios?.value || '',
        },
        currentStep,
        maxReachedStep,
        activeFlowStage,
    };
}

function restoreSegmentedControl(groupId, hidden, value, emptyValue = '') {
    if (hidden) hidden.value = value || emptyValue;
    const buttons = [...document.querySelectorAll(`#${groupId} [role="radio"]`)];
    const chosen = buttons.find((button) => button.dataset.value === value);
    buttons.forEach((button, index) => {
        const active = button === chosen;
        button.setAttribute('aria-checked', active ? 'true' : 'false');
        button.tabIndex = active || (!chosen && index === 0) ? 0 : -1;
    });
}

function restorePaeSnapshot(snapshot) {
    const restored = cloneFormData(snapshot.selected || {});
    Object.keys(selected).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(restored, key)) selected[key] = restored[key];
    });
    Object.assign(reverse, cloneFormData(snapshot.reverse || { mode: 'forward', findingKeys: [], kindFilter: 'all' }));

    loadAreas();
    els.areas?.querySelectorAll('.option').forEach((option) => {
        option.classList.toggle('selected', option.dataset.area === selected.area);
    });
    syncOptionSelectionState(els.areas);

    if (selected.area) {
        loadDiagnosticos(selected.area);
        selected.datosDiag = datosProPai[selected.area]?.[selected.diagnostico] || selected.datosDiag;
        els.diagnosticos?.querySelectorAll('.option').forEach((option) => {
            option.classList.toggle('selected', option.dataset.diagnostico === selected.diagnostico);
        });
        syncOptionSelectionState(els.diagnosticos);
    } else {
        els.diagnosticos.innerHTML = '';
    }

    if (selected.datosDiag) {
        loadRc(selected.datosDiag);
        loadEp(selected.datosDiag);
        loadNocs(selected.datosDiag);
        loadIntervenciones(selected.datosDiag);
        if (selected.nocNombre) loadEvaluaciones(selected.datosDiag, selected.nocNombre);
    }
    setMode(reverse.mode);
    renderSelectedFindings();
    syncFindingKindFilters();
    renderTransversales(selected.datosDiag);
    showMetaBlock(!!selected.b6Puntuacion);
}

function restoreConfirmedVersion(version) {
    if (!version?.formSnapshot) return false;
    suppressRevisionTracking = true;
    cancelPendingUndo();
    window.NotaCampos?.restoreState?.(version.formSnapshot.notaCampos);
    restoreSegmentedControl('sexoSeg', els.sexo, version.formSnapshot.scalar?.sexo, '___');
    restoreSegmentedControl('metaSeg', els.metaLograda, version.formSnapshot.scalar?.meta, '');
    if (els.dobFecha) {
        els.dobFecha.value = version.formSnapshot.scalar?.dob || '';
        els.dobFecha.dataset.iso = version.formSnapshot.scalar?.dobIso || '';
    }
    validateDOB();
    if (els.otrosComentarios) els.otrosComentarios.value = version.formSnapshot.scalar?.observations || '';
    restorePaeSnapshot(version.formSnapshot);

    currentStep = version.formSnapshot.currentStep || 1;
    maxReachedStep = version.formSnapshot.maxReachedStep || currentStep;
    const stage = FLOW_STAGE_ORDER.includes(version.formSnapshot.activeFlowStage)
        ? version.formSnapshot.activeFlowStage
        : 'patient';
    activateFlowStage(stage, { focus: false });
    if (stage === 'fasePAE') activateStep(currentStep, { focus: false });
    if (els.noteContent && version.noteHtml) els.noteContent.innerHTML = version.noteHtml;
    suppressRevisionTracking = false;
    updateCopyBtnState();
    return true;
}

function confirmCurrentNote() {
    if (blockOnOpenAppEditorDraft()) return;
    window.NotaCampos?.commitDrafts?.();
    const { complete } = isNoteComplete();
    if (!complete || !noteLifecycle.beginConfirmation()) {
        updateCopyBtnState();
        return;
    }

    const wasEditing = lifecyclePhase() === NoteLifecycle.PHASES.REVIEWING_EDIT;
    const confirmedAt = new Date();
    const confirmationTime = NoteLifecycle.formatLocalTime(confirmedAt);
    suppressRevisionTracking = true;
    renderNote({ confirmationTime });
    const version = {
        confirmedAt: confirmedAt.toISOString(),
        confirmationTime,
        noteHtml: els.noteContent.innerHTML,
        noteText: noteToPlainText(els.noteContent),
        formSnapshot: captureFormSnapshot(),
    };
    suppressRevisionTracking = false;
    noteLifecycle.completeConfirmation(version);
    updateCopyBtnState();
    announceAction(wasEditing ? 'Cambios confirmados. Ya puede copiar la nueva versión.' : 'Nota confirmada. Ya puede copiarla.');
    requestAnimationFrame(() => els.drawerCopyBtn?.focus());
}

function requestDiscardEditing(trigger = document.activeElement) {
    if (!isEditingPhase()) return;
    runDependentChange({
        title: '¿Descartar los cambios pendientes?',
        description: 'Se eliminará la edición actual y se restaurará exactamente la última versión confirmada.',
        confirmLabel: 'Descartar cambios',
        trigger,
        onConfirm: () => {
            if (noteVisible) toggleNote(false);
            const version = noteLifecycle.discardEditing();
            if (!restoreConfirmedVersion(version)) return;
            announceAction('Cambios descartados. Se restauró la última versión confirmada.');
            requestAnimationFrame(() => {
                const target = els.copyBtn && !els.copyBtn.hidden ? els.copyBtn : els.noteToggleBtn;
                target?.focus?.({ preventScroll: true });
            });
        },
    });
}

/* ─── Convierte HTML de nota a texto plano preservando viñetas ─── */
function noteToPlainText(el) {
    function extract(node) {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent;
        if (node.nodeType !== Node.ELEMENT_NODE) return '';
        const tag = node.nodeName;
        const children = Array.from(node.childNodes).map(extract).join('');
        if (tag === 'BR') return '\n';
        if (tag === 'LI') return '• ' + children.trim() + '\n';
        // La lista abre línea propia y queda pegada a su texto guía (sin línea en blanco)
        if (tag === 'UL' || tag === 'OL') return '\n' + children;
        // Cada bloque de la nota (párrafo o sección) se separa con una línea en blanco
        if (node.classList?.contains('note-block')) return children.trim() + '\n\n';
        if (tag === 'P') return children + '\n';
        return children;
    }
    return extract(el)
        .replace(/ /g, ' ')        // &nbsp; → espacio normal (evita basura en el portapapeles)
        .replace(/[ \t]{2,}/g, ' ')     // el HTML colapsa espacios al mostrar: el texto copiado debe coincidir
        .replace(/[ \t]+\n/g, '\n')     // sin espacios colgando al final de línea
        .replace(/\n{3,}/g, '\n\n')     // nunca más de una línea en blanco seguida
        .trim();
}

async function writeClipboardText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_) {
            // Algunos contextos institucionales bloquean la API moderna; probar fallback verificable.
        }
    }
    const previousFocus = document.activeElement;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('aria-hidden', 'true');
    ta.style.cssText = 'position:fixed;inset:auto auto 0 -9999px;opacity:0;';
    (els.noteSection?.open ? els.noteSection : document.body).appendChild(ta);
    ta.focus();
    ta.select();
    let copied = false;
    try { copied = document.execCommand('copy') === true; } catch (_) { copied = false; }
    ta.remove();
    previousFocus?.focus?.();
    return copied;
}

/* ─── Copia la nota (solo si está completa y dentro de revisión) ─── */
async function copyNote() {
    const confirmed = noteLifecycle.getConfirmed();
    if (!noteLifecycle.canCopy() || !confirmed?.noteText) { updateCopyBtnState(); return; }

    const text = confirmed.noteText;
    const showCopied = () => {
        [els.drawerCopyBtn].filter(Boolean).forEach((btn) => {
            btn.textContent = '✓ ¡Copiado!';
            btn.classList.add('copied');
        });
        setTimeout(() => {
            [els.drawerCopyBtn].filter(Boolean).forEach((btn) => {
                btn.textContent = 'Copiar nota';
                btn.classList.remove('copied');
            });
        }, 2000);
    };

    const copied = await writeClipboardText(text);
    if (copied) {
        interactionMetrics?.record('copy', { outcome: 'success', stageId: 'note' });
        noteLifecycle.markCopied();
        showCopied();
        updateCopyBtnState();
        announceAction('Nota copiada correctamente.');
        return;
    }
    interactionMetrics?.record('copy', { outcome: 'failure', stageId: 'note' });
    if (els.previewStatus) {
        els.previewStatus.className = 'note-drawer-status incomplete';
        els.previewStatus.textContent = 'No fue posible copiar la nota. Revise los permisos del portapapeles e intente nuevamente.';
    }
    announceAction('No fue posible copiar la nota.');
}

/* ─── Reinicia el flujo completo ─── */
const RESET_SECTION_LABELS = {
    patient: 'Datos del paciente',
    faseB: 'Estado clínico',
    faseC: 'Diagnóstico y dispositivos',
    faseD: 'Hallazgos y educación',
    fasePAE: 'Plan de atención (PAE)',
    faseF: 'Evaluación y entrega',
};
let pendingResetSection = null;
let pendingResetInvoker = null;
let pendingResetRestoreFocus = true;

function resetSegmentedValue(groupId, hidden, emptyValue = '') {
    if (hidden) hidden.value = emptyValue;
    document.querySelectorAll(`#${groupId} [role="radio"]`).forEach((button, index) => {
        button.setAttribute('aria-checked', 'false');
        button.tabIndex = index === 0 ? 0 : -1;
    });
}

function resetPaeSection() {
    clearIdentification();
    currentStep = 1;
    maxReachedStep = 1;
    reverse.findingKeys = [];
    reverse.kindFilter = 'all';
    renderSelectedFindings();
    syncFindingKindFilters();
    setMode('forward');
    if (els.intervenciones) els.intervenciones.innerHTML = '';
    STEPS.forEach((step) => {
        const stepEl = document.getElementById(`step${step.num}`);
        stepEl?.classList.remove('completed', 'active');
        const summary = stepEl?.querySelector('.step-summary');
        if (summary) summary.textContent = '';
    });
    renderB6NocRef(null);
    const picker = document.getElementById('b6ScalePicker');
    const custom = document.getElementById('b6CustomScale');
    const select = document.getElementById('b6ScaleSelect');
    if (picker) picker.hidden = true;
    if (custom) { custom.hidden = true; custom.innerHTML = ''; }
    if (select) select.value = B6_ESCALAS[0].id;
    activateStep(1);
}

function resetCurrentSection(sectionId) {
    cancelPendingUndo();
    toggleNote(false);
    validatedStages.delete(sectionId);
    if (sectionId === 'patient') {
        window.NotaCampos?.resetPhase('patient');
        if (!noteLifecycle.getConfirmationMeta()) {
            if (els.patientIdType) els.patientIdType.value = '';
            if (els.patientIdNumber) els.patientIdNumber.value = '';
            noteLifecycle.setIdentity({ type: '', number: '' });
            noteLifecycle.setLookup(NoteLifecycle.LOOKUP_STATES.IDLE);
            renderPatientContext();
        }
        resetSegmentedValue('sexoSeg', els.sexo, '___');
        if (els.dobFecha) { els.dobFecha.value = ''; els.dobFecha.dataset.iso = ''; }
        els.dobFecha?.classList.remove('clinical-date-invalid');
        if (els.dobFeedback) { els.dobFeedback.textContent = ''; els.dobFeedback.className = 'dob-feedback'; }
    } else if (sectionId === 'fasePAE') {
        resetPaeSection();
    } else {
        window.NotaCampos?.resetPhase(sectionId);
        if (sectionId === 'faseF') {
            resetSegmentedValue('metaSeg', els.metaLograda, '');
            if (els.otrosComentarios) els.otrosComentarios.value = '';
        }
    }
    const message = document.querySelector(`[data-flow-message="${sectionId}"]`);
    if (message) message.textContent = '';
    updateNote();
    updateCopyBtnState();
    focusFlowStageEntry(sectionId);
}

function openResetDialog(sectionId, invoker = document.activeElement) {
    const label = RESET_SECTION_LABELS[sectionId];
    if (!label || !els.resetDialog) return;
    pendingResetSection = sectionId;
    pendingResetInvoker = invoker?.isConnected ? invoker : document.activeElement;
    pendingResetRestoreFocus = true;
    if (els.resetDialogSectionName) els.resetDialogSectionName.textContent = label;
    if (els.resetSectionBtn) els.resetSectionBtn.textContent = `Reiniciar solo ${label}`;
    if (els.resetDialogDescription) {
        els.resetDialogDescription.innerHTML = noteLifecycle.getConfirmationMeta()
            ? `Puede limpiar solo <strong id="resetDialogSectionName">${escapeHtml(label)}</strong> y conservar la identidad confirmada como una edición pendiente. Reiniciar toda la nota eliminará de este dispositivo el único contexto confirmado local; CareFlow todavía no puede recuperarlo sin backend.`
            : `Puede limpiar solo la sección <strong id="resetDialogSectionName">${escapeHtml(label)}</strong> y conservar el resto de la nota, o reiniciar toda la nota y comenzar de nuevo. Esta acción no se puede deshacer.`;
        els.resetDialogSectionName = document.getElementById('resetDialogSectionName');
    }
    if (interactionOverlays && !interactionOverlays.get('reset')) {
        interactionOverlays.push({
            id: 'reset',
            element: els.resetDialog,
            invoker: pendingResetInvoker,
            modal: true,
            onClose: () => { if (els.resetDialog.open) els.resetDialog.close(); },
        });
    }
    els.resetDialog.showModal();
    requestAnimationFrame(() => els.resetCancelBtn?.focus());
}

function resetWorkflow({ confirmed = false } = {}) {
    if (!confirmed && !window.confirm('¿Reiniciar toda la nota?\n\nEsta acción limpiará toda la información ingresada y permitirá comenzar nuevamente. No se puede deshacer.')) return;

    cancelPendingUndo();
    suppressRevisionTracking = true;
    noteLifecycle.reset();
    currentStep = 1;
    maxReachedStep = 1;
    patientGateEverUnlocked = false;
    validatedStages.clear();
    stageFocusMemory.clear();
    noteVisible = false;
    lastLogicalSectionId = 'patient';
    resetSectionTypeahead();

    // Modo inverso a su estado inicial
    reverse.findingKeys = [];
    reverse.kindFilter = 'all';
    if (els.searchFindings) els.searchFindings.value = '';
    if (els.findingsList) els.findingsList.innerHTML = '';
    if (els.reverseResults) els.reverseResults.innerHTML = '';
    renderSelectedFindings();
    syncFindingKindFilters();
    setMode('forward');

    Object.assign(selected, {
        area: null, areaNombre: null,
        diagnostico: null, diagnosticoNombre: null,
        datosDiag: null, rc: [], ep: [], nics: [], customNics: [],
        noc: null, nocNombre: null, nocCustom: false,
        b6Escala: null, b6EscalaId: null, b6CustomNiveles: [],
        b6Puntuacion: null, b6Descripcion: null,
    });

    // Campos clínicos de las fases A–F
    window.NotaCampos?.reset();

    document.querySelectorAll('.option').forEach((o) => o.classList.remove('selected', 'multi-selected'));
    document.querySelectorAll('[role="listbox"], [role="grid"]').forEach(syncOptionSelectionState);

    STEPS.forEach((s) => {
        const stepEl = document.getElementById(`step${s.num}`);
        if (!stepEl) return;
        stepEl.classList.remove('completed', 'active');
        const summaryEl = stepEl.querySelector('.step-summary');
        if (summaryEl) summaryEl.textContent = '';
        const header = stepEl.querySelector('.step-header');
        syncStepHeaderAction(header, false);
    });

    if (els.searchAreas) els.searchAreas.value = '';
    els.searchDiag.value = '';
    if (els.searchRc) els.searchRc.value = '';
    if (els.searchEp) els.searchEp.value = '';
    els.searchNic.value  = '';
    if (els.metaLograda) els.metaLograda.value = '';
    document.querySelectorAll('#metaSeg [role="radio"]').forEach((b, i) => {
        b.setAttribute('aria-checked', 'false');
        b.tabIndex = i === 0 ? 0 : -1;
    });
    if (els.sexo) els.sexo.value = '___';
    document.querySelectorAll('#sexoSeg [role="radio"]').forEach((b, i) => {
        b.setAttribute('aria-checked', 'false');
        b.tabIndex = i === 0 ? 0 : -1;
    });
    if (els.otrosComentarios) els.otrosComentarios.value = '';
    if (els.patientIdType) els.patientIdType.value = '';
    if (els.patientIdNumber) els.patientIdNumber.value = '';
    if (els.dobFecha) { els.dobFecha.value = ''; els.dobFecha.dataset.iso = ''; }
    if (els.dobFeedback) { els.dobFeedback.textContent = ''; els.dobFeedback.className = 'dob-feedback'; }
    els.dobFecha?.classList.remove('clinical-date-invalid');
    els.diagnosticos.innerHTML  = '';
    if (els.rcList) els.rcList.innerHTML = '';
    if (els.epList) els.epList.innerHTML = '';
    els.intervenciones.innerHTML = '';
    els.nocs.innerHTML       = '';
    els.evaluaciones.innerHTML   = '';
    renderB6NocRef(null);
    const b6Picker = document.getElementById('b6ScalePicker');
    const b6Custom = document.getElementById('b6CustomScale');
    if (b6Picker) b6Picker.hidden = true;
    if (b6Custom) { b6Custom.hidden = true; b6Custom.innerHTML = ''; }
    const b6Sel = document.getElementById('b6ScaleSelect');
    if (b6Sel) b6Sel.value = B6_ESCALAS[0].id;

    // Restablecer vista previa y volver a la primera etapa.
    toggleNote(false);
    els.noteContent.hidden = false;
    els.noteToggleBtn?.setAttribute('aria-expanded', 'false');

    showMetaBlock(false);
    updateRcConfirmBtn();
    updateEpConfirmBtn();
    updateNicConfirmBtn();
    activateStep(1);
    activateFlowStage('patient', { focus: false });
    updateNote();
    updateCopyBtnState();
    updateLayout();
    syncNotePanelHeight();
    suppressRevisionTracking = false;
    renderPatientContext();
    // Listo para el siguiente paciente: foco en el inicio del contexto.
    els.patientIdType?.focus();
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

/* ════════════ MODO INVERSO: buscar diagnóstico por signos/factores ════════════ */
const reverse = { mode: 'forward', findingKeys: [], kindFilter: 'all' };   // findingKeys = hallazgos normalizados elegidos
let FINDINGS = [];                                      // [{ key, text, kinds, diags }]
let FINDINGS_BY_KEY = new Map();

/* Índice de hallazgos (RC ∪ EP) → diagnósticos, construido una vez en runtime */
function buildReverseIndex() {
    const map = new Map();
    const add = (text, area, diag, kind) => {
        const cleanText = String(text || '').trim();
        if (!cleanText) return;
        const key = normalizeText(cleanText);
        let finding = map.get(key);
        if (!finding) {
            finding = { key, text: cleanText, kinds: new Set(), diags: [] };
            map.set(key, finding);
        }
        finding.kinds.add(kind);
        let diagRef = finding.diags.find((d) => d.area === area && d.diag === diag);
        if (!diagRef) {
            diagRef = { area, diag, kinds: new Set() };
            finding.diags.push(diagRef);
        }
        diagRef.kinds.add(kind);
    };

    Object.entries(datosProPai || {}).forEach(([area, diagnosticos]) => {
        Object.entries(diagnosticos || {}).forEach(([diag, node]) => {
            (node.rc || []).forEach((t) => add(t, area, diag, 'rc'));
            (node.ep || []).forEach((t) => add(t, area, diag, 'ep'));
        });
    });

    FINDINGS = [...map.values()].sort((a, b) => a.text.localeCompare(b.text, 'es'));
    FINDINGS_BY_KEY = new Map(FINDINGS.map((f) => [f.key, f]));
}

function findingTag(f) {
    if (f.kinds.has('rc') && f.kinds.has('ep')) return 'Factor y signo';
    return f.kinds.has('rc') ? 'Factor relacionado' : 'Signo / síntoma';
}

function findingKindLabel(kinds) {
    if (kinds.has('rc') && kinds.has('ep')) return 'RC/EP';
    return kinds.has('rc') ? 'RC' : 'EP';
}

function selectedFindingSet() {
    return new Set(reverse.findingKeys);
}

function matchesFindingKindFilter(f) {
    if (reverse.kindFilter === 'rc') return f.kinds.has('rc');
    if (reverse.kindFilter === 'ep') return f.kinds.has('ep');
    return true;
}

function setFindingKindFilter(filter) {
    reverse.kindFilter = ['all', 'rc', 'ep'].includes(filter) ? filter : 'all';
    syncFindingKindFilters();
    renderFindings();
}

function syncFindingKindFilters() {
    els.findingKindFilters?.querySelectorAll('[role="radio"]').forEach((btn) => {
        const on = btn.dataset.filter === reverse.kindFilter;
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
        btn.tabIndex = on ? 0 : -1;
    });
}

function createFindingOption(f) {
    const opt = createOption(f.text, `${findingTag(f)} · ${f.diags.length} diagnóstico(s)`, { findingKey: f.key });
    opt.classList.add('reverse-finding-option');
    const tag = document.createElement('span');
    tag.className = `reverse-kind-badge reverse-kind-badge--${f.kinds.has('rc') && f.kinds.has('ep') ? 'both' : f.kinds.has('rc') ? 'rc' : 'ep'}`;
    tag.textContent = findingKindLabel(f.kinds);
    opt.appendChild(tag);
    if (reverse.findingKeys.includes(f.key)) opt.classList.add('multi-selected');
    return opt;
}

function createSelectedFindingChip(f) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `reverse-selected-chip reverse-selected-chip--${f.kinds.has('rc') && f.kinds.has('ep') ? 'both' : f.kinds.has('rc') ? 'rc' : 'ep'}`;
    chip.dataset.findingKey = f.key;
    chip.setAttribute('aria-label', `Quitar ${f.text}`);
    chip.setAttribute('aria-keyshortcuts', 'Enter Delete Backspace Shift+Backspace');

    const kind = document.createElement('span');
    kind.className = 'reverse-selected-kind';
    kind.textContent = findingKindLabel(f.kinds);

    const text = document.createElement('span');
    text.className = 'reverse-selected-text';
    text.textContent = f.text;

    const close = document.createElement('span');
    close.className = 'reverse-selected-remove';
    close.setAttribute('aria-hidden', 'true');
    close.textContent = '×';

    chip.append(kind, text, close);
    return chip;
}

function renderSelectedFindings() {
    if (!els.selectedFindings || !els.selectedFindingsWrap) return;
    const selectedItems = reverse.findingKeys.map((key) => FINDINGS_BY_KEY.get(key)).filter(Boolean);
    els.selectedFindings.innerHTML = '';
    if (!selectedItems.length) {
        els.selectedFindingsWrap.hidden = true;
        return;
    }
    selectedItems.forEach((f) => els.selectedFindings.appendChild(createSelectedFindingChip(f)));
    els.selectedFindingsWrap.hidden = false;
}

/* Lista de hallazgos: solo coincidencias al escribir; los elegidos siempre visibles */
function renderFindings() {
    const q = normalizeText(els.searchFindings?.value?.trim() || '');
    ensureSearchResultsStatus(els.searchFindings, els.findingsList);
    const chosenSet = selectedFindingSet();
    const chosen = reverse.findingKeys.map((key) => FINDINGS_BY_KEY.get(key)).filter(Boolean);
    let list;

    if (!q) {
        list = chosen.filter(matchesFindingKindFilter);
    } else {
        const matches = FINDINGS.filter((f) => matchesFindingKindFilter(f) && f.key.includes(q));
        matches.sort((a, b) =>
            (Number(b.key.startsWith(q)) - Number(a.key.startsWith(q)))
            || (Number(b.text.length < a.text.length) - Number(a.text.length < b.text.length))
            || a.text.localeCompare(b.text, 'es'));
        list = matches.slice(0, 60);
        chosen.slice().reverse().forEach((f) => {
            if (matchesFindingKindFilter(f) && !list.some((item) => item.key === f.key)) list.unshift(f);
        });
    }

    els.findingsList.innerHTML = '';
    if (!list.length) {
        const filtered = reverse.kindFilter === 'rc' ? 'factores RC' : reverse.kindFilter === 'ep' ? 'signos EP' : 'hallazgos';
        els.findingsList.setAttribute('role', 'group');
        els.findingsList.removeAttribute('aria-multiselectable');
        els.findingsList.removeAttribute('aria-rowcount');
        els.findingsList.removeAttribute('aria-colcount');
        els.findingsList.innerHTML = `<p class="empty-state" aria-hidden="true">${q ? `Sin coincidencias en ${filtered}.` : `Escriba para buscar ${filtered}.`}</p>`;
    } else {
        list.forEach((f) => {
            const opt = createFindingOption(f);
            if (chosenSet.has(f.key)) opt.classList.add('multi-selected');
            els.findingsList.appendChild(opt);
        });
        setupOptionList(els.findingsList, {
            searchInput: els.searchFindings,
            multi: true,
            spatial: true,
            stepNum: 1,
            onAdvance: confirmFindings,
            onRightEdge: (source) => {
                if (!isInteractionElementVisible(els.dxLive)) return false;
                const target = closestRightOptionByVertical(source, els.reverseResults);
                if (!target || target.getBoundingClientRect().left < source.getBoundingClientRect().right - 2) return false;
                focusOption(target, els.reverseResults);
                return true;
            },
        });
    }
    updateSearchResultsStatus(els.findingsList, q, list.length);
    renderSelectedFindings();
}

/* ─── Atajo de teclado: mueve el foco al panel lateral de diagnósticos en vivo ─── */
function confirmFindings() {
    if (!reverse.findingKeys.length) return;
    renderReverseResults();
    const first = visibleOptions(els.reverseResults)[0];
    if (first) { scrollSoft(els.dxLive, 'nearest'); focusOption(first, els.reverseResults); }
}

function toggleReverseFinding(key) {
    const idx = reverse.findingKeys.indexOf(key);
    const removed = idx >= 0;
    if (removed) reverse.findingKeys.splice(idx, 1);
    else reverse.findingKeys.push(key);
    if (els.searchFindings) els.searchFindings.value = '';
    renderFindings();
    renderReverseResults();   // el panel lateral se actualiza en vivo
    const restored = [...els.findingsList.querySelectorAll('.option')].find((o) => o.dataset.findingKey === key);
    if (restored) focusOption(restored, els.findingsList);
    if (removed) {
        offerUndo('Se quitó el hallazgo seleccionado', () => {
            if (!reverse.findingKeys.includes(key)) reverse.findingKeys.splice(Math.min(idx, reverse.findingKeys.length), 0, key);
            renderFindings();
            renderReverseResults();
        });
    }
}

function getReverseMatchesForDiagnosis(area, diag) {
    const datos = datosProPai[area]?.[diag];
    if (!datos) return [];
    const rcByKey = new Map((datos.rc || []).map((txt) => [normalizeText(txt), txt]));
    const epByKey = new Map((datos.ep || []).map((txt) => [normalizeText(txt), txt]));
    return reverse.findingKeys.reduce((acc, key) => {
        const kind = rcByKey.has(key) && epByKey.has(key) ? 'both' : rcByKey.has(key) ? 'rc' : epByKey.has(key) ? 'ep' : null;
        if (!kind) return acc;
        acc.push({
            key,
            kind,
            rcText: rcByKey.get(key) || '',
            epText: epByKey.get(key) || '',
            text: rcByKey.get(key) || epByKey.get(key) || FINDINGS_BY_KEY.get(key)?.text || '',
        });
        return acc;
    }, []);
}

/* Diagnósticos posibles, rankeados por nº de hallazgos coincidentes */
function getReverseDiagnosisResults() {
    const counts = new Map();
    reverse.findingKeys.forEach((key) => {
        const f = FINDINGS_BY_KEY.get(key);
        if (!f) return;
        f.diags.forEach(({ area, diag, kinds }) => {
            const k = area + '||' + diag;
            const entry = counts.get(k) || { area, diag, matches: [] };
            entry.matches.push({ key, kinds });
            counts.set(k, entry);
        });
    });

    return [...counts.values()]
        .map((r) => ({ ...r, count: r.matches.length, totalFindings: (datosProPai[r.area]?.[r.diag]?.rc || []).length + (datosProPai[r.area]?.[r.diag]?.ep || []).length }))
        .sort((a, b) =>
            b.count - a.count
            || a.totalFindings - b.totalFindings
            || a.diag.localeCompare(b.diag, 'es'));
}

function createReverseDiagnosisOption(result, selectedCount) {
    const opt = document.createElement('div');
    opt.className = 'option reverse-result-option';
    opt.dataset.area = result.area;
    opt.dataset.diag = result.diag;
    opt.innerHTML = '<span class="check-mark" aria-hidden="true">✓</span>';

    const title = document.createElement('h4');
    title.textContent = result.diag;
    opt.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'reverse-result-meta';
    meta.textContent = `${areaLabel(result.area)} · ${result.count} de ${selectedCount} hallazgo(s)`;
    opt.appendChild(meta);

    const matches = getReverseMatchesForDiagnosis(result.area, result.diag);
    if (matches.length) {
        const list = document.createElement('div');
        list.className = 'reverse-match-list';
        matches.slice(0, 4).forEach((match) => {
            const item = document.createElement('span');
            item.className = `reverse-match reverse-match--${match.kind}`;
            const prefix = match.kind === 'both' ? 'RC/EP' : match.kind.toUpperCase();
            item.textContent = `${prefix}: ${match.text}`;
            list.appendChild(item);
        });
        if (matches.length > 4) {
            const more = document.createElement('span');
            more.className = 'reverse-match reverse-match--more';
            more.textContent = `+${matches.length - 4} más`;
            list.appendChild(more);
        }
        opt.appendChild(list);
    }

    return opt;
}

function renderReverseResults() {
    const selectedCount = reverse.findingKeys.length;
    const results = getReverseDiagnosisResults();
    els.reverseResults.innerHTML = '';
    if (els.dxLiveCount) {
        els.dxLiveCount.textContent = results.length
            ? (results.length === 1 ? '1 posible' : `${results.length} posibles`)
            : '';
    }
    updateLayout();   // refresca visibilidad del panel lateral

    if (!selectedCount) {
        els.reverseResults.innerHTML = '<p class="empty-state">Seleccione signos o factores para ver diagnósticos posibles.</p>';
        return;
    }
    if (!results.length) {
        els.reverseResults.innerHTML = '<p class="empty-state">Sin diagnósticos coincidentes.</p>';
        return;
    }

    // Panel lateral (no es un paso): conserva su rejilla y permite volver con
    // Shift + ← a los hallazgos cuando ambas colecciones están lado a lado.
    results.slice(0, 40).forEach((r) => els.reverseResults.appendChild(createReverseDiagnosisOption(r, selectedCount)));
    setupOptionList(els.reverseResults, {
        multi: false,
        lockVerticalEdges: true,
        onLeftEdge: (source) => {
            const target = closestOptionByVertical(source, els.findingsList);
            if (!target || target.getBoundingClientRect().right > source.getBoundingClientRect().left + 2) return false;
            focusOption(target, els.findingsList);
            return true;
        },
    });
}

function nextStepAfterReversePick(datos) {
    if (!selected.rc.length) return 3;
    if ((datos.ep || []).length && !selected.ep.length) return 4;
    return 5;
}

/* Elige un diagnóstico posible → pasa al flujo normal con RC/EP pre-rellenados */
function pickReverseDiagnosis(area, diag, { advance = true, focus = true } = {}) {
    const datos = datosProPai[area]?.[diag];
    if (!datos) return;
    cancelPendingUndo();
    selected.area = area; selected.areaNombre = areaLabel(area);
    selected.diagnostico = diag; selected.diagnosticoNombre = diag; selected.datosDiag = datos;

    const matches = getReverseMatchesForDiagnosis(area, diag);
    selected.rc = [...new Set(matches.map((m) => m.rcText).filter(Boolean))];
    selected.ep = [...new Set(matches.map((m) => m.epText).filter(Boolean))];
    selected.nics = []; selected.customNics = [];
    selected.noc = null; selected.nocNombre = null; selected.nocCustom = false;
    selected.b6Escala = null; selected.b6EscalaId = null; selected.b6CustomNiveles = [];
    selected.b6Puntuacion = null; selected.b6Descripcion = null;

    setMode('forward');

    // Reconstruir las listas del flujo normal con las selecciones marcadas
    els.areas.querySelectorAll('.option').forEach((o) => o.classList.toggle('selected', o.dataset.area === area));
    syncOptionSelectionState(els.areas);
    els.searchDiag.value = '';
    loadDiagnosticos(area);
    els.diagnosticos.querySelectorAll('.option').forEach((o) => o.classList.toggle('selected', o.dataset.diagnostico === diag));
    syncOptionSelectionState(els.diagnosticos);
    renderTransversales(datos);
    els.searchRc.value = ''; els.searchEp.value = ''; els.searchNic.value = '';
    loadRc(datos); loadEp(datos); loadNocs(datos);
    [3, 4, 5, 6, 7].forEach((nn) => document.getElementById(`step${nn}`)?.classList.remove('completed'));
    showMetaBlock(false);

    const nextStep = nextStepAfterReversePick(datos);
    maxReachedStep = advance ? Math.max(2, nextStep - 1) : 2;
    if (advance) activateStep(nextStep, { focus });
    else {
        activateStep(2);
        requestAnimationFrame(() => {
            const chosen = [...els.diagnosticos.querySelectorAll('.option')]
                .find((option) => option.dataset.diagnostico === diag);
            if (chosen) focusOption(chosen, els.diagnosticos);
        });
    }
    updateNote();
}

/* Aplica la ruta (forward/reverse): alterna los cuerpos de los pasos 1 y 2,
   sincroniza el control de ruta y prepara la ruta por hallazgos. No resetea
   selecciones — eso lo hace switchRoute cuando el usuario cambia de ruta. */
function setMode(mode) {
    reverse.mode = (mode === 'reverse') ? 'reverse' : 'forward';
    if (reverse.mode !== 'reverse') reversePanelContext = false;
    document.querySelectorAll('#step1 .route-body, #step2 .route-body').forEach((b) => {
        b.hidden = (b.dataset.route === 'reverse') !== inReverse();
    });
    els.routeSwitch?.querySelectorAll('[role="radio"]').forEach((b) => {
        const on = b.dataset.mode === reverse.mode;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
    });
    if (inReverse()) {
        if (!FINDINGS.length) buildReverseIndex();
        syncFindingKindFilters();
        renderFindings();
        renderReverseResults();
    }
    updateLayout();
}

/* Limpia la identificación del diagnóstico (área/diag/RC/EP/downstream + hallazgos),
   conservando los datos del paciente. Usado al cambiar de ruta. */
function clearIdentification() {
    cancelPendingUndo();
    selected.area = null; selected.areaNombre = null;
    selected.diagnostico = null; selected.diagnosticoNombre = null; selected.datosDiag = null;
    selected.rc = []; selected.ep = [];
    selected.nics = []; selected.customNics = [];
    selected.noc = null; selected.nocNombre = null; selected.nocCustom = false;
    selected.b6Escala = null; selected.b6EscalaId = null; selected.b6CustomNiveles = [];
    selected.b6Puntuacion = null; selected.b6Descripcion = null;
    reverse.findingKeys = [];
    reverse.kindFilter = 'all';
    els.areas?.querySelectorAll('.option').forEach((o) => o.classList.remove('selected'));
    syncOptionSelectionState(els.areas);
    if (els.searchAreas) els.searchAreas.value = '';
    els.searchDiag.value = '';
    if (els.searchFindings) els.searchFindings.value = '';
    if (els.searchRc) els.searchRc.value = '';
    if (els.searchEp) els.searchEp.value = '';
    els.searchNic.value = '';
    els.diagnosticos.innerHTML = '';
    if (els.reverseResults) els.reverseResults.innerHTML = '';
    if (els.rcList) els.rcList.innerHTML = '';
    if (els.epList) els.epList.innerHTML = '';
    els.nocs.innerHTML = '';
    els.evaluaciones.innerHTML = '';
    document.getElementById('nocCustomControls')?.remove();
    document.getElementById('nicCustomControls')?.remove();
    const b6Picker = document.getElementById('b6ScalePicker');
    const b6Custom = document.getElementById('b6CustomScale');
    if (b6Picker) b6Picker.hidden = true;
    if (b6Custom) { b6Custom.hidden = true; b6Custom.innerHTML = ''; }
    [2, 3, 4, 5, 6, 7].forEach((n) => document.getElementById(`step${n}`)?.classList.remove('completed'));
    maxReachedStep = 1;
    showMetaBlock(false);
    renderTransversales(null);
    updateNote();
}

/* Cambia de ruta desde la UI sin descartar silenciosamente el PAE existente. */
function switchRoute(mode, opts = {}) {
    const target = (mode === 'reverse') ? 'reverse' : 'forward';
    if (reverse.mode === target) return;
    const hasIdentification = !!selected.area || !!selected.diagnostico
        || selected.rc.length > 0 || selected.ep.length > 0 || selected.nics.length > 0
        || selected.noc !== null || selected.b6Puntuacion !== null || reverse.findingKeys.length > 0;
    if (hasIdentification && !opts.confirmed) {
        runDependentChange({
            title: '¿Cambiar la ruta de identificación?',
            description: 'Se reiniciarán la identificación del PAE, el diagnóstico, los factores, los signos, el resultado NOC, las intervenciones NIC y la evaluación B6. Los demás datos de la nota se conservarán.',
            confirmLabel: 'Cambiar ruta',
            trigger: opts.trigger || document.activeElement,
            onConfirm: () => switchRoute(target, { ...opts, confirmed: true }),
        });
        return;
    }
    markDraftRevision();
    clearIdentification();
    setMode(target);
    activateStep(1, { focus: opts.focus !== false });
}

/* Configura el control de ruta (teclado + clic), el filtro y el buscador de hallazgos */
function setupRouteSwitch() {
    const group = els.routeSwitch;
    if (group) {
        const btns = [...group.querySelectorAll('[role="radio"]')];
        group.addEventListener('click', (e) => {
            const b = e.target.closest('[role="radio"]');
            if (b) switchRoute(b.dataset.mode, {
                trigger: b,
                focus: shouldMoveFocusAfterActivation(e),
            });
        });
        group.addEventListener('keydown', (e) => {
            const current = document.activeElement?.closest?.('[role="radio"]');
            if (!current) return;
            if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                const idx = btns.indexOf(current);
                e.preventDefault();
                const delta = e.key === 'ArrowRight' ? 1 : -1;
                const next = btns[idx + delta];
                if (!next) return;
                switchRoute(next.dataset.mode, { trigger: current, focus: true });
                next.focus();
                return;
            }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                return;
            }
            if (e.key === 'Home' || e.key === 'End') {
                e.preventDefault();
                const next = e.key === 'Home' ? btns[0] : btns.at(-1);
                switchRoute(next.dataset.mode, { trigger: current, focus: true });
                next.focus();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                switchRoute(current.dataset.mode, { trigger: current, focus: true });
                focusRouteSearch(current.dataset.mode);
                return;
            }
            if (e.key === ' ') {
                e.preventDefault();
                switchRoute(current.dataset.mode, { trigger: current, focus: true });
            }
        });
    }

    els.findingKindFilters?.addEventListener('click', (e) => {
        const btn = e.target.closest('[role="radio"]');
        if (btn) { setFindingKindFilter(btn.dataset.filter); btn.focus(); }
    });
    els.findingKindFilters?.addEventListener('keydown', (e) => {
        const filterBtns = [...els.findingKindFilters.querySelectorAll('[role="radio"]')];
        const current = document.activeElement?.closest?.('[role="radio"]');
        const idx = filterBtns.indexOf(current);
        if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            const delta = e.key === 'ArrowRight' ? 1 : -1;
            const next = filterBtns[idx + delta];
            if (!next) return;
            setFindingKindFilter(next.dataset.filter);
            next.focus();
            return;
        }
        if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && current) {
            e.preventDefault();
            return;
        }
        if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            const next = e.key === 'Home' ? filterBtns[0] : filterBtns.at(-1);
            setFindingKindFilter(next.dataset.filter);
            next.focus();
            return;
        }
        if (e.key === 'Enter' && current) {
            e.preventDefault();
            setFindingKindFilter(current.dataset.filter);
            els.searchFindings?.focus();
            return;
        }
        if (e.key === ' ') {
            e.preventDefault();
            if (current) {
                setFindingKindFilter(current.dataset.filter);
                current.focus();
            }
            return;
        }
    });

    els.searchFindings?.addEventListener('input', renderFindings);
    els.searchFindings?.addEventListener('keydown', (e) => {
        if (e.key.startsWith('Arrow') && (e.shiftKey || e.ctrlKey || e.metaKey)) return;  // atajos globales
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.altKey)) return;
        if (e.key === 'Enter') {
            if (e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                if (reverse.findingKeys.length) confirmFindings();
                else announceAction('Seleccione al menos un hallazgo antes de continuar.');
                return;
            }
            const selectable = visibleSelectableOptions(els.findingsList);
            if (selectable.length === 1) {
                e.preventDefault();
                selectable[0].click();
                return;
            }
            const first = selectable[0] || visibleOptions(els.findingsList)[0];
            if (first) { e.preventDefault(); focusOption(first, els.findingsList); }
        } else if (e.key === 'ArrowDown') {
            const first = visibleSelectableOptions(els.findingsList)[0] || visibleOptions(els.findingsList)[0];
            if (first) { e.preventDefault(); focusOption(first, els.findingsList); }
        }
    });
    els.findingsList?.addEventListener('click', (e) => {
        const option = e.target.closest('.option');
        if (!option || option.style.display === 'none' || !option.dataset.findingKey) return;
        toggleReverseFinding(option.dataset.findingKey);
    });
    els.selectedFindings?.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-finding-key]');
        if (!chip) return;
        toggleReverseFinding(chip.dataset.findingKey);
        els.searchFindings?.focus();
    });
    els.selectedFindings?.addEventListener('keydown', (e) => {
        const chip = e.target.closest('[data-finding-key]');
        if (!chip || !['Backspace', 'Delete'].includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        toggleReverseFinding(chip.dataset.findingKey);
        els.searchFindings?.focus();
    });
    const pickReverseResultFromEvent = (e) => {
        const option = e.target.closest('.option');
        if (!option || option.style.display === 'none' || !option.dataset.diag) return;
        pickReverseDiagnosis(option.dataset.area, option.dataset.diag, {
            advance: shouldAdvanceOption(),
            focus: shouldMoveFocusAfterActivation(e),
        });
    };
    els.reverseResults?.addEventListener('click', pickReverseResultFromEvent);
}

/* ─── Inicializa la app ─── */
function init() {
    applyKeyboardNavigationMode(readKeyboardNavigationMode());

    // Verificación de integridad: cada área del catálogo debe existir en datosProPai
    NOTA_AREAS.forEach((a) => {
        if (!datosProPai[a.key]) console.warn(`[CareFlow] Condición clínica sin datos PAE: "${a.key}"`);
    });

    // Campos clínicos (fases A–F): comboboxes, estados, escalas, dispositivos,
    // regiones y educación. La condición clínica se elige dentro del PAE.
    window.NotaCampos?.init({
        onChange: updateNote,
    });
    setupPatientContext();
    setupGlobalFlow();

    loadAreas();
    renderTransversales(null);
    activateStep(1);
    updateNote();
    updateCopyBtnState();
    updateNicConfirmBtn();
    updateStep1Lock();
    enableStepNavigation();
    setupRouteSwitch();   // control de ruta (paso 1) + filtro y buscador de hallazgos
    setMode('forward');   // estado inicial coherente de los cuerpos de ruta

    // Buscadores: escribir filtra; Enter o ↓ entran a la lista. Las flechas simples
    // permanecen dentro del campo y Shift + flechas cambia de campo.
    wireSearch(els.searchAreas, els.areas, 1);
    wireSearch(els.searchDiag,  els.diagnosticos, 2);
    wireSearch(els.searchRc,    els.rcList, 3);
    wireSearch(els.searchEp,    els.epList, 4);
    wireSearch(els.searchNic,   els.intervenciones, 6);

    // Campos del paciente: posición y servicio son comboboxes gestionados por NotaCampos.
    // Sexo: control segmentado (teclado + clic), Enter avanza a Día
    setupSexoControl();
    // Fecha de nacimiento (navegación, auto-avance y validación)
    setupDobNavigation();

    // Estado de meta (chips), Enter avanza a Observaciones
    setupMetaControl();

    // Pendientes cierra el bloque obligatorio y pasa siempre a Observaciones.
    document.getElementById('pendientes')?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        e.stopPropagation();
        els.otrosComentarios?.focus();
        scrollSoft(els.otrosComentarios, 'nearest');
    });

    // Observaciones: Enter conserva su comportamiento nativo. Shift+Enter continúa
    // y Ctrl/⌘+Enter abre revisión mediante el dispatcher único.
    els.otrosComentarios?.addEventListener('input', updateNote);
    els.otrosComentarios?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            continueFlowStage('faseF');
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.stopPropagation();
            toggleNote(true);
        }
    });

    // Botones confirmar de RC y EP
    els.rcConfirmBtn?.addEventListener('click', (event) => proceedAfterRc({ focus: shouldMoveFocusAfterActivation(event) }));
    els.epConfirmBtn?.addEventListener('click', (event) => proceedAfterEp({ focus: shouldMoveFocusAfterActivation(event) }));

    // Botón confirmar NICs → carga B6 y avanza
    els.nicConfirmBtn?.addEventListener('click', (event) => {
        if (selected.nics.length === 0) return;
        loadEvaluaciones(selected.datosDiag, selected.nocNombre);
        activateStep(7, { focus: shouldMoveFocusAfterActivation(event) });
    });

    // Revisión de la nota
    els.noteToggleBtn?.addEventListener('click', (event) => toggleNote(undefined, event.currentTarget));
    els.noteDrawerClose?.addEventListener('click', () => toggleNote(false));
    els.noteDrawerScrim?.addEventListener('click', () => toggleNote(false));

    // Botones de acción
    els.copyBtn?.addEventListener('click', (event) => toggleNote(true, event.currentTarget));
    els.drawerConfirmBtn?.addEventListener('click', confirmCurrentNote);
    els.drawerCopyBtn?.addEventListener('click', copyNote);
    els.drawerDiscardBtn?.addEventListener('click', (event) => requestDiscardEditing(event.currentTarget));
    els.workflowDiscardBtn?.addEventListener('click', (event) => requestDiscardEditing(event.currentTarget));
    setupDialogActionNavigation(els.noteSection);
    document.querySelectorAll('[data-reset-section]').forEach((button) => {
        button.addEventListener('click', (event) => openResetDialog(button.dataset.resetSection, event.currentTarget));
    });
    els.resetCancelBtn?.addEventListener('click', () => els.resetDialog?.close());
    els.resetSectionBtn?.addEventListener('click', () => {
        const sectionId = pendingResetSection;
        pendingResetRestoreFocus = false;
        els.resetDialog?.close();
        if (sectionId) resetCurrentSection(sectionId);
    });
    els.resetAllBtn?.addEventListener('click', () => {
        pendingResetRestoreFocus = false;
        els.resetDialog?.close();
        resetWorkflow({ confirmed: true });
    });
    els.resetDialog?.addEventListener('click', (e) => {
        if (e.target !== els.resetDialog) return;
        const rect = els.resetDialog.getBoundingClientRect();
        const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
        if (!inside) els.resetDialog.close();
    });
    els.resetDialog?.addEventListener('close', () => {
        const invoker = pendingResetInvoker;
        const restoreFocus = pendingResetRestoreFocus;
        pendingResetSection = null;
        pendingResetInvoker = null;
        pendingResetRestoreFocus = true;
        interactionOverlays?.remove('reset', { restoreFocus: false });
        if (restoreFocus) requestAnimationFrame(() => {
            if (!invoker?.isConnected) return;
            invoker.focus?.({ preventScroll: true });
            invoker.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
        });
    });
    els.resetDialog?.addEventListener('cancel', (event) => {
        event.preventDefault();
        els.resetDialog.close();
    });
    setupDialogActionNavigation(els.resetDialog);

    els.noteSection?.addEventListener('cancel', (event) => {
        event.preventDefault();
        toggleNote(false);
    });
    els.noteSection?.addEventListener('close', () => {
        if (noteVisible) toggleNote(false);
    });
    els.shortcutsBtn?.addEventListener('click', openShortcutsDialog);
    els.shortcutsClose?.addEventListener('click', closeShortcutsDialog);
    els.shortcutsDialog?.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeShortcutsDialog();
    });
    els.shortcutsDialog?.addEventListener('close', () => {
        interactionOverlays?.remove('shortcuts', { restoreFocus: true });
    });
    els.keyboardNavigationMode?.addEventListener('click', (event) => {
        applyKeyboardNavigationMode(isAgileNavigation() ? 'standard' : 'agile', { persist: true, announce: true });
        event.currentTarget.focus({ preventScroll: true });
    });

    document.addEventListener('focusin', (e) => {
        const id = currentSectionId();
        if (id != null) rememberLogicalSection(id);
        rememberStageFocus(e.target);
        const navigationField = currentNavigationField(e.target);
        if (navigationField?.kind === 'field') tabLevelController?.remember(navigationField, e.target);
        if (isWritingElement(e.target)) writingTargetRegistry?.remember(writingScopeId(e.target), e.target);
        interactionMetrics?.record('focus-transition', {
            targetId: stableFocusId(e.target),
            stageId: metricStageId(e.target),
            modality: interactionOrigin?.current?.({ maxAge: 1500 }) || 'programmatic',
        });
        const inReverseFields = e.target?.closest?.('#step1 [data-route="reverse"]');
        const inDiagnosisPanel = e.target?.closest?.('#dxLive');
        const nextContext = !!(inReverseFields || inDiagnosisPanel);
        if (nextContext !== reversePanelContext) {
            reversePanelContext = nextContext;
            updateLayout();
        }
    });

    setupInteractionCore();
    setupExitGuard();

    // Recalcular techo del panel al redimensionar la ventana
    window.addEventListener('resize', () => {
        syncNotePanelHeight();
        syncDxLiveOffset();
        syncVisibleOptionGrids();
    });

    revisionTrackingEnabled = true;

    // La sesión comienza directamente en el primer dato clínico pendiente.
    focusFlowStageEntry('patient', 'initial');
}

init();
