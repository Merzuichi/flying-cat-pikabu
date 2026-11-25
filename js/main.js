// Точка входа: SDK → язык → сохранения → ассеты → игра.
(async function () {
  // запрет контекстного меню, выделения и жестов браузера
  ['contextmenu', 'selectstart', 'dragstart', 'gesturestart'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
  // прокрутку разрешаем только внутри списков (уровни, магазин)
  document.addEventListener('touchmove', e => { if (!e.target.closest('.category-list, .skin-list')) e.preventDefault(); }, { passive: false });
  document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

  const loadingText = document.getElementById('loadingText');

  await Platform.init();
  await Save.load();
  // Ручной выбор игрока имеет приоритет; по умолчанию русский (требование площадки).
  I18N.setLang(Save.lang || Platform.lang);
  Orientation.refresh();

  // Реклама загрузки идёт параллельно с ассетами и не задерживает старт, если недоступна.
  const preloader = Platform.showPreloader();
  const images = {};
  // спрайты Unity (уже подменённые новой графикой в art.js), кроме вариантов скинов
  for (const [key, s] of Object.entries(GAME_DATA.sprites)) if (!s.skip && !key.includes('@')) images[key] = s.file;
  Object.assign(images, Art.skinImages(Save.skin)); // выбранный скин нужен сразу (герой меню)
  // при запуске грузим только первую локацию, остальные — в фоне после старта
  Object.assign(images, Locations.allImages(['forest']));
  await Promise.all([
    Engine.Assets.load(images, p => { loadingText.textContent = Math.round(p * 100) + '%'; }),
    document.fonts && document.fonts.load('900 20px TS').catch(() => {}),
  ]);

  if (Save.dev) Dev.init();
  Sound.init(GAME_DATA.sounds); // звуки догружаются в фоне, не задерживая старт
  const game = new Game(document.getElementById('game'));
  UI.init(game);

  // Экран загрузки остаётся, пока реклама не закрыта.
  await preloader;
  document.getElementById('loading').classList.add('hidden');
  Platform.loadingReady();
  // предзагрузка картинок экранов результата, чтобы они не «моргали» при первом показе
  ['plate_win', 'plate_lose', 'icon_ad', 'icon_close', 'icon_lock', 'card', 'card_sel', 'rays', 'panel_bg'].forEach(n => { new Image().src = Art.ui(n); });
  // остальные локации и скины — в фоне
  const rest = Locations.allImages(Object.keys(Locations.LOCS).filter(n => n !== 'forest'), false);
  Object.keys(Art.SKIN_DIR).forEach(id => Object.assign(rest, Art.skinImages(id)));
  Object.keys(rest).forEach(k => { if (Engine.Assets.images[k]) delete rest[k]; });
  Engine.Assets.load(rest);

  let last = performance.now();
  function frame(now) {
    const dt = (now - last) / 1000;
    last = now;
    if (UI.inGame) {
      game.update(dt * Tutorial.timeScale);
      game.render();
      Tutorial.update(dt);
    }
    UI.tick(now / 1000);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})().catch(error => {
  console.error('Game startup failed', error);
  const label = document.getElementById('loadingText');
  if (label) label.textContent = error.message || 'Не удалось запустить игру. Откройте её заново.';
});
