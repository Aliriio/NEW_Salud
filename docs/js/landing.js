/* ================================================================
   CareFlow — Interacciones de la landing
   - Navbar que se vuelve sólida al hacer scroll.
   - Scroll-reveal de secciones (IntersectionObserver).
   - "Conocer CareFlow" → scroll suave a #que-es.
   - Toggle de menú en móvil.
   ================================================================ */
(function () {
  'use strict';

  function boot() {
    // ─── Navbar sticky / solid ───
    const nav = document.querySelector('.cf-nav');
    if (nav) {
      const onScroll = function () {
        nav.classList.toggle('scrolled', window.scrollY > 24);
      };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // ─── Scroll suave para anclas internas ───
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        const id = a.getAttribute('href');
        if (id.length < 2) return;
        const target = document.querySelector(id);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    // ─── Scroll-reveal premium (fade / zoom / scale + stagger) ───
    const reveals = document.querySelectorAll('.cf-reveal');
    if ('IntersectionObserver' in window && reveals.length) {
      const io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            const el = en.target;
            const delay = parseInt(el.dataset.delay || '0', 10);
            if (delay) el.style.transitionDelay = delay + 'ms';
            el.classList.add('in');
            io.unobserve(el);
          }
        });
      }, { threshold: 0.14, rootMargin: '0px 0px -60px 0px' });

      // Stagger automático dentro de cada grilla/contenedor de tarjetas
      document.querySelectorAll('[data-stagger]').forEach(function (group) {
        const kids = group.querySelectorAll('.cf-reveal');
        kids.forEach(function (k, i) { if (!k.dataset.delay) k.dataset.delay = (i * 90); });
      });

      reveals.forEach(function (el) { io.observe(el); });
    } else {
      reveals.forEach(function (el) { el.classList.add('in'); });
    }

    // ─── Menú móvil ───
    const toggle = document.querySelector('.cf-nav-toggle');
    const links = document.querySelector('.cf-nav-links');
    if (toggle && links) {
      toggle.addEventListener('click', function () {
        links.classList.toggle('open');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
