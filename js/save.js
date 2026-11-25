// Сохранения: аналог PlayerPrefs из Unity (монеты, прогресс категорий, скины, настройки).
// Облако Пикабу Игр (sdk.storage, ключ cat_save) и локальный резерв отдельно для каждого игрока.
(function () {
  const localKey = () => Platform.storageKey;
  const DEFAULT = () => ({
    coins: 0,
    lastLevel: {},      // Category_{i}_LastLevel
    unlocked: { 0: true }, // Category_{i}_Unlocked
    skin: 'default',    // Skin_Selected
    owned: {},          // Skin_Owned_{id}
    adViews: {},        // Skin_AdViews_{id}
    sounds: true,       // Audio_SoundsEnabled
    volume: 1,          // общая громкость 0..1 (ползунок в настройках)
    lang: null,         // язык, выбранный игроком вручную (null — язык платформы)
    music: true,
    daily: 0,           // время (мс) последнего ежедневного подарка
    stars: {},          // 'ci-li' -> звёзды 1..3
    best: 0,            // рекорд бесконечного режима, м
    quest: null,        // задание дня
    toonSeen: false,    // мультфильм уже показан
    tutorialDone: false,
    tries: {},          // 'ci-li' -> [попыток, побед]: для настройки сложности
    t: 0,              // время последнего изменения (для слияния с облаком)
  });

  // Режим разработчика: бесконечные монеты. Только на localhost / в локальной сети / file://, на публичной площадке недоступен.
  // Включить: добавить к адресу ?dev=1 (запоминается), выключить: ?dev=0.
  const DEV = (() => {
    if (!window.Platform || !Platform.isDev) return false;
    try {
      const q = new URLSearchParams(location.search).get('dev');
      if (q === '1') localStorage.setItem('cat_pikabu_dev', '1');
      if (q === '0') localStorage.removeItem('cat_pikabu_dev');
      return localStorage.getItem('cat_pikabu_dev') === '1';
    } catch (e) { return false; }
  })();

  let data = DEFAULT();
  let loaded = false;
  const flush = () => { if (loaded) return Platform.flush(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);

  function readLocal() {
    try { const s = localStorage.getItem(localKey()); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function writeLocal() {
    if (Platform.storageBlocked) return;
    try { localStorage.setItem(localKey(), JSON.stringify(data)); } catch (e) { /* приватный режим */ }
  }

  const Save = {
    async load() {
      const local = readLocal();
      const result = await Platform.loadData();
      // Источник истины — облако; локальный резерв нужен, только если облака нет или оно пустое.
      const pick = (result && result.save) || local;
      data = Object.assign(DEFAULT(), pick || {});
      loaded = true;
      writeLocal();
      if (result && result.cloud && !result.save && local) Platform.saveData(data);
    },
    /** Конфликт версий: локальный резерв устарел, после перезагрузки берём облако. */
    dropLocal() { try { localStorage.removeItem(localKey()); } catch (e) { /* приватный режим */ } },
    commit() {
      data.t = Date.now();
      writeLocal();
      Platform.saveData(data);
      Save.onChange && Save.onChange();
    },
    get data() { return data; },
    resetProgress() {
      const settings = { lang: data.lang, sounds: data.sounds, music: data.music, volume: data.volume };
      data = Object.assign(DEFAULT(), settings);
      Save.commit();
    },

    // ---- монеты (CoinCounter) ----
    dev: DEV,
    get coins() { return DEV ? 999999 : data.coins; },
    addCoins(n) { if (!DEV) data.coins += n; Save.commit(); },
    spendCoins(n) { if (DEV) return true; if (data.coins < n) return false; data.coins -= n; Save.commit(); return true; },

    // ---- категории (LevelCategoryData) ----
    lastLevel(ci) { const v = data.lastLevel[ci]; return v === undefined ? -1 : v; },
    setLastLevel(ci, li) { data.lastLevel[ci] = li; Save.commit(); },
    isUnlocked(ci) { return DEV || (ci === 0 ? data.unlocked[0] !== false : !!data.unlocked[ci]); },
    setUnlocked(ci, v) { data.unlocked[ci] = !!v; Save.commit(); },

    // ---- скины (SkinManager) ----
    get skin() { return data.skin; },
    isOwned(id) { return DEV || !id || id === 'default' || !!data.owned[id]; },
    setOwned(id) { data.owned[id] = true; Save.commit(); },
    selectSkin(id) { if (Save.isOwned(id)) { data.skin = id; Save.commit(); } },
    adViews(id) { return data.adViews[id] || 0; },
    addAdView(id) { data.adViews[id] = (data.adViews[id] || 0) + 1; Save.commit(); },

    // ---- громкость и язык ----
    get volume() { return typeof data.volume === 'number' ? data.volume : 1; },
    set volume(v) { data.volume = Math.max(0, Math.min(1, +v || 0)); Save.commit(); },
    get lang() { return data.lang; },
    set lang(v) { data.lang = v; Save.commit(); },

    // ---- звёзды, рекорд, задание дня ----
    stars(ci, li) { return (data.stars && data.stars[ci + '-' + li]) || 0; },
    setStars(ci, li, n) { data.stars = data.stars || {}; if (n > Save.stars(ci, li)) { data.stars[ci + '-' + li] = n; Save.commit(); } },
    starsTotal(ci, n) { let t = 0; for (let i = 0; i < n; i++) t += Save.stars(ci, i); return t; },
    get best() { return data.best || 0; },
    set best(v) { data.best = Math.max(data.best || 0, Math.floor(v)); Save.commit(); },
    get quest() { return data.quest; },
    set quest(q) { data.quest = q; Save.commit(); },

    // ---- статистика попыток (панель разработчика) ----
    noteTry(ci, li, won) {
      data.tries = data.tries || {};
      const k = ci + '-' + li, v = data.tries[k] || [0, 0];
      v[0]++; if (won) v[1]++;
      data.tries[k] = v; Save.commit();
    },
    /** По категориям: среднее число попыток на пройденный уровень (по всем попыткам этого уровня). */
    triesReport() {
      const out = [];
      for (let ci = 0; ci < 5; ci++) {
        let a = 0, w = 0;
        for (let li = 0; li < 15; li++) { const v = (data.tries || {})[ci + '-' + li]; if (v && v[1]) { a += v[0]; w++; } }
        out.push({ ci, levels: w, avg: w ? +(a / w).toFixed(2) : null });
      }
      return out;
    },

    // ---- ежедневный подарок ----
    DAILY_MS: 4 * 3600 * 1000,   // пауза между подарками
    dailyLeft() { return Math.max(0, (data.daily || 0) + Save.DAILY_MS - Date.now()); },
    claimDaily() { data.daily = Date.now(); Save.commit(); },

    // ---- звук (AudioSettings) ----
    get music() { return data.music !== false; },
    set music(v) { data.music = !!v; Save.commit(); },
    get sounds() { return data.sounds; },
    set sounds(v) { data.sounds = !!v; Save.commit(); },
  };

  window.Save = Save;
})();
