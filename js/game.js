// Геймплей: порт PlayerMove.cs + PlayerInteraction.cs + CoinCollectible/Obstacle/Portal/LevelProgress.
(function () {
  const { M, Node, drawSprite, Coroutines, wait, Particles, colliderHits, bounds, clamp01, lerp, moveTowards, smooth01 } = Engine;
  const P = GAME_DATA.params;
  // Скорость полёта: в Unity-прототипе было 8 (×1.8 при скольжении по земле) — теперь быстрее.
  P._speed = 10;
  P._slideSpeedMultiplier = 1.5;
  // Платформы: кот опирается на верх блоков (как на землю) и может бежать по ним.
  const LAND_OFFSET = P._minYPosition - (-3.49);   // насколько центр кота выше поверхности, когда он стоит (≈0.19)
  const STEP_UP = 1.15;   // блок не выше клетки: кот запрыгивает на него с земли и бежит по верху                            // перелезает ступеньку не выше этого
  const BODY_L = 0.30, BODY_R = 0.65;              // сколько тела кота слева/справа от центра может опираться на блок
  const BLOCK_LIFT = 0.4;
  // кадры атласов Epic Toon FX (assets/fx): puff — 2×2, pop — 3×3 (картинки ужаты до 512 px)
  const PUFF_FR = [[0, 0, 256, 256], [256, 0, 256, 256], [0, 256, 256, 256], [256, 256, 256, 256]];
  const POP_FR = [[171, 0, 170, 170], [341, 0, 171, 170], [0, 171, 170, 170]];
  const FXI = k => Engine.Assets.images['fx:' + k];                          // нижние 0.4 тела не считаются при столкновении с блоками (кот «стоит» на них)
  // Видимая область по вертикали. В Unity камера показывала y -3.95..6.65 (ortho 5.3, y 1.35);
  // в вебе верх сдвинут вниз до 5.75, чтобы потолок не занимал пол-экрана. Игровая зона не изменилась.
  const VIEW_BOTTOM = -4.0, VIEW_TOP = 5.75;
  const CAM_Y = (VIEW_TOP + VIEW_BOTTOM) / 2;
  const ORTHO = (VIEW_TOP - VIEW_BOTTOM) / 2;
  const MIN_VIEW_W = 16.8;     // сколько мира минимум видно по ширине (кот + обзор вперёд)

  class Game {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.co = new Coroutines();
      this.fx = new Particles();
      this.rig = new Node(GAME_DATA.player);
      this.model = this.rig.find(n => n.role === '_playerTransform');
      this.image = this.rig.find(n => n.role === '_playerImage');
      this.wing = this.rig.find(n => n.role === '_wingRight');
      this.tail = this.rig.find(n => n.role === '_tail');
      this.legL = this.rig.find(n => n.role === '_legsLeft');
      this.legR = this.rig.find(n => n.role === '_legsRight');
      this.body = this.rig.find(n => n.sprite === 'Cat_2');
      this.decor = this.rig.children.filter(n => n !== this.model && n.name !== 'Level_Fon' && n.name !== 'Main Camera');

      this.input = { held: false, down: false, up: false };
      this.state = 'none';
      this.paused = false;
      this.time = 1;
      this.dt = 0;
      this.pmX = 0;
      this.view = [1, 0, 0, -1, 0, 0];
      this.bindInput();
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    // ------------------------------------------------------------- ввод --
    bindInput() {
      const press = () => { if (!this.input.held) { this.input.held = true; this.input.down = true; } };
      const release = () => { if (this.input.held) { this.input.held = false; this.input.up = true; } };
      this.cv.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
      window.addEventListener('blur', release);
      const keys = ['Space', 'ArrowUp', 'KeyW'];
      window.addEventListener('keydown', e => { if (keys.includes(e.code)) { e.preventDefault(); if (!e.repeat) press(); } });
      window.addEventListener('keyup', e => { if (keys.includes(e.code)) release(); });
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.cv.clientWidth || window.innerWidth, h = this.cv.clientHeight || window.innerHeight;
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      this.W = this.cv.width; this.H = this.cv.height;
      this.scale = Math.min(this.H / (ORTHO * 2), this.W / MIN_VIEW_W);
    }

    // ------------------------------------------------------- уровень --
    load(ci, li, levelOverride) {
      this.endless = ci === 'endless';   // бесконечный режим: одна длинная дорога (levels_build.js)
      const lv = levelOverride || (this.endless ? (GAME_DATA.endlessLevel || (GAME_DATA.endlessLevel = window.buildEndlessLevel())) : GAME_DATA.categories[ci].levels[li]);
      this.ci = ci; this.li = li;
      this.loc = Locations.forCategory(this.endless ? 0 : ci);
      this.co = new Coroutines();
      this.fx = new Particles();
      this.rig.reset();
      this.applySkin();
      this.pmX = 0;
      this.time = 1;

      const prep = o => {
        const cols = o.cols || [];
        const bb = cols.length ? cols.map(c => c.kind === 'circle' ? [c.c[0] - c.r, c.c[1] - c.r, c.c[0] + c.r, c.c[1] + c.r] : bounds(c.pts))
          .reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]) : [o.x, o.y, o.x, o.y];
        // движущиеся блоки: рамка расширяется на амплитуду, чтобы их не отсекала проверка «рядом ли»
        if (o.motion) { bb[1] -= o.motion.amp; bb[3] += o.motion.amp; }
        return { d: o, cols, bb, pop: 1, touching: false, hitPlaying: false, dy: 0, motion: o.motion || null };
      };
      this.obstacles = lv.obstacles.map(prep);
      this.prepareObject = prep;
      this.coins = lv.coins.map(o => Object.assign(prep(o), { collected: false, k: 1, hidden: false, lev: 0 }));
      this.portal = lv.portal ? prep(lv.portal) : null;
      this.wallX = lv.wallX;
      this.runCoins = 0;
      this.deco = lv.deco || [];
      this.maxDist = Math.max(0.0001, this.portal ? Math.abs(this.portal.d.x - this.pmX) : 1);

      // PlayerMove.Start / ResetToStart
      this.floorY = P._minYPosition;
      const mv = this.mv = {
        enabled: true, vy: 0, y: P._startLocalY, tilt: 0, wallHit: false, wasTop: false, wasBottom: false,
        holdStart: 0, fallStart: this.time, danceY: 0, danceTilt: 0, danceScaleY: 1, dance: false,
        slideStart: -1, speedMult: 1, riseStart: -1, riseMult: 1,
        origSx: this.model.base.sx, origSy: this.model.base.sy,
      };
      this.model.x = P._startLocalX; this.model.y = mv.y;
      // PlayerInteraction
      this.pi = { gameOver: false, invulnerable: false, flapPlaying: false, lastFlap: 0, holdStart: 0, holdCo: null, legsAngle: 0, invulnUntil: 0 };
      this.input.held = this.input.down = this.input.up = false;
      this.state = 'idle';
      this.idleT = 0;
      this.rig.x = this.pmX;
      this.rig.updateWorld(null);
    }

    get skinId() { return this.trialSkin || Save.skin; }
    applySkin() { Art.applySkinTo(this.rig, this.skinId); this.emotion = 'normal'; this.emoHold = 0; this.emoApplied = ''; }

    /** Эмоция на лице кота. dur — сколько секунд держится (0 — пока не сменят); более «сильные» не перебиваются слабыми. */
    setEmotion(name, dur = 0.8) {
      const rank = { normal: 0, blink: 1, happy: 3, hurt: 4 };
      if (this.emoHold > this.time && rank[name] < rank[this.emotion]) return;
      this.emotion = name;
      this.emoHold = dur ? this.time + dur : Infinity;
    }

    /** Каждый кадр: возврат к спокойному лицу, моргание, смена спрайта лица. */
    updateEmotion() {
      if (this.emoHold <= this.time && this.emotion !== 'normal' && this.emotion !== 'blink') this.emotion = 'normal';
      if (this.emotion === 'blink' && this.time > this.blinkEnd) this.emotion = 'normal';
      if (this.emotion === 'normal') {
        if (this.time > (this.nextBlink || 0)) { this.emotion = 'blink'; this.blinkEnd = this.time + 0.13; this.nextBlink = this.time + 2.2 + Math.random() * 3; }
      }
      if (this.emotion !== this.emoApplied) {
        this.emoApplied = this.emotion;
        Art.setFace(this.body, this.skinId, this.emotion);
      }
    }

    get progress() {
      if (!this.portal) return 0;
      return clamp01(1 - Math.abs(this.portal.d.x - this.pmX) / this.maxDist);
    }

    // ---------------------------------------------------------- кадр --
    update(dt) {
      if (this.paused || this.state === 'none') { this.input.down = this.input.up = false; return; }
      dt = Math.min(dt, 1 / 20);
      this.dt = dt;
      this.time += dt;

      if (this.state === 'idle') {
        // ждём первое нажатие: кот покачивается на месте
        this.idleT += dt;
        this.model.y = this.mv.y + Math.sin(this.idleT * 3) * 0.12;
        this.updateTailAndLegs(false);
        if (this.input.down) { this.state = 'play'; this.onStart && this.onStart(); }
        else { this.input.down = this.input.up = false; this.updateMovers(); this.rig.updateWorld(null); this.fx.update(dt); this.loc.update(dt); return; }
      }

      if (this.mv.enabled) this.updateMove(dt);
      this.updateInteraction();
      this.co.update(dt);
      this.rig.x = this.pmX;
      this.rig.updateWorld(null);

      this.updateMovers();

      // монетки: левитация (CoinCollectible.Update)
      for (const c of this.coins) if (!c.collected) c.lev = Math.sin(this.time * 4) * 0.08;

      if (!this.pi.gameOver) this.checkCollisions();
      this.fx.update(dt);
      this.loc.update(dt);
      this.updateEmotion();
      this.input.down = this.input.up = false;
    }

    /** Движущиеся платформы и ворота: смещение по y по синусу. */
    updateMovers() {
      for (const o of this.obstacles) {
        const m = o.motion;
        if (m) o.dy = m.amp * Math.sin(this.time * Math.PI * 2 / m.period + m.phase);
      }
    }

    // ----------------------------------------------- PlayerMove.Update --
    /** Нижняя граница по y для кота: земля или верх блока (в т.ч. движущегося) под ним. */
    computeFloor() {
      let floor = P._minYPosition;
      const cx = this.model.world ? this.model.world[4] : this.pmX + P._startLocalX;
      const mvY = this.mv.y;
      for (const o of this.obstacles) {
        const d = o.d;
        if (d.kind === 'spike') continue;
        if (d.x + 0.5 < cx - BODY_L - 0.5) continue;
        if (d.x - 0.5 > cx + BODY_R + 0.5) break;                // obstacles отсортированы по x
        if (d.x + 0.5 < cx - BODY_L || d.x - 0.5 > cx + BODY_R) continue;
        const top = d.y + (o.dy || 0) + 0.5 + LAND_OFFSET;
        if (mvY >= top - STEP_UP && top > floor) floor = top;
      }
      return floor;
    }

    updateMove(dt) {
      const mv = this.mv, t = this.time, held = this.input.held;
      const floorY = this.floorY = this.computeFloor();
      let atBottom = mv.y <= floorY + 0.01;
      if (atBottom) {
        if (mv.slideStart <= 0) mv.slideStart = t;
        mv.speedMult = lerp(1, P._slideSpeedMultiplier, clamp01((t - mv.slideStart) / Math.max(0.1, P._slideSpeedRampTime)));
      } else {
        if (mv.slideStart > 0) { mv.riseStart = t; mv.riseMult = mv.speedMult; }
        mv.slideStart = -1;
        if (mv.riseStart > 0) {
          const k = (t - mv.riseStart) / Math.max(0.1, P._slideSpeedRampDownTime);
          mv.speedMult = lerp(mv.riseMult, 1, clamp01(k));
          if (k >= 1) mv.riseStart = -1;
        }
      }
      // 1. движение вперёд
      this.pmX += P._speed * mv.speedMult * dt;

      // 2. физика полёта
      if (held) {
        if (this.input.down) mv.holdStart = t;
        const mult = lerp(1, P._holdAccelMultiplier, clamp01((t - mv.holdStart) / Math.max(0.1, P._holdAccelRampTime)));
        mv.vy += P._accelerationUp * mult * dt;
      } else {
        if (this.input.up) mv.fallStart = t;
        const mult = lerp(1, P._fallAccelMultiplier, clamp01((t - mv.fallStart) / Math.max(0.1, P._fallAccelRampTime)));
        mv.vy -= P._accelerationDown * mult * dt;
      }
      mv.vy = Math.max(-P._maxVerticalSpeed, Math.min(P._maxVerticalSpeed, mv.vy));
      mv.y = Math.max(floorY, Math.min(P._maxYPosition, mv.y + mv.vy * dt));

      const hitTop = mv.y >= P._maxYPosition && mv.vy > 0;
      const hitBottom = mv.y <= floorY && mv.vy < 0;
      if (hitTop) {
        mv.vy = 0;
        if (!mv.wasTop && !mv.wallHit) { mv.wallHit = true; this.co.start(this.wallHitAnim(), 'move'); }
        if (!mv.wasTop && this.state === 'play') { const w = this.model.world; this.fx.burst(w[4], w[5] + 0.5, { count: 3, speed: [0.8, 2], angle: -Math.PI / 2, spread: 1.6, life: [0.3, 0.5], size: [0.2, 0.32], grow: 0.6, colors: ['#fff'], img: FXI('puff'), frames: PUFF_FR, drag: 3, spin: 1.5, fadeIn: 0.03 }); }
        mv.wasTop = true;
      } else mv.wasTop = false;
      if (hitBottom) {
        const landV = -mv.vy;
        mv.vy = 0;
        if (!mv.wasBottom && landV > 1.5 && this.state === 'play') this.landFx(landV);
        if (!mv.wasBottom && !mv.wallHit) { mv.wallHit = true; this.co.start(this.wallHitAnim(), 'move'); }
        mv.wasBottom = true;
      } else mv.wasBottom = false;

      const atTop = mv.y >= P._maxYPosition - 0.01;
      atBottom = mv.y <= floorY + 0.01;
      if ((atTop || atBottom) && !mv.wallHit && !mv.dance) this.co.start(this.danceAnim(), 'move');

      // мерцающие искры за котом, пока он летит вверх
      if (held && !atBottom && this.state === 'play' && t - (mv.sparkAt || 0) > 0.11) {
        mv.sparkAt = t;
        const w = this.model.world;
        this.fx.burst(w[4] - 0.45, w[5] - 0.05, { count: 1, speed: [0.2, 0.8], vx0: P._speed * mv.speedMult * 0.55, angle: -Math.PI * 0.6, spread: 1.2, life: [0.45, 0.8], size: [0.09, 0.17], colors: ['#fff'], img: FXI(Math.random() < 0.5 ? 'sparkle' : 'glow'), gravity: 0.4, drag: 1.2, spin: 3, fadeIn: 0.05 });
      }
      // 3. позиция
      this.model.x = P._startLocalX;
      this.model.y = Math.max(floorY, Math.min(P._maxYPosition, mv.y + mv.danceY));

      // 4. наклон
      const target = atBottom ? P._slideTiltAngle : (held ? P._tiltAngleUp : P._tiltAngleDown);
      const sp = target > mv.tilt ? P._tiltSmoothSpeedUp : P._tiltSmoothSpeedDown;
      mv.tilt = moveTowards(mv.tilt, target, sp * 60 * dt);
      this.model.rot = mv.tilt + mv.danceTilt;
      if (!mv.wallHit) {
        let breath = 1;
        if (atBottom) breath = 1 + Math.sin(t * Math.PI * 2 / Math.max(0.1, P._breathingCycleTime)) * P._breathingAmount;
        this.model.sx = mv.origSx;
        this.model.sy = mv.origSy * mv.danceScaleY * breath;
      }
    }

    /** Облачка пыли из-под лап при приземлении (на землю или на платформу). */
    landFx(v) {
      const w = this.model.world, n = v > 5 ? 2 : 1;   // слабый дымок
      for (const dir of [Math.PI * 0.12, Math.PI * 0.88]) {
        this.fx.burst(w[4], w[5] - 0.45, { count: n, speed: [0.6, 1.4], angle: dir, spread: 0.4, life: [0.25, 0.4], size: [0.14, 0.2], grow: 0.5, colors: ['#fff'], alpha: 0.6, img: FXI('puff'), frames: PUFF_FR, drag: 3, spin: 1.5, fadeIn: 0.03 });
      }
    }

    * wallHitAnim() {
      const mv = this.mv;
      const sqx = mv.origSx * P._wallHitStretchX, sqy = mv.origSy * P._wallHitSquashY;
      const half = P._wallHitDuration * 0.5;
      let t = 0;
      while (t < half) { t += this.dt; const k = Math.min(1, t / half); this.model.sx = lerp(mv.origSx, sqx, k); this.model.sy = lerp(mv.origSy, sqy, k); yield; }
      t = 0;
      while (t < half) { t += this.dt; const k = Math.min(1, t / half); this.model.sx = lerp(sqx, mv.origSx, k); this.model.sy = lerp(sqy, mv.origSy, k); yield; }
      this.model.sx = mv.origSx; this.model.sy = mv.origSy;
      mv.wallHit = false;
    }

    * danceAnim() {
      const mv = this.mv;
      mv.dance = true;
      let elapsed = 0;
      const atWall = () => mv.y >= P._maxYPosition - 0.01 || mv.y <= this.floorY + 0.01;
      while (atWall()) {
        elapsed += this.dt;
        const atBottom = mv.y <= this.floorY + 0.01, atTop = mv.y >= P._maxYPosition - 0.01;
        const e = atBottom ? elapsed * P._danceBottomSpeed : elapsed;
        const t = (e % P._danceCycleDuration) / P._danceCycleDuration;
        const sv = t < 0.5 ? smooth01(t * 2) : smooth01((1 - t) * 2);
        if (atBottom) { mv.danceY = 0; mv.danceTilt = 0; mv.danceScaleY = P._danceBottomSquatY; }
        else { mv.danceY = atTop ? -sv * P._danceBounceAmount : 0; mv.danceTilt = 0; mv.danceScaleY = 1; }
        yield;
      }
      mv.danceY = 0; mv.danceTilt = 0; mv.danceScaleY = 1; mv.dance = false;
    }

    // ----------------------------------------- PlayerInteraction.Update --
    updateInteraction() {
      const pi = this.pi;
      if (pi.gameOver || !Sound.enabled) Sound.loop('step', false);
      if (this.image.active && !pi.gameOver) this.updateTailAndLegs(true);
      if (!P._wingFlapEnabled || pi.gameOver || !this.image.active) return;
      if (this.input.down) {
        if (pi.lastFlap > 0 && this.time - pi.lastFlap < P._wingFlapMinInterval) return;
        if (!pi.holdCo || pi.holdCo.done) { pi.holdStart = this.time; pi.holdCo = this.co.start(this.flapWhileHolding(), 'pi'); }
      }
    }

    updateTailAndLegs(withSound) {
      const atBottom = this.mv.y <= this.floorY + 0.01 && this.state !== 'idle';
      const t = this.time;
      if (this.tail) {
        const a = atBottom ? P._tailGroundAngleZ + Math.sin(t * P._tailGroundWiggleSpeed) * P._tailGroundWiggleAmount
          : Math.sin(t * P._tailWaveSpeed) * P._tailWaveAmount;
        this.tail.rot = this.tail.base.rot + a;
      }
      if (atBottom) {
        this.pi.legsAngle = 0;
        if (withSound) Sound.loop('step', true, P._legsRunSoundVolume, P._legsRunSoundPitch);
        const cyc = (t * P._legsRunSpeed) % 1;
        const a = Math.sin(cyc * Math.PI * 2) * P._legsRunAngle;
        if (this.legL) this.legL.rot = this.legL.base.rot + a;
        if (this.legR) this.legR.rot = this.legR.base.rot - a;
      } else {
        Sound.loop('step', false);
        const target = this.input.held ? P._legsFlyAngleZ : 0;
        this.pi.legsAngle = moveTowards(this.pi.legsAngle, target, P._legsSmoothSpeed * this.dt);
        if (this.legL) this.legL.rot = this.legL.base.rot + this.pi.legsAngle;
        if (this.legR) this.legR.rot = this.legR.base.rot + this.pi.legsAngle;
      }
    }

    * flapWhileHolding() {
      const pi = this.pi;
      const self = pi.holdCo;
      while (this.input.held && !pi.gameOver && P._wingFlapEnabled) {
        if (P._blockFlapWhilePlaying && pi.flapPlaying) { yield; continue; }
        const speedMult = lerp(1, P._holdFlapMaxSpeed, clamp01((this.time - pi.holdStart) / Math.max(0.1, P._holdFlapRampTime)));
        const base = P._holdFlapFrequency > 0.1 ? 1 / P._holdFlapFrequency : 0.1;
        const interval = base / speedMult;
        if (this.time - pi.lastFlap < interval) { yield; continue; }
        pi.lastFlap = this.time;
        pi.flapPlaying = true;
        for (let i = 0; i < Math.max(1, P._flapsPerTap); i++) yield* this.singleFlap(speedMult);
        pi.flapPlaying = false;
        const until = this.time + interval;
        while (this.time < until && this.input.held && !pi.gameOver) yield;
      }
      if (pi.holdCo === self) pi.holdCo = null;
    }

    * singleFlap(speedMult) {
      const w = this.wing, pi = this.pi;
      if (!w) return;
      Sound.play('wing', P._wingFlapSoundVolume);
      // эффект взмаха — перья: срываются с крыла вниз-назад, кружатся и медленно падают
      if (this.time - (this._flapFx || 0) > 0.14) {
        this._flapFx = this.time;
        const ww = w.world;
        const v0 = P._speed * this.mv.speedMult;            // перья наследуют скорость кота и остаются рядом
        this.fx.burst(ww[4] - 0.2, ww[5] - 0.05, { count: 3 + ((Math.random() * 2) | 0), speed: [1, 3], vx0: v0, angle: -Math.PI * 0.72, spread: 1.3,
          life: [1.1, 1.8], size: [0.18, 0.3], colors: ['#fff'], img: Engine.Assets.images['art:fx/feather'], gravity: 1.2, drag: 1.7, spin: 5, fadeIn: 0.05 });
        // ветер от взмаха: две мягкие дуги остаются позади кота и расширяясь тают
        this.fx.burst(ww[4] - 0.35, ww[5] - 0.35, { count: 2, speed: [0.2, 0.8], angle: -Math.PI * 0.6, spread: 1, life: [0.45, 0.7], size: [0.5, 0.8], grow: 0.9, colors: ['#fff'], img: FXI('wind'), rot0: 0, rotJitter: 0.5, spin: 0, drag: 1, fadeIn: 0.04 });
        { const wn = Sound.buffers.wind1 ? 'wind' + (1 + ((Math.random() * 3) | 0)) : null; if (wn) Sound.play(wn, 0.35, 0.9 + Math.random() * 0.25); }
        this.fx.burst(ww[4] - 0.1, ww[5] - 0.2, { count: 1, speed: [0, 0], vx0: v0 * 0.5, life: [0.28, 0.28], size: [0.25, 0.25], grow: 1.8, colors: ['#fff'], img: FXI('ring'), spin: 0 });
        this.fx.burst(ww[4] - 0.2, ww[5] - 0.1, { count: 3, speed: [0.5, 1.6], vx0: v0 * 0.6, angle: -Math.PI * 0.7, spread: 1.4, life: [0.4, 0.7], size: [0.1, 0.18], colors: ['#fff'], img: FXI('sparkle'), drag: 2, spin: 4 });
      }
      const third = P._wingFlapDuration / 3, dm = Math.max(0.1, speedMult);
      const r0 = w.base.rot, up = r0 - P._wingFlapAngleUp, down = r0 - P._wingFlapAngleDown;
      const s0 = w.base.sx, sp = s0 * P._wingFlapScalePeak;
      let tm = 0;
      while (tm < third) { if (pi.gameOver) return; tm += this.dt * dm; const k = smooth01(clamp01(tm / third)); w.rot = lerp(r0, up, k); w.sx = w.sy = lerp(s0, sp, k * 0.5); yield; }
      tm = 0;
      while (tm < third) { if (pi.gameOver) return; tm += this.dt * dm; const k = smooth01(clamp01(tm / third)); w.rot = lerp(up, down, k); w.sx = w.sy = lerp(sp, s0, k); yield; }
      tm = 0;
      while (tm < third) { if (pi.gameOver) return; tm += this.dt * dm; const k = smooth01(clamp01(tm / third)); w.rot = lerp(down, r0, k); yield; }
      w.rot = r0; w.sx = w.sy = s0;
    }

    // ------------------------------------------------------- коллизии --
    playerPoly() {
      const m = this.model.world;
      return this.model.cols[0].pts.map(p => M.apply(m, p[0], p[1]));
    }

    checkCollisions() {
      const poly = this.playerPoly();
      const bb = bounds(poly);
      const cut = bb[1] + BLOCK_LIFT;
      const bpoly = poly.map(p => (p[1] < cut ? [p[0], cut] : p));   // многоугольник со срезанным низом — для блоков
      const near = o => o.bb[2] >= bb[0] - 0.1 && o.bb[0] <= bb[2] + 0.1 && o.bb[3] + 0.2 >= bb[1] && o.bb[1] - 0.2 <= bb[3];

      // монеты — триггеры
      for (const c of this.coins) {
        if (c.collected) continue;
        if (c.bb[2] < bb[0] - 1 || c.bb[0] > bb[2] + 1) continue;
        if (c.cols.some(col => colliderHits(col, poly, c.lev))) this.collectCoin(c);
      }
      // портал важнее препятствий за ним: кот, достигший портала, уже выиграл
      if (this.portal && this.pmX + P._startLocalX >= this.portal.d.x) { this.enterPortal(); return; }
      // препятствия (OnCollisionEnter2D — только на входе в контакт)
      for (const o of this.obstacles) {
        if (o.bb[2] < bb[0] - 0.5) continue;
        if (o.bb[0] > bb[2] + 0.5) break; // отсортированы по x
        // шипы убивают при любом касании; на блоках нижние BLOCK_LIFT тела не считаются (кот стоит на них)
        const hit = near(o) && o.cols.some(col => !col.trigger && colliderHits(col, o.d.kind === 'spike' ? poly : bpoly, o.dy));
        const enter = hit && !o.touching;
        o.touching = hit;
        if (enter && !this.pi.invulnerable && !this.pi.gameOver) { this.hitObstacle(o); return; }
      }
      // портал: засасывает всегда — и при касании, и если кот пролетел мимо него
      if (this.portal && (this.pmX + P._startLocalX >= this.portal.d.x || (near(this.portal) && this.portal.cols.some(col => colliderHits(col, poly))))) this.enterPortal();
    }

    collectCoin(c) {
      this.setEmotion('happy', 0.9);
      c.collected = true;
      this.runCoins++;   // в кошелёк попадёт только после победы (при проигрыше монеты забега сгорают)
      if (Sound.buffers.coin_pop) {   // «поп» с каждой следующей монетой выше тоном (до +60%); пауза > 0.8 с — сначала
        const combo = this.time - (this._coinAt || -9) < 0.8 ? Math.min(8, this._coinN + 1) : 0;
        this._coinN = combo; this._coinAt = this.time;
        Sound.play('coin_pop', 0.6, 1 + combo * 0.075);
      } else Sound.play('coin', 0.5);
      const T = Engine.Assets;
      this.fx.burst(c.d.x, c.d.y + c.lev, { count: 10, speed: [1.5, 4], life: [0.35, 0.6], size: [0.12, 0.22], colors: ['#fff'], img: T.images['art:fx/star'], drag: 3, spin: 6 });
      this.fx.burst(c.d.x, c.d.y + c.lev, { count: 1, speed: [0, 0], life: [0.3, 0.3], size: [0.35, 0.35], grow: 2.4, colors: ['#fff'], img: FXI('ring2'), spin: 0 });
      this.fx.burst(c.d.x, c.d.y + c.lev, { count: 5, speed: [1, 3], life: [0.3, 0.5], size: [0.12, 0.2], colors: ['#fff'], img: FXI('sparkle'), drag: 3, spin: 4 });
      this.co.start((function* (g) {
        let t = 0; const up = 0.05, down = 0.1;
        while (t < up) { t += g.dt; c.k = lerp(1, 1.25, Math.min(1, t / up)); yield; }
        t = 0;
        while (t < down) { t += g.dt; c.k = lerp(1.25, 0, Math.min(1, t / down)); yield; }
        c.hidden = true;
      })(this), 'fx');
      this.onCoins && this.onCoins();
    }

    hitObstacle(o) {
      Sound.play('hit', 0.3);
      // проигрыш — короткий, как подбор монеты: тот же «поп», но две ноты вниз
      if (Sound.buffers.coin_pop) { Sound.play('coin_pop', 0.6, 0.85, 0.28); this.co.start(this.delayed(0.12, () => Sound.play('coin_pop', 0.6, 0.6, 0.3)), 'pi'); }
      if (!o.hitPlaying) {
        o.hitPlaying = true;
        this.co.start((function* (g) {
          let t = 0;
          while (t < 0.05) { t += g.dt; o.pop = lerp(1, 1.2, Math.min(1, t / 0.05)); yield; }
          t = 0;
          while (t < 0.08) { t += g.dt; o.pop = lerp(1.2, 1, Math.min(1, t / 0.08)); yield; }
          o.pop = 1; o.hitPlaying = false;
        })(this), 'fx');
      }
      const pi = this.pi;
      pi.gameOver = true;
      this.mv.enabled = false;
      Sound.loop('step', false);
      this.state = 'dead';
      this.setEmotion('hurt', 0);
      { const w = this.model.world; this.fx.burst(w[4], w[5], { count: 1, speed: [0, 0], life: [0.32, 0.32], size: [0.7, 0.7], grow: 2.6, colors: ['#fff'], img: FXI('pop'), frames: POP_FR, spin: 0 }); }
      this.co.start(this.delayed(P._loseEffectDelay, () => {
        const w = this.image.world;
        const T = Engine.Assets, smoke = T.images['art:fx/smoke'];
        this.fx.burst(w[4], w[5], { count: 9, speed: [1, 3], life: [0.45, 0.8], size: [0.35, 0.6], grow: 0.9, colors: ['#fff'], img: smoke, frames: [[0, 0, 128, 128], [128, 0, 128, 128], [256, 0, 128, 128], [384, 0, 128, 128]], drag: 2.5, spin: 2 });
        this.fx.burst(w[4], w[5], { count: 9, speed: [2, 5], life: [0.7, 1.2], size: [0.14, 0.24], colors: ['#fff'], img: T.images['art:fx/feather'], gravity: 2.5, drag: 2.5, spin: 5 });
      }), 'pi');
      this.co.start(this.loseAnim(), 'pi');
      this.co.start(this.delayed(2, () => this.onLose && this.onLose()), 'pi');
    }

    * delayed(s, f) { if (s > 0) yield wait(s); f(); }

    * loseAnim() {
      const img = this.image;
      const nsx = img.sx, nsy = img.sy, r0 = img.rot, r1 = r0 + P._loseRotationAngle;
      const up = P._loseScaleUpTime, back = P._loseScaleBackTime, zero = P._loseScaleToZeroTime;
      const total = up + back + zero;
      let tt = 0;
      const phase = function* (g, dur, from, to) {
        let t = 0;
        while (t < dur) {
          t += g.dt; tt += g.dt;
          const k = clamp01(t / dur);
          img.sx = nsx * lerp(from, to, k); img.sy = nsy * lerp(from, to, k);
          img.rot = lerp(r0, r1, total > 0 ? clamp01(tt / total) : 1);
          yield;
        }
      };
      yield* phase(this, up, 1, P._loseScaleUpMultiplier);
      yield* phase(this, back, P._loseScaleUpMultiplier, 1);
      yield* phase(this, zero, 1, 0);
      img.active = false;
      img.sx = nsx; img.sy = nsy; img.rot = r0;
    }

    enterPortal() {
      const pi = this.pi;
      pi.gameOver = true;
      this.mv.enabled = false;
      Sound.loop('step', false);
      this.state = 'won';
      this.setEmotion('happy', 0);
      const px = this.portal.d.x, py = this.portal.d.y;
      this.co.start(this.delayed(P._winEffectDelay, () => {
        // победа — короткая восходящая «лесенка» из звука монеты (как открытие категории, но на три ноты)
        if (Sound.buffers.coin_pop) [1, 1.33, 1.78].forEach((rate, i) => setTimeout(() => Sound.play('coin_pop', 0.65, rate), i * 90)); else Sound.play('win', 0.6);
        const T = Engine.Assets;
        this.fx.burst(px, py, { count: 36, speed: [2, 7], life: [0.8, 1.4], size: [0.1, 0.18], colors: ['#fff'], img: T.images['art:fx/confetti'], frames: [[0, 0, 64, 64], [64, 0, 64, 64], [128, 0, 64, 64], [192, 0, 64, 64]], gravity: 4, drag: 1.5, spin: 8 });
        this.fx.burst(px, py, { count: 18, speed: [1.5, 5], life: [0.5, 0.9], size: [0.06, 0.13], colors: ['#fff'], img: T.images['art:fx/star'], drag: 2.5, spin: 6 });
        this.fx.burst(px, py, { count: 1, speed: [0, 0], life: [0.45, 0.45], size: [0.8, 0.8], grow: 2.6, colors: ['#fff'], img: FXI('ring2'), spin: 0 });
        this.fx.burst(px, py, { count: 6, speed: [1, 3.5], life: [0.8, 1.3], size: [0.2, 0.32], colors: ['#fff'], img: FXI('star'), gravity: 2, drag: 1.8, spin: 5 });
        this.fx.burst(px, py, { count: 10, speed: [1, 4], life: [0.4, 0.8], size: [0.1, 0.2], colors: ['#fff'], img: FXI('glow'), drag: 2.5, spin: 3 });
      }), 'pi');
      this.co.start(this.suckAnim(px, py), 'pi');
      this.co.start(this.delayed(2, () => this.onWin && this.onWin()), 'pi');
    }

    * suckAnim(px, py) {
      const img = this.image;
      const sx = img.world[4], sy = img.world[5];
      const nsx = img.sx, nsy = img.sy;
      let t = 0;
      const dur = P._portalSuckDuration;
      while (t < dur) {
        t += this.dt;
        const k = clamp01(t / dur), pk = k * k;
        img.worldPos = [lerp(sx, px, pk), lerp(sy, py, pk)];
        const s = k < 0.5 ? lerp(1, P._portalOvershootScale, k / 0.5) : lerp(P._portalOvershootScale, 0, (k - 0.5) / 0.5);
        img.sx = nsx * s; img.sy = nsy * s;
        img.rot += 360 * this.dt;
        yield;
      }
      img.active = false;
      img.worldPos = null; img.sx = nsx; img.sy = nsy; img.rot = img.base.rot;
    }

    /** Воскрешение после поражения без перезагрузки уровня (PlayerInteraction.ReviveFromLose). */
    revive() {
      this.co.stopAll('pi');
      const pi = this.pi;
      pi.holdCo = null; pi.flapPlaying = false; pi.gameOver = false; pi.invulnerable = true;
      this.image.active = true;
      this.image.sx = this.image.base.sx; this.image.sy = this.image.base.sy; this.image.rot = this.image.base.rot;
      this.mv.enabled = true;
      this.state = 'play';
      this.emoHold = 0; this.emotion = 'normal';
      pi.invulnUntil = this.time + 2;
      { const w = this.model.world;
        this.fx.burst(w[4], w[5], { count: 1, speed: [0, 0], life: [0.5, 0.5], size: [0.6, 0.6], grow: 3.2, colors: ['#fff'], img: FXI('ring2'), spin: 0 });
        this.fx.burst(w[4], w[5], { count: 8, speed: [1.5, 4.5], life: [0.6, 1], size: [0.16, 0.28], colors: ['#fff'], img: FXI('star'), gravity: 1.5, drag: 1.8, spin: 5 });
        this.fx.burst(w[4], w[5], { count: 8, speed: [1, 3], life: [0.4, 0.8], size: [0.1, 0.2], colors: ['#fff'], img: FXI('glow'), drag: 2.5, spin: 3 }); }
      this.co.start(this.delayed(2, () => { if (this.time >= pi.invulnUntil) pi.invulnerable = false; }), 'pi');
    }

    // ------------------------------------------------------- рендер --
    render() {
      const ctx = this.ctx, W = this.W, H = this.H, S = this.scale;
      const camX = this.pmX, camY = CAM_Y;
      const view = this.view = [S, 0, 0, -S, W / 2 - camX * S, H / 2 + camY * S];
      const halfW = W / 2 / S;
      const x0 = camX - halfW - 2, x1 = camX + halfW + 2;
      const loc = this.loc;

      // фон локации (небо, солнце, облака, средний план)
      loc.drawBack(ctx, view, W, H, camX);

      // декор уровня
      for (const d of this.deco) if (d.x > x0 - 10 && d.x < x1 + 10) drawSprite(ctx, view, d.sprite, M.trs(d.x, d.y, d.rot, d.sx, d.sy), d);

      // портал
      if (this.portal && this.portal.d.x > x0 - 4 && this.portal.d.x < x1 + 4) this.drawPortal(ctx, view);

      // препятствия: зелёные кубы Unity рисуются блоками локации (3 варианта, без поворота — у блоков есть «верх»)
      for (const o of this.obstacles) {
        const d = o.d;
        if (d.x < x0) continue; if (d.x > x1) break;
        if (d.sprite === 'Cub_Green_B') {
          if (o.variant === undefined) o.variant = Math.abs(Math.round(d.x * 7 + d.y * 13)) % 3;
          const block = loc.block(o.variant);
          // видимая часть блока = вся клетка 1×1 (+0.02 нахлёста на швы), поэтому блоки стоят вплотную
          const m = M.mul(view, M.trs(d.x, d.y + o.dy, 0, Math.abs(d.sx) * o.pop * 1.02, Math.abs(d.sy) * o.pop * 1.02));
          ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
          ctx.scale(1, -1);
          if (block) ctx.drawImage(block.im, block.sx, block.sy, block.sw, block.sh, -0.5, -0.5, 1, 1);
        } else if (d.kind === 'spike') {
          this.drawSpike(ctx, view, d, o);
        } else {
          drawSprite(ctx, view, d.sprite, M.trs(d.x, d.y, d.rot, d.sx * o.pop, d.sy * o.pop), d);
        }
        for (const ch of d.children || []) drawSprite(ctx, view, ch.sprite, M.trs(ch.x, ch.y, ch.rot, ch.sx * o.pop, ch.sy * o.pop), ch);
      }

      // за порталом всё заполнено блоками: сплошная стена до края экрана (столкновение только с первой колонкой)
      if (this.wallX != null && x1 > this.wallX) {
        const ys = [-3, -2, -1, 0, 1, 2, 3, 4, 4.65];
        const k0 = Math.max(1, Math.floor(x0 - this.wallX)), k1 = Math.ceil(x1 - this.wallX) + 1;
        for (let k = k0; k <= k1; k++) {
          const cx = this.wallX + k;                       // колонки выровнены по первой колонке стены
          for (let j = 0; j < ys.length; j++) {
            const blk = loc.block(Math.abs(k * 7 + j * 5) % 3);
            if (!blk) continue;
            const m = M.mul(view, M.trs(cx, ys[j], 0, 1.02, 1.02));
            ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
            ctx.scale(1, -1);
            ctx.drawImage(blk.im, blk.sx, blk.sy, blk.sw, blk.sh, -0.5, -0.5, 1, 1);
          }
        }
      }

      // монеты: мягкое свечение + вращающийся блик
      const shine = Locations.img('fx/shine');
      for (const c of this.coins) {
        if (c.hidden) continue;
        const d = c.d;
        if (d.x < x0 || d.x > x1) continue;
        if (shine && c.k > 0.5) {
          const sx = view[0] * d.x + view[4], sy = view[3] * (d.y + c.lev) + view[5], r = 0.75 * S;
          ctx.setTransform(1, 0, 0, 1, sx, sy);
          ctx.globalAlpha = 0.55 + 0.2 * Math.sin(this.time * 4 + d.x);
          ctx.drawImage(shine, -r, -r, r * 2, r * 2);
          ctx.globalAlpha = 1;
        }
        const draw = n => n.sprite && drawSprite(ctx, view, n.sprite, M.trs(n.x, n.y + c.lev, n.rot, n.sx * c.k, n.sy * c.k), n);
        draw(d); (d.children || []).forEach(draw);
      }

      // земля и потолок поверх блоков: блоки у пола и потолка «уходят» за кромки
      loc.drawTerrain(ctx, view, W, H, camX);

      // кот
      const blink = this.pi && this.pi.invulnerable && Math.floor(this.time * 12) % 2 === 0;
      if (blink) ctx.globalAlpha = 0.45;
      this.model.draw(ctx, view);
      ctx.globalAlpha = 1;

      this.fx.draw(ctx, view);
      loc.drawAmbient(ctx, W, H, S);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /** Шипы: спрайт без пустых полей (13..243 × 65..191 из 256) рисуется в нижнюю половину клетки 1×1. */
    drawSpike(ctx, view, d, o) {
      const im = this.loc.spike();
      if (!im) return;
      const k = (im.naturalWidth || im.width) / 256, sx0 = 13 * k, sy0 = 65 * k, sw = 230 * k, sh = 126 * k;
      const h = sh / sw * o.pop;                 // высота шипов в клетке (≈0.55)
      const m = M.mul(view, M.trs(d.x, d.y + (o.dy || 0), 0, o.pop, 1));
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      if (d.hang) ctx.drawImage(im, sx0, sy0, sw, sh, -0.5, 0.5 - h, 1, h);    // остриями вниз: основание у верха клетки
      else { ctx.scale(1, -1); ctx.drawImage(im, sx0, sy0, sw, sh, -0.5, 0.5 - h, 1, h); }
    }

    /** Портал: лучи, пульсация, закрученный вихрь внутри и искры, которые затягивает внутрь. */
    drawPortal(ctx, view) {
      const p = this.portal.d, t = this.time, S = view[0];
      const bob = Math.sin(t * 1.6) * 0.08, pulse = 1 + Math.sin(t * 3) * 0.03;
      const sx = view[0] * p.x + view[4], sy = view[3] * (p.y + bob) + view[5];
      const rays = Locations.img('ui/rays');
      if (rays) {
        ctx.setTransform(Math.cos(t * 0.8), Math.sin(t * 0.8), -Math.sin(t * 0.8), Math.cos(t * 0.8), sx, sy);
        ctx.globalAlpha = 0.7; ctx.drawImage(rays, -3 * S, -3 * S, 6 * S, 6 * S);
        ctx.setTransform(Math.cos(-t * 0.5), Math.sin(-t * 0.5), -Math.sin(-t * 0.5), Math.cos(-t * 0.5), sx, sy);
        ctx.globalAlpha = 0.35; ctx.drawImage(rays, -2.2 * S, -2.2 * S, 4.4 * S, 4.4 * S);
        ctx.globalAlpha = 1;
      }
      drawSprite(ctx, view, p.sprite, M.trs(p.x, p.y + bob, p.rot, p.sx * pulse, p.sy * pulse), p);

      // вихрь внутри рамки: вращающиеся спиральные рукава поверх фиолетового зеркала
      const rx = 0.62 * S * pulse, ry = 1.22 * S * pulse;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, sx, sy);
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
      g.addColorStop(0, `rgba(255,255,255,${0.55 + 0.25 * Math.sin(t * 4)})`); g.addColorStop(0.5, 'rgba(214,190,255,.25)'); g.addColorStop(1, 'rgba(160,120,230,0)');
      ctx.fillStyle = g; ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
      ctx.scale(1, ry / rx);
      ctx.rotate(-t * 2.2);
      ctx.lineCap = 'round';
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        for (let i = 0; i <= 30; i++) {
          const k = i / 30, a = arm * Math.PI * 2 / 3 + k * Math.PI * 1.6, r = k * rx * 1.05;
          i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(0, 0);
        }
        ctx.strokeStyle = arm % 2 ? 'rgba(255,255,255,.55)' : 'rgba(255,214,240,.5)';
        ctx.lineWidth = 0.12 * S; ctx.stroke();
      }
      ctx.restore();

      // искры, которые затягивает в портал по спирали
      const star = Engine.Assets.images['art:fx/star'];
      for (let i = 0; i < 16; i++) {
        const ph = (t * 0.45 + i / 16) % 1;
        const a = i * 2.39 + ph * 5;
        const r = (1 - ph) * 2.4;
        const x = Math.cos(a) * r * 0.75 * S, y = Math.sin(a) * r * S;
        const size = (0.07 + 0.08 * (1 - ph)) * S;
        ctx.setTransform(1, 0, 0, 1, sx + x, sy + y);
        ctx.globalAlpha = Math.min(1, ph * 6) * (1 - ph * 0.6);
        if (star && star.naturalWidth) ctx.drawImage(star, -size, -size, size * 2, size * 2);
      }
      ctx.globalAlpha = 1;
    }
  }



  window.Game = Game;
})();
