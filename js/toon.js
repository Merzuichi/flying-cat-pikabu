// Мультфильм в конце игры: 10 комиксных кадров с медленным наездом камеры, титры, музыка меню.
// Показывается один раз после прохождения всех уровней; потом доступен из панели уровней (и из панели разработчика).
(function () {
  const N = 10, SLIDE = 9000;
  const CAP = {
    ru: ['Мурзик мечтал долететь до звёзд.',
      'Однажды на чердаке он нашёл крылья — и взлетел!',
      'В Египте кот-фараон подарил ему первый кристалл.',
      'В Китае дракон из фонариков научил не бояться ветра. И дал второй кристалл.',
      'В Арктике пингвины согрели его чаем. Третий кристалл — у Мурзика!',
      'На Марсе три кристалла оживили старую ракету.',
      'Три, два, один — полетели!',
      'Мурзик долетел до звёзд и увидел весь мир.',
      'А дома друзья слушали его историю до самого утра.',
      'Новый кристалл ждёт новых приключений. Конец? Нет — только начало!'],
    en: ['Murzik dreamed of flying to the stars.',
      'One day in the attic he found wings, and took off!',
      'In Egypt, a pharaoh cat gave him the first crystal.',
      'In China, a lantern dragon taught him not to fear the wind, and gave him the second crystal.',
      "In the Arctic, penguins warmed him with tea. The third crystal is Murzik's!",
      'On Mars, three crystals brought an old rocket back to life.',
      'Three, two, one, blast off!',
      'Murzik reached the stars and saw the whole world.',
      'Back home, his friends listened to his story until morning.',
      'A new crystal awaits new adventures. The end? No, just the beginning!'],
  };
  const RU_LIKE = ['ru', 'uk', 'be', 'kk', 'uz', 'hy', 'az', 'ka', 'tg'];
  const caps = () => (RU_LIKE.includes(I18N.lang) ? CAP.ru : CAP.en);

  const Toon = {
    playing: false,
    /** Запустить мультфильм; done вызывается по окончании или пропуске. */
    play(done) {
      if (this.playing) return;
      this.playing = true;
      const root = document.createElement('div');
      root.id = 'toon';
      root.innerHTML = '<div class="toon-stage"></div><div class="toon-cap"><span class="ts-text"></span></div>' +
        '<button class="toon-skip" aria-label="skip"><span class="lbl"></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5v13l8-6.5zM12 5.5v13l8-6.5z"/></svg></button><div class="toon-dots"></div>';
      document.body.appendChild(root);
      const stage = root.querySelector('.toon-stage'), cap = root.querySelector('.toon-cap'), capText = cap.firstChild;
      const dots = root.querySelector('.toon-dots');
      dots.innerHTML = '<i></i>'.repeat(N);
      const texts = caps();
      root.querySelector('.toon-skip .lbl').textContent = texts === CAP.ru ? 'Пропустить' : 'Skip';
      const src = i => `assets/cartoon/s${String(i + 1).padStart(2, '0')}.webp`;
      for (let i = 1; i < N; i++) { const im = new Image(); im.src = src(i); }   // подгрузка заранее
      Sound.Music.play('menu');

      let idx = -1, timer = 0, ended = false;
      const show = i => {
        if (i >= N) { finish(); return; }
        idx = i;
        const sl = document.createElement('div');
        sl.className = 'toon-slide k' + (i % 4);
        sl.innerHTML = `<img class="bg" src="${src(i)}" alt=""><img class="fg" src="${src(i)}" alt="">`;
        stage.appendChild(sl);
        requestAnimationFrame(() => requestAnimationFrame(() => sl.classList.add('on')));
        const all = stage.querySelectorAll('.toon-slide');
        if (all.length > 1) { const prev = all[all.length - 2]; prev.classList.remove('on'); setTimeout(() => prev.remove(), 1400); }
        cap.classList.remove('on');
        setTimeout(() => { capText.textContent = texts[i]; cap.classList.add('on'); }, 500);
        [...dots.children].forEach((d, k) => { d.className = k < i ? 'done' : k === i ? 'cur' : ''; });
        clearTimeout(timer);
        timer = setTimeout(() => show(i + 1), SLIDE);
      };
      const finish = () => {
        if (ended) return; ended = true;
        clearTimeout(timer);
        Save.data.toonSeen = true; Save.commit();
        root.classList.remove('on');
        setTimeout(() => { root.remove(); this.playing = false; if (done) done(); }, 600);
      };
      root.querySelector('.toon-skip').onclick = e => { e.stopPropagation(); finish(); };
      root.onclick = () => { if (idx < N - 1) show(idx + 1); else finish(); };
      requestAnimationFrame(() => root.classList.add('on'));
      show(0);
    },
  };
  window.Toon = Toon;
})();
