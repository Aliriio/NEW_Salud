/* ================================================================
   CareFlow — Shell interno (dashboard + entrega)
   - Sidebar colapsable (desktop) / drawer (móvil), estado persistido.
   - Logout en el dropdown del avatar (topbar), no en la sidebar.
   - Co-branding dinámico por dominio del correo.
   - Cambio de vistas in-page (data-view) + soporte de hash.
   - Inyección de datos de usuario/institución desde la sesión.
   ================================================================ */
(function () {
  'use strict';

  const MOBILE = 860;
  const LS_KEY = 'cf_sidebar_collapsed';

  function initials(name) {
    const clean = (name || '').replace(/@.*/, '').replace(/[._-]/g, ' ').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (!parts.length) return 'CF';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function boot() {
    const shell = document.querySelector('.cf-shell');
    if (!shell) return;

    const auth = window.CareFlowAuth;
    const user = auth ? auth.getUser() : 'demo@santafe.com';
    const inst = auth ? auth.getInstitucion() : 'CareFlow';
    const brand = auth ? auth.getBrandForEmail() : null;

    // ─── Inyección de identidad ───
    document.querySelectorAll('[data-cf-user]').forEach(function (el) { el.textContent = user; });
    document.querySelectorAll('[data-cf-inst]').forEach(function (el) { el.textContent = inst; });
    document.querySelectorAll('[data-cf-initials]').forEach(function (el) { el.textContent = initials(user); });

    // ─── Co-branding del cliente (white-label) ───
    document.querySelectorAll('[data-cf-cobrand]').forEach(function (slot) {
      if (brand) {
        const logo = slot.querySelector('[data-cf-cobrand-logo]');
        const name = slot.querySelector('[data-cf-cobrand-name]');
        if (logo) { logo.src = brand.logo; logo.alt = brand.name; }
        if (name) name.textContent = brand.name;
        slot.hidden = false;
      } else {
        slot.hidden = true;
      }
    });

    // ─── Estado colapsado persistido (solo desktop) ───
    function applyCollapsed() {
      if (window.innerWidth > MOBILE) {
        let collapsed = false;
        try { collapsed = localStorage.getItem(LS_KEY) === '1'; } catch (e) {}
        shell.classList.toggle('collapsed', collapsed);
        shell.classList.remove('sidebar-open');
      } else {
        shell.classList.remove('collapsed');
      }
    }
    applyCollapsed();
    window.addEventListener('resize', applyCollapsed);

    // ─── Hamburguesa: colapsa (desktop) o abre drawer (móvil) ───
    const hamburger = document.querySelector('.cf-hamburger');
    const scrim = document.querySelector('.cf-scrim');
    function closeDrawer() { shell.classList.remove('sidebar-open'); }

    if (hamburger) {
      hamburger.addEventListener('click', function () {
        if (window.innerWidth <= MOBILE) {
          shell.classList.toggle('sidebar-open');
        } else {
          const collapsed = shell.classList.toggle('collapsed');
          try { localStorage.setItem(LS_KEY, collapsed ? '1' : '0'); } catch (e) {}
        }
      });
    }
    if (scrim) scrim.addEventListener('click', closeDrawer);

    // ─── Dropdown del avatar (logout seguro) ───
    const avatarBtn = document.querySelector('[data-cf-avatar]');
    const menu = document.querySelector('[data-cf-menu]');
    if (avatarBtn && menu) {
      function openMenu(open) {
        menu.hidden = !open;
        avatarBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      avatarBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        openMenu(menu.hidden);
      });
      document.addEventListener('click', function (e) {
        if (!menu.hidden && !menu.contains(e.target) && !avatarBtn.contains(e.target)) openMenu(false);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') openMenu(false);
      });
    }

    // ─── Logout ───
    document.querySelectorAll('[data-cf-logout]').forEach(function (btn) {
      btn.addEventListener('click', function () { if (auth) auth.logout(); });
    });

    // ─── Cambio de vistas in-page ───
    const navItems = document.querySelectorAll('.cf-nav-item[data-view]');
    const views = document.querySelectorAll('.cf-view');
    const topTitle = document.querySelector('[data-cf-topbar-title]');

    function activateView(view, smooth) {
      const item = document.querySelector('.cf-nav-item[data-view="' + view + '"]');
      const target = document.getElementById('view-' + view);
      if (!item || !target) return false;

      navItems.forEach(function (n) { n.classList.remove('active'); });
      item.classList.add('active');
      views.forEach(function (v) { v.classList.remove('active'); });
      target.classList.add('active');
      if (topTitle && item.dataset.title) topTitle.textContent = item.dataset.title;

      closeDrawer();
      window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
      return true;
    }

    if (navItems.length && views.length) {
      navItems.forEach(function (item) {
        item.addEventListener('click', function () { activateView(item.dataset.view, true); });
      });
      const hash = (window.location.hash || '').replace('#', '');
      if (hash) activateView(hash, false);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
