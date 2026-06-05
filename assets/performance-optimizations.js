// Performance Optimizations JavaScript

// Debounced resize handler for better performance
class PerformanceOptimizer {
  constructor() {
    this.resizeObserver = null;
    this.intersectionObserver = null;
    this.init();
  }

  init() {
    this.setupLazyLoading();
    this.setupImageOptimization();
    this.setupScrollOptimization();
    this.setupAnimationOptimization();
    this.setupFormOptimization();
    this.setupCacheOptimization();
  }

  // Lazy loading implementation
  setupLazyLoading() {
    if ('IntersectionObserver' in window) {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const element = entry.target;
            
            // Lazy load images
            if (element.dataset.src) {
              element.src = element.dataset.src;
              element.removeAttribute('data-src');
            }
            
            // Lazy load CSS
            if (element.dataset.css) {
              const link = document.createElement('link');
              link.rel = 'stylesheet';
              link.href = element.dataset.css;
              document.head.appendChild(link);
              element.removeAttribute('data-css');
            }
            
            // Lazy load JavaScript
            if (element.dataset.js) {
              const script = document.createElement('script');
              script.src = element.dataset.js;
              script.defer = true;
              document.head.appendChild(script);
              element.removeAttribute('data-js');
            }
            
            this.intersectionObserver.unobserve(element);
          }
        });
      }, {
        rootMargin: '50px 0px',
        threshold: 0.1
      });

      // Observe lazy load elements
      document.querySelectorAll('[data-src], [data-css], [data-js]').forEach(el => {
        this.intersectionObserver.observe(el);
      });
    }
  }

  // Image optimization
  setupImageOptimization() {
    // Preload critical images
    const criticalImages = document.querySelectorAll('.critical-image');
    criticalImages.forEach(img => {
      if (img.dataset.src) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = img.dataset.src;
        document.head.appendChild(link);
      }
    });

    // Optimize image loading
    const images = document.querySelectorAll('img[loading="lazy"]');
    images.forEach(img => {
      img.addEventListener('load', () => {
        img.style.willChange = 'auto';
      }, { once: true });
    });
  }

  // Scroll optimization
  setupScrollOptimization() {
    let ticking = false;
    
    const optimizedScroll = () => {
      // Update scroll-dependent elements
      this.updateScrollElements();
      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(optimizedScroll);
        ticking = true;
      }
    }, { passive: true });
  }

  updateScrollElements() {
    const scrollY = window.pageYOffset;
    
    // Optimize header on scroll
    const header = document.querySelector('.header');
    if (header) {
      if (scrollY > 100) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }

    // Optimize animations based on scroll position
    const animatedElements = document.querySelectorAll('.animate-on-scroll');
    animatedElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        el.style.willChange = 'transform, opacity';
        el.classList.add('in-view');
      } else {
        el.style.willChange = 'auto';
        el.classList.remove('in-view');
      }
    });
  }

  // Animation optimization
  setupAnimationOptimization() {
    // Optimize hover animations
    const hoverElements = document.querySelectorAll('.animate--hover-vertical-lift');
    hoverElements.forEach(el => {
      el.addEventListener('mouseenter', () => {
        el.style.willChange = 'transform';
      });
      
      el.addEventListener('mouseleave', () => {
        setTimeout(() => {
          el.style.willChange = 'auto';
        }, 300);
      });
    });

    // Optimize CSS animations
    const animatedElements = document.querySelectorAll('[class*="animate"]');
    animatedElements.forEach(el => {
      el.addEventListener('animationstart', () => {
        el.style.willChange = 'transform, opacity';
      });
      
      el.addEventListener('animationend', () => {
        el.style.willChange = 'auto';
      });
    });
  }

  // Form optimization
  setupFormOptimization() {
    // Debounce only search/text inputs, not quantity selectors or cart inputs
    const inputs = document.querySelectorAll('input[type="search"], input[type="text"][name="q"]');
    inputs.forEach(input => {
      let timeout;
      input.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          this.validateInput(input);
        }, 300);
      });
    });
  }

  validateInput(input) {
    // Add input validation logic here
    if (input.checkValidity()) {
      input.classList.remove('error');
      input.classList.add('valid');
    } else {
      input.classList.remove('valid');
      input.classList.add('error');
    }
  }

  updateQuantity(input) {
    // Optimize quantity updates
    const value = input.querySelector('input').value;
    if (value && value > 0) {
      // Trigger cart update with debouncing
      this.debouncedCartUpdate(input);
    }
  }

  // Cache optimization
  setupCacheOptimization() {
    // Cache frequently accessed DOM elements
    this.cache = {
      header: document.querySelector('.header'),
      cartDrawer: document.querySelector('cart-drawer'),
      productForms: document.querySelectorAll('product-form'),
      quantityInputs: document.querySelectorAll('quantity-input')
    };

    // Preload critical resources
    this.preloadCriticalResources();
  }

  preloadCriticalResources() {
    const criticalCSS = [
      'base.css',
      'component-cart.css',
      'component-product-form.css'
    ];

    criticalCSS.forEach(css => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'style';
      link.href = `/assets/${css}`;
      document.head.appendChild(link);
    });
  }

  // Utility functions
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  // Debounced cart update
  debouncedCartUpdate = this.debounce((input) => {
    // Implement cart update logic
    const event = new CustomEvent('cart:update', {
      detail: { input }
    });
    document.dispatchEvent(event);
  }, 500);

  // Performance monitoring
  measurePerformance(name, fn) {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    console.log(`${name} took ${end - start} milliseconds`);
    return result;
  }

  // Memory cleanup
  cleanup() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }
}

// Enhanced cart performance
class CartPerformanceEnhanced extends CartPerformance {
  static optimizeCartDrawer() {
    const cartDrawer = document.querySelector('cart-drawer');
    if (cartDrawer) {
      // Optimize cart drawer animations
      cartDrawer.style.contain = 'layout style';
      
      // Add performance hints
      const cartItems = cartDrawer.querySelectorAll('.cart-item');
      cartItems.forEach(item => {
        item.style.contain = 'layout style';
      });
    }
  }

  static optimizeProductForm() {
    const productForms = document.querySelectorAll('product-form');
    productForms.forEach(form => {
      form.style.contain = 'layout style';
      
      // Optimize submit button
      const submitButton = form.querySelector('[type="submit"]');
      if (submitButton) {
        submitButton.addEventListener('click', () => {
          submitButton.style.willChange = 'transform, opacity';
          setTimeout(() => {
            submitButton.style.willChange = 'auto';
          }, 1000);
        });
      }
    });
  }
}

// Initialize performance optimizations
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new PerformanceOptimizer();
    CartPerformanceEnhanced.optimizeCartDrawer();
    CartPerformanceEnhanced.optimizeProductForm();
  });
} else {
  new PerformanceOptimizer();
  CartPerformanceEnhanced.optimizeCartDrawer();
  CartPerformanceEnhanced.optimizeProductForm();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PerformanceOptimizer, CartPerformanceEnhanced };
}

// Performance monitoring
if ('PerformanceObserver' in window) {
  const observer = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      if (entry.entryType === 'largest-contentful-paint') {
        console.log('LCP:', entry.startTime);
      }
      if (entry.entryType === 'first-input') {
        console.log('FID:', entry.processingStart - entry.startTime);
      }
      if (entry.entryType === 'layout-shift') {
        console.log('CLS:', entry.value);
      }
    });
  });
  
  observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] });
}

