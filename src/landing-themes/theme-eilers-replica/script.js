(function () {
  'use strict';
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // Service tabs (Eilers — Leistungen-Liste)
  var serviceItems = document.querySelectorAll('.service-item');
  serviceItems.forEach(function (item) {
    item.addEventListener('click', function () {
      serviceItems.forEach(function (i) { i.classList.remove('active'); });
      item.classList.add('active');
    });
  });
})();
