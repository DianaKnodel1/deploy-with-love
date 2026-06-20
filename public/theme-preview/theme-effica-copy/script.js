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

// Pricing toggle (Monthly / Yearly -20%)
(function initPricingToggle(){
  const toggle = document.querySelector('[data-pricing-toggle]');
  if (!toggle) return;
  const buttons = toggle.querySelectorAll('.pt-btn');
  const amounts = document.querySelectorAll('.pamount[data-price]');
  const pers = document.querySelectorAll('.pper[data-per]');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const yearly = btn.dataset.period === 'yearly';
      amounts.forEach(el => {
        const base = parseFloat(el.dataset.price);
        if (!isNaN(base)) {
          const val = yearly ? Math.round(base * 0.8) : base;
          el.textContent = val + '€';
        }
      });
      pers.forEach(el => { el.textContent = yearly ? 'pro Monat (jährl.)' : 'pro Monat'; });
    });
  });
})();

// Testimonial carousel
(function initCarousel(){
  const root = document.querySelector('[data-carousel]');
  if (!root) return;
  const track = root.querySelector('[data-carousel-track]');
  const slides = Array.from(track.children);
  const prev = root.querySelector('[data-carousel-prev]');
  const next = root.querySelector('[data-carousel-next]');
  const dotsWrap = root.querySelector('[data-carousel-dots]');
  let index = 0;
  let perView = 3;
  const computePerView = () => {
    const w = window.innerWidth;
    perView = w < 720 ? 1 : w < 1024 ? 2 : 3;
  };
  const maxIndex = () => Math.max(0, slides.length - perView);
  const update = () => {
    const slideW = track.parentElement.clientWidth / perView;
    slides.forEach(s => { s.style.flex = `0 0 ${slideW}px`; });
    track.style.transform = `translateX(${-index * slideW}px)`;
    dotsWrap.querySelectorAll('button').forEach((d,i) => d.classList.toggle('active', i === index));
  };
  const buildDots = () => {
    dotsWrap.innerHTML = '';
    for (let i = 0; i <= maxIndex(); i++) {
      const b = document.createElement('button');
      b.addEventListener('click', () => { index = i; update(); });
      dotsWrap.appendChild(b);
    }
  };
  const rebuild = () => {
    computePerView();
    index = Math.min(index, maxIndex());
    buildDots();
    update();
  };
  prev?.addEventListener('click', () => { index = Math.max(0, index - 1); update(); });
  next?.addEventListener('click', () => { index = Math.min(maxIndex(), index + 1); update(); });
  window.addEventListener('resize', rebuild);
  rebuild();
  // Auto-advance every 6s
  setInterval(() => {
    index = index >= maxIndex() ? 0 : index + 1;
    update();
  }, 6000);
})();
