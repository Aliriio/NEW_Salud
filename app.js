const datosProPai = window.datosProPai;

const TOTAL_STEPS = 5;
let currentStep = 1;

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
    progressFill: document.getElementById('progressFill'),
    areas: document.getElementById('areas'),
    diagnosticos: document.getElementById('diagnosticos'),
    intervenciones: document.getElementById('intervenciones'),
    nocs: document.getElementById('nocs'),
    evaluaciones: document.getElementById('evaluaciones'),
    transversales: document.getElementById('transversales'),
    noteContent: document.getElementById('noteContent'),
    copyBtn: document.getElementById('copyBtn'),
    searchDiag: document.getElementById('searchDiag'),
    searchNic: document.getElementById('searchNic'),
    servicio: document.getElementById('servicio'),
    sexo: document.getElementById('sexo'),
    edad: document.getElementById('edad'),
    metaLograda: document.getElementById('metaLograda'),
};

function updateProgress() {
    let pct = ((currentStep - 1) / TOTAL_STEPS) * 100;
    if (selected.b6Puntuacion) pct = 100;
    els.progressFill.style.width = `${pct}%`;
}

function activateStep(n) {
    document.querySelectorAll('.step').forEach((s) => s.classList.remove('active'));
    document.getElementById(`step${n}`).classList.add('active');
    currentStep = n;
    updateProgress();
}

function createOption(title, desc, dataset = {}) {
    const div = document.createElement('div');
    div.className = 'option';
    Object.entries(dataset).forEach(([k, v]) => {
        div.dataset[k] = v;
    });
    div.innerHTML = `<span class="check-mark">✓</span><h4>${title}</h4>${desc ? `<p>${desc}</p>` : ''}`;
    return div;
}

function filterOptions(container, query) {
    const q = query.toLowerCase().trim();
    container.querySelectorAll('.option').forEach((opt) => {
        const text = opt.textContent.toLowerCase();
        opt.style.display = !q || text.includes(q) ? '' : 'none';
    });
}

function renderTransversales(datos) {
    const trans = datos?.trans || [];
    if (!trans.length) {
        els.transversales.innerHTML = '<p class="empty-state">Seleccione un diagnóstico para ver intervenciones transversales.</p>';
        return;
    }
    els.transversales.innerHTML = `<strong>Intervenciones transversales (automáticas):</strong><ul>${trans.map((t) => `<li>${t}</li>`).join('')}</ul>`;
}

function loadAreas() {
    els.areas.innerHTML = '';
    Object.keys(datosProPai).forEach((area) => {
        const count = Object.keys(datosProPai[area]).length;
        const opt = createOption(area, `${count} diagnóstico(s) de enfermería`, { area });
        els.areas.appendChild(opt);
    });

    els.areas.onclick = (e) => {
        const option = e.target.closest('.option');
        if (!option) return;

        els.areas.querySelectorAll('.option').forEach((o) => o.classList.remove('selected'));
        option.classList.add('selected');

        selected.area = option.dataset.area;
        selected.areaNombre = selected.area;
        selected.diagnostico = null;
        selected.diagnosticoNombre = null;
        selected.datosDiag = null;
        selected.nics = [];
        selected.noc = null;
        selected.nocNombre = null;
        selected.b6Puntuacion = null;
        selected.b6Descripcion = null;

        els.searchDiag.value = '';
        loadDiagnosticos(selected.area);
        activateStep(2);
        renderTransversales(null);
        updateNote();
    };
}

function loadDiagnosticos(area) {
    els.diagnosticos.innerHTML = '';
    const diagnosticos = datosProPai[area] || {};

    Object.entries(diagnosticos).forEach(([nombre, datos]) => {
        const nocPreview = (datos.noc || []).slice(0, 2).join(' · ');
        const opt = createOption(nombre, `NOC: ${nocPreview}${(datos.noc || []).length > 2 ? '…' : ''}`, {
            diagnostico: nombre,
        });
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
        selected.nics = [];
        selected.noc = null;
        selected.nocNombre = null;
        selected.b6Puntuacion = null;
        selected.b6Descripcion = null;

        els.searchNic.value = '';
        renderTransversales(selected.datosDiag);
        loadIntervenciones(selected.datosDiag);
        activateStep(3);
        updateNote();
    };
}

function loadIntervenciones(datos) {
    els.intervenciones.innerHTML = '';
    const nics = datos.nic || [];

    if (!nics.length) {
        els.intervenciones.innerHTML = '<p class="empty-state">Sin intervenciones NIC registradas.</p>';
        return;
    }

    nics.forEach((nic, i) => {
        const opt = createOption(nic, 'Clic para seleccionar / deseleccionar', { nic: String(i) });
        els.intervenciones.appendChild(opt);
    });

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

        if (selected.nics.length > 0) {
            loadNocs(selected.datosDiag);
            activateStep(4);
        }
        updateNote();
    };
}

function loadNocs(datos) {
    els.nocs.innerHTML = '';
    const nocs = datos.noc || [];

    nocs.forEach((noc, i) => {
        const escala = datos.b6_por_noc?.[noc];
        const desc = escala ? `Escala B6: ${escala.length} niveles` : '';
        const opt = createOption(noc, desc, { noc: String(i) });
        els.nocs.appendChild(opt);
    });

    els.nocs.onclick = (e) => {
        const option = e.target.closest('.option');
        if (!option) return;

        els.nocs.querySelectorAll('.option').forEach((o) => o.classList.remove('selected'));
        option.classList.add('selected');

        const idx = Number(option.dataset.noc);
        selected.noc = idx;
        selected.nocNombre = nocs[idx];
        selected.b6Puntuacion = null;
        selected.b6Descripcion = null;

        loadEvaluaciones(datos, selected.nocNombre);
        activateStep(5);
        updateNote();
    };
}

function parseB6(nivel) {
    const m = nivel.trim().match(/^(\d+)\s*[\.\-]\s*(.+)$/);
    return m ? { puntuacion: m[1], descripcion: nivel.trim() } : { puntuacion: '', descripcion: nivel.trim() };
}

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
        updateNote();
    };
}

function getMetaLograda() {
    return els.metaLograda?.value || 'en progreso';
}

function updateNote() {
    const hasData = selected.areaNombre || selected.diagnosticoNombre;

    if (!hasData) {
        els.noteContent.innerHTML =
            '<p class="empty-state">Seleccione el área clínica, diagnóstico e intervenciones para generar la nota de enfermería según el Plan de Atención Integral (PAI).</p>';
        return;
    }

    const now = new Date();
    const fecha = now.toLocaleDateString('es-CO');
    const hora = now.toLocaleTimeString('es-CO', { hour12: false });

    const sexo = els.sexo?.value || '___';
    const edad = els.edad?.value || '___';
    const servicio = els.servicio?.value?.trim() || '_______________';
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
    note += `Recibo paciente <strong>${sexo}</strong>, de <strong>${edad}</strong> años de edad, `;
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

    els.noteContent.innerHTML = note;
}

function copyNote() {
    const text = els.noteContent.innerText;
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
    });
}

function resetWorkflow() {
    currentStep = 1;
    Object.assign(selected, {
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
    });

    document.querySelectorAll('.option').forEach((o) => {
        o.classList.remove('selected', 'multi-selected');
    });

    els.searchDiag.value = '';
    els.searchNic.value = '';
    els.diagnosticos.innerHTML = '';
    els.intervenciones.innerHTML = '';
    els.nocs.innerHTML = '';
    els.evaluaciones.innerHTML = '';
    renderTransversales(null);
    activateStep(1);
    updateNote();
}

function init() {
    loadAreas();
    renderTransversales(null);
    activateStep(1);
    updateNote();

    els.searchDiag?.addEventListener('input', () => filterOptions(els.diagnosticos, els.searchDiag.value));
    els.searchNic?.addEventListener('input', () => filterOptions(els.intervenciones, els.searchNic.value));

    [els.servicio, els.sexo, els.edad, els.metaLograda].forEach((el) => {
        el?.addEventListener('input', updateNote);
        el?.addEventListener('change', updateNote);
    });

    document.getElementById('copyBtn')?.addEventListener('click', copyNote);
    document.getElementById('resetBtn')?.addEventListener('click', resetWorkflow);
}

init();
