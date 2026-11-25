// Новая графика (pastel kawaii, пакет art_new): подмена спрайтов из Unity и скины.
// Подключается после data.js. Размеры в игровых единицах берутся из оригинальных спрайтов Unity,
// новые картинки только рисуются в тех же рамках (как требует README пакета).
(function () {
  const A = 'assets/art/';
  const S = GAME_DATA.sprites;

  // часть кота в Unity -> имя файла в пакете; w/h — исходные размеры холста Unity (без обводки из экспорта)
  const CAT_PARTS = { Cat_2: ['body', 512], tail: ['tail', 512], Leg: ['leg', 256], Flay: ['wing', 512] };

  // id скина в игре -> папка в art_new/cat
  const SKIN_DIR = {
    default: 'default', cat_ad_1: 'ad1', cat_ad_2: 'ad2', cat_ad_3: 'ad3', cat_ad_4: 'ad4',
    cat_paid_1: 'paid1', cat_paid_2: 'paid2', cat_paid_3: 'paid3', cat_paid_4: 'paid4',
  };

  // спрайты частей кота для каждого скина: ключ «Cat_2@ad1»
  for (const [base, [file, size]] of Object.entries(CAT_PARTS)) {
    const meta = S[base];
    if (!meta) continue;
    for (const dir of Object.values(SKIN_DIR)) {
      S[base + '@' + dir] = Object.assign({}, meta, { file: `${A}cat/${dir}/${file}.webp`, w: size, h: size });
    }
    Object.assign(meta, { file: `${A}cat/default/${file}.webp`, w: size, h: size });
  }
  // эмоции на лице: у тела каждого скина есть варианты с нарисованным другим лицом (tools/make_faces.py)
  const EMOTIONS = ['happy', 'hurt', 'blink'];
  if (S.Cat_2) {
    for (const dir of Object.values(SKIN_DIR)) {
      for (const e of EMOTIONS) S['Cat_2@' + dir + '@' + e] = Object.assign({}, S.Cat_2, { file: `${A}cat/${dir}/body_${e}.webp`, w: 512, h: 512 });
    }
  }
  // монета и портал: те же размеры в мире, новая картинка
  if (S.Money) S.Money.file = A + 'obj/coin.webp';
  if (S.Portal) S.Portal.file = A + 'obj/portal.webp';
  // старые фоновые спрайты Unity больше не используются — не грузим
  ['Fon', 'Lend', 'Panel', 'Cub_Green_B'].forEach(k => { if (S[k]) S[k].skip = true; });

  // звуки интерфейса из Unity UI Audio Collection (MIT): клик, открыть/закрыть окно, ошибка, переключатель, покупка
  const UI_SND = { click: 'mp3', open: 'mp3', close: 'mp3', error: 'mp3', toggle: 'mp3', buy: 'mp3', reward: 'mp3' };
  GAME_DATA.sounds = GAME_DATA.sounds || {};
  for (const [k, ext] of Object.entries(UI_SND)) GAME_DATA.sounds['ui_' + k] = `assets/snd/ui/ui_${k}.${ext}`;

  // звуки: ветер при взмахе (Hyper casual Voice and SFX pack), «поп» подбора монеты (Unity UI Audio Collection)
  ['wind1', 'wind2', 'wind3', 'coin_pop'].forEach(k => { GAME_DATA.sounds[k] = `assets/snd/sfx/${k}.mp3`; });

  // фоновая музыка (Suno): menu — меню, остальные — локации; добавить трек = положить файл и дописать сюда
  GAME_DATA.music = { menu: 'assets/snd/music/menu.mp3', forest: 'assets/snd/music/forest.mp3', desert: 'assets/snd/music/desert.mp3', china: 'assets/snd/music/china.mp3', arctic: 'assets/snd/music/arctic.mp3', mars: 'assets/snd/music/mars.mp3' };

  function dirOf(skinId) { return SKIN_DIR[skinId] || 'default'; }

  /** Ставит на риг кота спрайты выбранного скина (тело, хвост, лапы, крыло). */
  function applySkinTo(rig, skinId) {
    const dir = dirOf(skinId);
    rig.collect([]).forEach(n => {
      if (!n.baseSprite) n.baseSprite = n.sprite;
      if (CAT_PARTS[n.baseSprite]) {
        const key = n.baseSprite + '@' + dir;
        // пока картинки скина не загружены — показываем базового кота
        const img = Engine.Assets.images[key];
        n.sprite = img && img.complete && img.naturalWidth ? key : n.baseSprite;
        n.look = null; n.color = null;
      }
    });
  }

  /** Ставит телу кота лицо с нужной эмоцией ('normal' — исходное). Пока картинка не загружена, остаётся обычное лицо. */
  function setFace(bodyNode, skinId, emo) {
    if (!bodyNode) return;
    const dir = dirOf(skinId);
    const key = 'Cat_2@' + dir + (emo && emo !== 'normal' ? '@' + emo : '');
    const img = Engine.Assets.images[key];
    bodyNode.sprite = img && img.complete && img.naturalWidth ? key : 'Cat_2@' + dir;
  }

  /** Список картинок скина для загрузки. */
  function skinImages(skinId) {
    const dir = dirOf(skinId), out = {};
    for (const base of Object.keys(CAT_PARTS)) out[base + '@' + dir] = S[base + '@' + dir].file;
    for (const e of EMOTIONS) out['Cat_2@' + dir + '@' + e] = S['Cat_2@' + dir + '@' + e].file;
    return out;
  }

  window.Art = {
    A, SKIN_DIR, dirOf, skinImages, applySkinTo, setFace,
    skinIcon: id => `${A}cat/${dirOf(id)}/icon.webp`,
    skinName: id => t('skin_' + dirOf(id)),
    ui: name => `${A}ui/${name}.webp`,
  };
  window.applySkinTo = applySkinTo;
})();
