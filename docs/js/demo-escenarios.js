/* ============================================================================
   ⚠️  ARCHIVO TEMPORAL — SOLO PARA QA VISUAL DE LA NOTA GENERADA  ⚠️
   ----------------------------------------------------------------------------
   Botón flotante que carga escenarios de prueba (uno distinto en cada clic) y
   abre la vista previa, para revisar la estructura de la nota sin llenar el
   formulario a mano.

   NO forma parte del producto. PARA ELIMINARLO POR COMPLETO:
     1. Borrar este archivo:  public/js/demo-escenarios.js
     2. Quitar su <script> de public/entrega.html (marcado como DEMO TEMPORAL).
   No hay ninguna otra dependencia: este archivo no modifica nada del producto,
   solo escribe en el estado ya existente y llama a updateNote().

   Nota: rellena el ESTADO y la NOTA (que es lo que se revisa). Las tarjetas
   dinámicas del formulario (dispositivos/escalas/regiones/educación) no se
   re-renderizan porque sus funciones de render son internas del módulo.
   ============================================================================ */
(function () {
    'use strict';

    /* ─── Utilidades para construir datos válidos desde los catálogos reales ─── */
    const L = () => window.notaListas?.listas || {};
    const CAT = () => window.notaListas || {};

    function mkEscala(corto, puntaje) {
        const meta = (CAT().escalas || []).find((e) => e.corto === corto);
        if (!meta) return null;
        return {
            id: `demo-${corto}`, nombre: meta.nombre, corto: meta.corto,
            min: meta.min, max: meta.max, step: meta.step || 1,
            display: meta.display, puntaje: String(puntaje),
        };
    }

    function mkDispositivo(match, fechaIns, fechaCur, estadoMatch) {
        const nombre = (L().DISPOSITIVOS || []).find((d) => d.includes(match));
        const estado = (L().ESTADO_DISPOSITIVO || []).find((e) => e.includes(estadoMatch));
        if (!nombre) return null;
        return {
            id: `demo-${match}`, nombre,
            fechaInsercion: fechaIns || '', fechaCuracion: fechaCur || '',
            estado: estado || (L().ESTADO_DISPOSITIVO || [])[0] || '',
        };
    }

    const region = (match) => {
        for (const g of (CAT().regionesGrupos || [])) {
            const hit = g.items.find((r) => r.includes(match));
            if (hit) return hit;
        }
        return null;
    };

    const pick = (lista, match) => (L()[lista] || []).find((x) => x.includes(match)) || (L()[lista] || [])[0] || '';

    /* Toma un diagnóstico real del catálogo PAE para que RC/EP/NOC/NIC sean coherentes */
    function pickDx(areaKey, dxIndex) {
        const area = window.datosProPai?.[areaKey];
        if (!area) return null;
        const nombres = Object.keys(area);
        const dxName = nombres[dxIndex % nombres.length];
        return { areaKey, dxName, datos: area[dxName] };
    }

    /* ─── Escenarios ─── */
    const ESCENARIOS = [
        {
            nombre: '1 · Nota corta (mínimos)',
            desc: 'Un dispositivo, 2 escalas, 2 alteraciones, sin aislamiento, sin educación ni observaciones',
            build: () => ({
                paciente: {
                    sexo: 'Femenino', dobIso: '1985-03-20', dobTxt: '20/03/1985',
                    posicion: pick('POSICION', 'supino'), numCama: '12', numHabitacion: '304',
                    servicio: pick('SERVICIO', 'Medicina Interna'),
                },
                estado: {
                    neuro: pick('NEURO', 'Alerta y orientado'),
                    hemo: pick('HEMO', 'Estable'),
                    resp: pick('RESP', 'Ventilando espontáneamente'),
                },
                escalas: [mkEscala('Glasgow', 15), mkEscala('Braden', 18)],
                sinEscalas: false,
                clinico: {
                    diagnosticoMedico: 'Neumonía adquirida en comunidad',
                    aislamiento: 'No aplica',
                    estadoDental: pick('DENTAL', 'permanente completa'),
                },
                dispositivos: [mkDispositivo('Catéter venoso periférico', '2026-07-09', '', 'Permeable y funcional')],
                sinDispositivos: false,
                regiones: [region('Sistema respiratorio'), region('Tórax anterior')],
                sinAlteraciones: false,
                educacion: [],
                pae: { area: 'Respiratorias', dxIndex: 0, nRc: 1, nEp: 2, nNic: 1, b6: '4' },
                cierre: {
                    respuesta: 'mejoría del patrón respiratorio',
                    tendencia: pick('TENDENCIA', 'Mejoría progresiva'),
                    meta: 'Alcanzada',
                    criterio: 'saturación mayor a 94% sin soporte',
                    pendientes: 'control de signos vitales cada 4 horas',
                },
                observaciones: '',
            }),
        },
        {
            nombre: '2 · Nota densa (muchos datos)',
            desc: '3 dispositivos, 4 escalas, 6 alteraciones, aislamiento, educación múltiple y observaciones largas',
            build: () => ({
                paciente: {
                    sexo: 'Masculino', dobIso: '1948-11-02', dobTxt: '02/11/1948',
                    posicion: pick('POSICION', 'Fowler 45'), numCama: '7', numHabitacion: '210',
                    servicio: pick('SERVICIO', 'UCI Adultos'),
                },
                estado: {
                    neuro: pick('NEURO', 'Sedoanalgesiado'),
                    hemo: pick('HEMO', 'norepinefrina'),
                    resp: pick('RESP', 'controlado por volumen'),
                },
                escalas: [mkEscala('Glasgow', 8), mkEscala('Braden', 12), mkEscala('Morse', 55), mkEscala('RASS', -3)],
                sinEscalas: false,
                clinico: {
                    diagnosticoMedico: 'Choque séptico de origen abdominal (A41.9)',
                    aislamiento: pick('AISLAMIENTO', 'MDRO'),
                    estadoDental: pick('DENTAL', 'Prótesis total superior e inferior'),
                },
                dispositivos: [
                    mkDispositivo('Catéter venoso central (CVC) – yugular', '2026-07-03', '2026-07-09', 'Permeable y funcional'),
                    mkDispositivo('Sonda vesical', '2026-07-05', '', 'flebitis grado II'),
                    mkDispositivo('Tubo orotraqueal', '2026-07-06', '2026-07-10', 'Permeable y funcional'),
                ],
                sinDispositivos: false,
                regiones: [
                    region('Sistema respiratorio'), region('Sistema cardiovascular'), region('Sistema tegumentario'),
                    region('Abdomen – epigastrio'), region('Región sacra'), region('Miembro inferior derecho – tobillo'),
                ],
                sinAlteraciones: false,
                educacion: [
                    { id: 'demo-edu-1', destinatario: pick('EDUCACION_DEST', 'Familiar directo'), tema: 'signos de alarma y cuidados del catéter central en casa' },
                    { id: 'demo-edu-2', destinatario: pick('EDUCACION_DEST', 'Cuidador principal'), tema: 'movilización segura y prevención de úlceras por presión' },
                ],
                pae: { area: 'Infecciosas', dxIndex: 0, nRc: 3, nEp: 3, nNic: 3, b6: '2' },
                cierre: {
                    respuesta: 'disminución progresiva del requerimiento de vasopresor y mejoría de la perfusión distal',
                    tendencia: pick('TENDENCIA', 'Mejoría parcial'),
                    meta: 'Parcialmente alcanzada',
                    criterio: 'lactato en descenso y diuresis conservada en las últimas 6 horas',
                    pendientes: 'continuar destete de vasopresor según metas; pendiente control de hemocultivos; valoración por infectología en la mañana',
                },
                observaciones: 'Familia informada del estado clínico por el médico tratante.\n- Se solicita interconsulta a nutrición.\n- Paciente con antecedente de alergia a penicilina.',
            }),
        },
        {
            nombre: '3 · Nota con ausencias',
            desc: 'Sin escalas, sin dispositivos y sin alteraciones (ramas de "no aplica")',
            build: () => ({
                paciente: {
                    sexo: 'Femenino', dobIso: '2019-06-14', dobTxt: '14/06/2019',
                    posicion: pick('POSICION', 'Sedestación'), numCama: '3', numHabitacion: '118',
                    servicio: pick('SERVICIO', 'Pediatría'),
                },
                estado: {
                    neuro: pick('NEURO', 'Alerta y orientado'),
                    hemo: pick('HEMO', 'Estable'),
                    resp: pick('RESP', 'Ventilando espontáneamente'),
                },
                escalas: [],
                sinEscalas: true,
                clinico: {
                    diagnosticoMedico: 'Gastroenteritis aguda en resolución',
                    aislamiento: 'No aplica',
                    estadoDental: pick('DENTAL', 'Dentición primaria'),
                },
                dispositivos: [],
                sinDispositivos: true,
                regiones: [],
                sinAlteraciones: true,
                educacion: [{ id: 'demo-edu-3', destinatario: pick('EDUCACION_DEST', 'No fue posible brindar educación – sin acompañante'), tema: '' }],
                pae: { area: 'Digestivas', dxIndex: 0, nRc: 1, nEp: 1, nNic: 1, b6: '5' },
                cierre: {
                    respuesta: 'tolerancia adecuada a la vía oral sin vómito en las últimas 8 horas',
                    tendencia: pick('TENDENCIA', 'Mejoría progresiva'),
                    meta: 'Alcanzada',
                    criterio: 'hidratación adecuada y deposiciones de características normales',
                    pendientes: 'pendiente orden de salida por médico tratante',
                },
                observaciones: '',
            }),
        },
        {
            nombre: '4 · Nota en el umbral',
            desc: 'Justo en la frontera: 2 dispositivos, 3 escalas y 4 alteraciones (todos pasan a lista)',
            build: () => ({
                paciente: {
                    sexo: 'Masculino', dobIso: '1972-02-29', dobTxt: '29/02/1972',
                    posicion: pick('POSICION', 'Decúbito lateral derecho'), numCama: '21', numHabitacion: '405',
                    servicio: pick('SERVICIO', 'Cirugía General'),
                },
                estado: {
                    neuro: pick('NEURO', 'Somnoliento'),
                    hemo: pick('HEMO', 'Taquicárdico'),
                    resp: pick('RESP', 'cánula nasal'),
                },
                escalas: [mkEscala('EVA / NRS', 7), mkEscala('Braden', 14), mkEscala('Morse', 45)],
                sinEscalas: false,
                clinico: {
                    diagnosticoMedico: 'Postoperatorio de colecistectomía laparoscópica',
                    aislamiento: pick('AISLAMIENTO', 'Aislamiento de contacto'),
                    estadoDental: pick('DENTAL', 'edentulismo parcial'),
                },
                dispositivos: [
                    mkDispositivo('Catéter venoso periférico', '2026-07-10', '', 'Permeable y funcional'),
                    mkDispositivo('Drenaje de Jackson-Pratt', '2026-07-11', '2026-07-11', 'Retirado durante el turno – sin reposición'),
                ],
                sinDispositivos: false,
                regiones: [
                    region('Abdomen – hipocondrio derecho'), region('Abdomen – epigastrio'),
                    region('Sistema digestivo'), region('Sistema tegumentario'),
                ],
                sinAlteraciones: false,
                educacion: [{ id: 'demo-edu-4', destinatario: pick('EDUCACION_DEST', 'Paciente y familiar'), tema: 'cuidados de la herida quirúrgica y signos de infección' }],
                pae: { area: 'Quirúrgicas Abdominales', dxIndex: 0, nRc: 2, nEp: 2, nNic: 2, b6: '3' },
                cierre: {
                    respuesta: 'dolor controlado con analgesia pautada, EVA de 7 a 3',
                    tendencia: pick('TENDENCIA', 'Mejoría parcial'),
                    meta: 'En progreso – continúa en siguiente turno',
                    criterio: 'deambulación asistida tolerada y herida sin signos de infección',
                    pendientes: 'retiro de puntos según indicación; control de dolor cada 4 horas',
                },
                observaciones: 'Paciente refiere náusea leve tras la analgesia.',
            }),
        },
    ];

    /* ─── Aplicar un escenario al formulario/estado ─── */
    function setSimple(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = value ?? '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function setSegmented(groupId, hiddenId, value) {
        const hidden = document.getElementById(hiddenId);
        if (hidden) hidden.value = value;
        document.querySelectorAll(`#${groupId} [role="radio"]`).forEach((b) => {
            const on = b.dataset.value === value;
            b.setAttribute('aria-checked', on ? 'true' : 'false');
            b.tabIndex = on ? 0 : -1;
        });
    }

    function aplicar(esc) {
        const d = esc.build();
        const st = window.NotaCampos?.state;
        if (!st || !window.datosProPai) return;

        // — Paciente (Fase A)
        setSegmented('sexoSeg', 'sexo', d.paciente.sexo);
        const dob = document.getElementById('dobFecha');
        if (dob) { dob.value = d.paciente.dobTxt; dob.dataset.iso = d.paciente.dobIso; }
        st.posicion = d.paciente.posicion;
        st.servicio = d.paciente.servicio;
        const posEl = document.getElementById('posicion');
        if (posEl) posEl.value = d.paciente.posicion;
        const servEl = document.getElementById('servicio');
        if (servEl) servEl.value = d.paciente.servicio;
        setSimple('numCama', d.paciente.numCama);
        setSimple('numHabitacion', d.paciente.numHabitacion);

        // — Estado clínico (Fase B)
        st.estadoNeurologico = d.estado.neuro;
        st.estadoHemodinamico = d.estado.hemo;
        st.estadoRespiratorio = d.estado.resp;
        [['estadoNeurologico', d.estado.neuro], ['estadoHemodinamico', d.estado.hemo], ['estadoRespiratorio', d.estado.resp]]
            .forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val; });
        st.escalas = (d.escalas || []).filter(Boolean);
        st.sinEscalas = d.sinEscalas;

        // — Diagnóstico y dispositivos (Fase C)
        setSimple('diagnosticoMedico', d.clinico.diagnosticoMedico);
        setSimple('aislamiento', d.clinico.aislamiento);
        st.aislamiento = d.clinico.aislamiento;
        st.estadoDental = d.clinico.estadoDental;
        const dentEl = document.getElementById('estadoDental');
        if (dentEl) dentEl.value = d.clinico.estadoDental;
        st.dispositivos = (d.dispositivos || []).filter(Boolean);
        st.sinDispositivos = d.sinDispositivos;

        // — Hallazgos y educación (Fase D)
        st.regiones = (d.regiones || []).filter(Boolean);
        st.sinAlteraciones = d.sinAlteraciones;
        st.educacion = d.educacion || [];

        // — PAE (desde el catálogo real, para que RC/EP/NOC/NIC sean coherentes)
        const dx = pickDx(d.pae.area, d.pae.dxIndex);
        if (dx) {
            selected.area = dx.areaKey;
            selected.areaNombre = (typeof areaLabel === 'function') ? areaLabel(dx.areaKey) : dx.areaKey;
            selected.diagnostico = dx.dxName;
            selected.diagnosticoNombre = dx.dxName;
            selected.datosDiag = dx.datos;
            selected.rc = (dx.datos.rc || []).slice(0, d.pae.nRc);
            selected.ep = (dx.datos.ep || []).slice(0, d.pae.nEp);
            selected.nics = (dx.datos.nic || []).slice(0, d.pae.nNic);
            selected.customNics = [];
            selected.noc = 0;
            selected.nocNombre = (dx.datos.noc || [])[0] || '';
            selected.nocCustom = false;
            const escala = dx.datos.b6_por_noc?.[selected.nocNombre];
            const nivel = Array.isArray(escala) ? escala.find((n) => n.trim().startsWith(d.pae.b6)) : null;
            selected.b6Escala = escala || null;
            selected.b6Puntuacion = d.pae.b6;
            selected.b6Descripcion = nivel || `${d.pae.b6}. Moderadamente comprometido`;
            window.NotaCampos.setArea?.(dx.areaKey);
        }

        // — Evaluación y entrega (Fase F)
        setSimple('respuestaIntervenciones', d.cierre.respuesta);
        setSimple('tendenciaEvolutiva', d.cierre.tendencia);
        st.tendencia = d.cierre.tendencia;
        setSegmented('metaSeg', 'metaLograda', d.cierre.meta);
        setSimple('criterioClinico', d.cierre.criterio);
        setSimple('pendientes', d.cierre.pendientes);
        setSimple('otrosComentarios', d.observaciones);

        // — Regenerar la nota y abrir la vista previa
        if (typeof updateNote === 'function') updateNote();
        if (typeof updateCopyBtnState === 'function') updateCopyBtnState();
        if (typeof toggleNote === 'function') toggleNote(true);
    }

    /* ─── Botón flotante ─── */
    let idx = 0;

    function montar() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'demoEscenariosBtn';
        btn.title = 'Temporal — carga escenarios de prueba para revisar la nota';
        btn.style.cssText = [
            'position:fixed', 'left:16px', 'bottom:16px', 'z-index:120',
            'display:flex', 'flex-direction:column', 'align-items:flex-start', 'gap:2px',
            'padding:9px 14px', 'border:1.5px dashed #b45309', 'border-radius:10px',
            'background:#fffbeb', 'color:#92400e', 'cursor:pointer',
            'font:inherit', 'font-size:.72rem', 'font-weight:700', 'text-align:left',
            'box-shadow:0 4px 14px rgba(0,0,0,.14)', 'max-width:260px',
        ].join(';');

        const render = () => {
            const esc = ESCENARIOS[idx % ESCENARIOS.length];
            btn.innerHTML =
                `<span style="letter-spacing:.06em">⚙ DEMO · CARGAR ESCENARIO</span>` +
                `<span style="font-weight:600;opacity:.85">${esc.nombre}</span>` +
                `<span style="font-weight:500;opacity:.7;font-size:.68rem;line-height:1.3">${esc.desc}</span>`;
        };
        render();

        btn.addEventListener('click', () => {
            aplicar(ESCENARIOS[idx % ESCENARIOS.length]);
            idx++;
            render();
        });

        document.body.appendChild(btn);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
    else montar();
})();
