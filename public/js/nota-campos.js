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
    const comboControls = new Set();
    const dateControls = new Set();
    const deviceDrafts = new Map();
    let lifecycleController = null;
    let announceFrame = 0;
    let uidSeq = 0;
    const uid = () => `nc-${++uidSeq}`;

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const focusToken = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const noEdu = (dest) => String(dest).startsWith('No fue posible');

    /* Mide el ancho en píxeles de un texto con una fuente dada (canvas reutilizado).
       Sirve para saber dónde termina el texto visible de un input y distinguir
       la "zona de texto" (escribir) de la "zona libre" (abrir calendario). */
    let _measureCtx = null;
    function measureTextWidth(text, font) {
        if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
        _measureCtx.font = font;
        return _measureCtx.measureText(text || '').width;
    }

    function emit() {
        onChangeCb();
    }

    function listen(target, type, handler, options = {}) {
        if (!target) return;
        const signal = lifecycleController?.signal;
        target.addEventListener(type, handler, signal ? { ...options, signal } : options);
    }

    function announce(message) {
        if (!message) return;
        if (typeof window.CareFlowAnnounce === 'function') {
            window.CareFlowAnnounce(message);
            return;
        }
        const region = document.getElementById('actionAnnouncer');
        if (!region) return;
        cancelAnimationFrame(announceFrame);
        region.textContent = '';
        announceFrame = requestAnimationFrame(() => {
            if (region.isConnected) region.textContent = message;
        });
    }

    function offerUndo(message, undo) {
        if (typeof window.CareFlowUndo === 'function') window.CareFlowUndo(message, undo);
    }

    function revealImmediately(element) {
        const root = document.documentElement;
        const previous = root.style.scrollBehavior;
        root.style.scrollBehavior = 'auto';
        element.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        root.style.scrollBehavior = previous;
    }

    /* ═══════════ Combobox (input buscable + lista desplegable) ═══════════ */
    function createCombobox({ id, options, onSelect, onDraft, onInvalid, onConfirm, emptyValue = '', required = true }) {
        const wrap = document.querySelector(`[data-cbx="${id}"]`);
        const input = document.getElementById(id);
        const list = wrap?.querySelector('.cbx-list');
        if (!wrap || !input || !list) return null;

        let draft = input.value.trim();
        let committed = '';
        let invalid = false;
        let openNow = false;
        let destroyed = false;
        let blurTimer = 0;
        let openFrame = 0;
        const events = new AbortController();
        const on = (target, type, handler, options = {}) => {
            target?.addEventListener(type, handler, { ...options, signal: events.signal });
        };
        const listId = `${id}-listbox`;
        const feedbackId = `${id}-feedback`;
        const feedback = document.createElement('div');
        feedback.className = 'cbx-feedback';
        feedback.id = feedbackId;
        feedback.hidden = true;
        wrap.insertBefore(feedback, list);
        list.id = listId;
        const labelledBy = input.getAttribute('aria-labelledby');
        if (labelledBy) list.setAttribute('aria-labelledby', labelledBy);
        else list.setAttribute('aria-label', `Opciones para ${input.getAttribute('aria-label') || 'el campo'}`);
        input.setAttribute('aria-controls', listId);
        input.setAttribute('aria-haspopup', 'listbox');
        if (required) input.setAttribute('aria-required', 'true');
        else input.removeAttribute('aria-required');
        const descriptions = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
        descriptions.add(feedbackId);
        input.setAttribute('aria-describedby', [...descriptions].join(' '));
        input.setAttribute('aria-errormessage', feedbackId);
        input.setAttribute('aria-invalid', 'false');
        const labels = () => options().map((o) => (typeof o === 'string' ? o : o.label));

        function exactIndex(value) {
            return labels().findIndex((label) => norm(label) === norm(value));
        }

        function hasUncommittedDraft() {
            return draft !== committed;
        }

        function hasInvalidDraft() {
            return invalid || (hasUncommittedDraft() && (!!draft || !!emptyValue));
        }

        function setInvalid(active, announce = false) {
            invalid = !!active;
            wrap.classList.toggle('cbx--invalid', invalid);
            input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
            feedback.hidden = !invalid;
            feedback.textContent = invalid ? 'Seleccione una opción válida de la lista.' : '';
            if (invalid && announce && onInvalid) onInvalid();
        }

        function notifyDraft() {
            if (onDraft) onDraft(draft, committed);
            else if (onSelect) onSelect(null);
        }

        function restoreClinicalValue() {
            const index = exactIndex(committed);
            if (committed && index >= 0) {
                const opt = options()[index];
                if (onSelect) onSelect(opt);
            } else if (onSelect) onSelect(null);
        }

        function visibleOpts() { return [...list.querySelectorAll('.cbx-opt')]; }

        function render(filter, announceResults = false) {
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
            if (announceResults) {
                const count = visibleOpts().length;
                announce(count
                    ? `${count} ${count === 1 ? 'opción disponible' : 'opciones disponibles'}.`
                    : 'Sin coincidencias.');
            }
        }

        function positionList() {
            if (!openNow) return;
            const r = input.getBoundingClientRect();
            const viewport = window.visualViewport;
            const viewTop = viewport?.offsetTop || 0;
            const viewLeft = viewport?.offsetLeft || 0;
            const viewWidth = viewport?.width || window.innerWidth;
            const viewHeight = viewport?.height || window.innerHeight;
            const viewRight = viewLeft + viewWidth;
            const viewBottom = viewTop + viewHeight;
            if (!input.isConnected || r.bottom < viewTop || r.top > viewBottom) { close(); return; }
            const gap = 6;
            const viewportGap = 12;
            const below = viewBottom - r.bottom - gap;
            const above = r.top - viewTop - gap;
            const openAbove = below < 220 && above > below;
            const available = Math.max(openAbove ? above : below, 96);
            const width = Math.min(Math.max(r.width, 220), viewWidth - viewportGap * 2);
            const left = Math.min(Math.max(r.left, viewLeft + viewportGap), viewRight - width - viewportGap);
            list.style.position = 'fixed';
            list.style.left = `${Math.round(left)}px`;
            list.style.width = `${Math.round(width)}px`;
            list.style.maxHeight = `${Math.round(Math.min(320, available))}px`;
            list.style.top = openAbove ? 'auto' : `${Math.round(r.bottom + gap)}px`;
            list.style.bottom = openAbove ? `${Math.round(viewBottom - r.top + gap)}px` : 'auto';
        }

        function open() {
            if (destroyed || input.disabled) return;
            let anchor = input.getBoundingClientRect();
            const viewport = window.visualViewport;
            const viewTop = viewport?.offsetTop || 0;
            const viewBottom = viewTop + (viewport?.height || window.innerHeight);
            if (anchor.bottom < viewTop || anchor.top > viewBottom) {
                revealImmediately(input);
                anchor = input.getBoundingClientRect();
                if (anchor.bottom < viewTop || anchor.top > viewBottom) {
                    cancelAnimationFrame(openFrame);
                    openFrame = requestAnimationFrame(open);
                    return;
                }
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
            if (onConfirm) onConfirm();
        }

        function commit(optEl, advance = true) {
            const i = Number(optEl.dataset.i);
            const opt = options()[i];
            const label = typeof opt === 'string' ? opt : opt.label;
            const ok = onSelect ? onSelect(opt) : true;
            if (ok === false) { close(); if (onInvalid) onInvalid(); return; }
            committed = label;
            draft = label;
            input.value = label;
            setInvalid(false);
            close();
            if (advance) confirmNext();
        }

        function commitIndex(index, advance = true) {
            render('');
            const opt = visibleOpts().find((o) => Number(o.dataset.i) === index);
            if (!opt) return false;
            commit(opt, advance);
            return true;
        }

        function restoreCommitted() {
            draft = committed;
            input.value = committed;
            setInvalid(false);
            restoreClinicalValue();
            close();
        }

        function reportValidity(options = {}) {
            if (!hasUncommittedDraft()) { setInvalid(false); return true; }
            const index = exactIndex(draft);
            if (draft && index >= 0) return commitIndex(index, false);
            if (!draft && emptyValue) {
                const defaultIndex = exactIndex(emptyValue);
                if (defaultIndex >= 0) return commitIndex(defaultIndex, false);
            }
            if (!draft) { setInvalid(false); return true; }
            setInvalid(true, options.report !== false);
            return false;
        }

        on(input, 'focus', open);
        on(input, 'click', open);
        on(input, 'input', () => {
            draft = input.value.trim();
            if (hasUncommittedDraft()) notifyDraft();
            else restoreClinicalValue();
            setInvalid(false);
            open();
            render(input.value, true);
            setActive(-1);
        });
        function handleKeydown(e) {
            if (e.key.startsWith('Arrow') && (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey)) return;
            const opts = visibleOpts();
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (list.hidden) {
                    open();
                    const opened = visibleOpts();
                    const selectedIndex = opened.findIndex((option) => option.classList.contains('cbx-opt--selected'));
                    setActive(selectedIndex >= 0 ? selectedIndex : Math.min(0, opened.length - 1));
                    return;
                }
                setActive(Math.min(activeIdx() + 1, opts.length - 1));
            } else if (e.key === 'ArrowUp') {
                if (list.hidden) return;
                e.preventDefault();
                setActive(Math.max(activeIdx() - 1, 0));
            } else if ((e.key === 'Home' || e.key === 'End') && !list.hidden) {
                e.preventDefault();
                setActive(e.key === 'Home' ? 0 : Math.max(opts.length - 1, 0));
            } else if (e.key === 'Enter') {
                if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
                const act = opts[activeIdx()] || (opts.length === 1 ? opts[0] : null);
                if (!list.hidden && act) { e.preventDefault(); commit(act); }
                else if (exactIndex(input.value.trim()) >= 0) {
                    e.preventDefault();
                    commitIndex(exactIndex(input.value.trim()));
                }
                else if (committed && input.value === committed) {
                    e.preventDefault();
                    close();
                    confirmNext();
                }
            } else if (e.key === 'Escape') {
                if (hasUncommittedDraft()) {
                    e.preventDefault();
                    restoreCommitted();
                } else if (!list.hidden) {
                    e.preventDefault();
                    close();
                }
            }
        }
        on(input, 'keydown', handleKeydown);
        // Mantener el foco del combobox con mouse; touch y tecnologías asistivas
        // llegan por `click`, que es la única vía que confirma la opción.
        on(list, 'pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.target.closest('.cbx-opt')) e.preventDefault();
        });
        on(list, 'click', (e) => {
            const opt = e.target.closest('.cbx-opt');
            // El mismo estado se confirma con cualquier modalidad. Solo teclado o
            // activación asistiva avanzan el foco; un tap no abre el siguiente editor.
            if (opt) commit(opt, e.detail === 0);
        });
        on(input, 'blur', () => {
            clearTimeout(blurTimer);
            blurTimer = setTimeout(() => {
                if (destroyed) return;
                if (document.activeElement === input || list.contains(document.activeElement)) return;
                close();
                draft = input.value.trim();
                if (!hasUncommittedDraft()) return;
                // Coincidencia exacta (sin acentos/mayúsculas) → confirmar silenciosamente
                const idx = exactIndex(draft);
                if (draft && idx >= 0 && commitIndex(idx, false)) return;
                if (!draft && emptyValue) {
                    const defaultIndex = exactIndex(emptyValue);
                    if (defaultIndex >= 0) commitIndex(defaultIndex, false);
                    return;
                }
                if (!draft) {
                    committed = '';
                    setInvalid(false);
                    if (onSelect) onSelect(null);
                    return;
                }
                setInvalid(true, true);
            }, 120);
        });
        on(window, 'resize', positionList);
        on(window, 'scroll', positionList, { capture: true });
        on(window.visualViewport, 'resize', positionList);
        on(window.visualViewport, 'scroll', positionList);

        const control = {
            input,
            open,
            close,
            isInvalid: hasInvalidDraft,
            reportValidity,
            commitDraft: (options = {}) => reportValidity(options),
            captureFocus() {
                const active = visibleOpts()[activeIdx()];
                return {
                    open: openNow,
                    activeIndex: active ? Number(active.dataset.i) : null,
                    selectionStart: input.selectionStart,
                    selectionEnd: input.selectionEnd,
                };
            },
            prepareEntry({ direction, restoreToken } = {}) {
                input.focus();
                open();
                const visible = visibleOpts();
                let index = Number.isFinite(restoreToken?.activeIndex)
                    ? visible.findIndex((option) => Number(option.dataset.i) === restoreToken.activeIndex)
                    : visible.findIndex((option) => option.classList.contains('cbx-opt--selected'));
                if (index < 0 && visible.length && (direction === 'up' || direction === 'down')) {
                    index = direction === 'up' ? visible.length - 1 : 0;
                }
                setActive(index);
                if (Number.isFinite(restoreToken?.selectionStart) && Number.isFinite(restoreToken?.selectionEnd)) {
                    try { input.setSelectionRange(restoreToken.selectionStart, restoreToken.selectionEnd); } catch (_) { /* input sin selección */ }
                }
                return input;
            },
            setValue(label) {
                committed = label || '';
                draft = committed;
                input.value = label || '';
                setInvalid(false);
            },
            hydrate({ committedValue = '', draftValue = committedValue } = {}) {
                committed = committedValue || '';
                draft = String(draftValue ?? committed);
                input.value = draft;
                setInvalid(false);
            },
            setDisabled(dis) {
                input.disabled = !!dis;
                wrap.classList.toggle('cbx--disabled', !!dis);
                if (dis) close();
            },
            destroy() {
                if (destroyed) return;
                destroyed = true;
                clearTimeout(blurTimer);
                cancelAnimationFrame(openFrame);
                close();
                events.abort();
                feedback.remove();
                const remainingDescriptions = (input.getAttribute('aria-describedby') || '').split(/\s+/)
                    .filter((descriptionId) => descriptionId && descriptionId !== feedbackId);
                if (remainingDescriptions.length) input.setAttribute('aria-describedby', remainingDescriptions.join(' '));
                else input.removeAttribute('aria-describedby');
                if (input.getAttribute('aria-errormessage') === feedbackId) input.removeAttribute('aria-errormessage');
                if (list.parentElement === document.body) {
                    if (wrap.isConnected) {
                        list.classList.remove('cbx-list--portal');
                        wrap.appendChild(list);
                    } else list.remove();
                }
                if (wrap._notaCombobox === control) delete wrap._notaCombobox;
                comboControls.delete(control);
            },
        };
        wrap._notaCombobox = control;
        comboControls.add(control);
        return control;
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
            onDraft: () => {
                state[field] = '';
                group.classList.remove('estado-group--done');
                emit();
            },
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
        const pickerBase = pickerWrap.id || uid();
        const pickerId = `${pickerBase}-listbox`;
        const search = document.createElement('input');
        search.type = 'search';
        search.id = `${pickerBase}-search`;
        search.dataset.focusId = search.id;
        search.className = 'multi-add-input cbx-input';
        search.placeholder = placeholder || toggleLabel || 'Buscar o seleccionar…';
        search.autocomplete = 'off';
        search.setAttribute('role', 'combobox');
        search.setAttribute('aria-autocomplete', 'list');
        search.setAttribute('aria-haspopup', 'listbox');
        search.setAttribute('aria-controls', pickerId);
        search.setAttribute('aria-expanded', 'false');
        search.setAttribute('aria-label', toggleLabel || placeholder || 'Seleccionar opciones');
        search.setAttribute('aria-keyshortcuts', 'Shift+Enter');

        const picker = document.createElement('div');
        picker.className = 'cbx-list cbx-list--portal multi-cbx-list';
        picker.id = pickerId;
        picker.setAttribute('role', 'listbox');
        picker.setAttribute('aria-label', `Opciones para ${toggleLabel || placeholder || 'la selección'}`);
        picker.setAttribute('aria-multiselectable', 'true');
        picker.hidden = true;
        pickerWrap.append(search);
        document.body.appendChild(picker);

        let openNow = false;
        let destroyed = false;
        let blurTimer = 0;
        let openFrame = 0;
        const events = new AbortController();
        const on = (target, type, handler, options = {}) => {
            target?.addEventListener(type, handler, { ...options, signal: events.signal });
        };
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

        function renderPicker(announceResults = false) {
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
            if (announceResults) {
                const count = visibleOpts().length;
                announce(count
                    ? `${count} ${count === 1 ? 'opción disponible' : 'opciones disponibles'}.`
                    : 'Sin coincidencias.');
            }
        }

        function positionPicker() {
            if (!openNow) return;
            const rect = search.getBoundingClientRect();
            const viewport = window.visualViewport;
            const viewTop = viewport?.offsetTop || 0;
            const viewLeft = viewport?.offsetLeft || 0;
            const viewWidth = viewport?.width || window.innerWidth;
            const viewHeight = viewport?.height || window.innerHeight;
            const viewRight = viewLeft + viewWidth;
            const viewBottom = viewTop + viewHeight;
            if (!search.isConnected || rect.bottom < viewTop || rect.top > viewBottom) { closePicker(); return; }
            const gap = 6;
            const viewportGap = 12;
            const below = viewBottom - rect.bottom - gap;
            const above = rect.top - viewTop - gap;
            const openAbove = below < 220 && above > below;
            const available = Math.max(openAbove ? above : below, 96);
            const width = Math.min(Math.max(rect.width, 320), viewWidth - viewportGap * 2);
            const left = Math.min(Math.max(rect.left, viewLeft + viewportGap), viewRight - width - viewportGap);
            picker.style.left = `${Math.round(left)}px`;
            picker.style.width = `${Math.round(width)}px`;
            picker.style.maxHeight = `${Math.round(Math.min(320, available))}px`;
            picker.style.top = openAbove ? 'auto' : `${Math.round(rect.bottom + gap)}px`;
            picker.style.bottom = openAbove ? `${Math.round(viewBottom - rect.top + gap)}px` : 'auto';
        }

        function openPicker() {
            if (destroyed) return;
            const anchor = search.getBoundingClientRect();
            const viewport = window.visualViewport;
            const viewTop = viewport?.offsetTop || 0;
            const viewBottom = viewTop + (viewport?.height || window.innerHeight);
            if (anchor.bottom < viewTop || anchor.top > viewBottom) {
                revealImmediately(search);
                cancelAnimationFrame(openFrame);
                openFrame = requestAnimationFrame(openPicker);
                return;
            }
            picker.hidden = false;
            openNow = true;
            search.setAttribute('aria-expanded', 'true');
            renderPicker();
            positionPicker();
        }

        function closePicker(options = {}) {
            picker.hidden = true;
            openNow = false;
            search.setAttribute('aria-expanded', 'false');
            search.removeAttribute('aria-activedescendant');
            if (options.preserveQuery !== true) search.value = '';
            setActive(-1);
        }

        function toggleOption(opt, { moveFocus = true } = {}) {
            if (!opt) return;
            const value = opt.dataset.value;
            const removing = getUsed().includes(value);
            const context = { moveFocus };
            if (removing) onRemove?.(value, context);
            else onAdd(value, context);
            emit();
            search.value = '';
            if (keepOpen) {
                renderPicker();
                if (moveFocus) search.focus();
                positionPicker();
            } else closePicker();
            const count = getUsed().length;
            announce(`${value} ${removing ? 'eliminado' : 'seleccionado'}. ${count} ${count === 1 ? 'selección' : 'selecciones'}.`);
        }

        function finishSelection(e) {
            if (!onFinish) return false;
            e.preventDefault();
            e.stopPropagation();
            closePicker();
            onFinish();
            return true;
        }

        on(search, 'focus', openPicker);
        on(search, 'click', openPicker);
        on(search, 'input', () => { openPicker(); renderPicker(true); });
        on(search, 'keydown', (e) => {
            if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                finishSelection(e);
                return;
            }
            if (e.key.startsWith('Arrow') && (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey)) return;
            if (e.key === 'Tab') {
                if (e.shiftKey) closePicker();
                return;
            }
            if (e.key === 'Enter') {
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                const active = visibleOpts()[activeIdx()] || (visibleOpts().length === 1 ? visibleOpts()[0] : null);
                if (active) { e.preventDefault(); toggleOption(active); }
            } else if (e.key === ' ' && activeIdx() >= 0 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                toggleOption(visibleOpts()[activeIdx()]);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!openNow) openPicker();
                setActive(Math.min(activeIdx() + 1, visibleOpts().length - 1));
            } else if (e.key === 'ArrowUp') {
                if (!openNow) return;
                e.preventDefault();
                setActive(Math.max(activeIdx() - 1, 0));
            } else if ((e.key === 'Home' || e.key === 'End') && openNow) {
                e.preventDefault();
                const opts = visibleOpts();
                setActive(e.key === 'Home' ? 0 : Math.max(opts.length - 1, 0));
            } else if (e.key === 'Backspace' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
                && !search.value && getUsed().length) {
                const block = pickerWrap.closest('.subblock') || pickerWrap.parentElement;
                const removables = [...(block?.querySelectorAll('.region-chip, .multi-add-remove') || [])]
                    .filter((control) => control.offsetParent !== null);
                const target = removables.at(-1);
                if (!target) return;
                e.preventDefault();
                target.focus();
                announce('Elemento seleccionado. Presione Retroceso o Suprimir para quitarlo.');
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closePicker();
                search.focus();
            }
        });
        on(search, 'blur', () => {
            clearTimeout(blurTimer);
            blurTimer = setTimeout(() => {
                if (!destroyed && openNow && document.activeElement !== search) closePicker();
            }, 120);
        });
        on(picker, 'pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.target.closest('.cbx-opt')) e.preventDefault();
        });
        on(picker, 'click', (e) => {
            const opt = e.target.closest('.cbx-opt');
            if (!opt) return;
            toggleOption(opt, { moveFocus: e.detail === 0 });
        });
        on(window, 'resize', positionPicker);
        on(window, 'scroll', positionPicker, { capture: true });
        on(window.visualViewport, 'resize', positionPicker);
        on(window.visualViewport, 'scroll', positionPicker);
        if (renderExtra) renderExtra({ toggleBtn: search, picker });

        const control = {
            toggleBtn: search,
            picker,
            search,
            renderPicker,
            openPicker,
            closePicker,
            captureFocus() {
                return {
                    open: openNow,
                    activeValue: visibleOpts()[activeIdx()]?.dataset.value || '',
                    query: search.value,
                    selectionStart: search.selectionStart,
                    selectionEnd: search.selectionEnd,
                };
            },
            prepareEntry({ direction, restoreToken } = {}) {
                if (typeof restoreToken?.query === 'string') search.value = restoreToken.query;
                search.focus();
                openPicker();
                const visible = visibleOpts();
                const used = new Set(getUsed());
                let index = restoreToken?.activeValue
                    ? visible.findIndex((option) => option.dataset.value === restoreToken.activeValue)
                    : -1;
                if (index < 0 && used.size) {
                    const selected = visible
                        .map((option, optionIndex) => ({ option, optionIndex }))
                        .filter(({ option }) => used.has(option.dataset.value));
                    if (selected.length) index = direction === 'up' ? selected.at(-1).optionIndex : selected[0].optionIndex;
                }
                if (index < 0 && visible.length && (direction === 'up' || direction === 'down')) {
                    index = direction === 'up' ? visible.length - 1 : 0;
                }
                setActive(index);
                if (Number.isFinite(restoreToken?.selectionStart) && Number.isFinite(restoreToken?.selectionEnd)) {
                    try { search.setSelectionRange(restoreToken.selectionStart, restoreToken.selectionEnd); } catch (_) { /* search sin selección */ }
                }
                return search;
            },
            destroy() {
                if (destroyed) return;
                destroyed = true;
                clearTimeout(blurTimer);
                cancelAnimationFrame(openFrame);
                events.abort();
                closePicker();
                picker.remove();
                if (pickerWrap._notaMultiAdd === control) delete pickerWrap._notaMultiAdd;
            },
        };
        pickerWrap._notaMultiAdd = control;
        return control;
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
        if (active) window.CareFlowCancelUndo?.();
        if (kind === 'escalas') {
            state.sinEscalas = active;
            if (active) state.escalas = [];
            syncNoneChoice('sinEscalasBtn', active);
            renderEscalas();
            escalasUI?.renderPicker();
        } else if (kind === 'dispositivos') {
            state.sinDispositivos = active;
            if (active) {
                state.dispositivos = [];
                deviceDrafts.clear();
            }
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

    function requestNoneChoice(kind, button, onApplied) {
        const alreadyActive = button.getAttribute('aria-pressed') === 'true';
        if (alreadyActive) {
            onApplied?.();
            return;
        }
        const counts = {
            escalas: state.escalas.length,
            dispositivos: state.dispositivos.length,
            alteraciones: state.regiones.length,
        };
        const labels = {
            escalas: ['Confirmar que no se aplicaron escalas', 'las escalas y sus puntajes registrados'],
            dispositivos: ['Confirmar que no hay dispositivos', 'los dispositivos y sus datos registrados'],
            alteraciones: ['Confirmar que no hay alteraciones', 'las regiones seleccionadas'],
        };
        const apply = () => {
            setNoneChoice(kind, true);
            onApplied?.();
        };
        if (counts[kind] && typeof window.CareFlowConfirmChange === 'function') {
            window.CareFlowConfirmChange({
                title: labels[kind][0],
                description: `Este cambio quitará ${labels[kind][1]}.`,
                confirmLabel: 'Confirmar cambio',
                trigger: button,
                onConfirm: apply,
            });
            return;
        }
        apply();
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

    function bindRemovableControl(control, remove, restoreFocus) {
        if (!control) return;
        control.setAttribute('aria-keyshortcuts', 'Delete Backspace Shift+Backspace');
        const run = () => {
            remove();
            setTimeout(restoreFocus, 0);
        };
        control.addEventListener('click', run);
        control.addEventListener('keydown', (e) => {
            if (document.activeElement !== control || e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            e.preventDefault();
            e.stopPropagation();
            run();
        });
    }

    function focusEquivalentAfterRemoval(wrapSelector, index, fallback, controlSelector = '.multi-add-remove') {
        const controls = [...document.querySelectorAll(`${wrapSelector} ${controlSelector}`)];
        const target = controls[Math.min(index, controls.length - 1)] || fallback?.();
        target?.focus?.();
    }

    function renderEscalas() {
        const wrap = document.getElementById('escalasList');
        if (!wrap) return;
        wrap.innerHTML = '';
        state.escalas.forEach((item, itemIndex) => {
            const inputId = `escala-puntaje-${item.id}`;
            const errorId = `${inputId}-error`;
            const card = document.createElement('div');
            card.className = 'multi-add-item';
            card.innerHTML = `
                <div class="multi-add-item-head">
                    <strong>${esc(item.nombre)}</strong>
                    <button type="button" class="multi-add-remove" data-focus-id="quitar-escala-${item.id}" aria-label="Quitar ${esc(item.corto)}">✕</button>
                </div>
                <div class="escala-fields">
                    <div class="field-group field-group--puntaje">
                        <label for="${inputId}">Puntaje (${esc(item.display)})</label>
                        <input type="number" id="${inputId}" class="escala-puntaje" min="${item.min}" max="${item.max}"
                               step="${item.step ?? 1}" value="${esc(item.puntaje)}"
                               placeholder="${esc(item.display)}" aria-label="Puntaje de ${esc(item.corto)}"
                               aria-required="true" aria-invalid="false" aria-describedby="${errorId}" aria-errormessage="${errorId}">
                        <div class="puntaje-error" id="${errorId}" hidden></div>
                    </div>
                </div>`;
            const input = card.querySelector('.escala-puntaje');
            const errEl = card.querySelector('.puntaje-error');
            const validate = (final = false) => {
                item.puntaje = input.value.trim();
                const missing = item.puntaje === '';
                const outOfRange = !missing && !escalaValida(item);
                const invalid = outOfRange || (final && missing);
                const message = outOfRange
                    ? `Debe estar entre ${item.display}`
                    : invalid ? 'Ingrese el puntaje de la escala' : '';
                input.classList.toggle('puntaje-invalid', invalid);
                input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
                input.setCustomValidity(message);
                errEl.hidden = !invalid;
                errEl.textContent = message;
                return !missing && !outOfRange;
            };
            input._notaValidity = {
                reportValidity: () => validate(true),
                isInvalid: () => !escalaValida(item),
            };
            input.addEventListener('input', () => { validate(false); emit(); });
            input.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
                e.preventDefault();
                if (!validate(true)) return;
                emit();
                escalasUI?.search.focus();
            });
            const remove = () => {
                const removed = { ...item };
                state.escalas = state.escalas.filter((e2) => e2.id !== item.id);
                renderEscalas();
                escalasUI?.renderPicker();
                emit();
                offerUndo(`Se quitó ${item.corto}`, () => {
                    if (state.escalas.some((entry) => entry.nombre === removed.nombre)) return;
                    state.sinEscalas = false;
                    syncNoneChoice('sinEscalasBtn', false);
                    state.escalas.splice(Math.min(itemIndex, state.escalas.length), 0, removed);
                    renderEscalas();
                    escalasUI?.renderPicker();
                    emit();
                });
            };
            bindRemovableControl(card.querySelector('.multi-add-remove'), remove, () => {
                focusEquivalentAfterRemoval('#escalasList', itemIndex, () => escalasUI?.search);
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
        if (!input) return null;
        if (input.dataset.clinicalReady) return input._notaDateControl || null;
        input.dataset.clinicalReady = '1';
        input.type = 'text';
        input.inputMode = 'numeric';
        input.maxLength = 10;
        input.autocomplete = 'off';
        input.placeholder = 'DD/MM/AAAA';
        input.classList.add('clinical-date-input');
        if (required) input.setAttribute('aria-required', 'true');
        else input.removeAttribute('aria-required');

        const existingFeedback = input.parentElement?.querySelector('.dob-feedback[id]') || null;
        const events = new AbortController();
        const on = (target, type, handler, options = {}) => {
            target?.addEventListener(type, handler, { ...options, signal: events.signal });
        };

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
        calBtn.setAttribute('aria-label', `Abrir calendario para ${input.getAttribute('aria-label') || 'la fecha'}`);
        calBtn.setAttribute('aria-haspopup', 'dialog');
        calBtn.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 9.5h18"/></svg>';
        field.appendChild(calBtn);

        let feedback = existingFeedback;
        let ownsFeedback = false;
        if (!feedback) {
            feedback = document.createElement('div');
            feedback.id = `${input.id || uid()}-date-feedback`;
            feedback.className = 'cbx-feedback clinical-date-feedback';
            feedback.hidden = true;
            field.parentNode.insertBefore(feedback, field.nextSibling);
            ownsFeedback = true;
        }
        const describedBy = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
        describedBy.add(feedback.id);
        input.setAttribute('aria-describedby', [...describedBy].join(' '));
        input.setAttribute('aria-errormessage', feedback.id);
        input.setAttribute('aria-invalid', 'false');

        // Estado inicial: si trae ISO previo (re-render de dispositivo), mostrarlo DD/MM/AAAA
        if (input.dataset.dateDraft) {
            input.value = input.dataset.dateDraft;
            native.value = input.dataset.iso || '';
        } else if (input.dataset.iso) {
            input.value = isoToDMY(input.dataset.iso);
            native.value = input.dataset.iso;
        }
        let confirmedIso = input.dataset.iso || '';
        let confirmedDisplay = confirmedIso ? isoToDMY(confirmedIso) : '';

        let lastResult = { valid: !required, empty: true, message: required ? 'Ingrese una fecha completa' : '' };
        const evaluate = (final = false) => {
            const complete = /^\d{2}\/\d{2}\/\d{4}$/.test(input.value);
            const iso = dmyToIso(input.value);
            let result;
            if (!input.value) {
                result = { valid: !required, empty: true, message: required ? 'Ingrese una fecha completa' : '' };
            } else if (!complete) {
                // Mientras se escribe no se marca error; solo al perder foco o confirmar
                result = { valid: false, empty: false, message: 'Complete la fecha con formato DD/MM/AAAA' };
            } else {
                result = validateClinicalDate(iso, { min, max, required });
            }
            lastResult = result;
            input.dataset.iso = result.valid ? iso : '';
            if (result.valid) native.value = iso;
            const showInvalid = final && !result.valid;
            input.setCustomValidity(showInvalid ? (result.message || 'Ingrese una fecha válida') : '');
            input.classList.toggle('clinical-date-invalid', showInvalid);
            input.setAttribute('aria-invalid', showInvalid ? 'true' : 'false');
            if (ownsFeedback) {
                feedback.hidden = !showInvalid;
                feedback.textContent = showInvalid ? (result.message || 'Ingrese una fecha válida') : '';
            }
            return { result, iso: result.valid ? iso : '' };
        };

        const notify = (final) => {
            const { result, iso } = evaluate(final);
            if (result.valid) {
                confirmedIso = iso;
                confirmedDisplay = input.value;
            }
            onChange(iso, result, input.value);
            if (!ownsFeedback && final && !result.valid && !feedback.textContent) {
                feedback.textContent = result.message || 'Ingrese una fecha válida';
                feedback.classList.add('error');
            }
            return { result, iso };
        };

        // ── Escritura manual ──
        on(input, 'input', () => {
            const caret = input.selectionStart ?? input.value.length;
            const digitsBeforeCaret = input.value.slice(0, caret).replace(/\D/g, '').length;
            const masked = maskDMY(input.value);
            if (masked !== input.value) {
                input.value = masked;
                const nextCaret = Math.min(
                    masked.length,
                    digitsBeforeCaret + (digitsBeforeCaret > 2 ? 1 : 0) + (digitsBeforeCaret > 4 ? 1 : 0),
                );
                input.setSelectionRange?.(nextCaret, nextCaret);
            }
            notify(false);
        });
        on(input, 'blur', () => { notify(true); });
        on(input, 'keydown', (e) => {
            if (e.key === 'Escape' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
                && (input.value !== confirmedDisplay || input.dataset.iso !== confirmedIso)) {
                e.preventDefault();
                e.stopPropagation();
                input.value = confirmedDisplay;
                input.dataset.iso = confirmedIso;
                native.value = confirmedIso;
                notify(true);
                announce(confirmedIso ? 'Fecha anterior restaurada.' : 'Borrador de fecha descartado.');
                return;
            }
            if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            const { result } = notify(true);
            if (!result.valid) return;
            e.preventDefault();
            nextFocus?.();
        });

        // ── Selección desde el calendario nativo ──
        let calendarOpenedByKeyboard = false;
        const commitFromNative = () => {
            if (!native.value) return;
            if (input.dataset.iso === native.value && input.value === isoToDMY(native.value)) {
                if (calendarOpenedByKeyboard) setTimeout(() => nextFocus?.(), 0);
                calendarOpenedByKeyboard = false;
                return;
            }
            input.value = isoToDMY(native.value);
            notify(true);
            if (calendarOpenedByKeyboard) setTimeout(() => nextFocus?.(), 0);
            calendarOpenedByKeyboard = false;
        };
        on(native, 'input', commitFromNative);
        on(native, 'change', commitFromNative);

        // ── Abrir el calendario (clic en la zona libre o en el icono) sin perder la escritura ──
        const openCalendar = () => {
            native.value = dmyToIso(input.value) || '';
            if (typeof native.showPicker === 'function') {
                try { native.showPicker(); return; } catch (_) {}
            }
            native.removeAttribute('aria-hidden');
            native.setAttribute('aria-label', calBtn.getAttribute('aria-label'));
            native.focus();
            native.click();
        };
        on(native, 'blur', () => native.setAttribute('aria-hidden', 'true'));

        /* Píxel donde termina el texto visible (valor escrito o placeholder DD/MM/AAAA),
           medido con la tipografía real del campo. Todo lo que quede a su derecha es
           "zona libre". */
        const textRightEdge = () => {
            const cs = getComputedStyle(input);
            const shown = input.value || input.placeholder || '';
            const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
            const padLeft = parseFloat(cs.paddingLeft) || 0;
            const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
            return borderLeft + padLeft + measureTextWidth(shown, font);
        };

        /* Clic sobre DD, MM o AAAA → se deja el comportamiento por defecto (foco + cursor
           de escritura) para editar ese segmento con el teclado. Clic en la zona libre
           (a la derecha del texto) → se abre el calendario SIN colocar el cursor de
           escritura, porque en ese punto no se puede escribir. Se usa `mousedown` para
           poder impedir el foco antes de que el navegador coloque el caret. */
        on(input, 'mousedown', (e) => {
            if (e.button !== 0) return;
            const clickX = e.clientX - input.getBoundingClientRect().left;
            if (clickX <= textRightEdge() + 8) return;  // zona de texto: dejar escribir
            e.preventDefault();                          // evita foco/caret en la zona libre
            calendarOpenedByKeyboard = false;
            if (document.activeElement === input) input.blur();
            openCalendar();
        });
        // El icono es un botón tabulable y conserva la activación nativa con Enter/Espacio.
        on(calBtn, 'pointerdown', () => { calendarOpenedByKeyboard = false; });
        on(calBtn, 'keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') calendarOpenedByKeyboard = true;
        });
        on(calBtn, 'click', (e) => {
            e.preventDefault();
            openCalendar();
        });

        evaluate(false);
        const control = {
            input,
            calendarButton: calBtn,
            validate: () => notify(true).result,
            reportValidity: () => notify(true).result.valid,
            commitDraft: () => notify(true).result.valid,
            isInvalid: () => !!input.value.trim() && !input.dataset.iso,
            getValidation: () => ({ ...lastResult }),
            destroy() {
                if (!dateControls.has(control)) return;
                events.abort();
                dateControls.delete(control);
                delete input._notaDateControl;
                delete input.dataset.clinicalReady;
                if (ownsFeedback) feedback.remove();
                const descriptions = (input.getAttribute('aria-describedby') || '').split(/\s+/)
                    .filter((id) => id && id !== feedback.id);
                if (descriptions.length) input.setAttribute('aria-describedby', descriptions.join(' '));
                else input.removeAttribute('aria-describedby');
                if (input.getAttribute('aria-errormessage') === feedback.id) input.removeAttribute('aria-errormessage');
                input.removeAttribute('aria-invalid');
                if (field.parentNode) {
                    field.parentNode.insertBefore(input, field);
                    field.remove();
                }
            },
        };
        input._notaDateControl = control;
        dateControls.add(control);
        return control;
    }

    function setupDeviceDateInput(input, onChange, options = {}) {
        return setupClinicalDateInput(input, onChange, options);
    }

    function updateDeviceDate(item, field, value, result, display) {
        const confirmedKey = `${field}Confirmado`;
        const previousConfirmed = item[field] || deviceDrafts.get(item.id)?.[confirmedKey] || '';
        item[field] = value;
        const drafts = { ...(deviceDrafts.get(item.id) || {}) };
        if (!display?.trim() || result.valid) {
            delete drafts[field];
            delete drafts[confirmedKey];
        } else {
            drafts[field] = display;
            if (previousConfirmed) drafts[confirmedKey] = previousConfirmed;
        }
        if (Object.keys(drafts).length) deviceDrafts.set(item.id, drafts);
        else deviceDrafts.delete(item.id);
        emit();
    }

    function renderDispositivos() {
        const wrap = document.getElementById('dispositivosList');
        if (!wrap) return;
        wrap.querySelectorAll('[data-cbx]').forEach((node) => node._notaCombobox?.destroy?.());
        wrap.querySelectorAll('.clinical-date-input').forEach((node) => node._notaDateControl?.destroy?.());
        // Las listas de los comboboxes de estado se portalan a <body> al abrirse; al
        // reconstruir las tarjetas hay que retirar las huérfanas para no acumularlas.
        document.querySelectorAll('body > .cbx-list[id^="dev-estado-"]').forEach((el) => el.remove());
        wrap.innerHTML = '';
        const liveIds = new Set(state.dispositivos.map((item) => item.id));
        [...deviceDrafts.keys()].forEach((id) => { if (!liveIds.has(id)) deviceDrafts.delete(id); });
        const estados = NL().listas.ESTADO_DISPOSITIVO || [];
        state.dispositivos.forEach((item, itemIndex) => {
            const estadoId = `dev-estado-${item.id}`;
            const insertionId = `dev-fecha-ins-${item.id}`;
            const healingId = `dev-fecha-cur-${item.id}`;
            const drafts = deviceDrafts.get(item.id) || {};
            const insertionIso = item.fechaInsercion || drafts.fechaInsercionConfirmado || '';
            const healingIso = item.fechaCuracion || drafts.fechaCuracionConfirmado || '';
            const card = document.createElement('div');
            card.className = 'multi-add-item multi-add-item--device';
            card.dataset.deviceId = item.id;
            card.innerHTML = `
                <div class="multi-add-item-head">
                    <strong>${esc(item.nombre)}</strong>
                    <button type="button" class="multi-add-remove" data-focus-id="quitar-dispositivo-${item.id}" aria-label="Quitar ${esc(item.nombre)}">✕</button>
                </div>
                <div class="device-fields">
                    <div class="field-group">
                        <label for="${insertionId}">Fecha de inserción <span class="required-star" aria-label="obligatorio">*</span></label>
                        <input type="text" id="${insertionId}" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" class="dev-fecha-ins clinical-date-input" data-iso="${esc(insertionIso)}" data-date-draft="${esc(drafts.fechaInsercion || '')}" autocomplete="off" aria-label="Fecha de inserción de ${esc(item.nombre)}, formato día, mes y año">
                    </div>
                    <div class="field-group">
                        <label for="${healingId}">Última curación <span class="label-optional">(opcional)</span></label>
                        <input type="text" id="${healingId}" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" class="dev-fecha-cur clinical-date-input" data-iso="${esc(healingIso)}" data-date-draft="${esc(drafts.fechaCuracion || '')}" autocomplete="off" aria-label="Fecha de última curación de ${esc(item.nombre)}, formato día, mes y año">
                    </div>
                    <div class="field-group field-group--wide">
                        <label for="${estadoId}">Estado del dispositivo <span class="required-star" aria-label="obligatorio">*</span></label>
                        <div class="cbx" data-cbx="${estadoId}">
                            <input type="text" id="${estadoId}" class="cbx-input dev-estado" placeholder="Buscar estado…"
                                   role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off"
                                   aria-label="Estado de ${esc(item.nombre)}" value="${esc(drafts.estado ?? item.estado)}">
                            <div class="cbx-list" role="listbox" hidden></div>
                        </div>
                    </div>
                </div>`;
            // Insertar la tarjeta antes de crear el combobox: createCombobox busca sus
            // nodos en el document (data-cbx / id), no dentro del fragmento suelto.
            wrap.appendChild(card);

            const remove = () => {
                const removed = { ...item };
                const removedDrafts = { ...(deviceDrafts.get(item.id) || {}) };
                state.dispositivos = state.dispositivos.filter((d) => d.id !== item.id);
                deviceDrafts.delete(item.id);
                renderDispositivos();
                dispositivosUI?.renderPicker();
                emit();
                offerUndo(`Se quitó ${item.nombre}`, () => {
                    if (state.dispositivos.some((entry) => entry.nombre === removed.nombre)) return;
                    state.sinDispositivos = false;
                    syncNoneChoice('sinDispositivosBtn', false);
                    state.dispositivos.splice(Math.min(itemIndex, state.dispositivos.length), 0, removed);
                    if (Object.keys(removedDrafts).length) deviceDrafts.set(removed.id, removedDrafts);
                    renderDispositivos();
                    dispositivosUI?.renderPicker();
                    emit();
                });
            };
            const insertion = card.querySelector('.dev-fecha-ins');
            const healing = card.querySelector('.dev-fecha-cur');

            // Estado del dispositivo: mismo combobox buscable que el resto del formulario.
            const estadoCombo = createCombobox({
                id: estadoId,
                options: () => estados,
                onDraft: (draft, committed) => {
                    const nextDrafts = { ...(deviceDrafts.get(item.id) || {}) };
                    nextDrafts.estado = draft;
                    nextDrafts.estadoConfirmado = committed;
                    deviceDrafts.set(item.id, nextDrafts);
                    item.estado = '';
                    emit();
                },
                onSelect: (value) => {
                    item.estado = value || '';
                    const nextDrafts = { ...(deviceDrafts.get(item.id) || {}) };
                    delete nextDrafts.estado;
                    delete nextDrafts.estadoConfirmado;
                    if (Object.keys(nextDrafts).length) deviceDrafts.set(item.id, nextDrafts);
                    else deviceDrafts.delete(item.id);
                    emit();
                },
                onConfirm: () => {
                    const nextCard = card.nextElementSibling;
                    const nextField = nextCard?.querySelector('.dev-fecha-ins');
                    if (nextField) nextField.focus();
                    else focusStageContinue('faseC');
                },
            });
            if (Object.prototype.hasOwnProperty.call(drafts, 'estado')) {
                estadoCombo?.hydrate({
                    committedValue: drafts.estadoConfirmado || '',
                    draftValue: drafts.estado,
                });
            } else if (item.estado) estadoCombo?.setValue(item.estado);

            setupDeviceDateInput(insertion, (value, result, display) => {
                updateDeviceDate(item, 'fechaInsercion', value, result, display);
            }, {
                required: true,
                nextFocus: () => healing?.focus(),
            });
            setupDeviceDateInput(healing, (value, result, display) => {
                updateDeviceDate(item, 'fechaCuracion', value, result, display);
            }, {
                nextFocus: () => estadoCombo?.input.focus(),
            });
            bindRemovableControl(card.querySelector('.multi-add-remove'), remove, () => {
                focusEquivalentAfterRemoval('#dispositivosList', itemIndex, () => dispositivosUI?.search);
            });
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
            const healing = card.querySelector('.dev-fecha-cur');
            const status = card.querySelector('.dev-estado');
            if (insertion && !insertion.dataset.iso) {
                insertion._notaDateControl?.reportValidity?.();
                insertion.focus();
                return;
            }
            if (healing?.value.trim() && !healing.dataset.iso) {
                healing._notaDateControl?.reportValidity?.();
                healing.focus();
                return;
            }
            if (status && !status.value) { status.focus(); return; }
        }
        if (state.dispositivos.length || state.sinDispositivos) focusStageContinue('faseC');
        else dispositivosUI?.search.focus();
    }

    function bindNoneChoice(buttonId, kind, nextFocus) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        listen(button, 'click', () => requestNoneChoice(kind, button));
        listen(button, 'keydown', (e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            e.preventDefault();
            requestNoneChoice(kind, button, () => setTimeout(nextFocus, 0));
        });
    }

    function renderRegiones() {
        const wrap = document.getElementById('regionesChips');
        if (!wrap) return;
        wrap.innerHTML = '';
        wrap.hidden = !state.regiones.length;
        state.regiones.forEach((nombre, itemIndex) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'region-chip';
            chip.dataset.focusId = `quitar-region-${focusToken(nombre)}`;
            chip.setAttribute('aria-label', `Quitar ${nombre}`);
            chip.innerHTML = `<span>${esc(nombre)}</span><span class="region-chip-x" aria-hidden="true">×</span>`;
            const remove = () => {
                state.regiones = state.regiones.filter((r) => r !== nombre);
                renderRegiones();
                regionesUI?.renderPicker();
                emit();
                offerUndo(`Se quitó ${nombre}`, () => {
                    if (state.regiones.includes(nombre)) return;
                    state.sinAlteraciones = false;
                    syncNoneChoice('sinAlteracionesBtn', false);
                    state.regiones.splice(Math.min(itemIndex, state.regiones.length), 0, nombre);
                    renderRegiones();
                    regionesUI?.renderPicker();
                    emit();
                });
            };
            chip.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
                e.preventDefault();
                e.stopPropagation();
                regionesUI?.closePicker();
                focusEducationEntry();
            });
            bindRemovableControl(chip, remove, () => {
                focusEquivalentAfterRemoval('#regionesChips', itemIndex, () => regionesUI?.search, '.region-chip');
            });
            chip.setAttribute('aria-keyshortcuts', 'Enter Shift+Enter Delete Backspace Shift+Backspace');
            wrap.appendChild(chip);
        });
    }

    function renderEducacion() {
        const wrap = document.getElementById('educacionList');
        if (!wrap) return;
        wrap.innerHTML = '';
        state.educacion.forEach((item, itemIndex) => {
            const card = document.createElement('div');
            card.className = 'multi-add-item';
            card.dataset.eduId = item.id;
            const sinTema = noEdu(item.destinatario);
            const topicId = `edu-tema-${item.id}`;
            const errorId = `${topicId}-error`;
            card.innerHTML = `
                <div class="multi-add-item-head">
                    <strong>${esc(item.destinatario)}</strong>
                    <button type="button" class="multi-add-remove" data-focus-id="quitar-educacion-${item.id}" aria-label="Quitar registro de educación">✕</button>
                </div>
                ${sinTema ? '' : `
                <div class="field-group">
                    <label for="${topicId}">Tema de educación <span class="required-star" aria-label="obligatorio">*</span></label>
                    <textarea id="${topicId}" class="edu-tema obs-textarea" rows="2" placeholder="Describa el contenido educativo impartido…"
                              aria-label="Tema de educación para ${esc(item.destinatario)}" aria-required="true"
                              aria-invalid="false" aria-describedby="${errorId}" aria-errormessage="${errorId}">${esc(item.tema)}</textarea>
                    <div class="cbx-feedback" id="${errorId}" hidden></div>
                </div>`}`;
            const remove = () => {
                const removed = { ...item };
                state.educacion = state.educacion.filter((e2) => e2.id !== item.id);
                if (lastEducationId === item.id) lastEducationId = state.educacion.at(-1)?.id || null;
                renderEducacion();
                emit();
                offerUndo('Se quitó el registro de educación', () => {
                    if (state.educacion.some((entry) => entry.destinatario === removed.destinatario)) return;
                    if (state.educacion.some((entry) => noEdu(entry.destinatario) !== noEdu(removed.destinatario))) return;
                    state.educacion.splice(Math.min(itemIndex, state.educacion.length), 0, removed);
                    lastEducationId = removed.id;
                    renderEducacion();
                    emit();
                });
            };
            const removeButton = card.querySelector('.multi-add-remove');
            const ta = card.querySelector('.edu-tema');
            if (ta) {
                const error = card.querySelector(`#${errorId}`);
                const validateTopic = (final = false) => {
                    const invalid = final && !ta.value.trim();
                    ta.setAttribute('aria-invalid', invalid ? 'true' : 'false');
                    ta.setCustomValidity(invalid ? 'Describa el tema de educación' : '');
                    error.hidden = !invalid;
                    error.textContent = invalid ? 'Describa el tema de educación' : '';
                    return !invalid;
                };
                ta.dataset.eduId = item.id;
                ta._notaValidity = { reportValidity: () => validateTopic(true), isInvalid: () => !ta.value.trim() };
                ta.addEventListener('input', () => {
                    item.tema = ta.value.trim();
                    validateTopic(false);
                    emit();
                });
                ta.addEventListener('keydown', (e) => {
                    if (e.key !== 'Enter' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
                    e.preventDefault();
                    e.stopPropagation();
                    item.tema = ta.value.trim();
                    if (!validateTopic(true)) return;
                    emit();
                    focusEducationCompletion();
                });
            }
            bindRemovableControl(removeButton, remove, () => {
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
            btn.dataset.focusId = `educacion-${focusToken(dest)}`;
            btn.setAttribute('aria-pressed', 'false');
            btn.setAttribute('aria-keyshortcuts', 'Enter Shift+Enter Delete Backspace Shift+Backspace');
            btn.textContent = dest
                .replace('Familiar directo (cónyuge / padre / madre / hijo/a)', 'Familiar directo')
                .replace('No fue posible brindar educación – ', 'No fue posible: ');
            btn.title = dest;
            const applyToggle = () => {
                const existing = state.educacion.find((e2) => e2.destinatario === dest);
                if (existing) {
                    const removed = { ...existing };
                    const itemIndex = state.educacion.indexOf(existing);
                    state.educacion = state.educacion.filter((e2) => e2.id !== existing.id);
                    if (lastEducationId === existing.id) lastEducationId = state.educacion.at(-1)?.id || null;
                    renderEducacion();
                    emit();
                    offerUndo('Se quitó el registro de educación', () => {
                        if (state.educacion.some((entry) => entry.destinatario === removed.destinatario)) return;
                        if (state.educacion.some((entry) => noEdu(entry.destinatario) !== noEdu(removed.destinatario))) return;
                        state.educacion.splice(Math.min(itemIndex, state.educacion.length), 0, removed);
                        lastEducationId = removed.id;
                        renderEducacion();
                        emit();
                    });
                } else {
                    // "No fue posible" (educación NO realizada) es excluyente con las
                    // opciones que indican que SÍ se educó. Al elegir una, se descartan
                    // las del grupo opuesto para no dejar estados contradictorios.
                    const addingNegative = noEdu(dest);
                    const displaced = state.educacion.filter((entry) => noEdu(entry.destinatario) !== addingNegative);
                    const commit = () => {
                        state.educacion = state.educacion.filter((entry) => noEdu(entry.destinatario) === addingNegative);
                        const added = { id: uid(), destinatario: dest, tema: '' };
                        state.educacion.push(added);
                        lastEducationId = added.id;
                        renderEducacion();
                        emit();
                    };
                    if (displaced.length && typeof window.CareFlowConfirmChange === 'function') {
                        window.CareFlowConfirmChange({
                            title: 'Cambiar el tipo de registro de educación',
                            description: 'Este cambio quitará los registros de educación del grupo contrario.',
                            confirmLabel: 'Cambiar registro',
                            trigger: btn,
                            onConfirm: commit,
                        });
                        return;
                    }
                    commit();
                }
            };
            listen(btn, 'click', applyToggle);
            listen(btn, 'keydown', (e) => {
                if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    focusEducationTopicsStart();
                    return;
                }
                if ((e.key !== 'Backspace' && e.key !== 'Delete') || e.ctrlKey || e.metaKey || e.altKey) return;
                e.preventDefault();
                e.stopPropagation();
                if (btn.getAttribute('aria-pressed') !== 'true') return;
                applyToggle();
                setTimeout(() => btn.focus(), 0);
            });
            wrap.appendChild(btn);
        });
    }

    /* ═══════════ Formatters para la nota ═══════════ */
    const joinNat = (arr) => arr.length <= 1 ? arr.join('')
        : arr.slice(0, -1).join(', ') + ' y ' + arr[arr.length - 1];

    /* Ítems sueltos de cada grupo denso — misma fuente que los formatters de string.
       Permiten a la nota presentarlos en línea (pocos) o como lista de viñetas (muchos). */
    function escalasItems() {
        return state.escalas.map((e2) => `${e2.corto}: ${e2.puntaje !== '' ? e2.puntaje : '___'}`);
    }

    function dispositivosItems() {
        return state.dispositivos.map((d) => {
            const extras = [];
            if (d.fechaInsercion) extras.push(`inserción ${isoToDMY(d.fechaInsercion)}`);
            if (d.fechaCuracion) extras.push(`última curación ${isoToDMY(d.fechaCuracion)}`);
            if (d.estado) extras.push(`estado: ${d.estado}`);
            return d.nombre + (extras.length ? ` (${extras.join(', ')})` : '');
        });
    }

    function regionesItems() {
        return state.regiones.slice();
    }

    function formatEscalas() {
        if (state.sinEscalas) return 'No se aplicaron escalas de valoración';
        if (!state.escalas.length) return '';
        return escalasItems().join('; ');
    }

    function formatDispositivos() {
        if (state.sinDispositivos) return 'Sin dispositivos invasivos o de soporte';
        if (!state.dispositivos.length) return '';
        return dispositivosItems().join('; ');
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
    let issueFocusReportsValidity = true;

    function focusControl(control, report) {
        if (issueFocusReportsValidity) report?.();
        control?.focus?.();
        if (control && typeof scrollSoft === 'function') scrollSoft(control, 'nearest');
        return !!control;
    }

    function getIssues(stageId) {
        const issues = [];
        const add = (bucket, stageId, controlId, type, message, focus) => {
            const performFocus = focus;
            issues.push({
                id: `${bucket}-${controlId}-${type}`,
                stageId,
                controlId,
                type,
                message,
                focus: (options = {}) => {
                    const previous = issueFocusReportsValidity;
                    issueFocusReportsValidity = options.report !== false;
                    try {
                        return performFocus?.(options) !== false;
                    } finally {
                        issueFocusReportsValidity = previous;
                    }
                },
                bucket,
            });
        };
        const addComboboxIssue = (bucket, stageId, field, message) => {
            if (state[field]) return;
            const control = cbx[field];
            add(bucket, stageId, field, control?.isInvalid() ? 'invalid' : 'missing', message,
                () => focusControl(control?.input || document.getElementById(field), () => control?.reportValidity()));
        };

        addComboboxIssue('faseA', 'patient', 'posicion', 'Posición del paciente');
        if (!state.numCama) add('faseA', 'patient', 'numCama', 'missing', 'Número de cama',
            () => focusControl(document.getElementById('numCama')));
        if (!state.numHabitacion) add('faseA', 'patient', 'numHabitacion', 'missing', 'Número de habitación',
            () => focusControl(document.getElementById('numHabitacion')));
        addComboboxIssue('faseA', 'patient', 'servicio', 'Servicio / Unidad');

        addComboboxIssue('faseB', 'faseB', 'estadoNeurologico', 'Estado neurológico');
        addComboboxIssue('faseB', 'faseB', 'estadoHemodinamico', 'Estado hemodinámico');
        addComboboxIssue('faseB', 'faseB', 'estadoRespiratorio', 'Estado respiratorio');
        if (!state.escalas.length && !state.sinEscalas) {
            add('faseB', 'faseB', escalasUI?.search.id || 'escalasPicker-search', 'missing', 'Escalas de valoración o “No se aplicaron”',
                () => focusControl(escalasUI?.search));
        }
        state.escalas.forEach((item) => {
            if (escalaValida(item)) return;
            const input = document.getElementById(`escala-puntaje-${item.id}`);
            add('faseB', 'faseB', input?.id || `escala-${item.id}`,
                String(item.puntaje ?? '').trim() ? 'invalid' : 'missing',
                `Puntaje de ${item.corto} (${item.display})`,
                () => focusControl(input, () => input?._notaValidity?.reportValidity?.()));
        });

        if (!state.diagnosticoMedico) add('faseC', 'faseC', 'diagnosticoMedico', 'missing', 'Diagnóstico médico',
            () => focusControl(document.getElementById('diagnosticoMedico')));
        if (cbx.aislamiento?.isInvalid()) {
            add('faseC', 'faseC', 'aislamiento', 'invalid', 'Tipo de aislamiento válido',
                () => focusControl(cbx.aislamiento.input, () => cbx.aislamiento.reportValidity()));
        }
        addComboboxIssue('faseC', 'faseC', 'estadoDental', 'Estado dental');
        if (!state.dispositivos.length && !state.sinDispositivos) {
            add('faseC', 'faseC', dispositivosUI?.search.id || 'dispositivosPicker-search', 'missing', 'Dispositivos presentes o “Sin dispositivos”',
                () => focusControl(dispositivosUI?.search));
        }
        state.dispositivos.forEach((item) => {
            const drafts = deviceDrafts.get(item.id) || {};
            const insertion = document.getElementById(`dev-fecha-ins-${item.id}`);
            const healing = document.getElementById(`dev-fecha-cur-${item.id}`);
            const status = document.getElementById(`dev-estado-${item.id}`);
            if (!item.fechaInsercion) {
                const hasDraft = !!(insertion?.value.trim() || drafts.fechaInsercion);
                add('faseC', 'faseC', insertion?.id || `dev-fecha-ins-${item.id}`,
                    hasDraft ? 'invalid' : 'missing',
                    hasDraft ? `Fecha de inserción válida de ${item.nombre}` : `Fecha de inserción de ${item.nombre}`,
                    () => focusControl(insertion, () => insertion?._notaDateControl?.reportValidity?.()));
            }
            if (!item.fechaCuracion && (healing?.value.trim() || drafts.fechaCuracion)) {
                add('faseC', 'faseC', healing?.id || `dev-fecha-cur-${item.id}`, 'invalid',
                    `Fecha de última curación válida de ${item.nombre}`,
                    () => focusControl(healing, () => healing?._notaDateControl?.reportValidity?.()));
            }
            if (!item.estado) {
                const control = status?.closest('[data-cbx]')?._notaCombobox;
                add('faseC', 'faseC', status?.id || `dev-estado-${item.id}`,
                    control?.isInvalid() ? 'invalid' : 'missing', `Estado de ${item.nombre}`,
                    () => focusControl(status, () => control?.reportValidity()));
            }
        });

        if (!state.regiones.length && !state.sinAlteraciones) {
            add('faseD', 'faseD', regionesUI?.search.id || 'regionesPicker-search', 'missing', 'Regiones afectadas o “Sin alteraciones”',
                () => focusControl(regionesUI?.search));
        }
        state.educacion.forEach((item) => {
            if (noEdu(item.destinatario) || item.tema) return;
            const topic = document.getElementById(`edu-tema-${item.id}`);
            add('faseD', 'faseD', topic?.id || `edu-tema-${item.id}`, 'missing',
                `Tema de educación (${item.destinatario})`,
                () => focusControl(topic, () => topic?._notaValidity?.reportValidity?.()));
        });

        if (!state.respuesta) add('evaluacion', 'faseF', 'respuestaIntervenciones', 'missing',
            'Respuesta del paciente a las intervenciones', () => focusControl(document.getElementById('respuestaIntervenciones')));
        if (!state.tendencia) {
            const control = cbx.tendenciaEvolutiva;
            add('evaluacion', 'faseF', 'tendenciaEvolutiva', control?.isInvalid() ? 'invalid' : 'missing',
                'Tendencia evolutiva',
                () => focusControl(control?.input || document.getElementById('tendenciaEvolutiva'), () => control?.reportValidity()));
        }
        if (!state.criterioClinico) add('cierre', 'faseF', 'criterioClinico', 'missing',
            'Criterio clínico u objetivo alcanzado', () => focusControl(document.getElementById('criterioClinico')));
        if (!state.pendientes) add('cierre', 'faseF', 'pendientes', 'missing',
            'Pendientes para el siguiente turno', () => focusControl(document.getElementById('pendientes')));

        const targetStage = stageId === 'faseA' ? 'patient' : stageId;
        return targetStage ? issues.filter((issue) => issue.stageId === targetStage) : issues;
    }

    function getMissing() {
        const missing = { faseA: [], faseB: [], faseC: [], faseD: [], evaluacion: [], cierre: [] };
        getIssues().forEach((issue) => missing[issue.bucket].push(issue.message));
        return missing;
    }

    /* done/total por fase (faseA y meta los completa app.js) */
    function phaseStatus() {
        const m = getMissing();
        const totals = {
            faseA: 4,
            faseB: 4 + (state.sinEscalas ? 0 : state.escalas.length),
            faseC: 3 + (state.sinDispositivos ? 0 : state.dispositivos.length * 2)
                + state.dispositivos.filter((item) => item.fechaCuracion || deviceDrafts.get(item.id)?.fechaCuracion).length,
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
        const phase = id === 'patient' ? document.getElementById('patientBlock') : document.getElementById(id);
        if (!phase) return null;
        const visible = (control) => control && !control.closest('[hidden]') && control.offsetParent !== null;
        if (origin && phase.contains(origin)) {
            const stateGroup = origin.closest('.estado-group');
            const contextual = stateGroup?.querySelector('.cbx-input')
                || (origin.closest('#escalasBlock') ? escalasUI?.search : null)
                || (origin.closest('#dispositivosBlock') ? dispositivosUI?.search : null)
                || (origin.closest('#regionesBlock') ? regionesUI?.search : null)
                || origin.closest('[data-cbx]')?.querySelector('.cbx-input');
            if (visible(contextual)) return contextual;
        }
        if (id === 'faseD' && origin?.closest?.('#eduQuick, #educacionList')) {
            const topic = educationWritingTarget();
            if (visible(topic)) return topic;
        }
        const boxes = [...phase.querySelectorAll('.estado-group .cbx-input, .multi-add-input, [data-cbx] > .cbx-input')];
        return boxes.find(visible) || null;
    }

    function writingTargets(id) {
        const phase = id === 'patient' ? document.getElementById('patientBlock') : document.getElementById(id);
        if (!phase) return [];
        return [...phase.querySelectorAll('input:not([type="hidden"]), textarea, [contenteditable="true"]')]
            .filter((control) => !control.disabled && !control.readOnly
                && !control.closest('[hidden], [inert], [aria-hidden="true"]')
                && control.getClientRects().length > 0);
    }

    function activateForWriting(id, origin = document.activeElement) {
        const target = searchForPhase(id, origin) || writingTargets(id)[0] || null;
        target?.focus?.();
        return target;
    }

    function fieldAdapter(targetOrId) {
        const target = typeof targetOrId === 'string'
            ? document.getElementById(targetOrId) || document.querySelector(`[data-cbx="${CSS.escape(targetOrId)}"]`)
            : targetOrId;
        if (!target) return null;
        const comboWrap = target.matches?.('[data-cbx]') ? target : target.closest?.('[data-cbx]');
        const combo = comboWrap?._notaCombobox;
        if (combo) {
            return {
                root: comboWrap,
                anchor: combo.input,
                captureFocus: () => combo.captureFocus(),
                enter: (context = {}) => combo.prepareEntry(context),
                restoreFocus: (token, context = {}) => combo.prepareEntry({ ...context, restoreToken: token }),
                commitDraft: (options = {}) => combo.commitDraft(options),
                closePopup: () => combo.close(),
            };
        }
        const multiWrap = target.matches?.('.multi-add-wrap') ? target : target.closest?.('.multi-add-wrap');
        const multi = multiWrap?._notaMultiAdd;
        if (multi) {
            return {
                root: multiWrap.closest('.subblock') || multiWrap,
                anchor: multi.search,
                captureFocus: () => multi.captureFocus(),
                enter: (context = {}) => multi.prepareEntry(context),
                restoreFocus: (token, context = {}) => multi.prepareEntry({ ...context, restoreToken: token }),
                commitDraft: () => true,
                closePopup: (options = {}) => multi.closePicker(options),
            };
        }
        return null;
    }

    /* Primer control pendiente de la fase (para Shift+Enter) */
    function focusFirstPending(id, options = {}) {
        const issue = getIssues(id)[0];
        if (!issue) return false;
        issue.focus(options);
        return true;
    }

    /* ═══════════ Campos simples ═══════════ */
    function wireSimpleField(id, field) {
        const el = document.getElementById(id);
        if (!el) return;
        const handler = () => { state[field] = el.value.trim(); emit(); };
        listen(el, 'input', handler);
        listen(el, 'change', handler);
    }

    /* Encadena Enter de un campo simple; las flechas conservan edición nativa. */
    function chainField(id, nextFocus) {
        const el = document.getElementById(id);
        if (!el) return;
        listen(el, 'keydown', (e) => {
            if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                if (el.getAttribute('aria-required') === 'true' && !el.value.trim()) {
                    e.stopPropagation();
                    el.setAttribute('aria-invalid', 'true');
                    announce(`Complete ${el.getAttribute('aria-label') || 'este campo'} antes de continuar.`);
                    return;
                }
                nextFocus();
            }
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
            deviceDrafts.clear();
            const diagnosis = document.getElementById('diagnosticoMedico');
            if (diagnosis) diagnosis.value = '';
            cbx.aislamiento?.setValue('No aplica');
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
        closeMenus();
        Object.assign(state, {
            posicion: '', numCama: '', numHabitacion: '', servicio: '',
            estadoNeurologico: '', estadoHemodinamico: '', estadoRespiratorio: '',
            escalas: [], sinEscalas: false, diagnosticoMedico: '', aislamiento: 'No aplica', estadoDental: '',
            dispositivos: [], sinDispositivos: false, regiones: [], sinAlteraciones: false, educacion: [],
            respuesta: '', tendencia: '', criterioClinico: '', pendientes: '',
        });
        deviceDrafts.clear();
        lastEducationId = null;
        ['posicion', 'servicio', 'estadoDental', 'estadoNeurologico', 'estadoHemodinamico', 'estadoRespiratorio'].forEach((id) => cbx[id]?.setValue(''));
        ['numCama', 'numHabitacion', 'diagnosticoMedico', 'respuestaIntervenciones', 'criterioClinico', 'pendientes'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        cbx.aislamiento?.setValue('No aplica');
        cbx.tendenciaEvolutiva?.setValue('');
        document.querySelectorAll('.estado-group').forEach((g) => g.classList.remove('estado-group--done'));
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

    function cloneState(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    /* Adaptadores de infraestructura para conservar una única versión confirmada
       en memoria. No alteran reglas, catálogos ni validaciones clínicas. */
    function captureState() {
        return cloneState(state);
    }

    function restoreState(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return false;
        const next = cloneState(snapshot);
        Object.keys(state).forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(next, key)) state[key] = next[key];
        });
        deviceDrafts.clear();
        lastEducationId = state.educacion.at(-1)?.id || null;

        ['posicion', 'servicio', 'estadoDental', 'estadoNeurologico', 'estadoHemodinamico', 'estadoRespiratorio']
            .forEach((fieldId) => cbx[fieldId]?.setValue(state[fieldId] || ''));
        cbx.aislamiento?.setValue(state.aislamiento || 'No aplica');
        cbx.tendenciaEvolutiva?.setValue(state.tendencia || '');

        const scalarFields = {
            numCama: state.numCama,
            numHabitacion: state.numHabitacion,
            diagnosticoMedico: state.diagnosticoMedico,
            respuestaIntervenciones: state.respuesta,
            criterioClinico: state.criterioClinico,
            pendientes: state.pendientes,
        };
        Object.entries(scalarFields).forEach(([id, value]) => {
            const field = document.getElementById(id);
            if (field) field.value = value || '';
        });

        document.querySelectorAll('.estado-group').forEach((group) => {
            group.classList.toggle('estado-group--done', !!state[group.dataset.estado]);
        });
        renderEscalas();
        renderDispositivos();
        renderRegiones();
        renderEducacion();
        syncNoneChoice('sinEscalasBtn', state.sinEscalas);
        syncNoneChoice('sinDispositivosBtn', state.sinDispositivos);
        syncNoneChoice('sinAlteracionesBtn', state.sinAlteraciones);
        escalasUI?.renderPicker();
        dispositivosUI?.renderPicker();
        regionesUI?.renderPicker();
        closeMenus();
        return true;
    }

    /* ═══════════ Init ═══════════ */
    function init({ onChange } = {}) {
        if (lifecycleController) destroy();
        lifecycleController = new AbortController();
        onChangeCb = onChange || (() => {});
        const L = NL().listas;

        /* Fase A: comboboxes + encadenado de teclado */
        cbx.posicion = createCombobox({
            id: 'posicion',
            options: () => L.POSICION || [],
            onDraft: () => { state.posicion = ''; emit(); },
            onSelect: (v) => { state.posicion = v || ''; emit(); },
            onConfirm: () => document.getElementById('numCama')?.focus(),
        });
        cbx.servicio = createCombobox({
            id: 'servicio',
            options: () => L.SERVICIO || [],
            onDraft: () => { state.servicio = ''; emit(); },
            onSelect: (v) => { state.servicio = v || ''; emit(); },
            onConfirm: () => focusStageContinue('patient'),
        });
        cbx.estadoDental = createCombobox({
            id: 'estadoDental',
            options: () => L.DENTAL || [],
            onDraft: () => { state.estadoDental = ''; emit(); },
            onSelect: (v) => { state.estadoDental = v || ''; emit(); },
            onConfirm: () => dispositivosUI?.search.focus(),
        });
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
            onAdd: (nombre, { moveFocus = true } = {}) => {
                const meta = NL().escalas.find((e2) => e2.nombre === nombre);
                if (!meta) return;
                state.sinEscalas = false;
                syncNoneChoice('sinEscalasBtn', false);
                state.escalas.push({ id: uid(), nombre: meta.nombre, corto: meta.corto, min: meta.min, max: meta.max, step: meta.step ?? 1, display: meta.display, puntaje: '' });
                renderEscalas();
                if (moveFocus) {
                    setTimeout(() => {
                        const inputs = document.querySelectorAll('#escalasList .escala-puntaje');
                        inputs[inputs.length - 1]?.focus();
                    }, 0);
                }
            },
            onRemove: (nombre) => {
                const itemIndex = state.escalas.findIndex((item) => item.nombre === nombre);
                const removed = itemIndex >= 0 ? { ...state.escalas[itemIndex] } : null;
                state.escalas = state.escalas.filter((item) => item.nombre !== nombre);
                renderEscalas();
                if (removed) offerUndo(`Se quitó ${removed.corto}`, () => {
                    if (state.escalas.some((item) => item.nombre === removed.nombre)) return;
                    state.sinEscalas = false;
                    syncNoneChoice('sinEscalasBtn', false);
                    state.escalas.splice(Math.min(itemIndex, state.escalas.length), 0, removed);
                    renderEscalas();
                    escalasUI?.renderPicker();
                    emit();
                });
            },
            onFinish: focusScaleCompletion,
        });

        /* Fase C */
        wireSimpleField('diagnosticoMedico', 'diagnosticoMedico');
        chainField('diagnosticoMedico', () => document.getElementById('aislamiento')?.focus());
        // Aislamiento: mismo combobox buscable que el resto del formulario (opcional; por defecto "No aplica").
        cbx.aislamiento = createCombobox({
            id: 'aislamiento',
            options: () => L.AISLAMIENTO || [],
            emptyValue: 'No aplica',
            required: false,
            onDraft: () => { state.aislamiento = ''; emit(); },
            onSelect: (value) => { state.aislamiento = value || 'No aplica'; emit(); },
            onConfirm: () => document.getElementById('estadoDental')?.focus(),
        });
        const initialIsolation = state.aislamiento || 'No aplica';
        cbx.aislamiento?.setValue(initialIsolation);
        state.aislamiento = initialIsolation;

        dispositivosUI = createMultiAdd({
            pickerWrap: document.getElementById('dispositivosPicker'),
            options: () => (L.DISPOSITIVOS || []).map((d) => ({ label: d })),
            toggleLabel: 'Dispositivos presentes',
            placeholder: 'Buscar dispositivo (CVC, SNG, Foley…)',
            getUsed: () => state.dispositivos.map((d) => d.nombre),
            onAdd: (nombre, { moveFocus = true } = {}) => {
                state.sinDispositivos = false;
                syncNoneChoice('sinDispositivosBtn', false);
                state.dispositivos.push({ id: uid(), nombre, fechaInsercion: '', fechaCuracion: '', estado: '' });
                renderDispositivos();
                if (moveFocus) {
                    setTimeout(() => {
                        const cards = document.querySelectorAll('#dispositivosList .multi-add-item');
                        cards[cards.length - 1]?.querySelector('.dev-fecha-ins')?.focus();
                    }, 0);
                }
            },
            onRemove: (nombre) => {
                const itemIndex = state.dispositivos.findIndex((item) => item.nombre === nombre);
                const removed = itemIndex >= 0 ? { ...state.dispositivos[itemIndex] } : null;
                const removedDrafts = removed ? { ...(deviceDrafts.get(removed.id) || {}) } : {};
                state.dispositivos = state.dispositivos.filter((item) => item.nombre !== nombre);
                if (removed) deviceDrafts.delete(removed.id);
                renderDispositivos();
                if (removed) offerUndo(`Se quitó ${removed.nombre}`, () => {
                    if (state.dispositivos.some((item) => item.nombre === removed.nombre)) return;
                    state.sinDispositivos = false;
                    syncNoneChoice('sinDispositivosBtn', false);
                    state.dispositivos.splice(Math.min(itemIndex, state.dispositivos.length), 0, removed);
                    if (Object.keys(removedDrafts).length) deviceDrafts.set(removed.id, removedDrafts);
                    renderDispositivos();
                    dispositivosUI?.renderPicker();
                    emit();
                });
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
                const itemIndex = state.regiones.indexOf(nombre);
                state.regiones = state.regiones.filter((region) => region !== nombre);
                renderRegiones();
                if (itemIndex >= 0) offerUndo(`Se quitó ${nombre}`, () => {
                    if (state.regiones.includes(nombre)) return;
                    state.sinAlteraciones = false;
                    syncNoneChoice('sinAlteracionesBtn', false);
                    state.regiones.splice(Math.min(itemIndex, state.regiones.length), 0, nombre);
                    renderRegiones();
                    regionesUI?.renderPicker();
                    emit();
                });
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
            onDraft: () => { state.tendencia = ''; emit(); },
            onSelect: (value) => { state.tendencia = value || ''; emit(); },
            onConfirm: () => {
                const meta = document.querySelector('#metaSeg [role="radio"][tabindex="0"]')
                    || document.querySelector('#metaSeg [role="radio"]');
                meta?.focus();
            },
        });
        wireSimpleField('criterioClinico', 'criterioClinico');
        wireSimpleField('pendientes', 'pendientes');

        // Deja init() repetible: si el módulo se monta de nuevo, reconstruye las
        // colecciones dinámicas desde el estado conservado sin duplicar listeners.
        ['posicion', 'servicio', 'estadoDental', 'estadoNeurologico', 'estadoHemodinamico', 'estadoRespiratorio']
            .forEach((field) => cbx[field]?.setValue(state[field]));
        ESTADOS.forEach(({ field }) => {
            document.querySelector(`[data-estado="${field}"]`)?.classList.toggle('estado-group--done', !!state[field]);
        });
        cbx.aislamiento?.setValue(state.aislamiento || 'No aplica');
        cbx.tendenciaEvolutiva?.setValue(state.tendencia);
        renderEscalas();
        renderDispositivos();
        renderRegiones();
        renderEducacion();
        syncNoneChoice('sinEscalasBtn', state.sinEscalas);
        syncNoneChoice('sinDispositivosBtn', state.sinDispositivos);
        syncNoneChoice('sinAlteracionesBtn', state.sinAlteraciones);
        escalasUI?.renderPicker();
        dispositivosUI?.renderPicker();
        regionesUI?.renderPicker();

    }

    function closeMenus() {
        comboControls.forEach((control) => control.close());
        escalasUI?.closePicker();
        dispositivosUI?.closePicker();
        regionesUI?.closePicker();
    }

    function reportField(id) {
        const input = document.getElementById(id);
        const control = cbx[id] || input?.closest('[data-cbx]')?._notaCombobox;
        return control?.reportValidity?.() ?? true;
    }

    // Adaptador de hidratación para fixtures de QA: sincroniza el texto visible
    // con el valor confirmado privado sin simular que el formulario fue recorrido.
    function hydrateCombobox(id, value = '') {
        const input = document.getElementById(id);
        const control = cbx[id] || input?.closest('[data-cbx]')?._notaCombobox;
        if (!control) return false;
        control.setValue(String(value ?? ''));
        return true;
    }

    function commitDrafts(stageId) {
        const targetStage = stageId === 'faseA' ? 'patient' : stageId;
        const belongsToStage = (element) => {
            if (!targetStage) return true;
            return element?.closest?.('[data-flow-stage]')?.dataset.flowStage === targetStage;
        };
        let valid = true;
        const controls = new Set(comboControls);
        document.querySelectorAll('[data-cbx]').forEach((wrap) => {
            if (wrap._notaCombobox) controls.add(wrap._notaCombobox);
        });
        controls.forEach((control) => {
            if (!belongsToStage(control.input)) return;
            if (!control.reportValidity()) valid = false;
        });
        dateControls.forEach((control) => {
            if (!belongsToStage(control.input)) return;
            if (!control.commitDraft()) valid = false;
        });
        document.querySelectorAll('.escala-puntaje, .edu-tema').forEach((field) => {
            if (!belongsToStage(field)) return;
            if (field._notaValidity?.reportValidity?.() === false) valid = false;
        });
        return valid;
    }

    function focusEntry(stageOrOptions, dir = 1) {
        const options = typeof stageOrOptions === 'string' ? { stageId: stageOrOptions, dir } : (stageOrOptions || {});
        const stageId = options.stageId || options.id;
        const direction = options.direction === 'backward' ? -1 : (options.dir || dir || 1);
        if (stageId === 'patient') {
            const target = direction < 0 ? document.getElementById('servicio') : document.getElementById('posicion');
            target?.focus();
            return !!target;
        }
        if (stageId === 'fasePAE') return false;
        focusPhase(stageId, direction);
        return document.activeElement?.closest?.('[data-flow-stage]')?.dataset.flowStage === stageId;
    }

    function destroy() {
        closeMenus();
        [...comboControls].forEach((control) => control.destroy());
        document.querySelectorAll('[data-cbx]').forEach((wrap) => wrap._notaCombobox?.destroy?.());
        Object.keys(cbx).forEach((key) => {
            cbx[key]?.destroy?.();
            delete cbx[key];
        });
        [...dateControls].forEach((control) => control.destroy());
        escalasUI?.destroy?.();
        dispositivosUI?.destroy?.();
        regionesUI?.destroy?.();
        escalasUI = null;
        dispositivosUI = null;
        regionesUI = null;
        lifecycleController?.abort();
        lifecycleController = null;
        cancelAnimationFrame(announceFrame);
        announceFrame = 0;
        onChangeCb = () => {};
    }

    window.NotaCampos = {
        state,
        init,
        reset,
        resetPhase,
        captureState,
        restoreState,
        getMissing,
        getIssues,
        phaseStatus,
        focusPhase,
        focusEntry,
        focusFirstPending,
        searchForPhase,
        writingTargets,
        activateForWriting,
        fieldAdapter,
        closeMenus,
        reportField,
        hydrateCombobox,
        commitDrafts,
        destroy,
        setupDateInput: setupClinicalDateInput,
        validateDate: validateClinicalDate,
        formatDate: isoToDMY,
        formatEscalas,
        formatDispositivos,
        formatRegiones,
        formatEducacion,
        formatVigentes,
        escalasItems,
        dispositivosItems,
        regionesItems,
    };
})();
