(function () {
  'use strict';
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  var t = document.getElementById('menuToggle');
  var n = document.getElementById('mobileNav');
  if (t && n) {
    t.addEventListener('click', function () {
      if (n.hasAttribute('hidden')) n.removeAttribute('hidden');
      else n.setAttribute('hidden', '');
    });
  }
})();
