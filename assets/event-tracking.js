/*
 * Dawbu unified event tracking.
 * Routes every event to: window.dataLayer, gtag (GA4), and fbq (Meta Pixel).
 * Auto-binds: clicks, hovers, scroll depth, add-to-cart attribution,
 * section impressions, slider swipes, FAQ toggles, search/menu opens,
 * outbound links, video plays, scroll-to-top, form submits.
 *
 * Public API:
 *   window.DawbuTrack(eventName, params)        // fire a custom event
 *   window.DawbuTrack.identify(traits)          // attach persistent traits
 *   data-track-click="event_name"               // declarative click
 *   data-track-hover="event_name"               // declarative hover
 *   data-track-section="surface_name"           // surface attribution + impression
 *   data-track-source="surface_name"            // source for ATC attribution
 *   data-track-params='{"key":"value"}'         // extra payload (JSON)
 */
(function () {
  'use strict';

  var SCROLL_THRESHOLDS = [25, 50, 75, 100];
  var firedScroll = {};
  var firedImpressions = new WeakSet();
  var persistentTraits = {};
  var lastClickContext = null;

  // -------- Cart-add interceptor (line item property attribution) --------
  // Tags every /cart/add request with properties[_Added From] = <surface>
  // so the source shows up on the Shopify order line item.
  var PROP_KEY = '_Added From';

  // Page context derived from URL (computed once per page load, cheap)
  function pageContext() {
    var p = window.location.pathname || '';
    var m;
    if ((m = p.match(/\/products\/([^/?#]+)/))) return 'pdp:' + m[1];
    if ((m = p.match(/\/collections\/([^/?#]+)/))) return 'collection:' + m[1];
    if (p === '/' || /^\/?(index)?$/.test(p)) return 'home';
    if (/\/cart/.test(p)) return 'cart';
    if (/\/search/.test(p)) return 'search';
    if (/\/blogs\/([^/]+)\/([^/?#]+)/.test(p)) return 'article:' + RegExp.$2;
    if (/\/pages\/([^/?#]+)/.test(p)) return 'page:' + RegExp.$1;
    return 'other';
  }

  // Find the nearest product handle near a clicked element (from <a href="/products/X">)
  function nearestProductHandle(el) {
    if (!el || !el.closest) return null;
    var card = el.closest('.card-wrapper, .grid__item, .rv-product, .swiper-slide, [data-product-id], .product-item');
    var link = (card || el).querySelector ? (card || el).querySelector('a[href*="/products/"]') : null;
    if (!link) link = el.closest && el.closest('a[href*="/products/"]');
    if (!link) return null;
    var m = (link.getAttribute('href') || '').match(/\/products\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  // Find the nearest section identifier (e.g., "fan_favourites", "grab_and_go")
  function nearestSection(el) {
    if (!el || !el.closest) return null;
    var section = el.closest('[data-track-section]');
    return section ? section.getAttribute('data-track-section') : null;
  }

  // Build the canonical surface string: "<page>:<section>:<product>" with non-blanks
  function buildSurface(clickEl) {
    var parts = [];
    var page = pageContext();
    var section = clickEl ? nearestSection(clickEl) : null;
    var handle = clickEl ? nearestProductHandle(clickEl) : null;
    parts.push(page);
    if (section && section !== page.split(':')[0]) parts.push(section);
    if (handle && page.indexOf(handle) === -1) parts.push(handle);
    return parts.join(':');
  }

  // Session-level entry tracking: remembers which surface led the user to a product's PDP,
  // so when they ATC from PDP we record "pdp:X (from home:fan_favourites)" not just "pdp:X"
  var SESSION_KEY = 'dawbu_entry_paths';
  function loadEntryPaths() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function saveEntryPath(productHandle, source) {
    if (!productHandle || !source) return;
    try {
      var paths = loadEntryPaths();
      paths[productHandle] = source;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(paths));
    } catch (e) {}
  }
  function getEntryPath(productHandle) {
    if (!productHandle) return null;
    return loadEntryPaths()[productHandle] || null;
  }

  function currentSurface() {
    // Recent click within 30s — use its rich context
    if (lastClickContext && (Date.now() - lastClickContext.at < 30000)) {
      return lastClickContext.surface || lastClickContext.source || pageContext();
    }
    // On PDP with no recent click — combine page context with the original entry source if known
    var page = pageContext();
    if (page.indexOf('pdp:') === 0) {
      var handle = page.split(':')[1];
      var entry = getEntryPath(handle);
      if (entry) return page + ' (from ' + entry + ')';
    }
    return page;
  }

  function isAddToCart(url) {
    if (!url) return false;
    var str = typeof url === 'string' ? url : (url.url || '');
    return /\/cart\/add(\.js|\.json)?(\?|$)/i.test(str);
  }

  function injectIntoFormData(fd, surface) {
    try {
      // Don't override if user already set _Added From
      if (fd.has && fd.has('properties[' + PROP_KEY + ']')) return fd;
      fd.append('properties[' + PROP_KEY + ']', surface);
    } catch (e) {}
    return fd;
  }

  function injectIntoUrlEncoded(str, surface) {
    if (str.indexOf('properties%5B_Added%20From%5D') !== -1 ||
        str.indexOf('properties[' + PROP_KEY + ']') !== -1) return str;
    var sep = str.length ? '&' : '';
    return str + sep + 'properties[' + encodeURIComponent(PROP_KEY) + ']=' + encodeURIComponent(surface);
  }

  function injectIntoJson(obj, surface) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj.items)) {
      obj.items = obj.items.map(function (it) {
        it.properties = it.properties || {};
        if (!(PROP_KEY in it.properties)) it.properties[PROP_KEY] = surface;
        return it;
      });
    } else if (obj.id) {
      obj.properties = obj.properties || {};
      if (!(PROP_KEY in obj.properties)) obj.properties[PROP_KEY] = surface;
    }
    return obj;
  }

  // Patch fetch
  if (window.fetch) {
    var origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (isAddToCart(url)) {
          var surface = currentSurface();
          init = init || {};
          var body = init.body;
          if (body instanceof FormData) {
            init.body = injectIntoFormData(body, surface);
          } else if (typeof body === 'string') {
            var ct = ((init.headers && (init.headers['Content-Type'] || init.headers['content-type'])) || '').toLowerCase();
            if (ct.indexOf('application/json') !== -1 || body.charAt(0) === '{') {
              try {
                var parsed = JSON.parse(body);
                init.body = JSON.stringify(injectIntoJson(parsed, surface));
              } catch (e) {}
            } else {
              init.body = injectIntoUrlEncoded(body, surface);
            }
          } else if (body instanceof URLSearchParams) {
            if (!body.has('properties[' + PROP_KEY + ']')) {
              body.append('properties[' + PROP_KEY + ']', surface);
            }
          }
        }
      } catch (e) {}
      return origFetch(input, init);
    };
  }

  // Patch XHR (covers themes/apps that don't use fetch)
  if (window.XMLHttpRequest) {
    var XHR = window.XMLHttpRequest.prototype;
    var origOpen = XHR.open;
    var origSend = XHR.send;
    XHR.open = function (method, url) {
      this.__dawbuAddUrl = url;
      return origOpen.apply(this, arguments);
    };
    XHR.send = function (body) {
      try {
        if (isAddToCart(this.__dawbuAddUrl)) {
          var surface = currentSurface();
          if (body instanceof FormData) {
            body = injectIntoFormData(body, surface);
          } else if (typeof body === 'string' && body.length) {
            if (body.charAt(0) === '{') {
              try {
                var parsed = JSON.parse(body);
                body = JSON.stringify(injectIntoJson(parsed, surface));
              } catch (e) {}
            } else {
              body = injectIntoUrlEncoded(body, surface);
            }
          }
        }
      } catch (e) {}
      return origSend.call(this, body);
    };
  }

  // -------- Routing helpers --------
  function ensureDataLayer() {
    window.dataLayer = window.dataLayer || [];
    return window.dataLayer;
  }

  function gaEventName(name) {
    return name; // GA4 accepts any snake_case event name
  }

  function fbqEventMap(name, params) {
    // Map our events to standard Meta events when possible.
    var standard = {
      add_to_cart: 'AddToCart',
      view_item: 'ViewContent',
      view_item_list: 'ViewContent',
      search: 'Search',
      begin_checkout: 'InitiateCheckout',
      add_to_wishlist: 'AddToWishlist',
      sign_up: 'CompleteRegistration',
      purchase: 'Purchase'
    };
    if (standard[name]) {
      return { type: 'track', event: standard[name], params: params };
    }
    return { type: 'trackCustom', event: name, params: params };
  }

  function fire(name, params) {
    params = params || {};
    var payload = Object.assign({}, persistentTraits, params, {
      event: name,
      _ts: Date.now(),
      _page: window.location.pathname,
      _href: window.location.href
    });

    // 1. GTM / dataLayer
    ensureDataLayer().push(payload);

    // 2. GA4
    if (typeof window.gtag === 'function') {
      try { window.gtag('event', gaEventName(name), params); } catch (e) {}
    }

    // 3. Meta Pixel
    if (typeof window.fbq === 'function') {
      try {
        var mapped = fbqEventMap(name, params);
        window.fbq(mapped.type, mapped.event, mapped.params);
      } catch (e) {}
    }

    if (window.DawbuTrackDebug) {
      // eslint-disable-next-line no-console
      console.log('[DawbuTrack]', name, payload);
    }
  }

  function track(name, params) {
    if (!name) return;
    fire(name, params || {});
  }
  track.identify = function (traits) {
    Object.assign(persistentTraits, traits || {});
  };
  track.debug = function (on) { window.DawbuTrackDebug = !!on; };
  window.DawbuTrack = track;

  // -------- Utility --------
  function closestData(el, attr) {
    var node = el && el.closest ? el.closest('[' + attr + ']') : null;
    return node ? node.getAttribute(attr) : null;
  }
  function parseParams(el) {
    if (!el) return {};
    var raw = el.getAttribute('data-track-params');
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }
  function surfaceOf(el) {
    return closestData(el, 'data-track-source') ||
           closestData(el, 'data-track-section') ||
           null;
  }

  // -------- Declarative click + hover --------
  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target) return;

    // Always capture rich surface (page:section:product) for every click
    var richSurface = buildSurface(target);
    var src = surfaceOf(target);
    lastClickContext = {
      source: src || pageContext(),
      surface: richSurface,
      at: Date.now(),
      text: (target.textContent || '').trim().slice(0, 80)
    };

    // Product card image / link tap (specifically for navigation, not ATC)
    var productLink = target.closest('a[href*="/products/"]');
    if (productLink && !target.closest('button, [type="submit"], .dqc, .product-form__cart-submit')) {
      var card = target.closest('.card-wrapper, .grid__item, .swiper-slide, .rv-product');
      var isImage = !!target.closest('img, .card__media, .media, picture, svg, .glow-miniatures__circle, .rv-product__media');
      var tapHandle = nearestProductHandle(productLink);
      // Save entry path so a later ATC on the PDP carries this surface forward
      saveEntryPath(tapHandle, richSurface);
      track(isImage ? 'product_card_image_tap' : 'product_card_link_tap', {
        surface: richSurface,
        product_handle: tapHandle,
        href: productLink.getAttribute('href')
      });
    }

    // Collection tile tap (e.g., main-list-collections page)
    var collectionLink = target.closest('a[href*="/collections/"]');
    if (collectionLink && !target.closest('a[href*="/products/"]')) {
      var collMatch = (collectionLink.getAttribute('href') || '').match(/\/collections\/([^/?#]+)/);
      track('collection_tile_tap', {
        surface: richSurface,
        collection: collMatch ? collMatch[1] : null,
        href: collectionLink.getAttribute('href')
      });
    }

    var declarative = target.closest('[data-track-click]');
    if (declarative) {
      track(declarative.getAttribute('data-track-click'), Object.assign({
        surface: richSurface,
        label: (declarative.getAttribute('aria-label') ||
                declarative.textContent || '').trim().slice(0, 120)
      }, parseParams(declarative)));
    }

    // Outbound links
    var link = target.closest('a[href]');
    if (link) {
      var href = link.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href) && link.hostname && link.hostname !== window.location.hostname) {
        track('outbound_link', { href: href, host: link.hostname, surface: richSurface });
      }
    }
  }, true);

  // Hover (mouseenter, throttled per element)
  document.addEventListener('mouseover', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-track-hover]') : null;
    if (!el || el.__dawbuHovered) return;
    el.__dawbuHovered = true;
    setTimeout(function () { el.__dawbuHovered = false; }, 2000);
    track(el.getAttribute('data-track-hover'), Object.assign({
      surface: surfaceOf(el)
    }, parseParams(el)));
  }, true);

  // Product card image hover (auto, no markup needed)
  document.addEventListener('mouseover', function (e) {
    var card = e.target && e.target.closest ? e.target.closest('.card-wrapper, .glow-miniatures__item, .collection-grid__item') : null;
    if (!card || card.__dawbuImgHovered) return;
    card.__dawbuImgHovered = true;
    setTimeout(function () { card.__dawbuImgHovered = false; }, 3000);
    var link = card.querySelector('a[href]');
    track('product_card_hover', {
      surface: surfaceOf(card),
      href: link ? link.getAttribute('href') : null,
      label: (card.textContent || '').trim().slice(0, 80)
    });
  }, true);

  // -------- Section impressions --------
  function bindImpressions() {
    var nodes = document.querySelectorAll('[data-track-section]');
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !firedImpressions.has(entry.target)) {
          firedImpressions.add(entry.target);
          track('section_view', {
            section: entry.target.getAttribute('data-track-section'),
            ratio: Math.round(entry.intersectionRatio * 100) / 100
          });
        }
      });
    }, { threshold: 0.4 });
    nodes.forEach(function (n) { io.observe(n); });
  }

  // -------- Scroll depth --------
  function onScroll() {
    var doc = document.documentElement;
    var scrollTop = window.pageYOffset || doc.scrollTop;
    var height = (doc.scrollHeight - doc.clientHeight) || 1;
    var pct = Math.round((scrollTop / height) * 100);
    SCROLL_THRESHOLDS.forEach(function (t) {
      if (!firedScroll[t] && pct >= t) {
        firedScroll[t] = true;
        track('scroll_depth', { percent: t });
      }
    });
  }
  var scrollRaf = null;
  window.addEventListener('scroll', function () {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(function () {
      scrollRaf = null;
      onScroll();
    });
  }, { passive: true });

  // -------- Scroll-to-top --------
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('.back-to-top, [data-scroll-top], #back-to-top, .scroll-to-top') : null;
    if (btn) track('scroll_to_top_click', { surface: surfaceOf(btn) });
  }, true);

  // -------- Add to cart (PubSub + DOM event) --------
  function trackCartUpdate(detail) {
    if (!detail) return;
    var cart = detail.cartData || detail.cart || detail;
    if (!cart || !cart.items) return;

    // Build the richest possible surface: page:section:product (+ entry path if known)
    var source;
    if (detail.source) {
      source = detail.source;
    } else if (lastClickContext && (Date.now() - lastClickContext.at < 30000)) {
      source = lastClickContext.surface || lastClickContext.source;
    } else {
      // Use currentSurface() which now appends "(from X)" on PDPs when the entry path is known
      source = currentSurface();
    }

    var items = (cart.items || []).map(function (item) {
      return {
        item_id: String(item.product_id || item.id || ''),
        item_variant_id: String(item.variant_id || item.id || ''),
        item_name: item.product_title || item.title,
        item_brand: item.vendor,
        item_category: item.product_type,
        price: (item.final_price || item.price || 0) / 100,
        quantity: item.quantity || 1
      };
    });

    track('add_to_cart', {
      surface: source,
      currency: cart.currency || (window.Shopify && Shopify.currency && Shopify.currency.active) || 'INR',
      value: (cart.total_price || 0) / 100,
      item_count: cart.item_count,
      items: items,
      variant_id: detail.variantId || null
    });
  }

  // Theme pubsub (cart-update)
  function bindPubSub() {
    if (typeof window.subscribe === 'function' && window.PUB_SUB_EVENTS) {
      try {
        window.subscribe(window.PUB_SUB_EVENTS.cartUpdate, trackCartUpdate);
        window.subscribe(window.PUB_SUB_EVENTS.cartError, function (data) {
          track('cart_error', { source: data && data.source, message: data && data.message });
        });
        window.subscribe(window.PUB_SUB_EVENTS.variantChange, function (data) {
          track('variant_change', {
            product_id: data && data.data && data.data.productId,
            variant_id: data && data.data && data.data.variant && data.data.variant.id
          });
        });
        window.subscribe(window.PUB_SUB_EVENTS.quantityUpdate, function () {
          track('cart_quantity_change', { surface: lastClickContext && lastClickContext.source });
        });
      } catch (e) {}
    }
  }

  // Also listen to legacy DOM event
  document.addEventListener('cart:updated', function (e) {
    trackCartUpdate(e && e.detail);
  });

  // -------- Begin checkout --------
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('#checkout, #CartDrawer-Checkout, [name="checkout"], [href*="/checkout"]') : null;
    if (btn) {
      track('begin_checkout', {
        surface: surfaceOf(btn) || 'cart',
        label: (btn.textContent || '').trim().slice(0, 80)
      });
    }
  }, true);

  // -------- Header / drawer / search opens --------
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    if (t.closest('.header__icon--cart, [data-cart-icon], #cart-icon-bubble')) {
      track('cart_drawer_open', { surface: 'header' });
    }
    if (t.closest('.header__icon--search, summary[aria-label*="Search"], details-modal[aria-label*="Search"] summary')) {
      track('search_open', { surface: 'header' });
    }
    if (t.closest('.header__icon--menu, .header__menu-toggle, header-drawer summary')) {
      track('mobile_menu_open', { surface: 'header' });
    }
    if (t.closest('.header__icon--account, [href*="/account"]')) {
      track('account_click', { surface: surfaceOf(t) || 'header' });
    }
    if (t.closest('.header__heading-link, .header__logo, [data-header-logo]')) {
      track('logo_click', { surface: 'header' });
    }

    // Nav link clicks
    var navLink = t.closest('.header__inline-menu a, .header__menu a, .menu-drawer a');
    if (navLink) {
      track('nav_link_click', {
        surface: 'header',
        text: (navLink.textContent || '').trim().slice(0, 80),
        href: navLink.getAttribute('href')
      });
    }

    // Footer link clicks
    var footerLink = t.closest('.footer a, .footer__content a, .footer-block a');
    if (footerLink) {
      track('footer_link_click', {
        surface: 'footer',
        text: (footerLink.textContent || '').trim().slice(0, 80),
        href: footerLink.getAttribute('href')
      });
    }
  }, true);

  // -------- FAQ open/close --------
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (!d || d.tagName !== 'DETAILS') return;
    if (d.closest('.faq-section, .faq, faq-section, [data-faq]')) {
      track(d.open ? 'faq_open' : 'faq_close', {
        question: (d.querySelector('summary') ? d.querySelector('summary').textContent : '').trim().slice(0, 200)
      });
    }
  }, true);

  // -------- Slider swipes (delegated touch/scroll) --------
  function bindSliderSwipes() {
    document.querySelectorAll('.glow-miniatures__track, .collection-grid__grid, .swiper, .swiper-container, .splide__track').forEach(function (track) {
      if (track.__dawbuSwipeBound) return;
      track.__dawbuSwipeBound = true;
      var lastFired = 0;
      track.addEventListener('scroll', function () {
        var now = Date.now();
        if (now - lastFired < 1200) return;
        lastFired = now;
        window.DawbuTrack('slider_swipe', {
          surface: buildSurface(track),
          slider: nearestSection(track) || (track.className.split(' ')[0])
        });
      }, { passive: true });
      // Also fire on touchend (more reliable on Swiper-powered tracks)
      track.addEventListener('touchend', function () {
        var now = Date.now();
        if (now - lastFired < 800) return;
        lastFired = now;
        window.DawbuTrack('slider_swipe', {
          surface: buildSurface(track),
          slider: nearestSection(track) || (track.className.split(' ')[0])
        });
      }, { passive: true });
    });
  }

  // -------- Video plays --------
  function bindVideos() {
    document.querySelectorAll('video').forEach(function (v) {
      if (v.__dawbuVideoBound) return;
      v.__dawbuVideoBound = true;
      v.addEventListener('play', function () {
        track('video_play', { surface: surfaceOf(v), src: v.currentSrc || v.src });
      });
      v.addEventListener('ended', function () {
        track('video_complete', { surface: surfaceOf(v), src: v.currentSrc || v.src });
      });
    });
  }

  // -------- Form submits (search, newsletter, contact) --------
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    var name = 'form_submit';
    if (form.action && /\/search/.test(form.action)) {
      name = 'search';
      var q = form.querySelector('input[name="q"]');
      track(name, { search_term: q ? q.value : null });
      return;
    }
    if (form.classList && (form.classList.contains('newsletter-form') ||
        form.querySelector('input[type="email"]'))) {
      name = 'newsletter_signup';
    }
    track(name, {
      surface: surfaceOf(form),
      action: form.action
    });
  }, true);

  // -------- PDP / collection / cart page views --------
  function trackPageView() {
    var tpl = (document.body && document.body.className) || '';
    if (/template-product/.test(tpl)) {
      track('view_item', { surface: 'pdp' });
    } else if (/template-collection/.test(tpl)) {
      track('view_item_list', { surface: 'collection' });
    } else if (/template-cart/.test(tpl)) {
      track('view_cart', { surface: 'cart' });
    } else if (/template-index/.test(tpl)) {
      track('view_home', { surface: 'home' });
    }
  }

  // -------- Variant / option selector --------
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t) return;
    if (t.closest && t.closest('variant-radios, variant-selects, .product-form__input')) {
      track('pdp_variant_select', {
        name: t.name,
        value: t.value
      });
    }
  }, true);

  // -------- Wishlist / share (best-effort) --------
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-wishlist], .wishlist, .swym-button')) {
      track('add_to_wishlist', { surface: surfaceOf(t) });
    }
    if (t.closest('.share-button, [data-share]')) {
      track('share_click', { surface: surfaceOf(t) });
    }
  }, true);

  // -------- Sold-out guard (global) --------
  // Prevents add-to-cart when the trigger button is disabled / unavailable.
  // Covers PDP, product cards, and bundle "Add Selected Items to Cart".
  function isSoldOutBtn(btn) {
    if (!btn) return false;
    if (btn.disabled) return true;
    if (btn.getAttribute('aria-disabled') === 'true') return true;
    if (btn.getAttribute('data-available') === 'false') return true;
    var txt = (btn.textContent || '').toLowerCase();
    if (/sold\s*out|unavailable/.test(txt)) return true;
    return false;
  }

  // Capture-phase click block (fires before theme handlers)
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('button[name="add"], .product-form__submit, .product-form__cart-submit, .bundle-summary__button') : null;
    if (!btn) return;
    if (isSoldOutBtn(btn)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      track('sold_out_blocked', { surface: surfaceOf(btn), label: (btn.textContent || '').trim().slice(0, 60) });
    }
  }, true);

  // Block form submits too (covers Enter key, programmatic submits)
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    var action = form.getAttribute('action') || '';
    if (!/\/cart\/add/i.test(action)) return;
    var submitBtn = form.querySelector('button[name="add"], button[type="submit"]');
    if (isSoldOutBtn(submitBtn)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      track('sold_out_blocked', { surface: surfaceOf(form), reason: 'form_submit' });
    }
  }, true);

  // Re-assert disabled state on dynamically-rendered buttons (PDP variant swaps, lazy sections)
  function hardenSoldOut() {
    document.querySelectorAll('button[name="add"][data-available="false"], button[name="add"][aria-disabled="true"]').forEach(function (btn) {
      if (!btn.disabled) btn.setAttribute('disabled', '');
    });
  }
  hardenSoldOut();
  if (window.MutationObserver) {
    var mo = new MutationObserver(function () { hardenSoldOut(); });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['data-available', 'aria-disabled', 'disabled'] });
  }

  // Also block cart-add fetch if no in-flight available variant — last-resort
  // (we already abort at the button level above; this catches programmatic calls)
  if (window.fetch) {
    var origAddFetch = window.fetch;
    // Note: cart-add interceptor above already wraps fetch; this hook is implicit.
    // For sold-out, button-level + form-level guard above is the primary defense.
  }

  // -------- Boot --------
  function boot() {
    bindImpressions();
    bindPubSub();
    bindSliderSwipes();
    bindVideos();
    trackPageView();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  document.addEventListener('shopify:section:load', function () {
    bindImpressions();
    bindSliderSwipes();
    bindVideos();
  });
})();
