if (!customElements.get('product-form')) {
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      constructor() {
        super();

        this.form = this.querySelector('form');
        this.variantIdInput.disabled = false;
        this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
        this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        this.submitButton = this.querySelector('[type="submit"]');
        this.submitButtonText = this.submitButton.querySelector('span');

        if (document.querySelector('cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');

        this.hideErrors = this.dataset.hideErrors === 'true';
      }

      onSubmitHandler(evt) {
        evt.preventDefault();
        if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

        this.handleErrorMessage();

        this.submitButton.setAttribute('aria-disabled', true);
        this.submitButton.classList.add('loading');
        this.querySelector('.loading__spinner').classList.remove('hidden');

        // Check if gift wrap is selected
        // Search in both the form and the product-form element (checkbox might be in either)
        const giftWrapCheckbox = this.form.querySelector('.gift-wrap-checkbox-input') 
          || this.querySelector('.gift-wrap-checkbox-input')
          || document.querySelector(`#gift-wrap-checkbox-${this.dataset.sectionId}`);
        
        const giftWrapVariantId = giftWrapCheckbox && giftWrapCheckbox.checked 
          ? giftWrapCheckbox.getAttribute('data-gift-wrap-variant-id') 
          : null;
        
        const variantId = this.variantIdInput.value;
        const quantity = this.form.querySelector('[name="quantity"]') 
          ? parseInt(this.form.querySelector('[name="quantity"]').value) || 1 
          : 1;

        // Debug logging
        if (giftWrapCheckbox) {
          console.log('Gift wrap checkbox found:', {
            checked: giftWrapCheckbox.checked,
            variantId: giftWrapVariantId
          });
        } else {
          console.log('Gift wrap checkbox not found');
        }

        // If gift wrap is selected, use JSON API to add multiple items
        if (giftWrapVariantId) {
          console.log('Adding items to cart:', { mainProduct: variantId, giftWrap: giftWrapVariantId });
          const items = [
            {
              id: parseInt(variantId),
              quantity: quantity
            },
            {
              id: parseInt(giftWrapVariantId),
              quantity: 1
            }
          ];

          if (this.cart) {
            this.cart.setActiveElement(document.activeElement);
          }

          fetch(`${routes.cart_add_url}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ items: items })
          })
          .then(async (response) => {
            // Read response as text first to handle different response types
            const responseText = await response.text();
            const contentType = response.headers.get('content-type') || '';
            let responseData;
            
            // Check if response is JSON
            if (contentType.includes('application/json') || (responseText.trim().startsWith('{') || responseText.trim().startsWith('['))) {
              try {
                responseData = JSON.parse(responseText);
              } catch (e) {
                console.error('Failed to parse JSON response:', e, responseText);
                throw new Error('Invalid response from server. Please try again.');
              }
            } else {
              console.error('Non-JSON response:', responseText);
              throw new Error('Failed to add items to cart. Please try again.');
            }
            
            console.log('Cart add response:', responseData);
            
            // Check for errors
            if (!response.ok || (responseData && responseData.status && responseData.status >= 400)) {
              const errorMessage = (responseData && (responseData.description || responseData.message || responseData.error)) || 'Failed to add items to cart';
              throw new Error(errorMessage);
            }
            
            if (responseData && responseData.errors && Array.isArray(responseData.errors) && responseData.errors.length > 0) {
              throw new Error(responseData.errors.join(', '));
            }
            
            // Success - continue with cart update
            return responseData;
          })
          .then(async (response) => {
            // Response is already validated above, so if we get here it's successful
            if (!this.cart) {
              // Try to find cart drawer again in case it wasn't loaded initially
              this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
              if (!this.cart) {
                window.location = window.routes.cart_url;
                return;
              }
            }

            // Fetch latest cart data to ensure we have the most up-to-date information
            // This ensures the cart drawer updates properly
            let cartData = response;
            try {
              const cartResponse = await fetch(`${routes.cart_url}.js`);
              if (cartResponse.ok) {
                cartData = await cartResponse.json();
              }
            } catch (e) {
              console.warn('Could not fetch latest cart data:', e);
            }

            const startMarker = CartPerformance.createStartingMarker('add:wait-for-subscribers');
            if (!this.error) {
              // Publish cart update event - this will trigger onCartUpdate() in cart.js
              // which will fetch and update the cart drawer sections properly
              publish(PUB_SUB_EVENTS.cartUpdate, {
                source: 'product-form',
                productVariantId: variantId,
                cartData: cartData,
              }).then(() => {
                CartPerformance.measureFromMarker('add:wait-for-subscribers', startMarker);
              });
            }
            this.error = false;
            
            const quickAddModal = this.closest('quick-add-modal');
            if (quickAddModal) {
              document.body.addEventListener(
                'modalClosed',
                () => {
                  setTimeout(() => {
                    CartPerformance.measure("add:paint-updated-sections", () => {
                      // Wait for cart drawer to finish updating, then open it
                      setTimeout(() => {
                        if (this.cart && typeof this.cart.open === 'function') {
                          this.cart.open();
                        }
                      }, 300);
                    });
                  });
                },
                { once: true }
              );
              quickAddModal.hide(true);
            } else {
              CartPerformance.measure("add:paint-updated-sections", () => {
                // Wait for cart drawer to finish updating (onCartUpdate is async)
                // then open it
                setTimeout(() => {
                  if (this.cart && typeof this.cart.open === 'function') {
                    this.cart.open();
                  }
                }, 300);
              });
            }
          })
          .catch((e) => {
            console.error(e);
          })
          .finally(() => {
            this.submitButton.classList.remove('loading');
            if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
            if (!this.error) this.submitButton.removeAttribute('aria-disabled');
            this.querySelector('.loading__spinner').classList.add('hidden');

            CartPerformance.measureFromEvent("add:user-action", evt);
          });
          return;
        }

        // Original form submission for single product
        const config = fetchConfig('javascript');
        config.headers['X-Requested-With'] = 'XMLHttpRequest';
        delete config.headers['Content-Type'];

        const formData = new FormData(this.form);
        if (this.cart) {
          formData.append(
            'sections',
            this.cart.getSectionsToRender().map((section) => section.id)
          );
          formData.append('sections_url', window.location.pathname);
          this.cart.setActiveElement(document.activeElement);
        }
        config.body = formData;

        fetch(`${routes.cart_add_url}`, config)
          .then((response) => response.json())
          .then((response) => {
            if (response.status) {
              publish(PUB_SUB_EVENTS.cartError, {
                source: 'product-form',
                productVariantId: formData.get('id'),
                errors: response.errors || response.description,
                message: response.message,
              });
              this.handleErrorMessage(response.description);

              const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
              if (!soldOutMessage) return;
              this.submitButton.setAttribute('aria-disabled', true);
              this.submitButtonText.classList.add('hidden');
              soldOutMessage.classList.remove('hidden');
              this.error = true;
              return;
            } else if (!this.cart) {
              // Try to find cart drawer again in case it wasn't loaded initially
              this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
              if (!this.cart) {
                window.location = window.routes.cart_url;
                return;
              }
            }

            const startMarker = CartPerformance.createStartingMarker('add:wait-for-subscribers');
            if (!this.error)
              publish(PUB_SUB_EVENTS.cartUpdate, {
                source: 'product-form',
                productVariantId: formData.get('id'),
                cartData: response,
              }).then(() => {
                CartPerformance.measureFromMarker('add:wait-for-subscribers', startMarker);
              });
            this.error = false;
            const quickAddModal = this.closest('quick-add-modal');
            if (quickAddModal) {
              document.body.addEventListener(
                'modalClosed',
                () => {
                  setTimeout(() => {
                    CartPerformance.measure("add:paint-updated-sections", () => {
                      this.cart.renderContents(response);
                    });
                  });
                },
                { once: true }
              );
              quickAddModal.hide(true);
            } else {
              CartPerformance.measure("add:paint-updated-sections", () => {
                this.cart.renderContents(response);
              });
            }
          })
          .catch((e) => {
            console.error(e);
          })
          .finally(() => {
            this.submitButton.classList.remove('loading');
            if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
            if (!this.error) this.submitButton.removeAttribute('aria-disabled');
            this.querySelector('.loading__spinner').classList.add('hidden');

            CartPerformance.measureFromEvent("add:user-action", evt);
          });
      }

      handleErrorMessage(errorMessage = false) {
        if (this.hideErrors) return;

        this.errorMessageWrapper =
          this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
        if (!this.errorMessageWrapper) return;
        this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

        this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);

        if (errorMessage) {
          this.errorMessage.textContent = errorMessage;
        }
      }

      toggleSubmitButton(disable = true, text) {
        if (disable) {
          this.submitButton.setAttribute('disabled', 'disabled');
          if (text) this.submitButtonText.textContent = text;
        } else {
          this.submitButton.removeAttribute('disabled');
          this.submitButtonText.textContent = window.variantStrings.addToCart;
        }
      }

      get variantIdInput() {
        return this.form.querySelector('[name=id]');
      }
    }
  );
}
