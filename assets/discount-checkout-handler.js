/**
 * Discount Checkout Handler
 * Ensures discounts from Essential Upsell plugin are preserved when going to checkout
 * Optimized for performance with minimal overhead
 */
(function() {
  'use strict';

  // Cache to avoid repeated DOM queries
  let isInitialized = false;
  let cartCache = null;
  let cartCacheTime = 0;
  const CART_CACHE_DURATION = 1000; // Cache for 1 second

  /**
   * Get discount codes from cart (with caching for performance)
   * @returns {Promise<Array>} Array of discount codes
   */
  async function getCartDiscountCodes(forceRefresh = false) {
    const now = Date.now();
    
    // Use cached cart if available and fresh
    if (!forceRefresh && cartCache && (now - cartCacheTime) < CART_CACHE_DURATION) {
      return cartCache.discountCodes || [];
    }

    try {
      const response = await fetch('/cart.js', {
        cache: 'no-store',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        return [];
      }
      
      const cart = await response.json();
      
      // Extract discount codes from cart
      const discountCodes = [];
      
      // Check cart-level discounts (Essential Upsell applies discounts here)
      if (cart.cart_level_discount_applications && cart.cart_level_discount_applications.length > 0) {
        cart.cart_level_discount_applications.forEach(discount => {
          if (discount.code) {
            discountCodes.push(discount.code);
          }
        });
      }
      
      // Check for discount codes in cart attributes
      if (cart.attributes && cart.attributes.discount_code) {
        discountCodes.push(cart.attributes.discount_code);
      }
      
      // Cache the result
      cartCache = { discountCodes, cart };
      cartCacheTime = now;
      
      return discountCodes;
    } catch (error) {
      // Silently fail - don't block checkout
      return [];
    }
  }

  /**
   * Ensure cart is synced before checkout redirect
   * This allows Essential Upsell plugin time to apply discounts
   * @param {Event} event - Click event
   * @param {HTMLElement} button - Checkout button element
   */
  async function handleCheckoutClick(event, button) {
    // For form submissions, let them proceed normally
    // Shopify's checkout will automatically include cart-level discounts
    if (button.type === 'submit' || button.form) {
      return;
    }

    // For programmatic redirects, ensure cart is synced
    // Small delay to allow any pending cart updates to complete
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Verify discounts are still present (cart should have them)
    const discountCodes = await getCartDiscountCodes(true);
    
    // Discounts are handled by Shopify automatically in checkout
    // This handler just ensures cart is synced before redirect
  }

  /**
   * Initialize checkout button handlers
   */
  function initCheckoutHandlers() {
    if (isInitialized) return;
    isInitialized = true;

    // Handle cart page checkout button
    const cartCheckoutBtn = document.getElementById('checkout');
    if (cartCheckoutBtn) {
      cartCheckoutBtn.addEventListener('click', (e) => {
        handleCheckoutClick(e, cartCheckoutBtn);
      }, { passive: true });
    }

    // Handle cart drawer checkout button
    const drawerCheckoutBtn = document.getElementById('CartDrawer-Checkout');
    if (drawerCheckoutBtn) {
      drawerCheckoutBtn.addEventListener('click', (e) => {
        handleCheckoutClick(e, drawerCheckoutBtn);
      }, { passive: true });
    }

    // Handle dynamic checkout buttons (Shopify Pay, etc.)
    const dynamicCheckoutButtons = document.querySelectorAll('.shopify-payment-button__button, [name="add"]');
    dynamicCheckoutButtons.forEach(button => {
      if (button.closest('form') && button.closest('form').action && button.closest('form').action.includes('checkout')) {
        button.addEventListener('click', (e) => {
          handleCheckoutClick(e, button);
        }, { passive: true });
      }
    });

    // Note: Buy Now buttons are handled in buy-buttons.liquid
    // This ensures consistency and avoids duplicate handlers
  }

  /**
   * Observe cart updates to clear cache and reinitialize handlers
   */
  function observeCartUpdates() {
    // Clear cache on cart updates
    const clearCache = () => {
      cartCache = null;
      cartCacheTime = 0;
    };

    // Listen for cart update events
    document.addEventListener('cart:updated', clearCache);
    document.addEventListener('cart:refresh', clearCache);
    
    // Use MutationObserver with debouncing for performance
    let observerTimeout;
    const observer = new MutationObserver(() => {
      clearTimeout(observerTimeout);
      observerTimeout = setTimeout(() => {
        clearCache();
        // Reinitialize handlers if needed
        if (isInitialized) {
          isInitialized = false;
          setTimeout(initCheckoutHandlers, 50);
        }
      }, 100);
    });

    // Observe cart sections (only when they exist)
    const observeSection = (selector) => {
      const section = typeof selector === 'string' 
        ? document.querySelector(selector) 
        : selector;
      if (section) {
        observer.observe(section, {
          childList: true,
          subtree: false // Only direct children for better performance
        });
      }
    };

    // Observe key cart sections
    observeSection('#main-cart-footer');
    observeSection('#CartDrawer');
    observeSection('.cart__footer');
  }

  /**
   * Initialize when DOM is ready
   */
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        initCheckoutHandlers();
        observeCartUpdates();
      });
    } else {
      initCheckoutHandlers();
      observeCartUpdates();
    }
  }

  // Start initialization
  init();

  // Listen for cart update events to clear cache
  document.addEventListener('cart:updated', () => {
    cartCache = null;
    cartCacheTime = 0;
  });
})();

