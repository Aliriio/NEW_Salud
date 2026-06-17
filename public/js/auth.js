/* ================================================================
   CareFlow — Autenticación demo (sin backend) + identidad por dominio
   - Credenciales fijas de demostración.
   - Bandera de sesión en sessionStorage.
   - Guard de páginas protegidas y logout.
   - White-label: la institución/co-branding se infiere del dominio del correo.
   NOTA: esto NO es seguridad real; es una demo de presentación.
   ================================================================ */
(function () {
  'use strict';

  const CF_AUTH = {
    // Credencial demo — dominio de cliente para demostrar el co-branding
    USER: 'demo@santafe.com',
    PASS: 'careflow2026',
    KEY: 'cf_auth',
    USER_KEY: 'cf_user',
  };

  // Mapa dominio → co-branding del cliente (white-label).
  // CareFlow es el producto; cada institución es un cliente con licencia.
  const BRANDS = {
    'santafe.com':    { logo: 'assets/logo-fcsb.png', name: 'Fundación Santa Fe de Bogotá' },
    'santafe.org':    { logo: 'assets/logo-fcsb.png', name: 'Fundación Santa Fe de Bogotá' },
    'santafe.com.co': { logo: 'assets/logo-fcsb.png', name: 'Fundación Santa Fe de Bogotá' },
    'fsfb.org':       { logo: 'assets/logo-fcsb.png', name: 'Fundación Santa Fe de Bogotá' },
    'fsfb.org.co':    { logo: 'assets/logo-fcsb.png', name: 'Fundación Santa Fe de Bogotá' },
  };

  function domainOf(email) {
    const m = String(email || '').toLowerCase().match(/@([^@\s]+)$/);
    return m ? m[1] : '';
  }

  function isAuthed() {
    try { return sessionStorage.getItem(CF_AUTH.KEY) === '1'; }
    catch (e) { return false; }
  }

  function login(user, pass) {
    const u = (user || '').trim().toLowerCase();
    const p = (pass || '').trim();
    if (u === CF_AUTH.USER && p === CF_AUTH.PASS) {
      try {
        sessionStorage.setItem(CF_AUTH.KEY, '1');
        sessionStorage.setItem(CF_AUTH.USER_KEY, user.trim());
      } catch (e) {}
      return true;
    }
    return false;
  }

  function logout() {
    try {
      sessionStorage.removeItem(CF_AUTH.KEY);
      sessionStorage.removeItem(CF_AUTH.USER_KEY);
    } catch (e) {}
    window.location.href = 'login.html';
  }

  function guard() {
    if (!isAuthed()) window.location.replace('login.html');
  }

  function getUser() {
    try { return sessionStorage.getItem(CF_AUTH.USER_KEY) || CF_AUTH.USER; }
    catch (e) { return CF_AUTH.USER; }
  }

  // Co-branding del usuario actual (o de un correo dado). null si no aplica.
  function getBrandForEmail(email) {
    const d = domainOf(email || getUser());
    return BRANDS[d] || null;
  }

  function getInstitucion() {
    const b = getBrandForEmail();
    return b ? b.name : 'CareFlow';
  }

  window.CareFlowAuth = {
    isAuthed, login, logout, guard, getUser,
    getBrandForEmail, getInstitucion, domainOf,
    DEMO_USER: CF_AUTH.USER, DEMO_PASS: CF_AUTH.PASS,
  };
})();
