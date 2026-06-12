/* ================================================================
   CareFlow — Partículas en canvas (dos modos)
   - data-mode="flow" (por defecto): trazos orientados que radian desde el
     centro (estilo Google Antigravity), sobre fondo blanco.
   - data-mode="network": red de partículas interconectadas (nodos + líneas)
     pensada para el panel azul del login.
   Ambos reaccionan al cursor. Respeta prefers-reduced-motion.
   Uso: <canvas class="cf-particles" data-density="1" data-mode="flow"></canvas>
   ================================================================ */
(function () {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Paleta del modo "flow" (azul de marca + acentos)
  const FLOW_PALETTE = [
    { c: [0, 62, 192],   w: 30 },
    { c: [36, 153, 253], w: 34 },
    { c: [19, 102, 224], w: 16 },
    { c: [108, 91, 255], w: 10 },
    { c: [24, 198, 230], w: 10 },
  ];
  function pickFlowColor() {
    let total = 0; for (let i = 0; i < FLOW_PALETTE.length; i++) total += FLOW_PALETTE[i].w;
    let r = Math.random() * total;
    for (let i = 0; i < FLOW_PALETTE.length; i++) { r -= FLOW_PALETTE[i].w; if (r <= 0) return FLOW_PALETTE[i].c; }
    return FLOW_PALETTE[0].c;
  }

  function initCanvas(canvas) {
    const mode = canvas.dataset.mode || 'flow';
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const densityFactor = parseFloat(canvas.dataset.density || '1');
    let w = 0, h = 0, cx = 0, cy = 0, parts = [], raf = null, running = true, t = 0;
    const mouse = { x: null, y: null, active: false };

    function resize() {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height; cx = w / 2; cy = h / 2;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      build();
    }

    /* ---------- MODO FLOW (Antigravity) ---------- */
    function spawnFlow(central) {
      const a = Math.random() * Math.PI * 2;
      const minDim = Math.min(w, h);
      const r0 = central ? Math.random() * minDim * 0.06 : Math.random() * Math.hypot(w, h) * 0.5;
      const sp = 0.25 + Math.random() * 0.5;
      return { x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0,
               vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
               col: pickFlowColor(), wgt: Math.random() * 1.1 + 0.8 };
    }
    function flowAngle(x, y) {
      return Math.sin(x * 0.0016 + t * 0.6) + Math.cos(y * 0.0020 - t * 0.5) + Math.sin((x + y) * 0.0011 + t * 0.3);
    }
    function stepFlow() {
      t += 0.01;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        // Empuje radial desde el centro = movimiento simétrico en TODAS las direcciones
        const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy) || 0.001;
        p.vx += (dx / d) * 0.019; p.vy += (dy / d) * 0.019;
        // Campo de flujo = solo ondulación suave (débil → sin deriva neta hacia un lado)
        const ang = flowAngle(p.x, p.y);
        p.vx += Math.cos(ang) * 0.012; p.vy += Math.sin(ang) * 0.012;
        if (mouse.active && mouse.x != null) {
          const mx = p.x - mouse.x, my = p.y - mouse.y, md = Math.hypot(mx, my);
          if (md < 150 && md > 0.1) {
            const f = (1 - md / 150);
            p.vx += (mx / md) * f * 1.6; p.vy += (my / md) * f * 1.6;
            p.vx += (-my / md) * f * 0.8; p.vy += (mx / md) * f * 0.8;
          }
        }
        p.vx *= 0.97; p.vy *= 0.97;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 2.6) { p.vx = (p.vx / sp) * 2.6; p.vy = (p.vy / sp) * 2.6; }
        p.x += p.vx; p.y += p.vy;
        if (p.x < -24 || p.x > w + 24 || p.y < -24 || p.y > h + 24) { Object.assign(p, spawnFlow(true)); continue; }
        const speed = Math.hypot(p.vx, p.vy);
        const len = Math.min(Math.max(speed * 7, 3), 16);
        const a2 = Math.atan2(p.vy, p.vx);
        const hx = Math.cos(a2) * len * 0.5, hy = Math.sin(a2) * len * 0.5;
        const alpha = Math.min(Math.max(0.22 + speed * 0.26, 0.22), 0.66);
        ctx.beginPath();
        ctx.moveTo(p.x - hx, p.y - hy); ctx.lineTo(p.x + hx, p.y + hy);
        ctx.strokeStyle = 'rgba(' + p.col[0] + ',' + p.col[1] + ',' + p.col[2] + ',' + alpha + ')';
        ctx.lineWidth = p.wgt; ctx.stroke();
      }
      if (running) raf = requestAnimationFrame(stepFlow);
    }

    /* ---------- MODO NETWORK (login, panel azul) ---------- */
    const LINK = 132, MR = 165;
    function buildNetwork() {
      const target = Math.round((w * h) / 12500 * densityFactor);
      const count = Math.max(20, Math.min(target, 95));
      parts = [];
      for (let i = 0; i < count; i++) {
        parts.push({ x: Math.random() * w, y: Math.random() * h,
                     vx: (Math.random() - 0.5) * 0.32, vy: (Math.random() - 0.5) * 0.32,
                     r: Math.random() * 1.6 + 1.0 });
      }
    }
    function stepNetwork() {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        if (mouse.active && mouse.x != null) {
          const dx = mouse.x - p.x, dy = mouse.y - p.y, dist = Math.hypot(dx, dy);
          if (dist < MR && dist > 0.1) { const f = (1 - dist / MR) * 0.5; p.x += (dx / dist) * f; p.y += (dy / dist) * f; }
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(196, 222, 255, 0.72)';
        ctx.fill();
      }
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const a = parts[i], b = parts[j], dx = a.x - b.x, dy = a.y - b.y, dist = Math.hypot(dx, dy);
          if (dist < LINK) {
            const op = (1 - dist / LINK) * 0.4;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = 'rgba(150, 194, 255, ' + op + ')'; ctx.lineWidth = 1; ctx.stroke();
          }
        }
      }
      if (mouse.active && mouse.x != null) {
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i], dx = p.x - mouse.x, dy = p.y - mouse.y, dist = Math.hypot(dx, dy);
          if (dist < MR) {
            const op = (1 - dist / MR) * 0.55;
            ctx.beginPath(); ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(p.x, p.y);
            ctx.strokeStyle = 'rgba(180, 212, 255, ' + op + ')'; ctx.lineWidth = 1; ctx.stroke();
          }
        }
      }
      if (running) raf = requestAnimationFrame(stepNetwork);
    }

    function build() { if (mode === 'network') buildNetwork(); else { parts = []; const n = Math.max(28, Math.min(Math.round((w * h) / 8200 * densityFactor), 230)); for (let i = 0; i < n; i++) parts.push(spawnFlow(false)); } }
    function loop() { if (mode === 'network') stepNetwork(); else stepFlow(); }

    function onMove(e) {
      const rect = canvas.getBoundingClientRect();
      const px = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const py = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      if (px >= 0 && px <= w && py >= 0 && py <= h) { mouse.x = px; mouse.y = py; mouse.active = true; }
      else mouse.active = false;
    }
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('mouseout', function () { mouse.active = false; }, { passive: true });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { running = false; if (raf) cancelAnimationFrame(raf); }
      else if (!running) { running = true; loop(); }
    });

    resize();
    loop();
  }

  function boot() {
    const canvases = document.querySelectorAll('canvas.cf-particles');
    if (!canvases.length || reduced) return;
    canvases.forEach(initCanvas);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
