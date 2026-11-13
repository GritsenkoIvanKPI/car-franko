// Car Franko Import — shared behaviour for every page.
// Each block checks that its elements exist, so pages only get what they use.
(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // header: always fixed; solid background once scrolled
  const hdr = $('.site-header');
  if (hdr) {
    const onScroll = () => hdr.classList.toggle('is-scrolled', scrollY > 20);
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  // active nav link for in-page sections (homepage only)
  const links = $$('nav[aria-label="Головне меню"] a').filter(a => a.getAttribute('href').startsWith('#'));
  const secs = links.map(a => $(a.getAttribute('href'))).filter(Boolean);
  if (secs.length) {
    const navObs = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      const id = e.target.id === 'usa' ? 'top' : e.target.id;
      links.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + id));
    }), { rootMargin: '-45% 0px -50% 0px' });
    secs.forEach(s => navObs.observe(s));
  }

  // mobile menu
  const burger = $('.burger'), mnav = $('#mnav');
  const setMenu = open => {
    if (!burger || !mnav) return;
    burger.classList.toggle('is-open', open); mnav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open); document.body.classList.toggle('menu-open', open);
    document.body.classList.toggle('overflow-hidden', open);
  };
  if (burger && mnav) {
    burger.addEventListener('click', () => setMenu(!mnav.classList.contains('is-open')));
    $$('a, button', mnav).forEach(el => el.addEventListener('click', () => setMenu(false)));
  }

  // hero slider
  const slides = $$('[data-slide]'), dots = $$('[data-dot]');
  if (slides.length) {
    let cur = 0, timer;
    const go = i => {
      cur = (i + slides.length) % slides.length;
      slides.forEach((s, k) => s.classList.toggle('is-active', k === cur));
      dots.forEach((d, k) => d.classList.toggle('is-active', k === cur));
      clearInterval(timer); timer = setInterval(() => go(cur + 1), 7000);
    };
    dots.forEach(d => d.addEventListener('click', e => { go(+d.dataset.dot); if (e.detail) d.blur(); }));
    $('[data-prev]')?.addEventListener('click', () => go(cur - 1));
    $('[data-next]')?.addEventListener('click', () => go(cur + 1));
    go(0);
  }

  // hero parallax (transform/opacity only)
  const hero = $('#usa');
  if (hero && !reduceMotion) {
    let ticking = false;
    const parallax = () => {
      const y = Math.min(scrollY, 800);
      hero.style.setProperty('--py', (y * 0.28).toFixed(1) + 'px');
      hero.style.setProperty('--ho', Math.max(0, 1 - y / 520).toFixed(3));
      ticking = false;
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(parallax); } }, { passive: true });
  }

  // reveal on scroll; after the entrance, drop reveal classes so hovers aren't slowed by reveal timing
  const settle = el => setTimeout(() => { el.classList.remove('reveal', 'is-in'); el.removeAttribute('data-d'); }, 1300);
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); settle(e.target); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  window.CF_observeReveal = root => $$('.reveal', root || document).forEach(el => io.observe(el));
  window.CF_observeReveal();

  // count-up figures
  const cio = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; cio.unobserve(e.target);
    const el = e.target, to = +el.dataset.count, t0 = performance.now(), dur = 1400;
    const tick = t => { const p = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), { threshold: .6 });
  $$('[data-count]').forEach(el => cio.observe(el));

  // faq
  $$('.faq').forEach(f => $('.faq-q', f).addEventListener('click', () => {
    const open = !f.classList.contains('is-open');
    f.classList.toggle('is-open', open); $('.faq-q', f).setAttribute('aria-expanded', open);
  }));

  // enquiry modal
  const modal = $('#modal');
  const bubble = $('#bubble');
  let lastFocus;
  const openModal = (topic, note) => {
    if (!modal) return;
    lastFocus = document.activeElement;
    if (topic) { const r = $(`input[name="topic"][value="${topic}"]`, modal); if (r) r.checked = true; }
    const noteEl = $('#m-note', modal);
    if (noteEl) { noteEl.textContent = note || ''; noteEl.classList.toggle('hidden', !note); }
    const noteInput = $('input[name="lot"]', modal); if (noteInput) noteInput.value = note || '';
    modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false'); document.body.classList.add('modal-open');
    bubble?.classList.remove('is-on');
    setTimeout(() => $('#m-name')?.focus(), 120);
  };
  const closeModal = () => {
    if (!modal || !modal.classList.contains('is-open')) return;
    modal.classList.remove('is-open'); document.body.classList.remove('modal-open'); modal.setAttribute('aria-hidden', 'true');
    lastFocus && lastFocus.focus();
  };
  window.CF_openModal = openModal;
  // delegated, so buttons rendered later (catalogue cards) work too
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-open-modal]');
    if (b) { e.preventDefault(); openModal(b.dataset.topic, b.dataset.note); }
  });
  $$('[data-close-modal]').forEach(b => b.addEventListener('click', closeModal));
  modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); setMenu(false); } });

  // lead forms (front-end only; connect to CRM/Telegram later)
  $$('.lead-form').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const phone = f.querySelector('[name="phone"]'), msg = f.querySelector('.form-msg');
    const ok = phone.value.replace(/\D/g, '').length >= 10;
    msg.classList.remove('hidden');
    msg.textContent = ok ? 'Дякуємо! Ми зателефонуємо найближчим часом.' : 'Вкажіть, будь ласка, коректний номер телефону.';
    msg.classList.toggle('text-brand-300', ok); msg.classList.toggle('text-red-300', !ok);
    if (ok) f.reset(); else phone.focus();
  }));

  // attention bubble: appears after 12s, re-appears every 60s until closed
  if (bubble) {
    let bubbleClosed = false;
    const showBubble = () => { if (!bubbleClosed && !modal?.classList.contains('is-open') && !document.body.classList.contains('filters-open')) bubble.classList.add('is-on'); };
    setTimeout(showBubble, 12000);
    setInterval(showBubble, 60000);
    $('[data-bubble-close]')?.addEventListener('click', () => { bubble.classList.remove('is-on'); bubbleClosed = true; });
  }
})();
