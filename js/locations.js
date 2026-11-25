// Локации (новая графика pastel kawaii, assets/art/loc/<loc>/): небо, солнце, панорамы дальнего плана,
// средний план, облака, земля с кромкой, потолок с кромкой, блоки-препятствия, атмосферные частицы.
// Каждой категории уровней соответствует своя локация.
(function () {
  const GROUND_TOP = -3.49;  // верх земли (верх Lend в Unity) — граница, по которой бегает кот
  const CEIL_BOTTOM = 5.13;  // низ потолка
  const OUTLINE = '#894e6d';

  // Раскладка слоёв одинакова для всех локаций — меняются только картинки и поведение частиц.
  const LOCS = {
    // spike — окраска общего спрайта шипов в яркий контрастный к фону цвет (h — оттенок, s — насыщенность, L — светлота)
    forest: { particle: { mode: 'drift', count: 10, size: [0.14, 0.22] }, mountains: true, spike: { h: 355, s: 0.95, L: 0.5 } },
    desert: { particle: { mode: 'drift', count: 16, size: [0.08, 0.13] }, mountains: true, noMid: true,   // без отдельных объектов среднего плана (пальмы, пирамида, скалы)
       spike: { h: 270, s: 0.85, L: 0.48 } },
    china: { noMid: true, particle: { mode: 'drift', count: 12, size: [0.12, 0.2] }, mountains: true, spike: { h: 225, s: 0.9, L: 0.5 } },
    arctic: { noMid: true, particle: { mode: 'fall', count: 26, size: [0.08, 0.15] }, mountains: true, spike: { h: 14, s: 1, L: 0.52 } },
    mars: { noMid: true, particle: { mode: 'twinkle', count: 26, size: [0.06, 0.12] }, mountains: true, spike: { h: 140, s: 0.9, L: 0.45 } },
  };
  const CATEGORY_LOC = ['forest', 'desert', 'china', 'arctic', 'mars'];
  const LAYOUT = {
    sun: { x: 0.8, y: 0.3, size: 0.2 },
    // панорамы дальнего плана стыкуются вплотную; farW — ширина одной панорамы в игровых единицах
    farBack: { img: 'far3', par: 0.05, farW: 11, y: GROUND_TOP - 0.3 },
    farFront: { img: 'far1', par: 0.11, farW: 10, y: GROUND_TOP - 0.3 },
    // отдельные элементы; ppu — пикселей картинки на игровую единицу
    cloud: { imgs: ['cloud1', 'cloud2', 'cloud3'], par: 0.15, ppu: 210, gap: [6, 10], y: [2.1, 4.2], drift: 0.25 },
    mid: { imgs: ['mid1', 'mid2', 'mid3', 'mid4'], par: 0.3, ppu: 150, gap: [2.8, 4.6], y: GROUND_TOP - 0.3 },
    ground: { tileW: 4 },
    edge: { w: 2.6, visibleTop: 16 / 96, lift: 0.14 },  // доля прозрачного поля сверху у кромки земли
    ceil: { w: 2.8, solid: 80 / 128 },                  // доля сплошной части у кромки потолка
  };
  const FILES = ['sky', 'far1', 'far3', 'mid1', 'mid2', 'mid3', 'mid4',
    'cloud1', 'cloud2', 'cloud3', 'ground', 'edge', 'ceil', 'block1', 'block2', 'block3', 'particle'];

  /** Картинки локаций для загрузки. names — список локаций (по умолчанию все); common — общие эффекты. */
  function allImages(names, common = true) {
    const out = {};
    if (common) {
      ['glow', 'sparkle', 'ring', 'ring2', 'puff', 'pop', 'star', 'wind'].forEach(k => { out['fx:' + k] = 'assets/fx/' + k + '.webp'; });   // Epic Toon FX
      ['fx/smoke', 'fx/star', 'fx/shine', 'fx/feather', 'fx/confetti', 'ui/rays', 'obj/spike'].forEach(k => { out['art:' + k] = 'assets/art/' + k + '.webp'; });
    }
    for (const n of (names || Object.keys(LOCS))) {
      FILES.forEach(f => { out[`art:loc/${n}/${f}`] = `assets/art/loc/${n}/${f}.webp`; });
    }
    return out;
  }
  const img = k => {
    const im = Engine.Assets.images['art:' + k];
    return im && im.complete && im.naturalWidth ? im : null;
  };

  // Границы непрозрачной части картинки (без прозрачных полей), кэш по картинке.
  // По ним блок рисуется так, чтобы видимая часть занимала всю клетку 1×1 — блоки стоят вплотную.
  const rectCache = new Map();
  function opaqueRect(im) {
    let r = rectCache.get(im);
    if (r) return r;
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
    r = { im, sx: 0, sy: 0, sw: w, sh: h };
    try {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const c = cv.getContext('2d'); c.drawImage(im, 0, 0);
      const d = c.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 > x0 && y1 > y0) r = { im, sx: x0, sy: y0, sw: x1 - x0 + 1, sh: y1 - y0 + 1 };
    } catch (e) { /* без доступа к пикселям рисуем как есть */ }
    rectCache.set(im, r);
    return r;
  }

  // Первая строка картинки, у которой непрозрачны ВСЕ пиксели по ширине (кэш). Выше неё у кромки есть прозрачные
  // пиксели — заливку текстурой нужно вести до этой строки, иначе между заливкой и кромкой просвечивает небо.
  const solidRowCache = new Map();
  function firstSolidRow(im) {
    if (solidRowCache.has(im)) return solidRowCache.get(im);
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
    let row = 0;
    try {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const c = cv.getContext('2d'); c.drawImage(im, 0, 0);
      const d = c.getImageData(0, 0, w, h).data;
      for (let y = 0; y < h; y++) {
        let min = 255;
        for (let x = 0; x < w; x += 2) { const a = d[(y * w + x) * 4 + 3]; if (a < min) min = a; if (min < 235) break; }
        if (min >= 235) { row = y; break; }
      }
    } catch (e) { row = 0; }
    solidRowCache.set(im, row);
    return row;
  }

  // детерминированный «случайный» генератор для раскладки слоёв
  function rnd(i, seed) { const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453; return x - Math.floor(x); }
  const pick = (r, a) => Array.isArray(a) ? a[0] + (a[1] - a[0]) * r : a;

  class Location {
    constructor(name) {
      this.name = LOCS[name] ? name : 'forest';
      this.cfg = LOCS[this.name];
      this.ambient = [];
      this.time = 0;
    }

    i(file) { return img(`loc/${this.name}/${file}`); }

    /** Шипы в цветах локации (перекрашенная копия общего спрайта, кэшируется). */
    spike() {
      const base = img('obj/spike');
      if (!base) return null;
      return this.cfg.spike ? Engine.Assets.recolor('art:obj/spike', this.cfg.spike) : base;
    }

    /** Нарисованный блок-препятствие (3 варианта). */
    block(variant) {
      const im = this.i('block' + (1 + (variant % 3))) || this.i('block1');
      return im ? opaqueRect(im) : null;
    }

    update(dt) {
      this.time += dt;
      const a = this.cfg.particle;
      while (this.ambient.length < a.count) this.ambient.push(this._spawn(true));
      for (const p of this.ambient) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        if (p.x < -0.1 || p.y > 1.1 || p.y < -0.1) Object.assign(p, this._spawn(false));
      }
    }
    _spawn(anywhere) {
      const a = this.cfg.particle, fall = a.mode === 'fall', tw = a.mode === 'twinkle';
      return {
        x: anywhere ? Math.random() : 1.05, y: anywhere ? Math.random() : (fall ? -0.05 : Math.random() * 0.8),
        vx: tw ? -0.004 : fall ? -(0.01 + Math.random() * 0.03) : -(0.04 + Math.random() * 0.06),
        vy: fall ? 0.05 + Math.random() * 0.05 : (tw ? 0 : 0.01 + Math.random() * 0.02),
        rot: Math.random() * 6, vr: tw ? 0 : (Math.random() - 0.5) * 3, s: pick(Math.random(), a.size), ph: Math.random() * 6,
      };
    }

    /** Фон (небо, солнце, панорамы, облака, средний план) — до объектов уровня. */
    drawBack(ctx, view, W, H, camX, opts) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const sky = this.i('sky');
      if (sky) {
        // cover: заполняем экран, сохраняя пропорции
        const k = Math.max(W / sky.width, H / sky.height), w = sky.width * k, h = sky.height * k;
        ctx.drawImage(sky, (W - w) / 2, (H - h) / 2, w, h);
      } else {
        ctx.fillStyle = '#d9f3e6'; ctx.fillRect(0, 0, W, H);
      }
      const sun = this.i('sun');
      if (sun && opts && opts.withSun) { // солнце убрано из меню и уровней (по просьбе); оставлено опцией
        const sz = H * LAYOUT.sun.size, h = sz * sun.height / sun.width;
        ctx.setTransform(1, 0, 0, 1, W * LAYOUT.sun.x, H * LAYOUT.sun.y);
        ctx.rotate(Math.sin(this.time * 0.3) * 0.05);
        ctx.drawImage(sun, -sz / 2, -h / 2, sz, h);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      // горы (только лес): панорамы чередуются с зеркальными копиями, поэтому стыки без шва
      if (this.cfg.mountains) this._drawPanorama(ctx, view, W, camX, LAYOUT.farBack);
      this._drawScatter(ctx, view, W, camX, LAYOUT.cloud, 2);
      if (this.cfg.mountains) this._drawPanorama(ctx, view, W, camX, LAYOUT.farFront);
      if (!this.cfg.noMid) this._drawScatter(ctx, view, W, camX, LAYOUT.mid, 4);   // у всех локаций, кроме леса, фон без отдельных объектов
    }

    _drawPanorama(ctx, view, W, camX, L) {
      const im = this.i(L.img);
      if (!im) return;
      const S = view[0], off = camX * L.par, halfW = W / 2 / S;
      const i0 = Math.floor((off - halfW) / L.farW) - 1, i1 = Math.ceil((off + halfW) / L.farW) + 1;
      const sy = view[3] * L.y + view[5];
      const w = L.farW * S, h = w * im.height / im.width;
      for (let i = i0; i <= i1; i++) {
        const sx = W / 2 + (i * L.farW - off) * S;
        // нечётные — зеркальные: правый край прямой копии совпадает с левым краем зеркальной
        if (i & 1) { ctx.setTransform(-1, 0, 0, 1, sx + w, 0); ctx.drawImage(im, -0.5, sy - h, w + 1, h); ctx.setTransform(1, 0, 0, 1, 0, 0); }
        else ctx.drawImage(im, sx - 0.5, sy - h, w + 1, h);
      }
    }

    _drawScatter(ctx, view, W, camX, L, seed) {
      const S = view[0];
      const gapAvg = (L.gap[0] + L.gap[1]) / 2;
      const off = camX * L.par + (L.drift ? -this.time * L.drift : 0);
      const halfW = W / 2 / S;
      const i0 = Math.floor((off - halfW - 6) / gapAvg) - 1, i1 = Math.ceil((off + halfW + 6) / gapAvg) + 1;
      const floating = Array.isArray(L.y);
      for (let i = i0; i <= i1; i++) {
        const r1 = rnd(i, seed), r2 = rnd(i, seed + 7), r3 = rnd(i, seed + 13);
        const im = this.i(L.imgs[Math.floor(r1 * L.imgs.length) % L.imgs.length]);
        if (!im) continue;
        const k = 0.85 + 0.3 * r2, w = im.width / L.ppu * k, h = im.height / L.ppu * k;
        const x = i * gapAvg + (r3 - 0.5) * (L.gap[1] - L.gap[0]);
        const sx = W / 2 + (x - off) * S;
        if (sx + w * S < 0 || sx - w * S > W) continue;
        const sy = view[3] * (floating ? pick(r3, L.y) : L.y) + view[5];
        const flip = !floating && r3 > 0.55;
        ctx.setTransform(flip ? -1 : 1, 0, 0, 1, sx, sy);
        ctx.drawImage(im, -w * S / 2, floating ? -h * S / 2 : -h * S, w * S, h * S);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /** Земля и потолок с кромками — поверх фона, под объектами уровня. */
    drawTerrain(ctx, view, W, H, camX) {
      const S = view[0];
      const tex = this.i('ground'), edge = this.i('edge'), ceil = this.i('ceil');
      const y = v => view[3] * v + view[5];
      const tileW = LAYOUT.ground.tileW * S;
      const shiftFor = w => ((-camX * S) % w + w) % w;
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      const fill = (top, bottom) => {
        if (bottom <= top) return;
        if (!tex) { ctx.fillStyle = '#9c6b80'; ctx.fillRect(0, top, W, bottom - top); return; }
        const th = tileW * tex.height / tex.width, sh = shiftFor(tileW);
        ctx.save(); ctx.beginPath(); ctx.rect(0, top, W, bottom - top); ctx.clip();
        for (let yy = top; yy < bottom; yy += th)
          for (let x = sh - tileW; x < W; x += tileW) ctx.drawImage(tex, x, yy, tileW + 1, th + 1);
        ctx.restore();
      };
      const strip = (im, w, top) => {
        if (!im) return;
        const ww = w * S, hh = ww * im.height / im.width, sh = shiftFor(ww);
        for (let x = sh - ww; x < W; x += ww) ctx.drawImage(im, x, top, ww + 1, hh);
      };

      // земля: текстура под кромкой, сверху кромка (трава / песок / снег)
      const E = LAYOUT.edge, edgeH = edge ? E.w * edge.height / edge.width : 0.5;
      const edgeTop = GROUND_TOP + E.lift + edgeH * E.visibleTop;
      fill(y(edgeTop - edgeH * 0.6), H);
      strip(edge, E.w, y(edgeTop));

      // потолок: текстура над кромкой, снизу свисающая кромка (лианы, сосульки, кристаллы)
      const C = LAYOUT.ceil, ceilH = ceil ? C.w * ceil.height / ceil.width : 0.7;
      const ceilTop = CEIL_BOTTOM + ceilH * C.solid;
      // заливка идёт до первой полностью непрозрачной строки кромки (+запас на сглаживание) — без щели
      const solidPx = ceil ? firstSolidRow(ceil) / (ceil.naturalHeight || ceil.height) * ceilH * S : 0;
      fill(0, y(ceilTop) + solidPx + 3);
      strip(ceil, C.w, y(ceilTop));
    }

    /** Атмосферные частицы в экранных координатах. */
    drawAmbient(ctx, W, H, S) {
      const a = this.cfg.particle, im = this.i('particle');
      if (!im) return;
      for (const p of this.ambient) {
        const size = p.s * S;
        ctx.globalAlpha = a.mode === 'twinkle' ? 0.35 + 0.65 * Math.abs(Math.sin(this.time * 2 + p.ph)) : 0.9;
        ctx.setTransform(Math.cos(p.rot), Math.sin(p.rot), -Math.sin(p.rot), Math.cos(p.rot), p.x * W, p.y * H);
        ctx.drawImage(im, -size / 2, -size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  window.Locations = {
    LOCS, CATEGORY_LOC, GROUND_TOP, CEIL_BOTTOM, OUTLINE, allImages, img,
    forCategory(ci) { return new Location(CATEGORY_LOC[ci] || 'forest'); },
    Location,
  };
})();
