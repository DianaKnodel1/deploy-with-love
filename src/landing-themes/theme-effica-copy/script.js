(function () {
  'use strict';

  // ===== Year =====
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // ===== Mobile Nav =====
  var toggle = document.getElementById('mobileToggle');
  var nav = document.getElementById('mobileNav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () { nav.classList.toggle('open'); });
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { nav.classList.remove('open'); });
    });
  }

  // ===== Pricing Toggle =====
  var billingBtns = document.querySelectorAll('[data-billing]');
  var priceNums = document.querySelectorAll('.price-num[data-monthly]');
  function fmt(n) { return n.toLocaleString('de-DE'); }
  billingBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var mode = btn.getAttribute('data-billing');
      billingBtns.forEach(function (b) { b.classList.toggle('active', b === btn); });
      priceNums.forEach(function (el) {
        var v = mode === 'yearly' ? el.getAttribute('data-yearly') : el.getAttribute('data-monthly');
        if (v) el.textContent = fmt(parseInt(v, 10));
      });
      document.querySelectorAll('.price-sub').forEach(function (s) {
        if (s.parentElement.querySelector('.price-num-text')) return;
        s.textContent = mode === 'yearly' ? 'pro Monat (jährlich)' : 'pro Monat';
      });
    });
  });

  // ===== Testimonial Carousel =====
  var track = document.querySelector('[data-carousel-track]');
  var prevBtn = document.querySelector('[data-carousel-prev]');
  var nextBtn = document.querySelector('[data-carousel-next]');
  var dotsWrap = document.querySelector('[data-carousel-dots]');
  if (track && prevBtn && nextBtn && dotsWrap) {
    var slides = track.querySelectorAll('.carousel-slide');
    var total = slides.length;
    var idx = 0;
    // Build dots
    for (var i = 0; i < total; i++) {
      (function (n) {
        var d = document.createElement('button');
        d.className = 'carousel-dot';
        d.setAttribute('aria-label', 'Slide ' + (n + 1));
        d.addEventListener('click', function () { idx = n; render(); });
        dotsWrap.appendChild(d);
      })(i);
    }
    var dots = dotsWrap.querySelectorAll('.carousel-dot');
    function render() {
      track.style.transform = 'translateX(-' + (idx * 100) + '%)';
      dots.forEach(function (d, i) { d.classList.toggle('active', i === idx); });
    }
    prevBtn.addEventListener('click', function () { idx = Math.max(0, idx - 1); render(); });
    nextBtn.addEventListener('click', function () { idx = Math.min(total - 1, idx + 1); render(); });
    // Auto-advance
    setInterval(function () { idx = (idx + 1) % total; render(); }, 6000);
    render();
  }
})();
