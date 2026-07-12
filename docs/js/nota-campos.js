/* ─── Campos clínicos de la Nota de entrega (fases B, C, D y F + Fase A nueva) ───
   Expone window.NotaCampos. Depende de los helpers globales de app.js
   (createOption, setupOptionList, filterOptions, focusOption, scrollSoft…),
   pero SOLO en runtime: NotaCampos.init() se llama desde init() de app.js,
   cuando esos helpers ya existen. No referenciar globals en el nivel superior. */
(function () {
    'use strict';

    const NL = () => window.notaListas || { listas: {}, escalas: [], areas: [], regionesGrupos: [] };

    const state = {
        // Fase A (sexo/DOB viven en app.js; la condición clínica se elige dentro del PAE)
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
    const cbx = {};            // comboboxes por id
    let comboboxDelegationReady = false;
    let uidSeq = 0;
    const uid = () => `nc-${++uidSeq}`;

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const noEdu = (dest) => String(dest).startsWith('No fue posible');

    function emit() {
        onChangeCb();
    }

    function revealImmediately(element) {
        const root = document.documentElement;
        const previous = root.style.scrollBehavior;
        root.style.scrollBehavior = 'auto';
        element.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        root.style.scrollBehavior = previous;
    }

    /* ═══════════ Combobox (input buscable + lista desplegable) ═══════════ */
    function createCombobox({ id, options, onSelect, onInvalid, onConfirm }) {
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
            if (!input.isConnected || r.bottom < 0 || r.top > window.innerHeight) { close(); return; }
            const gap = 6;
            const viewportGap = 12;
            const below = window.innerHeight - r.bottom - gap;
            const above = r.top - gap;
            const openAbove = below < 220 && above > below;
            const available = Math.max(openAbove ? above : below, 96);
            const width = Math.min(Math.max(r.width, 220), window.innerWidth - viewportGap * 2);
            const left = Math.min(Math.max(r.left, viewportGap), window.innerWidth - width - viewportGap);
            list.style.position = 'fixed';
            list.style.left = `${Math.round(left)}px`;
            list.style.width = `${Math.round(width)}px`;
            list.style.maxHeight = `${Math.round(Math.min(320, available))}px`;
            list.style.top = openAbove ? 'auto' : `${Math.round(r.bottom + gap)}px`;
            list.style.bottom = openAbove ? `${Math.round(window.innerHeight - r.top + gap)}px` : 'auto';
        }

        function open() {
            if (input.disabled) return;
            const anchor = input.getBoundingClientRect();
            if (anchor.bottom < 0 || anchor.top > window.innerHeight) {
                revealImmediately(input);
                requestAnimationFrame(open);
                return;
            }
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

        function confirmNext() {
            if (onConfirm) setTimeout(onConfirm, 0);
        }

        function commit(optEl, advance = true) {
            const i = Number(optEl.dataset.i);
            const opt = options()[i];
            const label = typeof opt === 'string' ? opt : opt.label;
            const ok = onSelect ? onSelect(opt) : true;
            if (ok === false) { close(); if (onInvalid) onInvalid(); return; }
            committed = label;
            input.value = label;
            wrap.classList.remove('cbx--invalid');
            close();
            if (advance) confirmNext();
        }

        input.addEventListener('focus', open);
        input.addEventListener('click', open);
        input.addEventListener('input', () => { open(); render(input.value); setActive(-1); });
        function handleKeydown(e) {
            if (e._notaCbxHandled) return;
            e._notaCbxHandled = true;
            if (e.key.startsWith('Arrow') && (e.shiftKey || e.ctrlKey || e.metaKey)) return;
            const opts = visibleOpts();
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (list.hidden) { open(); return; }
                setActive(Math.min(activeIdx() + 1, opts.length - 1));
            } else if (e.key === 'ArrowUp') {
                if (list.hidden) return;
                e.preventDefault();
                setActive(Math.max(activeIdx() - 1, 0));
            } else if (e.key === 'Enter') {
                const act = opts[activeIdx()] || (opts.length === 1 ? opts[0] : null);
                if (!list.hidden && act) { e.preventDefault(); commit(act); }
                else if (committed && input.value === committed) {
                    e.preventDefault();
                    close();
                    confirmNext();
                }
            } else if (e.key === 'Escape') {
                if (!list.hidden) { e.preventDefault(); input.value = committed; close(); }
            }
        }
        input.addEventListener('keydown', handleKeydown);
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
                    if (el) { commit(el, false); return; }
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
            handleKeydown,
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

    function setupComboboxDelegation() {
        if (comboboxDelegationReady) return;
        comboboxDelegationReady = true;
        document.addEventListener('focusin', (e) => {
            const control = cbx[e.target?.id];
            if (control?.input === e.target) control.open();
        }, true);
        document.addEventListener('keydown', (e) => {
            const control = cbx[e.target?.id];
            if (control?.input === e.target) control.handleKeydown(e);
        }, true);
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
            },
            onConfirm: chainNext,
        });
        group._expand = (focus) => { if (focus) cbx[field]?.input.focus(); };
        group._search = cbx[field]?.input;
    }

    /* ═══════════ Multi-add genérico (picker con buscador + tarjetas) ═══════════ */
    function createMultiAdd({ pickerWrap, options, toggleLabel, placeholder, getUsed, onAdd, onRemove, keepOpen, onFinish, renderExtra }) {
        pickerWrap.innerHTML = '';
        const pickerId = `${pickerWrap.id || uid()}-listbox`;
        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'multi-add-input cbx-input';
        search.placeholder = placeholder || toggleLabel || 'Buscar o seleccionar…';
        search.autocomplete = 'off';
        search.setAttribute('role', 'combobox');
        search.setAttribute('aria-autocomplete', 'list');
        search.setAttribute('aria-haspopup', 'listbox');
        search.setAttribute('aria-controls', pickerId);
        search.setAttribute('aria-expanded', 'false');
        search.setAttribute('aria-label', toggleLabel || placeholder || 'Seleccionar opciones');
        search.setAttribute('aria-keyshortcuts', 'Shift+Enter Shift+Backspace');

        const picker = document.createElement('div');
        picker.className = 'cbx-list cbx-list--portal multi-cbx-list';
        picker.id = pickerId;
        picker.setAttribute('role', 'listbox');
        picker.setAttribute('aria-multiselectable', 'true');
        picker.hidden = true;
        pickerWrap.append(search);
        document.body.appendChild(picker);

        let openNow = false;
        const visibleOpts = () => [...picker.querySelectorAll('.cbx-opt')];
        const activeIdx = () => visibleOpts().findIndex((opt) => opt.classList.contains('cbx-opt--active'));

        function setActive(idx) {
            const visible = visibleOpts();
            visible.forEach((opt, i) => opt.classList.toggle('cbx-opt--active', i === idx));
            const active = visible[idx];
            if (active) {
                search.setAttribute('aria-activedescendant', active.id);
                active.scrollIntoView({ block: 'nearest' });
            } else search.removeAttribute('aria-activedescendant');
        }

        function renderPicker() {
            const q = norm(search.value.trim());
            const used = new Set(getUsed());
            const previousValue = visibleOpts()[activeIdx()]?.dataset.value;
            picker.innerHTML = '';
            options().forEach((entry, index) => {
                if (entry.group) {
                    const title = document.createElement('div');
                    title.className = 'region-group-title';
                    title.textContent = entry.group;
                    title.dataset.group = '1';
                    picker.appendChild(title);
                    return;
                }
                const label = entry.label;
                if (q && !norm(label).includes(q)) return;
                const selected = used.has(label);
                const opt = document.createElement('div');
                opt.className = `cbx-opt${selected ? ' cbx-opt--selected' : ''}`;
                opt.id = `${pickerId}-opt-${index}`;
                opt.dataset.value = label;
                opt.setAttribute('role', 'option');
                opt.setAttribute('aria-selected', selected ? 'true' : 'false');
                opt.innerHTML = `<span class="multi-cbx-check" aria-hidden="true">${selected ? '&#10003;' : ''}</span><span>${esc(label)}</span>`;
                picker.appendChild(opt);
            });
            [...picker.querySelectorAll('[data-group]')].forEach((title) => {
                let sibling = title.nextElementSibling;
                let hasChild = false;
                while (sibling && !sibling.dataset.group) {
                    if (sibling.classList.contains('cbx-opt')) { hasChild = true; break; }
                    sibling = sibling.nextElementSibling;
                }
                title.style.display = hasChild ? '' : 'none';
            });
            if (!picker.querySelector('.cbx-opt')) picker.innerHTML = '<div class="cbx-empty">Sin coincidencias</div>';
            const restored = previousValue ? visibleOpts().findIndex((opt) => opt.dataset.value === previousValue) : -1;
            setActive(restored);
        }

        function positionPicker() {
            if (!openNow) return;
            const rect = search.getBoundingClientRect();
            if (!search.isConnected || rect.bottom < 0 || rect.top > window.innerHeight) { closePicker(); return; }
            const gap = 6;
            const viewportGap = 12;
            const below = window.innerHeight - rect.bottom - gap;
            const above = rect.top - gap;
            const openAbove = below < 220 && above > below;
            const available = Math.max(openAbove ? above : below, 96);
            const width = Math.min(Math.max(rect.width, 320), window.innerWidth - viewportGap * 2);
            const left = Math.min(Math.max(rect.left, viewportGap), window.innerWidth - width - viewportGap);
            picker.style.left = `${Math.round(left)}px`;
            picker.style.width = `${Math.round(width)}px`;
            picker.style.maxHeight = `${Math.round(Math.min(320, available))}px`;
            picker.style.top = openAbove ? 'auto' : `${Math.round(rect.bottom + gap)}px`;
            picker.style.bottom = openAbove ? `${Math.round(window.innerHeight - rect.top + gap)}px` : 'auto';
        }

        function openPicker() {
            const anchor = search.getBoundingClientRect();
            if (anchor.bottom < 0 || anchor.top > window.innerHeight) {
                revealImmediately(search);
                requestAnimationFrame(openPicker);
                return;
            }
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
            setActive(-1);
        }

        function toggleOption(opt) {
            if (!opt) return;
            const value = opt.dataset.value;
            if (getUsed().includes(value)) onRemove?.(value);
            else onAdd(value);
            emit();
            if (keepOpen) {
                renderPicker();
                search.focus();
                positionPicker();
            } else closePicker();
        }

        function finishSelection(e) {
            if (!onFinish) return false;
            e.preventDefault();
            e.stopPropagation();
            closePicker();
            onFinish();
            return true;
        }

        search.addEventListener('focus', openPicker);
        search.addEventListener('click', openPicker);
        search.addEventListener('input', () => { openPicker(); renderPicker(); });
        search.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                finishSelection(e);
                return;
            }
            if (e.key.startsWith('Arrow') && (e.shiftKey || e.ctrlKey || e.metaKey)) return;
            if (e.key === 'Tab') {
                closePicker();
                return;
            }
            if (e.key === 'ArrowRight' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
                && search.selectionStart === search.value.length && search.selectionEnd === search.value.length) {
                const alternative = pickerWrap.closest('.selection-choice-row')?.querySelector('.none-choice');
                if (alternative) {
                    e.preventDefault();
                    e.stopPropagation();
                    closePicker();
                    alternative.focus();
                    return;
                }
            }
            if (e.key === 'Enter') {
                const active = visibleOpts()[activeIdx()] || (visibleOpts().length === 1 ? visibleOpts()[0] : null);
                if (active) { e.preventDefault(); toggleOption(active); }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!openNow) openPicker();
                setActive(Math.min(activeIdx() + 1, visibleOpts().length - 1));
            } else if (e.key === 'ArrowUp') {
                if (!openNow) return;
                e.preventDefault();
                setActive(Math.max(activeIdx() - 1, 0));
            } else if (e.key === 'Backspace' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && getUsed().length) {
                e.preventDefault();
                onRemove?.(getUsed()[getUsed().length - 1]);
                emit();
                renderPicker();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closePicker();
                search.focus();
            }
        });
        search.addEventListener('blur', () => setTimeout(() => {
            if (document.activeElement !== search) closePicker();
        }, 120));
        picker.addEventListener('mousedown', (e) => {
            const opt = e.target.closest('.cbx-opt');
            if (!opt) return;
            e.preventDefault();
            toggleOption(opt);
        });
        window.addEventListener('resize', positionPicker);
        window.addEventListener('scroll', positionPicker, true);
        if (renderExtra) renderExtra({ toggleBtn: search, picker });

        return { toggleBtn: search, picker, search, renderPicker, openPicker, closePicker };
    }

    /* ═══════════ Fase B: escalas de valoración con puntaje ═══════════ */
    let escalasUI = null;
    let lastEducationId = null;

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

    function focusStageContinue(stageId) {
        const button = document.querySelector(`[data-flow-continue="${stageId}"]`);
        button?.focus();
        if (button) scrollSoft(button, 'nearest');
    }

    function bindAddedItemShortcut(container, remove, restoreFocus) {
        if (!container) return;
        container.querySelectorAll('input, textarea, select, button').forEach((control) => {
            const current = control.getAttribute('aria-keyshortcuts');
            control.setAttribute('aria-keyshortcuts', [current, 'Shift+Backspace'].filter(Boolean).join(' '));
        });
        container.addEventListener('keydown', (e) => {
            if (e.key !== 'Backspace' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            e.preventDefault();
            e.stopPropagation();
            remove();
            setTimeout(restoreFocus, 0);
        });
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
                return !bad && item.puntaje !== '';
            };
            input.addEventListener('input', () => { validate(); emit(); });
            input.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
                e.preventDefault();
                if (!validate()) return;
                emit();
                escalasUI?.search.focus();
            });
            const remove = () => {
                state.escalas = state.escalas.filter((e2) => e2.id !== item.id);
                renderEscalas();
                escalasUI?.renderPicker();
                emit();
            };
            card.querySelector('.multi-add-remove').addEventListener('click', remove);
            bindAddedItemShortcut(card, remove, () => escalasUI?.search.focus());
            wrap.appendChild(card);
        });
    }

    /* ═══════════ Fase C: dispositivos con subcampos ═══════════ */
    let dispositivosUI = null;

    function isoToDMY(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
    }

    function todayIso() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    function validateClinicalDate(value, { min = '1900-01-01', max = todayIso(), required = false } = {}) {
        if (!value) return { valid: !required, empty: true, message: required ? 'Ingrese una fecha completa' : '' };
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!match) return { valid: false, empty: false, message: 'Use una fecha con año de cuatro dígitos' };
        const [, yearText, monthText, dayText] = match;
        const year = Number(yearText);
        const month = Number(monthText);
        const day = Number(dayText);
        const date = new Date(Date.UTC(year, month - 1, day));
        const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
        if (!real) return { valid: false, empty: false, message: 'Ingrese una fecha real' };
        if ((min && value < min) || (max && value > max)) {
            return { valid: false, empty: false, message: `Ingrese una fecha entre ${isoToDMY(min)} y ${isoToDMY(max)}` };
        }
        return { valid: true, empty: false, message: '' };
    }

    /* Enmascara dígitos sueltos como DD/MM/AAAA (inserta las barras automáticamente) */
    function maskDMY(raw) {
        const digits = String(raw).replace(/\D/g, '').slice(0, 8);
        const dd = digits.slice(0, 2);
        const mm = digits.slice(2, 4);
        const yy = digits.slice(4, 8);
        let out = dd;
        if (digits.length > 2) out = `${dd}/${mm}`;
        if (digits.length > 4) out = `${dd}/${mm}/${yy}`;
        return out;
    }

    /* Convierte "DD/MM/AAAA" → ISO "AAAA-MM-DD" (o '' si está incompleta) */
    function dmyToIso(display) {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display || '');
        return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
    }

    /* Campo de fecha clínico en formato colombiano DD/MM/AAAA (híbrido).
       - Input de TEXTO visible: muestra y acepta DD/MM/AAAA en cualquier navegador
         o configuración regional (el `type="date"` nativo mostraría MM/DD/YYYY).
       - Selector de calendario: un `type="date"` invisible superpuesto se abre al
         hacer clic en el campo o en el icono, y su selección se vuelca al texto.
       Ambas vías de ingreso conviven. El ISO (fuente de verdad) vive en dataset.iso;
       onChange recibe siempre ISO ('' mientras esté incompleta o inválida). */
    function setupClinicalDateInput(input, onChange, { required = false, nextFocus, min = '1900-01-01', max = todayIso() } = {}) {
        if (!input || input.dataset.clinicalReady) return;
        input.dataset.clinicalReady = '1';
        input.type = 'text';
        input.inputMode = 'numeric';
        input.maxLength = 10;
        input.autocomplete = 'off';
        input.placeholder = 'DD/MM/AAAA';
        input.classList.add('clinical-date-input');
        if (required) input.setAttribute('aria-required', 'true');
        else input.removeAttribute('aria-required');

        // Envolver el campo para alojar el input de texto + el calendario nativo + el icono
        const field = document.createElement('div');
        field.className = 'clinical-date-field';
        input.parentNode.insertBefore(field, input);
        field.appendChild(input);

        // Calendario nativo invisible: solo aporta el selector (no su formato de texto)
        const native = document.createElement('input');
        native.type = 'date';
        native.className = 'clinical-date-native';
        native.tabIndex = -1;
        native.setAttribute('aria-hidden', 'true');
        native.min = min;
        native.max = max;
        field.appendChild(native);

        const calBtn = document.createElement('button');
        calBtn.type = 'button';
        calBtn.className = 'clinical-date-cal';
        calBtn.tabIndex = -1;
        calBtn.setAttribute('aria-label', 'Abrir calendario');
        calBtn.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 9.5h18"/></svg>';
        field.appendChild(calBtn);

        // Estado inicial: si trae ISO previo (re-render de dispositivo), mostrarlo DD/MM/AAAA
        if (input.dataset.iso) {
            input.value = isoToDMY(input.dataset.iso);
            native.value = input.dataset.iso;
        }

        const evaluate = (final = false) => {
            const complete = /^\d{2}\/\d{2}\/\d{4}$/.test(input.value);
            const iso = dmyToIso(input.value);
            let result;
            if (!input.value) {
                result = { valid: !required, empty: true, message: required ? 'Ingrese una fecha completa' : '' };
            } else if (!complete) {
                // Mientras se escribe no se marca error; solo al perder foco o confirmar
                result = { valid: false, empty: !final, message: final ? 'Complete la fecha con formato DD/MM/AAAA' : '' };
            } else {
                result = validateClinicalDate(iso, { min, max, required });
            }
            input.dataset.iso = result.valid ? iso : '';
            if (result.valid) native.value = iso;
            input.setCustomValidity(result.message || '');
            input.classList.toggle('clinical-date-invalid', !result.valid && !result.empty);
            return { result, iso: result.valid ? iso : '' };
        };

        // ── Escritura manual ──
        input.addEventListener('input', () => {
            const masked = maskDMY(input.value);
            if (masked !== input.value) input.value = masked;
            const { result, iso } = evaluate(false);
            onChange(iso, result);
        });
        input.addEventListener('blur', () => { evaluate(true); });
        input.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            const { result, iso } = evaluate(true);
            if (!result.valid) return;
            e.preventDefault();
            onChange(iso, result);
            nextFocus?.();
        });

        // ── Selección desde el calendario nativo ──
        const commitFromNative = () => {
            if (!native.value) return;
            input.value = isoToDMY(native.value);
            const { result, iso } = evaluate(true);
            onChange(iso, result);
        };
        native.addEventListener('input', commitFromNative);
        native.addEventListener('change', commitFromNative);

        // ── Abrir el calendario (clic en el campo o en el icono) sin perder la escritura ──
        const openCalendar = () => {
            native.value = dmyToIso(input.value) || '';
            if (typeof native.showPicker === 'function') {
                try { native.showPicker(); return; } catch (_) {}
            }
            native.focus();
            native.click();
        };
        input.addEventListener('click', openCalendar);
        calBtn.addEventListener('click', (e) => { e.preventDefault(); input.focus(); openCalendar(); });

        evaluate(false);
        return { validate: () => evaluate(true).result };
    }

    function setupDeviceDateInput(input, onChange, options = {}) {
        return setupClinicalDateInput(input, onChange, options);
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
                        <input type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" class="dev-fecha-ins clinical-date-input" data-iso="${esc(item.fechaInsercion)}" autocomplete="off" aria-label="Fecha de inserción de ${esc(item.nombre)}, formato día, mes y año">
                    </div>
                    <div class="field-group">
                        <label>Última curación <span class="label-optional">(opcional)</span></label>
                        <input type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" class="dev-fecha-cur clinical-date-input" data-iso="${esc(item.fechaCuracion)}" autocomplete="off" aria-label="Fecha de última curación de ${esc(item.nombre)}, formato día, mes y año">
                    </div>
                    <div class="field-group field-group--wide">
                        <label>Estado del dispositivo <span class="required-star" aria-label="obligatorio">*</span></label>
                        <select class="dev-estado field-select" aria-label="Estado de ${esc(item.nombre)}"></select>
                    </div>
                </div>`;
            const sel = card.querySelector('.dev-estado');
            fillSelect(sel, estados, 'Seleccionar estado…');
            if (item.estado) sel.value = item.estado;

            const remove = () => {
                state.dispositivos = state.dispositivos.filter((d) => d.id !== item.id);
                renderDispositivos();
                dispositivosUI?.renderPicker();
                emit();
            };
            card.querySelector('.multi-add-remove').addEventListener('click', remove);
            const insertion = card.querySelector('.dev-fecha-ins');
            const healing = card.querySelector('.dev-fecha-cur');
            setupDeviceDateInput(insertion, (value) => { item.fechaInsercion = value; emit(); }, {
                required: true,
                nextFocus: () => healing?.focus(),
            });
            setupDeviceDateInput(healing, (value) => { item.fechaCuracion = value; emit(); }, {
                nextFocus: () => sel.focus(),
            });
            sel.addEventListener('change', () => { item.estado = sel.value; emit(); });
            let statusFocusAt = 0;
            sel.addEventListener('focus', () => { statusFocusAt = performance.now(); });
            const confirmStatus = (e) => {
                if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || !sel.value) return;
                e.preventDefault();
                item.estado = sel.value;
                emit();
                const nextCard = card.nextElementSibling;
                const nextField = nextCard?.querySelector('.dev-fecha-ins');
                if (nextField) nextField.focus();
                else focusStageContinue('faseC');
            };
            sel.addEventListener('keydown', confirmStatus);
            sel.addEventListener('keyup', (e) => {
                if (performance.now() - statusFocusAt > 20) confirmStatus(e);
            });
            bindAddedItemShortcut(card, remove, () => dispositivosUI?.search.focus());
            wrap.appendChild(card);
        });
    }

    /* ═══════════ Fase D: regiones (chips) y educación ═══════════ */
    let regionesUI = null;

    function focusEducationEntry() {
        const target = document.querySelector('#eduQuick .edu-quick-btn')
            || document.querySelector('[data-flow-continue="faseD"]');
        target?.focus();
        if (target) scrollSoft(target, 'nearest');
    }

    function focusEducationCompletion() {
        const pendingTopic = [...document.querySelectorAll('#educacionList .edu-tema')]
            .find((field) => !field.value.trim());
        if (pendingTopic) pendingTopic.focus();
        else focusStageContinue('faseD');
    }

    function focusEducationTopicsStart() {
        const firstTopic = document.querySelector('#educacionList .edu-tema');
        if (firstTopic) firstTopic.focus();
        else focusStageContinue('faseD');
    }

    function educationWritingTarget() {
        const topics = [...document.querySelectorAll('#educacionList .edu-tema')];
        if (!topics.length) return null;
        const firstEmpty = topics.find((field) => !field.value.trim());
        if (firstEmpty) return firstEmpty;
        const lastSelected = lastEducationId
            ? topics.find((field) => field.dataset.eduId === lastEducationId)
            : null;
        return lastSelected || topics.at(-1);
    }

    function focusScaleCompletion() {
        const pending = [...document.querySelectorAll('#escalasList .escala-puntaje')]
            .find((input) => !input.value.trim() || input.classList.contains('puntaje-invalid'));
        if (pending) pending.focus();
        else if (state.escalas.length || state.sinEscalas) focusStageContinue('faseB');
        else escalasUI?.search.focus();
    }

    function focusDeviceCompletion() {
        const cards = [...document.querySelectorAll('#dispositivosList .multi-add-item')];
        for (const card of cards) {
            const insertion = card.querySelector('.dev-fecha-ins');
            const status = card.querySelector('.dev-estado');
            if (insertion && !insertion.dataset.iso) { insertion.focus(); return; }
            if (status && !status.value) { status.focus(); return; }
        }
        if (state.dispositivos.length || state.sinDispositivos) focusStageContinue('faseC');
        else dispositivosUI?.search.focus();
    }

    function bindNoneChoice(buttonId, kind, nextFocus) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        button.addEventListener('click', () => setNoneChoice(kind, button.getAttribute('aria-pressed') !== 'true'));
        button.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const search = button.closest('.selection-choice-row')?.querySelector('.multi-add-input');
                if (search) {
                    e.preventDefault();
                    e.stopPropagation();
                    search.focus();
                }
                return;
            }
            if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            e.preventDefault();
            const activate = button.getAttribute('aria-pressed') !== 'true';
            setNoneChoice(kind, activate);
            if (activate) setTimeout(nextFocus, 0);
        });
    }

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
            const remove = () => {
                state.regiones = state.regiones.filter((r) => r !== nombre);
                renderRegiones();
                regionesUI?.renderPicker();
                emit();
            };
            chip.addEventListener('click', remove);
            chip.addEventListener('keydown', (e) => {
                if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    const chips = [...wrap.querySelectorAll('.region-chip')];
                    const next = chips[chips.indexOf(chip) + (e.key === 'ArrowRight' ? 1 : -1)];
                    if (next) {
                        e.preventDefault();
                        e.stopPropagation();
                        next.focus();
                    }
                    return;
                }
                if (e.key !== 'Enter' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
                e.preventDefault();
                e.stopPropagation();
                regionesUI?.closePicker();
                focusEducationEntry();
            });
            chip.addEventListener('keydown', (e) => {
                if (e.key !== 'Backspace' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
                e.preventDefault();
                e.stopPropagation();
                remove();
                setTimeout(() => regionesUI?.search.focus(), 0);
            });
            chip.setAttribute('aria-keyshortcuts', 'Enter Shift+Enter Shift+Backspace');
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
            card.dataset.eduId = item.id;
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
            const remove = () => {
                state.educacion = state.educacion.filter((e2) => e2.id !== item.id);
                if (lastEducationId === item.id) lastEducationId = state.educacion.at(-1)?.id || null;
                renderEducacion();
                emit();
            };
            const removeButton = card.querySelector('.multi-add-remove');
            removeButton.tabIndex = -1;
            removeButton.addEventListener('mousedown', (e) => e.preventDefault());
            removeButton.addEventListener('click', remove);
            const ta = card.querySelector('.edu-tema');
            if (ta) {
                ta.dataset.eduId = item.id;
                ta.addEventListener('input', () => { item.tema = ta.value.trim(); emit(); });
                ta.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowLeft' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
                        && ta.selectionStart === 0 && ta.selectionEnd === 0) {
                        e.preventDefault();
                        e.stopPropagation();
                        removeButton.focus();
                        return;
                    }
                    if (e.key !== 'Enter' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
                    e.preventDefault();
                    e.stopPropagation();
                    item.tema = ta.value.trim();
                    emit();
                    focusEducationCompletion();
                });
                removeButton.addEventListener('keydown', (e) => {
                    if (e.key !== 'ArrowRight' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
                    e.preventDefault();
                    e.stopPropagation();
                    ta.focus();
                    ta.setSelectionRange(0, 0);
                });
            }
            bindAddedItemShortcut(card, remove, () => {
                [...document.querySelectorAll('#eduQuick .edu-quick-btn')]
                    .find((button) => button.dataset.eduDest === item.destinatario)?.focus();
            });
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
            btn.setAttribute('aria-keyshortcuts', 'Enter Space Shift+Enter Shift+Backspace');
            btn.textContent = dest
                .replace('Familiar directo (cónyuge / padre / madre / hijo/a)', 'Familiar directo')
                .replace('No fue posible brindar educación – ', 'No fue posible: ');
            btn.title = dest;
            btn.addEventListener('click', (e) => {
                const existing = state.educacion.find((e2) => e2.destinatario === dest);
                if (existing) {
                    state.educacion = state.educacion.filter((e2) => e2.id !== existing.id);
                    if (lastEducationId === existing.id) lastEducationId = state.educacion.at(-1)?.id || null;
                } else {
                    const added = { id: uid(), destinatario: dest, tema: '' };
                    state.educacion.push(added);
                    lastEducationId = added.id;
                }
                renderEducacion();
                emit();
            });
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    focusEducationTopicsStart();
                    return;
                }
                if (e.key === 'ArrowDown' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && btn.getAttribute('aria-pressed') === 'true') {
                    const entry = state.educacion.find((item) => item.destinatario === dest);
                    const topic = entry && document.querySelector(`#educacionList .edu-tema[data-edu-id="${entry.id}"]`);
                    if (topic) {
                        e.preventDefault();
                        e.stopPropagation();
                        topic.focus();
                    }
                    return;
                }
                if (e.key !== 'Backspace' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || btn.getAttribute('aria-pressed') !== 'true') return;
                e.preventDefault();
                e.stopPropagation();
                state.educacion = state.educacion.filter((item) => item.destinatario !== dest);
                if (lastEducationId && !state.educacion.some((item) => item.id === lastEducationId)) {
                    lastEducationId = state.educacion.at(-1)?.id || null;
                }
                renderEducacion();
                emit();
                [...document.querySelectorAll('#eduQuick .edu-quick-btn')]
                    .find((candidate) => candidate.dataset.eduDest === dest)?.focus();
            });
            wrap.appendChild(btn);
        });
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
    function searchForPhase(id, origin = document.activeElement) {
        const phase = document.getElementById(id);
        if (!phase) return null;
        if (id === 'faseD') {
            const topic = educationWritingTarget();
            if (topic?.offsetParent !== null) return topic;
        }
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
                const bad = [...document.querySelectorAll('#dispositivosList .dev-fecha-ins')].find((i) => !i.dataset.iso)
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
                [!document.getElementById('metaLograda')?.value, '__meta__'],
                [!state.criterioClinico, 'criterioClinico'],
                [!state.pendientes, 'pendientes'],
            ];
            const hit = seq.find(([miss]) => miss);
            if (hit) {
                if (hit[1] === '__meta__') {
                    const meta = document.querySelector('#metaSeg [role="radio"][tabindex="0"]')
                        || document.querySelector('#metaSeg [role="radio"]');
                    meta?.focus();
                } else document.getElementById(hit[1])?.focus();
                return true;
            }
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

    function bindSelectConfirm(select, onChange, nextFocus) {
        if (!select) return;
        let focusAt = 0;
        select.addEventListener('focus', () => { focusAt = performance.now(); });
        select.addEventListener('change', onChange);
        const confirm = (e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || !select.value) return;
            e.preventDefault();
            onChange();
            nextFocus?.();
        };
        select.addEventListener('keydown', confirm);
        select.addEventListener('keyup', (e) => {
            if (performance.now() - focusAt > 20) confirm(e);
        });
    }

    /* ═══════════ Reset ═══════════ */
    function resetPhase(id) {
        if (id === 'patient') {
            Object.assign(state, { posicion: '', numCama: '', numHabitacion: '', servicio: '' });
            cbx.posicion?.setValue('');
            cbx.servicio?.setValue('');
            ['numCama', 'numHabitacion'].forEach((fieldId) => {
                const field = document.getElementById(fieldId);
                if (field) field.value = '';
            });
        } else if (id === 'faseB') {
            Object.assign(state, {
                estadoNeurologico: '', estadoHemodinamico: '', estadoRespiratorio: '',
                escalas: [], sinEscalas: false,
            });
            ['estadoNeurologico', 'estadoHemodinamico', 'estadoRespiratorio'].forEach((fieldId) => cbx[fieldId]?.setValue(''));
            document.querySelectorAll('.estado-group').forEach((group) => group.classList.remove('estado-group--done'));
            renderEscalas();
            syncNoneChoice('sinEscalasBtn', false);
            escalasUI?.renderPicker();
        } else if (id === 'faseC') {
            Object.assign(state, {
                diagnosticoMedico: '', aislamiento: 'No aplica', estadoDental: '',
                dispositivos: [], sinDispositivos: false,
            });
            const diagnosis = document.getElementById('diagnosticoMedico');
            const isolation = document.getElementById('aislamiento');
            if (diagnosis) diagnosis.value = '';
            if (isolation) isolation.value = 'No aplica';
            cbx.estadoDental?.setValue('');
            renderDispositivos();
            syncNoneChoice('sinDispositivosBtn', false);
            dispositivosUI?.renderPicker();
        } else if (id === 'faseD') {
            Object.assign(state, { regiones: [], sinAlteraciones: false, educacion: [] });
            lastEducationId = null;
            renderRegiones();
            renderEducacion();
            syncNoneChoice('sinAlteracionesBtn', false);
            regionesUI?.renderPicker();
        } else if (id === 'faseF') {
            Object.assign(state, { respuesta: '', tendencia: '', criterioClinico: '', pendientes: '' });
            ['respuestaIntervenciones', 'criterioClinico', 'pendientes'].forEach((fieldId) => {
                const field = document.getElementById(fieldId);
                if (field) field.value = '';
            });
            cbx.tendenciaEvolutiva?.setValue('');
        } else return false;
        closeMenus();
        emit();
        return true;
    }

    function reset() {
        Object.assign(state, {
            posicion: '', numCama: '', numHabitacion: '', servicio: '',
            estadoNeurologico: '', estadoHemodinamico: '', estadoRespiratorio: '',
            escalas: [], sinEscalas: false, diagnosticoMedico: '', aislamiento: 'No aplica', estadoDental: '',
            dispositivos: [], sinDispositivos: false, regiones: [], sinAlteraciones: false, educacion: [],
            respuesta: '', tendencia: '', criterioClinico: '', pendientes: '',
        });
        lastEducationId = null;
        ['posicion', 'servicio', 'estadoDental', 'estadoNeurologico', 'estadoHemodinamico', 'estadoRespiratorio'].forEach((id) => cbx[id]?.setValue(''));
        ['numCama', 'numHabitacion', 'diagnosticoMedico', 'respuestaIntervenciones', 'criterioClinico', 'pendientes'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const ais = document.getElementById('aislamiento');
        if (ais) ais.value = 'No aplica';
        cbx.tendenciaEvolutiva?.setValue('');
        document.querySelectorAll('.estado-group').forEach((g) => g.classList.remove('estado-group--done'));
        document.querySelectorAll('.multi-add-picker').forEach((p) => { p.hidden = true; });
        document.querySelectorAll('.multi-add-input').forEach((t) => t.setAttribute('aria-expanded', 'false'));
        renderEscalas();
        renderDispositivos();
        renderRegiones();
        renderEducacion();
        syncNoneChoice('sinEscalasBtn', false);
        syncNoneChoice('sinDispositivosBtn', false);
        syncNoneChoice('sinAlteracionesBtn', false);
        escalasUI?.renderPicker();
        dispositivosUI?.renderPicker();
        regionesUI?.renderPicker();
    }

    /* ═══════════ Init ═══════════ */
    function init({ onChange } = {}) {
        onChangeCb = onChange || (() => {});
        const L = NL().listas;

        /* Fase A: comboboxes + encadenado de teclado */
        cbx.posicion = createCombobox({
            id: 'posicion',
            options: () => L.POSICION || [],
            onSelect: (v) => { state.posicion = v || ''; emit(); },
            onConfirm: () => document.getElementById('numCama')?.focus(),
        });
        cbx.servicio = createCombobox({
            id: 'servicio',
            options: () => L.SERVICIO || [],
            onSelect: (v) => { state.servicio = v || ''; emit(); },
            onConfirm: () => focusStageContinue('patient'),
        });
        cbx.estadoDental = createCombobox({
            id: 'estadoDental',
            options: () => L.DENTAL || [],
            onSelect: (v) => { state.estadoDental = v || ''; emit(); },
            onConfirm: () => dispositivosUI?.search.focus(),
        });
        setupComboboxDelegation();

        wireSimpleField('numCama', 'numCama');
        wireSimpleField('numHabitacion', 'numHabitacion');
        chainField('numCama', () => document.getElementById('numHabitacion')?.focus());
        chainField('numHabitacion', () => {
            document.getElementById('servicio')?.focus();
            cbx.servicio?.open();
        });

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
            onRemove: (nombre) => {
                state.escalas = state.escalas.filter((item) => item.nombre !== nombre);
                renderEscalas();
            },
            onFinish: focusScaleCompletion,
        });

        /* Fase C */
        wireSimpleField('diagnosticoMedico', 'diagnosticoMedico');
        chainField('diagnosticoMedico', () => document.getElementById('aislamiento')?.focus());
        fillSelect(document.getElementById('aislamiento'), L.AISLAMIENTO);
        const ais = document.getElementById('aislamiento');
        if (ais) {
            ais.value = 'No aplica';
            bindSelectConfirm(ais,
                () => { state.aislamiento = ais.value || 'No aplica'; emit(); },
                () => document.getElementById('estadoDental')?.focus());
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
            onRemove: (nombre) => {
                state.dispositivos = state.dispositivos.filter((item) => item.nombre !== nombre);
                renderDispositivos();
            },
            onFinish: focusDeviceCompletion,
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
            onRemove: (nombre) => {
                state.regiones = state.regiones.filter((region) => region !== nombre);
                renderRegiones();
            },
            onFinish: focusEducationEntry,
        });

        const educationLegacyPicker = document.getElementById('educacionPicker');
        if (educationLegacyPicker) educationLegacyPicker.hidden = true;
        setupEduQuick();

        bindNoneChoice('sinEscalasBtn', 'escalas', () => focusStageContinue('faseB'));
        bindNoneChoice('sinDispositivosBtn', 'dispositivos', () => focusStageContinue('faseC'));
        bindNoneChoice('sinAlteracionesBtn', 'alteraciones', focusEducationEntry);

        /* Fase F */
        wireSimpleField('respuestaIntervenciones', 'respuesta');
        cbx.tendenciaEvolutiva = createCombobox({
            id: 'tendenciaEvolutiva',
            options: () => L.TENDENCIA || [],
            onSelect: (value) => { state.tendencia = value || ''; emit(); },
            onConfirm: () => {
                const meta = document.querySelector('#metaSeg [role="radio"][tabindex="0"]')
                    || document.querySelector('#metaSeg [role="radio"]');
                meta?.focus();
            },
        });
        wireSimpleField('criterioClinico', 'criterioClinico');
        wireSimpleField('pendientes', 'pendientes');

    }

    function closeMenus() {
        Object.values(cbx).forEach((control) => control?.close?.());
        escalasUI?.closePicker();
        dispositivosUI?.closePicker();
        regionesUI?.closePicker();
    }

    window.NotaCampos = {
        state,
        init,
        reset,
        resetPhase,
        getMissing,
        phaseStatus,
        focusPhase,
        focusFirstPending,
        searchForPhase,
        closeMenus,
        setupDateInput: setupClinicalDateInput,
        validateDate: validateClinicalDate,
        formatDate: isoToDMY,
        formatEscalas,
        formatDispositivos,
        formatRegiones,
        formatEducacion,
        formatVigentes,
    };
})();
