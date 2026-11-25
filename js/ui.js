// Интерфейс и игровой цикл экранов: порт MainMenuController, LevelsPanelUI, CategoryCardLock,
// ShopPanelUI/SkinCardUI, SettingsPanelUI, ResultScreenUI, GameFlow и AdManager.
(function () {
  const $ = id => document.getElementById(id);
  const CAT_IMAGES = ['cat_forest', 'cat_desert', 'cat_china', 'cat_arctic', 'cat_mars'];
  const COIN = 'assets/art/obj/coin.webp', AD = 'assets/art/ui/icon_ad.webp';

  // ------------------------------------------------------ политика рекламы --
  // Полноэкранная — только в естественных паузах и не чаще раза в 180 с (лимит площадки — 120 с);
  // тишина 180 с после старта и после rewarded, не во время геймплея; rewarded — с блокировкой от двойного нажатия.
  const Ads = {
    sessionStart: performance.now(),
    lastInterstitial: -Infinity,
    lastRewarded: -Infinity,
    busy: false,
    FIRST_DELAY: 180, COOLDOWN: 180, AFTER_REWARDED: 180,

    interstitial(cb) {
      const now = performance.now() / 1000;
      const ok = now - this.sessionStart / 1000 >= this.FIRST_DELAY &&
        now - this.lastInterstitial >= this.COOLDOWN && now - this.lastRewarded >= this.AFTER_REWARDED;
      if (this.busy) return;   // реклама уже запрошена: второй клик не должен запускать переход дважды
      if (!ok) { cb(); return; }
      this.busy = true;
      Platform.showInterstitial(shown => {
        this.busy = false;
        if (shown) this.lastInterstitial = performance.now() / 1000;
        cb();
      });
    },

    // Реклама после прохождения уровня: раз в 2–3 победы (счётчик, а не таймер).
    wins: 0,
    nextAt: 2 + Math.floor(Math.random() * 2),
    levelWon() { this.wins++; },
    afterLevel(cb) {
      const now = performance.now() / 1000;
      // счётчик решает «когда», но паузы FIRST_DELAY / COOLDOWN / AFTER_REWARDED остаются
      const calm = now - this.sessionStart / 1000 >= this.FIRST_DELAY && now - this.lastInterstitial >= this.COOLDOWN && now - this.lastRewarded >= this.AFTER_REWARDED;
      if (this.busy) return;
      if (this.wins < this.nextAt || !calm) { cb(); return; }
      this.busy = true;
      Platform.showInterstitial(shown => {
        this.busy = false;
        if (shown) {
          this.wins = 0;
          this.nextAt = 2 + Math.floor(Math.random() * 2);
          this.lastInterstitial = performance.now() / 1000;
        }
        cb();
      });
    },

    rewarded(onReward) {
      if (this.busy) return;
      this.busy = true;
      Platform.showRewarded(() => { onReward(); Sound.ui('buy'); }, rewarded => {
        this.busy = false;
        if (rewarded) this.lastRewarded = performance.now() / 1000;
        if (!rewarded && UI.coinShown == null) UI.toast(t('adUnavailable'));
        UI.refreshCoins();
      });
    },
  };

  // ------------------------------------------------------------ рендер кота --
  /** Рисует риг кота в маленький canvas (герой меню, карточки скинов). */
  function makeCatPreview(canvas, skinIdFn, animated, zoom) {
    const rig = new Engine.Node(GAME_DATA.player);
    const model = rig.find(n => n.role === '_playerTransform');
    const wing = rig.find(n => n.role === '_wingRight');
    const tail = rig.find(n => n.role === '_tail');
    const body = rig.find(n => n.sprite === 'Cat_2');
    const ctx = canvas.getContext('2d');
    model.x = 0; model.y = 0;
    return function draw(time) {
      applySkinTo(rig, skinIdFn());
      if (animated) {
        const ph = (time * 2.2) % 1;
        if (wing) wing.rot = wing.base.rot + (ph < .5 ? Engine.lerp(0, 40, Engine.smooth01(ph * 2)) : Engine.lerp(40, -30, Engine.smooth01((ph - .5) * 2)));
        if (tail) tail.rot = tail.base.rot + Math.sin(time * 6) * 25;
        model.y = Math.sin(time * 2) * 0.08;
        model.rot = Math.sin(time * 1.3) * 6;
      }
      rig.updateWorld(null);
      const W = canvas.width, H = canvas.height, S = Math.min(W, H) / 2.1 * (zoom || 1);
      const view = [S, 0, 0, -S, W / 2 + 0.05 * S, H / 2 + (zoom ? 0.28 : -0.05) * S];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      model.draw(ctx, view);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };
  }

  // -------------------------------------------------------------------- UI --
  const UI = {
    game: null,
    session: null, // состояние GameFlow

    init(game) {
      this.game = game;
      // рекламные кнопки скрыты, пока реклама недоступна (блокировщик, площадка, нет показа)
      const adButtons = () => document.querySelectorAll('[data-reward-coins], #btnDaily').forEach(el => el.classList.toggle('hidden', !Platform.adsEnabled));
      adButtons();
      Platform.onAdsChange(adButtons);
      Platform.onConflict(() => {
        Save.dropLocal();
        $('reloadPrompt').classList.remove('hidden');
        this.applySys && this.applySys();
      });
      $('btnReload').onclick = () => location.reload();
      game.onStart = () => { $('tapHint').classList.add('hidden'); };
      game.onLose = () => this.showLose();
      game.onWin = () => this.showWin();
      game.onCoins = () => {
        this.refreshCoins();
        // счётчик в HUD «баблится» при каждой подобранной монетке
        const pill = document.querySelector('#hud .coins-pill');
        pill.classList.remove('bubble'); void pill.offsetWidth; pill.classList.add('bubble');
      };
      Save.onChange = () => this.refreshCoins();

      // звуки нажатий в интерфейсе (синтез в audio.js)
      document.addEventListener('pointerdown', e => {
        if (e.target.id === 'overlay') { Sound.ui('close'); return; }
        const el = e.target.closest('button, .cat-card, .toggle-row');
        if (!el || el.disabled) return;
        if (el.classList.contains('close-btn')) Sound.ui('close');
        else if (['btnLevels', 'btnShop', 'btnSettings'].includes(el.id)) Sound.ui('open');
        else if (el.classList.contains('toggle-row')) Sound.ui('toggle');
        else if (!el.classList.contains('cat-card')) Sound.ui('click');
      });

      $('btnPlay').onclick = () => { Tutorial.fromPlay = true; this.playCategory(0); };
      $('btnLevels').onclick = () => this.openPanel('levelsPanel');
      $('btnShop').onclick = () => this.openPanel('shopPanel');
      $('btnSettings').onclick = () => this.openPanel('settingsPanel');
      $('btnHome').onclick = () => this.goMenu(false);
      $('btnResetProgress').onclick = () => $('resetProgressConfirm').classList.remove('hidden');
      $('btnCancelReset').onclick = () => $('resetProgressConfirm').classList.add('hidden');
      $('btnConfirmReset').onclick = () => { Save.resetProgress(); location.reload(); };
      $('overlay').onclick = () => this.closePanels();
      document.querySelectorAll('.close-btn').forEach(b => b.onclick = () => this.closePanels());
      document.querySelectorAll('[data-reward-coins]').forEach(b => b.onclick = () => {
        const from = b.getBoundingClientRect();
        Ads.rewarded(() => this.giveCoins(10, from));
      });

      $('endlessBtn').onclick = () => { Sound.ui('click'); this.startLevel('endless', 0); };
      $('btnDaily').onclick = () => {
        if (Save.dailyLeft() > 0) return;
        const from = $('btnDaily').getBoundingClientRect();
        Ads.rewarded(() => { Save.claimDaily(); this.giveCoins(25, from); this.updateDaily(); });
      };

      const tgl = $('tglSounds');
      const soundIco = () => { $('soundIco').src = Art.ui(tgl.checked ? 'icon_sound_on' : 'icon_sound_off'); };
      tgl.checked = Save.sounds; soundIco();
      tgl.onchange = () => { Save.sounds = tgl.checked; soundIco(); if (!tgl.checked) Sound.stopAll(); Sound.Music.refresh(); };

      // отдельный переключатель музыки
      const tm = $('tglMusic');
      const musicIco = () => { $('musicIco').src = Art.ui(tm.checked ? 'icon_sound_on' : 'icon_sound_off'); };
      tm.checked = Save.music; musicIco();
      tm.onchange = () => { Save.music = tm.checked; musicIco(); Sound.Music.refresh(); };

      // шкала громкости (общая для всех звуков игры)
      const vol = $('volRange'), volVal = $('volVal');
      const showVol = () => { const v = Math.round(Save.volume * 100); vol.value = v; volVal.textContent = v; vol.style.setProperty('--v', v + '%'); };
      showVol();
      let volTick = 0;
      vol.oninput = () => {
        Save.volume = vol.value / 100; Sound.setVolume(Save.volume); showVol();
        if (performance.now() - volTick > 120) { volTick = performance.now(); Sound.ui('click'); }   // звук-образец при перемещении
      };

      // переключатель языка: названия на самих языках (требование 6.9)
      this.buildLangList();
      this.applyLanguageToUI();

      // --- пауза и звук (требования 1.3, 4.7, 1.19.4) ---
      // Игра и звук останавливаются при рекламе, скрытой вкладке, конфликте сохранений и потере фокуса:
      // окно авторизации площадка открывает поверх игры сама, отдельного события в SDK нет.
      const sys = this.sys = { hidden: document.hidden, ad: Platform.adOpen, blurred: false };
      const apply = () => {
        const stopGame = sys.hidden || sys.ad || sys.blurred || Platform.storageBlocked || Orientation.blocked || Tutorial.paused;
        game.paused = stopGame;
        if (stopGame) game.input.held = false;
        Sound.setMuted(stopGame);
        $('pauseHint').classList.toggle('hidden', !(sys.blurred && !sys.ad && !sys.hidden && this.inGame && $('result').classList.contains('hidden')));
      };
      this.applySys = apply;
      Platform.onPause(() => { sys.ad = true; apply(); });
      // реклама забирает фокус и не всегда возвращает его — снимаем и эту паузу
      Platform.onResume(() => { sys.ad = false; sys.blurred = false; window.focus(); apply(); });
      document.addEventListener('visibilitychange', () => { sys.hidden = document.hidden; apply(); });
      window.addEventListener('blur', () => { sys.blurred = true; apply(); });
      window.addEventListener('focus', () => { sys.blurred = false; apply(); });
      // если фокус «потерялся» из-за окна рекламы и не вернулся — любое касание игры снимает глушение
      window.addEventListener('pointerdown', () => { if (sys.blurred) { sys.blurred = false; apply(); } }, true);
      apply();

      // Шрифты грузятся с font-display: swap, а размер окна меняется (поворот, ресайз) —
      // подгонку длинных надписей повторяем, иначе она остаётся посчитанной для запасного шрифта.
      let refitTimer = 0;
      const refit = () => { clearTimeout(refitTimer); refitTimer = setTimeout(() => this.refitVisible(), 120); };
      window.addEventListener('resize', refit);
      if (document.fonts) { document.fonts.ready.then(refit); document.fonts.addEventListener?.('loadingdone', refit); }

      this.checkRot = () => Orientation.refresh();

      this.showMenu();
    },

    // ----------------------------------------------------------------- язык --
    buildLangList() {
      const box = $('langList');
      box.innerHTML = '';
      I18N.codes.forEach(code => {
        const b = document.createElement('button');
        b.className = 'lang-chip' + (code === I18N.lang ? ' on' : '');
        b.textContent = I18N.NAMES[code];
        b.dataset.lang = code;
        b.onclick = () => this.setLanguage(code);
        box.appendChild(b);
      });
    },

    setLanguage(code) {
      Save.lang = code;
      I18N.setLang(code);
      this.applyLanguageToUI();
      if (!$('levelsPanel').classList.contains('hidden')) this.buildCategories();
      if (!$('shopPanel').classList.contains('hidden')) this.buildShop();
      this.refreshCoins();
    },

    /** Всё, что не обновляется атрибутом data-i18n: логотип (русский только для ru), подсказки, выбранный язык. */
    applyLanguageToUI() {
      Orientation.refresh();
      document.querySelectorAll('.logo-img').forEach(el => { el.src = Art.ui(I18N.lang === 'ru' ? 'logo_ru' : 'logo_en'); el.alt = t('title'); });
      document.querySelectorAll('.lang-chip').forEach(b => b.classList.toggle('on', b.dataset.lang === I18N.lang));
      $('volRange').setAttribute('aria-label', t('volume'));
      const rot = $('rotateHint'); if (rot) rot.querySelector('[data-i18n]').textContent = t('rotate');
    },

    // ---------------------------------------------------------------- меню --
    showMenu() {
      Tutorial.end();
      this.inGame = false;
      Sound.Music.play('menu');
      $('menuBg').classList.remove('hidden');
      $('game').classList.add('hidden');
      this.game.state = 'none';
      Sound.stopAll();
      $('menu').classList.remove('hidden');
      $('hud').classList.add('hidden');
      $('tapHint').classList.add('hidden');
      $('result').classList.add('hidden');
      this.closePanels();
      this.refreshCoins();
      this.updateDaily();
      this.checkRot && this.checkRot();
      setTimeout(() => { if (!this.inGame) this.offerWorld(); }, 450);   // вернулись в меню с монетами на новый мир
    },

    /** Ежедневный подарок: готов — пульсирует, иначе показывает обратный отсчёт ЧЧ:ММ:СС. */
    updateDaily() {
      const b = $('btnDaily'), left = Save.dailyLeft();
      b.classList.toggle('ready', left <= 0);
      b.classList.toggle('wait', left > 0);
      const s = Math.ceil(left / 1000), p = n => String(n).padStart(2, '0');
      const txt = left > 0 ? `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` : '';
      const el = b.querySelector('.daily-timer');
      if (el.textContent !== txt) el.textContent = txt;
    },

    openPanel(id) {
      const panel = $(id);
      const show = panel.classList.contains('hidden');
      this.closePanels();
      if (!show) return;
      if (id === 'levelsPanel') this.buildCategories();
      if (id === 'shopPanel') this.buildShop();
      $('overlay').classList.remove('hidden');
      panel.classList.remove('hidden');
      if (id === 'shopPanel') this.fitShop();
      if (id === 'levelsPanel') this.fitLevels();
    },

    closePanels() {
      $('resetProgressConfirm').classList.add('hidden');
      ['overlay', 'levelsPanel', 'shopPanel', 'settingsPanel'].forEach(id => $(id).classList.add('hidden'));
      this.showLevelGrid(null);
    },

    refreshCoins() {
      // пока монетки летят, счётчик показывает «старое» значение и прибавляет по одной
      const shown = this.coinShown != null ? this.coinShown : Save.coins;
      document.querySelectorAll('.coins-value').forEach(el => { el.textContent = shown; });
      const s = this.session;
      $('hudCoins').textContent = shown + (this.inGame && s && !s.committed && this.game ? this.game.runCoins : 0);
      $('menuProgress').textContent = Math.round(this.totalProgress() * 100) + '%';
    },

    // ---------------------------------------------------- данные категорий --
    levelCount(ci) {
      const c = GAME_DATA.categories[ci];
      return c.levels.length > 0 ? c.levels.length : Math.max(0, c.levelCount);
    },
    categoryProgress(ci) {
      const n = this.levelCount(ci);
      if (n <= 0) return 0;
      return Engine.clamp01((Save.lastLevel(ci) + 1) / n);
    },
    totalProgress() {
      let total = 0, done = 0;
      GAME_DATA.categories.forEach((c, i) => { const n = this.levelCount(i); total += n; done += Math.max(0, Math.min(n, Save.lastLevel(i) + 1)); });
      return total ? done / total : 0;
    },

    buildCategories() {
      const list = $('categoryList');
      list.innerHTML = '';
      GAME_DATA.categories.forEach((cat, i) => {
        const unlocked = Save.isUnlocked(i);
        const pct = Math.round(this.categoryProgress(i) * 100);
        const n = this.levelCount(i), done = Math.max(0, Math.min(n, Save.lastLevel(i) + 1));
        const card = document.createElement('div');
        card.className = 'cat-card c' + i + (unlocked ? '' : ' locked');
        card.innerHTML =
          `<img class="cat-img" src="assets/art/ui/${CAT_IMAGES[i] || CAT_IMAGES[0]}.webp" alt="">` +
          `<div class="cat-name">${t('cat' + i)}</div>` +
          (unlocked
            ? `<div class="cat-progress${pct >= 100 ? ' full' : ''}"><i style="width:${pct}%"></i><b>${pct}%</b></div><div class="cat-stars">★ ${Save.starsTotal(i, n)}/${n * 3}</div>`
            : `<img class="lock" src="assets/art/ui/icon_lock.webp" alt=""><div class="cost"><img src="${COIN}" alt="">${cat.unlockCost}</div>`);
        card.onclick = () => this.onCategoryClick(i, card);
        list.appendChild(card);
      });
      this.buildQuest();
      const note = document.querySelector('#levelsPanel .levels-note'), can = Save.dev || Save.data.toonSeen || this.allDone();
      note.classList.toggle('playable', can);
      note.firstElementChild.textContent = t(can ? 'cartoonPlay' : 'cartoonHint');
      note.firstElementChild.dataset.i18n = can ? 'cartoonPlay' : 'cartoonHint';
      note.onclick = can ? () => { Sound.ui('click'); Toon.play(() => Sound.Music.play('menu')); } : null;
      $('endlessBest').textContent = Save.best > 0 ? `${t('best')}: ${Save.best} ${t('meters')}` : '';
    },

    // --------------------------------------------------- выбор уровня и звёзды --
    /** Сетка уровней категории со звёздами; null — вернуться к списку категорий. */
    showLevelGrid(ci) {
      const grid = $('levelGrid');
      const on = ci != null;
      grid.classList.toggle('hidden', !on);
      ['categoryList', 'questRow', 'endlessBtn'].forEach(id => $(id).classList.toggle('hidden', on));
      document.querySelector('#levelsPanel .levels-note').classList.toggle('hidden', on);
      if (!on) return;
      const n = this.levelCount(ci), last = Save.lastLevel(ci);
      let h = `<div class="grid-head"><button class="btn small yellow grid-back" id="gridBack"><img src="assets/art/ui/icon_back.webp" alt="${t('back')}"></button><span class="grid-title ts-text">${t('cat' + ci)}</span><span class="grid-stars ts-text">${starSvg(true)}${Save.starsTotal(ci, n)}/${n * 3}</span></div><div class="grid-tiles">`;
      for (let li = 0; li < n; li++) {
        const open = li <= last + 1, st = Save.stars(ci, li);   // по порядку и в режиме разработчика; прыжок на любой уровень — из панели DEV
        h += `<button class="lv-tile${open ? '' : ' locked'}${li === last + 1 ? ' next' : ''}" data-li="${li}"${open ? '' : ' disabled'}>` +
          (open ? `<b class="ts-text">${li + 1}</b><span class="lv-stars">${[1, 2, 3].map(k => starSvg(k <= st)).join('')}</span>`
                : `<img src="assets/art/ui/icon_lock.webp" alt="">`) + `</button>`;
      }
      grid.innerHTML = h + '</div>';
      $('gridBack').onclick = () => { Sound.ui('close'); this.showLevelGrid(null); };
      grid.querySelectorAll('.lv-tile:not(.locked)').forEach(b => b.onclick = () => this.startLevel(ci, +b.dataset.li));
    },

    // ------------------------------------------------------------ задание дня --
    ensureQuest() {
      const today = new Date().toLocaleDateString('sv');
      let q = Save.quest;
      if (q && q.day === today && GAME_DATA.categories[q.ci] && GAME_DATA.categories[q.ci].levels[q.li]) return q;
      const open = GAME_DATA.categories.map((c, i) => i).filter(i => Save.isUnlocked(i));
      const ci = open[Math.floor(Math.random() * open.length)];
      const li = Math.floor(Math.random() * Math.max(1, Math.min(this.levelCount(ci), Save.lastLevel(ci) + 2)));
      const total = GAME_DATA.categories[ci].levels[li].coins.length;
      q = { day: today, ci, li, need: Math.max(5, Math.round(total * 0.6)), got: 0, reward: 40 + 15 * ci, claimed: false };
      Save.quest = q;
      return q;
    },
    buildQuest() {
      const q = this.ensureQuest(), box = $('questRow');
      const done = q.got >= q.need;
      box.className = 'quest-row' + (done ? ' done' : '') + (q.claimed ? ' claimed' : '');
      const got = Math.min(q.got, q.need);
      box.innerHTML =
        `<div class="q-info"><span class="q-title ts-text">${t('quest')}</span>` +
        `<div class="q-line"><span class="q-body ts-text">${t('cat' + q.ci)} ${q.li + 1}</span>` +
        `<div class="q-bar"><i style="width:${Math.round(got / q.need * 100)}%"></i><b class="ts-text"><img src="${COIN}" alt="">${got}/${q.need}</b></div></div></div>` +
        (q.claimed ? `<div class="q-chip got"><span class="ts-text">✓</span></div>`
          : done ? `<button class="btn small yellow q-claim" id="questBtn"><span class="ts-text">${t('claim')} +${q.reward}</span><img src="${COIN}" alt=""></button>`
          : `<div class="q-chip"><span class="ts-text">+${q.reward}</span><img src="${COIN}" alt=""></div>`);
      this.fitLevels();
      if (!done || q.claimed) return;
      $('questBtn').onclick = () => {
        const from = $('questBtn').getBoundingClientRect();
        q.claimed = true; Save.quest = q;
        this.giveCoins(q.reward, from);
        this.buildQuest();
      };
    },
    /** После победы: засчитывает монеты в задание дня. */
    questProgress(ci, li, coins) {
      const q = this.ensureQuest();
      if (q.ci !== ci || q.li !== li || q.claimed) return;
      const was = q.got >= q.need;
      if (coins > q.got) { q.got = coins; Save.quest = q; }
      if (!was && q.got >= q.need) this.toast('✓ ' + t('quest'));
    },

    onCategoryClick(ci, card) {
      if (card.classList.contains('unlocking')) return;   // идёт эффект открытия
      if (Save.isUnlocked(ci)) {
        Sound.ui('click');
        if (GAME_DATA.categories[ci].levels.length === 0) { this.toast(t('soon')); return; }
        this.showLevelGrid(ci);
        return;
      }
      const cost = GAME_DATA.categories[ci].unlockCost;
      if (cost <= 0 || Save.spendCoins(cost)) {
        Save.setUnlocked(ci, true);
        this.unlockSound();   // как подбор монеты, но восходящая «лесенка» из четырёх нот
        this.unlockEffect(card, ci);
        return;
      }
      Sound.ui('error');
      const lock = card.querySelector('.lock');
      if (lock) { lock.classList.remove('shake'); void lock.offsetWidth; lock.classList.add('shake'); }
      if (!card.querySelector('.hint')) {
        const h = document.createElement('div');
        h.className = 'hint'; h.textContent = t('notEnough');
        card.appendChild(h);
        setTimeout(() => h.remove(), 2000);
      }
    },

    // ------------------------------------------- предложение открыть новый мир --
    /** Следующий закрытый мир по порядку, если на него уже хватает монет и его ещё не предлагали в этой игре; иначе -1. */
    worldOffer() {
      this._offered = this._offered || new Set();
      const cats = GAME_DATA.categories;
      for (let ci = 1; ci < cats.length; ci++) {
        if (Save.isUnlocked(ci)) continue;
        return cats[ci].levels.length && !this._offered.has(ci) && Save.coins >= cats[ci].unlockCost ? ci : -1;
      }
      return -1;
    },
    /** Окно «Новый мир!»: открыть за монеты и сразу начать первый уровень. later — что делать при отказе.
     *  Возвращает true, если окно показано (тогда продолжение — за кнопками окна). */
    offerWorld(later) {
      const ci = this.worldOffer();
      if (ci < 0) return false;
      this._offered.add(ci);
      const cost = GAME_DATA.categories[ci].unlockCost;
      const fx = document.createElement('div');
      fx.className = 'world-offer';
      fx.innerHTML = `<div class="wo-rays"></div><div class="wo-card">` +
        `<div class="wo-title ts-text">${t('newWorld')}</div>` +
        `<img class="wo-img" src="assets/art/ui/${CAT_IMAGES[ci]}.webp" alt="">` +
        `<div class="wo-text ts-text">${t('worldReady')}</div><div class="wo-name ts-text">${t('cat' + ci)}</div>` +
        `<button class="btn yellow wo-open"><span class="ts-text">${t('openPlay')}</span><span class="wo-cost ts-text"><img src="${COIN}" alt="">${cost}</span></button>` +
        `<button class="btn violet wo-later"><span class="ts-text">${t('later')}</span></button></div>`;
      $('app').appendChild(fx);
      this.fitText(fx, '.wo-open > .ts-text, .wo-later, .wo-text, .wo-name');
      Sound.ui('open');
      let done = false;
      const close = () => { fx.classList.add('out'); setTimeout(() => fx.remove(), 320); };
      fx.querySelector('.wo-later').onclick = () => {
        if (done) return; done = true;
        Sound.ui('close'); close(); if (later) later();
      };
      fx.querySelector('.wo-open').onclick = () => {
        if (done) return; done = true;
        if (!Save.spendCoins(cost)) { Sound.ui('error'); close(); if (later) later(); return; }
        Save.setUnlocked(ci, true);
        this.unlockSound();
        this.refreshCoins();
        fx.classList.add('opened');   // кот мира подпрыгивает, кнопка вдавлена
        setTimeout(() => { close(); this.startLevel(ci, 0); }, 1000);
      };
      return true;
    },

    /** Звук открытия: тот же «поп», что и при подборе монеты, но четыре раза с нарастающим тоном (прима, терция, квинта, октава). */
    unlockSound() {
      if (!Sound.buffers.coin_pop) { Sound.ui('buy'); return; }
      [1, 1.26, 1.5, 2].forEach((rate, i) => setTimeout(() => Sound.play('coin_pop', 0.6, rate), i * 95));
    },

    /** Эффект открытия категории: замок «лопается», вокруг карточки разлетаются звёзды и искры, затем карточка вспыхивает. */
    unlockEffect(card, ci) {
      const r = card.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.4;
      card.classList.add('unlocking');
      const box = document.createElement('div'); box.className = 'unlock-fx'; document.body.appendChild(box);
      const imgs = ['assets/fx/star.webp', 'assets/fx/sparkle.webp', 'assets/fx/glow.webp'];
      const ring = document.createElement('img'); ring.src = 'assets/fx/ring2.webp'; ring.className = 'ufx-ring'; ring.style.left = cx + 'px'; ring.style.top = cy + 'px'; box.appendChild(ring);
      for (let i = 0; i < 16; i++) {
        const p = document.createElement('img');
        p.src = imgs[i % 3]; p.className = 'ufx-p';
        const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3, d = 70 + Math.random() * 70;
        p.style.cssText = `left:${cx}px;top:${cy}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 20}px;--s:${0.7 + Math.random() * 0.8};animation-delay:${Math.random() * 0.08}s`;
        box.appendChild(p);
      }
      setTimeout(() => {
        this.buildCategories();
        const nc = $('categoryList').children[ci]; if (nc) nc.classList.add('unlock-pop');
      }, 420);
      setTimeout(() => box.remove(), 1400);
    },

    /** Открытие скина: кот выпрыгивает крупно в центре на фоне лучей, вокруг салют из звёзд,
     *  потом улетает обратно в свою карточку, и та вспыхивает. Тап по экрану — пропустить. */
    skinUnlockEffect(skin, card) {
      this.unlockSound();
      const fx = document.createElement('div');
      fx.className = 'skin-unlock';
      fx.innerHTML = `<i class="su-rays"></i><div class="su-cat"><img src="${Art.skinIcon(skin.id)}" alt=""></div>` +
        `<div class="su-name ts-text">${skinName(skin)}</div>`;
      document.body.appendChild(fx);
      const imgs = ['assets/fx/star.webp', 'assets/fx/sparkle.webp', 'assets/fx/glow.webp'];
      const burst = (n, d0, delay) => {
        for (let i = 0; i < n; i++) {
          const p = document.createElement('img');
          p.src = imgs[i % 3]; p.className = 'ufx-p su-p';
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = d0 + Math.random() * d0 * 0.8;
          p.style.cssText = `left:50%;top:45%;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 30}px;--s:${0.9 + Math.random()};animation-delay:${delay + Math.random() * 0.1}s`;
          fx.appendChild(p);
        }
      };
      burst(18, 120, 0.25); burst(14, 220, 0.45);
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        // кот летит из центра в свою карточку
        const cat = fx.querySelector('.su-cat'), r = card.getBoundingClientRect(), c = cat.getBoundingClientRect();
        cat.style.transform = `translateY(-50%) translate(${r.left + r.width / 2 - (c.left + c.width / 2)}px, ${r.top + r.height * 0.35 - (c.top + c.height / 2)}px) scale(${Math.min(1, r.width * 0.7 / c.width)})`;
        fx.classList.add('out');
        // магазин перестраиваем сразу: под гаснущим затемнением уже новый «Надет», а не прежний скин на полсекунды
        this.buildShop();
        const nc = [...$('skinList').children].find(el => el.classList.contains('selected'));
        setTimeout(() => {
          fx.remove();
          if (nc) { nc.classList.add('unlock-pop'); setTimeout(() => nc.classList.remove('unlock-pop'), 750); }
        }, 450);
      };
      fx.addEventListener('pointerdown', finish);
      setTimeout(finish, 2200);
    },

    // ------------------------------------------------------------ магазин --
    buildShop() {
      const list = $('skinList');
      list.innerHTML = '';
      for (const skin of GAME_DATA.skins) {
        const owned = Save.isOwned(skin.id);
        const cost = skin.cost || (!Platform.adsEnabled && skin.ads > 0 ? skin.ads * 50 : 0);
        const selected = Save.skin === skin.id;
        const card = document.createElement('div');
        card.className = 'skin-card' + (selected ? ' selected' : '');
        const icoWrap = document.createElement('div');
        icoWrap.className = 'skin-ico-wrap';
        if (selected) icoWrap.innerHTML = '<i class="skin-rays"></i><b class="skin-spark s1">★</b><b class="skin-spark s2">★</b><b class="skin-spark s3">★</b>';
        const ico = document.createElement('img');
        ico.className = 'skin-ico'; ico.src = Art.skinIcon(skin.id); ico.alt = '';
        icoWrap.appendChild(ico);
        card.appendChild(icoWrap);
        const name = document.createElement('div');
        name.className = 'skin-name';
        name.textContent = skinName(skin);
        card.appendChild(name);

        if (selected) {
          const badge = document.createElement('div');
          badge.className = 'skin-badge ts-text'; badge.textContent = t('equipped');
          card.appendChild(badge);
        } else if (owned) {
          const b = btn(t('equip'), 'green');
          b.onclick = () => { Save.selectSkin(skin.id); this.buildShop(); };
          card.appendChild(b);
        } else {
          if (cost > 0) {
            const b = btn(String(cost), 'yellow');
            b.onclick = () => {
              if (!Save.spendCoins(cost)) { Sound.ui('error'); this.toast(t('notEnough')); return; }
              Save.setOwned(skin.id); Save.selectSkin(skin.id);
              this.skinUnlockEffect(skin, card);
            };
            card.appendChild(b);
          }
          if (Platform.adsEnabled && skin.ads > 0) {
            const b = btn(`<img src="${AD}" alt="">${Save.adViews(skin.id)}/${skin.ads}`, 'violet');
            b.onclick = () => Ads.rewarded(() => {
              Save.addAdView(skin.id);
              if (Save.adViews(skin.id) >= skin.ads) { Save.setOwned(skin.id); Save.selectSkin(skin.id); this.skinUnlockEffect(skin, card); return; }
              this.buildShop();
            });
            card.appendChild(b);
          }
        }
        list.appendChild(card);
      }
      this.fitShop();
    },

    /** Длинные названия и надписи на кнопках (на любом языке) уменьшаем, чтобы влезли одной строкой.
     *  Пока панель скрыта, мерить нечего — тогда вызывается ещё раз из openPanel. */
    fitShop() { this.fitText($('skinList'), '.skin-name, .btn, .skin-badge'); },
    fitLevels() { this.fitText($('levelsPanel'), '.q-claim, .q-body, .endless-text > .ts-text'); },
    fitGift() { this.fitText($('skinGift'), '.gift-text'); },
    refitVisible() {
      if (!$('shopPanel').classList.contains('hidden')) this.fitShop();
      if (!$('levelsPanel').classList.contains('hidden')) this.fitLevels();
      if (!$('skinGift').classList.contains('hidden')) this.fitGift();
    },
    fitText(root, sel) {
      root.querySelectorAll(sel).forEach(el => {
        el.style.fontSize = ''; el.style.whiteSpace = ''; el.style.lineHeight = '';
        if (!el.clientWidth) return;
        let fs = parseFloat(getComputedStyle(el).fontSize);
        while (el.scrollWidth > el.clientWidth + 1 && fs > 10) el.style.fontSize = (fs -= 1) + 'px';
        // на минимальном размере всё ещё не влезает — разрешаем перенос по словам (2 строки)
        if (el.scrollWidth > el.clientWidth + 1) {
          el.style.whiteSpace = 'normal'; el.style.lineHeight = '1.05';
          el.style.fontSize = Math.min(13, parseFloat(getComputedStyle(el).fontSize) + 2) + 'px';
          // одно длинное слово: ужимаем дальше, но не мельче 8px
          fs = parseFloat(el.style.fontSize);
          while (el.scrollWidth > el.clientWidth + 1 && fs > 8) el.style.fontSize = (fs -= 1) + 'px';
        }
      });
    },

    // -------------------------------------------------------- GameFlow --
    /** LevelManager.LoadCategoryLevel: следующий непройденный уровень категории (или с начала). */
    playCategory(ci) {
      const n = GAME_DATA.categories[ci].levels.length;
      if (!n) { this.toast(t('soon')); return; }
      const next = Save.lastLevel(ci) + 1;
      this.startLevel(ci, next >= n ? 0 : Math.max(0, Math.min(next, n - 1)));
    },

    startLevel(ci, li) {
      Sound.Music.play(ci === 'endless' ? 'forest' : ['forest', 'desert', 'china', 'arctic', 'mars'][ci]);   // у локации без трека — тишина
      this.inGame = true;
      $('menuBg').classList.add('hidden');
      $('game').classList.remove('hidden');
      this.closePanels();
      $('menu').classList.add('hidden');
      $('result').classList.add('hidden');
      $('hud').classList.remove('hidden');
      $('tapHint').classList.remove('hidden');
      $('hudLevelNum').textContent = ci === 'endless' ? '∞' : li + 1;
      this.session = { ci, li, committed: false, reviveUsed: false, x2Used: false, progressSaved: false };
      this.game.trialSkin = this.trialSkin || null;   // подарочный скин держится до первого проигрыша
      const training = Tutorial.begin(this.game, ci, li);
      this.game.load(ci, li, training ? buildTutorialLevel() : null);
      this.applySys();
      this.refreshCoins();
      this.checkRot();
    },

    coinsThisRun() { return this.game.runCoins || 0; },
    /** Пройдены все уровни всех категорий (условие мультфильма). */
    allDone() { return GAME_DATA.categories.every((c, i) => Save.lastLevel(i) >= this.levelCount(i) - 1); },

    hasNext() { const s = this.session; return s.li + 1 < GAME_DATA.categories[s.ci].levels.length; },

    saveProgress() {
      const s = this.session;
      if (s.progressSaved) return;
      if (s.li > Save.lastLevel(s.ci)) Save.setLastLevel(s.ci, s.li);
      s.progressSaved = true;
    },

    showLose() {
      Tutorial.end();
      const s = this.session;
      const canRevive = Platform.adsEnabled && !s.reviveUsed;
      this.trialSkin = null; this.giftSkin = null;   // подарочный скин пропадает после проигрыша
      if (this.game.endless) { this.showEndless(false); return; }
      Save.noteTry(s.ci, s.li, false);
      this.showResult('lose', t('lose'), canRevive ? t('reviveHint') : t('reviveUsed'), [
        canRevive && { html: adBtn(t('revive')), raw: true, cls: 'revive reward-action', fn: () => this.revive() },
        { html: t('retry'), cls: canRevive ? 'green' : 'yellow', fn: () => Ads.interstitial(() => this.startLevel(s.ci, s.li)) },
        { html: t('toMenu'), cls: 'violet', fn: () => this.goMenu(true) },
      ]);
    },

    showWin() {
      Tutorial.complete();
      if (this.game.endless) { this.showEndless(true); return; }
      this.saveProgress();
      const s = this.session;
      const coins = this.coinsThisRun();
      if (!s.committed) { s.committed = true; Save.noteTry(s.ci, s.li, true); Ads.levelWon(); if (coins > 0) Save.addCoins(coins); }
      const total = this.game.coins.length, ratio = total ? coins / total : 1;
      const stars = 1 + (ratio >= 0.7 ? 1 : 0) + (ratio >= 0.9 ? 1 : 0);
      Save.setStars(s.ci, s.li, stars);
      this.questProgress(s.ci, s.li, coins);
      const hasNext = this.hasNext();
      const starsHtml = `<div class="res-stars">${[1, 2, 3].map(k => starSvg(k <= stars, 0.25 + k * 0.28)).join('')}</div>`;
      this.showResult('win', t('win'), `<div class="res-line">${t('coinsForLevel')} <img src="${COIN}" alt=""> ${coins}/${total}</div>${starsHtml}`, [
        { html: hasNext ? t('next') : t('toMenu'), cls: 'yellow', fn: () => this.continueAfterWin() },
        (Platform.adsEnabled && !s.x2Used && coins > 0) && { html: adBtn(t('x2')), raw: true, cls: 'green reward-action bounce', fn: () => this.doubleCoins() },
        hasNext && { html: t('toMenu'), cls: 'violet', fn: () => this.goMenu(true) },
      ]);
      this.showSkinGift(hasNext);
    },

    /** Итог бесконечного забега: дистанция, рекорд; монеты забега зачисляются (после воскрешения — только прибавка). */
    showEndless(win) {
      const s = this.session, g = this.game;
      const dist = Math.max(0, Math.floor(g.pmX)), prevBest = Save.best;
      Save.best = dist;
      const gain = g.runCoins - (s.paid || 0);
      if (gain > 0) { Save.addCoins(gain); s.paid = g.runCoins; }
      if (!s.counted) { s.counted = true; Ads.levelWon(); }
      const canRevive = Platform.adsEnabled && !win && !s.reviveUsed;
      const record = dist > prevBest && dist > 0;
      this.showResult(win ? 'win' : 'lose', win ? t('win') : t('lose'),
        `<div class="res-line">${dist} ${t('meters')}${record ? ' ★' : ''} · ${t('best')}: ${Save.best} ${t('meters')}</div>` +
        `<div class="res-line"><img src="${COIN}" alt=""> ${g.runCoins}</div>`, [
        canRevive && { html: adBtn(t('revive')), raw: true, cls: 'revive reward-action', fn: () => this.revive() },
        { html: t('retry'), cls: canRevive ? 'green' : 'yellow', fn: () => Ads.interstitial(() => this.startLevel('endless', 0)) },
        { html: t('toMenu'), cls: 'violet', fn: () => this.goMenu(true) },
      ]);
    },

    showResult(kind, title, text, buttons) {
      $('resultTitle').textContent = title;
      $('resultTitle').className = 'result-title ts-text';
      $('result').className = 'result ' + kind;
      $('resultPlate').src = 'assets/art/ui/' + (kind === 'win' ? 'plate_win' : 'plate_lose') + '.webp';
      $('resultText').innerHTML = text;
      $('skinGift').classList.add('hidden');
      const box = $('resultButtons');
      box.innerHTML = '';
      buttons.filter(Boolean).forEach(b => {
        const el = document.createElement('button');
        el.className = 'btn ' + b.cls;
        el.innerHTML = b.raw ? b.html : wrapText(b.html);
        el.setAttribute('aria-label', el.textContent.trim());
        el.onclick = b.fn;
        box.appendChild(el);
      });
      $('result').classList.remove('hidden');
    },

    revive() {
      const s = this.session;
      if (s.reviveUsed) return;
      Ads.rewarded(() => {
        s.reviveUsed = true;
        $('result').classList.add('hidden');
        this.game.revive();
        this.applySys();
      });
    },

    doubleCoins() {
      const s = this.session;
      if (s.x2Used) return;
      const extra = this.coinsThisRun();
      const btnEl = [...document.querySelectorAll('#resultButtons .btn')].find(b => b.classList.contains('reward-action'));
      const from = btnEl ? btnEl.getBoundingClientRect() : null;
      Ads.rewarded(() => {
        s.x2Used = true;
        if (extra > 0) this.giveCoins(extra, from);
        this.showWin();
      });
    },

    /** Парящий кружок со случайным скином справа от окна победы: за рекламу скин даётся временно, до первого проигрыша. */
    showSkinGift(hasNext) {
      const el = $('skinGift');
      if (!hasNext || !Platform.adsEnabled) return;
      if (!this.giftSkin) {
        const all = GAME_DATA.skins.filter(k => k.id !== Save.skin);
        const fresh = all.filter(k => !Save.isOwned(k.id));
        const pool = fresh.length ? fresh : all;
        this.giftSkin = pool[Math.floor(Math.random() * pool.length)].id;
      }
      const active = !!this.trialSkin;
      const id = active ? this.trialSkin : this.giftSkin;
      el.classList.toggle('active', active);
      $('giftText').textContent = t('giftSkin');
      // рисуем летящего кота выбранного скина и вписываем его в кружок по границам рисунка
      if (this._giftId !== id) {
        this._giftId = id;
        const off = document.createElement('canvas'); off.width = off.height = 440;
        makeCatPreview(off, () => id, false)(0);
        const od = off.getContext('2d').getImageData(0, 0, 440, 440).data;
        let x0 = 440, y0 = 440, x1 = 0, y1 = 0;
        for (let y = 0; y < 440; y++) for (let x = 0; x < 440; x++) if (od[(y * 440 + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        const cv = $('giftCanvas'), c = cv.getContext('2d'), W = cv.width;
        c.clearRect(0, 0, W, W);
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1, k = W * 0.8 / Math.max(bw, bh);
        c.drawImage(off, x0, y0, bw, bh, (W - bw * k) / 2, (W - bh * k) / 2, bw * k, bh * k);
      }
      el.onclick = active ? null : () => Ads.rewarded(() => { this.trialSkin = this.giftSkin; this.showWin(); });
      el.classList.remove('hidden');
    },

    continueAfterWin(skipOffer) {
      this.saveProgress();
      if (!skipOffer && this.offerWorld(() => this.continueAfterWin(true))) return;   // хватает монет на новый мир — сначала предложить
      const s = this.session;
      if (!this.hasNext()) {
        if (this.allDone() && !Save.data.toonSeen) { Toon.play(() => this.goMenu(false)); return; }   // финал: мультфильм
        this.goMenu(true); return;
      }
      Ads.afterLevel(() => this.startLevel(s.ci, s.li + 1));
    },

    goMenu(withAd) {
      if (withAd) Ads.afterLevel(() => this.showMenu());
      else this.showMenu();
    },

    // --------------------------------------------------------- кадр UI --
    tick(time) {
      if (this.inGame) {
        const p = this.game.state === 'won' ? 100 : Math.ceil(this.game.progress * 100);
        if (this.game.endless) {
          const m = Math.max(0, Math.floor(this.game.pmX));
          if (m !== this._lastP) { this._lastP = m; $('hudProgressFill').style.width = p + '%'; $('hudProgressText').textContent = m + ' ' + t('meters'); }
        } else if (p !== this._lastP) { this._lastP = p; $('hudProgressFill').style.width = p + '%'; $('hudProgressText').textContent = p + '%'; }
      } else if (!$('menu').classList.contains('hidden')) {
        this.drawMenuBg(time);
        if (time - (this._dailyT || 0) > 0.5) { this._dailyT = time; this.updateDaily(); }
      }
    },

    /** Награда монетами с анимацией: монетки вылетают из кнопки и залетают в счётчик (без надписей). */
    giveCoins(amount, fromRect) {
      const before = this.coinShown != null ? this.coinShown : Save.coins;
      Save.addCoins(amount);
      this.coinShown = before;
      this.refreshCoins();
      const run = () => this.flyCoins(amount, fromRect);
      // если реклама ещё закрывается — ждём, чтобы игрок увидел анимацию
      const waitAd = () => (Platform.adOpen ? setTimeout(waitAd, 120) : setTimeout(run, 150));
      waitAd();
      setTimeout(() => { if (!this.inGame) this.offerWorld(); }, 1600);   // подарок в меню добил до цены нового мира
    },

    flyCoins(amount, fromRect) {
      const app = $('app');
      const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
      // цель — видимый счётчик монет: в открытом окне, иначе в меню, иначе в HUD
      const pills = [...document.querySelectorAll('.panel:not(.hidden) .coins-pill, #menu:not(.hidden) .coins-pill, #hud:not(.hidden) .coins-pill')].filter(vis);
      const target = pills[0];
      const finish = () => { this.coinShown = null; this.refreshCoins(); };
      if (!target) { finish(); return; }
      const tr = target.querySelector('img').getBoundingClientRect();
      const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
      const fr = fromRect || { left: innerWidth / 2 - 20, top: innerHeight / 2 - 20, width: 40, height: 40 };
      const fx = fr.left + fr.width / 2, fy = fr.top + fr.height / 2;

      const n = Math.min(12, Math.max(4, amount));
      const per = amount / n;
      let arrived = 0, shown = this.coinShown;
      for (let i = 0; i < n; i++) {
        const c = document.createElement('img');
        c.src = 'assets/art/obj/coin.webp'; c.className = 'fly-coin';
        app.appendChild(c);
        const ang = Math.random() * Math.PI * 2, rad = 40 + Math.random() * 50;
        const bx = fx + Math.cos(ang) * rad, by = fy + Math.sin(ang) * rad * 0.7;
        const delay = 60 + i * 55;
        const anim = c.animate([
          { transform: `translate(${fx}px, ${fy}px) translate(-50%, -50%) scale(.3)`, opacity: 0 },
          { transform: `translate(${bx}px, ${by}px) translate(-50%, -50%) scale(1.1)`, opacity: 1, offset: 0.35, easing: 'cubic-bezier(.3,0,.7,1)' },
          { transform: `translate(${(bx + tx) / 2}px, ${Math.min(by, ty) - 60}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.7 },
          { transform: `translate(${tx}px, ${ty}px) translate(-50%, -50%) scale(.55)`, opacity: 1 },
        ], { duration: 900, delay, easing: 'ease-in', fill: 'both' });
        anim.onfinish = () => {
          c.remove();
          arrived++;
          shown = arrived === n ? null : Math.round(this.coinShownBase + per * arrived);
          this.coinShown = shown;
          this.refreshCoins();
          Sound.play(Sound.buffers.coin_pop ? 'coin_pop' : 'coin', 0.5, 1 + Math.min(arrived, 10) * 0.07);   // «поп» с нарастающим тоном по мере прилёта монет
          target.classList.remove('pulse'); void target.offsetWidth; target.classList.add('pulse');
          if (arrived === n) finish();
        };
      }
      this.coinShownBase = this.coinShown;
    },

    /** Живой фон главного меню: локация Tank Stars с медленной прокруткой. */
    drawMenuBg(time) {
      const cv = $('menuBg');
      if (!this.menuLoc) { this.menuLoc = Locations.forCategory(0); this._mbT = time; }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const dt = Math.min(0.05, time - this._mbT); this._mbT = time;
      this.menuLoc.update(dt);
      const S = Math.min(h / 9.75, w / 16.8);
      const camX = time * 1.2;
      const view = [S, 0, 0, -S, w / 2 - camX * S, h / 2 + 0.875 * S];
      const ctx = cv.getContext('2d');
      this.menuLoc.drawBack(ctx, view, w, h, camX, { noSun: true });
      this.menuLoc.drawTerrain(ctx, view, w, h, camX);
      this.menuLoc.drawAmbient(ctx, w, h, S);
    },

    toast(msg) {
      const el = $('toast');
      el.textContent = msg;
      el.classList.remove('hidden');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => el.classList.add('hidden'), 1800);
    },
  };

  /** Текст кнопки — в span с обводкой, иконки — отдельно (как в Tank Stars). */
  /** Кнопка награды за рекламу: значок видео + название награды + подпись «Смотреть рекламу». */
  /** Звезда результата: пухлая золотая (или пустая сиреневая) со сливовой обводкой и бликом; delay — задержка появления, с (только на экране победы). */
  function starSvg(on, delay) {
    const pts = (cx, cy, R, r) => Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R;
      return (cx + Math.cos(a) * d).toFixed(1) + ',' + (cy + Math.sin(a) * d).toFixed(1);
    }).join(' ');
    return `<i class="${on ? 'on' : ''}"${delay ? ` style="animation-delay:${delay}s"` : ''}><svg viewBox="0 0 100 100" aria-hidden="true">` +
      `<polygon class="st-base" points="${pts(50, 55, 44, 22)}"/>` +
      `<polygon class="st-top" points="${pts(50, 50, 34, 17)}"/>` +
      `<ellipse class="st-hi" cx="38" cy="36" rx="7" ry="4.5" transform="rotate(-35 38 36)"/></svg></i>`;
  }
  function adBtn(label) {
    return `<img src="${AD}" alt="" aria-hidden="true"><span class="reward-copy"><span class="ts-text">${label}</span><span class="reward-caption ts-text">${t('watchAd')}</span></span>`;
  }

  function wrapText(html) {
    const m = html.match(/^(<img[^>]*>)?\s*(.*)$/s);
    return (m[1] || '') + `<span class="ts-text">${m[2]}</span>`;
  }

  function btn(html, cls) {
    const b = document.createElement('button');
    b.className = 'btn small ' + cls;
    b.innerHTML = wrapText(html);
    return b;
  }

  function skinName(skin) { return Art.skinName(skin.id); }

  window.UI = UI;
  window.Ads = Ads;
})();
