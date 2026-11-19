// Car Franko Import — shared helpers for car data: labels, formatting, auction countdown, data loading
// and the car card used by the catalogue and by "similar cars" on car pages.
window.CFLots = (() => {
  const NB = ' ';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => new Intl.NumberFormat('uk-UA').format(n).replace(/\s/g, NB);
  const ICON = (id, cls = 'h-4 w-4') => `<svg class="ico ${cls} shrink-0" aria-hidden="true"><use href="assets/icons.svg#i-${id}"/></svg>`;

  // labels for normalised values
  const L = {
    fuel: { gasoline: 'Бензин', diesel: 'Дизель', hybrid: 'Гібрид', electric: 'Електро' },
    drive: { fwd: 'Передній', rwd: 'Задній', awd: 'Повний' },
    tr: { automatic: 'Автомат', cvt: 'Варіатор', manual: 'Механіка' },
    body: { sedan: 'Седан', suv: 'Кросовер / SUV', hatchback: 'Хетчбек', wagon: 'Універсал', coupe: 'Купе', minivan: 'Мінівен', pickup: 'Пікап' },
    dmg: { front_end: 'Передня частина', rear_end: 'Задня частина', side: 'Бокове', minor_dents: 'Дрібні вм’ятини', all_over: 'По всьому кузову', top_roof: 'Дах', undercarriage: 'Днище', hail: 'Град', water: 'Вода / затоплення', water_flood: 'Вода / затоплення', fire: 'Пожежа', mechanical: 'Механічне', electrical: 'Електрика', vandalism: 'Вандалізм', stripped: 'Розукомплектоване', normal_wear: 'Звичайний знос' },
    cond: { run_drive: 'На ходу', starts: 'Заводиться', stationary: 'Не на ходу' },
    title: { clean: 'Чистий (Clean)', salvage: 'Salvage — після пошкодження', rebuilt: 'Rebuilt — відновлене', parts_only: 'Тільки на запчастини', other: 'Інший документ' },
  };

  const plural = (n, one, few, many) => {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  };

  // Ukrainian typography for generated text: short words stick to the next word, no lone last word.
  const SHORT = /(^|[\s (])(і|й|в|у|з|із|зі|до|на|за|по|під|від|над|для|без|при|про|та|а|але|чи|не|що|як|о|ми|ви|її|їх|ще|вже|це|які)\s+/gi;
  const typo = s => {
    let t = String(s).replace(/\s+—/g, NB + '—');
    for (let i = 0; i < 2; i++) t = t.replace(SHORT, (m, p, w) => p + w + NB);
    const k = t.lastIndexOf(' ');
    return k > 0 && t.slice(0, k).includes(' ') ? t.slice(0, k) + NB + t.slice(k + 1) : t;
  };

  // demo data: shift auction dates so countdowns stay in the future
  let timeShift = 0;
  const saleTime = l => (l.sale_date ? Date.parse(l.sale_date) + timeShift : Infinity);

  function countdown(l) {
    const t = saleTime(l);
    if (!isFinite(t)) return { text: 'Дата торгів уточнюється', soon: false };
    const d = t - Date.now();
    if (d <= 0) return { text: 'Торги тривають або завершились', soon: true };
    const m = Math.floor(d / 6e4), h = Math.floor(m / 60), days = Math.floor(h / 24);
    const text = days >= 1 ? `Торги через ${days}${NB}д ${h % 24}${NB}год` : h >= 1 ? `Торги через ${h}${NB}год ${m % 60}${NB}хв` : `Торги через ${m}${NB}хв`;
    return { text, soon: d < 24 * 3600e3 };
  }
  const dateFmt = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const saleDateLabel = l => { const t = saleTime(l); return isFinite(t) ? dateFmt.format(t).replace(' о ', ', ') : ''; };

  const title = l => `${l.year} ${l.make} ${l.model}`;
  const engineLabel = l => (l.fuel === 'electric' ? 'Електро' : [l.engine_l && String(l.engine_l.toFixed(1)).replace('.', ',') + NB + 'л', L.fuel[l.fuel]].filter(Boolean).join(' · '));
  const damageLabel = l => [l.primary_damage, l.secondary_damage].filter(Boolean).map(d => L.dmg[d]).join(', ');
  const locationLabel = l => (l.location ? [l.location.city, l.location.state].filter(Boolean).join(', ') : '');
  const carUrl = l => `car.html?code=${encodeURIComponent(l.code)}`;
  const priceValue = l => l.current_bid_usd || l.buy_now_usd || 0;

  async function load() {
    const r = await fetch('data/lots.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json();
    const meta = data.meta || {};
    if (meta.demo && meta.generated_at) timeShift = Math.max(0, Date.now() - Date.parse(meta.generated_at));
    const lots = (data.lots || []).filter(l => l.year >= (meta.min_year || 2015));
    return { meta, lots };
  }

  /** Car card. `delay` staggers the entrance animation (0–8). */
  function card(l, delay = 0, { eager = false } = {}) {
    const t = title(l);
    const url = carUrl(l);
    const cond = l.condition ? `<span class="cond-badge ${l.condition === 'run_drive' ? '' : 'is-warn'}">${L.cond[l.condition]}</span>` : '';
    const cd = countdown(l);
    const dmg = damageLabel(l);
    const loc = locationLabel(l);
    const img = l.images?.[0]
      ? `<img src="${esc(l.images[0])}" alt="${esc(t)}" class="h-full w-full object-cover" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`
      : `<div class="grid h-full w-full place-items-center bg-ink-700 text-fog-500">${ICON('image')}</div>`;
    const bid = l.current_bid_usd
      ? `<div><p class="eyebrow text-[10px] text-fog-500">Поточна ставка</p><p class="mt-1 font-display text-[22px] font-semibold leading-none text-brand-300 tabular">${fmt(l.current_bid_usd)}${NB}$</p></div>`
      : `<div><p class="eyebrow text-[10px] text-fog-500">Ставка</p><p class="mt-1 font-display text-[16px] font-semibold leading-none text-brand-300">на торгах</p></div>`;
    return `
    <article class="car-card lift panel lot-in lot-d${Math.min(delay, 8)} relative flex flex-col">
      <a href="${url}" class="media block aspect-[4/3] rounded-t-[10px]" tabindex="-1" aria-hidden="true">
        ${img}
        <span class="tint !opacity-15"></span><span class="fade"></span>
        ${cond ? `<span class="absolute left-3 top-3 flex items-center gap-2">${cond}</span>` : ''}
        <span class="absolute bottom-3 left-3 right-3 flex items-center gap-1.5 text-[12px] font-semibold ${cd.soon ? 'text-[#E8C38A]' : 'text-white'}">${ICON('clock')}<span>${cd.text}</span></span>
      </a>
      <div class="flex flex-1 flex-col p-5">
        <h3 class="font-display text-[17px] font-semibold leading-snug"><a href="${url}" class="lnk">${esc(l.year)} ${esc(l.make)} ${esc(l.model)}${l.trim ? ` <span class="font-normal text-fog-400">${esc(l.trim)}</span>` : ''}</a></h3>
        <p class="mt-1 text-[12px] text-fog-500 tabular">Код ${esc(l.code)}${loc ? ` · ${esc(loc)}` : ''}</p>
        <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] leading-snug">
          <div class="flex items-start gap-2 text-fog-400">${ICON('gauge')}<div><dt class="sr-only">Пробіг</dt><dd class="text-fog">${l.odometer_km ? fmt(l.odometer_km) + NB + 'км' : '—'}</dd></div></div>
          <div class="flex items-start gap-2 text-fog-400">${ICON('fuel')}<div><dt class="sr-only">Двигун</dt><dd class="text-fog">${engineLabel(l)}</dd></div></div>
          <div class="flex items-start gap-2 text-fog-400">${ICON('gearbox')}<div><dt class="sr-only">Коробка</dt><dd class="text-fog">${L.tr[l.transmission] || '—'}</dd></div></div>
          <div class="flex items-start gap-2 text-fog-400">${ICON('drive')}<div><dt class="sr-only">Привід</dt><dd class="text-fog">${L.drive[l.drive] || '—'}</dd></div></div>
        </dl>
        ${dmg ? `<p class="mt-3 flex items-start gap-2 text-[13px] text-fog-400">${ICON('alert')}<span>${esc(dmg)}${l.title === 'clean' ? ' · чистий титул' : ''}</span></p>` : ''}
        <div class="mt-auto pt-5">
          <div class="flex items-end justify-between gap-3 border-t border-[var(--line)] pt-4">
            ${bid}
            ${l.buy_now_usd ? `<div class="text-right"><p class="eyebrow text-[10px] text-fog-500">Buy Now</p><p class="mt-1 font-display text-[16px] font-semibold leading-none tabular">${fmt(l.buy_now_usd)}${NB}$</p></div>` : ''}
          </div>
          <p class="mt-2 text-[12px] text-fog-500">${saleDateLabel(l) ? `Торги: ${saleDateLabel(l)}` : ''}</p>
          <div class="mt-4 flex gap-2">
            <a href="${url}" class="btn btn-primary flex-1">Детальніше</a>
            <button type="button" class="icon-btn h-[44px] w-[44px] border border-[var(--line-strong)]" data-open-modal data-topic="usa" data-note="${esc(`${t} · код ${l.code}`)}" aria-label="Залишити заявку на ${esc(t)}" title="Залишити заявку"><svg class="ico relative h-4 w-4" aria-hidden="true"><use href="assets/icons.svg#i-phone"/></svg></button>
          </div>
        </div>
      </div>
    </article>`;
  }

  return { NB, esc, fmt, ICON, L, plural, typo, saleTime, countdown, saleDateLabel, title, engineLabel, damageLabel, locationLabel, carUrl, priceValue, load, card };
})();
