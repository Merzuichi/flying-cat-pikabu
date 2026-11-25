// Пикабу Игры: официальный SDK (https://games.pikabu.ru/sdk/docs) — реклама, облачные сохранения, авторизация.
(function () {
  const SDK_URL = 'https://games.pikabu.ru/sdk/sdk.js';
  const SAVE_KEY = 'cat_save';
  const SDK_TIMEOUT = 12000, CHECK_TIMEOUT = 3000, READY_POLL = 30000;
  // Локально SDK не отвечает никогда, поэтому без ?sdk=1 его не ждём.
  const IS_DEV = location.protocol === 'file:' || /^(localhost|127\.\d+\.\d+\.\d+)$/.test(location.hostname);
  // Вне страницы Пикабу (окно не во фрейме) sdk.js бесконечно пересылает сообщения сам себе — не подключаем.
  const USE_SDK = IS_DEV ? /[?&]sdk=1\b/.test(location.search) : window.parent !== window;
  const log = (...args) => console.warn('[Pikabu]', ...args);
  const once = fn => { let called = false; return (...args) => { if (!called) { called = true; return fn && fn(...args); } }; };
  const timeout = (promise, ms, message) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer));
  });

  const P = {
    sdk: null, adOpen: false, playerId: null, rewardedReady: false, storageBlocked: false,
    pauseHandlers: [], resumeHandlers: [], adsHandlers: [], conflictHandlers: [],
    get isDev() { return IS_DEV; },
    // Рекламные кнопки показываем, только пока rewarded действительно доступна.
    get adsEnabled() { return !!this.sdk && this.rewardedReady; },
    // Требование площадки: по умолчанию русский; другой язык игрок выбирает в настройках.
    get lang() { return 'ru'; },
    // Без SDK прогресс пишется в отдельный ключ, чтобы не подменить облачный при следующем запуске.
    get storageKey() { return 'flying_cat_pkb_v1_' + (this.playerId || 'local'); },

    init() { return this._initPromise || (this._initPromise = this._init()); },
    async _init() {
      if (!USE_SDK) { log('Локальный запуск без SDK: реклама отключена, сохранения локальные.'); return; }
      try {
        const sdk = await timeout(this._connect(), SDK_TIMEOUT, 'SDK не ответил');
        this.sdk = sdk;
        this.playerId = sdk.player.id;
        sdk.on('storageSaveError', reason => this._storageError(reason));
        sdk.on('userAuthorized', () => this._authorized());
        await this.refreshAds();
        setInterval(() => { if (!document.hidden) this.refreshAds(); }, READY_POLL);
      } catch (error) {
        // Блокировщик, сеть или запуск вне площадки: игра остаётся играбельной.
        log('SDK недоступен, игра запущена без рекламы и облака.', error);
      }
    },
    async _connect() {
      if (!window.PkbSDK) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = SDK_URL; script.async = true;
          script.onload = resolve; script.onerror = () => reject(new Error('sdk.js не загрузился'));
          document.head.appendChild(script);
        });
      }
      return window.PkbSDK.init();
    },

    /** Игра готова к взаимодействию (один раз за запуск). */
    loadingReady() {
      if (this._loaded) return;
      this._loaded = true;
      if (!this.sdk) return;
      try { this.sdk.gameStarted(); } catch (error) { log(error); }
      // До gameStarted() rewarded недоступна, и готовность приходит не сразу — не ждём общего опроса.
      for (const delay of [0, 500, 1500, 4000, 9000]) setTimeout(() => this.refreshAds(), delay);
    },
    onPause(fn) { this.pauseHandlers.push(fn); },
    onResume(fn) { this.resumeHandlers.push(fn); },
    onAdsChange(fn) { this.adsHandlers.push(fn); },
    onConflict(fn) { this.conflictHandlers.push(fn); if (this.storageBlocked) fn(); },

    // ------------------------------------------------------------ реклама --
    async _canShow(type) {
      try {
        const ad = this.sdk && this.sdk.ads[type];
        return !!ad && ad.isSupported && (await timeout(ad.canShow(), CHECK_TIMEOUT, 'canShow: нет ответа')) === true;
      } catch (error) { log(type, error); return false; }
    },
    async refreshAds() {
      if (this.adOpen) return;
      const ready = await this._canShow('rewarded');
      if (this.adOpen || this.rewardedReady === ready) return;
      this.rewardedReady = ready;
      this.adsHandlers.forEach(fn => fn(ready));
    },
    _adOpen() { this.adOpen = true; this.pauseHandlers.forEach(fn => fn('ad')); },
    _adClose() { if (!this.adOpen) return; this.adOpen = false; this.resumeHandlers.forEach(fn => fn('ad')); },
    /** Проверка canShow(), пауза, показ, снятие паузы. Возвращает результат SDK или null. */
    async _show(type) {
      if (!this.sdk || this.adOpen || this._checking) return null;
      this._checking = true;
      try { if (!(await this._canShow(type))) return null; } finally { this._checking = false; }
      this._adOpen();
      try {
        const result = await this.sdk.ads[type].show();
        if (!result || !result.rendered) log(type + ' не показана:', result && result.reason);
        return result || null;
      } catch (error) { log(type, error); return null; } finally { this._adClose(); }
    },
    /** Только мобильные, строго до gameStarted(); один запрос за запуск. */
    showPreloader() {
      if (!this._preloaderPromise) {
        this._preloaderPromise = this._loaded ? Promise.resolve(false)
          : this._show('preloader').then(result => !!(result && result.rendered));
      }
      return this._preloaderPromise;
    },
    async showInterstitial(callback) {
      const done = once(callback);
      const result = await this._show('fullscreen');
      done(!!(result && result.rendered));
    },
    async showRewarded(onReward, onDone) {
      const done = once(onDone);
      const result = await this._show('rewarded');
      // Награда только за досмотренную рекламу.
      const rewarded = !!(result && result.reward === true);
      try { if (rewarded && onReward) onReward(); } finally { done(rewarded); }
      this.refreshAds();
    },

    // --------------------------------------------------------- сохранения --
    /** cloud:false — SDK нет; cloud:true и save:null — новый игрок. */
    async loadData() {
      if (!this.sdk) return { cloud: false, save: null };
      const value = this.sdk.storage.get(SAVE_KEY);
      return { cloud: true, save: value && typeof value === 'object' && !Array.isArray(value) ? value : null };
    },
    /** Синхронная запись; SDK сам отправит изменения на сервер с небольшой задержкой. */
    saveData(data) {
      if (!this.sdk || this.storageBlocked) return;
      try { this.sdk.storage.set(SAVE_KEY, data); } catch (error) { log('Облако: запись не удалась', error); }
    },
    /** Явная отправка — только при уходе со страницы (лимит 100 запросов за 5 минут). */
    async flush() {
      if (!this.sdk || this.storageBlocked) return;
      try {
        const result = await this.sdk.storage.flush();
        if (result && !result.success) log('Облако: отправка не удалась', result.reason);
      } catch (error) { log(error); }
    },
    _storageError(reason) {
      log('Облако:', reason);
      if (reason === 'REVISION_CONFLICT') this._blockStorage();
    },
    /** До перезагрузки ничего не пишем: прогресс изменён в другой вкладке или на другом устройстве. */
    _blockStorage() {
      if (this.storageBlocked) return;
      this.storageBlocked = true;
      this.conflictHandlers.forEach(fn => fn());
    },
    /** Если вход сменил игрока, данные гостя нельзя записывать в его аккаунт. */
    _authorized() {
      if (this.sdk.player.id !== this.playerId) this._blockStorage();
    },
  };
  window.PlatformSDK = P;
  window.Platform = P;
})();
