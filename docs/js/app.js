const datosProPai = window.datosProPai;

const TOTAL_STEPS = 5;
let currentStep = 1;
let noteVisible = false;  // La nota empieza oculta

const selected = {
    area: null,
    areaNombre: null,
    diagnostico: null,
    diagnosticoNombre: null,
    datosDiag: null,
    nics: [],
    noc: null,
    nocNombre: null,
    b6Puntuacion: null,
    b6Descripcion: null,
};

const els = {
    progressFill:   document.getElementById('progressFill'),
    progressLabel:  document.getElementById('progressLabel'),
    areas:          document.getElementById('areas'),
    diagnosticos:   document.getElementById('diagnosticos'),
    intervenciones: document.getElementById('intervenciones'),
    nocs:           document.getElementById('nocs'),
    evaluaciones:   document.getElementById('evaluaciones'),
    transversales:  document.getElementById('transversales'),
    noteContent:    document.getElementById('noteContent'),
    noteStatus:     document.getElementById('noteStatus'),
    noteToggleBtn:  document.getElementById('noteToggleBtn'),
    copyBtn:        document.getElementById('copyBtn'),
    nicConfirmBtn:  document.getElementById('nicConfirmBtn'),
    nicConfirmHint: document.getElementById('nicConfirmHint'),
    searchDiag:     document.getElementById('searchDiag'),
    searchNic:      document.getElementById('searchNic'),
    servicio:       document.getElementById('servicio'),
    sexo:           document.getElementById('sexo'),
    dobDia:         document.getElementById('dobDia'),
    dobMes:         document.getElementById('dobMes'),
    dobAnio:        document.getElementById('dobAnio'),
    dobFeedback:    document.getElementById('dobFeedback'),
    metaLograda:       document.getElementById('metaLograda'),
    metaBlock:         document.getElementById('metaBlock'),
    otrosComentarios:  document.getElementById('otrosComentarios'),
};

/* ─── Etiquetas de paso para el label de progreso ─── */
const STEP_LABELS = {
    1: 'Condiciones clínicas',
    2: 'Diagnóstico (NANDA)',
    3: 'Resultado esperado (NOC)',
    4: 'Intervenciones NIC',
    5: 'Evaluación B6',
};

/* ─── ¿El paso tiene selección válida? ─── */
function stepHasSelection(n) {
    switch (n) {
        case 1: return selected.area !== null;
        case 2: return selected.diagnostico !== null;
        case 3: return selected.noc !== null;
        case 4: return selected.nics.length > 0;
        case 5: return selected.b6Puntuacion !== null;
        default: return false;
    }
}

/* ─── Texto resumen corto para el header del paso completado ─── */
function getSummaryForStep(n) {
    switch (n) {
        case 1:
            return selected.areaNombre || '';
        case 2: {
            const d = selected.diagnosticoNombre || '';
            return d.length > 52 ? d.slice(0, 52) + '…' : d;
        }
        case 3: {
            const n3 = selected.nocNombre || '';
            return n3.length > 48 ? n3.slice(0, 48) + '…' : n3;
        }
        case 4: {
            const c = selected.nics.length;
            return c === 1 ? '1 NIC seleccionada' : `${c} NIC seleccionadas`;
        }
        case 5:
            if (!selected.b6Puntuacion) return '';
            // Extraer solo la etiqueta descriptiva (ej: "Severamente comprometido")
            const raw = selected.b6Descripcion || '';
            const label = raw.replace(/^\d+\s*[\.\-]\s*/, '');
            return `Nivel ${selected.b6Puntuacion} — ${label}`;
        default: return '';
    }
}

/* ─── Actualiza los resúmenes en headers de pasos completados ─── */
function updateStepSummaries() {
    for (let n = 1; n <= TOTAL_STEPS; n++) {
        const stepEl = document.getElementById(`step${n}`);
        if (!stepEl) continue;
        const summaryEl = stepEl.querySelector('.step-summary');
        if (!summaryEl) continue;
        summaryEl.textContent = stepEl.classList.contains('completed')
            ? getSummaryForStep(n)
            : '';
    }
}

/* ─── Actualiza barra de progreso y label textual ─── */
function updateProgress() {
    let pct = ((currentStep - 1) / TOTAL_STEPS) * 100;
    if (selected.b6Puntuacion) pct = 100;
    els.progressFill.style.width = `${pct}%`;

    if (els.progressLabel) {
        els.progressLabel.textContent = selected.b6Puntuacion
            ? 'Flujo completado ✓'
            : `Paso ${currentStep} de ${TOTAL_STEPS} — ${STEP_LABELS[currentStep] || ''}`;
    }
}

/* ─── Activa un paso y marca como completados los anteriores con selección válida ─── */
function activateStep(n) {
    for (let i = 1; i <= TOTAL_STEPS; i++) {
        const stepEl = document.getElementById(`step${i}`);
        if (!stepEl) continue;
        const header = stepEl.querySelector('.step-header');

        stepEl.classList.remove('active');

        if (i < n && stepHasSelection(i)) {
            stepEl.classList.add('completed');
            if (header) {
                header.setAttribute('aria-expanded', 'false');
                header.setAttribute('tabindex', '0');
            }
        } else if (i === n) {
            stepEl.classList.remove('completed');
            if (header) {
                header.setAttribute('aria-expanded', 'true');
                header.setAttribute('tabindex', '0');
            }
        } else {
            if (!stepHasSelection(i)) stepEl.classList.remove('completed');
            if (header) {
                header.setAttribute('aria-expanded', 'false');
                header.setAttribute('tabindex', '-1');
            }
        }
    }

    document.getElementById(`step${n}`)?.classList.add('active');
    currentStep = n;
    updateProgress();
    updateStepSummaries();

    // Al volver al paso 4, refrescar el estado del botón de confirmación de NICs
    if (n === 4) updateNicConfirmBtn();

    syncNotePanelHeight();
}

/* ─── Fecha de nacimiento: helpers ─── */
const MES_NOMBRES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                     'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

function getDaysInMonth(mes, anio) {
    if (mes === 2) return isLeapYear(anio) ? 29 : 28;
    return [4, 6, 9, 11].includes(mes) ? 30 : 31;
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
    const diaStr  = els.dobDia?.value.trim()  ?? '';
    const mesStr  = els.dobMes?.value.trim()  ?? '';
    const anioStr = els.dobAnio?.value.trim() ?? '';

    if (!diaStr && !mesStr && !anioStr) return { valid: false, ageText: '', errorMsg: '' };

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (diaStr) {
        const d = parseInt(diaStr, 10);
        if (isNaN(d) || d < 1 || d > 31) return { valid: false, ageText: '', errorMsg: 'Día inválido: debe ser entre 1 y 31' };
    }
    if (mesStr) {
        const m = parseInt(mesStr, 10);
        if (isNaN(m) || m < 1 || m > 12) return { valid: false, ageText: '', errorMsg: 'Mes inválido: debe ser entre 1 y 12' };
    }
    if (anioStr) {
        const a = parseInt(anioStr, 10);
        if (isNaN(a) || a < 1900)         return { valid: false, ageText: '', errorMsg: `Año inválido: debe ser entre 1900 y ${today.getFullYear()}` };
        if (a > today.getFullYear())       return { valid: false, ageText: '', errorMsg: 'El año no puede ser futuro' };
    }

    if (!diaStr || !mesStr || !anioStr) return { valid: false, ageText: '', errorMsg: '' };

    const dia  = parseInt(diaStr,  10);
    const mes  = parseInt(mesStr,  10);
    const anio = parseInt(anioStr, 10);
    const maxDias = getDaysInMonth(mes, anio);

    if (dia > maxDias) {
        return { valid: false, ageText: '', errorMsg: `Fecha inválida: ${MES_NOMBRES[mes]} de ${anio} tiene ${maxDias} días` };
    }

    const birth = new Date(anio, mes - 1, dia);
    if (birth.getFullYear() !== anio || birth.getMonth() !== mes - 1 || birth.getDate() !== dia) {
        return { valid: false, ageText: '', errorMsg: 'Fecha inválida' };
    }
    if (birth > todayStart) {
        return { valid: false, ageText: '', errorMsg: 'La fecha de nacimiento no puede ser futura' };
    }

    return { valid: true, ageText: calcAgeText(birth, todayStart), errorMsg: '' };
}

/* Actualiza el estado de error del DOB y propaga cambios.
   La edad válida NO se muestra aquí — solo aparece en la nota generada. */
function onDobChange() {
    const result = validateDOB();
    const fb     = els.dobFeedback;

    // Limpiar error en los tres campos
    [els.dobDia, els.dobMes, els.dobAnio].forEach(f => f?.classList.remove('dob-field-error'));

    if (result.errorMsg) {
        // Marcar solo el campo afectado (o todos si es un error de combinación)
        if      (result.errorMsg.includes('Día'))        els.dobDia?.classList.add('dob-field-error');
        else if (result.errorMsg.includes('Mes'))        els.dobMes?.classList.add('dob-field-error');
        else if (/[Aa]ño/.test(result.errorMsg))         els.dobAnio?.classList.add('dob-field-error');
        else [els.dobDia, els.dobMes, els.dobAnio].forEach(f => f?.classList.add('dob-field-error'));

        if (fb) { fb.textContent = result.errorMsg; fb.className = 'dob-feedback error'; }
    } else {
        if (fb) { fb.textContent = ''; fb.className = 'dob-feedback'; }
    }

    updateNote();
    syncNotePanelHeight();
}

/* Configura navegación por teclado, auto-avance y formato de los campos DOB */
function setupDobNavigation() {
    const dia  = els.dobDia;
    const mes  = els.dobMes;
    const anio = els.dobAnio;
    const serv = els.servicio;
    if (!dia || !mes || !anio) return;

    // Filtrar a solo dígitos
    [dia, mes, anio].forEach(f => {
        f.addEventListener('input', e => {
            const clean = e.target.value.replace(/\D/g, '');
            if (e.target.value !== clean) e.target.value = clean;
        });
    });

    // Auto-formato: agregar cero a la izquierda al salir del campo (ej: "5" → "05")
    [[dia, 31], [mes, 12]].forEach(([field, max]) => {
        field.addEventListener('blur', () => {
            const v = parseInt(field.value, 10);
            if (!isNaN(v) && v >= 1 && v <= max) {
                field.value = String(v).padStart(2, '0');
            }
            onDobChange();
        });
    });

    // Auto-avance al completar DD o MM, solo si el valor es válido
    function autoAdvance(from, to, maxLen, maxVal) {
        from.addEventListener('input', () => {
            if (from.value.length >= maxLen) {
                const v = parseInt(from.value, 10);
                if (!isNaN(v) && v >= 1 && v <= maxVal) {
                    to.focus();
                    to.setSelectionRange(0, to.value.length);
                }
            }
            onDobChange();
        });
    }
    autoAdvance(dia, mes, 2, 31);
    autoAdvance(mes, anio, 2, 12);
    anio.addEventListener('input', () => {
        onDobChange();
        if (anio.value.length === 4 && validateDOB().valid) {
            serv?.focus();
            serv?.setSelectionRange?.(0, serv.value.length);
        }
    });

    // Enter / ArrowRight / ArrowLeft para moverse entre los campos DOB
    const chain = [dia, mes, anio];
    chain.forEach((field, idx) => {
        const prev = idx > 0 ? chain[idx - 1] : null;
        const next = idx < chain.length - 1 ? chain[idx + 1] : serv;

        field.addEventListener('keydown', e => {
            const atEnd   = field.selectionStart === field.value.length;
            const atStart = field.selectionStart === 0;

            if (e.key === 'Enter' || (e.key === 'ArrowRight' && atEnd)) {
                e.preventDefault();
                if (next) { next.focus(); next.setSelectionRange?.(0, next.value.length); }
            } else if (e.key === 'ArrowLeft' && atStart) {
                e.preventDefault();
                if (prev) { prev.focus(); prev.setSelectionRange(prev.value.length, prev.value.length); }
            }
        });
    });

    // Navegación de vuelta: ArrowLeft desde Servicio/Unidad → campo Año
    serv?.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft' && serv.selectionStart === 0) {
            e.preventDefault();
            anio.focus();
            anio.setSelectionRange(anio.value.length, anio.value.length);
        }
    });
}

/* ─── Ajusta el techo del panel de nota al alto real del workflow ─── */
function syncNotePanelHeight() {
    const workflow     = document.querySelector('.workflow');
    const noteSection  = document.querySelector('.note-section');
    const noteHeader   = document.querySelector('.note-panel-header');
    const noteContent  = document.getElementById('noteContent');
    const transList    = document.getElementById('transversales');
    if (!workflow || !noteSection) return;

    const workflowH  = workflow.offsetHeight;
    const viewportH  = window.innerHeight;
    // Techo externo: mínimo entre alto del workflow y viewport menos padding del body (sp-8 * 2 = 64px)
    const outerMax   = Math.min(workflowH, viewportH - 64);

    noteSection.style.maxHeight = outerMax + 'px';

    // Techo interno para el elemento con scroll:
    // outerMax − alto del header del panel − padding del body (sp-4 + sp-5 + sp-3 gap = 48px)
    const headerH    = noteHeader ? noteHeader.offsetHeight : 50;
    const innerMax   = outerMax - headerH - 48;

    if (innerMax > 60) {
        if (noteContent) noteContent.style.maxHeight = innerMax + 'px';
        if (transList)   transList.style.maxHeight   = innerMax + 'px';
    }
}

/* ─── Muestra u oculta el bloque de estado de meta ─── */
function showMetaBlock(visible) {
    if (!els.metaBlock) return;
    els.metaBlock.hidden = !visible;
    syncNotePanelHeight();
}

/* ─── Colapsa el paso 5 sin avanzar a un paso inexistente ─── */
function collapseStep5() {
    const step5El = document.getElementById('step5');
    if (!step5El) return;
    step5El.classList.add('completed');
    step5El.classList.remove('active');
    const header = step5El.querySelector('.step-header');
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
    for (let n = 1; n <= TOTAL_STEPS; n++) {
        const stepEl = document.getElementById(`step${n}`);
        if (!stepEl) continue;
        const header = stepEl.querySelector('.step-header');
        if (!header) continue;

        const handleNav = () => {
            if (!stepEl.classList.contains('completed')) return;
            activateStep(n);
        };

        header.addEventListener('click', handleNav);
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleNav();
            }
        });
    }
}

/* ─── Actualiza estado del botón de confirmación de NICs ─── */
function updateNicConfirmBtn() {
    const count = selected.nics.length;
    if (!els.nicConfirmBtn) return;

    if (count === 0) {
        els.nicConfirmBtn.disabled = true;
        if (els.nicConfirmHint) els.nicConfirmHint.textContent = 'Seleccione al menos una intervención';
    } else {
        els.nicConfirmBtn.disabled = false;
        const txt = count === 1 ? '1 intervención seleccionada' : `${count} intervenciones seleccionadas`;
        if (els.nicConfirmHint) els.nicConfirmHint.textContent = txt;
    }
}

/* ─── Toggle de visibilidad de la nota clínica ─── */
function toggleNote() {
    noteVisible = !noteVisible;

    if (noteVisible) {
        els.noteContent.hidden = false;
        els.transversales.hidden = true;
        if (els.noteToggleBtn) {
            els.noteToggleBtn.textContent = 'Ocultar nota';
            els.noteToggleBtn.setAttribute('aria-expanded', 'true');
            els.noteToggleBtn.classList.add('active');
        }
    } else {
        els.noteContent.hidden = true;
        els.transversales.hidden = false;
        if (els.noteToggleBtn) {
            els.noteToggleBtn.textContent = 'Ver nota';
            els.noteToggleBtn.setAttribute('aria-expanded', 'false');
            els.noteToggleBtn.classList.remove('active');
        }
    }
}

/* ─── Verifica si los datos del paciente están completos y válidos ─── */
function isPatientDataComplete() {
    if (!els.sexo || els.sexo.value === '___') return false;
    if (!validateDOB().valid) return false;
    if (!els.servicio || els.servicio.value.trim() === '') return false;
    return true;
}

/* ─── Bloquea/desbloquea el paso 1 según datos del paciente ─── */
function updateStep1Lock() {
    const step1El = document.getElementById('step1');
    if (!step1El) return;
    const locked = !isPatientDataComplete();
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

/* ─── Verifica si la nota está completa ─── */
function isNoteComplete() {
    const missing = [];

    if (!els.sexo || els.sexo.value === '___')            missing.push('Sexo del paciente');
    if (!validateDOB().valid)                             missing.push('Fecha de nacimiento válida');
    if (!els.servicio || els.servicio.value.trim() === '') missing.push('Servicio / Unidad');
    if (!selected.area)         missing.push('Condiciones clínicas (Paso 1)');
    if (!selected.diagnostico)  missing.push('Diagnóstico (Paso 2)');
    if (selected.noc === null)  missing.push('Resultado NOC (Paso 3)');
    if (!selected.nics.length)  missing.push('Al menos 1 intervención NIC (Paso 4)');
    if (!selected.b6Puntuacion) missing.push('Evaluación B6 (Paso 5)');
    if (!els.metaLograda?.value) missing.push('Estado de la meta al cierre del turno');

    return { complete: missing.length === 0, missing };
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

    // Mostrar/ocultar el botón "Ver nota" según completitud
    if (els.noteToggleBtn) {
        const wasHidden = els.noteToggleBtn.hidden;
        els.noteToggleBtn.hidden = !complete;
        if (complete && wasHidden) {
            // Aparece por primera vez: animar
            els.noteToggleBtn.classList.remove('note-toggle-btn--ready');
            void els.noteToggleBtn.offsetWidth;
            els.noteToggleBtn.classList.add('note-toggle-btn--ready');
            const cleanAnim = (e) => {
                if (e.target !== els.noteToggleBtn) return;
                els.noteToggleBtn.classList.remove('note-toggle-btn--ready');
                els.noteToggleBtn.removeEventListener('animationend', cleanAnim);
            };
            els.noteToggleBtn.addEventListener('animationend', cleanAnim);
            setTimeout(() => triggerBtnBurst(els.noteToggleBtn), 190);
        }
        if (!complete && noteVisible) {
            // Si la nota estaba visible y la completitud se pierde, ocultarla
            noteVisible = true; // toggleNote() lo invierte
            toggleNote();
        }
    }

    updateStep1Lock();
}

/* ─── Crea una tarjeta de opción ─── */
function createOption(title, desc, dataset = {}) {
    const div = document.createElement('div');
    div.className = 'option';
    Object.entries(dataset).forEach(([k, v]) => { div.dataset[k] = v; });
    div.innerHTML = `<span class="check-mark">✓</span><h4>${title}</h4>${desc ? `<p>${desc}</p>` : ''}`;
    return div;
}

/* ─── Filtra opciones por búsqueda ─── */
function filterOptions(container, query) {
    const q = query.toLowerCase().trim();
    container.querySelectorAll('.option').forEach((opt) => {
        opt.style.display = !q || opt.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}

/* ─── Renderiza intervenciones transversales ─── */
function renderTransversales(datos) {
    const trans = datos?.trans || [];
    if (!trans.length) {
        els.transversales.innerHTML = '<p class="empty-state">Seleccione un diagnóstico para ver intervenciones transversales.</p>';
        return;
    }
    els.transversales.innerHTML = `<strong>Intervenciones transversales (automáticas):</strong><ul>${trans.map((t) => `<li>${t}</li>`).join('')}</ul>`;
}

/* ─── Carga áreas / condiciones clínicas ─── */
function loadAreas() {
    els.areas.innerHTML = '';
    Object.keys(datosProPai).forEach((area) => {
        const count = Object.keys(datosProPai[area]).length;
        const opt = createOption(area, `${count} diagnóstico(s) de enfermería`, { area });
        els.areas.appendChild(opt);
    });

    els.areas.onclick = (e) => {
        if (!isPatientDataComplete()) return;
        const option = e.target.closest('.option');
        if (!option) return;

        els.areas.querySelectorAll('.option').forEach((o) => o.classList.remove('selected'));
        option.classList.add('selected');

        selected.area = option.dataset.area;
        selected.areaNombre = selected.area;
        selected.diagnostico = null; selected.diagnosticoNombre = null;
        selected.datosDiag = null; selected.nics = [];
        selected.noc = null; selected.nocNombre = null;
        selected.b6Puntuacion = null; selected.b6Descripcion = null;

        [2, 3, 4, 5].forEach(n => document.getElementById(`step${n}`)?.classList.remove('completed'));
        showMetaBlock(false);

        els.searchDiag.value = '';
        loadDiagnosticos(selected.area);
        activateStep(2);
        renderTransversales(null);
        updateNote();
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

    els.diagnosticos.onclick = (e) => {
        const option = e.target.closest('.option');
        if (!option || option.style.display === 'none') return;

        els.diagnosticos.querySelectorAll('.option').forEach((o) => o.classList.remove('selected'));
        option.classList.add('selected');

        selected.diagnostico = option.dataset.diagnostico;
        selected.diagnosticoNombre = selected.diagnostico;
        selected.datosDiag = diagnosticos[selected.diagnostico];
        selected.nics = []; selected.noc = null; selected.nocNombre = null;
        selected.b6Puntuacion = null; selected.b6Descripcion = null;

        [3, 4, 5].forEach(n => document.getElementById(`step${n}`)?.classList.remove('completed'));
        showMetaBlock(false);

        els.searchNic.value = '';
        renderTransversales(selected.datosDiag);
        loadNocs(selected.datosDiag);
        activateStep(3);
        updateNote();
    };
}

/* ─── Carga intervenciones NIC (multi-select con botón de confirmación) ─── */
function loadIntervenciones(datos) {
    els.intervenciones.innerHTML = '';
    const nics = datos.nic || [];
    updateNicConfirmBtn();  // Resetear botón de confirmación

    if (!nics.length) {
        els.intervenciones.innerHTML = '<p class="empty-state">Sin intervenciones NIC registradas.</p>';
        return;
    }

    nics.forEach((nic, i) => {
        const opt = createOption(nic, 'Clic para seleccionar / deseleccionar', { nic: String(i) });
        els.intervenciones.appendChild(opt);
    });

    // Restaurar estado visual de NICs ya seleccionados (al volver al paso 3)
    if (selected.nics.length > 0) {
        els.intervenciones.querySelectorAll('.option').forEach((opt, i) => {
            if (selected.nics.includes(nics[i])) opt.classList.add('multi-selected');
        });
    }

    els.intervenciones.onclick = (e) => {
        const option = e.target.closest('.option');
        if (!option || option.style.display === 'none') return;

        const idx = Number(option.dataset.nic);
        const nicText = nics[idx];

        if (option.classList.contains('multi-selected')) {
            option.classList.remove('multi-selected');
            selected.nics = selected.nics.filter((n) => n !== nicText);
        } else {
            option.classList.add('multi-selected');
            selected.nics.push(nicText);
        }

        // Si se desmarcan todos los NICs, limpiar paso 5 (B6)
        if (selected.nics.length === 0) {
            selected.b6Puntuacion = null; selected.b6Descripcion = null;
            els.evaluaciones.innerHTML = '';
            showMetaBlock(false);
            document.getElementById('step5')?.classList.remove('completed', 'active');
        }

        updateNicConfirmBtn();
        updateNote();
    };
}

/* ─── Carga resultados NOC ─── */
function loadNocs(datos) {
    els.nocs.innerHTML = '';
    const nocs = datos.noc || [];

    nocs.forEach((noc, i) => {
        const escala = datos.b6_por_noc?.[noc];
        const opt = createOption(noc, escala ? `Escala B6: ${escala.length} niveles` : '', { noc: String(i) });
        els.nocs.appendChild(opt);
    });

    // Restaurar selección previa si existe
    if (selected.noc !== null) {
        const prevOpt = els.nocs.querySelectorAll('.option')[selected.noc];
        prevOpt?.classList.add('selected');
    }

    els.nocs.onclick = (e) => {
        const option = e.target.closest('.option');
        if (!option) return;

        els.nocs.querySelectorAll('.option').forEach((o) => o.classList.remove('selected'));
        option.classList.add('selected');

        const idx = Number(option.dataset.noc);
        selected.noc = idx;
        selected.nocNombre = nocs[idx];
        selected.nics = [];
        selected.b6Puntuacion = null;
        selected.b6Descripcion = null;

        [4, 5].forEach(n => document.getElementById(`step${n}`)?.classList.remove('completed'));
        showMetaBlock(false);

        els.searchNic.value = '';
        loadIntervenciones(datos);
        activateStep(4);
        updateNote();
    };
}

/* ─── Parsea nivel B6 ─── */
function parseB6(nivel) {
    const m = nivel.trim().match(/^(\d+)\s*[\.\-]\s*(.+)$/);
    return m ? { puntuacion: m[1], descripcion: nivel.trim() } : { puntuacion: '', descripcion: nivel.trim() };
}

/* ─── Carga evaluaciones B6 ─── */
function loadEvaluaciones(datos, nocNombre) {
    els.evaluaciones.innerHTML = '';
    const niveles = datos.b6_por_noc?.[nocNombre] || [];

    if (!niveles.length) {
        els.evaluaciones.innerHTML = '<p class="empty-state">Sin escala B6 para este NOC.</p>';
        updateNote();
        return;
    }

    niveles.forEach((nivel, i) => {
        const { puntuacion, descripcion } = parseB6(nivel);
        const opt = createOption(`Nivel ${puntuacion}`, descripcion, { nivel: String(i) });
        els.evaluaciones.appendChild(opt);
    });

    els.evaluaciones.onclick = (e) => {
        const option = e.target.closest('.option');
        if (!option) return;

        els.evaluaciones.querySelectorAll('.option').forEach((o) => o.classList.remove('selected'));
        option.classList.add('selected');

        const idx = Number(option.dataset.nivel);
        const parsed = parseB6(niveles[idx]);
        selected.b6Puntuacion = parsed.puntuacion;
        selected.b6Descripcion = parsed.descripcion;

        // Colapsar paso 5 y mostrar bloque de meta
        collapseStep5();
        showMetaBlock(true);

        updateNote();
    };
}

/* ─── Obtiene el valor del estado de meta ─── */
function getMetaLograda() {
    return els.metaLograda?.value || '___';
}

/* ─── Genera y actualiza la nota de enfermería ─── */
function updateNote() {
    const hasData = selected.areaNombre || selected.diagnosticoNombre;

    if (!hasData) {
        els.noteContent.innerHTML =
            '<p class="empty-state">Seleccione el área clínica, diagnóstico e intervenciones para generar la nota de enfermería según el Plan de Atención Integral (PAI).</p>';
        updateCopyBtnState();
        return;
    }

    const now = new Date();
    const fecha = now.toLocaleDateString('es-CO');
    const hora = now.toLocaleTimeString('es-CO', { hour12: false });

    const sexo       = els.sexo?.value || '___';
    const dobResult  = validateDOB();
    const edadTexto  = dobResult.valid ? dobResult.ageText : '___';
    const servicio   = els.servicio?.value?.trim() || '_______________';
    const metaEstado = getMetaLograda();

    const nicsHtml = selected.nics.length
        ? `<ul>${selected.nics.map((n) => `<li>${n}</li>`).join('')}</ul>`
        : '<em>Pendiente de selección</em>';

    const trans = selected.datosDiag?.trans || [];
    const transHtml = trans.length
        ? `<ul>${trans.map((t) => `<li>${t}</li>`).join('')}</ul>`
        : '';

    let note = `<strong>Fecha:</strong> ${fecha} &nbsp; <strong>Hora:</strong> ${hora}<br><br>`;
    note += `<strong>Fundación Clínica Santa Fe de Bogotá</strong><br><br>`;
    note += `Recibo paciente <strong>${sexo}</strong>, de <strong>${edadTexto}</strong> de edad, `;
    note += `quien se encuentra en el servicio de <strong>${servicio}</strong>, `;
    note += `correspondiente al área clínica de <strong>${selected.areaNombre || '___________'}</strong>. `;
    note += `Al momento de la valoración de enfermería según PAI, se prioriza el diagnóstico `;
    note += `<strong>${selected.diagnosticoNombre || '______________'}</strong>. `;

    if (selected.nocNombre) {
        note += `Se establece como resultado esperado (NOC): <strong>${selected.nocNombre}</strong>. `;
    }

    note += `<br><br><strong>Intervenciones NIC implementadas:</strong><br>${nicsHtml}`;

    if (transHtml) {
        note += `<br><strong>Intervenciones transversales:</strong><br>${transHtml}`;
    }

    if (selected.b6Puntuacion && selected.nocNombre) {
        note += `<br><strong>Evaluación del turno — Indicador B6</strong> para «${selected.nocNombre}»: `;
        note += `puntuación <strong>${selected.b6Puntuacion}</strong> — ${selected.b6Descripcion}. `;
    }

    note += `<br><br>Dadas estas intervenciones y al finalizar el turno, se evaluó la meta del cuidado, `;
    note += `la cual se encuentra <strong>${metaEstado}</strong>.`;

    // Observaciones adicionales (campo opcional)
    const comentarios = els.otrosComentarios?.value.trim();
    if (comentarios) {
        note += `<br><br><strong>Observaciones adicionales:</strong><br>${comentarios}`;
    }

    els.noteContent.innerHTML = note;
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
        if (tag === 'UL' || tag === 'OL') return '\n' + children;
        if (tag === 'P') return children + '\n';
        return children;
    }
    return extract(el).replace(/\n{3,}/g, '\n\n').trim();
}

/* ─── Copia la nota (solo si está completa) ─── */
function copyNote() {
    const { complete } = isNoteComplete();
    if (!complete) { updateCopyBtnState(); return; }

    const text = noteToPlainText(els.noteContent);

    navigator.clipboard.writeText(text).then(() => {
        els.copyBtn.textContent = '✓ ¡Copiado!';
        els.copyBtn.classList.add('copied');
        setTimeout(() => {
            els.copyBtn.textContent = 'Copiar nota';
            els.copyBtn.classList.remove('copied');
        }, 2000);
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        els.copyBtn.textContent = '✓ ¡Copiado!';
        els.copyBtn.classList.add('copied');
        setTimeout(() => {
            els.copyBtn.textContent = 'Copiar nota';
            els.copyBtn.classList.remove('copied');
        }, 2000);
    });
}

/* ─── Reinicia el flujo completo ─── */
function resetWorkflow() {
    if (!window.confirm('¿Reiniciar el proceso? Se perderán todos los datos del turno actual.')) return;

    currentStep = 1;
    noteVisible = false;

    Object.assign(selected, {
        area: null, areaNombre: null,
        diagnostico: null, diagnosticoNombre: null,
        datosDiag: null, nics: [],
        noc: null, nocNombre: null,
        b6Puntuacion: null, b6Descripcion: null,
    });

    document.querySelectorAll('.option').forEach((o) => o.classList.remove('selected', 'multi-selected'));

    for (let n = 1; n <= TOTAL_STEPS; n++) {
        const stepEl = document.getElementById(`step${n}`);
        if (!stepEl) continue;
        stepEl.classList.remove('completed', 'active');
        const summaryEl = stepEl.querySelector('.step-summary');
        if (summaryEl) summaryEl.textContent = '';
        const header = stepEl.querySelector('.step-header');
        if (header) {
            header.setAttribute('aria-expanded', 'false');
            header.setAttribute('tabindex', '-1');
        }
    }

    els.searchDiag.value = '';
    els.searchNic.value  = '';
    if (els.metaLograda) els.metaLograda.value = '';
    if (els.otrosComentarios) els.otrosComentarios.value = '';
    if (els.dobDia)  els.dobDia.value  = '';
    if (els.dobMes)  els.dobMes.value  = '';
    if (els.dobAnio) els.dobAnio.value = '';
    if (els.dobFeedback) { els.dobFeedback.textContent = ''; els.dobFeedback.className = 'dob-feedback'; }
    [els.dobDia, els.dobMes, els.dobAnio].forEach(f => f?.classList.remove('dob-field-error'));
    els.diagnosticos.innerHTML  = '';
    els.intervenciones.innerHTML = '';
    els.nocs.innerHTML       = '';
    els.evaluaciones.innerHTML   = '';

    // Restablecer toggle de nota
    els.noteContent.hidden = true;
    els.transversales.hidden = false;
    if (els.noteToggleBtn) {
        els.noteToggleBtn.textContent = 'Ver nota';
        els.noteToggleBtn.setAttribute('aria-expanded', 'false');
        els.noteToggleBtn.classList.remove('active', 'note-toggle-btn--ready');
        els.noteToggleBtn.hidden = true;
    }

    showMetaBlock(false);
    updateNicConfirmBtn();
    renderTransversales(null);
    activateStep(1);
    updateNote();
    updateCopyBtnState();
    syncNotePanelHeight();
}

/* ─── Inicializa la app ─── */
function init() {
    loadAreas();
    renderTransversales(null);
    activateStep(1);
    updateNote();
    updateCopyBtnState();
    updateNicConfirmBtn();
    updateStep1Lock();
    enableStepNavigation();

    // Búsqueda
    els.searchDiag?.addEventListener('input', () => filterOptions(els.diagnosticos, els.searchDiag.value));
    els.searchNic?.addEventListener('input',  () => filterOptions(els.intervenciones, els.searchNic.value));

    // Campos del paciente
    [els.servicio, els.sexo].forEach((el) => {
        el?.addEventListener('input',  () => updateNote());
        el?.addEventListener('change', () => updateNote());
    });
    // Fecha de nacimiento (navegación, auto-avance y validación)
    setupDobNavigation();

    // Estado de meta
    els.metaLograda?.addEventListener('change', updateNote);
    els.metaLograda?.addEventListener('input',  updateNote);

    // Observaciones opcionales
    els.otrosComentarios?.addEventListener('input', updateNote);

    // Botón confirmar NICs
    els.nicConfirmBtn?.addEventListener('click', () => {
        if (selected.nics.length === 0) return;
        loadEvaluaciones(selected.datosDiag, selected.nocNombre);
        activateStep(5);
    });

    // Toggle nota
    els.noteToggleBtn?.addEventListener('click', toggleNote);

    // Botones de acción
    document.getElementById('copyBtn')?.addEventListener('click', copyNote);
    document.getElementById('resetBtn')?.addEventListener('click', resetWorkflow);

    // Recalcular techo del panel al redimensionar la ventana
    window.addEventListener('resize', syncNotePanelHeight);
}

init();
