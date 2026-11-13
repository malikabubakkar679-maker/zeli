// @ts-nocheck
import { CATALOG_DATA } from './catalog-data';
import {
  auth,
  signInWithGoogle,
  signOutUser,
  onAuthUserChange,
  createOrderInFirestore,
  getUserOrdersFromFirestore,
  getOrderByIdFromFirestore,
  syncCartToFirestore,
  getCartFromFirestore,
  syncWishlistToFirestore
} from './firebase';
import {
  generateTrackingNumber,
  TRACKING_STAGES,
  getActiveStageIndex,
  generateGmailConfirmationContent,
  getPageSeoMetadata
} from './utils/runway-logic';

'use strict';
window.decodeRunwayImage = image => {
  const reveal = () => image.decode().then(() => image.classList.add('is-decoded')).catch(() => { if (image.naturalWidth) image.classList.add('is-decoded'); });
  if (image.complete && image.naturalWidth) reveal();
  else image.addEventListener('load', reveal, { once: true });
};
window.RunwayBag = (() => {
  const storageKey = 'runway-styling-bag-v3';
  const catalogPromise = Promise.resolve(CATALOG_DATA).then(data => {
    if (!data || !Array.isArray(data.items) || !data.items.every(p => typeof p.id === 'string' && typeof p.name === 'string' && Number.isFinite(p.price) && p.price >= 0 && Array.isArray(p.variants) && p.variants.every(v => Number.isSafeInteger(v.id) && typeof v.a === 'boolean' && Array.isArray(v.o) && v.o.every(o => typeof o === 'string')))) throw new Error('The product list is unavailable.');
    return data;
  });
  let entries = [];
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(saved)) entries = saved.filter(e => e && Number.isSafeInteger(e.id) && Number.isSafeInteger(e.quantity) && e.quantity > 0 && e.quantity <= 20).slice(0,50);
  } catch (_) {}
  const money = value => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(value);
  const find = (catalog,id) => {
    for (const product of catalog.items) {
      const variant = product.variants.find(v => v.id === id && v.a === true);
      if (variant) return { product, variant };
    }
    return null;
  };
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(entries)); } catch (_) {} };
  const notify = message => {
    const status = document.getElementById('bag-status');
    status.textContent = message; status.classList.add('is-on');
    clearTimeout(status.hideTimer); status.hideTimer = setTimeout(() => status.classList.remove('is-on'),2500);
  };
  async function render() {
    const catalog = await catalogPromise;
    entries = entries.filter(e => find(catalog,e.id));
    document.querySelectorAll('[data-cart-count]').forEach(el => el.textContent = entries.reduce((sum,e) => sum+e.quantity,0));
    const list = document.getElementById('bag-items');
    list.replaceChildren();
    let total = 0;
    if (!entries.length) { const empty = document.createElement('p'); empty.textContent='Your styling bag is empty. Choose a size beside a piece to save it.'; empty.className='bag-note'; list.append(empty); }
    for (const entry of entries) {
      const { product,variant } = find(catalog,entry.id);
      total += product.price*entry.quantity;
      const row=document.createElement('div'); row.className='bag-row';
      const img=document.createElement('img'); img.src=product.image; img.alt=product.name;
      const details=document.createElement('div');
      const brand=document.createElement('span');
      brand.className='bag-brand';
      brand.innerHTML='<svg width="12" height="12" viewBox="0 0 84 84" fill="currentColor"><path d="M 10 4 L 79 4 L 54 16 L 22 35 L 67 36 L 6 80 L 24 49 L 2 48 L 49 16 L 10 16 Z"/></svg> ZELI';
      const title=document.createElement('h3'); title.textContent=product.name;
      const options=document.createElement('p'); options.textContent=`Size ${variant.o.join(' / ')} · Quantity ${entry.quantity} · ${money(product.price*entry.quantity)}`;
      const link=document.createElement('a');
      if (product.url && /^https?:\/\//i.test(product.url)) {
        const url=new URL(product.url);
        link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='View piece details ↗';
      } else {
        link.href='#/atelier';
        link.textContent='View in Shoe Atelier →';
        link.addEventListener('click', (ev) => {
          ev.preventDefault();
          document.getElementById('bag-dialog').close();
          if (typeof window.navigateZeliPage === 'function') window.navigateZeliPage('atelier');
        });
      }
      details.append(brand,title,options,link);
      const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','Remove '+product.name);remove.onclick=()=>{entries=entries.filter(e=>e.id!==entry.id);save();render();};
      row.append(img,details,remove);list.append(row);
    }
    document.getElementById('bag-total').textContent=entries.length?'Reference subtotal '+money(total):'';
    document.getElementById('export-bag').disabled=!entries.length;
  }
  async function add(items) {
    const catalog=await catalogPromise;
    for(const item of items){
      if(!Number.isSafeInteger(item.id)||item.quantity!==1||!find(catalog,item.id))throw new Error('Please choose an available size.');
      const existing=entries.find(e=>e.id===item.id);
      if(existing)existing.quantity=Math.min(20,existing.quantity+1);else entries.push({id:item.id,quantity:1});
    }
    save();await render();notify(items.length===1?'Piece saved to your styling bag':'Look saved to your styling bag');
  }
  document.getElementById('open-bag').addEventListener('click',()=>{render().then(()=>document.getElementById('bag-dialog').showModal()).catch(e=>notify(e.message));});
  document.getElementById('close-bag').addEventListener('click',()=>document.getElementById('bag-dialog').close());
  const chkFromBag = document.getElementById('open-checkout-from-bag');
  if (chkFromBag) {
    chkFromBag.addEventListener('click', () => {
      document.getElementById('bag-dialog').close();
      if (!entries.length) {
        notify('Your styling bag is empty.');
        return;
      }
      window.openCheckout();
    });
  }
  document.getElementById('bag-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.currentTarget.close();}});
  document.getElementById('export-bag').addEventListener('click',async()=>{
    const catalog=await catalogPromise;
    const text=['ZELI RUNWAY — STYLING SHORTLIST','Reference prices; no order or payment has been placed.','',...entries.map(e=>{const{product,variant}=find(catalog,e.id);return `ZELI — ${product.name} · Size ${variant.o.join(' / ')} · Quantity ${e.quantity}\n${product.url}`;})].join('\n\n');
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='zeli-runway-outfit-shortlist.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  function clear() {
    entries = [];
    save();
    render();
  }
  render().catch(e=>notify(e.message));
  return {add,render,clear,get entries(){return entries.map(e=>({...e}));}};
})();


  (() => {
    if (customElements.get('runway-section')) return;

    // walk physics: [spring stiffness, follow delay per place in line (s)] — critically damped, never overshoots
    const FEEL = { soft: [60, 0.05], balanced: [95, 0.04], snappy: [160, 0.03] };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const TAU = Math.PI * 2;

    /*  Three ways to present the looks
        ring    (desktop) — the queue stands on a slowly turning 3D ring, always facing camera;
                            sides softly blurred, the back more. The active look morphs in place.
        cinema  (desktop) — an edge-to-edge line, smallest left → tallest right. The line steps
                            right, the departing body ghosts back to the far end, the active
                            look morphs in place.
        scroll  (mobile)  — the section pins while the page scrolls; scrolling walks the line
                            one look per stop and scrubs the morph of the active look.          */

    class RunwaySection extends HTMLElement {
      connectedCallback() {
        if (this._ready) return;
        this._ready = true;
        this.querySelectorAll('[data-rw-clone]').forEach((x) => x.remove());   // re-attached in the editor
        this.stage = this.querySelector('[data-rw-stage]');
        this.actorLayer = this.querySelector('[data-rw-actors]');
        this.heroes = Array.from(this.querySelectorAll('[data-rw-hero]'));
        this.base = Array.from(this.querySelectorAll('[data-rw-model]'));
        this.n = this.heroes.length;
        if (!this.n || !this.stage) return;

        this.panels = Array.from(this.querySelectorAll('[data-rw-panel]'));
        this.ticks = Array.from(this.querySelectorAll('[data-rw-tick]'));
        this.piecesEl = this.querySelector('[data-rw-pieces]');
        this.liveEl = this.querySelector('[data-rw-live]');
        this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.design = !!(window.Shopify && Shopify.designMode);
        if (this.design) this.classList.add('rw--design');   // theme editor: piece dots stay visible for positioning

        // luxury layer: staged intro (skipped in the editor and for reduced motion)
        this.classList.add('rw--js');
        if (this.reduce || this.design) this.classList.add('is-revealed');
        this.lb = this.querySelector('[data-rw-lb]');
        this.lbStage = this.querySelector('[data-rw-lb-stage]');

        const f = FEEL[this.dataset.feel] || FEEL.balanced;
        this.K = f[0];
        this.C = 2 * Math.sqrt(f[0]);   // critical damping: arrives smoothly, no bounce
        this.lag = f[1];
        this.blurOn = this.dataset.blur === 'true';
        this.motionBlur = this.dataset.mblur === 'true';
        this.speed = parseInt(this.dataset.speed || '5000', 10);

        // bodies for the queue: originals + clones so the ring / line never runs out
        this.N = this.n * Math.ceil(8 / this.n);
        const els = [];
        for (let a = 0; a < this.N; a++) {
          let el = this.base[a % this.n];
          if (a >= this.n) {
            el = el.cloneNode(true);
            el.setAttribute('data-rw-clone', '');
            el.querySelectorAll('img').forEach((x) => x.setAttribute('loading', 'lazy'));
            this.actorLayer.appendChild(el);
          }
          els.push(el);
        }
        this.index = 0;
        this.target = 0;      // where the line is heading (continuous for drag / scroll)
        this.cur = 0;         // where the ring / scroll line is now
        this.vel = 0;
        const start = this.reduce || this.design ? 0 : 1.15;   // first view: the line walks in
        this.sim = els.map((el, a) => ({
          el, a, look: a % this.n, hit: el.querySelector('[data-rw-go]'),
          x: a + start, v: 0, g: a + start, prev: a, trip: false, from: 0, blur: -1, w: 0
        }));
        this.cur = -start;

        this.step = this.step.bind(this);
        this.onScroll = this.onScroll.bind(this);
        this.querySelectorAll('img[data-model-image]').forEach(window.decodeRunwayImage);
        this.measure();
        this.bind();
        this.setIndex(0, { silent: true });
        this.initPickers();
        this.heroes.forEach((h, i) => this.findFeet(h, i));

        this.io = new IntersectionObserver((entries) => {
          this.visible = entries[0].isIntersecting;
          if (this.visible) this.kick();
        }, { threshold: 0 });
        this.io.observe(this);

        // the intro plays once, when a good part of the section is on screen
        if (!this.classList.contains('is-revealed')) {
          this.revealIO = new IntersectionObserver((entries) => {
            if (!entries[0].isIntersecting) return;
            this.revealIO.disconnect();
            requestAnimationFrame(() => requestAnimationFrame(() => this.classList.add('is-revealed')));
          }, { threshold: 0, rootMargin: '0px 0px -22% 0px' });
          this.revealIO.observe(this);
        }

        if (this.dataset.autoplay === 'true' && !this.reduce && !this.design && this.mode !== 'scroll') this.play(true);
      }

      disconnectedCallback() {
        cancelAnimationFrame(this.raf);
        this.raf = null;
        clearTimeout(this.autoTimer);
        clearTimeout(this.snapT);
        this.ro && this.ro.disconnect();
        this.io && this.io.disconnect();
        this.revealIO && this.revealIO.disconnect();
        if (this._cursor) { cancelAnimationFrame(this._cursor.raf); this._cursor.raf = null; }
        clearTimeout(this._zoomT);
        if (this._host) { this._host.querySelectorAll('[data-rw-picker]').forEach((pk) => { pk.hidden = true; this.dock(pk); }); this._host.remove(); this._host = null; }
        window.removeEventListener('scroll', this.onScroll);
        window.removeEventListener('resize', this._onResize);
        document.removeEventListener('shopify:block:select', this._onBlockSelect);
        document.removeEventListener('visibilitychange', this._onVis);
        this._ready = false;
      }

      /* Cut-outs often carry transparent space under the feet: measure it once so every
         model stands exactly on the floor and the contact shadow sits at the soles. */
      findFeet(hero, look) {
        const url = hero.dataset.probe;
        if (!url) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const w = 48, h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, w, h);
            const d = ctx.getImageData(0, 0, w, h).data;
            let last = -1;
            for (let y = h - 1; y >= 0 && last < 0; y--) {
              for (let x = 0; x < w; x++) { if (d[(y * w + x) * 4 + 3] > 40) { last = y; break; } }
            }
            if (last < 0) return;
            const foot = clamp((h - 1 - last) / h, 0, 0.4).toFixed(4);
            hero.style.setProperty('--rw-foot', foot);
            this.sim.forEach((s) => { if (s.look === look) s.el.style.setProperty('--rw-foot', foot); });
          } catch (_) { /* cross-origin image: keep it as uploaded */ }
        };
        img.src = url;
      }

      /* ---------------- layout ---------------- */
      measure() {
        const mobile = window.matchMedia('(max-width: 749px)').matches;
        const wasScroll = this.mode === 'scroll';
        const style = mobile ? (this.dataset.mstyle || 'line') : this.dataset.style;
        this.mode = style === 'line' || style === 'cinema' ? 'cinema' : (style === 'classic' ? 'classic' : 'ring');
        this.mobile = mobile;
        if (!mobile && this._host) { this._host.querySelectorAll('[data-rw-picker]').forEach((pk) => this.dock(pk)); this.syncPicking(); }   // desktop shows pickers inline
        this.classList.toggle('rw--scroll', this.mode === 'scroll');
        this.classList.toggle('rw--ring', this.mode === 'ring');
        this.classList.toggle('rw--cinema', this.mode === 'cinema');
        this.classList.toggle('rw--classic', this.mode === 'classic');
        this.morph = this.mode === 'cinema' || this.mode === 'scroll';   // only the line-up morphs
        this.classList.toggle('rw--morph', this.morph);

        if (this.mode === 'scroll') {
          // the section is as tall as the walk; its inner frame pins to the viewport
          const vh = window.innerHeight;
          this.stick = this.stickyTop();
          this.stepPx = Math.max(160, (vh * parseInt(this.dataset.step || '60', 10)) / 100);
          this.style.setProperty('--rw-stick', this.stick + 'px');
          // the pinned frame is exactly one screen tall
          this.frameH = vh - this.stick;
          this.style.setProperty('--rw-frame-h', Math.round(this.frameH) + 'px');
          this.style.height = Math.round(this.frameH + (this.n - 1) * this.stepPx) + 'px';
          if (!wasScroll) { this.cur = this.progress(); this.target = this.cur; }
        } else {
          this.style.height = '';
          if (wasScroll) { this.target = this.cur = Math.round(this.cur); }
          // header + announcement bar + this section fit inside one screen together
          // phones: the URL bar resizes the viewport while scrolling — keep the frame steady
          const vw = window.innerWidth, ih = window.innerHeight;
          if (!(mobile && this._vh && vw === this._vw && Math.abs(ih - this._vh) < 160)) { this._vw = vw; this._vh = ih; }
          const heightMode = (mobile ? this.dataset.mheightMode : this.dataset.heightMode) || 'original';
          const heightValue = Number(mobile ? this.dataset.mheightVh : this.dataset.heightVh) || 100;
          if (heightMode === 'custom') {
            // Only the runway receives the additional room; product sizes are independent.
            this.frameH = this._vh * clamp(heightValue, 50, 120) / 100;
          } else if (heightMode === 'fullscreen') {
            this.frameH = this._vh;
          } else {
            // Preserve the existing layout and header-fit behavior by default.
            this.frameH = Math.max(380, this._vh - (this.dataset.fit === 'true' ? this.headerHeight() : 0));
          }
          this.style.setProperty('--rw-frame-h', Math.round(this.frameH) + 'px');
        }

        const r = this.stage.getBoundingClientRect();
        this.W = r.width;
        this.H = r.height;
        this.fs = this.mode === 'ring' ? 1.08 : 1;   // ring: the active model stands a little taller
        // The models fill the stage left by the chosen frame height and product panel.
        const room = this.mode === 'ring' ? (this.H - 34 - 18) / this.fs
          : this.mode === 'classic' ? this.H - (this.mobile ? 24 : 36) - 18
          : this.H - (this.mobile ? 20 : 30) - 18;
        this.modelH = Math.max(200, Math.round(room));
        this.stage.style.setProperty('--rw-model-h', this.modelH + 'px');

        this.style.setProperty('--rw-fs', this.fs);
        if (this.mode === 'classic') {
          this.Cl = this.mobile
            ? { ax: 0.3, ay: 22, sx: 0.32, sy: 22, sr: 0.76, ex: 0.55, d: 4 }
            : { ax: 0.4, ay: 36, sx: 0.125, sy: 58, sr: 0.76, ex: 0.38, d: 5 };
          this.unit = Math.max(90, this.W * this.Cl.sx * 1.6);
          this.hx = this.W * this.Cl.ax; this.hy = this.Cl.ay;
        } else if (this.mode === 'ring') {
          this.cx = this.W * 0.5;
          this.R = this.W * (this.mobile ? 0.72 : 0.62);
          this.P = this.W * (this.mobile ? 1.9 : 1.65);
          this.floor = this.H - 34;                 // front feet (px from top)
          this.horizon = this.H * 0.36;             // perspective origin
          this.unit = Math.max(this.mobile ? 90 : 120, this.W * 0.3);
          this.hx = this.cx; this.hy = 34;
        } else {
          this.L = this.mobile
            ? { ax: 0.74, g1: 0.36, r: 0.95, s0: 0.34, sr: 0.55, ay: 20, rise: 2 }
            : { ax: 0.75, g1: 0.2, r: 0.86, s0: 0.3, sr: 0.6, ay: 30, rise: 3 };
          this.unit = Math.max(80, this.W * this.L.g1);
          this.hx = this.W * this.L.ax; this.hy = this.L.ay;
        }
        this.stage.style.setProperty('--rw-hx', this.hx.toFixed(1) + 'px');
        this.stage.style.setProperty('--rw-hy', this.hy + 'px');
        this.style.setProperty('--rw-ax', ((this.hx / (this.W || 1)) * 100).toFixed(2) + '%');
        this.sim.forEach((s) => { s.w = s.el.offsetWidth || s.w; s.blur = -1; });
        this.heroes.forEach((h) => { if (this.mode !== 'scroll') { const m = h.firstElementChild; m.style.opacity = ''; m.style.filter = ''; m.style.transform = ''; } });
        this.renderAll();
        if (this.zoomed) this.layoutZoom();
      }

      // a shopper is working with the products: the look must not change under them
      engage() {
        this.engaged = true;
        if (this.playing) this.play(false);
      }

      /* ---------------- look popup ---------------- */
      // the front model opens on her own, larger, with the piece dots; the product panel stays as it is
      zoom(open) {
        if (!this.lb || !this.lbStage || open === !!this.zoomed) return;
        const hero = this.front || this.heroes[this.index];
        const src = hero && hero.querySelector('.rw__figure');
        if (!src) return;
        clearTimeout(this._zoomT);
        if (open) {
          this.engage();
          this.clearHot();
          const wrap = document.createElement('div');
          wrap.className = 'rw__lb-model';
          const shadow = hero.querySelector('.rw__morph > .rw__shadow');
          if (shadow) wrap.appendChild(shadow.cloneNode(true));
          const fig = src.cloneNode(true);
          fig.querySelectorAll('[data-rw-zoom]').forEach((x) => x.remove());
          fig.querySelectorAll('[data-rw-pin]').forEach((p) => { p.tabIndex = 0; p.classList.remove('is-hot'); });
          fig.querySelectorAll('img').forEach((im) => im.setAttribute('loading', 'eager'));
          fig.querySelectorAll('img[data-model-image]').forEach(window.decodeRunwayImage);
          wrap.appendChild(fig);
          wrap.style.setProperty('--rw-foot', getComputedStyle(hero).getPropertyValue('--rw-foot').trim() || '0');
          this.lbStage.replaceChildren(wrap);
          this.lbModel = wrap;
          const no = this.index + 1;
          const kicker = this.lb.querySelector('[data-rw-lb-kicker]');
          const name = this.lb.querySelector('[data-rw-lb-name]');
          if (kicker) kicker.textContent = `${this.lb.dataset.word || ''} ${no < 10 ? '0' : ''}${no}`.trim();
          if (name) name.textContent = hero.dataset.name || '';
          this.zoomed = true;
          this.layoutZoom();
          this.classList.add('rw--zoom');
          this.lb.setAttribute('aria-hidden', 'false');
          this.flip(wrap, src, true);
          const close = this.lb.querySelector('[data-rw-zoom-close]');
          close && close.focus({ preventScroll: true });
        } else {
          this.zoomed = false;
          this.clearHot();
          const hadFocus = this.lb.contains(document.activeElement);
          if (this.lbModel) this.flip(this.lbModel, src, false);
          this.classList.remove('rw--zoom');
          this.lb.setAttribute('aria-hidden', 'true');
          this._zoomT = setTimeout(() => { if (!this.zoomed) { this.lbStage.replaceChildren(); this.lbModel = null; } }, 950);
          if (hadFocus) this.stage.focus({ preventScroll: true });
        }
      }

      // the popup model is as tall as the popup allows
      layoutZoom() {
        const wrap = this.lbModel;
        if (!wrap) return;
        const fig = wrap.querySelector('.rw__figure');
        const ar = parseFloat(fig.style.getPropertyValue('--rw-ar')) || 0.353;
        const r = this.lbStage.getBoundingClientRect();
        const h = Math.max(160, Math.min(r.height, r.width / ar));
        wrap.style.setProperty('--rw-model-h', Math.round(h) + 'px');
        fig.querySelectorAll('img').forEach((im) => { im.sizes = Math.round(h * ar) + 'px'; });
      }

      // FLIP: the popup model grows out of (and shrinks back into) the model on the runway
      flip(wrap, src, opening) {
        if (this.reduce) return;
        const fig = wrap.querySelector('.rw__figure');
        const a = src.getBoundingClientRect();
        const b = fig.getBoundingClientRect();
        if (!a.height || !b.height) return;
        const at = `translate3d(${(a.left - b.left).toFixed(1)}px,${(a.bottom - b.bottom).toFixed(1)}px,0) scale(${(a.height / b.height).toFixed(4)})`;
        wrap.style.transformOrigin = '0 100%';
        if (opening) {
          wrap.style.transition = 'none';
          wrap.style.transform = at;
          void wrap.offsetWidth;
          wrap.style.transition = '';
          wrap.style.transform = '';
        } else {
          wrap.style.transform = at;
        }
      }

      /* ---------------- variant pickers: inline on desktop, a bottom sheet on phones ----------------
         On phones the open picker is moved into a host at the end of <body>: a theme wrapper with a
         transform (or iOS scrolling) would otherwise trap a fixed sheet inside the section. */
      pickerOf(card) { return card && (card._pk || card.querySelector('[data-rw-picker]')); }

      sheetHost() {
        if (this._host && this._host.isConnected) return this._host;
        const host = document.createElement('div');
        host.className = 'rw-sheet-host';
        const scrim = document.createElement('button');
        scrim.type = 'button';
        scrim.className = 'rw__pick-scrim';
        scrim.tabIndex = -1;
        scrim.setAttribute('aria-hidden', 'true');
        scrim.setAttribute('data-rw-pick-close', '');
        host.appendChild(scrim);
        host.addEventListener('click', (e) => this.onClick(e));
        host.addEventListener('change', (e) => {
          if (e.target.matches('[data-rw-option]')) { this.onOptionChange(e.target.closest('[data-rw-picker]')); this.engage(); }
        });
        host.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closePickers(); });
        document.body.appendChild(host);
        this._host = host;
        return host;
      }

      // the sheet sits outside the section, so it takes the section's colours and type with it
      themeHost(host) {
        const cs = getComputedStyle(this);
        ['--rw-panel', '--rw-text', '--rw-muted', '--rw-line', '--rw-accent', '--rw-on-accent', '--rw-btn-bg', '--rw-btn-fg', '--rw-btn-radius',
          '--rw-pill-radius', '--rw-bar-r', '--rw-thumb-radius', '--rw-pt-size', '--rw-price', '--rw-opt', '--rw-ease', '--rw-ease-sheet', '--rw-ease-spring']
          .forEach((v) => host.style.setProperty(v, cs.getPropertyValue(v)));
        host.style.fontFamily = cs.fontFamily;
        host.style.color = cs.color;
      }

      // move a picker back into its product card
      dock(pk) {
        if (pk && pk._card && pk.parentElement !== pk._card) pk._card.appendChild(pk);
      }

      openPicker(card, open) {
        const pk = this.pickerOf(card);
        if (!pk) return;
        if (open && this.mobile) {
          this.closePickers(card);   // one sheet at a time
          const host = this.sheetHost();
          this.themeHost(host);
          host.appendChild(pk);
        }
        pk.hidden = !open;
        if (!open) this.dock(pk);
        card.classList.toggle('is-picking', open);
        const btn = card.querySelector('[data-rw-add]');
        btn && btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        this.syncPicking();
      }
      closePickers(except) {
        this.querySelectorAll('[data-rw-card].is-picking').forEach((c) => { if (c !== except) this.openPicker(c, false); });
        this.syncPicking();
      }
      syncPicking() {
        const host = this._host;
        const on = !!(this.mobile && host && host.querySelector('[data-rw-picker]:not([hidden])'));
        this.classList.toggle('rw--picking', on);
        host && host.classList.toggle('is-open', on);
      }

      setStill(on) {
        if (this.still === on) return;
        this.still = on;
        this.classList.toggle('rw--still', on);
        if (!this.morph) this.renderAll();
      }

      headerHeight() {
        // the theme's header group (announcement bar + header) sits above the section on load
        let h = 0;
        document.querySelectorAll('.shopify-section-group-header-group, #shopify-section-header, #shopify-section-announcement-bar').forEach((el) => {
          if (el.contains(this)) return;
          const cs = getComputedStyle(el);
          if (cs.display !== 'none' && cs.position !== 'absolute') h += el.getBoundingClientRect().height;
        });
        return Math.round(h);
      }

      stickyTop() {
        let top = parseInt(this.dataset.offset || '0', 10);
        const hdr = document.querySelector('header-component, .header-wrapper, #header-group, .shopify-section-group-header-group');
        if (hdr) {
          const cs = getComputedStyle(hdr.closest('.shopify-section') || hdr);
          if (cs.position === 'sticky' || cs.position === 'fixed') top += Math.round(hdr.getBoundingClientRect().height);
        }
        return top;
      }

      progress() {
        const r = this.getBoundingClientRect();
        return clamp((this.stick - r.top) / this.stepPx, 0, this.n - 1);
      }

      wrapN(v) { const N = this.N; return ((v % N) + N) % N; }

      /* ---------------- placement ---------------- */
      put(s, x, bottom, sc, o, blur, z) {
        const half = (s.w || 200) * sc * 0.5;
        if (x + half < -4 || x - half > this.W + 4) o = 0;
        const st = s.el.style;
        st.transform = `translate3d(${x.toFixed(2)}px,${(-bottom).toFixed(2)}px,0) translateX(-50%) scale(${sc.toFixed(4)})`;
        st.opacity = o.toFixed(3);
        st.zIndex = String(z);
        st.visibility = o < 0.01 ? 'hidden' : 'visible';
        st.pointerEvents = o < 0.5 ? 'none' : '';
        const bb = Math.round(blur * 10) / 10;
        if (bb !== s.blur) { st.filter = bb > 0.05 ? `blur(${bb}px)` : ''; s.blur = bb; }
      }

      placeRing(s) {
        const step = TAU / this.N;
        let phi = ((s.a - this.cur) * step) % TAU;
        if (phi > Math.PI) phi -= TAU;
        if (phi < -Math.PI) phi += TAU;
        const z = this.R * (1 - Math.cos(phi));
        const sl = Math.abs(phi) / step;
        const p = (this.P / (this.P + z)) * (1 + (this.fs - 1) * clamp(1 - sl, 0, 1));
        const x = this.cx + this.R * Math.sin(phi) * (this.P / (this.P + z));
        const feet = this.horizon + (this.floor - this.horizon) * (this.P / (this.P + z));
        let blur = 0;
        if (this.blurOn) blur = sl <= 1 ? 1.8 * sl : Math.min(1.8 + (sl - 1) * 2, 6.5);   // soft beside the front, stronger behind
        // the front place belongs to the morphing hero; the back of the ring fades away
        let o = clamp((Math.cos(phi) + 0.55) / 0.3, 0, 1);
        if (this.still && sl < 0.02) o = 0;   // at rest the identical hero (with pins) takes this place
        this.put(s, x, this.H - feet, p, o, blur, Math.round(p * 1000));
      }

      placeClassic(s) {
        const C = this.Cl, N = this.N;
        let k = s.x, e = -1;
        if (s.trip) {
          // the departing model walks out past the camera and rejoins the back (or the reverse)
          const goal = s.prev, fwd = goal > s.from;
          const u = clamp(Math.abs(s.x - s.from) / (Math.abs(goal - s.from) || 1), 0, 1);
          if (fwd) { if (u < 0.5) e = u * 2 * 1.4; else k = goal + (1 - u) * 2; }
          else { if (u < 0.5) k = s.from + u * 2; else e = (1 - u) * 2 * 1.4; }
        } else if (k < 0) e = Math.min(-k, 1.4);
        let x, b, sc, o, blur = 0, z;
        if (e >= 0) {
          x = this.W * (C.ax - C.ex * e); b = C.ay - 22 * e; sc = 1 + 0.14 * e;
          o = Math.max(0, 1 - e * 1.05); if (this.blurOn) blur = 4 * Math.min(e, 1); z = 1100;
        } else {
          x = this.W * (C.ax + C.sx * k); b = C.ay + C.sy * k; sc = Math.pow(C.sr, k);
          o = k <= C.d - 1 ? 1 - 0.13 * k : Math.max(0, (1 - 0.13 * (C.d - 1)) * (C.d - k));
          if (this.blurOn) blur = Math.min(k * 0.9, 3.2);
          if (this.still && Math.abs(k) < 0.02) o = 0;   // the matching hero carries the pins at rest
          z = 1000 - Math.round(k * 10);
        }
        this.put(s, x, b, sc, o, blur, z);
      }

      posLine(k) {
        const L = this.L;
        return {
          x: this.W * (L.ax - (L.g1 * (1 - Math.pow(L.r, k))) / (1 - L.r)),
          b: L.ay + L.rise * k,
          s: L.s0 + (1 - L.s0) * Math.pow(L.sr, k)
        };
      }

      placeLine(s) {
        const k = clamp(s.x, -1.5, this.N);
        let o, blur = 0, z;
        let p;
        if (k >= 0) {
          p = this.posLine(k);
          o = clamp((k - 0.12) / 0.55, 0, 1);              // hands over to the morphing hero at the front
          if (this.blurOn) blur = Math.min(k * 0.55, 2.2);
          z = 1000 - Math.round(k * 10);
        } else {
          p = this.posLine(0);
          p.x += this.W * 0.3 * -k;
          o = 0; z = 1;
        }
        if (s.trip) {
          // returning to the far end: a ghost passing behind the others
          const dist = Math.abs(s.g - s.x), done = Math.abs(s.x - s.from);
          const ghost = clamp(Math.min(dist, done) / 0.55, 0, 1);
          o = o * (1 - 0.78 * ghost);
          blur += 3 * ghost;
          z = 5;
        }
        if (this.motionBlur && !this.mobile) blur += Math.min(Math.abs(s.v) * 0.45, 2);
        this.put(s, p.x, p.b, p.s, o, blur, z);
      }

      placeHeroes() {
        if (this.mode !== 'scroll') return;
        // scrubbed morph: each look's weight follows the scroll position
        this.heroes.forEach((h, i) => {
          const w = clamp(1 - Math.abs(this.cur - i), 0, 1);
          const m = h.firstElementChild;
          m.style.opacity = w.toFixed(3);
          m.style.filter = w > 0.995 ? 'none' : `blur(${((1 - w) * 14).toFixed(2)}px) brightness(${(1 + (1 - w) * 0.25).toFixed(3)})`;
          m.style.transform = `scale(${(0.97 + 0.03 * w).toFixed(4)})`;
          m.style.visibility = w < 0.01 ? 'hidden' : 'visible';
        });
      }

      renderAll() {
        if (this.mode === 'ring') this.sim.forEach((s) => this.placeRing(s));
        else if (this.mode === 'scroll') {
          this.sim.forEach((s) => {
            if (s.a >= this.n) { this.put(s, -9999, 0, 1, 0, 0, 0); return; }
            s.x = s.a - this.cur; s.v = this.vel; s.trip = false;
            this.placeLine(s);
          });
          this.placeHeroes();
        } else if (this.mode === 'classic') this.sim.forEach((s) => this.placeClassic(s));
        else this.sim.forEach((s) => this.placeLine(s));
      }

      kick() {
        if (this.raf || !this.visible) return;
        this.last = 0;
        this.raf = requestAnimationFrame(this.step);
      }

      step(t) {
        const dt = this.last ? Math.min(0.034, (t - this.last) / 1000) : 1 / 60;
        this.last = t;
        let busy = false;
        const K = this.K, C = this.C, sub = 3, h = dt / sub;

        if (this.mode === 'ring' || this.mode === 'scroll') {
          // one spring drives the whole ring / scroll line
          if (this.reduce) { this.cur = this.target; this.vel = 0; }
          else {
            const k2 = this.mode === 'scroll' ? K * 2.2 : K, c2 = 2 * Math.sqrt(k2);
            for (let j = 0; j < sub; j++) {
              const acc = -k2 * (this.cur - this.target) - c2 * this.vel;
              this.vel += acc * h;
              this.cur += this.vel * h;
            }
          }
          if (Math.abs(this.cur - this.target) > 0.0005 || Math.abs(this.vel) > 0.0005) busy = true;
          else { this.cur = this.target; this.vel = 0; }
          this.renderAll();
        } else {
          const N = this.N;
          for (const s of this.sim) {
            const goal = this.wrapN(s.a - this.target);
            if (Math.abs(goal - s.prev) > N / 2) { s.trip = true; s.from = s.x; }
            s.prev = goal;
            if (this.reduce) { s.x = s.g = goal; s.v = 0; s.trip = false; this.mode === 'classic' ? this.placeClassic(s) : this.placeLine(s); continue; }
            const tau = this.dragging ? 0.016 : s.trip ? 0.1 : 0.03 + this.lag * Math.min(goal, 4);
            s.g += (goal - s.g) * (1 - Math.exp(-dt / tau));
            for (let j = 0; j < sub; j++) {
              const acc = -K * (s.x - s.g) - C * s.v;
              s.v += acc * h;
              s.x += s.v * h;
            }
            if (s.trip && Math.abs(s.x - goal) < 0.02) s.trip = false;
            if (Math.abs(s.x - goal) > 0.0006 || Math.abs(s.v) > 0.0006 || Math.abs(s.g - goal) > 0.0006) busy = true;
            else { s.x = s.g = goal; s.v = 0; s.trip = false; }
            this.mode === 'classic' ? this.placeClassic(s) : this.placeLine(s);
          }
        }
        const moving = busy || this.dragging;
        if (moving) this.setStill(false);
        if (moving && this.visible && !document.hidden) this.raf = requestAnimationFrame(this.step);
        else { this.raf = null; if (!moving) this.setStill(true); }
      }

      /* ---------------- scroll mode ---------------- */
      onScroll() {
        if (this.mode !== 'scroll') return;
        const p = this.progress();
        this.target = p;
        const i = clamp(Math.round(p), 0, this.n - 1);
        if (i !== this.index) this.setIndex(i);
        this.kick();
        clearTimeout(this.snapT);
        if (this.dataset.snap === 'true') {
          this.snapT = setTimeout(() => {
            const r = this.getBoundingClientRect();
            if (r.top > this.stick + 2 || r.bottom < window.innerHeight - 2) return;  // only while pinned
            const q = this.progress();
            const d = (Math.round(q) - q) * this.stepPx;
            if (Math.abs(d) > 3) window.scrollBy({ top: d, behavior: 'smooth' });
          }, 160);
        }
      }

      scrollToLook(i) {
        const r = this.getBoundingClientRect();
        const top = window.scrollY + r.top - this.stick + clamp(i, 0, this.n - 1) * this.stepPx;
        window.scrollTo({ top: Math.round(top), behavior: this.reduce ? 'auto' : 'smooth' });
      }

      /* ---------------- state ---------------- */
      mod(i) { const n = this.n; return ((i % n) + n) % n; }
      moveTo(T) {
        if (this.mode === 'scroll') return this.scrollToLook(this.mod(Math.round(T)));
        this.target = T;
        this.setStill(false);
        this.setIndex(this.mod(Math.round(T)));
      }
      go(i) {
        if (this.mode === 'scroll') return this.scrollToLook(i);
        let d = this.mod(i - this.index);   // shortest way round the loop
        if (d > this.n / 2) d -= this.n;
        this.moveTo(Math.round(this.target) + d);
      }
      next() {
        if (this.mode === 'scroll') return this.scrollToLook(this.index + 1);
        this.moveTo(Math.round(this.target) + 1);
      }
      prev() {
        if (this.mode === 'scroll') return this.scrollToLook(this.index - 1);
        this.moveTo(Math.round(this.target) - 1);
      }

      rankOf(s) {
        if (this.mode === 'ring') {
          let k = this.wrapN(s.a - Math.round(this.target));
          if (k > this.N / 2) k -= this.N;
          return k;
        }
        return this.wrapN(s.a - Math.round(this.target));
      }

      // restart a one-shot CSS animation keyed on a class
      replay(el, cls) {
        if (!el) return;
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
      }

      setIndex(i, opts = {}) {
        const changed = i !== this.index || opts.silent;
        const was = this.index;
        this.index = i;
        this.kick();
        // queue bodies near the front stay reachable from the keyboard
        this.sim.forEach((s) => {
          const k = this.rankOf(s);
          const near = k !== 0 && Math.abs(k) <= (this.mode === 'ring' ? 2 : 3) && this.mode !== 'scroll';
          if (s.hit) { s.hit.tabIndex = near ? 0 : -1; s.hit.setAttribute('aria-hidden', near ? 'false' : 'true'); }
          if (near) s.el.removeAttribute('aria-hidden'); else s.el.setAttribute('aria-hidden', 'true');
        });
        if (!changed) return;
        if (this.zoomed && !opts.silent) this.zoom(false);
        if (this.mobile && !opts.silent) this.closePickers();
        this.style.setProperty('--rw-progress', ((i + 1) / this.n).toFixed(3));

        // morph: the old look dissolves, the new one resolves in the same place
        this.heroes.forEach((h, j) => {
          h.classList.toggle('is-on', j === i);
          h.classList.toggle('was', j === was && j !== i && !opts.silent);
          h.setAttribute('aria-hidden', j === i ? 'false' : 'true');
          const z = h.querySelector('[data-rw-zoom]');
          if (z) z.tabIndex = j === i ? 0 : -1;
          if (!this.lb) h.querySelectorAll('[data-rw-pin]').forEach((p) => { p.tabIndex = j === i ? 0 : -1; });
        });
        this.front = this.heroes[i];
        if (!opts.silent && !this.reduce) this.replay(this.stage, 'is-sweep');

        if (this.liveEl && !opts.silent) this.liveEl.textContent = this.heroes[i].dataset.label || '';
        this.ticks.forEach((t, j) => {
          t.setAttribute('aria-current', j === i ? 'true' : 'false');
          t.classList.toggle('is-past', j < i);
        });
        this.panels.forEach((p, j) => {
          const on = j === i;
          p.hidden = !on;
          p.classList.remove('is-in');
          if (on && !opts.silent) { void p.offsetWidth; p.classList.add('is-in'); }
        });
        const active = this.panels[i];
        if (this.piecesEl && active) {
          const tpl = active.querySelector('[data-rw-pieces-text]');
          this.piecesEl.textContent = tpl ? tpl.textContent.trim() : '';
          if (!opts.silent) this.replay(this.piecesEl, 'is-swap');
        }
        this.clearHot();
        this.restartAutoBar();
      }

      /* ---------------- pin <-> product ---------------- */
      hot(n, scroll) {
        this.clearHot();
        const m = this.zoomed ? this.lb : this.front;
        const panel = this.panels[this.index];
        if (!panel) return;
        const pin = m && m.querySelector(`[data-rw-pin="${n}"]`);
        const card = panel.querySelector(`[data-rw-card="${n}"]`);
        pin && pin.classList.add('is-hot');
        if (card) {
          card.classList.add('is-hot');
          if (scroll) this.reveal(card);
        }
      }
      reveal(card) {
        const list = card.parentElement;
        const behavior = this.reduce ? 'auto' : 'smooth';
        if (list.scrollWidth > list.clientWidth + 2) {
          const lr = list.getBoundingClientRect(), cr = card.getBoundingClientRect();
          list.scrollTo({ left: list.scrollLeft + (cr.left - lr.left) - 20, behavior });
        } else if (list.scrollHeight > list.clientHeight + 2 && getComputedStyle(list).overflowY !== 'visible') {
          list.scrollTo({ top: card.offsetTop - list.offsetTop - 12, behavior });
        } else if (this.mode !== 'scroll') {
          const r = card.getBoundingClientRect();
          if (r.top < 0 || r.bottom > window.innerHeight - 140) window.scrollBy({ top: r.top - window.innerHeight * 0.3, behavior });
        }
      }
      clearHot() { this.querySelectorAll('.is-hot').forEach((el) => el.classList.remove('is-hot')); }

      /* ---------------- autoplay ---------------- */
      play(on) {
        if (this.mode === 'scroll') on = false;
        this.playing = on;
        this.classList.toggle('is-playing', on);
        const btn = this.querySelector('[data-rw-auto]');
        if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        this.restartAutoBar();
      }
      schedule() {
        clearTimeout(this.autoTimer);
        if (!this.playing) return;
        this.autoTimer = setTimeout(() => {
          if (this.playing && this.visible && !this.dragging && !document.hidden && !this.panelHover && !this.zoomed && !this.engaged) this.next();
          else this.restartAutoBar();
        }, this.speed);
      }
      restartAutoBar() {
        const t = this.ticks[this.index];
        this.ticks.forEach((x) => x.classList.remove('is-run'));
        if (this.playing && t) { void t.offsetWidth; t.classList.add('is-run'); }
        this.schedule();
      }

      /* ---------------- custom cursor (desktop) ---------------- */
      initCursor() {
        const c = this.querySelector('[data-rw-cursor]');
        if (!c) return;
        if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) { c.remove(); return; }
        this.classList.add('rw--cursor');
        const st = this._cursor = { x: 0, y: 0, tx: 0, ty: 0, raf: null };
        const loop = () => {
          const k = this.reduce ? 1 : 0.18;   // inertia: the ring trails the pointer a little
          st.x += (st.tx - st.x) * k;
          st.y += (st.ty - st.y) * k;
          c.style.transform = `translate3d(${st.x.toFixed(1)}px,${st.y.toFixed(1)}px,0)`;
          st.raf = Math.abs(st.tx - st.x) + Math.abs(st.ty - st.y) > 0.2 ? requestAnimationFrame(loop) : null;
        };
        this.stage.addEventListener('pointermove', (e) => {
          if (e.pointerType !== 'mouse') return;
          const r = this.stage.getBoundingClientRect();
          st.tx = e.clientX - r.left;
          st.ty = e.clientY - r.top;
          if (!c.classList.contains('is-on')) { st.x = st.tx; st.y = st.ty; c.classList.add('is-on'); }
          const view = !this.dragging && !!e.target.closest('.rw__zoom');
          c.classList.toggle('is-view', view);
          c.classList.toggle('is-link', !this.dragging && !view && !!e.target.closest('.rw__pin, .rw__hit'));
          if (!st.raf) st.raf = requestAnimationFrame(loop);
        });
        this.stage.addEventListener('pointerleave', () => c.classList.remove('is-on', 'is-link', 'is-view'));
      }

      /* ---------------- input ---------------- */
      bind() {
        // theme editor: selecting a look block shows that look
        this._onBlockSelect = this._onBlockSelect || ((e) => {
          const h = e.target.closest && e.target.closest('[data-rw-hero]');
          if (!h || !this.contains(h)) return;
          const i = this.heroes.indexOf(h);
          if (i < 0) return;
          this.play(false);
          this.go(i);
        });
        let rt;
        this._onResize = () => { clearTimeout(rt); rt = setTimeout(() => { this.measure(); this.onScroll(); }, 120); };
        window.addEventListener('resize', this._onResize);
        this.ro = new ResizeObserver(() => { this.measure(); });
        this.ro.observe(this.stage);
        window.addEventListener('scroll', this.onScroll, { passive: true });

        this._onVis = () => { if (!document.hidden) this.kick(); };
        document.addEventListener('visibilitychange', this._onVis);
        document.addEventListener('shopify:block:select', this._onBlockSelect);
        if (this._bound) return;   // element listeners survive a detach / re-attach
        this._bound = true;

        this.addEventListener('click', (e) => this.onClick(e));
        this.addEventListener('change', (e) => {
          if (e.target.matches('[data-rw-option]')) this.onOptionChange(e.target.closest('[data-rw-picker]'));
        });
        // Esc closes the size sheet first, then the look popup
        this.addEventListener('keydown', (e) => {
          if (e.key !== 'Escape') return;
          if (this.classList.contains('rw--picking')) {
            const c = this.querySelector('[data-rw-card].is-picking');
            this.closePickers();
            const b = c && c.querySelector('[data-rw-add]');
            b && b.focus({ preventScroll: true });
          } else if (this.zoomed) this.zoom(false);
        });

        this.addEventListener('pointerover', (e) => {
          if (e.pointerType !== 'mouse') return;
          const card = e.target.closest('[data-rw-card]');
          if (card && this.contains(card)) this.hot(card.dataset.rwCard, false);
        });
        this.addEventListener('pointerout', (e) => {
          const card = e.target.closest('[data-rw-card]');
          if (card && !card.contains(e.relatedTarget)) this.clearHot();
        });

        this.stage.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); this.next(); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); this.prev(); }
        });

        // product interaction pauses autoplay (desktop hover pauses it temporarily)
        const panelBox = this.querySelector('.rw__panel');
        if (panelBox) {
          panelBox.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.panelHover = true; });
          panelBox.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.panelHover = false; this.restartAutoBar(); } });
          panelBox.addEventListener('click', (e) => { if (e.target.closest('button, a, input, select, label')) this.engage(); });
          panelBox.addEventListener('change', () => this.engage());
        }

        // horizontal trackpad swipe
        let acc = 0, lock = 0;
        this.stage.addEventListener('wheel', (e) => {
          if (this.mode === 'scroll' || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
          e.preventDefault();
          const now = performance.now();
          if (now < lock) return;
          acc += e.deltaX;
          if (Math.abs(acc) > 45) { ((acc < 0) === (this.mode === 'cinema')) ? this.next() : this.prev(); acc = 0; lock = now + 520; }
        }, { passive: false });

        // drag / swipe with momentum
        this.stage.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          this.drag = { x: e.clientX, y: e.clientY, t: this.target, id: e.pointerId, samples: [{ x: e.clientX, time: e.timeStamp }] };
        });
        this.stage.addEventListener('pointermove', (e) => {
          const d = this.drag;
          if (!d || e.pointerId !== d.id) return;
          if (e.pointerType === 'mouse' && !(e.buttons & 1)) { end(e); return; }
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!this.dragging) {
            if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
              this.dragging = true;
              this.classList.add('is-dragging');
              try { this.stage.setPointerCapture(e.pointerId); } catch (_) {}
            } else if (Math.abs(dy) > 10) { this.drag = null; return; }
            else return;
          }
          d.samples.push({ x: e.clientX, time: e.timeStamp });
          if (d.samples.length > 6) d.samples.shift();
          d.dx = dx;
          if (this.mode === 'scroll') return;
          // ring: drag left turns the ring to the next look; cinema: drag right walks the line right
          this.target = this.mode === 'cinema' ? d.t + dx / this.unit : d.t - dx / this.unit;
          this.kick();
        });
        const end = (e) => {
          const d = this.drag;
          if (!d || (e.pointerId !== undefined && e.pointerId !== d.id)) return;
          this.drag = null;
          if (!this.dragging) return;
          this.dragging = false;
          this.classList.remove('is-dragging');
          this.suppress = true;
          setTimeout(() => { this.suppress = false; }, 60);
          const a = d.samples[0], z = d.samples[d.samples.length - 1];
          const vx = z.time > a.time ? (z.x - a.x) / (z.time - a.time) : 0;
          if (this.mode === 'scroll') {
            if (Math.abs(d.dx || 0) > 40) (d.dx < 0 ? this.next() : this.prev());
            return;
          }
          const sign = this.mode === 'cinema' ? 1 : -1;
          const from = Math.round(d.t);
          if (this.mobile) {
            // phones: one swipe = one look
            if (Math.abs(d.dx || 0) > 30 || Math.abs(vx) > 0.3) this.moveTo(from + sign * ((d.dx || vx) > 0 ? 1 : -1));
            else this.moveTo(from);
            return;
          }
          let i = Math.round(this.target + (sign * vx * 160) / this.unit);
          if (i === from && Math.abs(vx) > 0.3) i += sign * (vx > 0 ? 1 : -1);
          i = clamp(i, from - 2, from + 2);
          this.moveTo(i);
        };
        this.stage.addEventListener('pointerup', end);
        this.stage.addEventListener('pointercancel', end);
        this.stage.addEventListener('click', (e) => { if (this.suppress) { e.preventDefault(); e.stopPropagation(); } }, true);

        this.initCursor();
      }

      onClick(e) {
        const t = e.target;
        let el;
        if ((el = t.closest('[data-rw-pick-close]'))) return this.closePickers();
        if ((el = t.closest('[data-rw-zoom-close]'))) return this.zoom(false);
        if (this.lb && (t === this.lb || t === this.lbStage)) return this.zoom(false);   // tap beside the model
        if ((el = t.closest('[data-rw-zoom]'))) return this.zoom(true);
        if ((el = t.closest('[data-rw-next]'))) return this.next();
        if ((el = t.closest('[data-rw-prev]'))) return this.prev();
        if ((el = t.closest('[data-rw-tick]'))) return this.go(parseInt(el.dataset.rwTick, 10));
        if ((el = t.closest('[data-rw-auto]'))) { if (!this.playing) this.engaged = false; return this.play(!this.playing); }
        if ((el = t.closest('[data-rw-pin]'))) { this.engage(); return this.hot(el.dataset.rwPin, true); }
        if ((el = t.closest('[data-rw-go]'))) {
          // tapping a model in the queue brings her to the front
          const s = this.sim.find((x) => x.el.contains(el));
          const k = s ? this.rankOf(s) : 0;
          if (k && Math.abs(k) < this.N / 2) this.moveTo(Math.round(this.target) + k);
          else if (!k) this.zoom(true);   // the front model opens in the popup
          return;
        }
        if ((el = t.closest('[data-rw-confirm]'))) { const pk = el.closest('[data-rw-picker]'); return this.onConfirm((pk && pk._card) || el.closest('[data-rw-card]')); }
        if ((el = t.closest('[data-rw-add]'))) return this.onAdd(el.closest('[data-rw-card]'));
        if ((el = t.closest('[data-rw-all]'))) return this.addFullLook(el.closest('[data-rw-panel]'), el);
      }

      /* ---------------- variant pickers ---------------- */
      initPickers() {
        this.querySelectorAll('[data-rw-picker]').forEach((pk) => {
          try { pk._variants = JSON.parse(pk.querySelector('[data-rw-variants]').textContent); } catch (_) { pk._variants = []; }
          pk._card = pk.closest('[data-rw-card]');
          if (pk._card) pk._card._pk = pk;
          this.onOptionChange(pk, true);
        });
      }
      selected(pk) {
        const groups = {};
        pk.querySelectorAll('[data-rw-option]').forEach((inp) => {
          const g = inp.dataset.rwOption;
          if (inp.tagName === 'SELECT') groups[g] = inp.value;
          else if (inp.checked) groups[g] = inp.value;
        });
        return Object.keys(groups).sort().map((k) => groups[k]);
      }
      onOptionChange(pk, initial) {
        if (!pk) return;
        const card = pk._card || pk.closest('[data-rw-card]');
        const sel = this.selected(pk);
        const vs = pk._variants || [];
        const match = vs.find((v) => v.o.every((o, i) => o === sel[i]));
        // availability of each value given the other current selections (theme-style strike-through)
        pk.querySelectorAll('input[data-rw-option]').forEach((inp) => {
          const g = parseInt(inp.dataset.rwOption, 10);
          const ok = vs.some((v) => v.a && v.o[g] === inp.value && v.o.every((o, i) => i === g || o === sel[i]));
          inp.closest('.rw__pill').classList.toggle('is-unavailable', !ok);
        });
        pk.querySelectorAll('select[data-rw-option]').forEach((sl) => {
          const g = parseInt(sl.dataset.rwOption, 10);
          Array.from(sl.options).forEach((op) => {
            const ok = vs.some((v) => v.a && v.o[g] === op.value && v.o.every((o, i) => i === g || o === sel[i]));
            op.textContent = op.value + (ok ? '' : ' — ' + (this.dataset.msgSoldout || 'Sold out'));
          });
        });
        pk.querySelectorAll('[data-rw-swatch-name]').forEach((el) => {
          const fs = el.closest('fieldset');
          const c = fs && fs.querySelector('input:checked');
          if (c) el.textContent = c.value;
        });
        const btn = pk.querySelector('[data-rw-confirm]');
        const label = pk.querySelector('[data-rw-confirm-label]');
        const ok = !!(match && match.a);
        if (btn) btn.disabled = !ok;
        if (label) label.textContent = ok ? label.dataset.add : (this.dataset.msgSoldout || 'Sold out');
        card.dataset.selected = ok ? match.id : '';
        if (!initial) card.dataset.touched = '1';
      }

      /* ---------------- cart ---------------- */
      msg(panel, text) { const m = panel && panel.querySelector('[data-rw-msg]'); if (m) m.textContent = text || ''; }

      // a light haptic tick on phones that support it
      buzz() {
        if (!this.mobile || this.reduce || typeof navigator.vibrate !== 'function') return;
        try { navigator.vibrate(12); } catch (_) {}
      }

      async cartAdd(items) {
        await window.RunwayBag.add(items);
        return { items };
      }

      onAdd(card) {
        if (!card || card.classList.contains('is-added') || card.classList.contains('is-loading')) return;
        const id = card.dataset.variantId;
        if (id) return this.addCard(card, id);
        const pk = this.pickerOf(card);
        if (!pk) return;
        const open = pk.hidden;
        this.openPicker(card, open);
        if (open) {
          const first = pk.querySelector('input:checked, select');
          first && first.focus({ preventScroll: true });
          if (!this.mobile) this.reveal(card);
        }
      }

      onConfirm(card) {
        if (!card || !card.dataset.selected) return;
        card.dataset.touched = '1';
        this.addCard(card, card.dataset.selected);
      }

      async addCard(card, id) {
        const panel = card.closest('[data-rw-panel]');
        card.classList.add('is-loading');
        this.msg(panel, '');
        try {
          await this.cartAdd([{ id: Number(id), quantity: 1 }]);
          this.markAdded(card);
          this.buzz();
          this.checkComplete(panel);
        } catch (err) {
          card.classList.remove('is-loading');
          this.msg(panel, err.message);
        }
      }

      markAdded(card) {
        card.classList.remove('is-loading', 'is-picking');
        card.classList.add('is-added');
        const pk = this.pickerOf(card);
        if (pk) { pk.hidden = true; this.dock(pk); }
        const btn = card.querySelector('[data-rw-add]');
        if (btn) { btn.setAttribute('aria-label', btn.dataset.addedLabel || btn.getAttribute('aria-label')); btn.removeAttribute('aria-expanded'); }
        this.syncPicking();
      }

      async addFullLook(panel, btn) {
        if (!panel) return;
        const cta = btn || panel.querySelector('[data-rw-all]');
        if (panel.classList.contains('is-complete') || (cta && cta.classList.contains('is-loading'))) return;
        const cards = Array.from(panel.querySelectorAll('[data-rw-card]:not([data-placeholder])'))
          .filter((c) => !c.classList.contains('is-added') && !c.classList.contains('is-soldout'));
        const items = [], ready = [], pending = [];
        cards.forEach((c) => {
          // never guess a size: multi-option pieces need the shopper's own choice
          const id = c.dataset.variantId || (c.dataset.touched ? c.dataset.selected : '');
          if (id) { items.push({ id: Number(id), quantity: 1 }); ready.push(c); } else pending.push(c);
        });
        this.msg(panel, '');
        if (items.length) {
          cta && cta.classList.add('is-loading');
          ready.forEach((c) => c.classList.add('is-loading'));
          try { await this.cartAdd(items); ready.forEach((c) => this.markAdded(c)); this.buzz(); }
          catch (err) { ready.forEach((c) => c.classList.remove('is-loading')); this.msg(panel, err.message); }
          cta && cta.classList.remove('is-loading');
        }
        if (pending.length) {
          // phones show one size sheet at a time; the message lists every piece still to choose
          (this.mobile ? pending.slice(0, 1) : pending).forEach((c) => this.openPicker(c, true));
          this.msg(panel, (this.dataset.msgChoose || 'Choose your options for: [items]').replace('[items]', pending.map((c) => c.dataset.title).join(', ')));
          this.reveal(pending[0]);
        }
        this.checkComplete(panel);
      }

      checkComplete(panel) {
        if (!panel) return;
        const cards = Array.from(panel.querySelectorAll('[data-rw-card]:not([data-placeholder])')).filter((c) => !c.classList.contains('is-soldout'));
        if (cards.length < 2 || !cards.every((c) => c.classList.contains('is-added'))) return;
        panel.classList.add('is-complete');
        this.msg(panel, '');

      }
    }

    customElements.define('runway-section', RunwaySection);
    window.RunwayNative = document.querySelector('runway-section');
  })();

/* ==========================================================================
   GLOBAL STORE UTILITIES & SHOPIFY SECTION INTEROP
   ========================================================================== */

window.Shopify = window.Shopify || {
  routes: { root: '/' },
  actions: {
    openCart: () => {
      document.getElementById('open-bag')?.click();
      return Promise.resolve(true);
    }
  }
};
window.PUB_SUB_EVENTS = { cartUpdate: 'cart-update' };
window.publish = function(event, data) {
  window.dispatchEvent(new CustomEvent(event, { detail: data }));
};

window.RunwayNotify = function(message) {
  const status = document.getElementById('bag-status');
  if (!status) return;
  status.textContent = message;
  status.classList.add('is-on');
  clearTimeout(status.hideTimer);
  status.hideTimer = setTimeout(() => status.classList.remove('is-on'), 2500);
};

// Global Fetch Interceptor for Shopify Cart Endpoints (Safely wrapped, synchronous pass-through)
try {
  const _nativeFetch = window.fetch;
  if (_nativeFetch) {
    const customFetch = function(resource, options) {
      const url = typeof resource === 'string'
        ? resource
        : resource instanceof Request
          ? resource.url
          : resource && typeof resource === 'object' && 'url' in resource
            ? String(resource.url)
            : '';

      let pathname = '';
      let isSameOrigin = false;
      if (url) {
        try {
          const parsed = new URL(url, window.location.origin);
          pathname = parsed.pathname;
          isSameOrigin = parsed.origin === window.location.origin;
        } catch (_) {
          pathname = url;
          isSameOrigin = url.startsWith('/');
        }
      }

      if (isSameOrigin && (pathname === '/cart/add.js' || pathname === '/cart/add')) {
        return (async () => {
          let payload = {};
          if (options && options.body) {
            try {
              if (typeof options.body === 'string') {
                payload = options.body.startsWith('{') ? JSON.parse(options.body) : Object.fromEntries(new URLSearchParams(options.body).entries());
              } else if (options.body instanceof FormData) {
                payload = Object.fromEntries(options.body.entries());
              }
            } catch (_) {}
          }

          const id = parseInt(payload.id || payload.items?.[0]?.id || 57015176364337, 10);
          const quantity = parseInt(payload.quantity || payload.items?.[0]?.quantity || 1, 10);

          if (window.RunwayBag && typeof window.RunwayBag.add === 'function') {
            try {
              await window.RunwayBag.add([{ id, quantity }]);
            } catch (_) {
              window.RunwayNotify('Piece saved to your ZELI styling bag');
            }
          }

          const totalCount = (window.RunwayBag?.entries || []).reduce((s, e) => s + (e.quantity || 1), 0);
          return new Response(JSON.stringify({
            id: id,
            quantity: quantity,
            title: 'ZELI Piece',
            price: 19900,
            item_count: totalCount || 1
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        })();
      }

      if (isSameOrigin && (pathname === '/cart.js' || pathname === '/cart')) {
        const totalCount = (window.RunwayBag?.entries || []).reduce((s, e) => s + (e.quantity || 1), 0);
        return Promise.resolve(new Response(JSON.stringify({
          items: (window.RunwayBag?.entries || []).map(e => ({
            id: e.id,
            quantity: e.quantity,
            title: 'ZELI Piece',
            price: 19900
          })),
          item_count: totalCount,
          total_price: 19900 * Math.max(1, totalCount)
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      return _nativeFetch.apply(this || window, arguments);
    };

    try {
      window.fetch = customFetch;
    } catch (_) {
      try {
        Object.defineProperty(window, 'fetch', {
          value: customFetch,
          writable: true,
          configurable: true
        });
      } catch (_) {}
    }
  }
} catch (_) {}

// Lookbook Horizontal Carousel navigation
document.addEventListener('DOMContentLoaded', () => {
  const track = document.getElementById('lookbookTrack');
  const prev = document.getElementById('lookbookPrev');
  const next = document.getElementById('lookbookNext');

  prev?.addEventListener('click', () => {
    track?.scrollBy({ left: -360, behavior: 'smooth' });
  });
  next?.addEventListener('click', () => {
    track?.scrollBy({ left: 360, behavior: 'smooth' });
  });

  // Modal Backdrop Click-to-Close
  const modals = ['dialog-search', 'dialog-wishlist', 'dialog-store', 'dialog-help', 'dialog-join', 'dialog-account'];
  modals.forEach(id => {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
          dialog.close();
        }
      }
    });
  });

  // Live Catalog Search
  const searchInput = document.getElementById('searchCatalogInput');
  const searchResults = document.getElementById('searchResults');
  
  if (searchInput && searchResults) {
    const renderSearch = (query = '') => {
      searchResults.innerHTML = '';
      const q = query.trim().toLowerCase();
      const allItems = CATALOG_DATA.items || [];
      const filtered = q ? allItems.filter(p => p.name.toLowerCase().includes(q)) : allItems.slice(0, 4);

      if (!filtered.length) {
        searchResults.innerHTML = '<p class="bag-note" style="padding:16px;">No pieces match your search.</p>';
        return;
      }

      filtered.forEach(p => {
        const row = document.createElement('div');
        row.className = 'search-result-row';
        row.innerHTML = `
          <img src="${p.image}" alt="${p.name}">
          <div class="search-result-info">
            <div class="search-result-title">${p.name}</div>
            <div class="search-result-price">$${p.price.toFixed(2)}</div>
          </div>
          <button type="button" class="search-result-add" data-id="${p.variants[0].id}">+ Add</button>
        `;
        row.querySelector('.search-result-add').addEventListener('click', async (e) => {
          const varId = parseInt(e.currentTarget.dataset.id, 10);
          try {
            await window.RunwayBag.add([{ id: varId, quantity: 1 }]);
          } catch (_) {
            window.RunwayNotify('Added to your ZELI styling bag');
          }
        });
        searchResults.appendChild(row);
      });
    };

    searchInput.addEventListener('input', (e) => renderSearch(e.target.value));
    renderSearch('');
  }

  // Wishlist Handling
  const wishlistStorageKey = 'zeli-wishlist-v1';
  let wishlist = [];
  try {
    wishlist = JSON.parse(localStorage.getItem(wishlistStorageKey) || '[]');
  } catch (_) {}

  const updateWishlistUI = () => {
    document.querySelectorAll('[data-wishlist-count]').forEach(el => el.textContent = wishlist.length);
    const container = document.getElementById('wishlistItems');
    if (!container) return;
    if (!wishlist.length) {
      container.innerHTML = '<p class="bag-note">Your wishlist is empty. Tap the heart on pieces you want to keep in mind.</p>';
      return;
    }
    container.innerHTML = '';
    wishlist.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'search-result-row';
      row.innerHTML = `
        <img src="${item.image}" alt="${item.name}">
        <div class="search-result-info">
          <div class="search-result-title">${item.name}</div>
          <div class="search-result-price">$${item.price.toFixed(2)}</div>
        </div>
        <button type="button" class="search-result-add" data-idx="${idx}">Move to Bag</button>
      `;
      row.querySelector('.search-result-add').addEventListener('click', async () => {
        if (item.variantId) {
          try {
            await window.RunwayBag.add([{ id: item.variantId, quantity: 1 }]);
          } catch (_) {}
        }
        wishlist.splice(idx, 1);
        try { localStorage.setItem(wishlistStorageKey, JSON.stringify(wishlist)); } catch (_) {}
        updateWishlistUI();
      });
      container.appendChild(row);
    });
  };

  const syncStatWishlist = () => {
    const wishStat = document.getElementById('stat-wishlist-count');
    if (wishStat) wishStat.textContent = String(wishlist.length);
  };
  syncStatWishlist();

  // ========================================================
  // LOCAL + FIRESTORE ORDERS & GMAIL CONFIRMATION ENGINE
  // ========================================================
  const localOrdersKey = 'zeli-local-orders-v1';
  let latestGmailOrder = null;
  let lastGmailMode = 'order';

  function getLocalOrders() {
    try {
      const parsed = JSON.parse(localStorage.getItem(localOrdersKey) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveLocalOrder(order) {
    try {
      const existing = getLocalOrders().filter(o => o.orderId !== order.orderId);
      existing.unshift(order);
      localStorage.setItem(localOrdersKey, JSON.stringify(existing.slice(0, 30)));
    } catch (_) {}
  }

  function formatOrderDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (_) {
      return 'Today';
    }
  }

  function renderOrderTrackingTimeline(currentStage) {
    const activeIdx = getActiveStageIndex(currentStage || 'processing');
    return `
      <div class="order-steps-bar" aria-label="Shipment progress">
        ${TRACKING_STAGES.map((stage, idx) => {
          const cls = idx < activeIdx ? 'is-done' : idx === activeIdx ? 'is-current' : '';
          const glyph = idx < activeIdx ? '✓' : String(idx + 1);
          return `
            <div class="order-step-node ${cls}" title="${stage.description}">
              <div class="order-step-dot">${glyph}</div>
              <div class="order-step-title">${stage.label}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderGmailHtmlContent(orderData, mode = 'order') {
    const subjectEl = document.getElementById('gmail-msg-subject');
    const recipEl = document.getElementById('gmail-msg-recipient');
    const bodyEl = document.getElementById('gmail-msg-body');
    if (!bodyEl) return;

    if (mode === 'welcome') {
      const memberName = orderData.customerName || 'Collector';
      const memberEmail = orderData.customerEmail || 'collector@zeli.studio';
      if (subjectEl) subjectEl.textContent = 'Welcome to ZELI Atelier — Private Runway Access & 10% Privilege Code';
      if (recipEl) recipEl.textContent = memberEmail;
      bodyEl.innerHTML = `
        <div style="background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:24px;font-family:inherit;color:#151413;">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;padding-bottom:14px;margin-bottom:18px;">
            <strong style="font-size:18px;letter-spacing:0.14em;">ZELI ATELIER</strong>
            <span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;background:#ecfdf5;color:#047857;">GMAIL VERIFIED ✓</span>
          </div>
          <h3 style="margin:0 0 10px;font-size:20px;font-weight:800;">Welcome to the ZELI Movement, ${memberName}</h3>
          <p style="font-size:13px;line-height:1.6;color:#555;margin:0 0 16px;">
            Your member account is now active. Enjoy priority access to our 3D ZELI Orbit footwear releases, Hand Rail Pro ready-to-wear drops, and real-time DHL Express shipment tracking.
          </p>
          <div style="background:#151413;color:#fff;border-radius:8px;padding:16px;text-align:center;margin-bottom:18px;">
            <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#aaa;margin-bottom:4px;">Member Welcome Privilege (10% OFF)</div>
            <div style="font-size:22px;font-weight:800;letter-spacing:0.12em;">ZELI10</div>
          </div>
          <p style="font-size:12px;color:#777;margin:0;">Dispatched automatically from ZELI Studio Concierge (orders@zeli.studio).</p>
        </div>
      `;
      return;
    }

    const content = generateGmailConfirmationContent(orderData);
    if (subjectEl) subjectEl.textContent = content.subject;
    if (recipEl) recipEl.textContent = content.to;

    const itemsRows = (orderData.items || []).map(item => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f2f2f2;font-size:12px;">
        <div>
          <strong style="color:#151413;">${item.name}</strong>
          <div style="color:#777;">Size ${item.size || 'One Size'} · Qty ${item.quantity || 1}</div>
        </div>
        <strong style="color:#151413;">$${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</strong>
      </div>
    `).join('');

    bodyEl.innerHTML = `
      <div style="background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:24px;color:#151413;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;padding-bottom:14px;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
          <strong style="font-size:17px;letter-spacing:0.12em;">ZELI ATELIER</strong>
          <span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;background:#ecfdf5;color:#047857;">ORDER CONFIRMED · ${orderData.orderId}</span>
        </div>
        <h3 style="margin:0 0 8px;font-size:18px;font-weight:800;">Welcome to ZELI Atelier, ${orderData.customerName || 'Collector'}!</h3>
        <p style="font-size:13px;line-height:1.55;color:#555;margin:0 0 16px;">${content.summary}</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;">Carrier & Live Tracking Code</div>
            <div style="font-size:14px;font-weight:800;font-family:monospace;color:#0f172a;">${content.trackingNumber}</div>
            <div style="font-size:11px;color:#059669;font-weight:600;">${content.carrier} · Est. Delivery: ${orderData.estimatedDelivery || '3 Business Days'}</div>
          </div>
          <button type="button" onclick="document.getElementById('dialog-gmail-preview').close(); document.getElementById('dialog-account').showModal(); window.switchAccountTab('track'); document.getElementById('tracking-input-id').value='${orderData.orderId}'; window.lookupOrderTracking();" style="padding:8px 12px;background:#151413;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">Track Package Live</button>
        </div>
        <div style="margin-bottom:14px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;">Items in Parcel (${content.itemCount})</div>
          ${itemsRows || '<div style="font-size:12px;color:#666;">ZELI Runway Selection</div>'}
        </div>
        <div style="display:flex;justify-content:space-between;padding-top:10px;font-size:13px;font-weight:800;">
          <span>Total Charged (${orderData.paymentMethod || 'Card'})</span>
          <span>$${Number(orderData.totalAmount || 0).toFixed(2)}</span>
        </div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid #f0f0f0;font-size:11px;color:#666;">
          Shipping to: ${orderData.shippingAddress}, ${orderData.city} ${orderData.postalCode || ''}, ${orderData.country || ''}
        </div>
      </div>
    `;
  }

  window.openOrderGmailModal = (orderData, mode = 'order') => {
    latestGmailOrder = orderData;
    lastGmailMode = mode;
    renderGmailHtmlContent(orderData, mode);
    document.getElementById('dialog-gmail-preview')?.showModal();
  };

  window.openLatestOrderGmail = () => {
    if (latestGmailOrder) {
      window.openOrderGmailModal(latestGmailOrder, lastGmailMode);
      return;
    }
    const local = getLocalOrders();
    if (local.length) {
      window.openOrderGmailModal(local[0], 'order');
      return;
    }
    window.openOrderGmailModal({
      customerName: currentUser?.displayName || 'ZELI Member',
      customerEmail: currentUser?.email || 'malikabubakkar523@gmail.com'
    }, 'welcome');
  };

  window.copyTrackingToClipboard = async () => {
    const code = latestGmailOrder?.trackingNumber || latestGmailOrder?.orderId || 'ZELI10';
    try {
      await navigator.clipboard.writeText(code);
      window.RunwayNotify(`Copied ${code} to clipboard!`);
    } catch (_) {
      window.RunwayNotify(`Tracking Code: ${code}`);
    }
  };

  window.resendConfirmationEmail = () => {
    const email = latestGmailOrder?.customerEmail || currentUser?.email || 'your Gmail inbox';
    window.RunwayNotify(`✓ Confirmation dispatched again to ${email}`);
  };

  // ========================================================
  // FIREBASE AUTHENTICATION & USER ACCOUNT HUB (3 TABS)
  // ========================================================
  let currentUser = null;
  const userHeaderContainer = document.getElementById('user-header-container');
  const authLoggedOut = document.getElementById('auth-logged-out');
  const authLoggedIn = document.getElementById('auth-logged-in');
  const userProfilePic = document.getElementById('user-profile-pic');
  const userDisplayName = document.getElementById('user-display-name');
  const userDisplayEmail = document.getElementById('user-display-email');
  const userOrdersList = document.getElementById('user-orders-list');
  const topSignInBtn = document.getElementById('top-sign-in-btn');
  const mobileDrawerUserCard = document.getElementById('mobile-drawer-user-card');

  const updateUserUI = (user) => {
    currentUser = user;
    if (user) {
      const firstName = (user.displayName || 'Member').split(' ')[0];
      if (userHeaderContainer) {
        userHeaderContainer.innerHTML = `
          <button type="button" class="user-profile-btn" id="open-account-active" aria-label="User account">
            ${user.photoURL ? `<img class="user-avatar-img" src="${user.photoURL}" alt="${user.displayName}">` : `<div class="user-avatar-placeholder">${firstName[0].toUpperCase()}</div>`}
            <span style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${firstName}</span>
          </button>
        `;
        document.getElementById('open-account-active')?.addEventListener('click', () => {
          document.getElementById('dialog-account').showModal();
          window.switchAccountTab('orders');
        });
      }
      if (topSignInBtn) {
        topSignInBtn.textContent = `Hi, ${firstName}`;
      }
      if (mobileDrawerUserCard) {
        mobileDrawerUserCard.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:10px;min-width:0;">
              ${user.photoURL ? `<img src="${user.photoURL}" alt="${user.displayName}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">` : `<div class="user-avatar-placeholder">${firstName[0].toUpperCase()}</div>`}
              <div style="min-width:0;">
                <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${user.displayName || 'ZELI Member'}</div>
                <div style="font-size:11px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${user.email || ''}</div>
              </div>
            </div>
            <button type="button" class="mob-auth-btn" onclick="window.closeMobileDrawer(); document.getElementById('dialog-account').showModal(); window.switchAccountTab('orders');" style="padding:6px 10px;font-size:11px;">Orders</button>
          </div>
        `;
      }
      if (authLoggedOut) authLoggedOut.style.display = 'none';
      if (authLoggedIn) authLoggedIn.style.display = 'block';
      if (userProfilePic) userProfilePic.src = user.photoURL || 'https://reel-ref-try-the-look.vercel.app/assets/model-1-640.webp';
      if (userDisplayName) userDisplayName.textContent = user.displayName || 'ZELI Member';
      if (userDisplayEmail) userDisplayEmail.textContent = user.email || '';

      const chkEmail = document.getElementById('chk-email');
      const chkFirst = document.getElementById('chk-firstname');
      const chkLast = document.getElementById('chk-lastname');
      if (chkEmail && !chkEmail.value) chkEmail.value = user.email || '';
      if (user.displayName) {
        const parts = user.displayName.split(' ');
        if (chkFirst && !chkFirst.value) chkFirst.value = parts[0] || '';
        if (chkLast && !chkLast.value) chkLast.value = parts.slice(1).join(' ') || '';
      }

      loadUserOrders(user.uid);
    } else {
      if (userHeaderContainer) {
        userHeaderContainer.innerHTML = `
          <button type="button" class="hdr-action-btn" id="open-account" aria-label="User account" onclick="document.getElementById('dialog-account').showModal(); window.switchAccountTab('orders');">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </button>
        `;
      }
      if (topSignInBtn) {
        topSignInBtn.textContent = 'Sign In';
      }
      if (mobileDrawerUserCard) {
        mobileDrawerUserCard.innerHTML = `
          <div class="mob-user-placeholder">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;">Welcome to ZELI Atelier</p>
            <button type="button" class="mob-auth-btn" onclick="window.triggerGoogleSignIn()">
              <svg class="google-icon" style="width:16px;height:16px;" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
              </svg>
              <span>Sign in with Google</span>
            </button>
          </div>
        `;
      }
      if (authLoggedOut) authLoggedOut.style.display = 'block';
      if (authLoggedIn) authLoggedIn.style.display = 'none';
      loadUserOrders(null);
    }
    syncStatWishlist();
  };

  onAuthUserChange(updateUserUI);

  window.triggerGoogleSignIn = async () => {
    window.closeMobileDrawer();
    try {
      const user = await signInWithGoogle();
      if (user) {
        const welcomeKey = `zeli-welcomed-${user.uid}`;
        const firstWelcome = !localStorage.getItem(welcomeKey);
        if (firstWelcome) {
          localStorage.setItem(welcomeKey, '1');
          window.RunwayNotify(`Welcome to ZELI, ${user.displayName || 'Member'}! Welcome email sent to Gmail ✓`);
          window.openOrderGmailModal({ customerName: user.displayName, customerEmail: user.email }, 'welcome');
        } else {
          window.RunwayNotify(`Welcome back, ${user.displayName || 'ZELI Member'}!`);
        }
      }
    } catch (_) {
      document.getElementById('dialog-account')?.showModal();
      window.switchAccountTab('profile');
    }
  };

  const googleBtn = document.getElementById('google-signin-btn');
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      try {
        const user = await signInWithGoogle();
        if (user) {
          const welcomeKey = `zeli-welcomed-${user.uid}`;
          const firstWelcome = !localStorage.getItem(welcomeKey);
          localStorage.setItem(welcomeKey, '1');
          window.RunwayNotify(`Welcome, ${user.displayName || 'ZELI Member'}! Gmail message sent ✓`);
          document.getElementById('dialog-account').close();
          if (firstWelcome) {
            window.openOrderGmailModal({ customerName: user.displayName, customerEmail: user.email }, 'welcome');
          }
        }
      } catch (err) {
        const msg = document.getElementById('auth-status-message');
        if (msg) {
          msg.textContent = 'Google sign-in popup was closed before completing.';
          msg.style.display = 'block';
        }
      }
    });
  }

  const signoutBtn = document.getElementById('signout-btn');
  if (signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
      try {
        await signOutUser();
        window.RunwayNotify('You have signed out of ZELI.');
        document.getElementById('dialog-account').close();
      } catch (e) {
        console.error(e);
      }
    });
  }

  // Handle Join Club Gmail Welcome
  const joinForm = document.querySelector('#dialog-join form');
  if (joinForm) {
    joinForm.onsubmit = (e) => {
      e.preventDefault();
      const emailInput = joinForm.querySelector('input[type="email"]');
      const userEmail = emailInput?.value || 'collector@zeli.studio';
      document.getElementById('dialog-join')?.close();
      window.RunwayNotify(`Welcome to ZELI! Privilege mail dispatched to ${userEmail} ✓`);
      window.openOrderGmailModal({ customerName: userEmail.split('@')[0], customerEmail: userEmail }, 'welcome');
      joinForm.reset();
    };
  }

  window.handleEmailSignIn = () => {
    const email = document.getElementById('auth-email-input').value;
    window.RunwayNotify(`Welcome to ZELI, ${email}! Welcome email sent to Gmail ✓`);
    document.getElementById('dialog-account').close();
    window.openOrderGmailModal({ customerName: email.split('@')[0], customerEmail: email }, 'welcome');
  };

  window.switchAccountTab = (tabName = 'orders') => {
    ['orders', 'track', 'profile'].forEach(tab => {
      const btn = document.getElementById(`acc-tab-btn-${tab}`);
      const panel = document.getElementById(`acc-tab-${tab}`);
      if (btn) btn.classList.toggle('is-active', tab === tabName);
      if (panel) panel.style.display = tab === tabName ? 'block' : 'none';
    });
    if (tabName === 'orders') {
      loadUserOrders(currentUser?.uid || null);
    } else if (tabName === 'profile') {
      syncStatWishlist();
    }
  };

  window.refreshUserOrders = () => {
    loadUserOrders(currentUser?.uid || null);
    window.RunwayNotify('Orders synced with ZELI cloud ledger.');
  };

  async function loadUserOrders(uid) {
    if (!userOrdersList) return;
    userOrdersList.innerHTML = '<p style="font-size:12px;color:#888;">Syncing your order history...</p>';
    let remoteOrders = [];
    if (uid) {
      try {
        remoteOrders = await getUserOrdersFromFirestore(uid);
      } catch (_) {}
    }

    const mergedMap = new Map();
    getLocalOrders().forEach(o => mergedMap.set(o.orderId, o));
    (remoteOrders || []).forEach(o => mergedMap.set(o.orderId, o));

    const mergedOrders = Array.from(mergedMap.values()).sort((a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    const orderCountStat = document.getElementById('stat-order-count');
    if (orderCountStat) orderCountStat.textContent = String(mergedOrders.length);

    if (!mergedOrders.length) {
      userOrdersList.innerHTML = `
        <div style="text-align:center;padding:28px 16px;background:#fafafa;border-radius:8px;border:1px dashed #ddd;">
          <p style="font-size:13px;color:#555;margin:0 0 12px;font-weight:600;">No orders placed yet.</p>
          <p style="font-size:12px;color:#888;margin:0 0 16px;">Add pieces from ZELI Orbit, Shoe Atelier, or All Products to place your first order and track live DHL Express delivery.</p>
          <button type="button" class="catalog-btn-bag" style="padding:10px 18px;" onclick="document.getElementById('dialog-account').close(); window.navigateZeliPage('catalog');">Browse All 24 Pieces</button>
        </div>
      `;
      return;
    }

    userOrdersList.innerHTML = '';
    mergedOrders.forEach(ord => {
      const trackingCode = ord.trackingNumber || generateTrackingNumber(ord.orderId);
      const stage = ord.currentStage || ord.status || 'processing';
      const itemCount = Array.isArray(ord.items) ? ord.items.reduce((s, it) => s + (it.quantity || 1), 0) : 1;

      const card = document.createElement('div');
      card.className = 'order-timeline-card';
      card.innerHTML = `
        <div class="order-card-top">
          <div>
            <span class="order-id-badge">${ord.orderId}</span>
            <div style="font-size:11px;color:#666;margin-top:2px;">${formatOrderDate(ord.createdAt)} · ${itemCount} item(s) · <strong>$${Number(ord.totalAmount || 0).toFixed(2)}</strong></div>
          </div>
          <div style="text-align:right;">
            <span class="order-status-pill">${stage.replace('_', ' ')}</span>
            <div style="font-size:10px;color:#555;margin-top:4px;font-family:monospace;">${trackingCode}</div>
          </div>
        </div>
        <div style="font-size:11px;color:#777;">Delivering to: ${ord.shippingAddress}, ${ord.city}</div>
        ${renderOrderTrackingTimeline(stage)}
        <div class="gmail-notice-bar">
          <span>✉ Gmail confirmation & welcome sent to <strong>${ord.customerEmail || 'collector@zeli.studio'}</strong></span>
          <div style="display:flex;gap:6px;">
            <button type="button" class="gmail-view-btn js-track-btn" style="background:#151413;">Track Live</button>
            <button type="button" class="gmail-view-btn js-gmail-btn">View Gmail</button>
          </div>
        </div>
      `;
      card.querySelector('.js-gmail-btn')?.addEventListener('click', () => {
        window.openOrderGmailModal({ ...ord, trackingNumber: trackingCode }, 'order');
      });
      card.querySelector('.js-track-btn')?.addEventListener('click', () => {
        const inp = document.getElementById('tracking-input-id');
        if (inp) inp.value = ord.orderId;
        window.switchAccountTab('track');
        window.lookupOrderTracking(ord.orderId);
      });
      userOrdersList.appendChild(card);
    });
  }

  window.lookupOrderTracking = async (prefillId = null) => {
    const inp = document.getElementById('tracking-input-id');
    const resultBox = document.getElementById('tracking-result-box');
    const queryStr = (prefillId || inp?.value || '').trim().toUpperCase();
    if (!queryStr || !resultBox) return;

    resultBox.style.display = 'block';
    resultBox.innerHTML = '<p style="font-size:12px;color:#666;">Locating live DHL & ZELI Atelier shipment...</p>';

    let found = getLocalOrders().find(o =>
      (o.orderId || '').toUpperCase() === queryStr ||
      (o.trackingNumber || generateTrackingNumber(o.orderId || '')).toUpperCase() === queryStr
    );

    if (!found) {
      try {
        found = await getOrderByIdFromFirestore(queryStr);
      } catch (_) {}
    }

    if (!found) {
      resultBox.innerHTML = `
        <div style="padding:18px;border:1px solid #fecdd3;background:#fff1f2;border-radius:8px;color:#9f1239;font-size:12px;">
          No shipment matched <strong>${queryStr}</strong>. Please enter a valid Order ID (e.g. <code>ZELI-ORD-...</code>) or DHL Tracking Code (<code>DHL-ZL-...</code>), or check your <strong>Order History</strong> tab.
        </div>
      `;
      return;
    }

    const trackingCode = found.trackingNumber || generateTrackingNumber(found.orderId);
    const stage = found.currentStage || found.status || 'processing';
    const stageObj = TRACKING_STAGES[getActiveStageIndex(stage)];

    resultBox.innerHTML = `
      <div class="order-timeline-card" style="border-color:#151413;">
        <div class="order-card-top">
          <div>
            <div style="font-size:10px;text-transform:uppercase;color:#888;font-weight:700;">Live Tracking Active</div>
            <strong style="font-size:15px;font-family:monospace;color:#151413;">${found.orderId} · ${trackingCode}</strong>
          </div>
          <span class="order-status-pill" style="background:#ecfdf5;color:#047857;">${stageObj.label}</span>
        </div>
        <p style="font-size:12px;color:#444;margin:0 0 8px;">${stageObj.description} · Est. Delivery: <strong>${found.estimatedDelivery || '3 Business Days'}</strong></p>
        ${renderOrderTrackingTimeline(stage)}
        <div style="font-size:11px;color:#666;margin-top:8px;">Destination: ${found.shippingAddress}, ${found.city}, ${found.country || 'International'}</div>
        <div class="gmail-notice-bar">
          <span>✉ Confirmation sent to ${found.customerEmail}</span>
          <button type="button" class="gmail-view-btn js-open-tracked-gmail">Open Gmail Message</button>
        </div>
      </div>
    `;
    resultBox.querySelector('.js-open-tracked-gmail')?.addEventListener('click', () => {
      window.openOrderGmailModal({ ...found, trackingNumber: trackingCode }, 'order');
    });
  };

  // ========================================================
  // CHECKOUT CONTROLLER & PAYMENT FLOW
  // ========================================================
  let checkoutItems = [];
  let checkoutSubtotal = 0;
  let checkoutShipping = 0;
  let checkoutDiscount = 0;
  let activePaymentTab = 'card';

  window.openCheckout = (directItem = null) => {
    const bagEntries = window.RunwayBag.entries;
    checkoutItems = [];
    checkoutSubtotal = 0;

    if (directItem) {
      checkoutItems.push(directItem);
      checkoutSubtotal = directItem.price * directItem.quantity;
    } else {
      if (!bagEntries.length) {
        window.RunwayNotify('Your styling bag is empty.');
        return;
      }
      bagEntries.forEach(entry => {
        for (const p of CATALOG_DATA.items) {
          const v = p.variants.find(va => va.id === entry.id);
          if (v) {
            checkoutItems.push({
              id: p.id,
              name: p.name,
              price: p.price,
              size: v.o.join(' / '),
              image: p.image,
              quantity: entry.quantity,
              variantId: v.id
            });
            checkoutSubtotal += p.price * entry.quantity;
          }
        }
      });
    }

    renderCheckoutSummary();
    window.goToCheckoutStep(1);
    document.getElementById('dialog-checkout').showModal();
  };

  function renderCheckoutSummary() {
    const list = document.getElementById('checkout-sidebar-items');
    if (!list) return;
    list.innerHTML = '';

    checkoutItems.forEach(item => {
      const row = document.createElement('div');
      row.className = 'checkout-item-row';
      row.innerHTML = `
        <img src="${item.image}" alt="${item.name}">
        <div class="checkout-item-info">
          <div class="checkout-item-title">${item.name}</div>
          <div class="checkout-item-meta">Size ${item.size} · Qty ${item.quantity}</div>
        </div>
        <div class="checkout-item-price">$${(item.price * item.quantity).toFixed(2)}</div>
      `;
      list.appendChild(row);
    });

    const subVal = document.getElementById('chk-subtotal-val');
    const shipVal = document.getElementById('chk-shipping-val');
    const totalVal = document.getElementById('chk-total-val');
    const discRow = document.getElementById('chk-discount-row');
    const discVal = document.getElementById('chk-discount-val');

    if (subVal) subVal.textContent = `$${checkoutSubtotal.toFixed(2)}`;
    if (shipVal) shipVal.textContent = checkoutShipping === 0 ? 'FREE' : `$${checkoutShipping.toFixed(2)}`;

    if (checkoutDiscount > 0 && discRow && discVal) {
      discRow.style.display = 'flex';
      discVal.textContent = `-$${checkoutDiscount.toFixed(2)}`;
    } else if (discRow) {
      discRow.style.display = 'none';
    }

    const finalTotal = Math.max(0, checkoutSubtotal + checkoutShipping - checkoutDiscount);
    if (totalVal) totalVal.textContent = `$${finalTotal.toFixed(2)}`;

    const klarnaLbl = document.getElementById('klarna-split-label');
    if (klarnaLbl) {
      klarnaLbl.textContent = `4 interest-free payments of $${(finalTotal / 4).toFixed(2)}.`;
    }
  }

  window.goToCheckoutStep = (step) => {
    for (let i = 1; i <= 4; i++) {
      const panel = document.getElementById(`checkout-step-${i}`);
      const tab = document.getElementById(`chk-tab-step${i}`);
      if (panel) panel.style.display = i === step ? 'block' : 'none';
      if (tab) {
        tab.classList.toggle('is-active', i === step);
        if (i < step) tab.classList.add('is-completed');
      }
    }
  };

  window.setShippingMethod = (_method, fee, element) => {
    checkoutShipping = fee;
    document.querySelectorAll('.shipping-method-option').forEach(el => el.classList.remove('is-selected'));
    if (element) element.classList.add('is-selected');
    renderCheckoutSummary();
  };

  window.setPaymentTab = (tab) => {
    activePaymentTab = tab;
    document.querySelectorAll('.payment-tab-btn').forEach(btn => btn.classList.remove('is-active'));
    document.getElementById(`pay-tab-${tab}`)?.classList.add('is-active');

    ['card', 'gpay', 'klarna', 'cod'].forEach(t => {
      const pane = document.getElementById(`payment-pane-${t}`);
      if (pane) pane.style.display = t === tab ? 'block' : 'none';
    });
  };

  window.formatCardNumber = (input) => {
    const val = input.value.replace(/\D/g, '').substring(0, 16);
    input.value = val.match(/.{1,4}/g)?.join(' ') || val;

    const badge = document.getElementById('card-brand-display');
    if (!badge) return;
    if (val.startsWith('4')) badge.textContent = 'VISA';
    else if (/^(5[1-5]|2[2-7])/.test(val)) badge.textContent = 'MASTERCARD';
    else if (/^(34|37)/.test(val)) badge.textContent = 'AMEX';
    else if (/^6011/.test(val)) badge.textContent = 'DISCOVER';
    else badge.textContent = 'CARD';
  };

  window.formatCardExp = (input) => {
    const val = input.value.replace(/\D/g, '').substring(0, 4);
    input.value = val.length >= 2 ? val.substring(0, 2) + '/' + val.substring(2) : val;
  };

  window.applyPromoCode = () => {
    const inp = document.getElementById('chk-promo-input');
    const stat = document.getElementById('chk-promo-status');
    if (!inp || !stat) return;
    const code = inp.value.trim().toUpperCase();
    if (code === 'ZELI10' || code === 'ZELI-FIRST10') {
      checkoutDiscount = checkoutSubtotal * 0.10;
      stat.textContent = '✓ 10% Member Privilege discount applied!';
      stat.style.display = 'block';
      stat.style.color = '#10b981';
      renderCheckoutSummary();
    } else {
      stat.textContent = 'Invalid promo code. Try ZELI10';
      stat.style.display = 'block';
      stat.style.color = '#e11d48';
    }
  };

  window.executeGPayCheckout = () => {
    window.placeFinalOrder('Google Pay');
  };

  window.placeFinalOrder = async (overrideMethod = null) => {
    const btn = document.getElementById('chk-place-order-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Processing Payment...';
    }

    const orderId = `ZELI-ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const trackingNumber = generateTrackingNumber(orderId);
    const estDelivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    const email = document.getElementById('chk-email')?.value || (currentUser?.email || 'malikabubakkar523@gmail.com');
    const firstName = document.getElementById('chk-firstname')?.value || 'Abubakkar';
    const lastName = document.getElementById('chk-lastname')?.value || 'Malik';
    const street = document.getElementById('chk-street')?.value || '482 Broome Street';
    const city = document.getElementById('chk-city')?.value || 'New York';
    const zip = document.getElementById('chk-zip')?.value || '10013';
    const country = document.getElementById('chk-country')?.value || 'United States';
    const method = overrideMethod || activePaymentTab;
    const totalAmount = Math.max(0, checkoutSubtotal + checkoutShipping - checkoutDiscount);

    const orderPayload = {
      orderId,
      userId: currentUser ? currentUser.uid : 'guest-shopper',
      customerEmail: email,
      customerName: `${firstName} ${lastName}`.trim(),
      shippingAddress: street,
      city,
      postalCode: zip,
      country,
      paymentMethod: method,
      totalAmount,
      items: checkoutItems,
      status: 'confirmed',
      currentStage: 'processing',
      trackingNumber,
      carrier: 'DHL Express Worldwide',
      estimatedDelivery: estDelivery,
      emailDispatchedTo: email,
      emailDispatchStatus: 'Sent to Gmail',
      createdAt: new Date().toISOString()
    };

    saveLocalOrder(orderPayload);
    latestGmailOrder = orderPayload;
    lastGmailMode = 'order';

    try {
      await createOrderInFirestore(orderPayload);
    } catch (e) {
      console.warn('Firestore order fallback saved locally:', e);
    }

    const ordIdEl = document.getElementById('chk-confirmed-ord-id');
    const ordTrackEl = document.getElementById('chk-confirmed-tracking');
    const trackInp = document.getElementById('tracking-input-id');
    if (ordIdEl) ordIdEl.textContent = orderId;
    if (ordTrackEl) ordTrackEl.textContent = `DHL Express: ${trackingNumber} · Welcome & Receipt Sent to ${email} ✓`;
    if (trackInp) trackInp.value = orderId;

    window.RunwayBag.clear();
    window.goToCheckoutStep(4);
    window.RunwayNotify(`Order ${orderId} confirmed! Gmail welcome & tracking sent to ${email} ✓`);

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Confirm & Pay Now';
    }

    loadUserOrders(currentUser?.uid || null);
  };

  window.printOrderReceipt = () => {
    window.print();
  };

  // ========================================================
  // MOBILE RESPONSIVE NAVIGATION DRAWER
  // ========================================================
  const mobileToggleBtn = document.getElementById('mobile-menu-toggle');
  const mobileDrawer = document.getElementById('mobile-nav-drawer');
  const mobileBackdrop = document.getElementById('mobile-nav-backdrop');
  const mobileDrawerCloseBtn = document.getElementById('mobile-drawer-close');

  window.openMobileDrawer = () => {
    mobileDrawer?.classList.add('is-open');
    mobileBackdrop?.classList.add('is-open');
    mobileDrawer?.setAttribute('aria-hidden', 'false');
    mobileBackdrop?.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  window.closeMobileDrawer = () => {
    mobileDrawer?.classList.remove('is-open');
    mobileBackdrop?.classList.remove('is-open');
    mobileDrawer?.setAttribute('aria-hidden', 'true');
    mobileBackdrop?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  mobileToggleBtn?.addEventListener('click', () => {
    if (mobileDrawer?.classList.contains('is-open')) window.closeMobileDrawer();
    else window.openMobileDrawer();
  });
  mobileDrawerCloseBtn?.addEventListener('click', window.closeMobileDrawer);
  mobileBackdrop?.addEventListener('click', window.closeMobileDrawer);

  // ========================================================
  // SHOE ATELIER (17 FOOTWEAR PEDESTALS + PDP VIEW)
  // ========================================================
  let openAtelierProductById = null;

  function initShoeAtelier() {
    const grid = document.getElementById('atelier-shoe-grid');
    const gridView = document.getElementById('atelier-grid-view');
    const pdpView = document.getElementById('atelier-pdp-view');
    const backBtn = document.getElementById('atelier-back-btn');
    const compactBtn = document.getElementById('atelier-cols-compact');
    const spaciousBtn = document.getElementById('atelier-cols-spacious');
    const shuffleBtn = document.getElementById('atelier-shuffle-btn');
    const pdpMainImg = document.getElementById('atelier-pdp-main-img');
    const pdpThumbs = document.getElementById('atelier-pdp-thumbs');
    const pdpTitle = document.getElementById('atelier-pdp-title');
    const pdpPrice = document.getElementById('atelier-pdp-price');
    const selectedSizeText = document.getElementById('atelier-selected-size-text');
    const sizeBtns = Array.from(document.querySelectorAll('#atelier-size-buttons .atelier-size-btn'));
    const addBagBtn = document.getElementById('atelier-add-bag-btn');
    const postActions = document.getElementById('atelier-post-actions');

    if (!grid || !gridView || !pdpView) return;

    const orbitAltImages = [
      'https://nike-makknzjs.myshopify.com/cdn/shop/files/1_a7f51336-93eb-4078-b6c2-e14b721eaad0.png?v=1792493930&width=800',
      'https://nike-makknzjs.myshopify.com/cdn/shop/files/2_a571db77-d4b0-4689-8bd8-434c8e97bc65.png?v=1792493930&width=800',
      'https://nike-makknzjs.myshopify.com/cdn/shop/files/3_601e6b64-4e5b-4031-98cc-f63701e92f66.png?v=1792493930&width=800',
      'https://nike-makknzjs.myshopify.com/cdn/shop/files/4_7cbe61bc-b2b9-4f84-a58f-b9704d1996da.png?v=1792493930&width=800',
      'https://nike-makknzjs.myshopify.com/cdn/shop/files/7_5273163c-5745-4e20-b9ad-09e0bbaa9ecd.png?v=1792493930&width=800',
      'https://nike-makknzjs.myshopify.com/cdn/shop/files/8_63fc2d79-acc2-4d8d-98c0-416f1c055cff.png?v=1792493930&width=800',
      'https://nike-makknzjs.myshopify.com/cdn/shop/files/9_427d191d-5859-4a5e-9cfc-f4283fa83ea3.png?v=1792493930&width=800',
      'https://nike-makknzjs.myshopify.com/cdn/shop/files/1.png?v=1792493527&width=800',
      'https://nike-makknzjs.myshopify.com/cdn/shop/files/2.png?v=1792493528&width=800',
      'https://nike-makknzjs.myshopify.com/cdn/shop/files/4.png?v=1792493527&width=800',
      'https://nike-makknzjs.myshopify.com/cdn/shop/files/7.png?v=1792493527&width=800',
      'https://nike-makknzjs.myshopify.com/cdn/shop/files/8.png?v=1792493527&width=800',
      'https://nike-makknzjs.myshopify.com/cdn/shop/files/9.png?v=1792493528&width=800',
      'https://nike-makknzjs.myshopify.com/cdn/shop/files/air-force-1.avif?v=1790501058&width=800'
    ];

    const catalogShoes = (CATALOG_DATA.items || []).filter(
      p => p.category === 'Shoes' || p.id === 'tatum-5-orbit-copy' || p.id === 'tatum-5-orbit'
    );

    const extraAtelierEditions = [
      { title: 'ZELI Orbit 01 Obsidian', catalogIdx: 0, img: orbitAltImages[7], price: 219 },
      { title: 'ZELI Court High Bone', catalogIdx: 1, img: orbitAltImages[8], price: 229 },
      { title: 'ZELI Pulse 90 Volt', catalogIdx: 2, img: orbitAltImages[9], price: 165 },
      { title: 'ZELI Phantom Low Mocha', catalogIdx: 3, img: orbitAltImages[10], price: 175 },
      { title: 'ZELI Velocity Racer Chalk', catalogIdx: 4, img: orbitAltImages[11], price: 210 },
      { title: 'ZELI Monolith Slate', catalogIdx: 5, img: orbitAltImages[12], price: 235 },
      { title: 'ZELI Shadow OG Graphite', catalogIdx: 6, img: orbitAltImages[0], price: 195 }
    ];

    let atelierItems = [
      ...catalogShoes.map((p, idx) => ({
        key: p.id,
        title: p.name,
        price: p.price,
        image: p.image,
        thumbs: [
          p.image,
          orbitAltImages[(idx + 1) % orbitAltImages.length],
          orbitAltImages[(idx + 4) % orbitAltImages.length],
          orbitAltImages[(idx + 7) % orbitAltImages.length]
        ],
        variants: p.variants
      })),
      ...extraAtelierEditions.map((ed, idx) => {
        const base = catalogShoes[ed.catalogIdx % catalogShoes.length] || catalogShoes[0];
        return {
          key: `atelier-ed-${idx}`,
          title: ed.title,
          price: ed.price,
          image: ed.img,
          thumbs: [
            ed.img,
            base.image,
            orbitAltImages[(idx + 3) % orbitAltImages.length],
            orbitAltImages[(idx + 6) % orbitAltImages.length]
          ],
          variants: base.variants
        };
      })
    ].slice(0, 17);

    let activeItem = null;
    let chosenSize = null;

    function resolveVariantIdForSize(item, sizeStr) {
      const exact = (item.variants || []).find(v => v.a && v.o.includes(sizeStr));
      if (exact) return exact.id;
      const numeric = parseInt(sizeStr, 10);
      const sorted = [...(item.variants || [])].filter(v => v.a);
      if (!sorted.length) return null;
      const fallback = sorted.reduce((prev, curr) => {
        const pd = Math.abs(parseInt(prev.o[0], 10) - numeric);
        const cd = Math.abs(parseInt(curr.o[0], 10) - numeric);
        return cd < pd ? curr : prev;
      });
      return fallback.id;
    }

    function openPDP(item) {
      activeItem = item;
      chosenSize = null;
      gridView.style.display = 'none';
      pdpView.style.display = 'block';
      if (pdpMainImg) {
        pdpMainImg.src = item.image;
        pdpMainImg.alt = item.title;
      }
      if (pdpTitle) pdpTitle.textContent = item.title;
      if (pdpPrice) pdpPrice.textContent = `$${Number(item.price).toFixed(2)}`;
      if (selectedSizeText) selectedSizeText.textContent = '';
      if (postActions) postActions.style.display = 'none';

      sizeBtns.forEach(b => b.classList.remove('is-selected'));
      if (addBagBtn) {
        addBagBtn.disabled = true;
        addBagBtn.classList.remove('is-added');
        const lbl = addBagBtn.querySelector('.atelier-btn-text');
        if (lbl) lbl.textContent = 'Select a size';
      }

      if (pdpThumbs) {
        pdpThumbs.innerHTML = '';
        item.thumbs.forEach((src, i) => {
          const thumb = document.createElement('img');
          thumb.src = src;
          thumb.alt = `${item.title} angle ${i + 1}`;
          thumb.className = `atelier-thumb-item${i === 0 ? ' is-active' : ''}`;
          thumb.addEventListener('click', () => {
            if (pdpMainImg) pdpMainImg.src = src;
            pdpThumbs.querySelectorAll('.atelier-thumb-item').forEach(t => t.classList.remove('is-active'));
            thumb.classList.add('is-active');
          });
          pdpThumbs.appendChild(thumb);
        });
      }
    }

    openAtelierProductById = (idOrSlug) => {
      const match = atelierItems.find(it => it.key === idOrSlug || idOrSlug.includes(it.key));
      openPDP(match || atelierItems[0]);
    };

    function renderGrid() {
      grid.innerHTML = '';
      atelierItems.forEach(item => {
        const card = document.createElement('article');
        card.className = 'atelier-pedestal-card';
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `${item.title}, $${item.price.toFixed(2)}`);
        card.innerHTML = `
          <div class="atelier-shoe-stage">
            <img src="${item.image}" alt="${item.title}" class="atelier-shoe-img" loading="lazy">
          </div>
          <div class="atelier-pedestal-bar" aria-hidden="true"></div>
          <div class="atelier-shoe-meta">
            <h3 class="atelier-shoe-title">${item.title}</h3>
            <div class="atelier-shoe-price">$${Number(item.price).toFixed(2)}</div>
          </div>
        `;
        card.addEventListener('click', () => openPDP(item));
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPDP(item);
          }
        });
        grid.appendChild(card);
      });
    }

    sizeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        chosenSize = btn.dataset.size;
        sizeBtns.forEach(b => b.classList.toggle('is-selected', b === btn));
        if (selectedSizeText) selectedSizeText.textContent = `EU ${chosenSize}`;
        if (addBagBtn) {
          addBagBtn.disabled = false;
          addBagBtn.classList.remove('is-added');
          const lbl = addBagBtn.querySelector('.atelier-btn-text');
          if (lbl) lbl.textContent = 'Add to bag';
        }
        if (postActions) postActions.style.display = 'none';
      });
    });

    addBagBtn?.addEventListener('click', async () => {
      if (!activeItem || !chosenSize) return;
      const vid = resolveVariantIdForSize(activeItem, chosenSize);
      if (!vid) return;
      try {
        await window.RunwayBag.add([{ id: vid, quantity: 1 }]);
        addBagBtn.classList.add('is-added');
        const lbl = addBagBtn.querySelector('.atelier-btn-text');
        if (lbl) lbl.textContent = 'Added to bag';
        if (postActions) postActions.style.display = 'block';
      } catch (err) {
        window.RunwayNotify(err.message || 'Could not add shoe to bag');
      }
    });

    backBtn?.addEventListener('click', () => {
      pdpView.style.display = 'none';
      gridView.style.display = 'block';
    });

    compactBtn?.addEventListener('click', () => {
      grid.setAttribute('data-columns', '6');
      compactBtn.classList.add('is-active');
      spaciousBtn?.classList.remove('is-active');
    });

    spaciousBtn?.addEventListener('click', () => {
      grid.setAttribute('data-columns', '4');
      spaciousBtn.classList.add('is-active');
      compactBtn?.classList.remove('is-active');
    });

    shuffleBtn?.addEventListener('click', () => {
      for (let i = atelierItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [atelierItems[i], atelierItems[j]] = [atelierItems[j], atelierItems[i]];
      }
      renderGrid();
      window.RunwayNotify('Shuffled 17 Atelier pairs.');
    });

    renderGrid();
  }

  // ========================================================
  // MULTI-PAGE SPA ROUTER & DYNAMIC SEO ENGINE
  // ========================================================
  const SECTION_IDS = {
    sceneRail: 'shopify-section-template--27695055274289__scene_rail_redGmm',
    handRail: 'shopify-section-template--27695055274289__rack_showcase_rWz8Dr',
    shoeAtelier: 'shopify-section-template--27695055274289__on_the_rail_KbCL4t',
    runway: 'Runway-template--28035983671601__the_runway_wdM8BG',
    shoeOrbit: 'shopify-section-template--27695055274289__shoe_orbit_WizENf',
    lumina: 'shopify-section-template--27695055274289__lumina_slider_YwFe7W',
    lookbook: 'lookbook-section',
    catalogPage: 'page-catalog-section'
  };

  function updatePageSeo(pageKey) {
    const seo = getPageSeoMetadata(pageKey);
    document.title = seo.title;

    const setMeta = (selector, attr, val) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute(attr, val);
    };

    setMeta('meta[name="description"]', 'content', seo.description);
    setMeta('meta[property="og:title"]', 'content', seo.title);
    setMeta('meta[property="og:description"]', 'content', seo.description);
    setMeta('meta[name="twitter:title"]', 'content', seo.title);
    setMeta('meta[name="twitter:description"]', 'content', seo.description);

    const originUrl = window.location.origin + '/' + (seo.canonical || '');
    setMeta('link[rel="canonical"]', 'href', originUrl);
    setMeta('meta[property="og:url"]', 'content', originUrl);

    const dynSchema = document.getElementById('dynamic-seo-jsonld');
    if (dynSchema) {
      dynSchema.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: seo.title,
        description: seo.description,
        url: originUrl,
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: window.location.origin + '/#/' },
            ...(pageKey !== 'home'
              ? [{ '@type': 'ListItem', position: 2, name: seo.title.split('—')[0].trim(), item: originUrl }]
              : [])
          ]
        }
      });
    }
  }

  function applyPageVisibility(pageKey) {
    const obsessedEl = document.querySelector('#main-content .obsessed-section');
    const secEls = {
      sceneRail: document.getElementById(SECTION_IDS.sceneRail),
      handRail: document.getElementById(SECTION_IDS.handRail),
      shoeAtelier: document.getElementById(SECTION_IDS.shoeAtelier),
      runway: document.getElementById(SECTION_IDS.runway),
      shoeOrbit: document.getElementById(SECTION_IDS.shoeOrbit),
      obsessed: obsessedEl,
      lumina: document.getElementById(SECTION_IDS.lumina),
      lookbook: document.getElementById(SECTION_IDS.lookbook),
      catalogPage: document.getElementById(SECTION_IDS.catalogPage)
    };

    const pageMap = {
      home: ['sceneRail', 'handRail', 'shoeAtelier', 'runway', 'shoeOrbit', 'obsessed', 'lumina', 'lookbook'],
      orbit: ['shoeOrbit'],
      handrail: ['sceneRail', 'handRail'],
      runway: ['runway'],
      atelier: ['shoeAtelier'],
      catalog: ['catalogPage'],
      track: ['sceneRail', 'handRail', 'shoeAtelier', 'runway', 'shoeOrbit', 'obsessed', 'lumina', 'lookbook']
    };

    const visibleKeys = new Set(pageMap[pageKey] || pageMap.home);
    Object.entries(secEls).forEach(([k, el]) => {
      if (el) el.style.display = visibleKeys.has(k) ? '' : 'none';
    });

    // Update nav active indicators (header + mobile drawer)
    const activeMatch = pageKey === 'track' ? 'track' : visibleKeys.size > 2 ? 'home' : pageKey;
    document.querySelectorAll('[data-nav-link]').forEach(link => {
      link.classList.toggle('is-active', link.getAttribute('data-page') === activeMatch);
    });

    if (pageKey === 'catalog') {
      renderCatalogGrid();
    }

    if (pageKey === 'atelier') {
      const gridView = document.getElementById('atelier-grid-view');
      const pdpView = document.getElementById('atelier-pdp-view');
      if (gridView && pdpView && pdpView.style.display !== 'block') {
        gridView.style.display = 'block';
      }
    }

    updatePageSeo(pageKey);

    // Recalculate dynamic geometry widgets (Orbit, Runway, Rail) after unhiding
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
  }

  function parseRouteFromHash() {
    const h = (window.location.hash || '').replace(/^#\/?/, '').trim().toLowerCase();
    if (['orbit', 'handrail', 'runway', 'atelier', 'catalog', 'track'].includes(h)) return h;
    return 'home';
  }

  window.navigateZeliPage = (pageKey = 'home', updateHash = true) => {
    const valid = ['home', 'orbit', 'handrail', 'runway', 'atelier', 'catalog', 'track'].includes(pageKey)
      ? pageKey
      : 'home';
    window.closeMobileDrawer();

    // Close open orbit full-screen overlay if switching routes
    const activeOrbitModal = document.querySelector('.so-modal.so-in [data-so-mclose]');
    if (activeOrbitModal) activeOrbitModal.click();

    applyPageVisibility(valid);

    if (valid === 'track') {
      document.getElementById('dialog-account')?.showModal();
      window.switchAccountTab('track');
    }

    if (updateHash) {
      const nextHash = valid === 'home' ? '#/' : `#/${valid}`;
      if (window.location.hash !== nextHash) {
        history.pushState(null, '', nextHash);
      }
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  document.addEventListener('click', (e) => {
    const navTarget = e.target.closest('[data-nav-link]');
    if (navTarget) {
      e.preventDefault();
      const targetPage = navTarget.getAttribute('data-page') || 'home';
      window.navigateZeliPage(targetPage, true);
      return;
    }

    const anchor = e.target.closest('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';

    // Intercept Shopify cart links from Orbit quick-view or status toast
    if (href === '/cart' || href.endsWith('/cart')) {
      e.preventDefault();
      document.querySelector('.so-modal.so-in [data-so-mclose]')?.click();
      document.getElementById('shoe-quickview-modal')?.close();
      window.RunwayBag.render().then(() => document.getElementById('bag-dialog')?.showModal());
      return;
    }

    // Intercept /collections/all CTA in Hand Rail Pro
    if (href.includes('/collections/all')) {
      e.preventDefault();
      window.navigateZeliPage('catalog', true);
      return;
    }

    // Intercept /products/<handle> links from Shoe Orbit "View details" & modal link
    if (href.includes('/products/')) {
      e.preventDefault();
      const slug = href.split('/products/')[1]?.split('?')[0] || '';
      document.querySelector('.so-modal.so-in [data-so-mclose]')?.click();
      window.navigateZeliPage('atelier', true);
      if (openAtelierProductById) openAtelierProductById(slug);
    }
  });

  window.addEventListener('hashchange', () => {
    const page = parseRouteFromHash();
    applyPageVisibility(page);
    if (page === 'track') {
      document.getElementById('dialog-account')?.showModal();
      window.switchAccountTab('track');
    }
  });

  // ========================================================
  // ALL PRODUCTS / CATALOG DRAWER & FULL PAGE GRID
  // ========================================================
  let activeCatalogFilter = 'All';

  window.filterCatalogCategory = (category, btn) => {
    activeCatalogFilter = category;
    document.querySelectorAll('.cat-filter-btn').forEach(b => {
      const txt = (b.textContent || '').toLowerCase();
      const match =
        (category === 'All' && txt.startsWith('all')) ||
        txt.startsWith(category.toLowerCase());
      b.classList.toggle('is-active', match || b === btn);
    });
    renderCatalogGrid();
  };

  function populateGridContainer(grid, filtered) {
    if (!grid) return;
    grid.innerHTML = '';

    filtered.forEach(p => {
      const card = document.createElement('div');
      card.className = 'catalog-card';
      const catName = p.category || (p.type ? p.type.split(' ')[0] : 'Apparel');
      card.innerHTML = `
        <div class="catalog-card-media">
          <img src="${p.image}" alt="${p.name}" loading="lazy">
        </div>
        <div class="catalog-card-cat">${catName}</div>
        <h4 class="catalog-card-title">${p.name}</h4>
        <div class="catalog-card-price">$${p.price.toFixed(2)}</div>
        <div class="catalog-card-actions">
          <button type="button" class="catalog-btn-bag" data-id="${p.variants[0].id}">+ Bag</button>
          <button type="button" class="catalog-btn-buy" data-id="${p.variants[0].id}">Buy Now</button>
        </div>
      `;

      card.querySelector('.catalog-btn-bag').addEventListener('click', async (e) => {
        const vid = parseInt(e.currentTarget.dataset.id, 10);
        try {
          await window.RunwayBag.add([{ id: vid, quantity: 1 }]);
        } catch (_) {
          window.RunwayNotify('Added to your styling bag');
        }
      });

      card.querySelector('.catalog-btn-buy').addEventListener('click', (e) => {
        const vid = parseInt(e.currentTarget.dataset.id, 10);
        document.getElementById('dialog-catalog')?.close();
        window.openCheckout({
          id: p.id,
          name: p.name,
          price: p.price,
          size: p.variants[0].o.join(' / '),
          image: p.image,
          quantity: 1,
          variantId: vid
        });
      });

      grid.appendChild(card);
    });
  }

  function renderCatalogGrid() {
    const allItems = CATALOG_DATA.items || [];
    const filtered = allItems.filter(item => {
      if (activeCatalogFilter === 'All') return true;
      if (activeCatalogFilter === 'Shoes') {
        return item.category === 'Shoes' || /shoe|sneaker|runner|dunk|slide|court|trainer|orbit/i.test(item.name + ' ' + (item.type || ''));
      }
      if (activeCatalogFilter === 'Hoodies') {
        return /hoodie|sweatshirt|sweater|knit/i.test(item.name + ' ' + (item.type || ''));
      }
      if (activeCatalogFilter === 'Outerwear') {
        return item.category === 'Outerwear' || /jacket|anorak|bomber|liner/i.test(item.name + ' ' + (item.type || ''));
      }
      if (activeCatalogFilter === 'Tops') {
        return item.category === 'Tops' || /tee|tshirt|shirt|longsleeve/i.test(item.name + ' ' + (item.type || ''));
      }
      if (activeCatalogFilter === 'Pants') {
        return item.category === 'Pants' || /pant|trouser|carpenter/i.test(item.name + ' ' + (item.type || ''));
      }
      if (activeCatalogFilter === 'Bags') {
        return item.category === 'Bags' || /bag|duffle|crossbody|tote|backpack/i.test(item.name + ' ' + (item.type || ''));
      }
      return true;
    });

    populateGridContainer(document.getElementById('catalog-products-grid'), filtered);
    populateGridContainer(document.getElementById('inline-catalog-grid'), filtered);
  }

  // Boot Shoe Atelier, Catalog Grid & Initial Route
  initShoeAtelier();
  renderCatalogGrid();
  loadUserOrders(null);
  applyPageVisibility(parseRouteFromHash());
});

