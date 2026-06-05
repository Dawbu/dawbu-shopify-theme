/*
 * Dawbu quantity chips controller.
 * For every [data-dqc] block, clicking a chip or typing in the custom input
 * finds the related quantity input and updates it, dispatching input+change
 * so the existing cart/qty-sync code picks the value up.
 */
(function () {
  'use strict';

  function findTargetInput(dqc) {
    var explicit = dqc.getAttribute('data-dqc-target');
    if (explicit) {
      var byId = document.getElementById(explicit);
      if (byId) return byId;
    }
    // Look forward in DOM
    var card = dqc.closest('.card-wrapper, .card, product-info, .product-form, form, .price-atc');
    if (card) {
      var input = card.querySelector('input[name="quantity"]:not([type="hidden"])');
      if (input) return input;
      var hidden = card.querySelector('input[name="quantity"]');
      if (hidden) return hidden;
    }
    return null;
  }

  function setQty(dqc, qty, source) {
    qty = Math.max(1, Math.min(20, parseInt(qty, 10) || 1));
    var input = findTargetInput(dqc);
    if (input) {
      // Raise the underlying input's max so it doesn't silently clamp our value
      // (some variants ship with quantity_rule.max < 20)
      var currentMax = parseInt(input.getAttribute('max') || '0', 10);
      if (!currentMax || currentMax < 20) {
        input.setAttribute('max', '20');
        input.removeAttribute('data-max');
      }
      input.value = qty;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Visual state: highlight matching chip
    var chips = dqc.querySelectorAll('.dqc__chip');
    chips.forEach(function (c) {
      var match = parseInt(c.getAttribute('data-qty'), 10) === qty;
      c.classList.toggle('is-active', match);
      c.setAttribute('aria-pressed', match ? 'true' : 'false');
    });
    // Custom input handling: only mutate when source !== 'typing'
    var custom = dqc.querySelector('.dqc__custom');
    if (custom && source === 'chip') {
      // A chip was clicked — clear the typed-in value (chip is the visual now)
      custom.value = '';
    }
    // When source === 'typing', leave the custom input alone — the user is typing in it
  }

  document.addEventListener('click', function (e) {
    var chip = e.target.closest && e.target.closest('.dqc__chip');
    if (!chip) return;
    var dqc = chip.closest('[data-dqc]');
    if (!dqc) return;
    setQty(dqc, parseInt(chip.getAttribute('data-qty'), 10), 'chip');
  });

  document.addEventListener('input', function (e) {
    var custom = e.target.closest && e.target.closest('.dqc__custom');
    if (!custom) return;
    var dqc = custom.closest('[data-dqc]');
    if (!dqc) return;
    var v = parseInt(custom.value, 10);
    if (!v || v < 1) return;
    if (v > 20) { custom.value = 20; v = 20; }
    setQty(dqc, v, 'typing');
  });

  // Initial: align chips to the current quantity input value when the page renders
  function init() {
    document.querySelectorAll('[data-dqc]').forEach(function (dqc) {
      if (dqc.__dqcInit) return;
      dqc.__dqcInit = true;
      var input = findTargetInput(dqc);
      if (input && input.value) {
        var v = parseInt(input.value, 10);
        if (v) setQty(dqc, v);
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('shopify:section:load', init);
})();
