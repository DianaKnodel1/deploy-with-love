// === Bewerbungs-/Anfrage-Erfolgs-Modal ===
function __waFormatNumber(num) {
  var d = String(num || '').replace(/[^0-9]/g, '');
  if (!d) return '';
  if (d.length > 4) return '+' + d.slice(0, 2) + ' ' + d.slice(2, 5) + ' ' + d.slice(5);
  return '+' + d;
}

function showApplicationModal(opts) {
  opts = opts || {};
  var isFast = !!opts.fast;
  var wa = String(opts.whatsapp || '').replace(/[^0-9]/g, '');
  var overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,10,30,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;backdrop-filter:blur(4px);';
  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;color:#1e1b4b;max-width:480px;width:100%;border-radius:20px;padding:36px;box-shadow:0 32px 80px -10px rgba(0,0,0,.35);font-family:inherit;position:relative;';
  var close = document.createElement('button');
  close.type = 'button'; close.setAttribute('aria-label', 'Schließen');
  close.innerHTML = '&times;';
  close.style.cssText = 'position:absolute;top:14px;right:18px;background:none;border:0;font-size:26px;line-height:1;cursor:pointer;color:#9ca3af;';
  close.onclick = function () { overlay.remove(); };
  var icon = document.createElement('div');
  icon.style.cssText = 'width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#4f46e5);display:flex;align-items:center;justify-content:center;margin-bottom:18px;';
  icon.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var h = document.createElement('h3');
  h.textContent = 'Vielen Dank für Ihre Anfrage!';
  h.style.cssText = 'margin:0 0 10px;font-size:22px;font-weight:800;line-height:1.25;';
  var p = document.createElement('p');
  p.style.cssText = 'margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6;';
  box.appendChild(close); box.appendChild(icon); box.appendChild(h); box.appendChild(p);

  function __waCard() {
    var card = document.createElement('div');
    card.style.cssText = 'background:#f5f3ff;border:1.5px solid #c4b5fd;border-radius:12px;padding:18px;margin-bottom:16px;';
    var label = document.createElement('div');
    label.textContent = 'SCHNELLER KONTAKT';
    label.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;color:#7c3aed;margin-bottom:10px;';
    var info = document.createElement('p');
    info.style.cssText = 'margin:0 0 14px;font-size:14px;color:#6b7280;line-height:1.5;';
    info.innerHTML = 'Kontaktieren Sie uns direkt via WhatsApp: <strong>' + __waFormatNumber(wa) + '</strong>';
    var btn = document.createElement('a');
    btn.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Hallo, ich habe gerade eine Anfrage gesendet.');
    btn.target = '_blank'; btn.rel = 'noopener';
    btn.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;background:#22c55e;color:#fff;text-decoration:none;font-weight:700;padding:13px 16px;border-radius:10px;font-size:15px;';
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z"/></svg> WhatsApp Chat starten';
    card.appendChild(label); card.appendChild(info); card.appendChild(btn);
    return card;
  }

  if (isFast) {
    p.textContent = 'Ihre Anfrage wurde erfolgreich übermittelt. Sie werden gleich zu unserem Kundenportal weitergeleitet.';
    if (opts.redirectUrl) {
      var goNow = document.createElement('button');
      goNow.type = 'button'; goNow.textContent = 'Jetzt zum Kundenportal →';
      goNow.style.cssText = 'display:block;width:100%;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:0;padding:14px 18px;border-radius:10px;cursor:pointer;font-size:15px;font-weight:700;margin-bottom:12px;';
      var redirInfo = document.createElement('p');
      redirInfo.style.cssText = 'margin:0 0 12px;font-size:13px;color:#9ca3af;text-align:center;';
      var __secs = 10;
      redirInfo.textContent = 'Automatische Weiterleitung in ' + __secs + ' Sekunden…';
      box.appendChild(goNow); box.appendChild(redirInfo);
      var __redir = function () { window.location.href = opts.redirectUrl; };
      goNow.onclick = __redir;
      var __tick = setInterval(function () {
        __secs -= 1;
        if (__secs <= 0) { clearInterval(__tick); __redir(); return; }
        redirInfo.textContent = 'Automatische Weiterleitung in ' + __secs + ' Sekunden…';
      }, 1000);
    }
  } else {
    if (wa) {
      p.textContent = 'Wir haben Ihre Anfrage erhalten und melden uns in Kürze bei Ihnen. Für schnelle Rückmeldung nutzen Sie gerne WhatsApp.';
      box.appendChild(__waCard());
    } else {
      p.textContent = 'Wir haben Ihre Anfrage erhalten und melden uns i.d.R. innerhalb von 24–48 Stunden per E-Mail bei Ihnen.';
    }
  }

  var closeBtn = document.createElement('button');
  closeBtn.type = 'button'; closeBtn.textContent = 'Schließen';
  closeBtn.style.cssText = 'background:#fff;border:1.5px solid #e5e7eb;color:#1e1b4b;padding:10px 20px;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;';
  closeBtn.onclick = function () { overlay.remove(); };
  box.appendChild(closeBtn);
  overlay.appendChild(box);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

(function () {
  // ---- Form submission ----
  var form = document.getElementById('application-form');
  var status = document.getElementById('form-status');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.className = 'status';
      status.textContent = 'Wird gesendet…';
      var raw = Object.fromEntries(new FormData(form).entries());
      var first = (raw.first_name || '').toString().trim();
      var last = (raw.last_name || '').toString().trim();
      var data = {
        first_name: first || null,
        last_name: last || null,
        full_name: (first + ' ' + last).trim() || raw.full_name || '',
        email: raw.email,
        phone: raw.phone || null,
        postal_code: raw.postal_code || null,
        city: raw.city || null,
        message: [
          raw.street ? 'Website: ' + raw.street : '',
          raw.message ? raw.message : ''
        ].filter(Boolean).join('\n\n') || null,
      };
      data.domain = (window.location && window.location.hostname ? window.location.hostname : '').replace(/^www\./, '');
      data.flow_type = window.FLOW_TYPE || 'classic';
      if (window.TENANT_ID) data.tenant_id = window.TENANT_ID;
      if (window.PORTAL_URL) data.portal_url = window.PORTAL_URL;
      if (window.SOURCE_SLUG) data.source_slug = window.SOURCE_SLUG;
      fetch(window.PORTAL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (res) {
          form.reset();
          status.className = 'status success';
          status.textContent = 'Anfrage erfolgreich gesendet!';
          var isFast = (window.FLOW_TYPE || 'classic') === 'fast';
          showApplicationModal({
            fast: isFast,
            whatsapp: window.WHATSAPP_NUMBER || '',
            redirectUrl: (res && res.redirect_url) || '',
            broker: (res && res.broker) || null,
          });
        })
        .catch(function () {
          status.className = 'status error';
          status.textContent = 'Da ist etwas schiefgelaufen. Bitte versuchen Sie es später erneut.';
        });
    });
  }

  // ---- Burger menu ----
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav-links');
  if (burger && nav) {
    burger.addEventListener('click', function () { nav.classList.toggle('open'); });
  }

  // ---- Smooth scroll for anchor links ----
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (!id || id.length <= 1) return;
      var el = document.querySelector(id);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth' });
        if (nav) nav.classList.remove('open');
      }
    });
  });

  // ---- Scroll-animate ----
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-animate]').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('[data-animate]').forEach(function (el) { el.classList.add('visible'); });
  }

  // ---- Active nav highlight on scroll ----
  var sections = document.querySelectorAll('section[id], header[id]');
  var navLinks = document.querySelectorAll('.nav-links a');
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var id = entry.target.getAttribute('id');
        navLinks.forEach(function (a) {
          a.style.color = a.getAttribute('href') === '#' + id ? 'var(--primary)' : '';
        });
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  sections.forEach(function (s) { observer.observe(s); });
})();

// ---- Floating WhatsApp button ----
document.addEventListener('DOMContentLoaded', function () {
  var wa = String(window.WHATSAPP_NUMBER || '').replace(/[^0-9]/g, '');
  if (!wa) return;
  if (document.getElementById('wa-float-btn')) return;
  var a = document.createElement('a');
  a.id = 'wa-float-btn';
  a.href = 'https://wa.me/' + wa;
  a.target = '_blank'; a.rel = 'noopener';
  a.setAttribute('aria-label', 'Kontaktieren Sie uns auf WhatsApp');
  a.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9998;display:flex;align-items:center;gap:8px;background:#22c55e;color:#fff;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:999px;font-size:15px;font-family:inherit;box-shadow:0 8px 28px rgba(34,197,94,.4);transition:transform .15s ease;';
  a.onmouseenter = function () { a.style.transform = 'translateY(-3px)'; };
  a.onmouseleave = function () { a.style.transform = 'translateY(0)'; };
  a.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z"/></svg><span>WhatsApp</span>';
  document.body.appendChild(a);
  var mq = window.matchMedia('(max-width: 540px)');
  function apply() { var span = a.querySelector('span'); if (span) span.style.display = mq.matches ? 'none' : 'inline'; }
  apply();
  if (mq.addEventListener) mq.addEventListener('change', apply); else mq.addListener(apply);
});
