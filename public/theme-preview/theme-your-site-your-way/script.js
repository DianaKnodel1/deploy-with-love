// HomeOfficeCareer Theme — Minimal Interactivity

// Mobile Nav Toggle
document.addEventListener("DOMContentLoaded", () => {
  const burger = document.getElementById("burger");
  const navLinks = document.getElementById("nav-links");
  if (burger && navLinks) {
    burger.addEventListener("click", () => navLinks.classList.toggle("is-open"));
    navLinks.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => navLinks.classList.remove("is-open")),
    );
  }

  // Footer year
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // FAQ accordion: nur eins offen
  const faqs = document.querySelectorAll(".faq-item");
  faqs.forEach((item) => {
    item.addEventListener("toggle", () => {
      if (item.open) {
        faqs.forEach((other) => {
          if (other !== item) other.removeAttribute("open");
        });
      }
    });
  });
});
