/**
 * Theme: AZB Personal
 * Description: Interactivity for the AZB Personal Landing Page
 */

(function () {
  "use strict";

  // --- 1. Current Year ---
  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // --- 2. Burger Menu ---
  const burger = document.getElementById("burger");
  const navLinks = document.getElementById("nav-links");

  if (burger && navLinks) {
    burger.addEventListener("click", () => {
      const isOpen = navLinks.classList.toggle("open");
      burger.setAttribute("aria-expanded", isOpen);
    });

    // Close menu when clicking a link
    navLinks.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }

  // --- 3. Smooth Scroll & Legal Sections ---
  const LEGAL_IDS = ["impressum", "datenschutz", "agb"];

  function syncLegal() {
    const hash = (location.hash || "").replace("#", "");
    document.querySelectorAll(".legal").forEach(el => {
      el.classList.remove("is-open");
    });
    if (LEGAL_IDS.includes(hash)) {
      const el = document.getElementById(hash);
      if (el) {
        el.classList.add("is-open");
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  window.addEventListener("hashchange", syncLegal);
  syncLegal();

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", function (e) {
      const href = this.getAttribute("href");
      if (!href || href === "#") return;

      const targetId = href.slice(1);

      // If it's a legal section, let hashchange handle it (or just show it)
      if (LEGAL_IDS.includes(targetId)) {
        return; 
      }

      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        e.preventDefault();
        // Close any open legal sections when navigating to a normal anchor
        document.querySelectorAll(".legal").forEach(el => el.classList.remove("is-open"));
        if (location.hash) {
          history.replaceState(null, "", location.pathname + location.search);
        }
        
        targetEl.scrollIntoView({
          behavior: "smooth"
        });
      }
    });
  });

  // --- 4. Intersection Observer for Reveal ---
  const animateElements = document.querySelectorAll("[data-animate]");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const delay = entry.target.getAttribute("data-delay") || 0;
          setTimeout(() => {
            entry.target.classList.add("visible");
          }, delay);
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15
    });

    animateElements.forEach(el => observer.observe(el));
  } else {
    // Fallback for older browsers
    animateElements.forEach(el => el.classList.add("visible"));
  }

  // --- 5. FAQ Accordion (Single Open) ---
  const faqItems = document.querySelectorAll(".faq-item");
  if (faqItems.length > 0) {
    faqItems.forEach(item => {
      item.addEventListener("toggle", function() {
        if (this.open) {
          faqItems.forEach(otherItem => {
            if (otherItem !== this && otherItem.open) {
              otherItem.open = false;
            }
          });
        }
      });
    });
  }

  // --- 6. Form Submission & Modal ---
  const form = document.getElementById("application-form");
  const status = document.getElementById("form-status");

  function showApplicationModal(opts) {
    opts = opts || {};
    const isFast = !!opts.fast;
    const wa = String(opts.whatsapp || "").replace(/[^0-9]/g, "");
    
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;backdrop-filter:blur(4px);";
    
    const box = document.createElement("div");
    box.style.cssText = "background:#fff;color:#0f172a;max-width:480px;width:100%;border-radius:16px;padding:32px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);font-family:inherit;position:relative;";
    
    const close = document.createElement("button");
    close.innerHTML = "&times;";
    close.style.cssText = "position:absolute;top:12px;right:16px;background:none;border:0;font-size:28px;cursor:pointer;color:#64748b;line-height:1;";
    close.onclick = () => overlay.remove();

    const h = document.createElement("h3");
    h.textContent = "Bewerbung erfolgreich!";
    h.style.cssText = "margin:0 0 12px;font-size:24px;font-weight:700;";

    const p = document.createElement("p");
    p.style.cssText = "margin:0 0 24px;color:#475569;line-height:1.6;";
    
    if (isFast) {
      p.textContent = "Vielen Dank! Wir leiten Sie nun zum Mitarbeiter-Portal weiter, um Ihre Registrierung abzuschließen.";
      const btn = document.createElement("a");
      btn.href = opts.redirectUrl || "#";
      btn.textContent = "Jetzt zum Portal →";
      btn.style.cssText = "display:block;text-align:center;background:#2563eb;color:#fff;text-decoration:none;padding:14px;border-radius:8px;font-weight:600;";
      box.appendChild(btn);
      
      setTimeout(() => {
        if (opts.redirectUrl) window.location.href = opts.redirectUrl;
      }, 3000);
    } else if (wa) {
      p.textContent = "Vielen Dank für Ihre Nachricht. Wir haben Ihre Bewerbung erhalten. Für eine noch schnellere Bearbeitung können Sie uns auch direkt via WhatsApp kontaktieren.";
      const waBtn = document.createElement("a");
      waBtn.href = `https://wa.me/${wa}`;
      waBtn.target = "_blank";
      waBtn.style.cssText = "display:flex;align-items:center;justify-content:center;gap:10px;background:#22c55e;color:#fff;text-decoration:none;padding:14px;border-radius:8px;font-weight:600;";
      waBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.038 3.284l-.542 2.317 2.35-.542c.958.551 1.945.854 3.007.855h.002c3.181 0 5.767-2.586 5.768-5.766 0-3.18-2.585-5.714-5.655-5.714zm3.846 8.851c-.167.467-.966.905-1.323.959-.343.05-.788.076-1.282-.088-.317-.104-.733-.272-1.248-.495-2.204-.951-3.626-3.197-3.737-3.344-.111-.147-.905-1.206-.905-2.301 0-1.095.571-1.631.774-1.854.203-.223.444-.279.593-.279.15 0 .299.001.431.007.135.006.313-.05.49.38.181.442.617 1.503.671 1.613.053.111.088.239.016.383-.074.145-.111.235-.221.362-.112.126-.235.281-.336.376-.112.103-.229.215-.098.441.131.226.581.959 1.248 1.554.858.766 1.583 1.004 1.808 1.117.226.113.359.094.493-.06.134-.155.571-.664.722-.89.151-.226.302-.189.509-.113.208.076 1.323.624 1.549.738.226.113.376.17.432.264.056.094.056.546-.111 1.012z"/></svg> WhatsApp-Chat starten`;
      box.appendChild(waBtn);
    } else {
      p.textContent = "Vielen Dank für Ihre Bewerbung! Wir haben Ihre Unterlagen erhalten und werden uns zeitnah bei Ihnen melden.";
    }

    box.appendChild(close);
    box.prepend(h);
    box.insertBefore(p, box.querySelector("a") || null);
    overlay.appendChild(box);
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (status) {
        status.textContent = "Wird gesendet...";
        status.className = "status info";
      }

      const formData = new FormData(form);
      const raw = Object.fromEntries(formData.entries());
      
      const data = {
        first_name: raw.first_name,
        last_name: raw.last_name,
        full_name: `${raw.first_name} ${raw.last_name}`.trim(),
        email: raw.email,
        phone: raw.phone,
        postal_code: raw.postal_code,
        city: raw.city,
        message: `Stelle/Branche: ${raw.message}\nAdresse: ${raw.street || ""}`,
        domain: window.location.hostname.replace(/^www\./, ""),
        flow_type: window.FLOW_TYPE || "classic",
        tenant_id: window.TENANT_ID || null,
        source_slug: window.SOURCE_SLUG || null
      };

      fetch(window.PORTAL_API || "https://api.form-submit-placeholder.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      })
      .then(res => {
        if (!res.ok) throw new Error("Fehler beim Senden");
        return res.json();
      })
      .then(res => {
        form.reset();
        if (status) {
          status.textContent = "Erfolgreich gesendet!";
          status.className = "status success";
        }
        showApplicationModal({
          fast: (window.FLOW_TYPE === "fast"),
          whatsapp: window.WHATSAPP_NUMBER,
          redirectUrl: res.redirect_url
        });
      })
      .catch(err => {
        console.error(err);
        if (status) {
          status.textContent = "Fehler beim Senden. Bitte versuchen Sie es später erneut.";
          status.className = "status error";
        }
      });
    });
  }

  // --- 7. Floating WhatsApp Button ---
  const waNumber = window.WHATSAPP_NUMBER;
  if (waNumber) {
    const waFloat = document.createElement("a");
    waFloat.href = `https://wa.me/${waNumber.replace(/[^0-9]/g, "")}`;
    waFloat.target = "_blank";
    waFloat.rel = "noopener";
    waFloat.className = "wa-float";
    waFloat.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.038 3.284l-.542 2.317 2.35-.542c.958.551 1.945.854 3.007.855h.002c3.181 0 5.767-2.586 5.768-5.766 0-3.18-2.585-5.714-5.655-5.714zm3.846 8.851c-.167.467-.966.905-1.323.959-.343.05-.788.076-1.282-.088-.317-.104-.733-.272-1.248-.495-2.204-.951-3.626-3.197-3.737-3.344-.111-.147-.905-1.206-.905-2.301 0-1.095.571-1.631.774-1.854.203-.223.444-.279.593-.279.15 0 .299.001.431.007.135.006.313-.05.49.38.181.442.617 1.503.671 1.613.053.111.088.239.016.383-.074.145-.111.235-.221.362-.112.126-.235.281-.336.376-.112.103-.229.215-.098.441.131.226.581.959 1.248 1.554.858.766 1.583 1.004 1.808 1.117.226.113.359.094.493-.06.134-.155.571-.664.722-.89.151-.226.302-.189.509-.113.208.076 1.323.624 1.549.738.226.113.376.17.432.264.056.094.056.546-.111 1.012z"/>
      </svg>
    `;
    // Add styles for floating button if not in CSS
    const style = document.createElement("style");
    style.textContent = `
      .wa-float {
        position: fixed;
        bottom: 24px;
        right: 24px;
        background-color: #22c55e;
        color: white;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 999;
        transition: transform 0.3s ease;
      }
      .wa-float:hover { transform: scale(1.1); }
      @media (max-width: 768px) {
        .wa-float { width: 50px; height: 50px; bottom: 16px; right: 16px; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(waFloat);
  }

})();
