/* ─── Campos clínicos de la Nota de entrega (fases B, C, D y F + Fase A nueva) ───
   Expone window.NotaCampos. Depende de los helpers globales de app.js
   (createOption, setupOptionList, filterOptions, focusOption, scrollSoft…),
   pero SOLO en runtime: NotaCampos.init() se llama desde init() de app.js,
   cuando esos helpers ya existen. No referenciar globals en el nivel superior. */
(function () {
    'use strict';

    const NL = () => window.notaListas || { listas: {}, escalas: [], areas: [], regionesGrupos: [] };

    const state = {
        // Fase A (sexo/DOB viven en app.js; área clínica vive en selected.area)
        posicion: '',
        numCama: '',
        numHabitacion: '',
        servicio: '',
        // Fase B
        estadoNeurologico: '',
        estadoHemodinamico: '',
        estadoRespiratorio: '',
        escalas: [],        // { id, nombre, corto, min, max, step, display, puntaje }
        sinEscalas: false,
        // Fase C
        diagnosticoMedico: '',
        aislamiento: 'No aplica',
        estadoDental: '',
        dispositivos: [],   // { id, nombre, fechaInsercion, fechaCuracion, estado }
        sinDispositivos: false,
        // Fase D
        regiones: [],       // strings
        sinAlteraciones: false,
        educacion: [],      // { id, destinatario, tema }  (sección opcional)
        // Fase F
        respuesta: '',
        tendencia: '',
        criterioClinico: '',
        pendientes: '',
    };

    let onChangeCb = () => {};
    let onAreaSelectCb = () => true;
    const cbx = {};            // comboboxes por id
    let uidSeq = 0;
    const uid = () => `nc-${++uidSeq}`;

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const noEdu = (dest) => String(dest).startsWith('No fue posible');

    function emit() {
        renderVigentes();
        onChangeCb();
    }

    /* ═══════════ Combobox (input buscable + lista desplegable) ═══════════ */
    function createCombobox({ id, options, onSelect, onInvalid }) {
        const wrap = document.querySelector(`[data-cbx="${id}"]`);
        const input = document.getElementById(id);
        const list = wrap?.querySelector('.cbx-list');
        if (!wrap || !input || !list) return null;

        let committed = '';
        let openNow = false;
        const listId = `${id}-listbox`;
        list.id = listId;
        input.setAttribute('aria-controls', listId);
        input.setAttribute('aria-haspopup', 'listbox');
        const labels = () => options().map((o) => (typeof o === 'string' ? o : o.label));

        function visibleOpts() { return [...list.querySelectorAll('.cbx-opt')]; }

        function render(filter) {
            const q = norm(filter || '');
            list.innerHTML = '';
            labels().forEach((label, i) => {
                if (q && !norm(label).includes(q)) return;
                const el = document.createElement('div');
                el.className = 'cbx-opt' + (label === committed ? ' cbx-opt--selected' : '');
                el.setAttribute('role', 'option');
                el.setAttribute('aria-selected', label === committed ? 'true' : 'false');
                el.dataset.i = String(i);
                el.id = `${listId}-opt-${i}`;
                el.textContent = label;
                list.appendChild(el);
            });
            if (!list.children.length) {
                list.innerHTML = '<div class="cbx-empty">Sin coincidencias</div>';
            }
        }

        function positionList() {
            if (!openNow) return;
            const r = input.getBoundingClientRect();
            const gap = 6;
            const below = window.innerHeight - r.bottom - gap;
            const above = r.top - gap;
            const maxH = Math.max(160, Math.min(320, Math.max(below, above) - 12));
            const openAbove = below < 220 && above > below;
            list.style.position = 'fixed';
            list.style.left = `${Math.round(r.left)}px`;
            list.style.width = `${Math.round(r.width)}px`;
            list.style.maxHeight = `${Math.round(maxH)}px`;
            list.style.top = openAbove ? 'auto' : `${Math.round(r.bottom + gap)}px`;
            list.style.bottom = openAbove ? `${Math.round(window.innerHeight - r.top + gap)}px` : 'auto';
        }

        function open() {
            if (input.disabled) return;
            render(input.value === committed ? '' : input.value);
            if (list.parentElement !== document.body) document.body.appendChild(list);
            list.classList.add('cbx-list--portal');
            list.hidden = false;
            openNow = true;
            input.setAttribute('aria-expanded', 'true');
            positionList();
        }
        function close() {
            list.hidden = true;
            openNow = false;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            setActive(-1);
        }
        function setActive(idx) {
            visibleOpts().forEach((o, i) => o.classList.toggle('cbx-opt--active', i === idx));
            const act = visibleOpts()[idx];
            if (act) {
                input.setAttribute('aria-activedescendant', act.id);
                act.scrollIntoView({ block: 'nearest' });
            } else input.removeAttribute('aria-activedescendant');
        }
        function activeIdx() {
            return visibleOpts().findIndex((o) => o.classList.contains('cbx-opt--active'));
        }

        function commit(optEl) {
            const i = Number(optEl.dataset.i);
            const opt = options()[i];
            const label = typeof opt === 'string' ? opt : opt.label;
            const ok = onSelect ? onSelect(opt) : true;
            if (ok === false) { close(); if (onInvalid) onInvalid(); return; }
            committed = label;
            input.value = label;
            wrap.classList.remove('cbx--invalid');
            close();
        }

        input.addEventListener('focus', open);
        input.addEventListener('click', open);
        input.addEventListener('input', () => { open(); render(input.value); setActive(-1); });
        input.addEventListener('keydown', (e) => {
            if (e.key.startsWith('Arrow') && (e.shiftKey || e.ctrlKey || e.metaKey)) return;
            const opts = visibleOpts();
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (list.hidden) { open(); return; }
                setActive(Math.min(activeIdx() + 1, opts.length - 1));
            } else if (e.key === 'ArrowUp') {
                if (list.hidden || activeIdx() <= 0) return;   // deja subir de sección cuando está cerrado
                e.preventDefault();
                setActive(activeIdx() - 1);
            } else if (e.key === 'Enter') {
                const act = opts[activeIdx()] || (opts.length === 1 ? opts[0] : null);
                if (!list.hidden && act) { e.preventDefault(); commit(act); }
                else if (!list.hidden && committed && input.value === committed) { close(); }
            } else if (e.key === 'Escape') {
                if (!list.hidden) { e.preventDefault(); input.value = committed; close(); }
            }
        });
        list.addEventListener('mousedown', (e) => {
            const opt = e.target.closest('.cbx-opt');
            if (opt) { e.preventDefault(); commit(opt); }
        });
        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (document.activeElement === input || list.contains(document.activeElement)) return;
                close();
                const typed = input.value.trim();
                if (typed === committed) return;
                // Coincidencia exacta (sin acentos/mayúsculas) → confirmar silenciosamente
                const idx = labels().findIndex((l) => norm(l) === norm(typed));
                if (typed && idx >= 0) {
                    render('');
                    const el = visibleOpts().find((o) => Number(o.dataset.i) === idx);
                    if (el) { commit(el); return; }
                }
                wrap.classList.toggle('cbx--invalid', !!typed);
                if (!typed && committed) { committed = ''; if (onSelect) onSelect(null); }
            }, 120);
        });
        window.addEventListener('resize', positionList);
        window.addEventListener('scroll', positionList, true);

        return {
            input,
            open,
            close,
            setValue(label) {
                committed = label || '';
                input.value = label || '';
                wrap.classList.remove('cbx--invalid');
            },
            setDisabled(dis) {
                input.disabled = !!dis;
                wrap.classList.toggle('cbx--disabled', !!dis);
                if (dis) close();
            },
        };
    }

    /* ═══════════ Selects nativos ═══════════ */
    function fillSelect(sel, items, placeholder) {
        if (!sel) return;
        sel.innerHTML = '';
        if (placeholder) {
            const ph = document.createElement('option');
            ph.value = '';
            ph.textContent = placeholder;
            sel.appendChild(ph);
        }
        (items || []).forEach((t) => {
            const o = document.createElement('option');
            o.value = t;
            o.textContent = t;
            sel.appendChild(o);
        });
    }

    /* ═══════════ Estados clínicos (neuro / hemo / resp) ═══════════ */
    const ESTADOS = [
        { field: 'estadoNeurologico',  lista: 'NEURO' },
        { field: 'estadoHemodinamico', lista: 'HEMO' },
        { field: 'estadoRespiratorio', lista: 'RESP' },
    ];

    function setupEstadoGroup({ field, lista }, chainNext) {
        const group = document.querySelector(`.estado-group[data-estado="${field}"]`);
        if (!group) return;
        const label = group.dataset.label || field;

        group.innerHTML = `
            <label id="${field}Label" for="${field}">${esc(label)} <span class="required-star" aria-label="obligatorio">*</span></label>
            <div class="cbx estado-combobox" data-cbx="${field}">
                <input type="text" id="${field}" class="cbx-input" placeholder="Buscar o seleccionar…"
                       role="combobox" aria-expanded="false" aria-autocomplete="list"
                       aria-labelledby="${field}Label" autocomplete="off">
                <div class="cbx-list" role="listbox" hidden></div>
            </div>`;

        cbx[field] = createCombobox({
            id: field,
            options: () => NL().listas[lista] || [],
            onSelect: (value) => {
                state[field] = value || '';
                group.classList.toggle('estado-group--done', !!value);
                emit();
                if (value && chainNext) setTimeout(chainNext, 0);
            },
        });
        group._expand = (focus) => { if (focus) cbx[field]?.input.focus(); };
        group._search = cbx[field]?.input;
    }

    /* ═══════════ Multi-add genérico (picker con buscador + tarjetas) ═══════════ */
    function createMultiAdd({ pickerWrap, options, toggleLabel, placeholder, getUsed, onAdd, keepOpen, renderExtra }) {
        pickerWrap.innerHTML = '';
        const pickerId = `${pickerWrap.id || uid()}-listbox`;
        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'multi-add-input';
        search.placeholder = placeholder || toggleLabel || 'Buscar o seleccionar…';
        search.autocomplete = 'off';
        search.setAttribute('role', 'combobox');
        search.setAttribute('aria-autocomplete', 'list');
        search.setAttribute('aria-haspopup', 'listbox');
        search.setAttribute('aria-controls', pickerId);
        search.setAttribute('aria-expanded', 'false');
        search.setAttribute('aria-label', toggleLabel || placeholder || 'Seleccionar opciones');
        const picker = document.createElement('div');
        picker.className = 'multi-add-picker multi-add-picker--portal';
        picker.id = pickerId;
        picker.hidden = true;

        const opts = document.createElement('div');
        opts.className = 'options options--list multi-add-options';
        opts.setAttribute('role', 'listbox');

        picker.append(opts);
        pickerWrap.append(search);
        document.body.appendChild(picker);
        let openNow = false;

        function renderPicker() {
            const q = norm(search.value.trim());
            const used = new Set(getUsed());
            opts.innerHTML = '';
            options().forEach((entry) => {
                if (entry.group) {
                    const t = document.createElement('div');
                    t.className = 'region-group-title';
                    t.textContent = entry.group;
                    t.dataset.group = '1';
                    opts.appendChild(t);
                    return;
                }
                const label = entry.label;
                if (used.has(label)) return;
                if (q && !norm(label).includes(q)) return;
                const opt = createOption(label, '', {});
                opt.dataset.value = label;
                opt.setAttribute('aria-selected', 'false');
                opts.appendChild(opt);
            });
            // Ocultar títulos de grupo sin opciones visibles debajo
            [...opts.querySelectorAll('[data-group]')].forEach((t) => {
                let sib = t.nextElementSibling;
                let hasChild = false;
                while (sib && !sib.dataset.group) {
                    if (sib.classList.contains('option')) { hasChild = true; break; }
                    sib = sib.nextElementSibling;
                }
                t.style.display = hasChild ? '' : 'none';
            });
            if (!opts.querySelector('.option')) {
                opts.innerHTML = '<p class="hint">No hay más opciones disponibles.</p>';
            } else {
                setupOptionList(opts, { searchInput: search });
            }
        }

        function positionPicker() {
            if (!openNow) return;
            const r = search.getBoundingClientRect();
            const gap = 6;
            const below = window.innerHeight - r.bottom - gap;
            const above = r.top - gap;
            const openAbove = below < 240 && above > below;
            const maxH = Math.max(180, Math.min(360, Math.max(below, above) - 12));
            picker.style.left = `${Math.round(r.left)}px`;
            picker.style.width = `${Math.max(Math.round(r.width), 360)}px`;
            picker.style.maxWidth = `${Math.max(280, window.innerWidth - Math.round(r.left) - 16)}px`;
            picker.style.maxHeight = `${Math.round(maxH)}px`;
            picker.style.top = openAbove ? 'auto' : `${Math.round(r.bottom + gap)}px`;
            picker.style.bottom = openAbove ? `${Math.round(window.innerHeight - r.top + gap)}px` : 'auto';
        }

        function openPicker() {
            picker.hidden = false;
            openNow = true;
            search.setAttribute('aria-expanded', 'true');
            renderPicker();
            positionPicker();
        }
        function closePicker() {
            picker.hidden = true;
            openNow = false;
            search.setAttribute('aria-expanded', 'false');
            search.removeAttribute('aria-activedescendant');
            search.value = '';
        }

        search.addEventListener('focus', openPicker);
        search.addEventListener('click', openPicker);
        search.addEventListener('input', () => { openPicker(); renderPicker(); });
        search.addEventListener('keydown', (e) => {
            if (e.key.startsWith('Arrow') && (e.shiftKey || e.ctrlKey || e.metaKey)) return;
            const visible = [...opts.querySelectorAll('.option')].filter((o) => o.style.display !== 'none');
            if (e.key === 'Enter') {
                if (visible.length === 1) { e.preventDefault(); visible[0].click(); return; }
                if (visible[0]) { e.preventDefault(); focusOption(visible[0], opts); }
            } else if (e.key === 'ArrowDown') {
                if (visible[0]) { e.preventDefault(); focusOption(visible[0], opts); }
            } else if (e.key === 'Escape') {
                e.preventDefault(); closePicker(); search.focus();
            }
        });
        search.addEventListener('blur', () => {
            setTimeout(() => {
                if (document.activeElement === search || picker.contains(document.activeElement)) return;
                closePicker();
            }, 120);
        });
        picker.addEventListener('mousedown', (e) => {
            if (e.target.closest('.option')) e.preventDefault();
        });
        opts.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closePicker();
                search.focus();
            }
        });
        opts.addEventListener('click', (e) => {
            const opt = e.target.closest('.option');
            if (!opt || opt.style.display === 'none') return;
            onAdd(opt.dataset.value);
            if (keepOpen) { renderPicker(); search.focus(); }
            else closePicker();
            emit();
        });
        window.addEventListener('resize', positionPicker);
        window.addEventListener('scroll', positionPicker, true);
        if (renderExtra) renderExtra({ toggleBtn: search, picker });

        return { toggleBtn: search, picker, search, renderPicker, openPicker, closePicker };
    }

    /* ═══════════ Fase B: escalas de valoración con puntaje ═══════════ */
    let escalasUI = null;

    function syncNoneChoice(buttonId, active) {
        const btn = document.getElementById(buttonId);
        if (!btn) return;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.classList.toggle('none-choice--active', active);
    }

    function setNoneChoice(kind, active) {
        if (kind === 'escalas') {
            state.sinEscalas = active;
            if (active) state.escalas = [];
            syncNoneChoice('sinEscalasBtn', active);
            renderEscalas();
            escalasUI?.renderPicker();
        } else if (kind === 'dispositivos') {
            state.sinDispositivos = active;
            if (active) state.dispositivos = [];
            syncNoneChoice('sinDispositivosBtn', active);
            renderDispositivos();
            dispositivosUI?.renderPicker();
        } else if (kind === 'alteraciones') {
            state.sinAlteraciones = active;
            if (active) state.regiones = [];
            syncNoneChoice('sinAlteracionesBtn', active);
            renderRegiones();
            regionesUI?.renderPicker();
        }
        emit();
    }

    function escalaValida(item) {
        const raw = String(item.puntaje ?? '').trim();
        if (raw === '') return false;
        const n = Number(raw.replace(',', '.'));
        return !Number.isNaN(n) && n >= item.min && n <= item.max;
    }

    function renderEscalas() {
        const wrap = document.getElementById('escalasList');
        if (!wrap) return;
        wrap.innerHTML = '';
        state.escalas.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'multi-add-item';
            card.innerHTML = `
                <div class="multi-add-item-head">
                    <strong>${esc(item.nombre)}</strong>
                    <button type="button" class="multi-add-remove" aria-label="Quitar ${esc(item.corto)}">✕</button>
                </div>
                <div class="escala-fields">
                    <div class="field-group field-group--puntaje">
                        <label>Puntaje (${esc(item.display)})</label>
                        <input type="number" class="escala-puntaje" min="${item.min}" max="${item.max}"
                               step="${item.step || 1}" value="${esc(item.puntaje)}"
                               placeholder="${esc(item.display)}" aria-label="Puntaje de ${esc(item.corto)}">
                        <div class="puntaje-error" aria-live="polite" hidden></div>
                    </div>
                </div>`;
            const input = card.querySelector('.escala-puntaje');
            const errEl = card.querySelector('.puntaje-error');
            const validate = () => {
                item.puntaje = input.value.trim();
                const bad = item.puntaje !== '' && !escalaValida(item);
                input.classList.toggle('puntaje-invalid', bad);
                errEl.hidden = !bad;
                errEl.textContent = bad ? `Debe estar entre ${item.display}` : '';
            };
            input.addEventListener('input', () => { validate(); emit(); });
            card.querySelector('.multi-add-remove').addEventListener('click', () => {
                state.escalas = state.escalas.filter((e2) => e2.id !== item.id);
                renderEscalas();
                escalasUI?.renderPicker();
                emit();
            });
            wrap.appendChild(card);
        });
    }

    /* ═══════════ Fase C: dispositivos con subcampos ═══════════ */
    let dispositivosUI = null;

    function isoToDMY(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
    }

    function renderDispositivos() {
        const wrap = document.getElementById('dispositivosList');
        if (!wrap) return;
        wrap.innerHTML = '';
        const estados = NL().listas.ESTADO_DISPOSITIVO || [];
        state.dispositivos.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'multi-add-item multi-add-item--device';
            card.innerHTML = `
                <div class="multi-add-item-head">
                    <strong>${esc(item.nombre)}</strong>
                    <button type="button" class="multi-add-remove" aria-label="Quitar ${esc(item.nombre)}">✕</button>
                </div>
                <div class="device-fields">
                    <div class="field-group">
                        <label>Fecha de inserción <span class="required-star" aria-label="obligatorio">*</span></label>
                        <input type="date" class="dev-fecha-ins" value="${esc(item.fechaInsercion)}" aria-label="Fecha de inserción de ${esc(item.nombre)}">
                    </div>
                    <div class="field-group">
                        <label>Última curación <span class="label-optional">(opcional)</span></label>
                        <input type="date" class="dev-fecha-cur" value="${esc(item.fechaCuracion)}" aria-label="Fecha de última curación de ${esc(item.nombre)}">
                    </div>
                    <div class="field-group field-group--wide">
                        <label>Estado del dispositivo <span class="required-star" aria-label="obligatorio">*</span></label>
                        <select class="dev-estado field-select" aria-label="Estado de ${esc(item.nombre)}"></select>
                    </div>
                </div>`;
            const sel = card.querySelector('.dev-estado');
            fillSelect(sel, estados, 'Seleccionar estado…');
            if (item.estado) sel.value = item.estado;

            card.querySelector('.multi-add-remove').addEventListener('click', () => {
                state.dispositivos = state.dispositivos.filter((d) => d.id !== item.id);
                renderDispositivos();
                dispositivosUI?.renderPicker();
                emit();
            });
            card.querySelector('.dev-fecha-ins').addEventListener('change', (e) => { item.fechaInsercion = e.target.value; emit(); });
            card.querySelector('.dev-fecha-cur').addEventListener('change', (e) => { item.fechaCuracion = e.target.value; emit(); });
            sel.addEventListener('change', () => { item.estado = sel.value; emit(); });
            wrap.appendChild(card);
        });
    }

    /* ═══════════ Fase D: regiones (chips) y educación ═══════════ */
    let regionesUI = null;

    function renderRegiones() {
        const wrap = document.getElementById('regionesChips');
        if (!wrap) return;
        wrap.innerHTML = '';
        wrap.hidden = !state.regiones.length;
        state.regiones.forEach((nombre) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'region-chip';
            chip.setAttribute('aria-label', `Quitar ${nombre}`);
            chip.innerHTML = `<span>${esc(nombre)}</span><span class="region-chip-x" aria-hidden="true">×</span>`;
            chip.addEventListener('click', () => {
                state.regiones = state.regiones.filter((r) => r !== nombre);
                renderRegiones();
                regionesUI?.renderPicker();
                emit();
            });
            wrap.appendChild(chip);
        });
    }

    function renderEducacion() {
        const wrap = document.getElementById('educacionList');
        if (!wrap) return;
        wrap.innerHTML = '';
        state.educacion.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'multi-add-item';
            const sinTema = noEdu(item.destinatario);
            card.innerHTML = `
                <div class="multi-add-item-head">
                    <strong>${esc(item.destinatario)}</strong>
                    <button type="button" class="multi-add-remove" aria-label="Quitar registro de educación">✕</button>
                </div>
                ${sinTema ? '' : `
                <div class="field-group">
                    <label>Tema de educación <span class="required-star" aria-label="obligatorio">*</span></label>
                    <textarea class="edu-tema obs-textarea" rows="2" placeholder="Describa el contenido educativo impartido…"
                              aria-label="Tema de educación para ${esc(item.destinatario)}">${esc(item.tema)}</textarea>
                </div>`}`;
            card.querySelector('.multi-add-remove').addEventListener('click', () => {
                state.educacion = state.educacion.filter((e2) => e2.id !== item.id);
                renderEducacion();
                emit();
            });
            const ta = card.querySelector('.edu-tema');
            if (ta) ta.addEventListener('input', () => { item.tema = ta.value.trim(); emit(); });
            wrap.appendChild(card);
        });
        document.querySelectorAll('#eduQuick [data-edu-dest]').forEach((btn) => {
            const selected = state.educacion.some((e2) => e2.destinatario === btn.dataset.eduDest);
            btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
            btn.classList.toggle('edu-quick-btn--active', selected);
        });
    }

    function setupEduQuick() {
        const wrap = document.getElementById('eduQuick');
        if (!wrap) return;
        const opciones = NL().listas.EDUCACION_DEST || [];
        wrap.innerHTML = '';
        opciones.forEach((dest) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'edu-quick-btn';
            btn.dataset.eduDest = dest;
            btn.setAttribute('aria-pressed', 'false');
            btn.textContent = dest
                .replace('Familiar directo (cónyuge / padre / madre / hijo/a)', 'Familiar directo')
                .replace('No fue posible brindar educación – ', 'No fue posible: ');
            btn.title = dest;
            btn.addEventListener('click', () => {
                const existing = state.educacion.find((e2) => e2.destinatario === dest);
                if (existing) state.educacion = state.educacion.filter((e2) => e2.id !== existing.id);
                else state.educacion.push({ id: uid(), destinatario: dest, tema: '' });
                renderEducacion();
                emit();
                if (!existing && !noEdu(dest)) {
                    setTimeout(() => {
                        const cards = [...document.querySelectorAll('#educacionList .multi-add-item')];
                        cards[cards.length - 1]?.querySelector('.edu-tema')?.focus();
                    }, 0);
                }
            });
            wrap.appendChild(btn);
        });
    }

    /* ═══════════ Fase F: vigentes al cierre (autocompuesto) ═══════════ */
    function renderVigentes() {
        const el = document.getElementById('vigentesLine');
        if (!el) return;
        el.textContent = formatVigentes();
    }

    /* ═══════════ Formatters para la nota ═══════════ */
    const joinNat = (arr) => arr.length <= 1 ? arr.join('')
        : arr.slice(0, -1).join(', ') + ' y ' + arr[arr.length - 1];

    function formatEscalas() {
        if (state.sinEscalas) return 'No se aplicaron escalas de valoración';
        if (!state.escalas.length) return '';
        return state.escalas
            .map((e2) => `${e2.corto}: ${e2.puntaje !== '' ? e2.puntaje : '___'}`)
            .join('; ');
    }

    function formatDispositivos() {
        if (state.sinDispositivos) return 'Sin dispositivos invasivos o de soporte';
        if (!state.dispositivos.length) return '';
        return state.dispositivos.map((d) => {
            const extras = [];
            if (d.fechaInsercion) extras.push(`inserción ${isoToDMY(d.fechaInsercion)}`);
            if (d.fechaCuracion) extras.push(`última curación ${isoToDMY(d.fechaCuracion)}`);
            if (d.estado) extras.push(`estado: ${d.estado}`);
            return d.nombre + (extras.length ? ` (${extras.join(', ')})` : '');
        }).join('; ');
    }

    function formatRegiones() {
        if (state.sinAlteraciones) return 'Sin alteraciones relevantes identificadas';
        return joinNat(state.regiones);
    }

    /* Frase completa de educación, o '' si no se registró (sección opcional) */
    function formatEducacion() {
        if (!state.educacion.length) return '';
        const con = state.educacion.filter((e2) => !noEdu(e2.destinatario));
        const sin = state.educacion.filter((e2) => noEdu(e2.destinatario));
        const frases = [];
        if (con.length) {
            const partes = con.map((e2) => `${e2.destinatario.toLowerCase()} sobre ${e2.tema || '___'}`);
            frases.push(`Se brindó educación a ${joinNat(partes)}, con verificación de comprensión según corresponda.`);
        }
        sin.forEach((e2) => frases.push(`${e2.destinatario}.`));
        return frases.join(' ');
    }

    function formatVigentes() {
        const parts = [];
        if (state.estadoRespiratorio) parts.push(state.estadoRespiratorio);
        state.dispositivos.forEach((d) => {
            if (!d.estado || !d.estado.startsWith('Retirado')) {
                parts.push(d.nombre + (d.estado ? ` (${d.estado})` : ''));
            }
        });
        return parts.length ? parts.join(', ') : 'sin dispositivos ni terapias activas reportadas';
    }

    /* ═══════════ Validación por fase ═══════════ */
    function getMissing() {
        const m = { faseA: [], faseB: [], faseC: [], faseD: [], evaluacion: [], cierre: [] };

        if (!state.posicion)      m.faseA.push('Posición del paciente');
        if (!state.numCama)       m.faseA.push('Número de cama');
        if (!state.numHabitacion) m.faseA.push('Número de habitación');
        if (!state.servicio)      m.faseA.push('Servicio / Unidad');

        if (!state.estadoNeurologico)  m.faseB.push('Estado neurológico');
        if (!state.estadoHemodinamico) m.faseB.push('Estado hemodinámico');
        if (!state.estadoRespiratorio) m.faseB.push('Estado respiratorio');
        if (!state.escalas.length && !state.sinEscalas) m.faseB.push('Escalas de valoración o “No se aplicaron”');
        state.escalas.forEach((e2) => {
            if (!escalaValida(e2)) m.faseB.push(`Puntaje de ${e2.corto} (${e2.display})`);
        });

        if (!state.diagnosticoMedico)   m.faseC.push('Diagnóstico médico');
        if (!state.dispositivos.length && !state.sinDispositivos) m.faseC.push('Dispositivos presentes o “Sin dispositivos”');
        state.dispositivos.forEach((d) => {
            if (!d.fechaInsercion) m.faseC.push(`Fecha de inserción de ${d.nombre}`);
            if (!d.estado)         m.faseC.push(`Estado de ${d.nombre}`);
        });
        if (!state.estadoDental) m.faseC.push('Estado dental');

        if (!state.regiones.length && !state.sinAlteraciones) m.faseD.push('Regiones afectadas o “Sin alteraciones”');
        state.educacion.forEach((e2) => {
            if (!noEdu(e2.destinatario) && !e2.tema) m.faseD.push(`Tema de educación (${e2.destinatario})`);
        });

        if (!state.respuesta) m.evaluacion.push('Respuesta del paciente a las intervenciones');
        if (!state.tendencia) m.evaluacion.push('Tendencia evolutiva');

        if (!state.criterioClinico) m.cierre.push('Criterio clínico u objetivo alcanzado');
        if (!state.pendientes)      m.cierre.push('Pendientes para el siguiente turno');

        return m;
    }

    /* done/total por fase (faseA y meta los completa app.js) */
    function phaseStatus() {
        const m = getMissing();
        const totals = {
            faseA: 4,
            faseB: 4 + (state.sinEscalas ? 0 : state.escalas.length),
            faseC: 3 + (state.sinDispositivos ? 0 : state.dispositivos.length * 2),
            faseD: 1 + state.educacion.filter((e2) => !noEdu(e2.destinatario)).length,
            faseF: 4,
        };
        const missing = {
            faseA: m.faseA.length,
            faseB: m.faseB.length,
            faseC: m.faseC.length,
            faseD: m.faseD.length,
            faseF: m.evaluacion.length + m.cierre.length,
        };
        const out = {};
        Object.keys(totals).forEach((k) => {
            const missingList = k === 'faseF' ? [...m.evaluacion, ...m.cierre] : [...(m[k] || [])];
            const summaries = {
                faseA: state.servicio || '',
                faseB: state.estadoNeurologico
                    ? `${state.estadoNeurologico}${state.sinEscalas ? ' · sin escalas' : state.escalas.length ? ` · ${state.escalas.length} escala(s)` : ''}`
                    : '',
                faseC: state.diagnosticoMedico
                    ? `${state.diagnosticoMedico}${state.sinDispositivos ? ' · sin dispositivos' : state.dispositivos.length ? ` · ${state.dispositivos.length} dispositivo(s)` : ''}`
                    : '',
                faseD: state.sinAlteraciones ? 'Sin alteraciones relevantes' : (state.regiones.length ? `${state.regiones.length} región(es)` : ''),
                faseF: state.tendencia || '',
            };
            const complete = missingList.length === 0;
            out[k] = {
                done: Math.max(0, totals[k] - missing[k]),
                total: totals[k],
                status: complete ? 'complete' : 'pending',
                summary: summaries[k],
                missing: missingList,
            };
        });
        return out;
    }

    /* ═══════════ Navegación por teclado entre fases ═══════════ */
    function firstEstadoEntry(group) {
        if (!group) return null;
        return group.querySelector('.cbx-input');
    }

    function focusPhase(id, dir = 1) {
        const back = dir < 0;
        if (id === 'faseB') {
            if (back) { document.querySelector('#escalasBlock .multi-add-input')?.focus(); }
            else { firstEstadoEntry(document.querySelector('[data-estado="estadoNeurologico"]'))?.focus(); }
        } else if (id === 'faseC') {
            if (back) { document.querySelector('#dispositivosBlock .multi-add-input')?.focus(); }
            else document.getElementById('diagnosticoMedico')?.focus();
        } else if (id === 'faseD') {
            if (back) { document.querySelector('#eduQuick .edu-quick-btn:last-child')?.focus(); }
            else document.querySelector('#regionesBlock .multi-add-input')?.focus();
        } else if (id === 'faseF') {
            if (back) document.getElementById('pendientes')?.focus();
            else document.getElementById('respuestaIntervenciones')?.focus();
        }
        const el = document.getElementById(id);
        if (el) scrollSoft(el, 'nearest');
    }

    /* Buscador visible de la fase (para la escritura directa global) */
    function searchForPhase(id) {
        const phase = document.getElementById(id);
        if (!phase) return null;
        const boxes = [...phase.querySelectorAll('.estado-group .cbx-input, .multi-add-input')];
        return boxes.find((b) => !b.closest('[hidden]') && b.offsetParent !== null) || null;
    }

    /* Primer control pendiente de la fase (para Shift+Enter) */
    function focusFirstPending(id) {
        const m = getMissing();
        if (id === 'faseB') {
            const est = ESTADOS.find((e2) => !state[e2.field]);
            if (est) {
                const g = document.querySelector(`[data-estado="${est.field}"]`);
                if (g?._expand && g.classList.contains('estado-group--done')) g._expand(false);
                firstEstadoEntry(g)?.focus();
                return true;
            }
            if (m.faseB.length) {
                const bad = document.querySelector('#escalasList .escala-puntaje.puntaje-invalid')
                    || [...document.querySelectorAll('#escalasList .escala-puntaje')].find((i) => !i.value.trim())
                    || document.querySelector('#escalasBlock .multi-add-input');
                bad?.focus();
                return true;
            }
        } else if (id === 'faseC') {
            if (!state.diagnosticoMedico) { document.getElementById('diagnosticoMedico')?.focus(); return true; }
            if (m.faseC.length) {
                const bad = [...document.querySelectorAll('#dispositivosList .dev-fecha-ins')].find((i) => !i.value)
                    || [...document.querySelectorAll('#dispositivosList .dev-estado')].find((s) => !s.value)
                    || (!state.dispositivos.length && !state.sinDispositivos ? document.querySelector('#dispositivosBlock .multi-add-input') : null)
                    || (!state.estadoDental ? document.getElementById('estadoDental') : null);
                bad?.focus();
                return true;
            }
        } else if (id === 'faseD') {
            if (!state.regiones.length && !state.sinAlteraciones) { document.querySelector('#regionesBlock .multi-add-input')?.focus(); return true; }
            const ta = [...document.querySelectorAll('#educacionList .edu-tema')].find((t) => !t.value.trim());
            if (ta) { ta.focus(); return true; }
        } else if (id === 'faseF') {
            const seq = [
                [!state.respuesta, 'respuestaIntervenciones'],
                [!state.tendencia, 'tendenciaEvolutiva'],
                [!state.criterioClinico, 'criterioClinico'],
                [!state.pendientes, 'pendientes'],
            ];
            const hit = seq.find(([miss]) => miss);
            if (hit) { document.getElementById(hit[1])?.focus(); return true; }
        }
        return false;
    }

    /* ═══════════ Campos simples ═══════════ */
    function wireSimpleField(id, field) {
        const el = document.getElementById(id);
        if (!el) return;
        const handler = () => { state[field] = el.value.trim(); emit(); };
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
    }

    /* Encadena Enter/↓ de un campo simple hacia el siguiente control */
    function chainField(id, nextFocus) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('keydown', (e) => {
            if (e.shiftKey || e.ctrlKey || e.metaKey) return;
            if (e.key === 'Enter' || (e.key === 'ArrowDown' && el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA')) {
                e.preventDefault();
                nextFocus();
            }
        });
    }

    /* ═══════════ Reset ═══════════ */
    function reset() {
        Object.assign(state, {
            posicion: '', numCama: '', numHabitacion: '', servicio: '',
            estadoNeurologico: '', estadoHemodinamico: '', estadoRespiratorio: '',
            escalas: [], sinEscalas: false, diagnosticoMedico: '', aislamiento: 'No aplica', estadoDental: '',
            dispositivos: [], sinDispositivos: false, regiones: [], sinAlteraciones: false, educacion: [],
            respuesta: '', tendencia: '', criterioClinico: '', pendientes: '',
        });
        ['posicion', 'servicio', 'areaClinica', 'estadoDental', 'estadoNeurologico', 'estadoHemodinamico', 'estadoRespiratorio'].forEach((id) => cbx[id]?.setValue(''));
        ['numCama', 'numHabitacion', 'diagnosticoMedico', 'respuestaIntervenciones', 'criterioClinico', 'pendientes'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const ais = document.getElementById('aislamiento');
        if (ais) ais.value = 'No aplica';
        const ten = document.getElementById('tendenciaEvolutiva');
        if (ten) ten.value = '';
        document.querySelectorAll('.estado-group').forEach((g) => g.classList.remove('estado-group--done'));
        document.querySelectorAll('.multi-add-picker').forEach((p) => { p.hidden = true; });
        document.querySelectorAll('.multi-add-input').forEach((t) => t.setAttribute('aria-expanded', 'false'));
        renderEscalas();
        renderDispositivos();
        renderRegiones();
        renderEducacion();
        renderVigentes();
        syncNoneChoice('sinEscalasBtn', false);
        syncNoneChoice('sinDispositivosBtn', false);
        syncNoneChoice('sinAlteracionesBtn', false);
        escalasUI?.renderPicker();
        dispositivosUI?.renderPicker();
        regionesUI?.renderPicker();
    }

    /* ═══════════ Init ═══════════ */
    function init({ onChange, onAreaSelect } = {}) {
        onChangeCb = onChange || (() => {});
        onAreaSelectCb = onAreaSelect || (() => true);
        const L = NL().listas;

        /* Fase A: comboboxes + encadenado de teclado */
        cbx.posicion = createCombobox({
            id: 'posicion',
            options: () => L.POSICION || [],
            onSelect: (v) => { state.posicion = v || ''; emit(); if (v) document.getElementById('numCama')?.focus(); },
        });
        cbx.servicio = createCombobox({
            id: 'servicio',
            options: () => L.SERVICIO || [],
            onSelect: (v) => { state.servicio = v || ''; emit(); if (v) document.getElementById('areaClinica')?.focus(); },
        });
        cbx.areaClinica = createCombobox({
            id: 'areaClinica',
            options: () => NL().areas,
            onSelect: (opt) => {
                if (!opt) { onAreaSelectCb(null); return true; }
                return onAreaSelectCb(opt.key);
            },
        });
        cbx.estadoDental = createCombobox({
            id: 'estadoDental',
            options: () => L.DENTAL || [],
            onSelect: (v) => { state.estadoDental = v || ''; emit(); },
        });

        wireSimpleField('numCama', 'numCama');
        wireSimpleField('numHabitacion', 'numHabitacion');
        chainField('numCama', () => document.getElementById('numHabitacion')?.focus());
        chainField('numHabitacion', () => document.getElementById('servicio')?.focus());

        /* Fase B: estados con auto-colapso encadenados */
        const groups = ESTADOS.map((cfg) => `[data-estado="${cfg.field}"]`);
        setupEstadoGroup(ESTADOS[0], () => firstEstadoEntry(document.querySelector(groups[1]))?.focus());
        setupEstadoGroup(ESTADOS[1], () => firstEstadoEntry(document.querySelector(groups[2]))?.focus());
        setupEstadoGroup(ESTADOS[2], () => document.querySelector('#escalasBlock .multi-add-input')?.focus());

        const escalasCat = () => NL().escalas.map((e2) => ({ label: e2.nombre, meta: e2 }));
        escalasUI = createMultiAdd({
            pickerWrap: document.getElementById('escalasPicker'),
            options: escalasCat,
            toggleLabel: 'Escalas de valoración',
            placeholder: 'Buscar escala (Glasgow, EVA, Braden…)',
            getUsed: () => state.escalas.map((e2) => e2.nombre),
            onAdd: (nombre) => {
                const meta = NL().escalas.find((e2) => e2.nombre === nombre);
                if (!meta) return;
                state.sinEscalas = false;
                syncNoneChoice('sinEscalasBtn', false);
                state.escalas.push({ id: uid(), nombre: meta.nombre, corto: meta.corto, min: meta.min, max: meta.max, step: meta.step || 1, display: meta.display, puntaje: '' });
                renderEscalas();
                setTimeout(() => {
                    const inputs = document.querySelectorAll('#escalasList .escala-puntaje');
                    inputs[inputs.length - 1]?.focus();
                }, 0);
            },
        });

        /* Fase C */
        wireSimpleField('diagnosticoMedico', 'diagnosticoMedico');
        chainField('diagnosticoMedico', () => document.getElementById('aislamiento')?.focus());
        fillSelect(document.getElementById('aislamiento'), L.AISLAMIENTO);
        const ais = document.getElementById('aislamiento');
        if (ais) {
            ais.value = 'No aplica';
            ais.addEventListener('change', () => { state.aislamiento = ais.value || 'No aplica'; emit(); });
        }

        dispositivosUI = createMultiAdd({
            pickerWrap: document.getElementById('dispositivosPicker'),
            options: () => (L.DISPOSITIVOS || []).map((d) => ({ label: d })),
            toggleLabel: 'Dispositivos presentes',
            placeholder: 'Buscar dispositivo (CVC, SNG, Foley…)',
            getUsed: () => state.dispositivos.map((d) => d.nombre),
            onAdd: (nombre) => {
                state.sinDispositivos = false;
                syncNoneChoice('sinDispositivosBtn', false);
                state.dispositivos.push({ id: uid(), nombre, fechaInsercion: '', fechaCuracion: '', estado: '' });
                renderDispositivos();
                setTimeout(() => {
                    const cards = document.querySelectorAll('#dispositivosList .multi-add-item');
                    cards[cards.length - 1]?.querySelector('.dev-fecha-ins')?.focus();
                }, 0);
            },
        });

        /* Fase D */
        const regionesCat = () => {
            const out = [];
            NL().regionesGrupos.forEach((g) => {
                out.push({ group: g.titulo });
                g.items.forEach((r) => out.push({ label: r }));
            });
            return out;
        };
        regionesUI = createMultiAdd({
            pickerWrap: document.getElementById('regionesPicker'),
            options: regionesCat,
            toggleLabel: 'Sistema o región anatómica',
            placeholder: 'Buscar sistema o región (tegumentario, abdomen, miembro…)',
            getUsed: () => state.regiones,
            keepOpen: true,
            onAdd: (nombre) => {
                state.sinAlteraciones = false;
                syncNoneChoice('sinAlteracionesBtn', false);
                state.regiones.push(nombre);
                renderRegiones();
            },
        });

        const educationLegacyPicker = document.getElementById('educacionPicker');
        if (educationLegacyPicker) educationLegacyPicker.hidden = true;
        setupEduQuick();

        document.getElementById('sinEscalasBtn')?.addEventListener('click', () => setNoneChoice('escalas', !state.sinEscalas));
        document.getElementById('sinDispositivosBtn')?.addEventListener('click', () => setNoneChoice('dispositivos', !state.sinDispositivos));
        document.getElementById('sinAlteracionesBtn')?.addEventListener('click', () => setNoneChoice('alteraciones', !state.sinAlteraciones));

        /* Fase F */
        wireSimpleField('respuestaIntervenciones', 'respuesta');
        fillSelect(document.getElementById('tendenciaEvolutiva'), L.TENDENCIA, 'Seleccionar tendencia…');
        const ten = document.getElementById('tendenciaEvolutiva');
        if (ten) ten.addEventListener('change', () => { state.tendencia = ten.value; emit(); });
        wireSimpleField('criterioClinico', 'criterioClinico');
        wireSimpleField('pendientes', 'pendientes');

        renderVigentes();
    }

    window.NotaCampos = {
        state,
        init,
        reset,
        getMissing,
        phaseStatus,
        focusPhase,
        focusFirstPending,
        searchForPhase,
        formatEscalas,
        formatDispositivos,
        formatRegiones,
        formatEducacion,
        formatVigentes,
        setArea(key) {
            const entry = NL().areas.find((a) => a.key === key);
            cbx.areaClinica?.setValue(entry ? entry.label : '');
        },
        setAreaEnabled(enabled) {
            cbx.areaClinica?.setDisabled(!enabled);
            const hint = document.getElementById('areaClinicaHint');
            if (hint) hint.hidden = !!enabled;
        },
    };
})();
