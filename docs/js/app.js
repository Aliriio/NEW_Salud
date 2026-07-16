const datosProPai = window.datosProPai;

/* Tipo de nota que genera esta página (un futuro recibo.html solo cambia esto) */
const NOTE_TYPE = 'entrega';

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
const SECTION_TYPEAHEAD_DELAY = 1500;
let maxReachedStep = 1;  // paso más profundo alcanzado: permite "recuperar" el avance con ↓
let noteVisible = false;  // La nota empieza oculta
let reversePanelContext = false;

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
    previewStatus:  document.getElementById('previewStatus'),
    previewLaunchStatus: document.getElementById('previewLaunchStatus'),
    previewDraftState: document.getElementById('previewDraftState'),
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

/* ─── Flujo global de Nota de entrega ───
   El PAE conserva su controlador interno; este nivel solo decide qué etapa mayor
   está visible y resume el trabajo ya realizado. */
const FLOW_STAGE_ORDER = ['patient', 'faseB', 'faseC', 'faseD', 'fasePAE', 'faseF'];
let patientGateUnlocked = false;

function isPatientGateUnlocked() {
    if (!patientGateUnlocked && flowStageState('patient').complete) patientGateUnlocked = true;
    return patientGateUnlocked;
}

function flowStageState(id) {
    const nc = window.NotaCampos;
    const clinical = nc?.getMissing() || { faseA: [], faseB: [], faseC: [], faseD: [], evaluacion: [], cierre: [] };
    let missing = [];
    let summary = '';

    if (id === 'patient') {
        if (!els.sexo || els.sexo.value === '___') missing.push('Sexo del paciente');
        if (!validateDOB().valid) missing.push('Fecha de nacimiento válida');
        missing.push(...clinical.faseA);
        const s = nc?.state;
        summary = [s?.numHabitacion ? `Hab. ${s.numHabitacion}` : '', s?.servicio || ''].filter(Boolean).join(' · ');
    } else if (id === 'faseB' || id === 'faseC' || id === 'faseD') {
        missing = [...(clinical[id] || [])];
        summary = nc?.phaseStatus()?.[id]?.summary || '';
    } else if (id === 'fasePAE') {
        activeSteps().forEach((s) => {
            if (!stepHasSelection(s.num)) missing.push(stepLabel(s));
        });
        summary = selected.diagnosticoNombre || selected.areaNombre || '';
    } else if (id === 'faseF') {
        missing = [...clinical.evaluacion];
        if (!els.metaLograda?.value) missing.push('Estado de la meta (NOC) al cierre');
        missing.push(...clinical.cierre);
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

function focusFlowStageEntry(id) {
    requestAnimationFrame(() => {
        if (id === 'patient') {
            const target = document.getElementById('sexoSeg')?.querySelector('[role="radio"]');
            target?.focus();
        } else if (id === 'fasePAE') {
            focusStepEntry(currentStep);
        } else {
            window.NotaCampos?.focusPhase(id, 1);
        }
    });
}

function activateFlowStage(id, opts = {}) {
    if (!FLOW_STAGE_ORDER.includes(id)) return false;
    if (id !== 'patient' && !isPatientGateUnlocked()) {
        const message = document.querySelector('[data-flow-message="patient"]');
        if (message) message.textContent = 'Complete los datos del paciente para habilitar las demás secciones.';
        return false;
    }
    document.querySelectorAll('[data-flow-stage]').forEach((stage) => {
        stage.hidden = stage.dataset.flowStage !== id;
    });
    activeFlowStage = id;
    if (id !== 'fasePAE') reversePanelContext = false;
    window.NotaCampos?.closeMenus?.();
    updateFlowNavigator();
    updateLayout();
    const stage = document.querySelector(`[data-flow-stage="${id}"]`);
    stage?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    if (opts.focus !== false) focusFlowStageEntry(id);
    return true;
}

function focusPatientPending() {
    const s = window.NotaCampos?.state;
    const target = (!els.sexo || els.sexo.value === '___') ? document.getElementById('sexoSeg')?.querySelector('[role="radio"]')
        : !validateDOB().valid ? els.dobFecha
        : !s?.posicion ? document.getElementById('posicion')
        : !s?.numCama ? document.getElementById('numCama')
        : !s?.numHabitacion ? document.getElementById('numHabitacion')
        : !s?.servicio ? document.getElementById('servicio') : null;
    target?.focus();
    scrollSoft(target);
    return !!target;
}

function continueFlowStage(id) {
    const state = flowStageState(id);
    const message = document.querySelector(`[data-flow-message="${id}"]`);
    if (!state.complete) {
        if (message) message.textContent = `Pendiente: ${state.missing[0]}`;
        if (id === 'patient') focusPatientPending();
        else if (id === 'faseF' && state.missing[0]?.startsWith('Estado de la meta')) {
            focusMeta();
        }
        else window.NotaCampos?.focusFirstPending(id);
        return false;
    }
    if (message) message.textContent = '';
    const index = FLOW_STAGE_ORDER.indexOf(id);
    const next = FLOW_STAGE_ORDER[index + 1];
    if (next) activateFlowStage(next, { focus: true });
    else if (id === 'faseF') toggleNote(true);
    return true;
}

function setupGlobalFlow() {
    document.querySelectorAll('[data-flow-target]').forEach((btn) => {
        btn.addEventListener('click', () => activateFlowStage(btn.dataset.flowTarget, { focus: true }));
    });
    document.querySelectorAll('[data-flow-continue]').forEach((btn) => {
        btn.addEventListener('click', () => continueFlowStage(btn.dataset.flowContinue));
    });
    activateFlowStage('patient', { focus: false });
}

function isEditableElement(el) {
    const tag = el?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable;
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
function activateStep(n, opts = {}) {
    STEPS.forEach((s) => {
        const stepEl = document.getElementById(`step${s.num}`);
        if (!stepEl) return;
        const header = stepEl.querySelector('.step-header');

        // Pasos que no aplican al diagnóstico actual: ocultos y fuera del flujo
        if (!s.present()) {
            stepEl.hidden = true;
            stepEl.classList.remove('active', 'completed');
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
            if (header) { header.setAttribute('aria-expanded', 'false'); header.setAttribute('tabindex', '0'); }
        } else if (s.num === n) {
            stepEl.classList.remove('completed');
            if (header) { header.setAttribute('aria-expanded', 'true'); header.setAttribute('tabindex', '0'); }
        } else {
            if (!stepHasSelection(s.num)) stepEl.classList.remove('completed');
            if (header) { header.setAttribute('aria-expanded', 'false'); header.setAttribute('tabindex', '-1'); }
        }
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

/* ─── Grupo segmentado genérico (radiogroup, fila horizontal) ───
   ←/→ navegan entre opciones y en los extremos delegan al navegador espacial.
   Como es una sola fila, ↑/↓ salen a la sección anterior/siguiente (onUp/onDown).
   Enter selecciona y avanza (onConfirm). Shift+flechas → atajos globales. */
function setupSegmentedGroup(group, hidden, { onChange, onConfirm, onUp, onDown } = {}) {
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
        if (e.key.startsWith('Arrow') && (e.shiftKey || e.ctrlKey || e.metaKey)) return; // atajos globales
        const idx = btns.indexOf(document.activeElement);
        if (e.key === 'ArrowRight') {
            if (idx >= btns.length - 1) return;
            e.preventDefault();
            const next = btns[Math.max(idx, 0) + 1];
            select(next); next.focus();
        } else if (e.key === 'ArrowLeft') {
            if (idx <= 0) return;
            e.preventDefault();
            const prev = btns[idx - 1];
            select(prev); prev.focus();
        } else if (e.key === 'ArrowUp') {
            if (onUp) { e.preventDefault(); onUp(); }
        } else if (e.key === 'ArrowDown') {
            if (onDown) { e.preventDefault(); onDown(); }
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
   Enter/↓ avanzan al campo de día de nacimiento (siguiente dentro de datos). */
function setupSexoControl() {
    const toDate = () => { els.dobFecha?.focus(); };
    setupSegmentedGroup(document.getElementById('sexoSeg'), els.sexo, {
        onChange: updateNote,
        onConfirm: toDate,
        onDown: toDate,
    });
}

/* Meta: respalda el valor en #metaLograda (hidden), '' = sin elegir.
   Enter/↓ avanzan al criterio clínico; ↑ vuelve a la tendencia evolutiva. */
function setupMetaControl() {
    const toCriterio = () => { const c = document.getElementById('criterioClinico'); c?.focus(); scrollSoft(c); };
    setupSegmentedGroup(document.getElementById('metaSeg'), els.metaLograda, {
        onChange: updateNote,
        onConfirm: toCriterio,
        onDown: toCriterio,
        onUp: () => { const t = document.getElementById('tendenciaEvolutiva'); t?.focus(); scrollSoft(t); },
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
    if (els.noteSection) els.noteSection.hidden = !noteVisible;
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
    if (header) {
        header.setAttribute('aria-expanded', 'false');
        header.setAttribute('tabindex', '0');
    }
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

        const handleNav = () => {
            if (!stepEl.classList.contains('completed')) return;
            goToStepSection(s.num, -1);
        };

        header.addEventListener('click', handleNav);
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleNav();
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
function toggleNote(force) {
    const next = typeof force === 'boolean' ? force : !noteVisible;
    if (next && !isNoteComplete().complete) {
        updateCopyBtnState();
        return;
    }
    if (next === noteVisible && els.noteSection?.hidden === !next) return;
    noteVisible = next;

    if (noteVisible) {
        window.NotaCampos?.closeMenus?.();
        previewReturnFocus = document.activeElement;
        if (els.noteSection) els.noteSection.hidden = false;
        if (els.noteDrawerScrim) els.noteDrawerScrim.hidden = false;
        els.noteContent.hidden = false;
        els.noteToggleBtn?.setAttribute('aria-expanded', 'true');
        document.body.classList.add('note-drawer-open');
        syncNotePanelHeight();
        requestAnimationFrame(() => els.noteDrawerClose?.focus());
    } else {
        if (els.noteSection) els.noteSection.hidden = true;
        if (els.noteDrawerScrim) els.noteDrawerScrim.hidden = true;
        els.noteToggleBtn?.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('note-drawer-open');
        const target = previewReturnFocus?.isConnected ? previewReturnFocus : els.noteToggleBtn;
        previewReturnFocus = null;
        target?.focus();
    }
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
            if (header) {
                header.setAttribute('aria-expanded', 'false');
                header.setAttribute('tabindex', '-1');
            }
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
    const missing = [];
    const m = window.NotaCampos?.getMissing()
        || { faseA: [], faseB: [], faseC: [], faseD: [], evaluacion: [], cierre: [] };

    // Fase A — paciente y ubicación
    if (!els.sexo || els.sexo.value === '___') missing.push('Sexo del paciente');
    if (!validateDOB().valid)                  missing.push('Fecha de nacimiento válida');
    missing.push(...m.faseA);

    // Fases B, C y D — estado clínico, dispositivos, hallazgos
    missing.push(...m.faseB, ...m.faseC, ...m.faseD);

    // Fase E — PAE: cada paso activo debe tener selección.
    activeSteps().forEach((s) => {
        if (!stepHasSelection(s.num)) missing.push(`${stepLabel(s)} (PAE, paso ${activePos(s.num)})`);
    });

    // Fase F — evaluación y entrega
    missing.push(...m.evaluacion);
    if (!els.metaLograda?.value) missing.push('Estado de la meta (NOC) al cierre');
    missing.push(...m.cierre);

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

    if (complete) {
        els.copyBtn.disabled = false;
        els.copyBtn.removeAttribute('aria-disabled');
        els.noteStatus.className = 'note-status complete';
        els.noteStatus.textContent = '✓ Nota lista — puede copiar';
    } else {
        els.copyBtn.disabled = true;
        els.copyBtn.setAttribute('aria-disabled', 'true');
        els.noteStatus.className = 'note-status incomplete';
        els.noteStatus.textContent = `Pendiente: ${missing[0]}`;
    }

    if (els.drawerCopyBtn) {
        els.drawerCopyBtn.disabled = !complete;
        els.drawerCopyBtn.setAttribute('aria-disabled', complete ? 'false' : 'true');
    }
    if (els.noteToggleBtn) {
        els.noteToggleBtn.hidden = !complete;
        if (!complete) els.noteToggleBtn.setAttribute('aria-expanded', 'false');
    }
    if (els.previewLaunchStatus) {
        els.previewLaunchStatus.textContent = 'Nota lista para revisar';
    }
    if (els.previewStatus) {
        els.previewStatus.className = `note-drawer-status ${complete ? 'complete' : 'incomplete'}`;
        els.previewStatus.textContent = complete
            ? 'La nota está completa y lista para revisión final.'
            : `${missing.length} campo${missing.length === 1 ? '' : 's'} pendiente${missing.length === 1 ? '' : 's'}. Primero: ${missing[0]}.`;
    }
    if (els.previewDraftState) {
        els.previewDraftState.textContent = complete ? 'Lista para revisar' : 'Borrador';
    }

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
    div.innerHTML = `<span class="check-mark">✓</span><h4>${title}</h4>${desc ? `<p>${desc}</p>` : ''}`;
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

/* ─── Marca roles ARIA, ids e índice de orden tras cada render ───
   No toca el roving tabindex (eso lo hace primeRoving, solo en listas roving). */
function markOptions(container) {
    container.setAttribute('role', 'listbox');
    const opts = [...container.querySelectorAll('.option')];
    opts.forEach((o, i) => {
        o.setAttribute('role', 'option');
        if (!o.id) o.id = `${container.id}-opt-${i}`;
        if (!o.hasAttribute('tabindex')) o.setAttribute('tabindex', '-1');
        // Orden clínico original (data order), asignado solo la 1ª vez tras el render
        if (o.dataset.ord === undefined) o.dataset.ord = String(i);
        const sel = o.classList.contains('selected') || o.classList.contains('multi-selected');
        o.setAttribute('aria-selected', sel ? 'true' : 'false');
    });
}

/* ─── Roving tabindex: exactamente una opción tabulable (solo listas NOC/B6) ─── */
function primeRoving(container) {
    const opts = [...container.querySelectorAll('.option')];
    const visible = opts.filter((o) => o.style.display !== 'none');
    if (!visible.length) return;
    opts.forEach((o) => o.setAttribute('tabindex', '-1'));
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
            if (direction === 'right') return pos.x > origin.x + 2;
            if (direction === 'left') return pos.x < origin.x - 2;
            if (direction === 'down') return pos.y > origin.y + 2;
            if (direction === 'up') return pos.y < origin.y - 2;
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

function setupConfirmButtonNavigation() {
    [
        [els.rcConfirmBtn, 3],
        [els.epConfirmBtn, 4],
        [els.nicConfirmBtn, 6],
    ].forEach(([btn, stepNum]) => {
        btn?.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowUp' || e.shiftKey || e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            focusLastOptionForStep(stepNum);
        });
    });
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
   (opts.searchInput); si no hay buscador, type-ahead. ↑ en la 1ª fila → buscador. */
function enableOptionKeyboard(container, opts = {}) {
    if (!container || container.dataset.kbReady) return;
    container.dataset.kbReady = '1';
    let typeBuf = '';
    let typeTimer = null;

    const toSearch = (ch) => {
        const s = opts.searchInput;
        if (!s) return false;
        if (ch != null) s.value += ch;
        s.focus();
        const len = s.value.length;
        s.setSelectionRange?.(len, len);
        if (ch != null) s.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    };

    container.addEventListener('keydown', (e) => {
        // No interceptar mientras se escribe en un editor inline (opción personalizada)
        if (e.target.closest('.custom-form')) return;
        if (isEditableElement(e.target) || (e.target.tagName === 'BUTTON' && !e.target.classList.contains('option'))) return;
        // Shift/Ctrl + flechas son atajos globales de salto entre secciones
        if (e.key.startsWith('Arrow') && (e.shiftKey || e.ctrlKey || e.metaKey)) return;
        const items = visibleOptions(container);
        if (!items.length) return;
        const current = document.activeElement?.closest?.('.option');
        const idx = current ? items.indexOf(current) : -1;
        const cols = gridColumns(items);
        const atTopRow = idx >= 0 && idx < cols;
        const atBottomRow = idx >= 0 && idx + cols >= items.length;

        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault();
                if (opts.spatial && current) {
                    if (opts.onRightEdge && isRightGridEdge(current, items) && opts.onRightEdge(current, items)) break;
                    const target = nearestOptionInDirection(current, items, 'right');
                    if (target) { focusOption(target, container); break; }
                } else if (current && opts.onRightEdge && isRightGridEdge(current, items) && opts.onRightEdge(current, items)) break;
                focusOption(items[idx < 0 ? 0 : Math.min(idx + 1, items.length - 1)], container);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (opts.spatial && current) {
                    const target = nearestOptionInDirection(current, items, 'left');
                    if (target) { focusOption(target, container); break; }
                    if (opts.onLeftEdge && isLeftGridEdge(current, items) && opts.onLeftEdge(current, items)) break;
                } else if (current && opts.onLeftEdge && isLeftGridEdge(current, items) && opts.onLeftEdge(current, items)) break;
                focusOption(items[idx <= 0 ? 0 : idx - 1], container);
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (opts.spatial && current) {
                    const target = nearestOptionInDirection(current, items, 'down');
                    if (target) { focusOption(target, container); break; }
                }
                if (atBottomRow && opts.lockVerticalEdges) {
                    focusOption(current || items[items.length - 1], container);
                } else if (atBottomRow && opts.onBottomEdge && opts.onBottomEdge(current, items)) {
                    break;
                } else if (atBottomRow) {
                    focusAdjacentSection(opts.stepNum, +1);   // borde inferior → sección inmediata siguiente
                } else {
                    focusOption(items[idx < 0 ? 0 : Math.min(idx + cols, items.length - 1)], container);
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (opts.spatial && current) {
                    const target = nearestOptionInDirection(current, items, 'up');
                    if (target) { focusOption(target, container); break; }
                }
                if (atTopRow && opts.lockVerticalEdges) {
                    focusOption(current || items[0], container);
                } else if (atTopRow && opts.searchInput) {
                    toSearch(null);                           // tope de la sección → su buscador
                } else if (atTopRow && opts.onTopEdge) {
                    opts.onTopEdge();                         // borde superior personalizado (panel lateral)
                } else if (atTopRow && opts.stepNum != null) {
                    focusAdjacentSection(opts.stepNum, -1);   // tope sin buscador → sección anterior
                } else {
                    focusOption(items[Math.max(idx - cols, 0)], container);
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
                if (current && !current.querySelector('.custom-form')) {
                    e.preventDefault();
                    current.click();
                }
                break;
            case 'Enter':
                if (e.shiftKey) {                   // Shift+Enter: confirmar y avanzar (multi)
                    if (opts.multi && opts.onAdvance) {
                        e.preventDefault();
                        opts.onAdvance();
                    } else if (current && !current.querySelector('.custom-form')) {
                        e.preventDefault();
                        current.click();            // single: selecciona+avanza igual que Enter
                    }
                    break;
                }
                if (current && !current.querySelector('.custom-form')) {
                    e.preventDefault();
                    current.click();                // single: selecciona+avanza · multi: alterna
                }
                break;
            case 'Backspace':
                if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && opts.multi && current?.classList.contains('multi-selected')) {
                    e.preventDefault();
                    const removeButton = current.querySelector('.option-remove');
                    if (removeButton) {
                        removeButton.click();
                        setTimeout(() => opts.searchInput?.focus(), 0);
                    }
                    else current.click();
                }
                break;
            default:
                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    if (opts.searchInput) {         // escribir → modo búsqueda
                        e.preventDefault();
                        toSearch(e.key);
                    } else {                        // sin buscador: type-ahead
                        typeBuf += normalizeText(e.key);
                        clearTimeout(typeTimer);
                        typeTimer = setTimeout(() => { typeBuf = ''; }, SECTION_TYPEAHEAD_DELAY);
                        const match = items.find((o) =>
                            normalizeText(o.querySelector('h4')?.textContent || o.textContent).startsWith(typeBuf));
                        if (match) { e.preventDefault(); focusOption(match, container); }
                    }
                }
        }
    });
}

/* ─── Lista con foco-en-opción (roving): NOC y B6. Llamar tras cada render. ─── */
function setupOptionList(container, opts) {
    if (!container) return;
    markOptions(container);
    primeRoving(container);
    enableOptionKeyboard(container, opts);
}

/* ─── MODO BÚSQUEDA → NAVEGACIÓN: conecta un buscador con su lista ───
   El buscador es el "tope" de la sección: Enter o ↓ entran a la 1ª opción (dentro
   de la sección); ↑ sale a la sección anterior. Shift+flechas se manejan global. */
function wireSearch(input, container, stepNum) {
    if (!input || !container) return;
    input.addEventListener('input', () => filterOptions(container, input.value));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const confirmBtn = confirmButtonForStep(stepNum);
            const selectedOption = confirmBtn ? [...container.querySelectorAll('.option.multi-selected')].at(-1) : null;
            if (selectedOption) {
                e.preventDefault();
                const removeButton = selectedOption.querySelector('.option-remove');
                if (removeButton) {
                    removeButton.click();
                    setTimeout(() => input.focus(), 0);
                }
                else selectedOption.click();
            }
            return;
        }
        if (e.key.startsWith('Arrow') && (e.shiftKey || e.ctrlKey || e.metaKey)) return; // atajos globales
        if (e.key === 'Enter') {
            const confirmBtn = confirmButtonForStep(stepNum);
            if (e.shiftKey && confirmBtn && !confirmBtn.disabled) {
                e.preventDefault();
                confirmBtn.click();
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
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (stepNum === 1) focusRouteSwitch();
            else focusAdjacentSection(stepNum, -1);   // ↑ en el tope → sección anterior
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
    if (mode === 'reverse' && focusFindingKindFilter()) return true;
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
    if (n === 1 && focusRouteSwitch()) return;
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
function goToStepSection(n, dir = 0) {
    activateStep(n);
    scrollSoft(document.getElementById(`step${n}`), 'nearest');
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
        { id: 'note', has: () => !!els.noteToggleBtn && !els.noteToggleBtn.hidden, focus: () => { els.noteToggleBtn?.focus(); scrollSoft(els.noteToggleBtn); } },
        { id: 'copy', has: () => !els.copyBtn?.disabled, focus: () => { els.copyBtn?.focus(); scrollSoft(els.copyBtn); } },
    ];
}

/* ─── Identifica en qué sección está el foco actualmente ───
   Cualquier elemento dentro de un .step pertenece a ese paso (cubre buscadores,
   opciones, filtros y barras de confirmación, en ambas rutas). */
function currentSectionId() {
    const a = document.activeElement;
    if (!a) return null;
    if (a.closest?.('.patient-block')) return 'patient';
    if (a.closest?.('#dxLive')) return 1;
    const stepEl = a.closest?.('.step');
    if (stepEl && stepEl.dataset.step) return Number(stepEl.dataset.step);
    const phaseEl = a.closest?.('.phase');
    if (phaseEl && phaseEl.dataset.section) return phaseEl.dataset.section;
    if (a === els.otrosComentarios) return 'obs';
    if (a === els.noteToggleBtn) return 'note';
    if (a === els.copyBtn) return 'copy';
    return null;
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

const SPATIAL_FOCUS_SELECTOR = [
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    '[role="option"][tabindex="0"]',
    '[role="radio"][tabindex="0"]',
    '[tabindex="0"]',
].join(',');

function spatialStageScope() {
    return document.querySelector(`[data-flow-stage="${activeFlowStage}"]:not([hidden])`);
}

function isSpatiallyVisible(el) {
    if (!el || el.tabIndex < 0 || el.closest('[hidden], [aria-hidden="true"]')) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

function editableAtDirectionalEdge(el, key) {
    if (el.matches('input[type="number"]')) return key === 'ArrowUp' || key === 'ArrowDown';
    if (el.matches('input[type="date"], input[type="range"]')) return false;
    if (el.tagName === 'SELECT') {
        if (key === 'ArrowUp' || key === 'ArrowLeft') return el.selectedIndex <= 0;
        return el.selectedIndex >= el.options.length - 1;
    }
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return true;
    if (el.getAttribute('aria-expanded') === 'true') return false;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start == null || end == null || start !== end) return false;
    if (key === 'ArrowLeft') return start === 0;
    if (key === 'ArrowRight') return end === el.value.length;
    if (el.tagName === 'INPUT') return true;
    if (key === 'ArrowUp') return !el.value.slice(0, start).includes('\n');
    return !el.value.slice(end).includes('\n');
}

function nearestSpatialControl(source, key, scope) {
    const from = source.getBoundingClientRect();
    const sx = from.left + from.width / 2;
    const sy = from.top + from.height / 2;
    const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
    const positive = key === 'ArrowRight' || key === 'ArrowDown';
    let best = null;
    let bestScore = Infinity;

    [...new Set(scope.querySelectorAll(SPATIAL_FOCUS_SELECTOR))].forEach((candidate) => {
        if (candidate === source || !isSpatiallyVisible(candidate)) return;
        const rect = candidate.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const primary = horizontal ? cx - sx : cy - sy;
        if ((positive && primary <= 2) || (!positive && primary >= -2)) return;
        const secondary = horizontal ? Math.abs(cy - sy) : Math.abs(cx - sx);
        const overlap = horizontal
            ? Math.max(0, Math.min(from.bottom, rect.bottom) - Math.max(from.top, rect.top))
            : Math.max(0, Math.min(from.right, rect.right) - Math.max(from.left, rect.left));
        const score = Math.abs(primary) + secondary * (overlap > 0 ? 0.35 : 1.8);
        if (score < bestScore) { best = candidate; bestScore = score; }
    });
    return best;
}

function handleSpatialArrow(e) {
    if (e.defaultPrevented || !e.key.startsWith('Arrow') || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const source = document.activeElement;
    const scope = spatialStageScope();
    if (!scope?.contains(source) || source?.closest('.custom-form')) return;
    if (!editableAtDirectionalEdge(source, e.key)) return;
    const target = nearestSpatialControl(source, e.key, scope);
    if (!target) return;
    e.preventDefault();
    target.focus();
    target.select?.();
    scrollSoft(target, 'nearest');
}

function advanceCurrentSectionByShortcut() {
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
        if (els.noteToggleBtn && !els.noteToggleBtn.hidden) {
            els.noteToggleBtn.focus();
            scrollSoft(els.noteToggleBtn);
            return true;
        }
        if (!els.copyBtn?.disabled) {
            els.copyBtn.focus();
            scrollSoft(els.copyBtn);
            return true;
        }
        return false;
    }
    if (id === 'note') {
        if (els.copyBtn?.disabled) return false;
        els.copyBtn.focus();
        scrollSoft(els.copyBtn);
        return true;
    }
    if (id === 'copy') {
        if (els.copyBtn?.disabled) return false;
        els.copyBtn.click();
        return true;
    }
    return false;
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

    // Re-preparar roles y roving tabindex sobre las opciones que quedaron visibles
    markOptions(container);
    primeRoving(container);
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

    selected.area = key;
    selected.areaNombre = areaLabel(key);
    selected.diagnostico = null; selected.diagnosticoNombre = null;
    selected.datosDiag = null; selected.rc = []; selected.ep = [];
    selected.nics = []; selected.customNics = [];
    selected.noc = null; selected.nocNombre = null; selected.nocCustom = false;
    selected.b6Escala = null; selected.b6EscalaId = null; selected.b6CustomNiveles = [];
    selected.b6Puntuacion = null; selected.b6Descripcion = null;

    els.areas.querySelectorAll('.option').forEach((o) => o.classList.toggle('selected', o.dataset.area === key));

    [2, 3, 4, 5, 6, 7].forEach(n => document.getElementById(`step${n}`)?.classList.remove('completed'));
    maxReachedStep = 1;   // el avance posterior ya no es válido: se eligió otra área
    showMetaBlock(false);

    els.searchDiag.value = '';
    loadDiagnosticos(key);
    activateStep(2, { focus: opts.advancePae !== false && opts.focus !== false });
    if (opts.advancePae !== false) activateFlowStage('fasePAE', { focus: opts.focus !== false });
    renderTransversales(null);
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
        applyAreaSelection(option.dataset.area, { focus: true, advancePae: true });
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

    els.diagnosticos.onclick = (e) => {
        const option = e.target.closest('.option');
        if (!option || option.style.display === 'none') return;

        els.diagnosticos.querySelectorAll('.option').forEach((o) => o.classList.remove('selected'));
        option.classList.add('selected');

        selected.diagnostico = option.dataset.diagnostico;
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
        proceedAfterDiag(selected.datosDiag);
        updateNote();
    };
}

/* ─── Pasos comunes tras elegir diagnóstico: carga RC/EP y entra a "Relacionado con".
   RC siempre existe; EP solo en diagnósticos no-riesgo (si falta, ese paso se oculta). */
function proceedAfterDiag(datos) {
    els.searchRc.value = ''; els.searchEp.value = ''; els.searchNic.value = '';
    loadRc(datos);
    loadEp(datos);
    if ((datos.rc || []).length) {
        activateStep(3, { focus: true });          // → Relacionado con
    } else {                                        // defensivo: sin RC, ir directo a NOC
        loadNocs(datos);
        activateStep(5, { focus: true });
    }
}

/* ─── Picker multi-select genérico (usado por RC y EP; mismo patrón que NIC) ─── */
function loadMultiPicker({ container, items, selArr, searchInput, stepNum, onAdvance, updateBtn }) {
    container.innerHTML = '';
    items.forEach((txt, i) => {
        const opt = createOption(txt, 'Clic para seleccionar / deseleccionar', { idx: String(i) });
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
            option.setAttribute('aria-selected', 'false');
            const i = selArr.indexOf(txt); if (i >= 0) selArr.splice(i, 1);
        } else {
            option.classList.add('multi-selected');
            option.setAttribute('aria-selected', 'true');
            selArr.push(txt);
        }
        updateBtn();
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
function proceedAfterRc() {
    if (selected.rc.length === 0) return;
    if ((selected.datosDiag?.ep || []).length) {
        activateStep(4, { focus: true });          // → Evidenciado por
    } else {
        loadNocs(selected.datosDiag);
        activateStep(5, { focus: true });          // → NOC
    }
}

/* ─── Confirmación de EP → NOC ─── */
function proceedAfterEp() {
    if (selected.ep.length === 0) return;
    loadNocs(selected.datosDiag);
    activateStep(5, { focus: true });              // → NOC
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

    const commit = () => { const v = input.value.trim(); if (v) onCommit(v); };
    addBtn.addEventListener('click', commit);
    cancelBtn.addEventListener('click', () => onCancel && onCancel());
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onCancel && onCancel();
        }
        else if (e.key === 'Enter') { e.preventDefault(); commit(); }
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
function proceedAfterNoc(datos) {
    selected.nics = [];
    selected.customNics = [];
    selected.b6Escala = null;
    selected.b6EscalaId = null;
    selected.b6CustomNiveles = [];
    selected.b6Puntuacion = null;
    selected.b6Descripcion = null;
    [6, 7].forEach((n) => document.getElementById(`step${n}`)?.classList.remove('completed'));
    maxReachedStep = 5;   // el avance posterior ya no es válido: se eligió otro NOC
    showMetaBlock(false);
    els.searchNic.value = '';
    loadIntervenciones(datos);
    activateStep(6, { focus: true });
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

/* ─── Tarjeta de una NIC personalizada ya agregada (con botón de quitar) ─── */
function buildCustomNicCard(nic) {
    const card = document.createElement('div');
    card.className = 'option option--custom multi-selected';
    const h = document.createElement('h4');
    h.textContent = nic;
    const p = document.createElement('p');
    p.textContent = 'Intervención personalizada';
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'option-remove';
    rm.dataset.nic = nic;
    rm.setAttribute('aria-label', 'Quitar intervención');
    rm.textContent = '✕';
    card.append(h, p, rm);
    return card;
}

/* ─── Abre el editor inline para agregar una NIC personalizada ─── */
function openNicCustomForm(datos) {
    const add = els.intervenciones.querySelector('.option--add');
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
    selected.customNics = selected.customNics.filter((n) => n !== nic);
    selected.nics = selected.nics.filter((n) => n !== nic);
    clearB6IfNoNics();
    loadIntervenciones(datos);
    updateNote();
}

/* ─── Carga intervenciones NIC (multi-select con botón de confirmación) ─── */
function loadIntervenciones(datos) {
    els.intervenciones.innerHTML = '';
    const nics = datos.nic || [];

    nics.forEach((nic, i) => {
        const opt = createOption(nic, 'Clic para seleccionar / deseleccionar', { nic: String(i) });
        if (selected.nics.includes(nic)) opt.classList.add('multi-selected');
        els.intervenciones.appendChild(opt);
    });

    // NICs personalizadas ya agregadas
    selected.customNics.forEach((nic) => els.intervenciones.appendChild(buildCustomNicCard(nic)));

    // Tarjeta para agregar una intervención personalizada
    els.intervenciones.appendChild(buildAddCard('Otra intervención (personalizada)'));
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

        const rm = e.target.closest('.option-remove');
        if (rm) { e.stopPropagation(); removeNicCustom(datos, rm.dataset.nic); return; }

        const option = e.target.closest('.option');
        if (!option || option.style.display === 'none') return;

        if (option.classList.contains('option--add'))    { openNicCustomForm(datos); return; }
        if (option.classList.contains('option--custom'))  return;  // se quita con el ✕

        // NIC predefinida: alternar selección
        const nicText = nics[Number(option.dataset.nic)];
        if (option.classList.contains('multi-selected')) {
            option.classList.remove('multi-selected');
            option.setAttribute('aria-selected', 'false');
            selected.nics = selected.nics.filter((n) => n !== nicText);
        } else {
            option.classList.add('multi-selected');
            option.setAttribute('aria-selected', 'true');
            selected.nics.push(nicText);
        }
        clearB6IfNoNics();
        updateNicConfirmBtn();
        updateNote();
    };
}

/* ─── Tarjeta del NOC personalizado ya elegido (clic para editar) ─── */
function buildCustomNocCard() {
    const card = document.createElement('div');
    card.className = 'option option--custom selected';
    const h = document.createElement('h4');
    h.textContent = selected.nocNombre;
    const p = document.createElement('p');
    p.textContent = 'Resultado personalizado · clic para editar';
    card.append(h, p);
    return card;
}

/* ─── Abre el editor inline para definir un NOC personalizado ─── */
function openNocCustomForm(datos, prefill) {
    const slot = els.nocs.querySelector('.option--add, .option--custom');
    if (!slot) return;
    const form = buildCustomForm({
        placeholder: 'Escriba el resultado esperado (NOC)…',
        value: prefill || '',
        onCommit: (v) => {
            selected.noc = 'custom';
            selected.nocNombre = v;
            selected.nocCustom = true;
            loadNocs(datos);          // refresca: deselecciona predefinidos, muestra el custom
            proceedAfterNoc(datos);
        },
        onCancel: () => loadNocs(datos),
    });
    slot.replaceWith(form);
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

    // Slot personalizado: tarjeta del NOC custom elegido, o el "+ Otro resultado"
    els.nocs.appendChild(
        selected.nocCustom && selected.nocNombre
            ? buildCustomNocCard()
            : buildAddCard('Otro resultado (personalizado)')
    );
    setupOptionList(els.nocs, { stepNum: 5 });

    els.nocs.onclick = (e) => {
        if (e.target.closest('.custom-form')) return;           // clics dentro del editor
        const option = e.target.closest('.option');
        if (!option) return;

        if (option.classList.contains('option--add'))    { openNocCustomForm(datos, ''); return; }
        if (option.classList.contains('option--custom'))  { openNocCustomForm(datos, selected.nocNombre); return; }

        // NOC predefinido
        selected.noc = Number(option.dataset.noc);
        selected.nocNombre = nocs[selected.noc];
        selected.nocCustom = false;
        loadNocs(datos);          // refresca: marca el predefinido y restaura "+ Otro resultado"
        proceedAfterNoc(datos);
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

        const parsed = parseB6(escala[Number(option.dataset.nivel)]);
        selected.b6Puntuacion = parsed.puntuacion;
        selected.b6Descripcion = parsed.descripcion;

        collapseStep5();
        showMetaBlock(true);
        updateNote();
        // Continuar en la etapa global de Evaluación y entrega.
        activateFlowStage('faseF', { focus: true });
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
    feedback.setAttribute('aria-live', 'polite');
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
        if (e.key === 'Backspace' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            removeScaleRow(e.target.closest('.b6-cs-row'));
            return;
        }
        if ((e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.shiftKey || e.ctrlKey || e.metaKey) return;
        const inputs = [...list.querySelectorAll('.b6-cs-input')];
        const idx = inputs.indexOf(e.target);
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (idx > 0) inputs[idx - 1].focus();
            else document.getElementById('b6ScaleSelect')?.focus();
            return;
        }
        e.preventDefault();
        if (idx < inputs.length - 1) inputs[idx + 1].focus();
        else useBtn.focus();
    });
    [addBtn, useBtn].forEach((btn) => {
        btn.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowUp' || e.shiftKey || e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            const inputs = list.querySelectorAll('.b6-cs-input');
            inputs[inputs.length - 1]?.focus();
        });
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
function updateNote() {
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

    const now = new Date();
    const fecha = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
    const hora = now.toLocaleTimeString('es-CO', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

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

/* ─── Copia la nota (solo si está completa) ─── */
function copyNote() {
    const { complete } = isNoteComplete();
    if (!complete) { updateCopyBtnState(); return; }

    const text = noteToPlainText(els.noteContent);
    const showCopied = () => {
        [els.copyBtn, els.drawerCopyBtn].filter(Boolean).forEach((btn) => {
            btn.textContent = '✓ ¡Copiado!';
            btn.classList.add('copied');
        });
        setTimeout(() => {
            [els.copyBtn, els.drawerCopyBtn].filter(Boolean).forEach((btn) => {
                btn.textContent = 'Copiar nota';
                btn.classList.remove('copied');
            });
        }, 2000);
    };

    navigator.clipboard.writeText(text).then(() => {
        showCopied();
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showCopied();
    });
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
    toggleNote(false);
    if (sectionId === 'patient') {
        window.NotaCampos?.resetPhase('patient');
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

function openResetDialog(sectionId) {
    const label = RESET_SECTION_LABELS[sectionId];
    if (!label || !els.resetDialog) return;
    pendingResetSection = sectionId;
    if (els.resetDialogSectionName) els.resetDialogSectionName.textContent = label;
    if (els.resetSectionBtn) els.resetSectionBtn.textContent = `Reiniciar solo ${label}`;
    els.resetDialog.showModal();
    els.resetCancelBtn?.focus();
}

function resetWorkflow({ confirmed = false } = {}) {
    if (!confirmed && !window.confirm('¿Reiniciar toda la nota?\n\nEsta acción limpiará toda la información ingresada y permitirá comenzar nuevamente. No se puede deshacer.')) return;

    currentStep = 1;
    maxReachedStep = 1;
    patientGateUnlocked = false;
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

    STEPS.forEach((s) => {
        const stepEl = document.getElementById(`step${s.num}`);
        if (!stepEl) return;
        stepEl.classList.remove('completed', 'active');
        const summaryEl = stepEl.querySelector('.step-summary');
        if (summaryEl) summaryEl.textContent = '';
        const header = stepEl.querySelector('.step-header');
        if (header) {
            header.setAttribute('aria-expanded', 'false');
            header.setAttribute('tabindex', '-1');
        }
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
    // Listo para el siguiente paciente: foco en Sexo (inicio del flujo)
    focusSexo();
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
    chip.setAttribute('aria-keyshortcuts', 'Enter Shift+Backspace');

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
        els.findingsList.innerHTML = `<p class="empty-state">${q ? `Sin coincidencias en ${filtered}.` : `Escriba para buscar ${filtered}.`}</p>`;
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
            onRightEdge: (current) => {
                if (!els.dxLive || els.dxLive.hidden || !visibleOptions(els.reverseResults).length) return false;
                const currentRect = current.getBoundingClientRect();
                const panelRect = els.dxLive.getBoundingClientRect();
                if (panelRect.left <= currentRect.right) return false;
                return focusClosestOptionByVertical(current, els.reverseResults);
            },
        });
    }
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
    if (idx >= 0) reverse.findingKeys.splice(idx, 1);
    else reverse.findingKeys.push(key);
    renderFindings();
    renderReverseResults();   // el panel lateral se actualiza en vivo
    const restored = [...els.findingsList.querySelectorAll('.option')].find((o) => o.dataset.findingKey === key);
    if (restored) focusOption(restored, els.findingsList);
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
    opt.innerHTML = '<span class="check-mark">✓</span>';

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

    // Panel lateral (no es un paso): ↑/↓ recorre diagnósticos; ← vuelve a hallazgos
    results.slice(0, 40).forEach((r) => els.reverseResults.appendChild(createReverseDiagnosisOption(r, selectedCount)));
    setupOptionList(els.reverseResults, {
        multi: false,
        lockVerticalEdges: true,
        onLeftEdge: (current) => focusClosestRightOptionByVertical(current, els.findingsList),
        onRightEdge: (current) => { focusOption(current, els.reverseResults); return true; },
    });
}

function nextStepAfterReversePick(datos) {
    if (!selected.rc.length) return 3;
    if ((datos.ep || []).length && !selected.ep.length) return 4;
    return 5;
}

/* Elige un diagnóstico posible → pasa al flujo normal con RC/EP pre-rellenados */
function pickReverseDiagnosis(area, diag) {
    const datos = datosProPai[area]?.[diag];
    if (!datos) return;
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
    els.searchDiag.value = '';
    loadDiagnosticos(area);
    els.diagnosticos.querySelectorAll('.option').forEach((o) => o.classList.toggle('selected', o.dataset.diagnostico === diag));
    renderTransversales(datos);
    els.searchRc.value = ''; els.searchEp.value = ''; els.searchNic.value = '';
    loadRc(datos); loadEp(datos); loadNocs(datos);
    [3, 4, 5, 6, 7].forEach((nn) => document.getElementById(`step${nn}`)?.classList.remove('completed'));
    showMetaBlock(false);

    const nextStep = nextStepAfterReversePick(datos);
    maxReachedStep = Math.max(2, nextStep - 1);
    activateStep(nextStep, { focus: true });
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
    [2, 3, 4, 5, 6, 7].forEach((n) => document.getElementById(`step${n}`)?.classList.remove('completed'));
    maxReachedStep = 1;
    showMetaBlock(false);
    renderTransversales(null);
    updateNote();
}

/* Cambia de ruta desde la UI: resetea la identificación y reactiva el paso 1. */
function switchRoute(mode) {
    const target = (mode === 'reverse') ? 'reverse' : 'forward';
    if (reverse.mode === target) return;
    clearIdentification();
    setMode(target);
    activateStep(1, { focus: true });
}

/* Configura el control de ruta (teclado + clic), el filtro y el buscador de hallazgos */
function setupRouteSwitch() {
    const group = els.routeSwitch;
    if (group) {
        const btns = [...group.querySelectorAll('[role="radio"]')];
        group.addEventListener('click', (e) => {
            const b = e.target.closest('[role="radio"]');
            if (b) switchRoute(b.dataset.mode);
        });
        group.addEventListener('keydown', (e) => {
            const current = document.activeElement?.closest?.('[role="radio"]');
            if (!current) return;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                const idx = btns.indexOf(current);
                const nextIndex = idx + (e.key === 'ArrowRight' ? 1 : -1);
                if (nextIndex < 0 || nextIndex >= btns.length) return;
                e.preventDefault();
                const next = btns[nextIndex];
                switchRoute(next.dataset.mode);
                next.focus();
                return;
            }
            if (e.key === 'Enter' || e.key === 'ArrowDown') {
                e.preventDefault();
                switchRoute(current.dataset.mode);
                focusRouteSearch(current.dataset.mode);
                return;
            }
            if (e.key === ' ') {
                e.preventDefault();
                switchRoute(current.dataset.mode);
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
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const nextIndex = idx + (e.key === 'ArrowRight' ? 1 : -1);
            if (nextIndex < 0 || nextIndex >= filterBtns.length) return;
            e.preventDefault();
            const next = filterBtns[nextIndex];
            setFindingKindFilter(next.dataset.filter);
            next.focus();
            return;
        }
        if ((e.key === 'Enter' || e.key === 'ArrowDown') && current) {
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
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusRouteSwitch();
        }
    });

    els.searchFindings?.addEventListener('input', renderFindings);
    els.searchFindings?.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && reverse.findingKeys.length) {
            e.preventDefault();
            toggleReverseFinding(reverse.findingKeys[reverse.findingKeys.length - 1]);
            return;
        }
        if (e.key.startsWith('Arrow') && (e.shiftKey || e.ctrlKey || e.metaKey)) return;  // atajos globales
        if (e.key === 'Enter') {
            if (e.shiftKey && reverse.findingKeys.length) {
                e.preventDefault();
                confirmFindings();
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
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusFindingKindFilter();
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
        if (!chip || e.key !== 'Backspace' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        toggleReverseFinding(chip.dataset.findingKey);
        els.searchFindings?.focus();
    });
    const pickReverseResultFromEvent = (e) => {
        const option = e.target.closest('.option');
        if (!option || option.style.display === 'none' || !option.dataset.diag) return;
        pickReverseDiagnosis(option.dataset.area, option.dataset.diag);
    };
    els.reverseResults?.addEventListener('click', pickReverseResultFromEvent);
}

/* ─── Inicializa la app ─── */
function init() {
    // Verificación de integridad: cada área del catálogo debe existir en datosProPai
    NOTA_AREAS.forEach((a) => {
        if (!datosProPai[a.key]) console.warn(`[CareFlow] Condición clínica sin datos PAE: "${a.key}"`);
    });

    // Campos clínicos (fases A–F): comboboxes, estados, escalas, dispositivos,
    // regiones y educación. La condición clínica se elige dentro del PAE.
    window.NotaCampos?.init({
        onChange: updateNote,
    });
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
    setupConfirmButtonNavigation();
    setMode('forward');   // estado inicial coherente de los cuerpos de ruta

    // Buscadores: escribir filtra; Enter o ↓ entran a la lista; ↑ sale a la sección
    // anterior. Shift+flechas (saltos) se manejan en el handler global.
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

    // Observaciones: Shift+Enter revisa la nota aunque el campo opcional esté vacío;
    // Ctrl/⌘+Enter conserva el acceso rápido a Copiar nota.
    // ↑ en la 1ª línea vuelve a Estado de la meta (corregirla sin usar el mouse)
    els.otrosComentarios?.addEventListener('input', updateNote);
    els.otrosComentarios?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            continueFlowStage('faseF');
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (!els.copyBtn?.disabled) { els.copyBtn.focus(); scrollSoft(els.copyBtn); }
        } else if (e.key === 'ArrowUp' && !e.shiftKey) {
            const ta = els.otrosComentarios;
            const beforeCursor = ta.value.slice(0, ta.selectionStart);
            if (!beforeCursor.includes('\n')) {
                e.preventDefault();
                scrollSoft(els.metaBlock);
                focusMeta();
            }
        }
    });

    // Botones confirmar de RC y EP
    els.rcConfirmBtn?.addEventListener('click', proceedAfterRc);
    els.epConfirmBtn?.addEventListener('click', proceedAfterEp);

    // Botón confirmar NICs → carga B6 y avanza
    els.nicConfirmBtn?.addEventListener('click', () => {
        if (selected.nics.length === 0) return;
        loadEvaluaciones(selected.datosDiag, selected.nocNombre);
        activateStep(7, { focus: true });
    });

    // Toggle nota
    els.noteToggleBtn?.addEventListener('click', toggleNote);
    els.noteDrawerClose?.addEventListener('click', () => toggleNote(false));
    els.noteDrawerScrim?.addEventListener('click', () => toggleNote(false));

    // Botones de acción
    document.getElementById('copyBtn')?.addEventListener('click', copyNote);
    els.drawerCopyBtn?.addEventListener('click', copyNote);
    document.querySelectorAll('[data-reset-section]').forEach((button) => {
        button.addEventListener('click', () => openResetDialog(button.dataset.resetSection));
    });
    els.resetCancelBtn?.addEventListener('click', () => els.resetDialog?.close());
    els.resetSectionBtn?.addEventListener('click', () => {
        const sectionId = pendingResetSection;
        els.resetDialog?.close();
        if (sectionId) resetCurrentSection(sectionId);
    });
    els.resetAllBtn?.addEventListener('click', () => {
        els.resetDialog?.close();
        resetWorkflow({ confirmed: true });
    });
    els.resetDialog?.addEventListener('click', (e) => {
        if (e.target !== els.resetDialog) return;
        const rect = els.resetDialog.getBoundingClientRect();
        const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
        if (!inside) els.resetDialog.close();
    });
    els.resetDialog?.addEventListener('close', () => { pendingResetSection = null; });

    document.addEventListener('focusin', (e) => {
        const id = currentSectionId();
        if (id != null) rememberLogicalSection(id);
        const inReverseFields = e.target?.closest?.('#step1 [data-route="reverse"]');
        const inDiagnosisPanel = e.target?.closest?.('#dxLive');
        const nextContext = !!(inReverseFields || inDiagnosisPanel);
        if (nextContext !== reversePanelContext) {
            reversePanelContext = nextContext;
            updateLayout();
        }
    });

    // Shift+Enter: continuar desde la sección actual de forma consistente.
    document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented || e.key !== 'Enter' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        if (document.activeElement?.closest?.('.custom-form')) return;
        if (activeFlowStage !== 'fasePAE') {
            if (continueFlowStage(activeFlowStage)) {
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }
        if (advanceCurrentSectionByShortcut()) {
            e.preventDefault();
            e.stopPropagation();
        }
    });

    // Las flechas relacionan controles por su posición visual dentro de la etapa visible.
    document.addEventListener('keydown', handleSpatialArrow);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && noteVisible) {
            e.preventDefault();
            toggleNote(false);
            return;
        }
        if (e.key !== 'Tab' || !noteVisible || !els.noteSection) return;
        const focusable = [...els.noteSection.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
            .filter((el) => el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    // Escritura directa: desde cualquier control de una sección, texto/borrado entra al buscador de esa sección.
    document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
        const isDeleteKey = e.key === 'Backspace' || e.key === 'Delete';
        const isSearchChar = e.key !== '/' && e.key.length === 1 && !!e.key.trim();
        if (isDeleteKey && e.shiftKey) return;       // reservado para eliminación contextual
        if (!isSearchChar && !isDeleteKey) return;
        const active = document.activeElement;
        if (isEditableElement(active)) return;
        if (active?.closest?.('.custom-form')) return;
        const sectionId = activeLogicalSectionId();
        const box = searchForActiveSection(active);
        if (box) {
            if (isDeleteKey && !box.value) return;
            e.preventDefault();
            e.stopPropagation();
            if (isDeleteKey) sendDeleteToSectionSearch(e.key, box);
            else {
                resetSectionTypeahead();
                sendCharToSectionSearch(e.key, box);
            }
            return;
        }
        if (isSearchChar && runSectionTypeahead(e.key, sectionId)) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // Atajo "/": enfoca el buscador del paso activo (sin interrumpir escritura)
    document.addEventListener('keydown', (e) => {
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
        if (isEditableElement(document.activeElement)) return;
        const box = reverse.mode === 'reverse'
            ? els.searchFindings
            : { 1: els.searchAreas, 2: els.searchDiag, 3: els.searchRc, 4: els.searchEp, 6: els.searchNic }[currentStep];
        if (box) { e.preventDefault(); box.focus(); box.select?.(); }
    });

    // Recalcular techo del panel al redimensionar la ventana
    window.addEventListener('resize', () => {
        syncNotePanelHeight();
        syncDxLiveOffset();
    });

    // Listo para empezar: enfocar el primer chip de Sexo
    document.getElementById('sexoSeg')?.querySelector('[role="radio"]')?.focus();
}

init();
