/* ================================================================
   CareFlow — Partículas en canvas (dos modos)

   - data-mode="flow" (por defecto, hero de la landing):
       Sistema de PUNTOS atmosféricos. Mantiene el fondo flotante de
       particles.js sin dirección global dominante, con vida/fade propio y
       distribución equilibrada. El LOGO usa la lógica limpia de
       particles_good_logo.js: icono muestreado desde assets/logo_menu.svg,
       sin sus 3 líneas internas, con formación breve y suave (~0.5s). La frase
       del hero se escribe dentro del logo y éste se desarma lentamente (5s) de
       forma que TERMINA justo cuando aparecen los demás elementos; luego las
       partículas flotan en el ambiente y el logo no vuelve a formarse. Sin
       líneas, trails, blur ni paths visibles.

   - data-mode="network" (panel azul del login):
       Red de nodos interconectados con líneas. SIN CAMBIOS.

   Ambos respetan prefers-reduced-motion (render estático mínimo).
   Uso: <canvas class="cf-particles" data-density="1.3" data-mode="flow">
   ================================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TWO_PI = Math.PI * 2;
  // Duración total de la aparición de los elementos del hero tras el typewriter
  // (último elemento .cf-hero-actions: delay .5s + transición 2.6s). MANTENER EN
  // SYNC con careflow.css: el desarmado del logo termina en este mismo instante.
  var REVEAL_MS = 3100;

  /* ================================================================
     PARÁMETROS DEL MODO FLOW — fáciles de ajustar.
     Todos se pueden sobreescribir por canvas con data-* (camelCase →
     kebab-case): p. ej. data-wind-speed="0.4", data-logo-scale="0.7".
     ================================================================ */
  var FLOW_DEFAULTS = {
    // — Ambiente (cantidades; se escalan por viewport y DPR) —
    particleCount:              2200,   // total de partículas de fondo (objetivo desktop)
    logoParticleCount:          1380,   // más cuerpo para el logo sin saturarlo
    reinforcementParticleCount: 460,    // borde nuevamente más marcado, como en la versión anterior
    fillReinforcementParticleCount: 260, // refuerzo interno sutil para dar cuerpo al relleno

    // — Fondo flotante / atmosférico —
    windOpacity:         1.0,   // multiplicador global de opacidad del ambiente
    floatMinSpeed:       0.20,  // deriva mín. (px/frame)
    floatMaxSpeed:       0.60,  // deriva máx. → las partículas recorren el hero y salen por los bordes
    floatEase:           0.035,
    floatDrift:          0.5,   // ondulación del rumbo (menor = trayectorias más rectas → más cruce)
    floatNoise:          0.2,
    floatSpeedJitter:    0.05,
    edgeFadeDist:        120,   // px: atenúa las partículas cerca de los bordes (desvanecimiento gradual)
    releaseDisperse:     0.5,   // al desarmar, se abren radialmente y se reparten por todo el hero
    ambientCellSize:     125,
    compactCellSize:     95,
    minSeparation:       26,
    separationStrength:  0.026,

    // — Muestreo del logo —
    logoEdgeKeep:   0.64,
    logoFillKeep:   0.78,
    logoEdgeQuota:  0.38,
    logoFillQuota:  0.70,

    // — Logo (INTRO única: materialización breve al abrir; desarmado sincronizado con el typewriter) —
    formationDuration: 550,   // ms de la materialización breve del logo al cargar
    holdDuration:      9000,  // ms máx. de espera (fallback) por si el typewriter nunca termina
    releaseDuration:   5000,  // ms de dispersión del logo → viento (lento y sutil; se conserva)
    logoScale:         0.94,  // LOGO de particles_good_logo.js: fracción del hueco del hero que llena el logo
    logoOpacity:       1.0,   // LOGO de particles_good_logo.js: multiplicador de opacidad del logo + refuerzo
    maskFade:          0.42,  // LOGO de particles_good_logo.js: cuánto se atenúa la máscara blanca del hero al formar el logo

    // — Transición (steering) —
    seekStrength:   0.022,  // atracción hacia el punto-objetivo del logo
    maxSeek:        1.4,    // tope de la fuerza de atracción (evita tirones bruscos)
    swirlStrength:  0.16,   // giro lateral suave mientras se acomoda (no fila recta)
    damping:        0.14,   // asentamiento al llegar (el logo "respira" sin deformarse)
    holdJitter:     0.6,    // micro-respiración del logo en hold (px)
    maxSpeed:       0.95,   // velocidad máx del fondo (sube durante la formación)

    // — Cursor (muy sutil: mueve el aire, no repele) —
    mouseStrength:  0.5,    // fuerza de interacción del cursor
    mouseRadius:    220,    // radio de influencia del cursor (px)

    // — Render de cada punto —
    particleMinSize: 0.8,   // tamaño mín. del núcleo (px)
    particleMaxSize: 2.2,   // tamaño habitual máx. del núcleo (px)
    accentMaxSize:   3.05,  // acentos raros y controlados
    glow:            0.12,  // opacidad relativa del halo (0 = sin glow; baja para perf)
    glowRadius:      2.0,   // radio del halo respecto al núcleo
    glowMinSize:     1.55,  // sólo las partículas > este tamaño llevan halo (rendimiento)
  };

  /* ---------- helpers ---------- */
  function easeInOutCubic(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function smoothstep(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function angleDelta(from, to) { return Math.atan2(Math.sin(to - from), Math.cos(to - from)); }
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
    var spatial = { cell: 120, cols: 1, rows: 1, buckets: [], counts: [], avg: 1 };
    var raf = null, running = true, lastFrame = perfNow();
    var mouse = { x: null, y: null, active: false, vx: 0, vy: 0, last: 0 };

    // silueta del logo (muestreada una vez de forma asíncrona)
    var targets = [];      // {nx, ny, col, edge} normalizados (centrados en 0)
    var edgeTargets = [];  // subconjunto de bordes (para el refuerzo)
    var fillTargets = [];  // subconjunto de relleno (para dar más cuerpo sin endurecer el borde)
    var logoHalf = { nx: 0.5, ny: 0.44 }; // semiextensión normalizada real del icono (para ajustarlo al hero)

    var phase = 'WIND';    // WIND → FORMING → HOLD → RELEASING → WIND (el logo es una INTRO única)
    var phaseStart = perfNow();
    var morph = 0;         // 0 = viento libre, 1 = logo formado (nivel de estado)
    var reinfAlpha = 0;    // opacidad global del refuerzo (fade-in/out)

    var heroMask = document.querySelector('.cf-hero-mask');
    var heroEl = document.querySelector('.cf-hero');
    var introPending = true; // el logo se forma UNA sola vez, al cargar la página
    var introDone = false;   // tras desarmarse, ya no vuelve a formarse nunca
    var bootAt = perfNow();  // referencia de arranque (fade-in inicial y fallback de máscara)
    var MARGIN = 90;

    // El typewriter marca `.cf-hero.is-typed` al terminar de escribir la frase:
    // ese es el momento de desarmar el logo y dar paso al resto del hero.
    function heroTyped() { return !!(heroEl && heroEl.classList.contains('is-typed')); }

    function perfNow() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }
    function compact() { return Math.min(w, h) < 640 || w < 720; }

    /* ---------- fondo atmosférico + grid espacial ---------- */
    function buildBands() {
      if (!w || !h) return;
      bands = [{ opacity: 1, share: 1 }];
      configureSpatialGrid();
    }

    function configureSpatialGrid() {
      var cell = compact() ? F.compactCellSize : F.ambientCellSize;
      spatial.cell = clamp(cell, 72, 150);
      spatial.cols = Math.max(1, Math.ceil(w / spatial.cell));
      spatial.rows = Math.max(1, Math.ceil(h / spatial.cell));
      var total = spatial.cols * spatial.rows;
      spatial.buckets = new Array(total);
      spatial.counts = new Array(total);
      for (var i = 0; i < total; i++) { spatial.buckets[i] = []; spatial.counts[i] = 0; }
      spatial.avg = 1;
    }

    function cellIndexAt(x, y) {
      if (!spatial.cols || !spatial.rows) return -1;
      var c = Math.floor(clamp(x, 0, Math.max(0, w - 1)) / spatial.cell);
      var r = Math.floor(clamp(y, 0, Math.max(0, h - 1)) / spatial.cell);
      return r * spatial.cols + c;
    }

    function effectiveCount() {
      var area = w * h, ref = 1500 * 900;
      var c = Math.round(F.particleCount * Math.min(area / ref, 1.15) * densityFactor);
      if (compact()) c = Math.round(c * 0.65);
      return clamp(c, 240, Math.round(F.particleCount * 1.25));
    }

    function resetLife(p, newborn) {
      p.life = 40000 + Math.random() * 40000; // vida larga → salen por bordes antes de morir por edad
      p.fadeIn = 1500 + Math.random() * 1500;
      p.fadeOut = 2500 + Math.random() * 2000;
      p.age = newborn ? 0 : Math.random() * p.life * 0.72;
    }

    function setFloatMotion(p, keepVelocity) {
      p.floatDir = Math.random() * TWO_PI;
      p.floatBaseDir = p.floatDir;
      p.floatSpeed = lerp(F.floatMinSpeed, F.floatMaxSpeed, Math.pow(Math.random(), 1.7));
      p.floatPhase = Math.random() * TWO_PI;
      p.floatRate = 0.08 + Math.random() * 0.13;
      p.speedPhase = Math.random() * TWO_PI;
      p.speedRate = 0.10 + Math.random() * 0.16;
      if (!keepVelocity) {
        p.vx = Math.cos(p.floatDir) * p.floatSpeed;
        p.vy = Math.sin(p.floatDir) * p.floatSpeed;
      }
    }

    function pickParticleSize() {
      if (Math.random() > 0.975) return lerp(F.particleMaxSize, F.accentMaxSize, Math.random());
      return lerp(F.particleMinSize, F.particleMaxSize, Math.pow(Math.random(), 1.55));
    }

    function spawnWind(x, y, newborn) {
      return {
        role: 'wind', band: 0, x: x, y: y, vx: 0, vy: 0,
        seed: Math.random() * 1000, jitterPhase: Math.random() * TWO_PI,
        size: pickParticleSize(),
        col: pickFlowColor(),
        baseAlpha: 0.24 + Math.random() * 0.34,
        tx: 0, ty: 0, hasTarget: false, edgeTarget: false, logoCol: null, logoAlpha: 0,
        delay: 0, releaseDelay: 0, age: 0, life: 1, fadeIn: 1, fadeOut: 1,
        floatDir: 0, floatBaseDir: 0, floatSpeed: 0, floatPhase: 0, floatRate: 0, speedPhase: 0, speedRate: 0,
        gridIndex: -1,
      };
    }

    function buildFlow() {
      parts = [];
      var n = effectiveCount();
      configureSpatialGrid();
      var cols = Math.max(1, Math.ceil(Math.sqrt(n * Math.max(w, 1) / Math.max(h, 1))));
      var rows = Math.max(1, Math.ceil(n / cols));
      var cellW = (w + 2 * MARGIN) / cols;
      var cellH = (h + 2 * MARGIN) / rows;
      for (var i = 0; i < n; i++) {
        var gx = i % cols, gy = Math.floor(i / cols);
        var x = -MARGIN + (gx + Math.random()) * cellW;
        var y = -MARGIN + (gy + Math.random()) * cellH;
        var p = spawnWind(x, y, false);
        setFloatMotion(p, false);
        resetLife(p, false);
        parts.push(p);
      }
    }

    function lifecycleAlpha(p) {
      var born = smoothstep(p.age / Math.max(1, p.fadeIn));
      var dying = smoothstep((p.life - p.age) / Math.max(1, p.fadeOut));
      return clamp01(Math.min(born, dying));
    }

    // Reaparición ENTRANDO por un borde: la partícula surge justo fuera de la vista
    // y flota hacia adentro con variación → flujo natural de entrada/salida por bordes.
    function respawnAtEdge(p) {
      var m = MARGIN * 0.6, side = (Math.random() * 4) | 0, inward;
      if (side === 0)      { p.x = Math.random() * w;        p.y = -m;             inward = TWO_PI * 0.25; } // arriba → baja
      else if (side === 1) { p.x = w + m;                    p.y = Math.random() * h; inward = TWO_PI * 0.50; } // derecha → izquierda
      else if (side === 2) { p.x = Math.random() * w;        p.y = h + m;          inward = TWO_PI * 0.75; } // abajo → sube
      else                 { p.x = -m;                       p.y = Math.random() * h; inward = 0; }            // izquierda → derecha
      p.floatDir = inward + (Math.random() - 0.5) * TWO_PI * 0.34; // hacia adentro ±61°
      p.floatBaseDir = p.floatDir;
      p.floatSpeed = lerp(F.floatMinSpeed, F.floatMaxSpeed, Math.pow(Math.random(), 1.5));
      p.floatPhase = Math.random() * TWO_PI;
      p.floatRate = 0.08 + Math.random() * 0.13;
      p.speedPhase = Math.random() * TWO_PI;
      p.speedRate = 0.10 + Math.random() * 0.16;
      p.vx = Math.cos(p.floatDir) * p.floatSpeed;
      p.vy = Math.sin(p.floatDir) * p.floatSpeed;
      p.hasTarget = false; p.role = 'wind'; p.logoCol = null; p.edgeTarget = false;
      p.size = pickParticleSize();
      p.baseAlpha = 0.24 + Math.random() * 0.34;
      resetLife(p, true); // nace nuevo (fade-in suave al entrar)
    }

    function rebuildSpatialGrid(phaseProgress) {
      configureSpatialGrid();
      var active = 0;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.gridIndex = -1;
        if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue;
        if (particleMorph(p, phaseProgress) > 0.45) continue;
        var idx = cellIndexAt(p.x, p.y);
        if (idx < 0) continue;
        spatial.buckets[idx].push(p);
        spatial.counts[idx]++;
        p.gridIndex = idx;
        active++;
      }
      spatial.avg = active / Math.max(1, spatial.counts.length);
    }

    function applyDistributionForces(p, lp) {
      if (lp > 0.45 || p.gridIndex < 0 || !spatial.buckets.length) return;
      var idx = p.gridIndex;
      // Sólo separación PAR-A-PAR (isótropa) → distribución pareja sin imprimir el grid.
      // (Se eliminó la fuerza "crowd" radial-desde-el-centro-de-celda: alineaba las
      //  partículas con la rejilla y dejaba una leve "grilla de cuadros", sobre todo
      //  tras el desarme, cuando el centro queda muy denso.)
      var c0 = idx % spatial.cols, r0 = (idx / spatial.cols) | 0;
      for (var rr = Math.max(0, r0 - 1); rr <= Math.min(spatial.rows - 1, r0 + 1); rr++) {
        for (var cc = Math.max(0, c0 - 1); cc <= Math.min(spatial.cols - 1, c0 + 1); cc++) {
          var bucket = spatial.buckets[rr * spatial.cols + cc];
          for (var j = 0; j < bucket.length; j++) {
            var q = bucket[j];
            if (q === p) continue;
            var dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
            if (d > 0.1 && d < F.minSeparation) {
              var f = (1 - d / F.minSeparation) * F.separationStrength;
              p.vx += (dx / d) * f;
              p.vy += (dy / d) * f;
            }
          }
        }
      }
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

      // Componentes conexas (4-vecinos): las 3 líneas internas del icono flotan
      // aisladas en el hueco del corazón → son componentes PEQUEÑAS y separadas.
      // Se eliminan (el usuario no las quiere), conservando corazón + mano.
      var labels = new Int32Array(RW * RH); // 0 = sin etiqueta
      var sizes = [0], stack = [], lbl = 0, ci;
      for (py = minY; py <= maxY; py++) {
        for (px = minX; px <= maxX; px++) {
          var seed0 = py * RW + px;
          if (!em[seed0] || labels[seed0]) continue;
          lbl++; sizes[lbl] = 0; stack.push(seed0); labels[seed0] = lbl;
          while (stack.length) {
            var cur = stack.pop(); sizes[lbl]++;
            var cyy = (cur / RW) | 0, cxx = cur - cyy * RW;
            if (cxx > 0 && em[cur - 1] && !labels[cur - 1]) { labels[cur - 1] = lbl; stack.push(cur - 1); }
            if (cxx < RW - 1 && em[cur + 1] && !labels[cur + 1]) { labels[cur + 1] = lbl; stack.push(cur + 1); }
            if (cyy > 0 && em[cur - RW] && !labels[cur - RW]) { labels[cur - RW] = lbl; stack.push(cur - RW); }
            if (cyy < RH - 1 && em[cur + RW] && !labels[cur + RW]) { labels[cur + RW] = lbl; stack.push(cur + RW); }
          }
        }
      }
      var maxSize = 0;
      for (ci = 1; ci <= lbl; ci++) if (sizes[ci] > maxSize) maxSize = sizes[ci];
      // corazón y mano son ~100% y ~72% del mayor; las 3 barras ~5–6.5% → umbral 15%
      var minKeep = maxSize * 0.15;
      for (py = minY; py <= maxY; py++) {
        for (px = minX; px <= maxX; px++) {
          var id2 = py * RW + px;
          if (em[id2] && sizes[labels[id2]] < minKeep) em[id2] = 0;
        }
      }

      // Recuperar grosor del SVG sin perder las separaciones internas abiertas
      // (sobre todo el hueco entre la mano/brazo y la parte superior del corazón).
      // Partimos del núcleo erosionado y lo expandimos sólo dentro de la máscara real.
      var solid = new Uint8Array(em);
      for (var pass = 0; pass < 2; pass++) {
        var next = new Uint8Array(solid);
        for (py = minY; py <= maxY; py++) {
          for (px = minX; px <= maxX; px++) {
            var sid = py * RW + px;
            if (!mask[sid] || solid[sid]) continue;
            var near = solid[sid - 1] || solid[sid + 1] || solid[sid - RW] || solid[sid + RW]
              || solid[sid - RW - 1] || solid[sid - RW + 1] || solid[sid + RW - 1] || solid[sid + RW + 1];
            if (near) next[sid] = 1;
          }
        }
        solid = next;
      }

      var midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
      var rmax = Math.max(maxX - minX, maxY - minY); // misma escala en x e y → sin deformar
      function hasEdge(x, y) { return x >= 0 && x < RW && y >= 0 && y < RH && em[y * RW + x]; }
      function hasFill(x, y) { return x >= 0 && x < RW && y >= 0 && y < RH && solid[y * RW + x]; }

      // Muestreamos el BORDE y el RELLENO por separado.
      // - El borde sale del núcleo erosionado (em): más detalle, mejor lectura de curvas y huecos internos.
      // - El relleno sale del cuerpo restaurado (solid): da masa sin cerrar huecos importantes.
      var pts = [], edges = [], fills = [];
      var occEdge = {}, occFill = {};
      var edgeStep = 1, fillStep = 2;
      var edgeSep = 2.45, fillSep = 3.25;

      for (py = minY; py <= maxY; py += edgeStep) {
        for (px = minX; px <= maxX; px += edgeStep) {
          if (!hasEdge(px, py)) continue;
          var edge = !hasEdge(px - 1, py) || !hasEdge(px + 1, py) || !hasEdge(px, py - 1) || !hasEdge(px, py + 1)
            || !hasEdge(px - 1, py - 1) || !hasEdge(px + 1, py + 1) || !hasEdge(px - 1, py + 1) || !hasEdge(px + 1, py - 1);
          if (!edge) continue;
          if (Math.random() > F.logoEdgeKeep) continue;
          var egx = Math.round(px / edgeSep), egy = Math.round(py / edgeSep);
          var ekey = egx + ',' + egy; if (occEdge[ekey]) continue; occEdge[ekey] = 1;
          k = (py * RW + px) * 4;
          var ept = {
            nx: (px - midX) / rmax + (Math.random() - 0.5) * 0.0015, // borde más preciso
            ny: (py - midY) / rmax + (Math.random() - 0.5) * 0.0015,
            col: [data[k], data[k + 1], data[k + 2]],
            edge: true,
          };
          pts.push(ept);
          edges.push(ept);
        }
      }

      for (py = minY; py <= maxY; py += fillStep) {
        for (px = minX; px <= maxX; px += fillStep) {
          if (!hasFill(px, py) || hasEdge(px, py)) continue;
          if (Math.random() > F.logoFillKeep) continue;
          var fgx = Math.round(px / fillSep), fgy = Math.round(py / fillSep);
          var fkey = fgx + ',' + fgy; if (occFill[fkey]) continue; occFill[fkey] = 1;
          k = (py * RW + px) * 4;
          var sourcePixel = em[py * RW + px];
          var fpt = {
            nx: (px - midX) / rmax + (Math.random() - 0.5) * 0.0027,
            ny: (py - midY) / rmax + (Math.random() - 0.5) * 0.0027,
            col: sourcePixel ? [data[k], data[k + 1], data[k + 2]] : LOGO_CORE,
            edge: false,
          };
          pts.push(fpt);
          fills.push(fpt);
        }
      }

      targets = pts;
      edgeTargets = edges;
      fillTargets = fills;
      logoHalf = { nx: (maxX - minX) / (2 * rmax), ny: (maxY - minY) / (2 * rmax) };
      updateLogoCssVars(); // logoHalf afinado → recomputa el tamaño para el título
      // La intro (única) la dispara el loop en cuanto targets está listo (ver stepFlow).
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

    /* ---------- tamaño del logo: lo más grande que cabe centrado en el hero ---------- */
    function logoPx() {
      // px = lado mayor del icono. Se toma el máximo que cabe CENTRADO en el hero,
      // limitado por el alto o el ancho disponibles según la proporción REAL del icono.
      // logoScale (0..1) deja un pequeño margen para que no toque los bordes.
      var maxByH = (h * 0.5) / logoHalf.ny;
      var maxByW = (w * 0.5) / logoHalf.nx;
      return Math.min(maxByH, maxByW) * F.logoScale;
    }
    // Expone el tamaño real del logo a CSS → el título (h1) se dimensiona con la MISMA
    // métrica responsiva que el logo, para caber siempre dentro del hueco del corazón.
    function updateLogoCssVars() {
      if (heroEl && w && h) heroEl.style.setProperty('--cf-logo-px', Math.round(logoPx()) + 'px');
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
    function scaledFillReinfCount() {
      var c = F.fillReinforcementParticleCount;
      if (compact()) c = Math.round(c * 0.55);
      return c;
    }

    /* ---------- iniciar formación ---------- */
    function enterForming(now) {
      if (!targets.length) return;
      var px = logoPx();
      var ox = cx, oy = cy; // centrado: llena el hero simétricamente
      var edgesT = [], fillsT = [], i;
      for (i = 0; i < targets.length; i++) {
        var o = { x: ox + targets[i].nx * px, y: oy + targets[i].ny * px, col: targets[i].col, edge: targets[i].edge };
        if (o.edge) edgesT.push(o); else fillsT.push(o);
      }
      shuffle(edgesT); shuffle(fillsT);
      var lc = Math.min(parts.length, scaledLogoCount(), targets.length);
      var edgeGoal = Math.min(edgesT.length, Math.round(lc * F.logoEdgeQuota));
      var fillGoal = Math.min(fillsT.length, Math.round(lc * F.logoFillQuota));
      if (edgeGoal + fillGoal > lc) fillGoal = lc - edgeGoal;
      if (edgeGoal + fillGoal < lc) fillGoal = Math.min(fillsT.length, fillGoal + (lc - edgeGoal - fillGoal));
      var tgt = edgesT.slice(0, edgeGoal).concat(fillsT.slice(0, fillGoal));
      shuffle(tgt); // mezcla borde/relleno: forma orgánica, menos sensación de contorno dibujado
      lc = Math.min(lc, tgt.length);

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
        p.logoAlpha = tg.edge ? (0.82 + Math.random() * 0.05) : (0.78 + Math.random() * 0.08);
        p.delay = Math.random() * 0.30;          // llegadas escalonadas
        p.releaseDelay = Math.random() * 0.30;
      }
      buildReinforcement(ox, oy, px);
      phase = 'FORMING'; phaseStart = now;
    }

    // INTRO: formación breve y suave. Coloca cada partícula-logo MUY cerca de su
    // objetivo (recorrido mínimo) y deja que la fase FORMING la asiente en ~0.5s.
    // Materialización sutil, sin "snap" (parpadeo) ni "vuelo desde los lados".
    function introFormLogo(now) {
      enterForming(now); // asigna objetivos, delays y refuerzo → deja phase='FORMING'
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.hasTarget) {
          p.x = p.tx + (Math.random() - 0.5) * 80; // ±40px alrededor del objetivo
          p.y = p.ty + (Math.random() - 0.5) * 80;
          p.vx = 0; p.vy = 0;
        }
      }
      introPending = false;
    }

    // Refuerzo: puntos crujientes sobre los BORDES (contorno del corazón,
    // separación corazón/mano, curva de la mano). Fade-in/out.
    function buildReinforcement(ox, oy, px) {
      reinf = [];
      if (!edgeTargets.length && !fillTargets.length) return;

      var pool = edgeTargets.slice();
      shuffle(pool);
      var rc = Math.min(scaledReinfCount(), pool.length);
      for (var i = 0; i < rc; i++) {
        var e = pool[i];
        reinf.push({
          x: ox + e.nx * px + (Math.random() - 0.5) * 1.15,
          y: oy + e.ny * px + (Math.random() - 0.5) * 1.15,
          size: 0.68 + Math.random() * 0.60,
          seed: Math.random() * TWO_PI,
          a: 0.48 + Math.random() * 0.28,
          col: REINF_COLOR,
        });
      }

      var fillPool = fillTargets.slice();
      shuffle(fillPool);
      var fc = Math.min(scaledFillReinfCount(), fillPool.length);
      for (i = 0; i < fc; i++) {
        var f = fillPool[i];
        reinf.push({
          x: ox + f.nx * px + (Math.random() - 0.5) * 3.0,
          y: oy + f.ny * px + (Math.random() - 0.5) * 3.0,
          size: 0.72 + Math.random() * 0.82,
          seed: Math.random() * TWO_PI,
          a: 0.12 + Math.random() * 0.12,
          col: LOGO_CORE,
        });
      }
    }

    // Al iniciar el desarme: cada partícula del logo toma un rumbo RADIAL desde el
    // centro (con variación) y velocidad alta → se abren y se reparten por TODO el
    // hero, en vez de quedarse apelotonadas donde estaba el logo.
    function disperseLogoParticles() {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (!p.hasTarget) continue;
        var ang = Math.atan2(p.y - cy, p.x - cx);
        p.floatBaseDir = ang + (Math.random() - 0.5) * 1.4; // hacia afuera ±40°
        p.floatDir = p.floatBaseDir;
        p.floatSpeed = lerp(F.floatMaxSpeed * 0.7, F.floatMaxSpeed, Math.random());
      }
    }

    function endRelease(now) {
      phase = 'WIND'; phaseStart = now; morph = 0; reinfAlpha = 0; reinf = [];
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.hasTarget = false; p.role = 'wind'; p.logoCol = null;
        p.edgeTarget = false;
        // NO se reasigna la dirección: conserva el rumbo radial del desarme para
        // seguir repartiéndose por el hero y salir por los bordes.
        resetLife(p, false);
        p.age = Math.random() * p.life * 0.35;
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
        // Intro única: forma el logo (breve y suave) en cuanto la máscara está lista.
        // Si el typewriter ya terminó antes (carga muy lenta), cancela la intro.
        if (introPending) {
          if (heroTyped()) { introPending = false; introDone = true; }            // ya escribió antes de cargar la máscara → sin logo
          else if (targets.length) { introFormLogo(now); }                        // materialización breve (~0.5s)
          else if (now - bootAt >= 1600) { introPending = false; introDone = true; } // la máscara nunca cargó → sólo viento
        }
      } else if (phase === 'FORMING') {
        formProg = clamp01(el / F.formationDuration); phaseProgress = formProg; morph = smoothstep(formProg);
        reinfAlpha = smoothstep(formProg);
        if (el >= F.formationDuration) { phase = 'HOLD'; phaseStart = now; morph = 1; }
      } else if (phase === 'HOLD') {
        morph = 1; phaseProgress = 1; reinfAlpha = 1;
        // El desarmado (5s, intacto) debe TERMINAR junto con la aparición de los
        // elementos → empieza ANTES de que acabe el typewriter, usando su fin previsto.
        var relAt = (typeof window !== 'undefined' && window.cfHeroTypeEndAt)
          ? (window.cfHeroTypeEndAt + REVEAL_MS - F.releaseDuration) : Infinity;
        if (now >= relAt || heroTyped() || el >= F.holdDuration) {
          // El desarmado empieza aquí. El efecto sale de particleMorph(): morph baja de 1→0.
          phase = 'RELEASING'; phaseStart = now; introDone = true;
          // IMPORTANTE: el desarme arranca en progreso 0. Sin esto, este frame usaría
          // phaseProgress=1 (heredado de HOLD) con fase RELEASING → particleMorph daría
          // lp=0 para todo el logo durante 1 frame (parpadeo). Con 0, lp≈1 y no parpadea.
          phaseProgress = 0;
          disperseLogoParticles(); // reparte el logo por todo el hero al desarmarse
        }
      } else if (phase === 'RELEASING') {
        relProg = clamp01(el / F.releaseDuration); phaseProgress = relProg; morph = 1 - smoothstep(relProg);
        reinfAlpha = 1 - smoothstep(relProg);
        if (el >= F.releaseDuration) { endRelease(now); }
      }

      // Fade-in inicial corto desde el arranque (t=0): el viento se dibuja desde el
      // primer frame (nada "tarda en aparecer") y el logo se materializa en FORMING.
      var introFade = smoothstep(clamp01((now - bootAt) / 350));

      // atenúa la máscara blanca del hero para realzar el logo (sin perder legibilidad)
      if (heroMask) heroMask.style.opacity = String(1 - F.maskFade * morph);

      ctx.clearRect(0, 0, w, h); // sin acumulación → sin estelas/humo
      mouse.vx *= 0.9; mouse.vy *= 0.9;
      rebuildSpatialGrid(phaseProgress);

      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var lp = particleMorph(p, phaseProgress);

        // 1) Fondo flotante: cada partícula conserva rumbo propio, sin corriente global.
        var free = 1 - lp;
        if (free > 0.02) {
          if (!p.hasTarget) {
            p.age += realDt;
            if (p.age > p.life) { respawnAtEdge(p); continue; } // renovación también por bordes
          }
          var drift = Math.sin(t * p.floatRate + p.floatPhase) * F.floatDrift;
          var noise = (valueNoise2(p.seed * 0.013 + t * 0.035, p.floatPhase) - 0.5) * F.floatNoise;
          var targetDir = p.floatBaseDir + drift + noise;
          p.floatDir += angleDelta(p.floatDir, targetDir) * F.floatEase * dtScale;
          var speed = clamp(p.floatSpeed + Math.sin(t * p.speedRate + p.speedPhase) * F.floatSpeedJitter, F.floatMinSpeed, F.floatMaxSpeed);
          var tvx = Math.cos(p.floatDir) * speed;
          var tvy = Math.sin(p.floatDir) * speed;
          p.vx += (tvx - p.vx) * F.floatEase * free * dtScale;
          p.vy += (tvy - p.vy) * F.floatEase * free * dtScale;
          applyDistributionForces(p, lp);
        }

        // 2) cursor: mueve el aire de forma tangencial (sutil), no repele
        var mouseBoost = 0;
        if (F.mouseStrength > 0 && mouse.active && mouse.x != null && lp < 0.5) {
          var mx = p.x - mouse.x, my = p.y - mouse.y, md = Math.hypot(mx, my);
          if (md < F.mouseRadius && md > 0.1) {
            var wk = smoothstep(1 - md / F.mouseRadius) * F.mouseStrength * (1 - morph * 0.7);
            var ml = Math.hypot(mouse.vx, mouse.vy);
            var dx = ml > 0.05 ? mouse.vx / ml : 0, dy = ml > 0.05 ? mouse.vy / ml : 0;
            p.vx += (dx * 0.35 + (-my / md) * 0.28) * wk;
            p.vy += (dy * 0.35 + (mx / md) * 0.28) * wk;
            mouseBoost = smoothstep(1 - md / F.mouseRadius) * (1 - lp);
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

        // reciclado sólo cuando es fondo libre (nunca rompe el logo):
        // sale por un borde → reaparece ENTRANDO por otro borde (flujo continuo)
        if (lp < 0.06) {
          if (p.x > w + MARGIN || p.x < -MARGIN || p.y < -MARGIN || p.y > h + MARGIN) { respawnAtEdge(p); continue; }
        }

        // ---- alpha + dibujo (punto limpio, glow pequeño y opcional) ----
        var cellDensity = p.gridIndex >= 0 ? (spatial.counts[p.gridIndex] / Math.max(1, spatial.avg)) : 1;
        var densityTone = clamp(1 - Math.max(0, cellDensity - 1.45) * 0.08, 0.78, 1.04);
        var flick = 0.90 + Math.sin(t * 0.9 + p.jitterPhase) * 0.10;
        var ambient = lifecycleAlpha(p) * densityTone;
        var vis = p.hasTarget ? lerp(ambient, 1, lp) : ambient;
        var alpha = p.baseAlpha * vis * flick * F.windOpacity;
        if (p.hasTarget) alpha = lerp(alpha, p.logoAlpha * F.logoOpacity, lp);
        else alpha *= (1 - 0.62 * morph); // atenúa el ambiente mientras vive el logo
        alpha *= (1 + mouseBoost * 0.32);
        alpha *= introFade;              // fade-in inicial (aparición suave, ya formado)
        // atenúa cerca de los bordes del hero → entran/salen suave (no aplica al logo formado)
        var edgeFade = smoothstep(Math.min(p.x, w - p.x, p.y, h - p.y) / F.edgeFadeDist);
        alpha *= lerp(edgeFade, 1, lp);
        if (alpha < 0.012) continue;
        if (alpha > 0.9) alpha = 0.9;

        var col = p.logoCol ? mixColor(p.col, p.logoCol, lp) : p.col;
        var logoSizeBoost = p.edgeTarget ? 0.42 : 0.72;
        var size = p.size * (1 + lp * logoSizeBoost) * (1 + mouseBoost * 0.12);
        var glowBoost = 1 + mouseBoost * 0.55;

        if (F.glow > 0 && lp < 0.25 && size > F.glowMinSize) { // sin glow al formar → logo crujiente
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * F.glowRadius, 0, TWO_PI);
          ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (alpha * F.glow * glowBoost) + ')';
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
          var a = reinfAlpha * rp.a * F.logoOpacity * introFade;
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
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var alpha = clamp(p.baseAlpha * 0.82 * F.windOpacity, 0, 0.62);
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
      updateLogoCssVars();
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
