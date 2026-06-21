(function () {
  'use strict';

  /* ===== Year ===== */
  var fy = document.getElementById('footer-year');
  if (fy) fy.textContent = new Date().getFullYear();

  /* ===== Smooth scroll ===== */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href').slice(1);
      if (!id) return;
      var el = document.getElementById(id);
      if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });

  /* ===== Header scroll shadow ===== */
  var header = document.querySelector('.site-header');
  if (header) {
    window.addEventListener('scroll', function () {
      header.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  /* ===== Mobile hamburger ===== */
  var menuBtn  = document.getElementById('mobile-menu-button');
  var mobileMenu = document.getElementById('mobile-menu');
  var iconOpen  = document.getElementById('menu-icon-open');
  var iconClose = document.getElementById('menu-icon-close');
  var menuOpen  = false;
  function toggleMenu(force) {
    menuOpen = typeof force === 'boolean' ? force : !menuOpen;
    mobileMenu && mobileMenu.classList.toggle('hidden', !menuOpen);
    iconOpen  && iconOpen.classList.toggle('hidden',  menuOpen);
    iconClose && iconClose.classList.toggle('hidden', !menuOpen);
  }
  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', function () { toggleMenu(); });
    mobileMenu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { toggleMenu(false); });
    });
  }

  /* ===== Partners carousel ===== */
  var pTrack = document.getElementById('partners-track');
  var pPrev  = document.getElementById('partners-prev');
  var pNext  = document.getElementById('partners-next');
  if (pTrack && pPrev && pNext) {
    var logos      = pTrack.querySelectorAll('.partner-logo');
    var totalLogos = logos.length;
    var pIdx       = 0;
    var visibleP   = window.innerWidth >= 1024 ? 5 : window.innerWidth >= 640 ? 3 : 2;

    function getVisibleP() {
      return window.innerWidth >= 1024 ? 5 : window.innerWidth >= 640 ? 3 : 2;
    }
    function renderPartners() {
      visibleP = getVisibleP();
      var maxIdx = Math.max(0, totalLogos - visibleP);
      pIdx = Math.min(pIdx, maxIdx);
      var logoW = pTrack.parentElement.offsetWidth / visibleP;
      pTrack.style.transform = 'translateX(-' + (pIdx * logoW) + 'px)';
    }
    pPrev.addEventListener('click', function () { pIdx = Math.max(0, pIdx - 1); renderPartners(); });
    pNext.addEventListener('click', function () {
      visibleP = getVisibleP();
      pIdx = Math.min(totalLogos - visibleP, pIdx + 1);
      renderPartners();
    });
    window.addEventListener('resize', renderPartners, { passive: true });

    var pTimer = setInterval(function () {
      visibleP = getVisibleP();
      pIdx = (pIdx + 1) % (totalLogos - visibleP + 1);
      renderPartners();
    }, 3000);
    renderPartners();
  }

  /* ===== Testimonials carousel ===== */
  var tTrack = document.getElementById('testimonials-track');
  var tPrev  = document.getElementById('testimonials-prev');
  var tNext  = document.getElementById('testimonials-next');
  if (tTrack && tPrev && tNext) {
    var cards    = tTrack.querySelectorAll('.testimonial-card');
    var total    = cards.length;
    var tIdx     = 0;

    function getVisibleT() {
      return window.innerWidth >= 768 ? 3 : 1;
    }
    function renderTestimonials() {
      var vis   = getVisibleT();
      var maxIdx = Math.max(0, total - vis);
      tIdx = Math.min(tIdx, maxIdx);
      var pct = tIdx * (100 / vis);
      tTrack.style.transform = 'translateX(-' + pct + '%)';
    }
    tPrev.addEventListener('click', function () { tIdx = Math.max(0, tIdx - 1); renderTestimonials(); });
    tNext.addEventListener('click', function () {
      var maxIdx = Math.max(0, total - getVisibleT());
      tIdx = Math.min(maxIdx, tIdx + 1);
      renderTestimonials();
    });
    window.addEventListener('resize', renderTestimonials, { passive: true });

    var tTimer = setInterval(function () {
      var vis = getVisibleT();
      var maxIdx = Math.max(0, total - vis);
      tIdx = tIdx >= maxIdx ? 0 : tIdx + 1;
      renderTestimonials();
    }, 6000);
    renderTestimonials();
  }

  /* ===== Pricing toggle ===== */
  var pricingToggle = document.getElementById('pricing-toggle');
  var monthlyLabel  = document.getElementById('toggle-monthly-label');
  var yearlyLabel   = document.getElementById('toggle-yearly-label');
  var yearly = false;

  function applyPricing() {
    document.querySelectorAll('.price-amount[data-monthly]').forEach(function (el) {
      el.textContent = yearly ? el.getAttribute('data-yearly') : el.getAttribute('data-monthly');
    });
    if (monthlyLabel) monthlyLabel.style.opacity = yearly ? '0.5' : '1';
    if (yearlyLabel)  yearlyLabel.style.opacity  = yearly ? '1'   : '0.5';
    if (pricingToggle) pricingToggle.setAttribute('aria-checked', yearly ? 'true' : 'false');
  }
  if (pricingToggle) {
    pricingToggle.addEventListener('click', function () {
      yearly = !yearly;
      applyPricing();
    });
    applyPricing();
  }

})();
