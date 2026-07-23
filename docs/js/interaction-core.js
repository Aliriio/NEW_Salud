/* Nucleo de interaccion keyboard-first de CareFlow.
   No conoce campos ni estado clinico: coordina secciones, foco, issues,
   overlays, transacciones y el unico dispatcher global de teclado. */
(function (global) {
    'use strict';

    if (global.CareFlowInteraction) return;

    const VERSION = '1.1.0';
    const DEFAULT_FOCUS_ATTRIBUTE = 'data-focus-id';
    const activeKeyboardControllers = new WeakMap();

    const isElement = (value) => !!value && value.nodeType === 1;
    const isDocument = (value) => !!value && value.nodeType === 9;
    const isFunction = (value) => typeof value === 'function';
    const isPromiseLike = (value) => !!value && isFunction(value.then);
    const asArray = (value) => Array.isArray(value) ? value : [value];

    function ownerDocument(value) {
        if (isDocument(value)) return value;
        return value?.ownerDocument || global.document || null;
    }

    function resolveElement(value, root) {
        const scope = root || global.document;
        let candidate = value;
        if (isFunction(candidate)) candidate = candidate();
        if (isElement(candidate) || isDocument(candidate)) return candidate;
        if (typeof candidate !== 'string' || !scope?.querySelector) return null;
        try {
            return scope.querySelector(candidate);
        } catch (_) {
            return null;
        }
    }

    function escapeSelector(value) {
        if (global.CSS?.escape) return global.CSS.escape(String(value));
        return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char.codePointAt(0).toString(16)} `);
    }

    function isUnavailable(element) {
        if (!isElement(element) || !element.isConnected) return true;
        if (element.disabled || element.getAttribute('aria-disabled') === 'true') return true;
        for (let current = element; current && isElement(current); current = current.parentElement) {
            if (current.hidden || current.inert || current.getAttribute('aria-hidden') === 'true') return true;
        }
        return false;
    }

    function isEditableTarget(target) {
        if (!isElement(target)) return false;
        if (target.isContentEditable || target.closest?.('[contenteditable="true"]')) return true;
        if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
        if (target.tagName !== 'INPUT') return false;
        const nonTextTypes = new Set([
            'button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio',
            'range', 'reset', 'submit',
        ]);
        return !nonTextTypes.has((target.type || 'text').toLowerCase());
    }

    function normalizeHandlerResult(result) {
        if (result === true) {
            return { handled: true, preventDefault: true, stopPropagation: true };
        }
        if (!result || result.handled !== true) {
            return { handled: false, preventDefault: false, stopPropagation: false };
        }
        return {
            handled: true,
            preventDefault: result.preventDefault !== false,
            stopPropagation: result.stopPropagation !== false,
        };
    }

    class InteractionRegistry {
        constructor() {
            this._sections = new Map();
            this._sequence = 0;
        }

        register(section, options = {}) {
            if (!section || typeof section.id !== 'string' || !section.id.trim()) {
                throw new TypeError('InteractionRegistry.register requiere un id de seccion.');
            }
            const id = section.id.trim();
            if (this._sections.has(id) && options.replace !== true) {
                throw new Error(`La seccion "${id}" ya esta registrada.`);
            }
            const record = {
                definition: Object.assign({}, section, { id }),
                sequence: ++this._sequence,
            };
            this._sections.set(id, record);

            let active = true;
            return () => {
                if (!active) return false;
                active = false;
                if (this._sections.get(id) !== record) return false;
                return this._sections.delete(id);
            };
        }

        get(id) {
            return this._sections.get(String(id || ''))?.definition || null;
        }

        unregister(id) {
            return this._sections.delete(String(id || ''));
        }

        values() {
            return [...this._sections.values()]
                .sort((a, b) => a.sequence - b.sequence)
                .map((record) => record.definition);
        }

        _rootFor(section) {
            try {
                return resolveElement(section.root, global.document);
            } catch (_) {
                return null;
            }
        }

        _match(section, target) {
            try {
                if (isFunction(section.contains)) return !!section.contains(target);
                const root = this._rootFor(section);
                return !!root && (root === target || root.contains(target));
            } catch (_) {
                return false;
            }
        }

        findSection(target) {
            if (!target) return null;
            const candidates = [];
            this._sections.forEach((record) => {
                const section = record.definition;
                if (!this._match(section, target)) return;
                const root = this._rootFor(section);
                let distance = Number.MAX_SAFE_INTEGER;
                if (root && isElement(target)) {
                    distance = 0;
                    for (let current = target; current && current !== root; current = current.parentElement) {
                        distance += 1;
                    }
                    if (root !== target && !root.contains(target)) distance = Number.MAX_SAFE_INTEGER;
                }
                candidates.push({
                    section,
                    priority: Number.isFinite(section.priority) ? section.priority : 0,
                    distance,
                    sequence: record.sequence,
                });
            });
            candidates.sort((a, b) => (
                b.priority - a.priority
                || a.distance - b.distance
                || b.sequence - a.sequence
            ));
            return candidates[0]?.section || null;
        }

        clear() {
            this._sections.clear();
        }
    }

    class FocusManager {
        constructor(options = {}) {
            this.registry = options.registry || null;
            this.root = options.root || global.document;
            this.logicalAttribute = options.logicalAttribute || DEFAULT_FOCUS_ATTRIBUTE;
            this.resolveLogical = isFunction(options.resolve) ? options.resolve : null;
            this._sections = new Map();
            this._invokers = new Map();
            this._trackingTarget = null;
            this._onFocusIn = (event) => this.observeFocus(event);
        }

        logicalId(target) {
            if (typeof target === 'string') return target.trim() || null;
            if (!isElement(target)) return null;
            return target.getAttribute(this.logicalAttribute)?.trim() || target.id?.trim() || null;
        }

        _reference(target) {
            if (typeof target === 'string') return { id: this.logicalId(target), element: null };
            if (!isElement(target)) return null;
            return { id: this.logicalId(target), element: target };
        }

        _sectionRoot(sectionId) {
            const section = this.registry?.get(sectionId);
            if (!section) return null;
            try {
                return resolveElement(section.root, this.root);
            } catch (_) {
                return null;
            }
        }

        resolve(target, options = {}) {
            if (isElement(target)) return isUnavailable(target) ? null : target;
            const reference = target && typeof target === 'object' ? target : { id: target };
            if (isElement(reference.element) && !isUnavailable(reference.element)) return reference.element;
            const id = this.logicalId(reference.id);
            if (!id) return null;

            const section = options.sectionId ? this.registry?.get(options.sectionId) : null;
            if (isFunction(section?.resolveFocus)) {
                try {
                    const resolved = section.resolveFocus(id);
                    if (isElement(resolved) && !isUnavailable(resolved)) return resolved;
                } catch (_) {
                    // Continúa con los resolutores genericos.
                }
            }
            if (this.resolveLogical) {
                try {
                    const resolved = this.resolveLogical(id, options);
                    if (isElement(resolved) && !isUnavailable(resolved)) return resolved;
                } catch (_) {
                    // Continúa con la busqueda DOM.
                }
            }

            const scopes = [this._sectionRoot(options.sectionId), resolveElement(options.scope, this.root), this.root]
                .filter(Boolean);
            for (const scope of scopes) {
                let resolved = null;
                if (scope.getElementById) resolved = scope.getElementById(id);
                if (!resolved && scope.querySelector) {
                    try {
                        resolved = scope.querySelector(`[${this.logicalAttribute}="${escapeSelector(id)}"]`)
                            || scope.querySelector(`#${escapeSelector(id)}`);
                    } catch (_) {
                        resolved = null;
                    }
                }
                if (resolved && !isUnavailable(resolved)) return resolved;
            }
            return null;
        }

        focus(target, options = {}) {
            const element = this.resolve(target, options);
            if (!element || !isFunction(element.focus)) return false;
            try {
                element.focus({ preventScroll: options.preventScroll !== false });
                if (options.select === true && isFunction(element.select)) element.select();
                if (options.scroll === true && isFunction(element.scrollIntoView)) {
                    element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
                }
                return element === ownerDocument(element)?.activeElement;
            } catch (_) {
                return false;
            }
        }

        remember(sectionId, target) {
            const id = String(sectionId || '').trim();
            const reference = this._reference(target);
            if (!id || !reference?.id) return false;
            this._sections.set(id, reference);
            return true;
        }

        rememberedId(sectionId) {
            return this._sections.get(String(sectionId || ''))?.id || null;
        }

        focusRemembered(sectionId, options = {}) {
            const id = String(sectionId || '');
            const remembered = this._sections.get(id);
            if (remembered && this.focus(remembered, Object.assign({}, options, { sectionId: id }))) return true;
            if (options.fallback) return this.focus(options.fallback, Object.assign({}, options, { sectionId: id }));
            return false;
        }

        captureInvoker(key, target) {
            const id = String(key || '').trim();
            const candidate = target || ownerDocument(this.root)?.activeElement;
            const reference = this._reference(candidate);
            if (!id || !reference) return false;
            this._invokers.set(id, reference);
            return true;
        }

        restoreInvoker(key, options = {}) {
            const id = String(key || '');
            const reference = this._invokers.get(id);
            if (options.clear !== false) this._invokers.delete(id);
            if (reference && this.focus(reference, options)) return true;
            return options.fallback ? this.focus(options.fallback, options) : false;
        }

        discardInvoker(key) {
            return this._invokers.delete(String(key || ''));
        }

        observeFocus(eventOrTarget) {
            const target = eventOrTarget?.target || eventOrTarget;
            if (!isElement(target)) return false;
            const section = this.registry?.findSection(target);
            return section ? this.remember(section.id, target) : false;
        }

        startTracking(target = this.root) {
            if (this._trackingTarget) return this;
            const eventTarget = resolveElement(target, this.root) || target;
            if (!eventTarget?.addEventListener) return this;
            this._trackingTarget = eventTarget;
            eventTarget.addEventListener('focusin', this._onFocusIn, true);
            return this;
        }

        stopTracking() {
            if (!this._trackingTarget) return;
            this._trackingTarget.removeEventListener('focusin', this._onFocusIn, true);
            this._trackingTarget = null;
        }

        clear(sectionId) {
            if (sectionId === undefined) {
                this._sections.clear();
                this._invokers.clear();
                return;
            }
            this._sections.delete(String(sectionId));
        }

        destroy() {
            this.stopTracking();
            this.clear();
        }
    }

    class IssueRegistry {
        constructor(options = {}) {
            this.focusManager = options.focusManager || null;
            this._stageOrder = new Map();
            this._issues = new Map();
            this._sequence = 0;
            this.setStageOrder(options.stageOrder || []);
        }

        setStageOrder(stageIds) {
            this._stageOrder.clear();
            asArray(stageIds || []).forEach((id, index) => this._stageOrder.set(String(id), index));
        }

        _normalize(issue, owner) {
            if (!issue || typeof issue.id !== 'string' || !issue.id.trim()) {
                throw new TypeError('Cada issue requiere un id.');
            }
            return Object.assign({}, issue, {
                id: issue.id.trim(),
                owner,
                stageId: issue.stageId == null ? '' : String(issue.stageId),
                controlId: issue.controlId == null ? '' : String(issue.controlId),
                type: issue.type === 'invalid' ? 'invalid' : 'missing',
                message: String(issue.message || ''),
                order: Number.isFinite(issue.order) ? issue.order : Number.MAX_SAFE_INTEGER,
                _sequence: ++this._sequence,
            });
        }

        add(issue, owner = 'default') {
            const ownerId = String(owner || 'default');
            const normalized = this._normalize(issue, ownerId);
            this._issues.set(`${ownerId}::${normalized.id}`, normalized);
            return normalized;
        }

        replace(owner, issues) {
            const ownerId = String(owner || 'default');
            const normalized = asArray(issues || []).filter(Boolean)
                .map((issue) => this._normalize(issue, ownerId));
            this.clear(ownerId);
            normalized.forEach((issue) => this._issues.set(`${ownerId}::${issue.id}`, issue));
            return this.all({ owner: ownerId });
        }

        remove(id, owner) {
            if (owner !== undefined) return this._issues.delete(`${String(owner)}::${String(id)}`);
            let removed = false;
            this._issues.forEach((issue, key) => {
                if (issue.id === String(id)) removed = this._issues.delete(key) || removed;
            });
            return removed;
        }

        clear(owner) {
            if (owner === undefined) {
                this._issues.clear();
                return;
            }
            const ownerId = String(owner);
            this._issues.forEach((issue, key) => {
                if (issue.owner === ownerId) this._issues.delete(key);
            });
        }

        all(filter = {}) {
            const stageRank = (stageId) => this._stageOrder.has(stageId)
                ? this._stageOrder.get(stageId)
                : Number.MAX_SAFE_INTEGER;
            return [...this._issues.values()]
                .filter((issue) => !filter.owner || issue.owner === filter.owner)
                .filter((issue) => !filter.stageId || issue.stageId === filter.stageId)
                .filter((issue) => !filter.type || issue.type === filter.type)
                .sort((a, b) => (
                    stageRank(a.stageId) - stageRank(b.stageId)
                    || a.order - b.order
                    || a._sequence - b._sequence
                ))
                .map(({ _sequence, ...issue }) => issue);
        }

        first(filter = {}) {
            return this.all(filter)[0] || null;
        }

        focusFirst(filter = {}) {
            const issue = this.first(filter);
            if (!issue) return false;
            if (isFunction(issue.focus)) {
                try {
                    return issue.focus(issue) !== false;
                } catch (_) {
                    return false;
                }
            }
            if (!issue.controlId || !this.focusManager) return false;
            return this.focusManager.focus(issue.controlId, { sectionId: issue.stageId, scroll: true });
        }

        get size() {
            return this._issues.size;
        }
    }

    class ActionAnnouncer {
        constructor(options = {}) {
            this._regionSource = options.region || null;
            this.politeness = options.politeness === 'assertive' ? 'assertive' : 'polite';
            this.dedupeMs = Number.isFinite(options.dedupeMs) ? Math.max(0, options.dedupeMs) : 800;
            this._lastMessage = '';
            this._lastAt = 0;
            this._token = 0;
            this._clearTimer = null;
            this.configure();
        }

        region() {
            try {
                return resolveElement(this._regionSource, global.document);
            } catch (_) {
                return null;
            }
        }

        setRegion(region) {
            this._regionSource = region;
            this.configure();
            return this;
        }

        configure() {
            const region = this.region();
            if (!region) return false;
            region.setAttribute('aria-live', this.politeness);
            region.setAttribute('aria-atomic', 'true');
            if (!region.hasAttribute('role')) region.setAttribute('role', this.politeness === 'assertive' ? 'alert' : 'status');
            return true;
        }

        announce(message, options = {}) {
            const text = String(message || '').trim();
            const region = this.region();
            if (!text || !region) return false;
            const now = Date.now();
            if (options.force !== true && text === this._lastMessage && now - this._lastAt < this.dedupeMs) return false;
            this._lastMessage = text;
            this._lastAt = now;
            const token = ++this._token;
            region.textContent = '';
            const schedule = global.requestAnimationFrame || ((callback) => global.setTimeout(callback, 0));
            schedule(() => {
                if (token !== this._token || !region.isConnected) return;
                region.textContent = text;
            });
            if (this._clearTimer) global.clearTimeout(this._clearTimer);
            if (Number.isFinite(options.clearAfter) && options.clearAfter > 0) {
                this._clearTimer = global.setTimeout(() => {
                    if (token === this._token) region.textContent = '';
                }, options.clearAfter);
            }
            return true;
        }

        clear() {
            this._token += 1;
            if (this._clearTimer) global.clearTimeout(this._clearTimer);
            this._clearTimer = null;
            const region = this.region();
            if (region) region.textContent = '';
        }

        destroy() {
            this.clear();
            this._regionSource = null;
        }
    }

    class OverlayManager {
        constructor(options = {}) {
            this.focusManager = options.focusManager || null;
            this._stack = [];
            this._sequence = 0;
        }

        push(overlay, options = {}) {
            if (!overlay || typeof overlay.id !== 'string' || !overlay.id.trim()) {
                throw new TypeError('OverlayManager.push requiere un id.');
            }
            const id = overlay.id.trim();
            if (this.get(id)) {
                if (options.replace !== true) throw new Error(`El overlay "${id}" ya esta abierto.`);
                this.remove(id, { restoreFocus: false });
            }
            const entry = Object.assign({
                closeOnEscape: true,
                restoreFocus: true,
                modal: false,
                allowGlobal: false,
            }, overlay, { id, _sequence: ++this._sequence });
            this._stack.push(entry);
            this.focusManager?.captureInvoker(`overlay:${id}`, overlay.invoker);
            return () => this.remove(id);
        }

        get(id) {
            return this._stack.find((entry) => entry.id === String(id || '')) || null;
        }

        top() {
            return this._stack[this._stack.length - 1] || null;
        }

        contains(target, overlay = this.top()) {
            if (!overlay || !target) return false;
            try {
                if (isFunction(overlay.contains)) return !!overlay.contains(target);
                const element = resolveElement(overlay.element, global.document);
                return !!element && (element === target || element.contains(target));
            } catch (_) {
                return false;
            }
        }

        remove(id, options = {}) {
            const overlayId = String(id || this.top()?.id || '');
            const index = this._stack.findIndex((entry) => entry.id === overlayId);
            if (index < 0) return false;
            const wasTop = index === this._stack.length - 1;
            const [entry] = this._stack.splice(index, 1);
            const shouldRestore = options.restoreFocus !== false && entry.restoreFocus !== false && wasTop;
            if (shouldRestore) {
                this.focusManager?.restoreInvoker(`overlay:${entry.id}`, {
                    fallback: options.fallback,
                    clear: true,
                    preventScroll: true,
                });
            } else {
                this.focusManager?.discardInvoker?.(`overlay:${entry.id}`);
            }
            return true;
        }

        close(id, options = {}) {
            const entry = this.get(id) || (!id ? this.top() : null);
            if (!entry) return false;
            if (isFunction(entry.onClose)) {
                const result = entry.onClose({ id: entry.id, reason: options.reason || 'programmatic' });
                if (result === false) return false;
                if (!this.get(entry.id)) return true;
            }
            return this.remove(entry.id, options);
        }

        handleEscape(event) {
            const entry = this.top();
            if (!entry) return false;
            if (isFunction(entry.onEscape)) {
                const result = entry.onEscape({
                    event,
                    overlay: entry,
                    close: (options) => this.close(entry.id, Object.assign({ reason: 'escape' }, options)),
                });
                if (result === true) return true;
                if (result === false) return false;
                if (!this.get(entry.id)) return true;
            }
            if (entry.closeOnEscape === false) return false;
            return this.close(entry.id, { reason: 'escape' });
        }

        clear(options = {}) {
            while (this.top()) this.remove(this.top().id, options);
        }

        get size() {
            return this._stack.length;
        }
    }

    class ChangeTransaction {
        constructor(options = {}) {
            this.defaults = Object.assign({}, options);
            this._active = null;
            this._sequence = 0;
        }

        get active() {
            return !!this._active;
        }

        cancel() {
            if (!this._active) return false;
            this._active.cancelled = true;
            this._active.controller?.abort();
            return true;
        }

        async run(options = {}) {
            if (this._active) return { status: 'busy' };
            const config = Object.assign({}, this.defaults, options);
            if (!isFunction(config.apply)) throw new TypeError('ChangeTransaction.run requiere apply().');

            const transaction = {
                id: ++this._sequence,
                cancelled: false,
                controller: global.AbortController ? new global.AbortController() : null,
            };
            this._active = transaction;
            const hasComparableValues = Object.prototype.hasOwnProperty.call(config, 'current')
                && Object.prototype.hasOwnProperty.call(config, 'next');
            const equal = isFunction(config.equal) ? config.equal : Object.is;
            let snapshot;
            let captured = false;

            try {
                if (hasComparableValues && equal(config.current, config.next)) {
                    return { status: 'unchanged', value: config.current };
                }
                if (isFunction(config.capture)) {
                    snapshot = await config.capture(config.context);
                    captured = true;
                }
                const transactionContext = {
                    id: transaction.id,
                    current: config.current,
                    next: config.next,
                    snapshot,
                    context: config.context,
                    signal: transaction.controller?.signal,
                };
                let impact = config.requiresConfirmation === true;
                if (isFunction(config.hasImpact)) impact = await config.hasImpact(transactionContext);

                if (impact) {
                    if (!isFunction(config.confirm)) {
                        return { status: 'confirmation-required', impact, snapshot };
                    }
                    let accepted;
                    try {
                        accepted = await config.confirm(Object.assign({}, transactionContext, { impact }));
                    } catch (error) {
                        if (transaction.cancelled || transaction.controller?.signal.aborted) {
                            return { status: 'cancelled', snapshot };
                        }
                        throw error;
                    }
                    if (transaction.cancelled || accepted !== true) {
                        if (isFunction(config.onCancel)) await config.onCancel(transactionContext);
                        return { status: 'cancelled', snapshot };
                    }
                }
                if (transaction.cancelled) return { status: 'cancelled', snapshot };

                let value;
                try {
                    value = await config.apply(transactionContext);
                } catch (error) {
                    if (captured && isFunction(config.restore)) {
                        try {
                            await config.restore(snapshot, transactionContext);
                        } catch (rollbackError) {
                            error.rollbackError = rollbackError;
                        }
                    }
                    throw error;
                }
                if (isFunction(config.onCommit)) await config.onCommit(value, transactionContext);
                return { status: 'committed', value, snapshot };
            } finally {
                if (this._active === transaction) this._active = null;
            }
        }
    }

    class InteractionMetrics {
        constructor(options = {}) {
            this.limit = Number.isFinite(options.limit) ? Math.max(100, options.limit) : 2000;
            this._clock = isFunction(options.clock)
                ? options.clock
                : () => global.performance?.now?.() ?? Date.now();
            this.reset();
        }

        reset() {
            this._startedAt = this._clock();
            this._events = [];
            this._counts = new Map();
        }

        record(type, detail = {}) {
            const eventType = String(type || '').trim().slice(0, 40);
            if (!eventType) return false;
            const allowed = ['targetId', 'stageId', 'modality', 'action', 'outcome', 'from', 'to', 'count'];
            const safe = {};
            allowed.forEach((key) => {
                const value = detail[key];
                if (typeof value === 'string') safe[key] = value.slice(0, 80);
                else if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
            });
            const entry = Object.freeze({
                type: eventType,
                atMs: Math.max(0, Math.round(this._clock() - this._startedAt)),
                ...safe,
            });
            this._events.push(entry);
            if (this._events.length > this.limit) this._events.shift();
            this._counts.set(eventType, (this._counts.get(eventType) || 0) + 1);
            return true;
        }

        snapshot() {
            return {
                durationMs: Math.max(0, Math.round(this._clock() - this._startedAt)),
                counts: Object.fromEntries(this._counts),
                events: this._events.map((event) => ({ ...event })),
            };
        }
    }

    function detectInteractionOrigin(event, fallback = 'programmatic') {
        if (!event) return fallback;
        if (event.type?.startsWith('key')) return 'keyboard';
        if (event.type?.startsWith('touch')) return 'touch';
        if (event.type?.startsWith('pointer')) {
            if (event.pointerType === 'touch') return 'touch';
            if (event.pointerType === 'pen') return 'pen';
            return 'mouse';
        }
        if (event.type?.startsWith('mouse')) return 'mouse';
        if (event.type === 'click' && event.detail === 0) return 'assistive';
        return fallback;
    }

    class InteractionOrigin {
        constructor(options = {}) {
            this.target = options.target || global.document;
            this.value = options.initial || 'programmatic';
            this.timestamp = 0;
            this._started = false;
            this._onPointerDown = (event) => this.observe(event);
            this._onKeyDown = (event) => this.observe(event);
        }

        observe(event) {
            return this.mark(detectInteractionOrigin(event, this.value));
        }

        mark(origin) {
            const allowed = new Set(['keyboard', 'mouse', 'touch', 'pen', 'assistive', 'programmatic']);
            this.value = allowed.has(origin) ? origin : 'programmatic';
            this.timestamp = Date.now();
            return this.value;
        }

        current(options = {}) {
            if (Number.isFinite(options.maxAge) && Date.now() - this.timestamp > options.maxAge) return 'programmatic';
            return this.value;
        }

        start() {
            if (this._started || !this.target?.addEventListener) return this;
            this._started = true;
            this.target.addEventListener('pointerdown', this._onPointerDown, true);
            this.target.addEventListener('keydown', this._onKeyDown, true);
            return this;
        }

        destroy() {
            if (this._started) this.target.removeEventListener('pointerdown', this._onPointerDown, true);
            if (this._started) this.target.removeEventListener('keydown', this._onKeyDown, true);
            this._started = false;
        }
    }

    class WritingTargetRegistry {
        constructor(options = {}) {
            this.isAvailable = isFunction(options.isAvailable)
                ? options.isAvailable
                : (element) => !isUnavailable(element);
            this._memory = new Map();
        }

        remember(scopeId, target) {
            const id = String(scopeId ?? '');
            if (!id || !isElement(target) || !this.isAvailable(target, id)) return false;
            this._memory.set(id, target);
            return true;
        }

        forget(scopeId) {
            return this._memory.delete(String(scopeId ?? ''));
        }

        clear() {
            this._memory.clear();
        }

        resolve(options = {}) {
            const scopeId = String(options.scopeId ?? '');
            const candidates = asArray(options.targets || [])
                .flat()
                .filter((target, index, list) => (
                    isElement(target)
                    && list.indexOf(target) === index
                    && this.isAvailable(target, scopeId)
                ));
            const belongs = (target) => target && candidates.includes(target) && this.isAvailable(target, scopeId);
            const remembered = this._memory.get(scopeId);
            if (belongs(remembered)) return remembered;
            if (remembered) this._memory.delete(scopeId);
            if (belongs(options.pending)) return options.pending;
            if (belongs(options.primary)) return options.primary;
            return candidates[0] || null;
        }

        insert(target, text, options = {}) {
            if (!isElement(target) || typeof text !== 'string' || !text.length || !this.isAvailable(target)) return false;
            target.focus?.({ preventScroll: options.preventScroll === true });
            if (typeof target.setRangeText === 'function') {
                const value = String(target.value ?? '');
                const start = Number.isFinite(target.selectionStart) ? target.selectionStart : value.length;
                const end = Number.isFinite(target.selectionEnd) ? target.selectionEnd : start;
                try {
                    target.setRangeText(text, start, end, 'end');
                } catch (_) {
                    target.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
                }
            } else if ('value' in target) {
                target.value = `${target.value ?? ''}${text}`;
            } else {
                return false;
            }
            const InputEventCtor = global.InputEvent || global.Event;
            target.dispatchEvent(new InputEventCtor('input', {
                bubbles: true,
                inputType: 'insertText',
                data: text,
            }));
            return true;
        }
    }

    class FieldNavigationRegistry {
        constructor(options = {}) {
            this.isAvailable = isFunction(options.isAvailable)
                ? options.isAvailable
                : (field) => {
                    const root = this.root(field);
                    return !!root && !isUnavailable(root);
                };
            this._fields = new Map();
            this._sequence = 0;
        }

        register(field, options = {}) {
            if (!field || typeof field.id !== 'string' || !field.id.trim()) {
                throw new TypeError('FieldNavigationRegistry.register requiere un id de campo.');
            }
            if (typeof field.stageId !== 'string' || !field.stageId.trim()) {
                throw new TypeError('FieldNavigationRegistry.register requiere un stageId.');
            }
            const id = field.id.trim();
            if (this._fields.has(id) && options.replace !== true) {
                throw new Error(`El campo "${id}" ya esta registrado.`);
            }
            const record = Object.assign({}, field, {
                id,
                stageId: field.stageId.trim(),
                kind: field.kind === 'action' ? 'action' : 'field',
                _sequence: ++this._sequence,
            });
            this._fields.set(id, record);
            let active = true;
            return () => {
                if (!active || this._fields.get(id) !== record) return false;
                active = false;
                return this._fields.delete(id);
            };
        }

        get(id) {
            return this._fields.get(String(id || '')) || null;
        }

        root(fieldOrId) {
            const field = typeof fieldOrId === 'string' ? this.get(fieldOrId) : fieldOrId;
            if (!field) return null;
            try {
                return resolveElement(field.root, global.document);
            } catch (_) {
                return null;
            }
        }

        anchor(fieldOrId) {
            const field = typeof fieldOrId === 'string' ? this.get(fieldOrId) : fieldOrId;
            if (!field) return null;
            try {
                return resolveElement(field.anchor, global.document) || this.root(field);
            } catch (_) {
                return this.root(field);
            }
        }

        available(fieldOrId) {
            const field = typeof fieldOrId === 'string' ? this.get(fieldOrId) : fieldOrId;
            if (!field) return false;
            try {
                if (isFunction(field.enabled) && !field.enabled()) return false;
                return this.isAvailable(field, this.anchor(field));
            } catch (_) {
                return false;
            }
        }

        values(filter = {}) {
            return [...this._fields.values()]
                .filter((field) => !filter.stageId || field.stageId === filter.stageId)
                .filter((field) => !filter.kind || field.kind === filter.kind)
                .filter((field) => filter.available === false || this.available(field))
                .sort((a, b) => a._sequence - b._sequence);
        }

        find(target, filter = {}) {
            if (!isElement(target)) return null;
            const matches = this.values(Object.assign({}, filter, { available: false }))
                .filter((field) => {
                    try {
                        if (isFunction(field.contains)) return !!field.contains(target);
                        const root = this.root(field);
                        return !!root && (root === target || root.contains(target));
                    } catch (_) {
                        return false;
                    }
                })
                .map((field) => {
                    const root = this.root(field);
                    let depth = 0;
                    for (let current = target; current && current !== root; current = current.parentElement) depth += 1;
                    return { field, depth };
                })
                .sort((a, b) => a.depth - b.depth || b.field._sequence - a.field._sequence);
            return matches[0]?.field || null;
        }

        clear() {
            this._fields.clear();
        }
    }

    class SpatialNavigator {
        constructor(options = {}) {
            this.isAvailable = isFunction(options.isAvailable)
                ? options.isAvailable
                : (element) => !isUnavailable(element);
            this.focus = isFunction(options.focus) ? options.focus : (element) => element?.focus?.();
        }

        _element(value) {
            if (isElement(value)) return value;
            if (!value || typeof value !== 'object') return null;
            try {
                return resolveElement(value.anchor, global.document)
                    || resolveElement(value.root, global.document);
            } catch (_) {
                return null;
            }
        }

        _rect(value) {
            const element = this._element(value);
            if (!isElement(element) || !this.isAvailable(element)) return null;
            const rect = element.getBoundingClientRect?.();
            if (!rect || rect.width <= 0 || rect.height <= 0) return null;
            return rect;
        }

        _axis(rect, direction) {
            if (direction === 'left' || direction === 'right') {
                return {
                    mainStart: rect.left,
                    mainEnd: rect.right,
                    crossStart: rect.top,
                    crossEnd: rect.bottom,
                    mainCenter: rect.left + rect.width / 2,
                    crossCenter: rect.top + rect.height / 2,
                };
            }
            return {
                mainStart: rect.top,
                mainEnd: rect.bottom,
                crossStart: rect.left,
                crossEnd: rect.right,
                mainCenter: rect.top + rect.height / 2,
                crossCenter: rect.left + rect.width / 2,
            };
        }

        _score(originRect, candidateRect, direction, domOrder) {
            const origin = this._axis(originRect, direction);
            const candidate = this._axis(candidateRect, direction);
            const sign = direction === 'left' || direction === 'up' ? -1 : 1;
            const mainDelta = (candidate.mainCenter - origin.mainCenter) * sign;
            if (mainDelta <= 2) return null;

            const forwardGap = sign > 0
                ? Math.max(0, candidate.mainStart - origin.mainEnd)
                : Math.max(0, origin.mainStart - candidate.mainEnd);
            const crossGap = candidate.crossStart > origin.crossEnd
                ? candidate.crossStart - origin.crossEnd
                : origin.crossStart > candidate.crossEnd
                    ? origin.crossStart - candidate.crossEnd
                    : 0;
            const crossCenterDelta = Math.abs(candidate.crossCenter - origin.crossCenter);
            const overlap = Math.max(0, Math.min(origin.crossEnd, candidate.crossEnd)
                - Math.max(origin.crossStart, candidate.crossStart));
            const alignmentPenalty = overlap > 0 ? 0 : crossGap * 3;
            return forwardGap * 4 + alignmentPenalty + crossCenterDelta * 0.7 + mainDelta * 0.15 + domOrder * 0.0001;
        }

        move(options = {}) {
            const origin = options.origin;
            const direction = options.direction;
            if (!['left', 'right', 'up', 'down'].includes(direction)) return null;
            const originRect = this._rect(origin);
            if (!originRect) return null;
            const candidates = asArray(options.candidates || options.units || [])
                .flat()
                .filter((candidate, index, list) => candidate
                    && candidate !== origin
                    && list.indexOf(candidate) === index
                    && !!this._rect(candidate));
            let best = null;
            candidates.forEach((candidate, index) => {
                const rect = this._rect(candidate);
                if (!rect) return;
                const score = this._score(originRect, rect, direction, index);
                if (score == null || (best && score >= best.score)) return;
                best = { candidate, score, rect };
            });
            if (!best) return null;
            if (isFunction(best.candidate.enter)) {
                const entered = best.candidate.enter({
                    direction,
                    reason: options.reason || 'spatial',
                    origin,
                    originRect,
                    targetRect: best.rect,
                    scopeId: options.scopeId,
                });
                if (entered === false) return null;
            } else {
                this.focus(this._element(best.candidate), { origin, direction, scopeId: options.scopeId });
            }
            return best.candidate;
        }
    }

    class TabLevelController {
        constructor(options = {}) {
            this.registry = options.registry || null;
            this._memory = new Map();
        }

        remember(fieldOrId, target) {
            const field = typeof fieldOrId === 'string' ? this.registry?.get(fieldOrId) : fieldOrId;
            if (!field || field.kind !== 'field') return false;
            let token = null;
            try {
                token = isFunction(field.captureFocus) ? field.captureFocus(target) : null;
            } catch (_) {
                token = null;
            }
            this._memory.set(field.stageId, { fieldId: field.id, token });
            return true;
        }

        memory(stageId) {
            return this._memory.get(String(stageId || '')) || null;
        }

        leaveField(fieldOrId, target) {
            const field = typeof fieldOrId === 'string' ? this.registry?.get(fieldOrId) : fieldOrId;
            if (!field || field.kind !== 'field') return false;
            this.remember(field, target);
            try { field.commitDraft?.({ report: false }); } catch (_) { /* el issue conserva el borrador */ }
            try { field.closePopup?.(); } catch (_) { /* el foco aún puede salir */ }
            return true;
        }

        restore(stageId, context = {}) {
            const remembered = this.memory(stageId);
            if (!remembered) return false;
            const field = this.registry?.get(remembered.fieldId);
            if (!field || !this.registry.available(field)) return false;
            try {
                if (isFunction(field.restoreFocus)
                    && field.restoreFocus(remembered.token, Object.assign({ reason: 'tab-return' }, context)) !== false) return true;
                if (isFunction(field.enter)) return field.enter(Object.assign({ reason: 'tab-return' }, context)) !== false;
            } catch (_) {
                return false;
            }
            return false;
        }

        clear(stageId) {
            if (stageId === undefined) this._memory.clear();
            else this._memory.delete(String(stageId));
        }
    }

    class KeyboardController {
        constructor(options = {}) {
            this.target = options.target || global.document;
            this.surface = options.surface || null;
            this.registry = options.registry || null;
            this.overlays = options.overlays || null;
            this.origin = options.origin || null;
            this.handlers = Object.assign({}, options.handlers);
            this.resolveComponent = isFunction(options.resolveComponent) ? options.resolveComponent : null;
            this.onError = isFunction(options.onError) ? options.onError : null;
            this.capture = options.capture !== false;
            this._components = new WeakMap();
            this._componentRoots = new Set();
            this._started = false;
            this._onKeyDown = (event) => this._dispatch(event);
        }

        _surfaceContains(target, event) {
            const sources = asArray(this.surface || []).filter(Boolean);
            return sources.some((source) => {
                try {
                    const resolved = isFunction(source) ? source({ target, event }) : resolveElement(source, global.document);
                    if (typeof resolved === 'boolean') return resolved;
                    return !!resolved && (resolved === target || resolved.contains?.(target));
                } catch (_) {
                    return false;
                }
            });
        }

        registerComponent(root, handler) {
            const element = resolveElement(root, global.document);
            if (!isElement(element) || !(isFunction(handler) || isFunction(handler?.handleKeydown))) {
                throw new TypeError('registerComponent requiere un elemento y un handler sincronico.');
            }
            this._components.set(element, handler);
            this._componentRoots.add(element);
            let active = true;
            return () => {
                if (!active) return false;
                active = false;
                this._components.delete(element);
                return this._componentRoots.delete(element);
            };
        }

        _findComponent(event) {
            const path = isFunction(event.composedPath) ? event.composedPath() : [];
            const nodes = path.length ? path : (() => {
                const result = [];
                for (let current = event.target; current; current = current.parentElement) result.push(current);
                return result;
            })();
            for (const node of nodes) {
                if (this._components.has(node)) return { root: node, handler: this._components.get(node) };
            }
            if (this.resolveComponent) {
                const resolved = this.resolveComponent(event.target, event);
                if (resolved) return resolved.root ? resolved : { root: event.target, handler: resolved };
            }
            return null;
        }

        _reportError(error, layer, context) {
            if (this.onError) {
                this.onError(error, { layer, context });
                return;
            }
            global.console?.error?.(`[CareFlowInteraction:${layer}]`, error);
        }

        _invoke(handler, context, layer, owner) {
            if (!handler) return normalizeHandlerResult(false);
            const fn = isFunction(handler) ? handler : handler.handleKeydown;
            if (!isFunction(fn)) return normalizeHandlerResult(false);
            try {
                const result = fn.call(owner || handler, context);
                if (isPromiseLike(result)) {
                    throw new TypeError('Los handlers de teclado deben ser sincronicos.');
                }
                return normalizeHandlerResult(result);
            } catch (error) {
                this._reportError(error, layer, context);
                return normalizeHandlerResult(false);
            }
        }

        _finish(event, result) {
            if (!result.handled) return false;
            if (result.preventDefault) event.preventDefault();
            if (result.stopPropagation) event.stopImmediatePropagation();
            return true;
        }

        _dispatch(event) {
            if (event.defaultPrevented) return;
            const target = event.target;
            const overlay = this.overlays?.top?.() || null;
            const inOverlay = overlay ? this.overlays.contains(target, overlay) : false;
            if (!this._surfaceContains(target, event) && !inOverlay) return;
            this.origin?.observe?.(event);
            if (event.isComposing || event.keyCode === 229) return;

            const context = {
                event,
                key: event.key,
                target,
                origin: this.origin?.current?.() || detectInteractionOrigin(event),
                controller: this,
                overlay,
                component: null,
                section: null,
                isEditor: isEditableTarget(target),
            };

            if (overlay) {
                let result = this._invoke(this.handlers.overlay, context, 'overlay', this.handlers);
                if (!result.handled) result = this._invoke(overlay.handleKeydown, context, 'overlay', overlay);
                if (!result.handled && event.key === 'Escape') {
                    result = normalizeHandlerResult(this.overlays.handleEscape(event));
                }
                if (this._finish(event, result)) return;
                if (overlay.modal !== false && !inOverlay) {
                    this._finish(event, { handled: true, preventDefault: false, stopPropagation: true });
                    return;
                }
            }

            if (context.isEditor) {
                const result = this._invoke(this.handlers.editor, context, 'editor', this.handlers);
                if (this._finish(event, result)) return;
            }

            const component = this._findComponent(event);
            context.component = component;
            if (component) {
                let result = this._invoke(this.handlers.component, context, 'component', this.handlers);
                if (!result.handled) result = this._invoke(component.handler, context, 'component', component.handler);
                if (this._finish(event, result)) return;
            }

            if (!overlay || overlay.allowGlobal === true) {
                const section = this.registry?.findSection(target) || null;
                context.section = section;
                if (section) {
                    let result = this._invoke(this.handlers.section, context, 'section', this.handlers);
                    if (!result.handled) result = this._invoke(section.handleKeydown, context, 'section', section);
                    if (this._finish(event, result)) return;
                }
                const result = this._invoke(this.handlers.global, context, 'global', this.handlers);
                this._finish(event, result);
            }
        }

        start() {
            if (this._started) return this;
            if (!this.surface) throw new Error('KeyboardController requiere una superficie limitada.');
            if (!this.target?.addEventListener) throw new TypeError('KeyboardController requiere un EventTarget.');
            const active = activeKeyboardControllers.get(this.target);
            if (active && active !== this) throw new Error('Ya existe un KeyboardController global para este EventTarget.');
            activeKeyboardControllers.set(this.target, this);
            this.target.addEventListener('keydown', this._onKeyDown, this.capture);
            this._started = true;
            return this;
        }

        destroy() {
            if (this._started) this.target.removeEventListener('keydown', this._onKeyDown, this.capture);
            if (activeKeyboardControllers.get(this.target) === this) activeKeyboardControllers.delete(this.target);
            this._started = false;
            this._components = new WeakMap();
            this._componentRoots.clear();
        }
    }

    global.CareFlowInteraction = Object.freeze({
        VERSION,
        InteractionRegistry,
        FocusManager,
        IssueRegistry,
        ActionAnnouncer,
        OverlayManager,
        ChangeTransaction,
        InteractionMetrics,
        InteractionOrigin,
        WritingTargetRegistry,
        FieldNavigationRegistry,
        SpatialNavigator,
        TabLevelController,
        KeyboardController,
        detectInteractionOrigin,
        isEditableTarget,
    });
}(window));
