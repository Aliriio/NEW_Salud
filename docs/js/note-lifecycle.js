/* Ciclo de vida local de la Nota de entrega.
   No persiste datos ni conoce el DOM: app.js traduce sus estados a la interfaz. */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CareFlowNoteLifecycle = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const PHASES = Object.freeze({
        DRAFT: 'draft',
        REVIEWING_DRAFT: 'reviewingDraft',
        CONFIRMING_DRAFT: 'confirmingDraft',
        CONFIRMED: 'confirmed',
        EDITING: 'editing',
        REVIEWING_EDIT: 'reviewingEdit',
        CONFIRMING_EDIT: 'confirmingEdit',
    });

    const LOOKUP_STATES = Object.freeze({
        IDLE: 'idle',
        SEARCHING: 'searching',
        FOUND: 'found',
        NOT_FOUND: 'notFound',
        ERROR: 'error',
        INTEGRATION_PENDING: 'integrationPending',
    });

    const REVIEW_PHASES = new Set([PHASES.REVIEWING_DRAFT, PHASES.REVIEWING_EDIT]);
    const EDIT_PHASES = new Set([PHASES.EDITING, PHASES.REVIEWING_EDIT, PHASES.CONFIRMING_EDIT]);

    function clone(value) {
        if (value == null) return value;
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    function localDateParts(value) {
        const date = value instanceof Date ? value : new Date(value);
        return {
            day: String(date.getDate()).padStart(2, '0'),
            month: String(date.getMonth() + 1).padStart(2, '0'),
            year: String(date.getFullYear()),
            hour: String(date.getHours()).padStart(2, '0'),
            minute: String(date.getMinutes()).padStart(2, '0'),
            second: String(date.getSeconds()).padStart(2, '0'),
        };
    }

    function formatLocalDate(value) {
        const p = localDateParts(value);
        return `${p.day}/${p.month}/${p.year}`;
    }

    function formatLocalTime(value) {
        const p = localDateParts(value);
        return `${p.hour}:${p.minute}:${p.second}`;
    }

    function create({ clock = () => new Date() } = {}) {
        const listeners = new Set();
        const initialNow = clock();
        let state = {
            phase: PHASES.DRAFT,
            identity: { type: '', number: '' },
            lookup: { status: LOOKUP_STATES.IDLE, message: '' },
            shiftDate: formatLocalDate(initialNow),
            confirmed: null,
            dirty: false,
        };

        const emit = (event) => {
            const publicState = getState();
            listeners.forEach((listener) => listener(publicState, event));
        };

        const setPhase = (phase, event = 'phase') => {
            state.phase = phase;
            emit(event);
            return phase;
        };

        function getState() {
            return clone(state);
        }

        function getPhase() {
            return state.phase;
        }

        function getContext() {
            return clone({
                identity: state.identity,
                lookup: state.lookup,
                shiftDate: state.shiftDate,
                hasConfirmed: !!state.confirmed,
            });
        }

        function getConfirmationMeta() {
            if (!state.confirmed) return null;
            return {
                confirmedAt: state.confirmed.confirmedAt || '',
                confirmationTime: state.confirmed.confirmationTime || '',
                copied: !!state.confirmed.copied,
            };
        }

        function subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            listeners.add(listener);
            return () => listeners.delete(listener);
        }

        function setIdentity(identity) {
            if (state.confirmed) return false;
            const next = {
                type: String(identity?.type || ''),
                number: String(identity?.number || '').trim(),
            };
            const changed = next.type !== state.identity.type || next.number !== state.identity.number;
            state.identity = next;
            if (changed) state.lookup = { status: LOOKUP_STATES.IDLE, message: '' };
            emit('identity');
            return true;
        }

        function setLookup(status, message = '') {
            if (!Object.values(LOOKUP_STATES).includes(status)) return false;
            state.lookup = { status, message: String(message || '') };
            emit('lookup');
            return true;
        }

        function openReview({ complete = false } = {}) {
            if (!complete) return false;
            if (state.phase === PHASES.DRAFT) return setPhase(PHASES.REVIEWING_DRAFT, 'review-open');
            if (state.phase === PHASES.EDITING) return setPhase(PHASES.REVIEWING_EDIT, 'review-open');
            if (state.phase === PHASES.CONFIRMED) {
                emit('review-open-confirmed');
                return state.phase;
            }
            return false;
        }

        function closeReview() {
            if (state.phase === PHASES.REVIEWING_DRAFT) return setPhase(PHASES.DRAFT, 'review-close');
            if (state.phase === PHASES.REVIEWING_EDIT) return setPhase(PHASES.EDITING, 'review-close');
            if (state.phase === PHASES.CONFIRMED) {
                emit('review-close-confirmed');
                return state.phase;
            }
            return false;
        }

        function markChanged() {
            state.dirty = true;
            if (state.phase === PHASES.CONFIRMED) return setPhase(PHASES.EDITING, 'changed');
            emit('changed');
            return state.phase;
        }

        function beginConfirmation() {
            if (state.phase === PHASES.REVIEWING_DRAFT) {
                return setPhase(PHASES.CONFIRMING_DRAFT, 'confirmation-start');
            }
            if (state.phase === PHASES.REVIEWING_EDIT) {
                return setPhase(PHASES.CONFIRMING_EDIT, 'confirmation-start');
            }
            return false;
        }

        function completeConfirmation(version) {
            if (![PHASES.CONFIRMING_DRAFT, PHASES.CONFIRMING_EDIT].includes(state.phase)) return false;
            state.confirmed = {
                ...clone(version),
                copied: false,
            };
            state.dirty = false;
            return setPhase(PHASES.CONFIRMED, 'confirmation-complete');
        }

        function cancelConfirmation() {
            if (state.phase === PHASES.CONFIRMING_DRAFT) return setPhase(PHASES.REVIEWING_DRAFT, 'confirmation-cancel');
            if (state.phase === PHASES.CONFIRMING_EDIT) return setPhase(PHASES.REVIEWING_EDIT, 'confirmation-cancel');
            return false;
        }

        function canCopy() {
            return state.phase === PHASES.CONFIRMED && !!state.confirmed;
        }

        function markCopied() {
            if (!canCopy()) return false;
            state.confirmed.copied = true;
            emit('copied');
            return true;
        }

        function getConfirmed() {
            return clone(state.confirmed);
        }

        function discardEditing() {
            if (!EDIT_PHASES.has(state.phase) || !state.confirmed) return null;
            const version = clone(state.confirmed);
            state.dirty = false;
            setPhase(PHASES.CONFIRMED, 'editing-discarded');
            return version;
        }

        function reset() {
            const now = clock();
            state = {
                phase: PHASES.DRAFT,
                identity: { type: '', number: '' },
                lookup: { status: LOOKUP_STATES.IDLE, message: '' },
                shiftDate: formatLocalDate(now),
                confirmed: null,
                dirty: false,
            };
            emit('reset');
        }

        function isEditing() {
            return EDIT_PHASES.has(state.phase);
        }

        function isReviewing() {
            return REVIEW_PHASES.has(state.phase);
        }

        function hasExitRisk() {
            if ([PHASES.DRAFT, PHASES.REVIEWING_DRAFT].includes(state.phase) && state.dirty) return 'draft';
            if (isEditing()) return 'editing';
            if (state.phase === PHASES.CONFIRMED && state.confirmed && !state.confirmed.copied) return 'uncopied';
            return '';
        }

        return Object.freeze({
            getState,
            getPhase,
            getContext,
            getConfirmationMeta,
            subscribe,
            setIdentity,
            setLookup,
            openReview,
            closeReview,
            markChanged,
            beginConfirmation,
            completeConfirmation,
            cancelConfirmation,
            canCopy,
            markCopied,
            getConfirmed,
            discardEditing,
            reset,
            isEditing,
            isReviewing,
            hasExitRisk,
        });
    }

    return Object.freeze({ PHASES, LOOKUP_STATES, formatLocalDate, formatLocalTime, create });
});
