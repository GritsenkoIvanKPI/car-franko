// Car Franko Import — import cost calculation (pure functions, no DOM).
// Used by calculator.html in the browser and by tests/calc.test.mjs in Node.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CFCalc = api;
})(typeof self !== 'undefined' ? self : this, () => {
  const round = n => Math.round(n);

  /** Full calendar years since manufacture, the way the Tax Code counts them: year − made − 1, kept within [min, max]. */
  function ageCoefficient(prodYear, currentYear, { min = 1, max = 15 } = {}) {
    return Math.min(max, Math.max(min, currentYear - prodYear - 1));
  }

  /** Auction buyer fee: linear between table points, percentage above the last one. */
  function auctionFee(price, cfg) {
    const pts = cfg.points;
    const last = pts[pts.length - 1];
    if (price > last[0]) return round(price * cfg.above.rate + cfg.above.plus);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      if (price <= x1) return round(y0 + ((price - x0) / (x1 - x0 || 1)) * (y1 - y0));
    }
    return round(last[1]);
  }

  /** Excise in EUR. fuel: gasoline | diesel | hybrid | electric. */
  function exciseEur({ fuel, engineL, batteryKwh, prodYear, currentYear }, cfg) {
    const ex = cfg.excise;
    if (fuel === 'electric') return (batteryKwh || 0) * ex.electricEurPerKwh;
    if (fuel === 'hybrid') return ex.hybridFixedEur;
    const table = ex[fuel] || ex.gasoline;
    const cc = (engineL || 0) * 1000;
    const band = table.find(b => b.maxCc === undefined || cc <= b.maxCc);
    return band.eurPerLitre * (engineL || 0) * ageCoefficient(prodYear, currentYear, cfg.ageCoefficient);
  }

  const NBSP = '\u00a0';

  /** Cheapest port for a set of land prices: land + markup + that port's container. */
  function bestPort(land, shipping) {
    let best = null;
    for (const [key, landUsd] of Object.entries(land)) {
      const port = shipping.ports[key];
      if (!port || !(landUsd >= 0)) continue;
      const usd = landUsd + shipping.markupPerLocationUsd + port.containerUsd;
      if (!best || usd < best.usd) best = { portKey: key, port, landUsd, usd };
    }
    return best;
  }

  const median = xs => { const a = [...xs].sort((x, y) => x - y), m = a.length >> 1; return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); };

  /**
   * Delivery from the car's location to Klaipėda (before the hybrid/electric surcharge).
   * Exact location from the price list → its own land prices.
   * Other place in a listed state → the state's median land price to each port.
   * State missing from the list → unlistedLandUsd to the state's default port.
   * Returns { state, location|null, portKey, port, landUsd, usd }.
   */
  function resolveRoute(stateCode, city, states, shipping) {
    const state = states[stateCode] ? stateCode : 'NJ';
    const inState = (shipping.locations || []).filter(l => l.state === state);
    const location = city ? inState.find(l => l.city === city) || null : null;
    let best = null;
    if (location) best = bestPort(location.land, shipping);
    else if (inState.length) {
      const land = {};
      for (const key of Object.keys(shipping.ports)) {
        const xs = inState.map(l => l.land[key]).filter(v => v >= 0);
        if (xs.length) land[key] = median(xs);
      }
      best = bestPort(land, shipping);
    }
    if (!best) best = bestPort({ [states[state][1]]: shipping.unlistedLandUsd }, shipping);
    return { state, location, ...best };
  }

  /** Pension fund fee (USD) at first registration. */
  function pensionFee(valueUsd, { fuel, usdUah }, cfg) {
    if (fuel === 'electric' && cfg.electricExempt) return { rate: 0, usd: 0 };
    const uah = valueUsd * usdUah;
    const tier = cfg.tiers.find(t => t.upToMinimums === undefined || uah <= t.upToMinimums * cfg.subsistenceMinimumUah);
    return { rate: tier.rate, usd: round(valueUsd * tier.rate) };
  }

  /**
   * Full landed cost.
   * input: { price, fuel, engineL, batteryKwh, prodYear, state, location? (city from the price list), currentYear?, usdUah?, eurUah? }
   */
  function calculate(input, config) {
    const currentYear = input.currentYear ?? new Date().getFullYear();
    const usdUah = input.usdUah ?? config.fx.fallbackUsdUah;
    const eurUah = input.eurUah ?? config.fx.fallbackEurUah;
    const eurUsd = eurUah / usdUah;
    const price = Math.max(0, Number(input.price) || 0);
    const fuel = input.fuel || 'gasoline';

    const route = resolveRoute(input.state, input.location, config.states, config.shipping);
    const { port, portKey, state, location } = route;
    const surcharge = fuel === 'hybrid' || fuel === 'electric' ? config.shipping.hybridElectricSurchargeUsd : 0;

    const fee = auctionFee(price, config.auctionFee);
    const shipping = route.usd + surcharge;
    const s = config.services;

    // customs
    const c = config.customs;
    const customsValue = price + fee + shipping;
    const duty = round(customsValue * (fuel === 'electric' ? c.electricDutyRate : c.dutyRate));
    const exEur = exciseEur({ fuel, engineL: Number(input.engineL) || 0, batteryKwh: Number(input.batteryKwh) || 0, prodYear: Number(input.prodYear), currentYear }, c);
    const excise = round(exEur * eurUsd);
    const vat = round((customsValue + duty + excise) * c.vatRate);
    const customsTotal = duty + excise + vat;

    const groups = [
      { key: 'purchase', title: 'Купівля в США', items: [
        { key: 'price', label: 'Ціна авто на аукціоні', usd: price },
        { key: 'auctionFee', label: 'Аукціонний збір', usd: fee },
      ] },
      { key: 'delivery', title: 'Доставка', items: [
        { key: 'shipping', label: `Доставка до порту ${config.shipping.destinationPort}`, note: `${location ? `з ${location.city}, ${location.state}` : 'середня ціна по штату'}, через порт ${port.label}${surcharge ? `; гібрид чи електро +${surcharge}${NBSP}$` : ''}`, usd: shipping },
        { key: 'forwarding', label: 'Експедиторські послуги в порту', usd: s.forwardingUsd },
        { key: 'toUkraine', label: s.deliveryToUkraineLabel, usd: s.deliveryToUkraineUsd },
      ] },
      { key: 'customs', title: 'Розмитнення', items: [
        { key: 'duty', label: `Мито ${Math.round((fuel === 'electric' ? c.electricDutyRate : c.dutyRate) * 100)}%`, usd: duty },
        { key: 'excise', label: 'Акциз', note: exciseNote(), usd: excise },
        { key: 'vat', label: `ПДВ ${Math.round(c.vatRate * 100)}%`, usd: vat },
        { key: 'broker', label: 'Митний брокер', usd: s.customsBrokerUsd },
      ] },
      { key: 'service', title: 'Наші послуги', items: [
        { key: 'company', label: 'Підбір, перевірка та супровід угоди', usd: s.companyFeeUsd },
      ] },
    ];
    for (const g of groups) g.usd = g.items.reduce((a, i) => a + i.usd, 0);
    const total = groups.reduce((a, g) => a + g.usd, 0);

    // registration in Ukraine (shown separately)
    const pension = pensionFee(customsValue + duty + excise, { fuel, usdUah }, config.pensionFund);
    const extras = [
      { key: 'certification', label: 'Сертифікація', usd: s.certificationUsd },
      { key: 'registration', label: 'Постановка на облік', usd: s.registrationUsd },
      { key: 'pension', label: pension.rate ? `Збір до Пенсійного фонду ${Math.round(pension.rate * 100)}%` : 'Збір до Пенсійного фонду (електромобілі звільнені)', usd: pension.usd },
    ];
    const extrasTotal = extras.reduce((a, i) => a + i.usd, 0);

    function exciseNote() {
      if (fuel === 'electric') return `${Number(input.batteryKwh) || 0} кВт·год × ${c.excise.electricEurPerKwh} €`;
      if (fuel === 'hybrid') return `фіксовано ${c.excise.hybridFixedEur} €`;
      const k = ageCoefficient(Number(input.prodYear), currentYear, c.ageCoefficient);
      return `${round(exEur)} € (коеф. віку ${k})`;
    }

    return {
      groups, total, extras, extrasTotal, grandTotal: total + extrasTotal,
      customsValue, customsTotal, port: { key: portKey, ...port }, state, location,
      fx: { usdUah, eurUah, eurUsd },
      ageCoefficient: ageCoefficient(Number(input.prodYear), currentYear, c.ageCoefficient),
    };
  }

  return { ageCoefficient, auctionFee, exciseEur, pensionFee, bestPort, resolveRoute, calculate };
});
