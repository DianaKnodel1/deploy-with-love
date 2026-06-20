/* Mirror Site Creator — script.js */
'use strict';

// Year
const yearEl = document.getElementById('footer-year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Burger menu
const burger = document.getElementById('burger');
const nav    = document.getElementById('main-nav');
if (burger && nav) {
  burger.addEventListener('click', () => {
    nav.classList.toggle('open');
    burger.setAttribute('aria-expanded', nav.classList.contains('open'));
  });
  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target) && !burger.contains(e.target)) {
      nav.classList.remove('open');
    }
  });
}

// Scroll animations
const animEls = document.querySelectorAll('[data-animate]');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const delay = el.style.getPropertyValue('--delay') || '0s';
        el.style.transitionDelay = delay;
        el.classList.add('visible');
        io.unobserve(el);
      }
    });
  }, { threshold: 0.12 });
  animEls.forEach((el) => io.observe(el));
} else {
  animEls.forEach((el) => el.classList.add('visible'));
}

// Sticky header shadow
const header = document.querySelector('.site-header');
if (header) {
  window.addEventListener('scroll', () => {
    header.style.boxShadow = window.scrollY > 10
      ? '0 2px 24px rgba(0,0,0,.4)' : '';
  }, { passive: true });
}

// Contact form
const form = document.getElementById('contact-form');
const status = document.getElementById('form-status');
if (form && status) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Wird gesendet…';
    status.className = 'form-status';
    status.textContent = '';

    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        status.className = 'form-status success';
        status.textContent = '✓ Vielen Dank! Wir melden uns innerhalb von 2 Stunden.';
        form.reset();
      } else {
        throw new Error('server');
      }
    } catch {
      status.className = 'form-status error';
      status.textContent = '✗ Fehler beim Senden. Bitte versuchen Sie es erneut oder kontaktieren Sie uns direkt per E-Mail.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Anfrage absenden →';
    }
  });
}
