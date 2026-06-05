/*
 * Dawbu footer enhancements:
 *  - Mobile collapsibles for link-list blocks (tap heading to expand)
 *  - Smooth open/close, chevron rotation, ARIA wiring
 *  - Auto-collapses on resize back to desktop
 */
(function () {
  'use strict';
  var MOBILE_QUERY = '(max-width: 749px)';

  function isMobile() { return window.matchMedia(MOBILE_QUERY).matches; }

  function initBlock(block) {
    if (block.__dbInit) return;
    block.__dbInit = true;
    var heading = block.querySelector('.footer-block__heading');
    var content = block.querySelector('.footer-block__details-content');
    if (!heading || !content) return;

    heading.classList.add('footer-block__heading--toggle');
    heading.setAttribute('role', 'button');
    heading.setAttribute('tabindex', '0');
    heading.setAttribute('aria-expanded', 'false');

    function toggle(e) {
      if (!isMobile()) return; // desktop: never collapse
      e.preventDefault();
      var open = block.classList.toggle('is-open');
      heading.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    heading.addEventListener('click', toggle);
    heading.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') toggle(e);
    });
  }

  function applyState() {
    var mobile = isMobile();
    document.querySelectorAll('.footer-block--menu, .footer-block:has(.footer-block__details-content.list-unstyled)').forEach(function (block) {
      initBlock(block);
      if (!mobile) {
        block.classList.remove('is-open');
        var h = block.querySelector('.footer-block__heading');
        if (h) h.setAttribute('aria-expanded', 'true');
      } else {
        var h = block.querySelector('.footer-block__heading');
        if (h) h.setAttribute('aria-expanded', block.classList.contains('is-open') ? 'true' : 'false');
      }
    });
  }

  function boot() { applyState(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.addEventListener('resize', (function () {
    var t; return function () { clearTimeout(t); t = setTimeout(applyState, 150); };
  })());
  document.addEventListener('shopify:section:load', boot);
})();
