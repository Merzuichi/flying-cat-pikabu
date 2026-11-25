// Меню разработчика (только при ?dev=1 на localhost / в локальной сети): быстрый выбор уровня и скина.
(function () {
  window.Dev = {
    init() {
      const css = document.createElement('style');
      css.textContent = `
        #devBtn{position:fixed;left:6px;bottom:4px;z-index:99;font:700 12px sans-serif;color:#fff;background:rgba(200,40,80,.9);padding:4px 10px;border-radius:10px;border:0;cursor:pointer}
        #devPanel{position:fixed;left:6px;bottom:34px;z-index:99;width:min(330px,calc(100vw - 12px));max-height:70vh;overflow:auto;background:rgba(30,20,40,.95);color:#fff;font:12px sans-serif;padding:8px;border-radius:12px;display:none}
        #devPanel h4{margin:6px 0 4px;font-size:12px;color:#ffd}
        #devPanel .row{display:flex;flex-wrap:wrap;gap:4px}
        #devPanel button{font:700 12px sans-serif;border:0;border-radius:7px;padding:5px 8px;background:#6a5acd;color:#fff;cursor:pointer;min-width:30px}
        #devPanel button.on{background:#f4a300;color:#222}
        #devPanel button.cat{background:#3b7f6b}
        #devPanel button.danger{background:#c0392b}`;
      document.head.appendChild(css);
      const btn = document.createElement('button');
      btn.id = 'devBtn'; btn.textContent = 'DEV ∞ монет';
      const panel = document.createElement('div');
      panel.id = 'devPanel';
      document.getElementById('app').append(btn, panel);
      btn.onclick = () => { panel.style.display = panel.style.display === 'block' ? 'none' : 'block'; this.build(panel); };
    },
    build(panel) {
      const cats = GAME_DATA.categories;
      const ci = this.ci == null ? 0 : this.ci;
      const cur = UI.session || {};
      let h = '<h4>Категория</h4><div class="row">' + cats.map((c, i) => `<button class="cat ${i === ci ? 'on' : ''}" data-c="${i}">${c.name}</button>`).join('') + '</div>';
      h += '<h4>Уровень (' + cats[ci].name + ')</h4><div class="row">' + cats[ci].levels.map((_, i) => `<button class="${UI.inGame && cur.ci === ci && cur.li === i ? 'on' : ''}" data-l="${i}">${i + 1}</button>`).join('') + '</div>';
      h += '<h4>Скин</h4><div class="row">' + Object.keys(Art.SKIN_DIR).map(id => `<button class="${Save.skin === id ? 'on' : ''}" data-s="${id}">${Art.skinName(id)}</button>`).join('') + '</div>';
      h += '<h4>Прочее</h4><div class="row"><button data-a="menu">В меню</button><button data-a="endless">∞ Бесконечный</button><button data-a="toon">Мультфильм</button><button data-a="tries">Попытки</button><button data-a="unlock">Открыть все категории</button><button data-a="reset" class="danger">Сбросить прогресс</button></div>';
      panel.innerHTML = h;
      panel.onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.c != null) { this.ci = +b.dataset.c; this.build(panel); }
        else if (b.dataset.l != null) { Save.setUnlocked(ci, true); UI.startLevel(ci, +b.dataset.l); panel.style.display = 'none'; }
        else if (b.dataset.s) { Save.data.skin = b.dataset.s; Save.data.owned[b.dataset.s] = true; Save.commit(); UI.game.applySkin(); this.build(panel); if (UI.refreshShop) UI.refreshShop(); }
        else if (b.dataset.a === 'endless') { UI.startLevel('endless', 0); panel.style.display = 'none'; }
        else if (b.dataset.a === 'menu') { UI.showMenu(); panel.style.display = 'none'; }
        else if (b.dataset.a === 'reset') {
          if (!b.classList.contains('armed')) {   // подтверждение на самой кнопке: системный confirm() в некоторых окнах не показывается
            b.classList.add('armed'); b.textContent = 'Точно сбросить? Нажми ещё раз';
            setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Сбросить прогресс'; }, 3500);
            return;
          }
          Save.resetProgress();
          location.reload();
          panel.style.display = 'none';
        }
        else if (b.dataset.a === 'toon') { panel.style.display = 'none'; UI.closePanels(); Toon.play(() => Sound.Music.play('menu')); }
        else if (b.dataset.a === 'tries') {
          const r = Save.triesReport().map(x => `${cats[x.ci].name}: ${x.avg == null ? '—' : x.avg + ' поп./ур. (' + x.levels + ' ур.)'}`).join(' | ');
          let pre = panel.querySelector('pre'); if (!pre) { pre = document.createElement('pre'); pre.style.cssText = 'font:11px monospace;margin:6px 0 0;white-space:pre-wrap'; panel.appendChild(pre); }
          pre.textContent = r;
        }
        else if (b.dataset.a === 'unlock') { cats.forEach((_, i) => Save.setUnlocked(i, true)); this.build(panel); }
      };
    },
  };
})();
