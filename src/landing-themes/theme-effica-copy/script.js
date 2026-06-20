// Mobile nav toggle
document.getElementById('burger')?.addEventListener('click', () => {
  document.getElementById('nav-links')?.classList.toggle('open');
});
document.querySelectorAll('#nav-links a').forEach(a => {
  a.addEventListener('click', () => document.getElementById('nav-links')?.classList.remove('open'));
});

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id && id.length > 1) {
      const el = document.querySelector(id);
      if (el) { e.preventDefault(); el.scrollIntoView({ behavior:'smooth', block:'start' }); }
    }
  });
});
