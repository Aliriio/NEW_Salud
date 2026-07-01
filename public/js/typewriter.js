/* ================================================================
   CareFlow — Efecto typewriter del eslogan
   Uso: <h1 data-typewriter data-text="..."></h1>
   Use | in data-text to insert a <br> line break at that position.
   El segmento "lead" (ej. "CareFlow:") se pinta con gradiente de marca.
   Respeta prefers-reduced-motion (muestra el texto completo al instante).
   ================================================================ */
(function () {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m];
    });
  }

  // Al terminar de escribir, revela con una aparición muy suave los elementos
  // del hero (marca, descripción, botones) y también los enlaces del navbar
  // (que están fuera del hero) mediante una clase a nivel de <body>.
  function revealAfter(el) {
    var hero = (el && el.closest) ? el.closest('.cf-hero') : null;
    if (hero) hero.classList.add('is-typed');
    document.body.classList.add('cf-typed');
  }

  /**
   * Build the visible HTML for `count` characters typed from the
   * flat character array, inserting <br> where breakpoints exist.
   */
  function buildTypedHtml(chars, breakpoints, leadLen, count, showCaret) {
    var html = '';
    var inLead = leadLen > 0;
    var charIdx = 0;

    if (inLead) html += '<span class="cf-grad-text">';

    for (var i = 0; i < count; i++) {
      // Close lead span if we've reached the end of the lead segment
      if (inLead && charIdx >= leadLen) {
        html += '</span>';
        inLead = false;
      }
      // Insert <br> for any breakpoint at this character index
      if (breakpoints[charIdx]) {
        html += '<br>';
      }
      html += escapeHtml(chars[charIdx]);
      charIdx++;
    }

    if (inLead) html += '</span>';

    if (showCaret) {
      html += '<span class="cf-type-caret"></span>';
    }
    return html;
  }

  function run(el) {
    var rawText = el.dataset.text || el.textContent.trim();
    var lead = el.dataset.lead || '';
    var leadLen = lead.length;
    var speed = parseInt(el.dataset.speed || '52', 10);

    // Parse | as line-break markers and build a flat character list
    var parts = rawText.split('|');
    var chars = [];       // flat array of actual characters (no |)
    var breakpoints = {}; // charIndex → true  means "insert <br> before this char"

    for (var p = 0; p < parts.length; p++) {
      if (p > 0) {
        breakpoints[chars.length] = true;  // <br> before the first char of this part
      }
      for (var c = 0; c < parts[p].length; c++) {
        chars.push(parts[p][c]);
      }
    }

    var fullText = chars.join('');
    var nowMs = function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); };

    if (reduced) {
      window.cfHeroTypeEndAt = nowMs();
      el.innerHTML = buildTypedHtml(chars, breakpoints, leadLen, chars.length, false);
      revealAfter(el);
      return;
    }

    // Start with empty content + blinking caret
    el.setAttribute('aria-label', fullText);
    el.innerHTML = '<span class="cf-type-caret"></span>';

    // Retardos por carácter PRECALCULADOS (deterministas) → el instante de fin es
    // exacto y se publica en window.cfHeroTypeEndAt para sincronizar el desarmado
    // del logo de partículas (ver particles.js). La escritura se ve igual.
    var START_DELAY = 1000; // ms de cursor titilando antes de escribir
    var gapDelays = [];
    var total = START_DELAY;
    for (var g = 1; g < chars.length; g++) {
      var d = (/[:,.]/.test(chars[g - 1]) ? 220 : speed) + Math.random() * 40;
      gapDelays[g] = d; total += d;
    }
    window.cfHeroTypeEndAt = nowMs() + total;

    var i = 0;

    function tick() {
      i++;
      var done = i >= chars.length;
      el.innerHTML = buildTypedHtml(chars, breakpoints, leadLen, i, !done);
      if (!done) setTimeout(tick, gapDelays[i]);
      else revealAfter(el);
    }

    setTimeout(tick, START_DELAY);
  }

  function boot() {
    document.querySelectorAll('[data-typewriter]').forEach(run);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
