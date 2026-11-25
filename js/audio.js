// Звук на WebAudio. Глушится во время рекламы и когда вкладка скрыта.
(function () {
  // версия сборки из адреса скрипта (?v=...): звуки и музыка не берутся из старого кеша браузера после обновления игры
  const V = (() => { const s = [...document.scripts].find(x => /js\/audio\.js\?v=/.test(x.src)); return s ? s.src.split('?v=')[1] : ''; })();
  const vurl = u => (V ? u + (u.includes('?') ? '&' : '?') + 'v=' + V : u);
  const A = {
    ctx: null, master: null, buffers: {}, loops: {},
    muted: false,      // пауза (реклама / вкладка)
    unlocked: false,

    async init(sounds) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.setVolume(Save.volume);
      const unlock = () => {
        if (['suspended', 'interrupted'].includes(this.ctx.state) && !this.muted) this.ctx.resume().catch(() => {});
        this.unlocked = true;
      };
      ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'].forEach(ev => window.addEventListener(ev, unlock, { passive: true }));
      await Promise.all(Object.entries(sounds).map(async ([k, url]) => {
        try {
          const buf = await (await fetch(vurl(url))).arrayBuffer();
          this.buffers[k] = await new Promise((res, rej) => this.ctx.decodeAudioData(buf, res, rej));
        } catch (e) { console.warn('sound', k, e); }
      }));
      this.Music.refresh();   // музыка могла быть запрошена до загрузки звуков
    },

    get enabled() { return Save.sounds; },

    /** Общая громкость 0..1. Квадратичная шкала: на малых значениях ползунок точнее. */
    setVolume(v) {
      if (!this.master) return;
      if (this.muted) return;   // на паузе громкость вернётся при снятии паузы (setMuted)
      this.master.gain.value = Math.max(0, Math.min(1, v)) ** 2;
    },

    /** dur — обрезать звук до dur секунд с плавным затуханием (например, короткая «грустная» версия джингла). */
    play(name, volume = 1, rate = 1, dur = 0) {
      if (!this.ctx || !this.enabled || this.muted) return;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      const b = this.buffers[name];
      if (!b) return;
      const src = this.ctx.createBufferSource();
      src.buffer = b; src.playbackRate.value = rate;
      const g = this.ctx.createGain(); g.gain.value = volume;
      src.connect(g).connect(this.master);
      src.start();
      if (dur > 0) {
        const t = this.ctx.currentTime;
        g.gain.setValueAtTime(volume, t + Math.max(0, dur - 0.35)); g.gain.linearRampToValueAtTime(0, t + dur);
        src.stop(t + dur + 0.02);
      }
    },

    /** Зацикленный звук (бег по земле). */
    loop(name, on, volume = 1, rate = 1) {
      if (!this.ctx) return;
      const cur = this.loops[name];
      if (on && this.enabled && !this.muted) {
        if (cur) return;
        const b = this.buffers[name];
        if (!b) return;
        const src = this.ctx.createBufferSource();
        src.buffer = b; src.loop = true; src.playbackRate.value = rate;
        const g = this.ctx.createGain(); g.gain.value = volume;
        src.connect(g).connect(this.master);
        src._g = g;
        src.start();
        this.loops[name] = src;
      } else if (cur) {
        delete this.loops[name];
        if (cur._g) {   // плавно затихает, а не обрывается
          const t = this.ctx.currentTime; cur._g.gain.cancelScheduledValues(t); cur._g.gain.setValueAtTime(cur._g.gain.value, t); cur._g.gain.linearRampToValueAtTime(0, t + 0.15);
          setTimeout(() => { try { cur.stop(); } catch (e) { /* уже остановлен */ } }, 180);
        } else { try { cur.stop(); } catch (e) { /* уже остановлен */ } }
      }
    },

    // UI sounds are pre-recorded compressed assets, never procedural tones.
    ui(type) {
      if (!this.ctx || !this.enabled || this.muted) return;
      this.play('ui_' + type, type === 'click' ? 0.9 : 0.8);
    },

    stopAll() { Object.keys(this.loops).forEach(k => this.loop(k, false)); },

    /** Пауза (реклама, свёрнутая вкладка): звук плавно затихает за 0.2 с и только потом контекст замораживается; обратно — плавно нарастает. */
    setMuted(m) {
      this.muted = m;
      if (!this.ctx) return;
      const g = this.master.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      if (m) {
        g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.2);
        setTimeout(() => { if (this.muted) { this.stopAll(); this.ctx.suspend(); } }, 230);
      } else {
        const v = Math.max(0, Math.min(1, Save.volume)) ** 2;
        if (this.unlocked) this.ctx.resume();
        g.setValueAtTime(0, t); g.linearRampToValueAtTime(v, t + 0.25);
      }
    },
  };
  /** Фоновая музыка: трек меню и треки локаций. Список файлов — GAME_DATA.music (art.js).
   *  Для локации без трека музыки нет (тишина), меню-трек на уровни не заходит.
   *  Общая громкость и переключатель звука действуют и на музыку. */
  const BASE = 0.2;   // музыка заметно тише эффектов
  const Music = {
    bufs: {}, loading: {}, want: null, cur: null,
    load(name) {
      const url = (window.GAME_DATA.music || {})[name];
      if (!url || !A.ctx) return Promise.resolve(null);
      if (!this.loading[name]) {
        this.loading[name] = fetch(vurl(url)).then(r => r.arrayBuffer()).then(b => new Promise((res, rej) => A.ctx.decodeAudioData(b, res, rej)))
          .then(buf => (this.bufs[name] = buf)).catch(e => { console.warn('music', name, e); return null; });
      }
      return this.loading[name];
    },
    /** Включить музыку для контекста: 'menu' или имя локации. */
    play(name) {
      const tracks = window.GAME_DATA.music || {};
      this.want = name != null && tracks[name] ? name : null;   // нет трека (или null) — тишина
      this.refresh();
    },
    async refresh() {
      const name = this.want;
      if (!A.ctx || !Save.sounds || !Save.music || !name) { this.fadeOut(); return; }
      if (this.cur && this.cur.name === name) return;
      const buf = await this.load(name);
      if (!buf || this.want !== name || !Save.sounds || !Save.music) return;
      if (this.cur && this.cur.name === name) return;
      this.fadeOut();
      this.start(name, buf);
    },
    /** Бесшовный повтор: трек не обрывается и не замолкает. Хвост тишины/затухания в конце файла обрезается,
     *  а следующий круг запускается заранее и плавно перекрывается с концом предыдущего. */
    start(name, buf) {
      const ctx = A.ctx;
      let end = buf.length;
      const data = [];
      for (let c = 0; c < buf.numberOfChannels; c++) data.push(buf.getChannelData(c));
      for (; end > buf.sampleRate; end--) { if (data.some(d => Math.abs(d[end - 1]) > 0.02)) break; }
      const eff = Math.max(2, end / buf.sampleRate);
      const XF = Math.min(2.5, eff * 0.12);
      const cur = this.cur = { name, list: [], nextAt: 0, timer: 0 };
      const spawn = (when, fade) => {
        const src = ctx.createBufferSource(); src.buffer = buf;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(BASE, when + fade);
        g.gain.setValueAtTime(BASE, when + eff - XF); g.gain.linearRampToValueAtTime(0, when + eff);
        src.connect(g).connect(A.master); src.start(when); src.stop(when + eff + 0.1);
        cur.list.push({ src, g });
        cur.nextAt = when + eff - XF;
        src.onended = () => { cur.list = cur.list.filter(x => x.src !== src); };
      };
      spawn(ctx.currentTime, 1.2);
      // время контекста замирает на паузе рекламы/вкладки, поэтому следим за ним, а не за часами
      cur.timer = setInterval(() => { if (this.cur === cur && ctx.currentTime >= cur.nextAt - 0.5) spawn(cur.nextAt, XF); }, 200);
    },
    fadeOut() {
      const c = this.cur; if (!c) return;
      this.cur = null;
      clearInterval(c.timer);
      const t = A.ctx.currentTime;
      c.list.forEach(({ src, g }) => {
        g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.8);
        setTimeout(() => { try { src.stop(); } catch (e) { /* уже остановлен */ } }, 900);
      });
    },
  };
  A.Music = Music;
  window.Sound = A;
})();
