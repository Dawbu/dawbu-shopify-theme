/* assets/byob-builder.js
   Drives every BYOB pack page. Reads N (qty) + P (price) from the section.
   Selection is client-side; on confirm it adds the chosen variants to the cart and
   sends the shopper to /cart, where an automatic bundle discount locks the total
   to ₹P. One bundle at a time; CTA enables only when exactly N items are chosen.

   World-class extras:
   • Haptic feedback (navigator.vibrate) on every selection / completion.
   • Subtle pop animation per tap.
   • CSS-driven confetti burst the moment the bundle fills.
   • Optimistic UI + graceful Ajax errors. */
(function () {
  const root = document.querySelector('[data-byob-builder]');
  if (!root) return;

  const N = parseInt(root.dataset.qty, 10) || 6;
  const P = parseInt(root.dataset.price, 10) || 0;
  const PACK_HANDLE = root.dataset.pack || '';
  const sel = new Map(); // variantId -> qty

  /* ----- source / attribution ----- */
  function detectSource() {
    /* 1. Recent stored signal from bridge or hub */
    try {
      const stored = JSON.parse(sessionStorage.getItem('byob_source') || 'null');
      if (stored && stored.at && (Date.now() - stored.at) < 30 * 60 * 1000) {
        return stored;
      }
    } catch (_) {}
    /* 2. UTM / ref params in URL */
    try {
      const params = new URLSearchParams(location.search);
      const utmSource = params.get('utm_source');
      const utmMedium = params.get('utm_medium');
      const utmCampaign = params.get('utm_campaign');
      const ref = params.get('ref');
      if (utmSource || ref) {
        return {
          source: 'campaign',
          utm_source: utmSource || '',
          utm_medium: utmMedium || '',
          utm_campaign: utmCampaign || '',
          ref: ref || '',
          at: Date.now()
        };
      }
    } catch (_) {}
    /* 3. Referrer-derived */
    try {
      if (document.referrer) {
        const r = new URL(document.referrer);
        if (r.host !== location.host) {
          if (/instagram|facebook|fb\.|meta|t\.co|twitter|x\.com|threads|whatsapp/i.test(r.host)) return { source: 'social', host: r.host, at: Date.now() };
          if (/google|bing|duckduck|yahoo/i.test(r.host)) return { source: 'search', host: r.host, at: Date.now() };
          return { source: 'external', host: r.host, at: Date.now() };
        }
        /* same-origin referrer */
        if (/\/products\//.test(r.pathname)) return { source: 'pdp_direct', referrer_path: r.pathname, at: Date.now() };
        if (/\/pages\/byob\b/.test(r.pathname)) return { source: 'hub', at: Date.now() };
        if (r.pathname === '/' || r.pathname === '') return { source: 'home', at: Date.now() };
        return { source: 'internal', referrer_path: r.pathname, at: Date.now() };
      }
    } catch (_) {}
    return { source: 'direct', at: Date.now() };
  }
  const SRC = detectSource();

  function fireEvent(name, payload) {
    try { document.dispatchEvent(new CustomEvent('byob:' + name, { detail: payload || {} })); } catch (_) {}
    if (window.dataLayer && window.dataLayer.push) {
      window.dataLayer.push(Object.assign({ event: 'byob_' + name }, payload || {}));
    }
  }

  fireEvent('builder_view', {
    pack_handle: PACK_HANDLE,
    qty_required: N,
    bundle_price: P,
    source: SRC.source,
    source_detail: SRC
  });

  const sum     = root.querySelector('[data-sum]');
  const countEl = sum.querySelector('[data-count]');
  const dots    = [...sum.querySelectorAll('[data-dot]')];
  const cta     = sum.querySelector('[data-cta]');
  const hint    = sum.querySelector('[data-hint]');
  const wasEl   = sum.querySelector('[data-was]');
  const saveEl  = sum.querySelector('[data-save]');

  let lastReadyState = false;

  const reducedMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const total = () => [...sel.values()].reduce((a, b) => a + b, 0);

  function buzz(pattern) {
    if (reducedMotion()) return;
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (_) {} }
  }

  function pop(card) {
    if (!card || reducedMotion()) return;
    card.classList.remove('is-pop');
    void card.offsetWidth;
    card.classList.add('is-pop');
  }

  function confettiBurst() {
    if (reducedMotion()) return;
    const colors = ['#ed1c24', '#121212', '#ffbe2e', '#27c39e', '#f6f0e6'];
    const wrap = document.createElement('div');
    wrap.className = 'byob-confetti';
    for (let i = 0; i < 60; i++) {
      const s = document.createElement('span');
      s.style.left = (Math.random() * 100) + 'vw';
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = (Math.random() * 250) + 'ms';
      s.style.animationDuration = (1100 + Math.random() * 700) + 'ms';
      s.style.transform = `translateY(0) rotate(${Math.random() * 90}deg)`;
      wrap.appendChild(s);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 2000);
  }

  function originalTotal() {
    let t = 0;
    sel.forEach((qty, id) => {
      const card = root.querySelector('.byob-prod[data-id="' + id + '"]');
      if (!card) return;
      const price = parseFloat(card.dataset.price) || 0;
      t += price * qty;
    });
    return t;
  }

  function render() {
    const c = total();
    countEl.textContent = c;
    dots.forEach((d, i) => d.classList.toggle('is-on', i < c));

    root.querySelectorAll('.byob-prod').forEach((card) => {
      const id = card.dataset.id;
      const q = sel.get(id) || 0;
      card.classList.toggle('is-sel', q > 0);
      const addBtn = card.querySelector('[data-add]');
      const step = card.querySelector('[data-step]');
      addBtn.hidden = q > 0;
      step.hidden = q === 0;
      if (q > 0) step.querySelector('[data-qn]').textContent = q;
      const incBtn = card.querySelector('[data-inc]');
      if (incBtn) incBtn.disabled = c >= N;
      addBtn.disabled = c >= N;
    });

    /* live original total + savings */
    const orig = originalTotal();
    if (wasEl && saveEl) {
      if (c > 0 && orig > P) {
        const saved = Math.round(orig - P);
        const pctOff = Math.round((saved / orig) * 100);
        wasEl.textContent = 'Rs. ' + Math.round(orig);
        wasEl.hidden = false;
        saveEl.innerHTML = 'You save <strong>Rs. ' + saved + '</strong> (' + pctOff + '% off)';
        saveEl.hidden = false;
      } else {
        wasEl.hidden = true;
        saveEl.hidden = true;
      }
    }

    if (c < N) {
      cta.disabled = true;
      cta.textContent = `Add ${N} to unlock Rs. ${P}`;
      hint.textContent = `Add ${N - c} more`;
    } else {
      cta.disabled = false;
      cta.textContent = `Add bundle to cart · Rs. ${P}`;
      hint.textContent = `You're all set 🎉`;
    }

    const isReady = c >= N;
    sum.classList.toggle('is-ready', isReady);
    if (isReady && !lastReadyState) {
      buzz([12, 60, 30, 80]);
      confettiBurst();
    }
    lastReadyState = isReady;
  }

  function change(id, delta, card) {
    const c = total();
    if (delta > 0 && c >= N) {
      buzz(8);
      if (card && card.animate) {
        card.animate(
          [
            { transform: 'translateX(0)' },
            { transform: 'translateX(-4px)' },
            { transform: 'translateX(4px)' },
            { transform: 'translateX(0)' }
          ],
          { duration: 240, easing: 'cubic-bezier(.36,.07,.19,.97)' }
        );
      }
      return;
    }
    const next = (sel.get(id) || 0) + delta;
    if (next <= 0) sel.delete(id); else sel.set(id, next);
    if (delta > 0) { buzz(10); pop(card); }
    else { buzz(4); }
    render();
  }

  root.addEventListener('click', (e) => {
    const card = e.target.closest('.byob-prod');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.matches('[data-add],[data-inc]')) change(id, +1, card);
    else if (e.target.matches('[data-dec]')) change(id, -1, card);
  });

  cta.addEventListener('click', async () => {
    if (total() !== N) return;
    cta.disabled = true;
    const original = cta.textContent;
    cta.textContent = 'Adding…';
    buzz([8, 40, 8]);

    /* attribution properties on every line item (visible in Shopify order detail) */
    const at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const baseProps = {
      _byob_pack: PACK_HANDLE,
      _byob_source: SRC.source || 'direct',
      _byob_at: at
    };
    if (SRC.product_id)    baseProps._byob_from_product_id = String(SRC.product_id);
    if (SRC.product_handle) baseProps._byob_from_product_handle = SRC.product_handle;
    if (SRC.utm_source)    baseProps._byob_utm_source = SRC.utm_source;
    if (SRC.utm_medium)    baseProps._byob_utm_medium = SRC.utm_medium;
    if (SRC.utm_campaign)  baseProps._byob_utm_campaign = SRC.utm_campaign;
    if (SRC.ref)           baseProps._byob_ref = SRC.ref;
    if (SRC.host)          baseProps._byob_referrer_host = SRC.host;

    const items = [...sel.entries()].map(([id, q]) => ({
      id: Number(id),
      quantity: q,
      properties: baseProps
    }));

    fireEvent('bundle_added', {
      pack_handle: PACK_HANDLE,
      qty: N,
      bundle_price: P,
      source: SRC.source,
      source_detail: SRC,
      items: items.map(i => ({ variant_id: i.id, quantity: i.quantity })),
      from_product_id: SRC.product_id || null,
      from_product_handle: SRC.product_handle || null
    });

    /* Native Dawn/Rise pattern:
       1. Find the cart drawer or notification element on the page.
       2. Ask it which sections it wants re-rendered.
       3. POST to /cart/add.js with `sections=` so the response includes that HTML.
       4. Pass the parsed response to cartElement.renderContents() — it re-renders
          the sections and opens the drawer in one call. */
    const cartElement = document.querySelector('cart-drawer') || document.querySelector('cart-notification');
    let sectionsParam = '';
    let sectionsSelectors = '';
    if (cartElement && typeof cartElement.getSectionsToRender === 'function') {
      const list = cartElement.getSectionsToRender();
      sectionsParam = list.map((s) => s.id).join(',');
      sectionsSelectors = list
        .filter((s) => s.selector)
        .map((s) => s.id + ':' + s.selector)
        .join(',');
    }

    try {
      const body = { items: items };
      if (sectionsParam) {
        body.sections = sectionsParam;
        body.sections_url = window.location.pathname;
      }
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error('cart-add failed: ' + res.status + ' ' + errBody.slice(0, 200));
      }
      const added = await res.json();

      /* clear source so the next bundle on the same session gets a fresh detection */
      try { sessionStorage.removeItem('byob_source'); } catch (_) {}

      cta.textContent = 'Added ✓';

      /* Re-render cart sections + open drawer (Dawn/Rise standard) */
      if (cartElement && typeof cartElement.renderContents === 'function' && added && added.sections) {
        try {
          /* Notify other components first (cart.js listens to this) */
          if (typeof window.publish === 'function' && window.PUB_SUB_EVENTS && window.PUB_SUB_EVENTS.cartUpdate) {
            window.publish(window.PUB_SUB_EVENTS.cartUpdate, {
              source: 'byob-builder',
              productVariantId: items[0] && items[0].id,
              cartData: added
            });
          }
          cartElement.renderContents(added);
          return;
        } catch (renderErr) {
          /* fall through to the last-resort click */
          console.warn('[byob] cart renderContents failed, falling back', renderErr);
        }
      }

      /* Last resort: click the header cart icon to trigger the drawer the normal way */
      const cartIcon = document.querySelector('#cart-icon-bubble, [data-cart-icon], .header__icon--cart');
      if (cartIcon) { try { cartIcon.click(); return; } catch (_) {} }

      /* If no drawer exists at all in this theme, go to /cart so the bundle isn't lost */
      window.location.href = '/cart';
    } catch (err) {
      cta.disabled = false;
      cta.textContent = 'Try again';
      hint.textContent = "Couldn't add — please try once more.";
      buzz([20, 50, 20]);
      fireEvent('bundle_add_error', { pack_handle: PACK_HANDLE, error: String(err) });
      setTimeout(() => { cta.textContent = original; }, 2200);
    }
  });

  render();
})();
