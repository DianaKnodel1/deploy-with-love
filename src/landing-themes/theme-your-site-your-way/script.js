/* ============ HomeOffice – script.js ============ */
(function () {
  "use strict";

  /* ── Year ── */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ── Hamburger / Mobile-Menu ── */
  var hamburger = document.getElementById("hamburger");
  var mobileMenu = document.getElementById("mobile-menu");

  function openMenu() {
    hamburger.classList.add("open");
    hamburger.setAttribute("aria-expanded", "true");
    mobileMenu.classList.add("open");
    mobileMenu.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
  }

  function closeMenu() {
    hamburger.classList.remove("open");
    hamburger.setAttribute("aria-expanded", "false");
    mobileMenu.classList.remove("open");
    mobileMenu.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
  }

  if (hamburger && mobileMenu) {
    hamburger.addEventListener("click", function () {
      if (mobileMenu.classList.contains("open")) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    /* Close on any mobile nav link click */
    var mobileLinks = mobileMenu.querySelectorAll(".mobile-nav-link, .mobile-cta");
    mobileLinks.forEach(function (link) {
      link.addEventListener("click", function () {
        closeMenu();
      });
    });

    /* Close on Escape */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && mobileMenu.classList.contains("open")) {
        closeMenu();
      }
    });

    /* Close when clicking outside */
    document.addEventListener("click", function (e) {
      if (
        mobileMenu.classList.contains("open") &&
        !mobileMenu.contains(e.target) &&
        !hamburger.contains(e.target)
      ) {
        closeMenu();
      }
    });
  }

  /* ── FAQ expand-all ── */
  var expandBtn = document.getElementById("faq-expand-all");
  if (expandBtn) {
    expandBtn.addEventListener("click", function () {
      var items = document.querySelectorAll(".faq-list details");
      var anyOpen = Array.prototype.some.call(items, function (d) {
        return !d.open;
      });
      items.forEach(function (d) {
        d.open = anyOpen;
      });
      expandBtn.textContent = anyOpen ? "Alle schließen ▴" : "Alle ansehen ▾";
    });
  }

  /* ── Smooth-scroll with header offset ── */
  document.addEventListener("click", function (e) {
    var link = e.target.closest('a[href^="#"]');
    if (!link) return;
    var hash = link.getAttribute("href");
    if (hash === "#") return;
    var target = document.querySelector(hash);
    if (!target) return;
    e.preventDefault();
    var header = document.querySelector(".navbar");
    var offset = header ? header.getBoundingClientRect().height : 0;
    var top = target.getBoundingClientRect().top + window.pageYOffset - offset - 8;
    window.scrollTo({ top: top, behavior: "smooth" });
    /* update URL without jump */
    history.pushState(null, "", hash);
  });
})();
