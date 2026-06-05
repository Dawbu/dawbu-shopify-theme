/**
 * Advanced animations and interactions for Explore by Theme section
 */

class ExploreByTheme {
  constructor() {
    this.cards = document.querySelectorAll('.lego-card');
    this.grid = document.querySelector('.explore-by-theme__grid');
    this.init();
  }

  init() {
    if (this.cards.length === 0) return;

    // Initialize card interactions
    this.setupCardInteractions();
    
    // Setup parallax effect on scroll
    this.setupParallaxEffect();
    
    // Setup magnetic cursor effect (desktop only)
    if (window.matchMedia('(hover: hover)').matches) {
      this.setupMagneticEffect();
    }

    // Setup staggered animation on load
    this.animateOnLoad();
  }

  setupCardInteractions() {
    this.cards.forEach((card, index) => {
      const inner = card.querySelector('.lego-card__inner');
      const link = card.querySelector('.lego-card__link');

      // Add ripple effect on click/tap
      link.addEventListener('click', (e) => {
        this.createRipple(e, card);
      });

      // Add tilt effect on mouse move (desktop)
      if (window.matchMedia('(hover: hover)').matches) {
        card.addEventListener('mousemove', (e) => {
          this.handleTilt(e, card, inner);
        });

        card.addEventListener('mouseleave', () => {
          this.resetTilt(card, inner);
        });
      }

      // Add bounce animation on touch (mobile)
      if ('ontouchstart' in window) {
        card.addEventListener('touchstart', () => {
          card.classList.add('lego-card--touching');
        });

        card.addEventListener('touchend', () => {
          setTimeout(() => {
            card.classList.remove('lego-card--touching');
          }, 200);
        });
      }
    });
  }

  createRipple(event, card) {
    const ripple = document.createElement('span');
    const rect = card.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    ripple.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      transform: scale(0);
      animation: ripple-animation 0.6s ease-out;
      pointer-events: none;
      z-index: 10;
    `;

    const inner = card.querySelector('.lego-card__inner');
    inner.appendChild(ripple);

    setTimeout(() => {
      ripple.remove();
    }, 600);
  }

  handleTilt(event, card, inner) {
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const rotateX = (y - centerY) / 10;
    const rotateY = (centerX - x) / 10;

    inner.style.transform = `
      translateY(-1rem) 
      rotateX(${rotateX}deg) 
      rotateY(${rotateY}deg) 
      scale(1.05)
    `;
  }

  resetTilt(card, inner) {
    inner.style.transform = '';
  }

  setupParallaxEffect() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const card = entry.target;
          const image = card.querySelector('.lego-card__image');
          
          if (image) {
            window.addEventListener('scroll', () => {
              this.handleParallax(card, image);
            }, { passive: true });
          }
        }
      });
    }, observerOptions);

    this.cards.forEach(card => observer.observe(card));
  }

  handleParallax(card, image) {
    const rect = card.getBoundingClientRect();
    const scrolled = window.pageYOffset;
    const rate = scrolled * 0.1;
    
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      image.style.transform = `translateY(${rate}px) scale(1.15)`;
    }
  }

  setupMagneticEffect() {
    this.cards.forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        
        const distance = Math.sqrt(x * x + y * y);
        const maxDistance = Math.max(rect.width, rect.height) / 2;
        
        if (distance < maxDistance) {
          const force = (maxDistance - distance) / maxDistance;
          const moveX = x * force * 0.1;
          const moveY = y * force * 0.1;
          
          card.style.transform = `translate(${moveX}px, ${moveY}px)`;
        }
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }

  animateOnLoad() {
    // Check if cards are already visible
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.classList.add('lego-card--loaded');
          }, index * 100);
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1
    });

    this.cards.forEach(card => observer.observe(card));
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ExploreByTheme();
  });
} else {
  new ExploreByTheme();
}

// Re-initialize on section load (for theme editor)
if (Shopify && Shopify.designMode) {
  document.addEventListener('shopify:section:load', () => {
    new ExploreByTheme();
  });
}

// CSS animations are now in section-explore-by-theme.css

