// Orientation applies before the menu; the tutorial advances through real actions.
(function () {
  const gate = document.getElementById('orientationGate');
  const Orientation = window.Orientation = {
    blocked: false,
    get mobile() {
      const device = window.Platform?.deviceType;
      return device === 'mobile' || device === 'tablet' || matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    },
    refresh() {
      const mobile = this.mobile;
      gate.dataset.device = mobile ? 'mobile' : 'desktop';
      const ru = window.I18N?.lang === 'ru';
      document.getElementById('orientationMessage').textContent = mobile
        ? (ru ? 'Поверните устройство горизонтально' : 'Rotate your device to landscape')
        : (ru ? 'Разверните экран' : 'Expand the window');
      this.blocked = innerHeight > innerWidth;
      gate.classList.toggle('active', this.blocked);
      gate.setAttribute('aria-hidden', String(!this.blocked));
      document.documentElement.classList.toggle('orientation-blocked', this.blocked);
      const app = document.getElementById('app');
      app.inert = this.blocked;
      if (this.blocked) app.setAttribute('aria-hidden', 'true');
      else app.removeAttribute('aria-hidden');
      window.UI?.applySys?.();
    },
  };
  addEventListener('resize', () => Orientation.refresh());
  addEventListener('orientationchange', () => Orientation.refresh());
  Orientation.refresh();

  const COPY = {
    // Шаг «tap» — одно короткое нажатие для старта; шаг «practice» — три раза «удержи и отпусти»
    // (засчитывается только нажатие длиннее HOLD_MS), чтобы было ясно: в полёте палец нужно держать.
    en: {heading: 'TUTORIAL', practice: 'HOLD to fly up. RELEASE to glide down.', tapCount: 'HOLD, then RELEASE — 3 times', tap: 'TAP once to take off', control: 'A quick tap starts the flight.',
      coins: 'Collect three coins', coinsBody: 'Hold to climb, release to drop down — fly through the coins.',
      goal: 'Reach the portal', goalBody: 'Hold and release to steer into the purple portal.',
      longer: 'Hold longer!', holdLabel: 'HOLD', tapLabel: 'TAP',
      skip: 'Skip tutorial', resume: 'Continue', tapResume: 'Tap anywhere to continue'},
    ru: {heading: 'ОБУЧЕНИЕ', practice: 'УДЕРЖИВАЙ — кот летит вверх. ОТПУСТИ — опускается.', tapCount: 'УДЕРЖИ и ОТПУСТИ — 3 раза', tap: 'НАЖМИ один раз, чтобы взлететь', control: 'Короткое нажатие запускает полёт.',
      coins: 'Собери три монетки', coinsBody: 'Удерживай, чтобы подняться, отпускай, чтобы снизиться, — пролетай через монетки.',
      goal: 'Доберись до портала', goalBody: 'Удерживай и отпускай, чтобы долететь до фиолетового портала.',
      longer: 'Держи дольше!', holdLabel: 'ДЕРЖИ', tapLabel: 'НАЖМИ',
      skip: 'Пропустить обучение', resume: 'Продолжить', tapResume: 'Нажми в любом месте, чтобы продолжить'},
  };
  const HOLD_MS = 350;
  const el = document.getElementById('tutorial'), marker = document.getElementById('tutorialMarker');
  // индикатор удержания: кольцо вокруг руки заполняется, пока палец прижат; подпись ДЕРЖИ / НАЖМИ
  const promptEl = el.querySelector('.tutorial-prompt'), iconEl = document.getElementById('tutorialIcon');
  const gesture = document.createElement('span'); gesture.className = 'tutorial-gesture';
  gesture.innerHTML = '<i class="hold-ring"></i>';
  iconEl.replaceWith(gesture); gesture.prepend(iconEl);
  const gestureLabel = document.createElement('b'); gestureLabel.className = 'tutorial-gesture-label'; gesture.appendChild(gestureLabel);
  const flash = document.createElement('span'); flash.className = 'tutorial-flash hidden'; promptEl.appendChild(flash);
  const markers = [marker, ...[1,2].map(i => { const m = marker.cloneNode(); m.id = 'tutorialMarker' + i; marker.after(m); return m; })];
  const Tutorial = window.Tutorial = {
    active: false, paused: false, stage: 'tap', elapsed: 0,
    get timeScale() { return this.active && this.slowRemaining > 0 ? 0.12 : 1; },
    begin(game, ci, li) {
      const force = this.forceNext;
      this.forceNext = false;
      const fromPlay = this.fromPlay;
      this.fromPlay = false;
      this.end();
      if ((!force && !fromPlay) || ci !== 0 || li !== 0 || (!force && (Save.data.tutorialDone || Save.lastLevel(0) >= 0))) return false;
      this.game = game; this.active = true; this.taps = 0;
      this.slowRemaining = 0; this.coinSlowShown = false; this.portalSlowShown = false;
      this.setStage('tap');
      document.getElementById('tapHint').classList.add('hidden');
      return true;
    },
    setStage(stage) {
      this.stage = stage; this.elapsed = 0;
      this.paused = false;
      const c = COPY[I18N.lang] || COPY.en;
      const number = ['tap','practice'].includes(stage) ? 1 : stage === 'coins' ? 2 : 3;
      document.getElementById('tutorialTitle').textContent = c.heading;
      document.getElementById('tutorialStep').textContent = number + ' / 3';
      document.getElementById('tutorialProgress').style.width = (number / 3 * 100) + '%';
      document.getElementById('tutorialBody').textContent = stage === 'tap' ? c.control : stage === 'practice' ? c.practice : stage === 'coins' ? c.coinsBody : c.goalBody;
      document.getElementById('tutorialIcon').src = 'assets/art/ui/hand.webp';
      document.getElementById('tutorialObjective').textContent = stage === 'tap' ? c.tap : stage === 'practice' ? c.tapCount : stage === 'coins' ? c.coins : c.goal;
      document.getElementById('tutorialSkip').textContent = c.skip;
      gestureLabel.textContent = stage === 'tap' ? c.tapLabel : c.holdLabel;
      el.classList.remove('holding', 'held');
      const counter = document.getElementById('tutorialCounter');
      counter.textContent = stage === 'coins' ? Math.min(3, this.game.runCoins) + '/3' : String(Math.max(0, 3 - this.taps));
      counter.classList.toggle('hidden', !['practice','coins'].includes(stage));
      el.classList.toggle('hidden', stage === 'flight' || stage === 'finish');
      el.dataset.stage = stage;
      document.getElementById('tutorialShade').classList.toggle('hidden', !this.paused);
      window.UI?.applySys?.();
    },
    /** Нажатие: на шаге «tap» просто стартуем, на шаге «practice» начинаем отсчёт удержания. */
    pressStart() {
      if (!this.active || !['tap','practice'].includes(this.stage) || this.game.paused || Orientation.blocked) return;
      if (this.stage === 'tap') { this.setStage('practice'); return; }
      this.pressAt = performance.now();
      el.classList.remove('held'); el.classList.add('holding');
      clearTimeout(this.heldTimer);
      this.heldTimer = setTimeout(() => { if (this.pressAt) el.classList.add('held'); }, HOLD_MS);
    },
    /** Отпускание: засчитываем только достаточно долгое удержание, на короткий тап — подсказка «Держи дольше». */
    pressEnd() {
      const at = this.pressAt; this.pressAt = 0;
      clearTimeout(this.heldTimer);
      el.classList.remove('holding', 'held');
      if (!at || !this.active || this.stage !== 'practice') return;
      const c = COPY[I18N.lang] || COPY.en;
      if (performance.now() - at < HOLD_MS) { this.flash(c.longer, false); return; }
      this.taps++;
      document.getElementById('tutorialCounter').textContent = String(Math.max(0, 3 - this.taps));
      this.flash('✓', true);
      if (this.taps >= 3) { this.spawnCoins(); this.setStage('coins'); }
    },
    flash(text, ok) {
      flash.textContent = text; flash.classList.toggle('ok', ok);
      flash.classList.remove('hidden'); flash.style.animation = 'none'; void flash.offsetWidth; flash.style.animation = '';
      clearTimeout(this.flashTimer); this.flashTimer = setTimeout(() => flash.classList.add('hidden'), 900);
    },
    registerTap() { this.pressStart(); },
    spawnCoins() {
      const g = this.game, x = g.pmX + GAME_DATA.params._startLocalX;
      const y = Math.max(-2.9, Math.min(3.7, g.mv.y));
      const old = g.coins.filter(c => c.collected);
      g.coins = old.concat(buildTutorialCoins(x, y).map(c => Object.assign(g.prepareObject(c),
        {collected:false,k:1,hidden:false,lev:0})));
    },
    spawnPortal() {
      const g = this.game;
      g.portal = g.prepareObject(buildTutorialPortal(g.pmX + GAME_DATA.params._startLocalX + 24));
      g.maxDist = g.portal.d.x;
      this.portalSpawned = true;
    },
    update(dt) {
      if (!this.active) return;
      const g = this.game;
      if (g.state === 'won') { this.complete(); return; }
      if (!UI.inGame || ['dead','lost','lose','none'].includes(g.state)) { this.end(); return; }
      if (g.paused || Orientation.blocked || g.state !== 'play') return;
      dt = Math.min(dt, 0.05);
      this.slowRemaining = Math.max(0, (this.slowRemaining || 0) - dt);
      if (this.stage === 'tap') this.setStage('practice');
      if (this.stage === 'coins') {
        const ahead = g.coins.find(c => !c.collected && c.d.x > g.pmX + GAME_DATA.params._startLocalX);
        if (!this.coinSlowShown && ahead && ahead.d.x - g.pmX - GAME_DATA.params._startLocalX < 6) {
          this.coinSlowShown = true; this.slowRemaining = 3;
        }
        document.getElementById('tutorialCounter').textContent = Math.min(3, g.runCoins) + '/3';
        if (g.runCoins >= 3) { this.spawnPortal(); this.setStage('portal'); }
        else {
          const last = g.coins[g.coins.length - 1];
          if (!last || last.d.x < g.pmX + GAME_DATA.params._startLocalX - 1) this.spawnCoins();
        }
      } else if (['portal','finish'].includes(this.stage)) {
        const distance = g.portal.d.x - g.pmX - GAME_DATA.params._startLocalX;
        if (!this.portalSlowShown && distance < 12) {
          this.portalSlowShown = true; this.slowRemaining = 3;
          this.setStage('portal');
        }
        if (this.stage === 'portal' && this.portalSlowShown && this.slowRemaining === 0) {
          this.elapsed += dt;
          if (this.elapsed >= 1.5) this.setStage('finish');
        }
      }
      this.pointAtTarget();
    },
    pointAtTarget() {
      const g = this.game, x = g.pmX + GAME_DATA.params._startLocalX;
      const targets = this.stage === 'coins' ? g.coins.filter(c => !c.collected && c.d.x > x - 0.5).slice(0,3)
        : ['portal','finish'].includes(this.stage) ? [g.portal] : [];
      const [a,b,c,d,e,f] = g.view, rect = g.cv.getBoundingClientRect();
      markers.forEach((m,i) => {
        const target = targets[i];
        if (!target) { m.classList.add('hidden'); return; }
        const px = (a * target.d.x + c * target.d.y + e) * rect.width / g.W;
        const portal = this.stage !== 'coins';
        const bob = portal ? Math.sin(g.time * 1.6) * 0.08 : (target.lev || 0);
        const py = (b * target.d.x + d * (target.d.y + bob) + f) * rect.height / g.H;
        const pulse = portal ? 1 + Math.sin(g.time * 3) * 0.03 : 1;
        const sp = GAME_DATA.sprites[target.d.sprite];
        const unit = Math.abs(a) * rect.width / g.W;
        const width = portal ? sp.w / sp.ppu * Math.abs(target.d.sx) * unit * pulse + 16 : 64;
        const height = portal ? sp.h / sp.ppu * Math.abs(target.d.sy) * unit * pulse + 16 : 64;
        m.classList.toggle('portal-highlight', portal);
        m.style.width = width + 'px'; m.style.height = height + 'px';
        m.style.margin = '0'; m.style.marginLeft = -width/2 + 'px'; m.style.marginTop = -height/2 + 'px';
        m.classList.toggle('hidden', !(px > 20 && px < rect.width - 20 && py > 60 && py < rect.height - 20));
        m.style.left = rect.left + px + 'px'; m.style.top = rect.top + py + 'px';
      });
    },
    complete() {
      if (!this.active) return;
      if (!this.portalSpawned && this.game.state !== 'won') this.spawnPortal();
      Save.data.tutorialDone = true; Save.commit(); this.end();
    },
    end() {
      this.paused = false; this.active = false; this.portalSpawned = false;
      this.slowRemaining = 0;
      el.classList.add('hidden'); markers.forEach(m => m.classList.add('hidden'));
      document.getElementById('tutorialShade').classList.add('hidden');
      window.UI?.applySys?.();
    },
  };
  addEventListener('pointerdown', event => {
    if (event.target.closest('#tutorialSkip, #btnHome, #orientationGate')) return;
    if (event.target.id === 'game') Tutorial.pressStart();
  }, true);
  addEventListener('pointerup', () => Tutorial.pressEnd(), true);
  addEventListener('pointercancel', () => Tutorial.pressEnd(), true);
  addEventListener('blur', () => Tutorial.pressEnd());
  const KEYS = ['Space','ArrowUp','KeyW'];
  addEventListener('keydown', event => {
    if (!event.repeat && KEYS.includes(event.code)) Tutorial.pressStart();
  }, true);
  addEventListener('keyup', event => { if (KEYS.includes(event.code)) Tutorial.pressEnd(); }, true);
  document.getElementById('tutorialSkip').onclick = () => Tutorial.complete();
})();
