(function () {
  'use strict';
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // FAQ: nur ein <details> offen
  var items = document.querySelectorAll('.faq-item');
  items.forEach(function (el) {
    el.addEventListener('toggle', function () {
      if (el.open) items.forEach(function (o) { if (o !== el) o.open = false; });
    });
  });
})();
