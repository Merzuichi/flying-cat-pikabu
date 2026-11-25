// Мини-движок на Canvas 2D: матрицы 2D, спрайты (единицы Unity), коллизии, корутины, частицы.
(function () {
  const DEG = Math.PI / 180;

  // ------------------------------------------------------------ математика --
  const M = {
    // [a, b, c, d, e, f] — как у canvas: x' = a*x + c*y + e; y' = b*x + d*y + f
    trs(x, y, rotDeg, sx, sy) {
      const r = rotDeg * DEG, c = Math.cos(r), s = Math.sin(r);
      return [c * sx, s * sx, -s * sy, c * sy, x, y];
    },
    mul(p, l) {
      return [p[0] * l[0] + p[2] * l[1], p[1] * l[0] + p[3] * l[1],
        p[0] * l[2] + p[2] * l[3], p[1] * l[2] + p[3] * l[3],
        p[0] * l[4] + p[2] * l[5] + p[4], p[1] * l[4] + p[3] * l[5] + p[5]];
    },
    apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; },
    inv(m) {
      const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
      const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
      return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
    },
  };
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const moveTowards = (cur, target, maxDelta) => Math.abs(target - cur) <= maxDelta ? target : cur + Math.sign(target - cur) * maxDelta;
  const smooth01 = t => t * t * (3 - 2 * t);

  // --------------------------------------------------------------- ассеты --
  // версия сборки из адреса скрипта (?v=...) — чтобы браузер не держал старые картинки после обновления игры
  const ASSET_V = (() => { const s = [...document.scripts].find(x => /js\/engine\.js\?v=/.test(x.src)); return s ? s.src.split('?v=')[1] : ''; })();
  const Assets = {
    images: {}, tinted: {},
    load(list, onProgress) {
      const entries = Object.entries(list);
      let done = 0;
      return Promise.all(entries.map(([key, url]) => new Promise(res => {
        const img = new Image();
        img.onload = img.onerror = () => { done++; onProgress && onProgress(done / entries.length); res(); };
        img.src = ASSET_V && !url.startsWith('data:') ? url + (url.includes('?') ? '&' : '?') + 'v=' + ASSET_V : url;
        this.images[key] = img;
      })));
    },
    /** Тонированная копия спрайта (аналог SpriteRenderer.color). */
    tint(key, color) {
      const img = this.images[key];
      if (!color || (color[0] === 1 && color[1] === 1 && color[2] === 1)) return img;
      const id = key + '|' + color.join(',');
      if (this.tinted[id]) return this.tinted[id];
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const c = cv.getContext('2d');
      c.drawImage(img, 0, 0);
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = `rgb(${color[0] * 255 | 0},${color[1] * 255 | 0},${color[2] * 255 | 0})`;
      c.fillRect(0, 0, cv.width, cv.height);
      c.globalCompositeOperation = 'destination-in';
      c.drawImage(img, 0, 0);
      this.tinted[id] = cv;
      return cv;
    },
  };

  /** Перекраска спрайта сдвигом оттенка (скины): look = {hue, sat, light}. */
  Assets.recolor = function (key, look) {
    const id = key + '|look|' + look.hue + ',' + look.sat + ',' + look.light + ',' + look.h + ',' + look.s + ',' + look.L;
    if (this.tinted[id]) return this.tinted[id];
    const img = this.images[key];
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const c = cv.getContext('2d');
    c.drawImage(img, 0, 0);
    try {
      const d = c.getImageData(0, 0, cv.width, cv.height), px = d.data;
      const dh = (look.hue || 0) / 360, ks = look.sat === undefined ? 1 : look.sat, kl = look.light === undefined ? 1 : look.light;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue;
        let r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        let h = 0, s = 0, l = (mx + mn) / 2;
        if (mx !== mn) {
          const dd = mx - mn;
          s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
          h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
          h /= 6;
        }
        if (look.h !== undefined) {
          // окраска в один цвет: оттенок фиксированный, насыщенность — от исходной (белые блики остаются белыми)
          // белые блики (s < 0.1) остаются светлыми, остальное красится в яркий цвет look.L (светлота) с сохранением теней
          if (s < 0.1 && l > 0.85) { s = 0; }
          else { h = look.h / 360; s = look.s; l = Math.max(0.12, Math.min(0.93, look.L + (l - 0.75) * 0.6)); }
        } else { h = (h + dh + 1) % 1; s = Math.min(1, s * ks); l = Math.min(1, l * kl); }
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
        if (s === 0) { r = g = b = l; } else { r = f(h + 1 / 3); g = f(h); b = f(h - 1 / 3); }
        px[i] = r * 255; px[i + 1] = g * 255; px[i + 2] = b * 255;
      }
      c.putImageData(d, 0, 0);
    } catch (e) { /* canvas tainted (file://) — оставляем как есть */ }
    this.tinted[id] = cv;
    return cv;
  };

  // ---------------------------------------------------- отрисовка спрайта --
  /** Рисует спрайт из GAME_DATA.sprites в мировой матрице m (единицы Unity, ось Y вверх). */
  function drawSprite(ctx, view, key, m, opts) {
    const sp = GAME_DATA.sprites[key];
    if (!sp) return;
    const img = opts && opts.look ? Assets.recolor(key, opts.look) : Assets.tint(key, opts && opts.color);
    if (!img) return;
    let w = sp.w / sp.ppu, h = sp.h / sp.ppu;
    if (opts && opts.size) { w = opts.size[0]; h = opts.size[1]; }
    const s = M.mul(view, m);
    ctx.setTransform(s[0], s[1], s[2], s[3], s[4], s[5]);
    if (opts && opts.flipX) ctx.scale(-1, 1);
    ctx.scale(1, -1);
    const a = opts && opts.color ? opts.color[3] : 1;
    if (a !== 1) ctx.globalAlpha = a;
    ctx.drawImage(img, -sp.px * w, -(1 - sp.py) * h, w, h);
    if (a !== 1) ctx.globalAlpha = 1;
  }

  // --------------------------------------------------------------- риг --
  /** Узел иерархии (аналог Transform + SpriteRenderer). */
  class Node {
    constructor(d) {
      this.name = d.name; this.role = d.role;
      this.base = { x: d.x, y: d.y, rot: d.rot, sx: d.sx, sy: d.sy };
      this.x = d.x; this.y = d.y; this.rot = d.rot; this.sx = d.sx; this.sy = d.sy;
      this.z = d.z || 0; this.sz = d.sz === undefined ? 1 : d.sz;
      this.sprite = d.sprite; this.color = d.color; this.flipX = d.flipX; this.size = d.size;
      this.cols = d.cols || null;
      this.active = true;
      this.worldPos = null; // принудительная мировая позиция (засасывание в портал)
      this.children = (d.children || []).map(c => new Node(c));
      this.world = null;
    }
    reset() {
      Object.assign(this, this.base);
      this.active = true; this.worldPos = null;
      this.children.forEach(c => c.reset());
    }
    find(pred) {
      if (pred(this)) return this;
      for (const c of this.children) { const r = c.find(pred); if (r) return r; }
      return null;
    }
    updateWorld(parent, pz = 0, psz = 1) {
      const local = M.trs(this.x, this.y, this.rot, this.sx, this.sy);
      this.world = parent ? M.mul(parent, local) : local;
      if (this.worldPos) { this.world[4] = this.worldPos[0]; this.world[5] = this.worldPos[1]; }
      // глубина как в Unity: чем больше world z, тем дальше от камеры
      this.wz = pz + psz * (this.z || 0);
      const sz = psz * (this.sz === undefined ? 1 : this.sz);
      for (const c of this.children) c.updateWorld(this.world, this.wz, sz);
    }
    collect(out) {
      if (!this.active) return out;
      if (this.sprite) out.push(this);
      for (const c of this.children) c.collect(out);
      return out;
    }
    draw(ctx, view) {
      const list = this.collect([]);
      list.forEach((n, i) => { n._i = i; });
      list.sort((a, b) => (b.wz - a.wz) || (a._i - b._i));
      for (const n of list) drawSprite(ctx, view, n.sprite, n.world, { color: n.color, look: n.look, flipX: n.flipX, size: n.size });
    }
  }

  // ------------------------------------------------------------ коллизии --
  function segInter(a, b, c, d) {
    const d1x = b[0] - a[0], d1y = b[1] - a[1], d2x = d[0] - c[0], d2y = d[1] - c[1];
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-12) return false;
    const t = ((c[0] - a[0]) * d2y - (c[1] - a[1]) * d2x) / den;
    const u = ((c[0] - a[0]) * d1y - (c[1] - a[1]) * d1x) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }
  function pointInPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function polyPoly(A, B) {
    for (let i = 0; i < A.length; i++) {
      const a1 = A[i], a2 = A[(i + 1) % A.length];
      for (let j = 0; j < B.length; j++) if (segInter(a1, a2, B[j], B[(j + 1) % B.length])) return true;
    }
    return pointInPoly(A[0], B) || pointInPoly(B[0], A);
  }
  function distSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = clamp01(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1));
    const x = a[0] + dx * t - p[0], y = a[1] + dy * t - p[1];
    return Math.sqrt(x * x + y * y);
  }
  function circlePoly(c, r, poly) {
    if (pointInPoly(c, poly)) return true;
    for (let i = 0; i < poly.length; i++) if (distSeg(c, poly[i], poly[(i + 1) % poly.length]) <= r) return true;
    return false;
  }
  function bounds(poly) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return [x0, y0, x1, y1];
  }
  /** Пересечение коллайдера (poly / circle, мировые координаты, со сдвигом dy) с полигоном игрока. */
  function colliderHits(col, playerPoly, dy = 0) {
    if (col.kind === 'circle') return circlePoly([col.c[0], col.c[1] + dy], col.r, playerPoly);
    const pts = dy ? col.pts.map(p => [p[0], p[1] + dy]) : col.pts;
    return polyPoly(pts, playerPoly);
  }

  // ------------------------------------------------------------ корутины --
  /** Аналог StartCoroutine: генераторы; `yield` — следующий кадр, `yield wait(сек)` — пауза. */
  class Coroutines {
    constructor() { this.list = []; }
    start(gen, tag) { const co = { gen, tag, wait: 0, done: false }; this.list.push(co); return co; }
    stop(co) { if (co) co.done = true; }
    stopAll(tag) { this.list.forEach(c => { if (!tag || c.tag === tag) c.done = true; }); }
    update(dt) {
      const list = this.list.slice();
      for (const co of list) {
        if (co.done) continue;
        if (co.wait > 0) { co.wait -= dt; if (co.wait > 0) continue; }
        const r = co.gen.next();
        if (r.done) co.done = true;
        else if (r.value && r.value.wait) co.wait = r.value.wait;
      }
      this.list = this.list.filter(c => !c.done);
    }
  }
  const wait = s => ({ wait: s });

  // ------------------------------------------------------------- частицы --
  class Particles {
    constructor() { this.items = []; }
    burst(x, y, o) {
      const n = o.count || 12;
      for (let i = 0; i < n; i++) {
        const ang = (o.angle !== undefined ? o.angle : 0) + (Math.random() - .5) * (o.spread !== undefined ? o.spread : Math.PI * 2);
        const sp = lerp(o.speed[0], o.speed[1], Math.random());
        this.items.push({
          x, y, vx: Math.cos(ang) * sp + (o.vx0 || 0), vy: Math.sin(ang) * sp,
          life: 0, max: lerp(o.life[0], o.life[1], Math.random()),
          size: lerp(o.size[0], o.size[1], Math.random()), grow: o.grow || 0,
          color: o.colors[(Math.random() * o.colors.length) | 0], g: o.gravity || 0,
          shape: o.shape || 'circle', rot: o.rot0 !== undefined ? o.rot0 + (Math.random() - .5) * (o.rotJitter || 0) : Math.random() * 6, vr: (Math.random() - .5) * (o.spin !== undefined ? o.spin : 10), drag: o.drag || 0,
          img: o.img || null, frame: o.frames ? o.frames[(Math.random() * o.frames.length) | 0] : null,
          fadeIn: o.fadeIn || 0, alpha: o.alpha !== undefined ? o.alpha : 1, len: o.len ? lerp(o.len[0], o.len[1], Math.random()) : 0,
        });
      }
    }
    update(dt) {
      for (const p of this.items) {
        p.life += dt; p.vy -= p.g * dt;
        const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.size += p.grow * dt;
      }
      this.items = this.items.filter(p => p.life < p.max);
    }
    draw(ctx, view) {
      for (const p of this.items) {
        let a = (1 - p.life / p.max) * p.alpha;
        if (p.fadeIn && p.life < p.fadeIn) a *= p.life / p.fadeIn;
        const s = view[0];
        const sx = view[0] * p.x + view[4], sy = view[3] * p.y + view[5];
        ctx.setTransform(1, 0, 0, 1, sx, sy);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        const r = Math.max(0.001, p.size) * s;
        if (p.shape === 'streak') {
          // штрих ветра/скорости: линия вдоль направления движения (len — длина в мировых единицах)
          const sp = Math.hypot(p.vx, p.vy) || 1, ux = -p.vx / sp, uy = p.vy / sp; // экранная ось y вниз
          const L = (p.len || 0.6) * s;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ux * L, uy * L);
          ctx.strokeStyle = 'rgba(137,78,109,.28)'; ctx.lineWidth = Math.max(2, r * 2.4); ctx.stroke(); // мягкая подложка для светлого неба
          ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1.2, r); ctx.stroke();
        } else if (p.img) {
          ctx.rotate(p.rot);
          const f = p.frame;
          if (f) ctx.drawImage(p.img, f[0], f[1], f[2], f[3], -r, -r * f[3] / f[2], r * 2, r * 2 * f[3] / f[2]);
          else ctx.drawImage(p.img, -r, -r * p.img.height / p.img.width, r * 2, r * 2 * p.img.height / p.img.width);
        } else if (p.shape === 'star') {
          ctx.rotate(p.rot); ctx.beginPath();
          for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * .45 : r; const an = i * Math.PI / 5; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
          ctx.closePath(); ctx.fill();
        } else if (p.shape === 'rect') {
          ctx.rotate(p.rot); ctx.fillRect(-r, -r * .5, r * 2, r);
        } else {
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  window.Engine = { M, Assets, Node, drawSprite, Coroutines, wait, Particles, colliderHits, bounds, clamp01, lerp, moveTowards, smooth01 };
})();
