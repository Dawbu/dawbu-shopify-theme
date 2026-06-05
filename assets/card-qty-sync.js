/**
 * Product Card Quantity Synchronization
 * Hooks into Dawn's native cart events AND observes the drawer DOM
 * to keep collection page cards in sync with the cart at all times.
 */
(function () {
  if (window.CardQtySyncInitialized) return;

  // ─── Debounce helper ─────────────────────────────────────────────────────────
  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ─── Core Sync Function ──────────────────────────────────────────────────────
  window.updateAllCardState = function (cart) {
    if (!cart || !cart.items) return;

    document.querySelectorAll('.card__quantity-selector').forEach((selector) => {
      const variantId = selector.dataset.variantId;
      if (!variantId) return;

      const item = cart.items.find((i) => i.variant_id.toString() === variantId.toString());
      const qty = item ? item.quantity : 0;

      const quantityInput = selector.querySelector('.quantity__input');
      const hiddenQuantityInput = selector.querySelector('.product-form-quantity');
      const cardWrapper = selector.closest('.card-wrapper') || selector.closest('.card');
      const submitButton = selector.querySelector('.product-form__cart-submit');

      if (quantityInput) {
        const minQty = parseInt(quantityInput.dataset.min) || 1;
        const currentVal = parseInt(quantityInput.value);
        const targetVal = qty === 0 ? minQty : qty;

        if (currentVal !== targetVal) {
          quantityInput.value = targetVal;
          if (hiddenQuantityInput) hiddenQuantityInput.value = targetVal;
        }

        const qtyInputComponent = quantityInput.closest('quantity-input');
        if (qtyInputComponent && typeof qtyInputComponent.validateQtyRules === 'function') {
          qtyInputComponent.validateQtyRules();
        }
      }

      const isInCart = qty > 0;
      selector.classList.toggle('has-cart', isInCart);
      if (cardWrapper) cardWrapper.classList.toggle('has-cart', isInCart);

      if (submitButton && !isInCart) {
        submitButton.removeAttribute('aria-disabled');
        submitButton.removeAttribute('disabled');
        submitButton.classList.remove('loading');
        const spinner = selector.querySelector('.loading__spinner');
        if (spinner) spinner.classList.add('hidden');
        const buttonText = submitButton.querySelector('span');
        if (buttonText && buttonText.dataset.originalText) {
          buttonText.textContent = buttonText.dataset.originalText;
        }
      }
    });
  };

  // ─── Fetch cart and sync ─────────────────────────────────────────────────────
  const fetchAndSync = debounce(function () {
    fetch(window.routes.cart_url + '.js')
      .then((r) => r.json())
      .then(window.updateAllCardState)
      .catch(() => { });
  }, 300);

  // ─── Open Cart Drawer ────────────────────────────────────────────────────────
  function openCartDrawer() {
    const drawer = document.querySelector('cart-drawer');
    if (drawer && typeof drawer.open === 'function') {
      drawer.open();
    }
  }
  // ─── Global Cart Change Helper ───────────────────────────────────────────────
  window.updateCartQuantityGlobal = function (variantId, quantity) {
    const cartDrawerItems = document.querySelector('cart-drawer-items') || document.querySelector('cart-items');
    const sections = cartDrawerItems
      ? cartDrawerItems.getSectionsToRender().map((s) => s.section || s.id)
      : ['cart-drawer', 'cart-icon-bubble'];

    fetch(window.routes.cart_change_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        id: variantId.toString(),
        quantity,
        sections,
        sections_url: window.location.pathname,
      }),
    })
      .then((r) => r.json())
      .then((state) => {
        if (state.errors) throw new Error(state.errors);
        if (window.publish && window.PUB_SUB_EVENTS) {
          publish(PUB_SUB_EVENTS.cartUpdate, { source: 'card-qty-sync', cart: state, cartData: state });
        }
      })
      .catch((e) => {
        console.error('[card-qty-sync] Cart change failed:', e);
      });
  };

  // ─── Observe the cart drawer for DOM changes ─────────────────────────────────
  // This is the most reliable hook: whenever the drawer re-renders after a
  // quantity change (replaceWith / innerHTML swap), we fetch the fresh cart.
  function watchDrawer() {
    const drawerTarget = document.querySelector('#CartDrawer-CartItems') || document.querySelector('cart-drawer-items');
    if (!drawerTarget) return;

    const drawerObserver = new MutationObserver(debounce(() => {
      fetchAndSync();
    }, 400));

    drawerObserver.observe(drawerTarget, { childList: true, subtree: true, characterData: true });
  }

  // ─── Initialise ─────────────────────────────────────────────────────────────
  const initSync = () => {
    if (window.CardQtySyncInitialized) return;

    // PUB_SUB_EVENTS is a module-scoped global in Dawn — NOT on window.
    // Use typeof to detect it reliably regardless of how it's exposed.
    const _subscribe = window.subscribe || (typeof subscribe !== 'undefined' ? subscribe : null);
    const _events = window.PUB_SUB_EVENTS || (typeof PUB_SUB_EVENTS !== 'undefined' ? PUB_SUB_EVENTS : null);

    if (_subscribe && _events) {
      window.CardQtySyncInitialized = true;
      // Expose for debugging
      window.PUB_SUB_EVENTS = _events;

      try {
        // Hook 1: Dawn's PubSub event (fires on add-to-cart, cart-items changes)
        _subscribe(_events.cartUpdate, (event) => {
          const cart = event.cart || event.cartData;
          if (cart && cart.items) {
            window.updateAllCardState(cart);
          } else {
            fetchAndSync();
          }
        });
      } catch (e) {
        console.warn('[card-qty-sync] PubSub subscribe failed, falling back to DOM observer only.', e);
      }

      // Hook 2: Watch the drawer DOM — catches qty changes that don't fire PubSub
      watchDrawer();

      // Re-attach drawer watcher after the drawer itself re-renders
      // (cart-drawer-items gets replaceWith() which destroys the observer target)
      const drawerContainer = document.querySelector('#CartDrawer') || document.querySelector('cart-drawer');
      if (drawerContainer) {
        new MutationObserver(() => {
          watchDrawer();
        }).observe(drawerContainer, { childList: true, subtree: false });
      }

      // Initial sync on page load
      fetchAndSync();
    } else {
      setTimeout(initSync, 50);
    }
  };

  // ─── Product Card Quantity Input Changes ─────────────────────────────────────
  document.addEventListener('change', (event) => {
    const input = event.target.closest('.card__quantity-selector .quantity__input');
    if (!input) return;

    const selector = input.closest('.card__quantity-selector');
    if (!selector.classList.contains('has-cart')) return;

    const variantId = selector.dataset.variantId;
    const newQty = parseInt(input.value);
    if (!variantId || isNaN(newQty)) return;

    window.updateCartQuantityGlobal(variantId, newQty);
    openCartDrawer();
  });

  // ─── Add-to-Cart Form Submission Feedback ────────────────────────────────────
  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-type="add-to-cart-form"]');
    if (!form || !form.closest('.card__quantity-selector')) return;

    const selector = form.closest('.card__quantity-selector');
    selector.classList.add('has-cart');
    const cardWrapper = selector.closest('.card-wrapper') || selector.closest('.card');
    if (cardWrapper) cardWrapper.classList.add('has-cart');

    const submitButton = selector.querySelector('.product-form__cart-submit');
    if (submitButton) {
      const buttonText = submitButton.querySelector('span');
      if (buttonText && !buttonText.dataset.originalText) {
        buttonText.dataset.originalText = buttonText.textContent;
      }
    }

    // Open the drawer after a short delay to let the theme AJAX complete
    setTimeout(openCartDrawer, 600);
  });

  // ─── Visibility Sync ─────────────────────────────────────────────────────────
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchAndSync();
    }
  });

  // ─── Infinite Scroll / Filter Observer ──────────────────────────────────────
  const gridObserver = new MutationObserver(debounce((mutations) => {
    let hasNewCards = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (
          node.nodeType === 1 &&
          (node.querySelector('.card__quantity-selector') || node.classList.contains('card__quantity-selector'))
        ) {
          hasNewCards = true;
          break;
        }
      }
      if (hasNewCards) break;
    }
    if (hasNewCards) fetchAndSync();
  }, 300));

  const productGrid = document.getElementById('product-grid') || document.querySelector('.product-grid');
  gridObserver.observe(productGrid || document.body, { childList: true, subtree: true });

  // ─── Boot ────────────────────────────────────────────────────────────────────
  initSync();
})();
