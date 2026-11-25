// Сборка уровней из компактного формата (js/levels.js) в объекты игры.
// Шаблоны блока, монеты и портала берутся из уровня 1 (экспорт из Unity), так что размеры и коллайдеры
// совпадают с прототипом. Новые типы: шипы (kind: 'spike') и движущиеся блоки (motion).
(function () {
  const rows = window.LEVELS_COMPACT;
  if (!rows) return;
  const base = GAME_DATA.categories[0].levels[0];
  const tBlock = base.obstacles.find(o => o.sprite === 'Cub_Green_B'), tCoin = base.coins[0], tPortal = base.portal;
  const PORTAL_Y = 1.07;
  const clone = o => JSON.parse(JSON.stringify(o));
  const box = (x, y, h) => [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]];

  // контур шипов в клетке 1×1 (u — слева направо, v — от основания к остриям), с запасом в пользу игрока
  const SPIKE_SHAPE = [[0.04, 0], [0.17, 0.36], [0.3, 0.1], [0.5, 0.45], [0.7, 0.1], [0.83, 0.36], [0.96, 0]];

  function block([x, y], motion) {
    const o = clone(tBlock); o.x = x; o.y = y; o.children = [];
    o.cols = [{ kind: 'poly', trigger: false, pts: box(x, y, 0.5) }];
    if (motion) o.motion = motion;
    return o;
  }
  function spike([x, y, hang]) {
    const pts = SPIKE_SHAPE.map(([u, v]) => [x - 0.5 + u, hang ? y + 0.5 - v : y - 0.5 + v]);
    return { name: 'Spike', kind: 'spike', hang: !!hang, x, y, rot: 0, sx: 1, sy: 1, children: [],
      cols: [{ kind: 'poly', trigger: false, pts }] };
  }
  function movers([x, y, w, h, amp, period, phase]) {
    const motion = { amp, period, phase };
    const out = [];
    for (let i = 0; i < w; i++)
      for (let k = 0; k < h; k++)
        out.push(block([x - (w - 1) / 2 + i, y - (h - 1) / 2 + k], motion));
    return out;
  }
  function coin([x, y]) {
    const c = clone(tCoin); c.x = x; c.y = y;
    c.cols = c.cols.map(col => col.kind === 'circle' ? Object.assign(col, { c: [x, y] }) : Object.assign(col, { pts: box(x, y, 0.3) }));
    c.children.forEach(ch => { ch.x = x; ch.y = y; });
    return c;
  }
  function portal(x) {
    const p = clone(tPortal), dx = x - p.x, dy = PORTAL_Y - p.y;
    p.x = x; p.y = PORTAL_Y;
    p.cols.forEach(col => { col.pts = col.pts.map(([a, b]) => [a + dx, b + dy]); });
    return p;
  }

  /**
   * Обрезка уровня за порталом: всё, что дальше портала, убирается (кота в портал засасывает всегда).
   */
  const WALL_GAP = 2.3;   // сколько уровня оставляем за порталом
  function closeAfterPortal(level) {
    const wallX = level.portal.x + WALL_GAP;
    const keep = o => o.x <= wallX + 0.5;
    level.obstacles = level.obstacles.filter(keep);
    level.coins = level.coins.filter(keep);
    level.obstacles.sort((a, b) => a.x - b.x);
    level.wallX = null;                        // стены нет: портал засасывает кота, даже если он пролетел мимо
    return level;
  }

  function buildLevel(lv) {
    const obstacles = lv.b.map(b => block(b)).concat((lv.s || []).map(spike), ...(lv.m || []).map(movers));
    obstacles.sort((a, b) => a.x - b.x);
    return closeAfterPortal({ obstacles, coins: lv.c.map(coin), portal: portal(lv.p), deco: [] });
  }
  // бесконечный режим: дорога собирается при первом запуске (тысячи блоков, на загрузку игры не влияет)
  window.buildEndlessLevel = () => (window.ENDLESS_COMPACT ? buildLevel(window.ENDLESS_COMPACT) : null);
  // Safe first flight: learn vertical control before encountering lethal obstacles.
  window.buildTutorialLevel = () => buildLevel({ b: [], p: 1000000, c: [] });
  window.buildTutorialCoins = (x, y) => Array.from({length: 5}, (_, i) => coin([x + 7 + i * 4, y]));
  window.buildTutorialPortal = x => portal(x);

  rows.forEach((row, ci) => {
    const cat = GAME_DATA.categories[ci];
    if (!cat) return;
    const unity = cat.levels;
    cat.levels = row.map((lv, li) => {
      if (!lv) return unity[li] || base;
      return buildLevel(lv);
    });
    // оригинальный уровень 1 из Unity: стена добавляется на месте (объект общий, второй раз не трогаем)
    cat.levels.forEach(l => { if (l && l.portal && l.wallX === undefined) closeAfterPortal(l); });
    cat.levelCount = cat.levels.length;
  });
})();
