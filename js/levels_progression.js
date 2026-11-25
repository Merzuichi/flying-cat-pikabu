// Authored progression, applied after the generated layouts and before level assembly.
// Keep the level count/indexes unchanged so existing saves remain valid.
(function () {
  const rows = window.LEVELS_COMPACT;
  const level = p => ({b: [], s: [], m: [], c: [], f: [], p});
  const coins = (l, x, y, n = 3, step = 2) => {
    for (let i = 0; i < n; i++) l.c.push([x + i * step, y]);
  };
  const column = (l, x, ys) => ys.forEach(y => l.b.push([x, y]));
  const ledge = (l, x, n, y = -3) => {
    for (let i = 0; i < n; i++) l.b.push([x + i, y]);
    l.f.push(['ledge', x, x + n]);
    coins(l, x + 1, y + 1.5, Math.max(1, Math.floor(n / 2)));
  };
  const spikes = (l, x, n, ceiling = false) => {
    for (let i = 0; i < n; i++) l.s.push([x + i, ceiling ? 3.65 : -3, ceiling ? 1 : 0]);
    l.f.push([ceiling ? 'spike_ceil' : 'spike_floor', x, x + n]);
    coins(l, x, ceiling ? 1.5 : -0.6, n);
  };
  const gate = (l, x, center = 0, moving = false, phase = 0) => {
    // Shared phase keeps both halves together: 4-unit opening never closes.
    const bottom = [-3.5, -2.5].map(y => y + center);
    const top = [2.5, 3.5, 4.5, 5.5].map(y => y + center);
    if (moving) {
      l.m.push([x, -3 + center, 1, 2, 0.45, 5.5, phase]);
      l.m.push([x, 4 + center, 1, 4, 0.45, 5.5, phase]);
    } else column(l, x, bottom.concat(top));
    l.f.push([moving ? 'mover_gate' : 'gate', x, x + 1]);
    coins(l, x - 3, center, 3);
  };
  const mover = (l, x, y = -0.8, amp = 0.75, phase = 0) => {
    l.m.push([x, y, 2, 1, amp, 5.5, phase]);
    l.f.push(['mover', x - 0.5, x + 1.5]);
    coins(l, x - 2, y + amp + 1.8, 3);
  };
  const stairs = (l, x) => {
    ledge(l, x, 3); ledge(l, x + 5, 3, -2); ledge(l, x + 10, 3, -1);
    l.f.push(['stairs', x, x + 13]);
  };
  const ferry = (l, x) => {
    // Low platforms; a clear route remains above them at every phase.
    for (let i = 0; i < 3; i++) {
      l.m.push([x + i * 5, -2.4, 2, 1, 0.4, 5.5, i * 0.8]);
      coins(l, x + i * 5, 0.1, 2, 1.5);
    }
    l.f.push(['ferry', x - 0.5, x + 11.5]);
  };

  // Level 1 remains the tutorial slot. Level 2 is the first normal flight.
  let l = rows[0][1] = level(65);
  coins(l, 8, 1, 4); ledge(l, 22, 4); coins(l, 34, 0.7, 4);
  ledge(l, 47, 4); coins(l, 55, 1, 3);
  l = rows[0][2] = level(79);
  coins(l, 8, 0.5, 4); spikes(l, 24, 3); ledge(l, 43, 4); spikes(l, 62, 4);
  l = rows[0][3] = level(91);
  coins(l, 9, 0.3, 4); spikes(l, 25, 3); spikes(l, 49, 3, true); spikes(l, 73, 4);
  l = rows[0][4] = level(102);
  ledge(l, 18, 4); stairs(l, 38); stairs(l, 68); gate(l, 92, 0.5);
  l = rows[0][5] = level(108);
  coins(l, 9, 1, 4); mover(l, 29, -1, 0.6); mover(l, 61, -0.8, 0.75, 1);
  ledge(l, 82, 3); gate(l, 98, 0.5);
  l = rows[0][6] = level(117);
  spikes(l, 22, 3); mover(l, 48, -1, 0.7); spikes(l, 72, 4, true); gate(l, 106, -0.5);
  l = rows[0][7] = level(123);
  gate(l, 24, -0.5); gate(l, 53, 0.5); spikes(l, 79, 3); gate(l, 112, 0);
  l = rows[0][8] = level(132);
  gate(l, 25); gate(l, 58, 0, true, 0.5); spikes(l, 84, 3);
  gate(l, 121, 0, true, 1);
  l = rows[0][9] = level(143);
  gate(l, 24, 0, true, 1); ferry(l, 51); spikes(l, 87, 4, true);
  gate(l, 112); gate(l, 132, 0.5);

  // Varied final approaches in the remaining 65 levels. Extend the route instead
  // of overlaying hazards on existing sections or putting obstacles behind the portal.
  rows.forEach((row, ci) => row.forEach((l, li) => {
    if (!l || (ci === 0 && li < 10)) return;
    const old = l.p, variant = (ci + li) % 4;
    l.p = +(old + 34).toFixed(3);
    if (variant === 0) { gate(l, old + 10, -0.5); gate(l, old + 24, 0.5); }
    if (variant === 1) { mover(l, old + 10, -1, 0.8, li); gate(l, old + 24, 0, true, ci); }
    if (variant === 2) { ferry(l, old + 9); gate(l, old + 25, 0.5); }
    if (variant === 3) { spikes(l, old + 8, 3, true); gate(l, old + 24, -0.5, true, li); }
    coins(l, l.p - 6, 1.07, 2);
  }));
})();
