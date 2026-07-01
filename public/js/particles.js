/* ================================================================
   CareFlow — Partículas en canvas (dos modos)

   - data-mode="flow" (por defecto, hero de la landing):
       Sistema de PUNTOS (luciérnagas) suspendidos en bandas anchas de
       viento. Todas comparten una dirección dominante y un vaivén de
       grupo, pero cada punto teje su propio meandro (no siguen el mismo
       camino ni se acumulan en filas/líneas).
       Cada cierto tiempo las partículas son reclutadas para formar EL
       ICONO de CareFlow (muestreado desde assets/logo_menu.svg), lo
       sostienen unos segundos y luego la brisa las suelta de vuelta.
       No usa líneas, trails, blur ni paths visibles. La corriente
       existe sólo por la distribución y el movimiento de los puntos.

   - data-mode="network" (panel azul del login):
       Red de nodos interconectados con líneas. SIN CAMBIOS.

   Ambos respetan prefers-reduced-motion (render estático mínimo).
   Uso: <canvas class="cf-particles" data-density="1.3" data-mode="flow">
   ================================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TWO_PI = Math.PI * 2;

  /* ================================================================
     PARÁMETROS DEL MODO FLOW — fáciles de ajustar.
     Todos se pueden sobreescribir por canvas con data-* (camelCase →
     kebab-case): p. ej. data-wind-speed="0.4", data-logo-scale="0.7".
     ================================================================ */
  var FLOW_DEFAULTS = {
    // — Ambiente (cantidades; se escalan por viewport y DPR) —
    particleCount:              2000,   // total de partículas de viento (objetivo desktop)
    logoParticleCount:          1100,   // máx. partículas reclutadas para el icono
    reinforcementParticleCount: 460,    // refuerzo temporal sobre los bordes del icono

    // — Viento / corriente compartida —
    windSpeed:      0.34,   // velocidad base de deriva (dirección COMPARTIDA; px/frame)
    windDirDeg:     11,     // dirección dominante (grados; ~horizontal con leve diagonal)
    wanderAmp:      0.18,   // meandro INDIVIDUAL por partícula → mismo rumbo, distinto camino (anti-fila)
    swayAmp:        0.07,   // vaivén COMPARTIDO de la banda (coordinación de grupo; px/frame)
    swaySpeed:      0.16,   // velocidad del vaivén compartido (rad/s; lento y relajante)
    windEase:       0.05,   // suavizado hacia el viento (damping; bajo = más fluido)
    bandStiffness:  0.02,   // contención: empuje de vuelta sólo al salirse del ancho de banda

    // — Bandas / ribbons —
    ribbonWidth:    300,    // ancho de referencia de las bandas (px; volumétrico, no raya)
    ribbonCount:    3,      // nº de bandas en desktop (2 en pantallas compactas)
    densScale:      0.0016, // escala del ruido de densidad (crea zonas vacías irregulares)
    windOpacity:    1.0,    // multiplicador global de opacidad del ambiente

    // — Formación del logo (ciclo) —
    windIntervalMs:    10000, // ms de viento libre entre formaciones
    formationDuration: 5000,  // ms de transición viento → logo
    holdDuration:      7500,  // ms que el logo permanece formado
    releaseDuration:   6000,  // ms de dispersión logo → viento
    logoScale:         0.70,  // tamaño del icono respecto a min(w,h) (con clamps por breakpoint)
    logoOpacity:       1.0,   // multiplicador de opacidad del logo + refuerzo
    maskFade:          0.42,  // cuánto se atenúa la máscara blanca del hero al formar el logo

    // — Transición (steering) —
    seekStrength:   0.022,  // atracción hacia el punto-objetivo del logo
    maxSeek:        1.4,    // tope de la fuerza de atracción (evita tirones bruscos)
    swirlStrength:  0.16,   // giro lateral suave mientras se acomoda (no fila recta)
    damping:        0.14,   // asentamiento al llegar (el logo "respira" sin deformarse)
    holdJitter:     0.6,    // micro-respiración del logo en hold (px)
    maxSpeed:       1.5,    // velocidad máx en viento (sube durante la formación)

    // — Cursor (muy sutil: mueve el aire, no repele) —
    mouseStrength:  0.5,    // fuerza de interacción del cursor
    mouseRadius:    220,    // radio de influencia del cursor (px)

    // — Render de cada punto —
    particleMinSize: 1.0,   // tamaño mín. del núcleo (px)
    particleMaxSize: 2.8,   // tamaño máx. del núcleo (px)
    glow:            0.18,  // opacidad relativa del halo (0 = sin glow; baja para perf)
    glowRadius:      2.4,   // radio del halo respecto al núcleo
    glowMinSize:     1.5,   // sólo las partículas > este tamaño llevan halo (rendimiento)
  };

  /* ---------- helpers ---------- */
  function easeInOutCubic(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function smoothstep(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mixColor(a, b, t) {
    return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
  }
  function softRandom() { return (Math.random() + Math.random() + Math.random()) / 3; } // ~bell, denso al centro
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0; var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---------- ruido (value-noise; hash entero, sin Math.sin) — sólo para densidad ---------- */
  function hash2(x, y) {
    var n = (x | 0) * 374761393 + (y | 0) * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    n = (n ^ (n >> 16)) >>> 0;
    return n / 4294967295;
  }
  function valueNoise2(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var tl = hash2(xi, yi), tr = hash2(xi + 1, yi), bl = hash2(xi, yi + 1), br = hash2(xi + 1, yi + 1);
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(tl, tr, u), lerp(bl, br, u), v);
  }
  /* ---------- paleta (azul claro, azul CareFlow, blanco azulado) ---------- */
  var FLOW_PALETTE = [
    { c: [206, 226, 250], w: 30 },  // blanco azulado
    { c: [150, 196, 250], w: 28 },  // azul muy claro
    { c: [ 37, 153, 254], w: 26 },  // azul CareFlow (#2599FE)
    { c: [ 19, 110, 224], w: 16 },  // azul de marca más profundo
  ];
  var LOGO_CORE = [22, 116, 235];   // azul al que viran las partículas al formar el logo
  var LOGO_EDGE = [12, 92, 224];    // bordes algo más intensos
  var REINF_COLOR = [16, 102, 230]; // refuerzo de bordes
  function pickFlowColor() {
    var total = 0, i;
    for (i = 0; i < FLOW_PALETTE.length; i++) total += FLOW_PALETTE[i].w;
    var r = Math.random() * total;
    for (i = 0; i < FLOW_PALETTE.length; i++) { r -= FLOW_PALETTE[i].w; if (r <= 0) return FLOW_PALETTE[i].c; }
    return FLOW_PALETTE[0].c;
  }

  function makeFlowConfig(canvas) {
    var F = {}; for (var k in FLOW_DEFAULTS) F[k] = FLOW_DEFAULTS[k];
    for (var key in F) {
      var dv = canvas.dataset[key];
      if (dv != null && dv !== '') { var n = parseFloat(dv); if (!isNaN(n)) F[key] = n; }
    }
    return F;
  }

  /* ================================================================
     MODO FLOW (hero): viento en bandas + formación del icono
     ================================================================ */
  function initFlow(canvas) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var densityFactor = parseFloat(canvas.dataset.density || '1');
    var F = makeFlowConfig(canvas);

    var w = 0, h = 0, cx = 0, cy = 0;
    var parts = [], reinf = [], bands = [];
    var raf = null, running = true, lastFrame = perfNow();
    var mouse = { x: null, y: null, active: false, vx: 0, vy: 0, last: 0 };

    // silueta del logo (muestreada una vez de forma asíncrona)
    var targets = [];      // {nx, ny, col, edge} normalizados (centrados en 0)
    var edgeTargets = [];  // subconjunto de bordes (para el refuerzo)

    var phase = 'WIND';    // WIND → FORMING → HOLD → RELEASING → WIND
    var phaseStart = perfNow();
    var morph = 0;         // 0 = viento libre, 1 = logo formado (nivel de estado)
    var reinfAlpha = 0;    // opacidad global del refuerzo (fade-in/out)

    var heroMask = document.querySelector('.cf-hero-mask');
    var MARGIN = 90;

    function perfNow() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }
    function compact() { return Math.min(w, h) < 640 || w < 720; }

    /* ---------- bandas / ribbons ---------- */
    function buildBands() {
      if (!w || !h) return;
      var dir = F.windDirDeg * Math.PI / 180;
      var baseVX = Math.cos(dir) * F.windSpeed;
      var baseVY = Math.sin(dir) * F.windSpeed;
      var refW = clamp(F.ribbonWidth, 120, 280);
      // Bandas (cy en fracción de altura): principal detrás del título,
      // una superior sutil (por debajo del navbar) y una inferior ligera.
      var defs = compact()
        ? [ { cyf: 0.40, wf: 1.00, op: 1.00, share: 0.62 },
            { cyf: 0.72, wf: 0.78, op: 0.72, share: 0.38 } ]
        : [ { cyf: 0.42, wf: 1.00, op: 1.00, share: 0.50 },
            { cyf: 0.20, wf: 0.70, op: 0.72, share: 0.22 },
            { cyf: 0.74, wf: 0.84, op: 0.82, share: 0.28 } ];
      bands = defs.map(function (d, i) {
        return {
          cy: h * d.cyf,
          width: clamp(refW * d.wf, 120, 320),
          amp: h * (0.05 + i * 0.008),
          amp2: h * (0.02 + i * 0.005),
          freq: TWO_PI / (w * (1.25 + i * 0.22)),
          freq2: TWO_PI / (w * (0.55 + i * 0.13)),
          phase: i * 1.7 + Math.random() * 0.6,
          phase2: i * 2.3 + Math.random() * 0.6,
          drift: 0.05 + i * 0.018,
          densSeed: 100 + i * 53.7,
          baseVX: baseVX, baseVY: baseVY,
          opacity: d.op, share: d.share,
        };
      });
    }

    function centerY(band, x, t) {
      return band.cy
        + Math.sin(x * band.freq + band.phase + t * band.drift) * band.amp
        + Math.sin(x * band.freq2 + band.phase2 - t * band.drift * 0.6) * band.amp2;
    }

    function pickBand() {
      var total = 0, i; for (i = 0; i < bands.length; i++) total += bands[i].share;
      var r = Math.random() * total;
      for (i = 0; i < bands.length; i++) { r -= bands[i].share; if (r <= 0) return i; }
      return 0;
    }

    function effectiveCount() {
      var area = w * h, ref = 1500 * 900;
      var c = Math.round(F.particleCount * Math.min(area / ref, 1.15) * densityFactor);
      if (compact()) c = Math.round(c * 0.5);
      return clamp(c, 240, Math.round(F.particleCount * 1.25));
    }

    function spawnWind(bandIdx, seedX) {
      var b = bands[bandIdx] || bands[0];
      var t = perfNow() * 0.001;
      var x = (seedX != null) ? seedX : (Math.random() * (w + 2 * MARGIN) - MARGIN);
      // reparto ~uniforme a lo ancho (el edgeSoft funde los bordes) → nube, no raya
      var off = (Math.random() - 0.5) * b.width * 1.1;
      var y = centerY(b, x, t) + off;
      return {
        role: 'wind', band: bandIdx, x: x, y: y, vx: b.baseVX, vy: b.baseVY,
        seed: Math.random() * 1000, jitterPhase: Math.random() * TWO_PI,
        // meandro propio: fases + frecuencias únicas → cada punto traza su camino
        wpx: Math.random() * TWO_PI, wpy: Math.random() * TWO_PI,
        wfx: 0.16 + Math.random() * 0.34, wfy: 0.13 + Math.random() * 0.30,
        size: lerp(F.particleMinSize, F.particleMaxSize, Math.pow(Math.random(), 1.5)), // sesgo a pequeñas
        col: pickFlowColor(),
        baseAlpha: 0.42 + Math.random() * 0.46,
        tx: 0, ty: 0, hasTarget: false, edgeTarget: false, logoCol: null, logoAlpha: 0,
        delay: 0, releaseDelay: 0,
      };
    }

    function buildFlow() {
      parts = [];
      var n = effectiveCount();
      for (var i = 0; i < n; i++) parts.push(spawnWind(pickBand(), null));
    }

    function respawnEdge(p) { // reabsorber al borde opuesto de su banda
      var b = bands[p.band] || bands[0];
      var t = perfNow() * 0.001;
      p.x = (p.vx >= 0) ? (-MARGIN - Math.random() * 40) : (w + MARGIN + Math.random() * 40);
      var off = (Math.random() - 0.5) * b.width * 1.1;
      p.y = centerY(b, p.x, t) + off;
      p.vx = b.baseVX; p.vy = b.baseVY;
    }

    /* ---------- muestreo del icono desde el SVG (aspect ratio intacto) ---------- */
    function sampleMask(img, iw, ih) {
      var RW = 460, RH = Math.round(RW * ih / iw); // preserva proporción del viewBox
      var oc = document.createElement('canvas'); oc.width = RW; oc.height = RH;
      var octx = oc.getContext('2d');
      octx.drawImage(img, 0, 0, RW, RH);
      var data;
      try { data = octx.getImageData(0, 0, RW, RH).data; } catch (e) { return; }

      var mask = new Uint8Array(RW * RH);
      var minX = RW, minY = RH, maxX = 0, maxY = 0, px, py, k;
      for (py = 0; py < RH; py++) {
        for (px = 0; px < RW; px++) {
          k = (py * RW + px) * 4;
          // "coloreado" = opaco y NO casi-blanco → respeta fondo y espacios negativos
          var colored = data[k + 3] > 60 && (data[k] < 238 || data[k + 1] < 238 || data[k + 2] < 238);
          if (colored) {
            mask[py * RW + px] = 1;
            if (px < minX) minX = px; if (px > maxX) maxX = px;
            if (py < minY) minY = py; if (py > maxY) maxY = py;
          }
        }
      }
      if (minX >= maxX || minY >= maxY) return;

      // erosión 1px: adelgaza trazos y ENSANCHA los espacios negativos →
      // la separación corazón/mano y los huecos internos quedan limpios.
      var em = new Uint8Array(RW * RH);
      for (py = minY; py <= maxY; py++) {
        for (px = minX; px <= maxX; px++) {
          var kk = py * RW + px;
          if (mask[kk] && mask[kk - 1] && mask[kk + 1] && mask[kk - RW] && mask[kk + RW]) em[kk] = 1;
        }
      }

      var midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
      var rmax = Math.max(maxX - minX, maxY - minY); // misma escala en x e y → sin deformar
      var step = 2;
      function has(x, y) { return x >= 0 && x < RW && y >= 0 && y < RH && em[y * RW + x]; }

      // dedupe por celdas para evitar acumulaciones feas
      var sep = 3.2, occ = {};
      var pts = [], edges = [];
      for (py = minY; py <= maxY; py += step) {
        for (px = minX; px <= maxX; px += step) {
          if (!has(px, py)) continue;
          // borde si algún vecino (incl. diagonales) es espacio negativo
          var edge = !has(px - step, py) || !has(px + step, py) || !has(px, py - step) || !has(px, py + step)
            || !has(px - step, py - step) || !has(px + step, py + step) || !has(px - step, py + step) || !has(px + step, py - step);
          var keep = edge ? 0.92 : 0.25; // más densidad en bordes que en relleno
          if (Math.random() > keep) continue;
          var gx = Math.round(px / sep), gy = Math.round(py / sep);
          var key = gx + ',' + gy; if (occ[key]) continue; occ[key] = 1;
          k = (py * RW + px) * 4;
          var pt = {
            nx: (px - midX) / rmax + (Math.random() - 0.5) * 0.0018, // jitter mínimo (no matriz rígida)
            ny: (py - midY) / rmax + (Math.random() - 0.5) * 0.0018,
            col: [data[k], data[k + 1], data[k + 2]],
            edge: edge,
          };
          pts.push(pt);
          if (edge) edges.push(pt);
        }
      }
      targets = pts;
      edgeTargets = edges;
      // si ya tocaba formar y estábamos esperando la máscara, arranca
      var now = perfNow();
      if (phase === 'WIND' && parts.length && now - phaseStart >= F.windIntervalMs) enterForming(now);
    }

    function loadMaskFromUrl(url, onFail) {
      var img = new Image();
      img.onload = function () {
        try { sampleMask(img, img.naturalWidth || 900, img.naturalHeight || 800); }
        catch (e) { if (onFail) onFail(); }
      };
      img.onerror = function () { if (onFail) onFail(); };
      img.src = url;
    }

    function loadLogoMask() {
      // 1) SVG vectorial (bordes nítidos). Se inyecta tamaño explícito conservando
      //    el viewBox (proporción) para rasterizar sin deformar. 2) fallback PNG.
      var pngFallback = function () {
        try { loadMaskFromUrl(new URL('assets/logo_nobg.png', document.baseURI).href, null); } catch (e) {}
      };
      var svgUrl;
      try { svgUrl = new URL('assets/logo_menu.svg', document.baseURI).href; } catch (e) { pngFallback(); return; }
      if (!('fetch' in window)) { pngFallback(); return; }
      fetch(svgUrl).then(function (r) { return r.text(); }).then(function (txt) {
        // fija width/height (= viewBox) sin tocar el viewBox → aspect ratio intacto
        var sized = txt.replace(/<svg([^>]*)>/i, function (m, attrs) {
          attrs = attrs.replace(/\swidth\s*=\s*"[^"]*"/i, '').replace(/\sheight\s*=\s*"[^"]*"/i, '');
          return '<svg' + attrs + ' width="900" height="800">';
        });
        var blob = new Blob([sized], { type: 'image/svg+xml;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var img = new Image();
        img.onload = function () {
          try { sampleMask(img, 900, 800); } catch (e) { pngFallback(); }
          URL.revokeObjectURL(url);
        };
        img.onerror = function () { URL.revokeObjectURL(url); pngFallback(); };
        img.src = url;
      }).catch(pngFallback);
    }

    /* ---------- tamaño del logo (clamps por breakpoint, proporción intacta) ---------- */
    function logoPx() {
      var base = Math.min(w, h) * F.logoScale;
      if (w <= 600) return clamp(base, 220, 320);
      if (w <= 1024) return clamp(base, 320, 460);
      return clamp(base, 420, 620);
    }
    function scaledLogoCount() {
      var c = F.logoParticleCount;
      if (compact()) c = Math.round(c * 0.55);
      return c;
    }
    function scaledReinfCount() {
      var c = F.reinforcementParticleCount;
      if (compact()) c = Math.round(c * 0.55);
      return c;
    }

    /* ---------- iniciar formación ---------- */
    function enterForming(now) {
      if (!targets.length) return;
      var px = logoPx();
      var ox = cx, oy = cy - px * 0.06; // leve elevación: el título cae en el hueco del corazón
      var edgesT = [], fillsT = [], i;
      for (i = 0; i < targets.length; i++) {
        var o = { x: ox + targets[i].nx * px, y: oy + targets[i].ny * px, col: targets[i].col, edge: targets[i].edge };
        if (o.edge) edgesT.push(o); else fillsT.push(o);
      }
      shuffle(edgesT); shuffle(fillsT);
      var lc = Math.min(parts.length, scaledLogoCount(), targets.length);
      var tgt = edgesT.concat(fillsT).slice(0, lc); // bordes primero → contorno sólido, relleno disperso

      var idx = []; for (i = 0; i < parts.length; i++) { parts[i].hasTarget = false; parts[i].role = 'wind'; idx.push(i); }
      shuffle(idx);
      var chosen = []; for (i = 0; i < lc; i++) chosen.push(parts[idx[i]]);

      // emparejar por ángulo alrededor del centro → trayectorias cortas, sin cruces
      var byAngle = function (a, b) { return Math.atan2(a.y - oy, a.x - ox) - Math.atan2(b.y - oy, b.x - ox); };
      chosen.sort(byAngle);
      tgt.sort(function (a, b) { return Math.atan2(a.y - oy, a.x - ox) - Math.atan2(b.y - oy, b.x - ox); });
      for (i = 0; i < lc; i++) {
        var p = chosen[i], tg = tgt[i];
        p.role = 'logo'; p.hasTarget = true;
        p.tx = tg.x; p.ty = tg.y;
        p.edgeTarget = !!tg.edge;
        p.logoCol = tg.edge ? LOGO_EDGE : LOGO_CORE;
        p.logoAlpha = tg.edge ? 0.82 : 0.6;
        p.delay = Math.random() * 0.30;          // llegadas escalonadas
        p.releaseDelay = Math.random() * 0.30;
      }
      buildReinforcement(ox, oy, px);
      phase = 'FORMING'; phaseStart = now;
    }

    // Refuerzo: puntos crujientes sobre los BORDES (contorno del corazón,
    // separación corazón/mano, curva de la mano, barras internas). Fade-in/out.
    function buildReinforcement(ox, oy, px) {
      reinf = [];
      if (!edgeTargets.length) return;
      var pool = edgeTargets.slice();
      shuffle(pool);
      var rc = Math.min(scaledReinfCount(), pool.length);
      for (var i = 0; i < rc; i++) {
        var e = pool[i];
        reinf.push({
          x: ox + e.nx * px + (Math.random() - 0.5) * 1.4,
          y: oy + e.ny * px + (Math.random() - 0.5) * 1.4,
          size: 0.7 + Math.random() * 0.7,
          seed: Math.random() * TWO_PI,
          a: 0.55 + Math.random() * 0.35,
          col: REINF_COLOR,
        });
      }
    }

    function endRelease(now) {
      phase = 'WIND'; phaseStart = now; morph = 0; reinfAlpha = 0; reinf = [];
      var t = now * 0.001;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.hasTarget = false; p.role = 'wind'; p.logoCol = null;
        // reasignar a la banda más cercana para reintegrarse a la corriente
        var best = 0, bd = 1e9;
        for (var b = 0; b < bands.length; b++) {
          var dd = Math.abs(p.y - centerY(bands[b], p.x, t));
          if (dd < bd) { bd = dd; best = b; }
        }
        p.band = best;
      }
    }

    function particleMorph(p, phaseProgress) {
      if (!p.hasTarget) return 0;
      if (phase === 'FORMING') return easeInOutCubic(clamp01((phaseProgress - p.delay) / Math.max(0.01, 1 - p.delay)));
      if (phase === 'HOLD') return 1;
      if (phase === 'RELEASING') return 1 - easeInOutCubic(clamp01((phaseProgress - p.releaseDelay) / Math.max(0.01, 1 - p.releaseDelay)));
      return 0;
    }

    /* ---------- loop ---------- */
    function stepFlow() {
      var now = perfNow();
      var realDt = now - lastFrame; lastFrame = now;
      var dtScale = clamp(realDt / 16.67, 0.4, 2.5);
      var t = now * 0.001;
      var el = now - phaseStart;
      var phaseProgress = 0, formProg = 0, relProg = 0;

      if (phase === 'WIND') {
        morph = 0;
        if (targets.length && el >= F.windIntervalMs) enterForming(now);
      } else if (phase === 'FORMING') {
        formProg = clamp01(el / F.formationDuration); phaseProgress = formProg; morph = smoothstep(formProg);
        reinfAlpha = smoothstep(formProg);
        if (el >= F.formationDuration) { phase = 'HOLD'; phaseStart = now; morph = 1; }
      } else if (phase === 'HOLD') {
        morph = 1; phaseProgress = 1; reinfAlpha = 1;
        if (el >= F.holdDuration) { phase = 'RELEASING'; phaseStart = now; }
      } else if (phase === 'RELEASING') {
        relProg = clamp01(el / F.releaseDuration); phaseProgress = relProg; morph = 1 - smoothstep(relProg);
        reinfAlpha = 1 - smoothstep(relProg);
        if (el >= F.releaseDuration) { endRelease(now); }
      }

      // atenúa la máscara blanca del hero para realzar el logo (sin perder legibilidad)
      if (heroMask) heroMask.style.opacity = String(1 - F.maskFade * morph);

      ctx.clearRect(0, 0, w, h); // sin acumulación → sin estelas/humo
      mouse.vx *= 0.9; mouse.vy *= 0.9;

      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var b = bands[p.band] || bands[0];
        var lp = particleMorph(p, phaseProgress);

        // 1) Corriente: TODAS van en la misma dirección (base + vaivén compartido), pero
        //    cada partícula teje su PROPIO camino (meandro por seed) → nunca forman "fila".
        //    No hay campo dependiente de la posición ⇒ sin streamlines ni acumulación en líneas.
        var yc = centerY(b, p.x, t);
        var dyc = p.y - yc, halfW = b.width * 0.55, contain = 0;
        if (dyc > halfW) contain = halfW - dyc; else if (dyc < -halfW) contain = -halfW - dyc;
        var sway = Math.sin(t * F.swaySpeed + b.phase) * F.swayAmp; // vaivén compartido (coordinación de grupo)
        var ind = 1 - lp;                                           // el meandro se desvanece al formar el logo
        var wvx = (Math.sin(t * p.wfx + p.wpx) + 0.5 * Math.sin(t * p.wfx * 2.3 + p.wpy)) * F.wanderAmp;
        var wvy = (Math.cos(t * p.wfy + p.wpy) + 0.5 * Math.sin(t * p.wfy * 1.9 + p.wpx)) * F.wanderAmp;
        var tvx = b.baseVX + wvx * ind;
        var tvy = b.baseVY + sway + wvy * ind + contain * F.bandStiffness * (1 - lp);
        p.vx += (tvx - p.vx) * F.windEase;
        p.vy += (tvy - p.vy) * F.windEase;

        // 2) cursor: mueve el aire de forma tangencial (sutil), no repele
        if (F.mouseStrength > 0 && mouse.active && mouse.x != null && lp < 0.5) {
          var mx = p.x - mouse.x, my = p.y - mouse.y, md = Math.hypot(mx, my);
          if (md < F.mouseRadius && md > 0.1) {
            var wk = smoothstep(1 - md / F.mouseRadius) * F.mouseStrength * (1 - morph * 0.7);
            var ml = Math.hypot(mouse.vx, mouse.vy);
            var dx = ml > 0.05 ? mouse.vx / ml : 0, dy = ml > 0.05 ? mouse.vy / ml : 0;
            p.vx += (dx * 0.5 + (-my / md) * 0.4) * wk;
            p.vy += (dy * 0.5 + (mx / md) * 0.4) * wk;
          }
        }

        // 3) atracción al logo (steering: seek + swirl + flujo residual + asentamiento)
        if (p.hasTarget && lp > 0.001) {
          var bxj = Math.cos(t * 0.6 + p.seed) * F.holdJitter;
          var byj = Math.sin(t * 0.7 + p.seed) * F.holdJitter;
          var toX = p.tx + bxj - p.x, toY = p.ty + byj - p.y;
          var d = Math.hypot(toX, toY) || 1;
          var seek = Math.min(d * F.seekStrength, F.maxSeek);
          p.vx += (toX / d) * seek * lp;
          p.vy += (toY / d) * seek * lp;
          var sw = Math.sin(t * 0.8 + p.seed) * F.swirlStrength * (1 - lp);
          p.vx += (-toY / d) * sw;
          p.vy += (toX / d) * sw;
          p.vx *= 1 - F.damping * lp;
          p.vy *= 1 - F.damping * lp;
        }

        // límite de velocidad
        var sp = Math.hypot(p.vx, p.vy), maxSp = F.maxSpeed * (1 + lp * 1.4);
        if (sp > maxSp) { p.vx = p.vx / sp * maxSp; p.vy = p.vy / sp * maxSp; }
        p.x += p.vx * dtScale; p.y += p.vy * dtScale;

        // reciclado sólo cuando es viento (nunca rompe el logo)
        if (lp < 0.06) {
          if (p.x > w + MARGIN || p.x < -MARGIN || p.y < -MARGIN || p.y > h + MARGIN) { respawnEdge(p); }
        }

        // ---- alpha + dibujo (punto limpio, glow pequeño y opcional) ----
        var ycNow = centerY(b, p.x, t);
        var edgeSoft = smoothstep(1 - Math.abs(p.y - ycNow) / (b.width * 0.95)); // bordes suaves de la banda
        var dens = smoothstep((valueNoise2(p.x * F.densScale + b.densSeed, b.densSeed * 0.3) - 0.30) / 0.5); // zonas vacías
        var flick = 0.84 + Math.sin(t * 1.3 + p.jitterPhase) * 0.16;
        var ambient = (0.6 + 0.4 * edgeSoft) * (0.2 + 0.8 * dens); // banda tipo losa (no cordón central)
        var vis = p.hasTarget ? lerp(ambient, 1, lp) : ambient;
        var alpha = p.baseAlpha * vis * flick * F.windOpacity * b.opacity;
        if (p.hasTarget) alpha = lerp(alpha, p.logoAlpha * F.logoOpacity, lp);
        else alpha *= (1 - 0.5 * morph); // atenúa el ambiente mientras vive el logo
        if (alpha < 0.012) continue;
        if (alpha > 0.9) alpha = 0.9;

        var col = p.logoCol ? mixColor(p.col, p.logoCol, lp) : p.col;
        var size = p.size * (1 + lp * 0.28);

        if (F.glow > 0 && lp < 0.25 && size > F.glowMinSize) { // sin glow al formar → logo crujiente
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * F.glowRadius, 0, TWO_PI);
          ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (alpha * F.glow) + ')';
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, TWO_PI);
        ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + alpha + ')';
        ctx.fill();
      }

      // ---- refuerzo de bordes (sin glow: mantiene crujiente la separación) ----
      if (reinfAlpha > 0.01 && reinf.length) {
        for (var r = 0; r < reinf.length; r++) {
          var rp = reinf[r];
          var br = 1 + Math.sin(t * 0.9 + rp.seed) * 0.16;
          var a = reinfAlpha * rp.a * F.logoOpacity;
          if (a < 0.02) continue;
          if (a > 0.9) a = 0.9;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, rp.size * br, 0, TWO_PI);
          ctx.fillStyle = 'rgba(' + rp.col[0] + ',' + rp.col[1] + ',' + rp.col[2] + ',' + a + ')';
          ctx.fill();
        }
      }

      if (running) raf = requestAnimationFrame(stepFlow);
    }

    function drawStatic() { // prefers-reduced-motion: un solo frame, sin animación ni logo
      ctx.clearRect(0, 0, w, h);
      var t = 0;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i], b = bands[p.band] || bands[0];
        var ycNow = centerY(b, p.x, t);
        var edgeSoft = smoothstep(1 - Math.abs(p.y - ycNow) / (b.width * 0.95));
        var dens = smoothstep((valueNoise2(p.x * F.densScale + b.densSeed, b.densSeed * 0.3) - 0.30) / 0.5);
        var ambient = (0.6 + 0.4 * edgeSoft) * (0.2 + 0.8 * dens);
        var alpha = clamp(p.baseAlpha * ambient * F.windOpacity * b.opacity, 0, 0.8);
        if (alpha < 0.02) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TWO_PI);
        ctx.fillStyle = 'rgba(' + p.col[0] + ',' + p.col[1] + ',' + p.col[2] + ',' + alpha + ')';
        ctx.fill();
      }
    }

    /* ---------- scaffold ---------- */
    function resize() {
      var rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height; cx = w / 2; cy = h / 2;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildBands();
      buildFlow();
      if (reduced) drawStatic();
    }

    function onMove(e) {
      var rect = canvas.getBoundingClientRect();
      var px = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      var py = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      var now = perfNow();
      if (px >= 0 && px <= w && py >= 0 && py <= h) {
        if (mouse.x != null && mouse.last) {
          var dt = Math.max(now - mouse.last, 16);
          var scale = Math.min(1.6, 16.67 / dt);
          mouse.vx += ((px - mouse.x) * scale - mouse.vx) * 0.18;
          mouse.vy += ((py - mouse.y) * scale - mouse.vy) * 0.18;
        }
        mouse.x = px; mouse.y = py; mouse.last = now; mouse.active = true;
      } else mouse.active = false;
    }
    function onOut() { mouse.active = false; }
    function onVisibility() {
      if (document.hidden) { running = false; if (raf) cancelAnimationFrame(raf); }
      else if (!running && !reduced) { running = true; lastFrame = perfNow(); raf = requestAnimationFrame(stepFlow); }
    }
    function teardown() {
      running = false; if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseout', onOut);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', teardown);
    }

    resize();
    if (reduced) { drawStatic(); return; } // estático: sin listeners de movimiento ni rAF
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('mouseout', onOut, { passive: true });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', teardown);
    loadLogoMask();
    raf = requestAnimationFrame(stepFlow);
  }

  /* ================================================================
     MODO NETWORK (login, panel azul) — SIN CAMBIOS funcionales
     ================================================================ */
  function initNetwork(canvas) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var densityFactor = parseFloat(canvas.dataset.density || '1');
    var w = 0, h = 0, parts = [], raf = null, running = true;
    var mouse = { x: null, y: null, active: false };
    var LINK = 132, MR = 165;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      build();
      if (reduced) step();
    }
    function build() {
      var target = Math.round((w * h) / 12500 * densityFactor);
      var count = Math.max(20, Math.min(target, 95));
      parts = [];
      for (var i = 0; i < count; i++) {
        parts.push({ x: Math.random() * w, y: Math.random() * h,
                     vx: (Math.random() - 0.5) * 0.32, vy: (Math.random() - 0.5) * 0.32,
                     r: Math.random() * 1.6 + 1.0 });
      }
    }
    function step() {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        if (mouse.active && mouse.x != null) {
          var dx = mouse.x - p.x, dy = mouse.y - p.y, dist = Math.hypot(dx, dy);
          if (dist < MR && dist > 0.1) { var f = (1 - dist / MR) * 0.5; p.x += (dx / dist) * f; p.y += (dy / dist) * f; }
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(196, 222, 255, 0.72)';
        ctx.fill();
      }
      for (var a = 0; a < parts.length; a++) {
        for (var bb = a + 1; bb < parts.length; bb++) {
          var pa = parts[a], pb = parts[bb], ddx = pa.x - pb.x, ddy = pa.y - pb.y, dd = Math.hypot(ddx, ddy);
          if (dd < LINK) {
            var op = (1 - dd / LINK) * 0.4;
            ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
            ctx.strokeStyle = 'rgba(150, 194, 255, ' + op + ')'; ctx.lineWidth = 1; ctx.stroke();
          }
        }
      }
      if (mouse.active && mouse.x != null) {
        for (var m = 0; m < parts.length; m++) {
          var pm = parts[m], mdx = pm.x - mouse.x, mdy = pm.y - mouse.y, mdist = Math.hypot(mdx, mdy);
          if (mdist < MR) {
            var mop = (1 - mdist / MR) * 0.55;
            ctx.beginPath(); ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(pm.x, pm.y);
            ctx.strokeStyle = 'rgba(180, 212, 255, ' + mop + ')'; ctx.lineWidth = 1; ctx.stroke();
          }
        }
      }
      if (running && !reduced) raf = requestAnimationFrame(step);
    }
    function onMove(e) {
      var rect = canvas.getBoundingClientRect();
      var px = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      var py = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      if (px >= 0 && px <= w && py >= 0 && py <= h) { mouse.x = px; mouse.y = py; mouse.active = true; }
      else mouse.active = false;
    }

    resize();
    if (reduced) { step(); return; }
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('mouseout', function () { mouse.active = false; }, { passive: true });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { running = false; if (raf) cancelAnimationFrame(raf); }
      else if (!running) { running = true; raf = requestAnimationFrame(step); }
    });
    raf = requestAnimationFrame(step);
  }

  function initCanvas(canvas) {
    var mode = canvas.dataset.mode || 'flow';
    if (mode === 'network') return initNetwork(canvas);
    return initFlow(canvas);
  }

  function boot() {
    var canvases = document.querySelectorAll('canvas.cf-particles');
    if (!canvases.length) return;
    canvases.forEach(initCanvas);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
