class QuantitySelector {
  constructor() {
    this.init();
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('.quantity-btn--plus')) {
        const selector = e.target.closest('.card__quantity-selector');
        // Skip if this is a collection page quantity selector (handled by QuantityInput custom element)
        if (selector && !selector.closest('.main-collection-product-grid, .collection-product-grid')) {
          this.incrementQuantityAndAddToCart(selector);
        }
      } else if (e.target.closest('.quantity-btn--minus')) {
        const selector = e.target.closest('.card__quantity-selector');
        // Skip if this is a collection page quantity selector (handled by QuantityInput custom element)
        if (selector && !selector.closest('.main-collection-product-grid, .collection-product-grid')) {
          this.decrementQuantityAndRemoveFromCart(selector);
        }
      }
    });
    
    // Add to cart button event listener
    document.addEventListener('click', (e) => {
      if (e.target.matches('.add-to-cart-btn') || e.target.closest('.add-to-cart-btn')) {
        const button = e.target.matches('.add-to-cart-btn') ? e.target : e.target.closest('.add-to-cart-btn');
        const selector = button.closest('.card__quantity-selector');
        // Skip if this is a collection page quantity selector (handled by QuantityInput custom element)
        if (selector && !selector.closest('.main-collection-product-grid, .collection-product-grid')) {
          this.addToCart(selector);
        }
      }
      
      // Add to cart drawer button event listener
      if (e.target.matches('.add-to-cart-drawer-btn') || e.target.closest('.add-to-cart-drawer-btn')) {
        const button = e.target.matches('.add-to-cart-drawer-btn') ? e.target : e.target.closest('.add-to-cart-drawer-btn');
        this.addToCartDrawer(button);
      }
    });
  }

  async incrementQuantityAndAddToCart(selector) {
    const input = selector.querySelector('.quantity-input');
    const plusBtn = selector.querySelector('.quantity-btn--plus');
    const currentValue = parseInt(input.value) || 0;
    const maxValue = parseInt(input.getAttribute('max')) || 99;
    const variantId = plusBtn.getAttribute('data-variant-id');
    
    if (currentValue < maxValue && variantId) {
      // Disable button during request
      plusBtn.disabled = true;
      
      try {
        const response = await fetch(window.Shopify.routes.root + 'cart/add.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [{
              id: variantId,
              quantity: 1
            }]
          })
        });
        
        if (response.ok) {
          input.value = currentValue + 1;
          this.updateCartCount();
          
          // Trigger cart update event to refresh cart drawer
          if (window.publish && window.PUB_SUB_EVENTS) {
            fetch(window.Shopify.routes.root + 'cart.js')
              .then(response => response.json())
              .then(cartData => {
                window.publish(window.PUB_SUB_EVENTS.cartUpdate, {
                  source: 'quantity-selector',
                  cartData: cartData
                });
              })
              .catch(() => {});
          }
        }
      } catch (error) {
        console.error('Error adding to cart:', error);
      } finally {
        plusBtn.disabled = false;
      }
    }
  }

  async decrementQuantityAndRemoveFromCart(selector) {
    const input = selector.querySelector('.quantity-input');
    const minusBtn = selector.querySelector('.quantity-btn--minus');
    const currentValue = parseInt(input.value) || 0;
    const minValue = parseInt(input.getAttribute('min')) || 0;
    const variantId = minusBtn.closest('.card__quantity-selector').querySelector('.quantity-btn--plus').getAttribute('data-variant-id');
    
    if (currentValue > minValue && variantId) {
      // Disable button during request
      minusBtn.disabled = true;
      
      try {
        const response = await fetch(window.Shopify.routes.root + 'cart/change.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: variantId,
            quantity: currentValue - 1
          })
        });
        
        if (response.ok) {
          input.value = currentValue - 1;
          this.updateCartCount();
        }
      } catch (error) {
        console.error('Error updating cart:', error);
      } finally {
        minusBtn.disabled = false;
      }
    }
  }



  async addToCart(selector) {
    const input = selector.querySelector('.quantity-input');
    const addToCartBtn = selector.querySelector('.add-to-cart-btn');
    const quantity = parseInt(input.value) || 0;
    const variantId = addToCartBtn.getAttribute('data-variant-id');
    
    if (quantity <= 0 || !variantId) return;
    
    // Disable button during request
    addToCartBtn.disabled = true;
    const originalText = addToCartBtn.textContent;
    addToCartBtn.textContent = 'Adding...';
    
    try {
      const formData = {
        'items': [{
          'id': variantId,
          'quantity': quantity
        }]
      };
      
      const response = await fetch(window.Shopify.routes.root + 'cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Reset quantity to 0
        input.value = 0;
        this.updateAddToCartButton(selector);
        
        // Show success feedback
        addToCartBtn.textContent = 'Added!';
        addToCartBtn.style.background = '#27ae60';
        
        setTimeout(() => {
          addToCartBtn.textContent = window.cartStrings?.addToCart || 'Add to Cart';
          addToCartBtn.style.background = '';
        }, 2000);
        
        // Update cart drawer properly using theme's system
        const cartDrawer = document.querySelector('cart-drawer') || document.querySelector('cart-notification');
        const cartDrawerItems = document.querySelector('cart-drawer-items');
        
        // Trigger cart update event which will refresh the cart drawer
        if (window.publish && window.PUB_SUB_EVENTS) {
          // Fetch cart data first, then publish event
          fetch(window.Shopify.routes.root + 'cart.js')
            .then(response => response.json())
            .then(cartData => {
              // Publish cart update event - this will trigger onCartUpdate() in cart.js
              window.publish(window.PUB_SUB_EVENTS.cartUpdate, {
                source: 'quantity-selector',
                cartData: cartData
              });
            })
            .catch(error => {
              console.error('Error fetching cart:', error);
              // Still trigger update even if cart fetch fails
              if (window.publish && window.PUB_SUB_EVENTS) {
                window.publish(window.PUB_SUB_EVENTS.cartUpdate, {
                  source: 'quantity-selector',
                  cartData: result
                });
              }
            });
        } else {
          // Fallback: trigger custom event
          document.dispatchEvent(new CustomEvent('cart:updated'));
        }
        
        // Update cart count
        this.updateCartCount();
        
        // Trigger cart drawer open if it exists
        if (cartDrawer && typeof cartDrawer.open === 'function') {
          cartDrawer.open();
        }
        
      } else {
        throw new Error(window.cartStrings?.error || 'Failed to add to cart');
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      addToCartBtn.textContent = window.cartStrings?.error || 'Error - Try Again';
      addToCartBtn.style.background = '#e74c3c';
      
      setTimeout(() => {
        addToCartBtn.textContent = originalText;
        addToCartBtn.style.background = '';
        addToCartBtn.disabled = false;
      }, 3000);
    }
  }

  async updateCartCount() {
    try {
      const response = await fetch(window.Shopify.routes.root + 'cart.js');
      if (response.ok) {
        const cart = await response.json();
        
        // Update cart count in header
        const cartCountElements = document.querySelectorAll('.cart-count-bubble span, [data-cart-count]');
        cartCountElements.forEach(element => {
          element.textContent = cart.item_count;
        });
        
        // Update cart count bubble visibility
        const cartBubbles = document.querySelectorAll('.cart-count-bubble');
        cartBubbles.forEach(bubble => {
          if (cart.item_count > 0) {
            bubble.style.display = 'flex';
          } else {
            bubble.style.display = 'none';
          }
        });
      }
    } catch (error) {
      console.error('Error updating cart count:', error);
    }
  }
  
  async addToCartDrawer(button) {
    const variantId = button.getAttribute('data-variant-id');
    
    if (!variantId) return;
    
    // Disable button during request
    button.disabled = true;
    const originalText = button.querySelector('span').textContent;
    button.querySelector('span').textContent = 'Adding...';
    
    try {
      const response = await fetch(window.Shopify.routes.root + 'cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [{
            id: variantId,
            quantity: 1
          }]
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Show success feedback
        button.querySelector('span').textContent = 'Added!';
        button.style.background = '#27ae60';
        
        setTimeout(() => {
          button.querySelector('span').textContent = originalText;
          button.style.background = '';
        }, 2000);
        
        // Update cart count
        this.updateCartCount();
        
        // Trigger cart update event to refresh cart drawer
        if (window.publish && window.PUB_SUB_EVENTS) {
          fetch(window.Shopify.routes.root + 'cart.js')
            .then(response => response.json())
            .then(cartData => {
              window.publish(window.PUB_SUB_EVENTS.cartUpdate, {
                source: 'quantity-selector',
                cartData: cartData
              });
            })
            .catch(() => {});
        }
        
        // Open drawer
        this.openCartDrawer();
      } else {
        throw new Error(window.cartStrings?.error || 'Failed to add to cart');
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      button.querySelector('span').textContent = 'Error - Try Again';
      button.style.background = '#e74c3c';
      
      setTimeout(() => {
        button.querySelector('span').textContent = originalText;
        button.style.background = '';
      }, 3000);
    } finally {
      button.disabled = false;
    }
  }
  
  updateCartCount() {
    // Update cart count if function exists
    if (typeof window.updateCartCount === 'function') {
      window.updateCartCount();
    }
  }
  
  openCartDrawer() {
    // Try to open cart drawer using common Shopify theme methods
    if (typeof window.openCartDrawer === 'function') {
      window.openCartDrawer();
    } else if (document.querySelector('[data-cart-drawer]')) {
      const cartDrawer = document.querySelector('[data-cart-drawer]');
      cartDrawer.classList.add('is-open');
    } else if (document.querySelector('.cart-drawer')) {
      const cartDrawer = document.querySelector('.cart-drawer');
      cartDrawer.classList.add('active');
    }
  }
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new QuantitySelector();
  });
} else {
  new QuantitySelector();
}