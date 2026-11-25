// Локализация: русский при запуске, ручной выбор в настройках имеет приоритет.
// Для отсутствующих и неподдерживаемых языков используется английский.
// Название игры: на русском «Летающий кот», на всех остальных «Flying Cat» (совпадает с логотипом-картинкой).
(function () {
  const K = ['title', 'play', 'levels', 'shop', 'settings', 'sounds', 'volume', 'language', 'tapHint', 'level', 'win', 'lose',
    'coinsForLevel', 'reviveHint', 'reviveUsed', 'next', 'toMenu', 'retry', 'revive', 'x2', 'equip', 'equipped', 'notEnough',
    'adLoading', 'adUnavailable', 'soon', 'watchAd', 'adTag', 'rotate',
    'cat0', 'cat1', 'cat2', 'cat3', 'cat4',
    'skin_default', 'skin_ad1', 'skin_ad2', 'skin_ad3', 'skin_ad4', 'skin_paid1', 'skin_paid2', 'skin_paid3', 'skin_paid4', 'music'];

  // порядок значений = порядок ключей K
  const RAW = {
    ru: ['Летающий кот', 'Играть', 'Уровни', 'Магазин', 'Настройки', 'Звуки', 'Громкость', 'Язык', 'Удерживай, чтобы лететь', 'Уровень', 'Победа!', 'Поражение',
      'Монеты за уровень:', 'Можно воскреснуть за рекламу', 'Воскрешение уже использовано', 'Дальше', 'В меню', 'Заново', 'Воскреснуть', 'x2 монеты', 'Надеть', 'Надет', 'Недостаточно монет',
      'Загрузка рекламы…', 'Реклама недоступна, попробуйте позже', 'Скоро!', 'Смотреть рекламу', 'Реклама', 'Поверните устройство горизонтально',
      'Старт', 'Египет', 'Китай', 'Арктика', 'Марс',
      'Котэ', 'Тигрёнок', 'Фараон', 'В шляпе', 'Зимний', 'Космонавт', 'Ниндзя', 'Супергерой', 'Золотой', 'Музыка'],
    en: ['Flying Cat', 'Play', 'Levels', 'Shop', 'Settings', 'Sounds', 'Volume', 'Language', 'Hold to fly', 'Level', 'Victory!', 'Defeat',
      'Coins this level:', 'Watch an ad to revive', 'Revive already used', 'Next', 'Menu', 'Retry', 'Revive', 'x2 coins', 'Equip', 'Equipped', 'Not enough coins',
      'Loading ad…', 'Ad unavailable, try again later', 'Coming soon!', 'Watch ad', 'Ad', 'Rotate your device to landscape',
      'Start', 'Egypt', 'China', 'Arctic', 'Mars',
      'Kitty', 'Tiger', 'Pharaoh', 'Straw Hat', 'Winter', 'Astronaut', 'Ninja', 'Superhero', 'Golden', 'Music'],
    tr: ['Flying Cat', 'Oyna', 'Seviyeler', 'Mağaza', 'Ayarlar', 'Sesler', 'Ses düzeyi', 'Dil', 'Uçmak için basılı tut', 'Seviye', 'Zafer!', 'Yenilgi',
      'Seviyedeki paralar:', 'Reklam izleyerek canlanabilirsin', 'Yeniden canlanma kullanıldı', 'Devam', 'Menü', 'Tekrar', 'Canlan', '2 kat para', 'Kuşan', 'Kuşanıldı', 'Yeterli para yok',
      'Reklam yükleniyor…', 'Reklam yok, daha sonra dene', 'Çok yakında!', 'Reklam izle', 'Reklam', 'Cihazını yatay çevir',
      'Başlangıç', 'Mısır', 'Çin', 'Arktik', 'Mars',
      'Kedi', 'Kaplan', 'Firavun', 'Hasır Şapka', 'Kışlık', 'Astronot', 'Ninja', 'Süper Kahraman', 'Altın', 'Müzik'],
    es: ['Flying Cat', 'Jugar', 'Niveles', 'Tienda', 'Ajustes', 'Sonidos', 'Volumen', 'Idioma', 'Mantén pulsado para volar', 'Nivel', '¡Victoria!', 'Derrota',
      'Monedas del nivel:', 'Mira un anuncio para revivir', 'Ya usaste la reanimación', 'Siguiente', 'Menú', 'Reintentar', 'Revivir', 'Monedas x2', 'Equipar', 'Equipado', 'No hay suficientes monedas',
      'Cargando anuncio…', 'Anuncio no disponible, inténtalo más tarde', '¡Próximamente!', 'Ver anuncio', 'Anuncio', 'Gira el dispositivo en horizontal',
      'Inicio', 'Egipto', 'China', 'Ártico', 'Marte',
      'Gatito', 'Tigre', 'Faraón', 'Sombrero', 'Invierno', 'Astronauta', 'Ninja', 'Superhéroe', 'Dorado', 'Música'],
    pt: ['Flying Cat', 'Jogar', 'Fases', 'Loja', 'Configurações', 'Sons', 'Volume', 'Idioma', 'Segure para voar', 'Fase', 'Vitória!', 'Derrota',
      'Moedas da fase:', 'Assista a um anúncio para reviver', 'Reviver já usado', 'Próxima', 'Menu', 'Tentar de novo', 'Reviver', 'Moedas x2', 'Equipar', 'Equipado', 'Moedas insuficientes',
      'Carregando anúncio…', 'Anúncio indisponível, tente mais tarde', 'Em breve!', 'Ver anúncio', 'Anúncio', 'Gire o dispositivo na horizontal',
      'Início', 'Egito', 'China', 'Ártico', 'Marte',
      'Gatinho', 'Tigre', 'Faraó', 'Chapéu', 'Inverno', 'Astronauta', 'Ninja', 'Super-herói', 'Dourado', 'Música'],
    fr: ['Flying Cat', 'Jouer', 'Niveaux', 'Boutique', 'Paramètres', 'Sons', 'Volume', 'Langue', 'Maintiens pour voler', 'Niveau', 'Victoire !', 'Défaite',
      'Pièces du niveau :', 'Regarde une pub pour revivre', 'Résurrection déjà utilisée', 'Suivant', 'Menu', 'Rejouer', 'Revivre', 'Pièces x2', 'Équiper', 'Équipé', 'Pas assez de pièces',
      'Chargement de la pub…', 'Pub indisponible, réessaie plus tard', 'Bientôt !', 'Voir une pub', 'Pub', "Tourne l'appareil à l'horizontale",
      'Départ', 'Égypte', 'Chine', 'Arctique', 'Mars',
      'Minou', 'Tigre', 'Pharaon', 'Chapeau', 'Hiver', 'Astronaute', 'Ninja', 'Super-héros', 'Doré', 'Musique'],
    de: ['Flying Cat', 'Spielen', 'Level', 'Shop', 'Einstellungen', 'Töne', 'Lautstärke', 'Sprache', 'Halten zum Fliegen', 'Level', 'Sieg!', 'Niederlage',
      'Münzen im Level:', 'Werbung ansehen, um wiederzubeleben', 'Wiederbelebung bereits genutzt', 'Weiter', 'Menü', 'Nochmal', 'Wiederbeleben', 'Münzen x2', 'Anlegen', 'Angelegt', 'Nicht genug Münzen',
      'Werbung wird geladen…', 'Werbung nicht verfügbar, später versuchen', 'Bald verfügbar!', 'Werbung ansehen', 'Werbung', 'Gerät ins Querformat drehen',
      'Start', 'Ägypten', 'China', 'Arktis', 'Mars',
      'Kätzchen', 'Tiger', 'Pharao', 'Strohhut', 'Winter', 'Astronaut', 'Ninja', 'Superheld', 'Golden', 'Musik'],
    it: ['Flying Cat', 'Gioca', 'Livelli', 'Negozio', 'Impostazioni', 'Suoni', 'Volume', 'Lingua', 'Tieni premuto per volare', 'Livello', 'Vittoria!', 'Sconfitta',
      'Monete del livello:', 'Guarda un annuncio per rinascere', 'Rinascita già usata', 'Avanti', 'Menu', 'Riprova', 'Rinasci', 'Monete x2', 'Equipaggia', 'Equipaggiato', 'Monete insufficienti',
      'Caricamento annuncio…', 'Annuncio non disponibile, riprova più tardi', 'Prossimamente!', 'Guarda annuncio', 'Annuncio', 'Ruota il dispositivo in orizzontale',
      'Inizio', 'Egitto', 'Cina', 'Artico', 'Marte',
      'Gattino', 'Tigre', 'Faraone', 'Cappello', 'Inverno', 'Astronauta', 'Ninja', 'Supereroe', 'Dorato', 'Musica'],
    pl: ['Flying Cat', 'Graj', 'Poziomy', 'Sklep', 'Ustawienia', 'Dźwięki', 'Głośność', 'Język', 'Przytrzymaj, aby lecieć', 'Poziom', 'Zwycięstwo!', 'Porażka',
      'Monety na poziomie:', 'Obejrzyj reklamę, aby wskrzesić', 'Wskrzeszenie już użyte', 'Dalej', 'Menu', 'Jeszcze raz', 'Wskrześ', 'Monety x2', 'Załóż', 'Założony', 'Za mało monet',
      'Wczytywanie reklamy…', 'Reklama niedostępna, spróbuj później', 'Wkrótce!', 'Obejrzyj reklamę', 'Reklama', 'Obróć urządzenie poziomo',
      'Start', 'Egipt', 'Chiny', 'Arktyka', 'Mars',
      'Kotek', 'Tygrys', 'Faraon', 'Kapelusz', 'Zimowy', 'Astronauta', 'Ninja', 'Superbohater', 'Złoty', 'Muzyka'],
    nl: ['Flying Cat', 'Spelen', 'Levels', 'Winkel', 'Instellingen', 'Geluiden', 'Volume', 'Taal', 'Houd ingedrukt om te vliegen', 'Level', 'Overwinning!', 'Verloren',
      'Munten dit level:', 'Bekijk een advertentie om te herleven', 'Herleving al gebruikt', 'Volgende', 'Menu', 'Opnieuw', 'Herleven', 'Munten x2', 'Uitrusten', 'Uitgerust', 'Niet genoeg munten',
      'Advertentie laden…', 'Advertentie niet beschikbaar, probeer later', 'Binnenkort!', 'Advertentie kijken', 'Advertentie', 'Draai je apparaat liggend',
      'Start', 'Egypte', 'China', 'Arctis', 'Mars',
      'Katje', 'Tijger', 'Farao', 'Strohoed', 'Winter', 'Astronaut', 'Ninja', 'Superheld', 'Goud', 'Muziek'],
    uk: ['Flying Cat', 'Грати', 'Рівні', 'Крамниця', 'Налаштування', 'Звуки', 'Гучність', 'Мова', 'Утримуй, щоб летіти', 'Рівень', 'Перемога!', 'Поразка',
      'Монети за рівень:', 'Можна воскреснути за рекламу', 'Воскресіння вже використано', 'Далі', 'У меню', 'Знову', 'Воскреснути', 'x2 монети', 'Вдягнути', 'Вдягнено', 'Недостатньо монет',
      'Завантаження реклами…', 'Реклама недоступна, спробуй пізніше', 'Скоро!', 'Дивитися рекламу', 'Реклама', 'Поверни пристрій горизонтально',
      'Старт', 'Єгипет', 'Китай', 'Арктика', 'Марс',
      'Котик', 'Тигреня', 'Фараон', 'У капелюсі', 'Зимовий', 'Космонавт', 'Ніндзя', 'Супергерой', 'Золотий', 'Музика'],
    id: ['Flying Cat', 'Main', 'Level', 'Toko', 'Pengaturan', 'Suara', 'Volume', 'Bahasa', 'Tahan untuk terbang', 'Level', 'Menang!', 'Kalah',
      'Koin level ini:', 'Tonton iklan untuk hidup lagi', 'Hidup lagi sudah dipakai', 'Lanjut', 'Menu', 'Ulangi', 'Hidup lagi', 'Koin x2', 'Pakai', 'Dipakai', 'Koin tidak cukup',
      'Memuat iklan…', 'Iklan tidak tersedia, coba lagi nanti', 'Segera hadir!', 'Tonton iklan', 'Iklan', 'Putar perangkat ke mode lanskap',
      'Awal', 'Mesir', 'Tiongkok', 'Arktik', 'Mars',
      'Kucing', 'Harimau', 'Firaun', 'Topi Jerami', 'Musim Dingin', 'Astronaut', 'Ninja', 'Superhero', 'Emas', 'Musik'],
    ar: ['Flying Cat', 'العب', 'المراحل', 'المتجر', 'الإعدادات', 'الأصوات', 'مستوى الصوت', 'اللغة', 'اضغط مطولًا للطيران', 'المرحلة', 'فوز!', 'خسارة',
      'عملات المرحلة:', 'شاهد إعلانًا لتعود إلى اللعب', 'تم استخدام الإحياء', 'التالي', 'القائمة', 'إعادة', 'إحياء', 'عملات ×2', 'ارتداء', 'مرتدى', 'عملات غير كافية',
      'جارٍ تحميل الإعلان…', 'الإعلان غير متاح، حاول لاحقًا', 'قريبًا!', 'شاهد إعلانًا', 'إعلان', 'أدر الجهاز أفقيًا',
      'البداية', 'مصر', 'الصين', 'القطب الشمالي', 'المريخ',
      'قطة', 'نمر', 'فرعون', 'قبعة', 'شتوي', 'رائد فضاء', 'نينجا', 'بطل خارق', 'ذهبي', 'الموسيقى'],
    ja: ['Flying Cat', 'プレイ', 'ステージ', 'ショップ', '設定', '効果音', '音量', '言語', '長押しで飛ぶ', 'ステージ', 'クリア！', 'ゲームオーバー',
      'ステージのコイン：', '広告を見て復活できます', '復活は使用済みです', '次へ', 'メニュー', 'もう一度', '復活', 'コイン2倍', '装備', '装備中', 'コインが足りません',
      '広告を読み込み中…', '広告を表示できません。後でもう一度お試しください', '近日公開！', '広告を見る', '広告', '端末を横向きにしてください',
      'スタート', 'エジプト', '中国', '北極', '火星',
      'ネコ', 'トラ', 'ファラオ', '麦わら帽子', '冬', '宇宙飛行士', '忍者', 'スーパーヒーロー', 'ゴールド', '音楽'],
    zh: ['Flying Cat', '开始', '关卡', '商店', '设置', '音效', '音量', '语言', '按住飞行', '关卡', '胜利！', '失败',
      '本关金币：', '观看广告即可复活', '已使用复活', '下一关', '菜单', '重来', '复活', '金币翻倍', '装备', '已装备', '金币不足',
      '广告加载中…', '广告暂不可用，请稍后再试', '敬请期待！', '观看广告', '广告', '请横屏使用设备',
      '起点', '埃及', '中国', '北极', '火星',
      '小猫', '老虎', '法老', '草帽', '冬日', '宇航员', '忍者', '超级英雄', '黄金', '音乐'],
    vi: ['Flying Cat', 'Chơi', 'Màn chơi', 'Cửa hàng', 'Cài đặt', 'Âm thanh', 'Âm lượng', 'Ngôn ngữ', 'Giữ để bay', 'Màn', 'Chiến thắng!', 'Thất bại',
      'Xu của màn:', 'Xem quảng cáo để hồi sinh', 'Đã dùng hồi sinh', 'Tiếp', 'Menu', 'Chơi lại', 'Hồi sinh', 'Xu x2', 'Trang bị', 'Đã trang bị', 'Không đủ xu',
      'Đang tải quảng cáo…', 'Quảng cáo không khả dụng, thử lại sau', 'Sắp ra mắt!', 'Xem quảng cáo', 'Quảng cáo', 'Hãy xoay thiết bị ngang',
      'Khởi đầu', 'Ai Cập', 'Trung Quốc', 'Bắc Cực', 'Sao Hỏa',
      'Mèo', 'Hổ', 'Pharaoh', 'Nón rơm', 'Mùa đông', 'Phi hành gia', 'Ninja', 'Siêu anh hùng', 'Vàng', 'Nhạc'],
  };

  // название языка на нём самом (для переключателя в настройках, требование 6.9)
  const NAMES = {
    ru: 'Русский', en: 'English', tr: 'Türkçe', es: 'Español', pt: 'Português', fr: 'Français', de: 'Deutsch', it: 'Italiano',
    pl: 'Polski', nl: 'Nederlands', uk: 'Українська', id: 'Bahasa Indonesia', ar: 'العربية', ja: '日本語', zh: '中文', vi: 'Tiếng Việt',
  };

  const DICT = {};
  for (const [lang, vals] of Object.entries(RAW)) {
    if (vals.length !== K.length) console.warn('[i18n] неверное число строк для', lang, vals.length, 'из', K.length);
    DICT[lang] = {};
    K.forEach((k, i) => { DICT[lang][k] = vals[i]; });
  }

  // подпись подарочного скина (отдельным списком, чтобы не раздувать основные строки)
  const GIFT = {
    ru: 'Временный скин', en: 'Temporary skin', tr: 'Geçici kostüm', es: 'Skin temporal', pt: 'Skin temporária', fr: 'Skin temporaire',
    de: 'Skin auf Zeit', it: 'Skin temporanea', pl: 'Skin czasowy', nl: 'Tijdelijke skin', uk: 'Тимчасовий скін', id: 'Skin sementara',
    ar: 'سكن مؤقت', ja: '期間限定スキン', zh: '临时皮肤', vi: 'Skin tạm thời',
  };
  for (const l of Object.keys(DICT)) DICT[l].giftSkin = GIFT[l] || GIFT.en;

  const TOON = {
    ru: 'Пройди все уровни и посмотри мультфильм', en: 'Beat all the levels and watch the cartoon',
    tr: 'Tüm seviyeleri geç ve çizgi filmi izle', es: 'Pasa todos los niveles y mira el dibujo animado',
    pt: 'Passe todas as fases e assista ao desenho animado', fr: 'Termine tous les niveaux et regarde le dessin animé',
    de: 'Schaffe alle Level und sieh dir den Zeichentrickfilm an', it: 'Supera tutti i livelli e guarda il cartone animato',
    pl: 'Przejdź wszystkie poziomy i obejrzyj kreskówkę', nl: 'Haal alle levels en kijk de tekenfilm',
    uk: 'Пройди всі рівні та подивись мультфільм', id: 'Selesaikan semua level dan tonton kartunnya',
    ar: 'أنهِ كل المراحل وشاهد الفيلم الكرتوني', ja: '全ステージをクリアしてアニメを見よう', zh: '通关所有关卡，观看动画短片', vi: 'Vượt qua tất cả màn chơi và xem phim hoạt hình',
  };
  for (const l of Object.keys(DICT)) DICT[l].cartoonHint = TOON[l] || TOON.en;
  const WATCH = { ru: 'Смотреть мультфильм', en: 'Watch the cartoon', tr: 'Çizgi filmi izle', es: 'Ver el dibujo animado', pt: 'Assistir ao desenho', fr: 'Voir le dessin animé', de: 'Zeichentrickfilm ansehen', it: 'Guarda il cartone' };
  for (const l of Object.keys(DICT)) DICT[l].cartoonPlay = WATCH[l] || WATCH.en;


  // новые подписи: звёзды, задание дня, бесконечный режим (отдельным списком)
  const EXTRA = {
    quest:   { ru: 'Задание дня', en: 'Daily quest', tr: 'Günlük görev', es: 'Misión diaria', pt: 'Missão diária', fr: 'Défi du jour', de: 'Tagesaufgabe', it: 'Missione del giorno', pl: 'Zadanie dnia', nl: 'Dagopdracht', uk: 'Завдання дня', id: 'Misi harian', ar: 'مهمة اليوم', ja: 'デイリーミッション', zh: '每日任务', vi: 'Nhiệm vụ ngày' },
    claim:   { ru: 'Забрать', en: 'Claim', tr: 'Al', es: 'Recoger', pt: 'Receber', fr: 'Récupérer', de: 'Abholen', it: 'Ritira', pl: 'Odbierz', nl: 'Ophalen', uk: 'Забрати', id: 'Ambil', ar: 'استلم', ja: '受け取る', zh: '领取', vi: 'Nhận' },
    endless: { ru: 'Бесконечный режим', en: 'Endless mode', tr: 'Sonsuz mod', es: 'Modo infinito', pt: 'Modo infinito', fr: 'Mode infini', de: 'Endlosmodus', it: 'Modalità infinita', pl: 'Tryb bez końca', nl: 'Eindeloze modus', uk: 'Нескінченний режим', id: 'Mode tanpa akhir', ar: 'الوضع اللانهائي', ja: '無限モード', zh: '无尽模式', vi: 'Chế độ vô tận' },
    best:    { ru: 'Рекорд', en: 'Best', tr: 'Rekor', es: 'Récord', pt: 'Recorde', fr: 'Record', de: 'Rekord', it: 'Record', pl: 'Rekord', nl: 'Record', uk: 'Рекорд', id: 'Rekor', ar: 'الرقم القياسي', ja: 'ベスト', zh: '纪录', vi: 'Kỷ lục' },
    meters:  { ru: 'м', en: 'm', tr: 'm', es: 'm', pt: 'm', fr: 'm', de: 'm', it: 'm', pl: 'm', nl: 'm', uk: 'м', id: 'm', ar: 'م', ja: 'm', zh: '米', vi: 'm' },
    newWorld:  { ru: 'Новый мир!', en: 'New world!', tr: 'Yeni dünya!', es: '¡Nuevo mundo!', pt: 'Novo mundo!', fr: 'Nouveau monde !', de: 'Neue Welt!', it: 'Nuovo mondo!', pl: 'Nowy świat!', nl: 'Nieuwe wereld!', uk: 'Новий світ!', id: 'Dunia baru!', ar: 'عالم جديد!', ja: '新しいワールド！', zh: '新世界！', vi: 'Thế giới mới!' },
    worldReady:{ ru: 'Монет хватает, чтобы открыть', en: 'You have enough coins to unlock', tr: 'Açmak için yeterli altının var:', es: 'Tienes monedas para desbloquear', pt: 'Você tem moedas para desbloquear', fr: 'Assez de pièces pour débloquer', de: 'Genug Münzen zum Freischalten:', it: 'Hai monete per sbloccare', pl: 'Masz monety, by odblokować', nl: 'Genoeg munten om te ontgrendelen:', uk: 'Монет вистачає, щоб відкрити', id: 'Koin cukup untuk membuka', ar: 'لديك عملات كافية لفتح', ja: 'コインが足りています：', zh: '金币足够解锁', vi: 'Đủ xu để mở khóa' },
    openPlay:  { ru: 'Открыть и играть', en: 'Unlock and play', tr: 'Aç ve oyna', es: 'Desbloquear y jugar', pt: 'Desbloquear e jogar', fr: 'Débloquer et jouer', de: 'Freischalten', it: 'Sblocca e gioca', pl: 'Odblokuj i graj', nl: 'Ontgrendel en speel', uk: 'Відкрити й грати', id: 'Buka dan main', ar: 'افتح والعب', ja: '解放してプレイ', zh: '解锁并开始', vi: 'Mở và chơi' },
    later:     { ru: 'Позже', en: 'Later', tr: 'Sonra', es: 'Más tarde', pt: 'Depois', fr: 'Plus tard', de: 'Später', it: 'Più tardi', pl: 'Później', nl: 'Later', uk: 'Пізніше', id: 'Nanti', ar: 'لاحقًا', ja: 'あとで', zh: '稍后', vi: 'Để sau' },
    back:    { ru: 'Назад', en: 'Back', tr: 'Geri', es: 'Atrás', pt: 'Voltar', fr: 'Retour', de: 'Zurück', it: 'Indietro', pl: 'Wstecz', nl: 'Terug', uk: 'Назад', id: 'Kembali', ar: 'رجوع', ja: '戻る', zh: '返回', vi: 'Quay lại' },
  };
  for (const [k, tr] of Object.entries(EXTRA)) for (const l of Object.keys(DICT)) DICT[l][k] = tr[l] || tr.en;

  // Неподдерживаемые языки возвращаются к английскому.
  DICT.en.tutorial = 'Tutorial';
  DICT.ru.tutorial = 'Обучение';
  DICT.en.resetProgress = 'Reset progress';
  DICT.ru.resetProgress = 'Сбросить прогресс';
  DICT.en.resetProgressWarning = 'Coins, levels and skins will be reset. Sound and language settings will be kept.';
  DICT.ru.resetProgressWarning = 'Монеты, уровни и скины будут сброшены. Настройки звука и языка сохранятся.';
  DICT.en.reloadText = 'Your progress changed on another device or tab. Reload the game to continue.';
  DICT.ru.reloadText = 'Прогресс изменился на другом устройстве или в другой вкладке. Перезагрузи игру, чтобы продолжить.';
  DICT.en.reloadBtn = 'Reload';
  DICT.ru.reloadBtn = 'Перезагрузить';
  DICT.en.cancelReset = 'Cancel';
  DICT.ru.cancelReset = 'Отмена';
  function resolve(code) {
    code = (code || '').toLowerCase().slice(0, 2);
    if (DICT[code]) return code;
    return 'en';
  }

  let lang = 'en';
  const t = key => (DICT[lang] && DICT[lang][key]) || DICT.en[key] || DICT.ru[key] || key;

  window.I18N = {
    NAMES, dict: DICT,
    codes: Object.keys(DICT),
    resolve,
    setLang(code) {
      lang = resolve(code);
      document.documentElement.lang = lang;
      document.title = t('title');
      document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    },
    get lang() { return lang; },
  };
  window.t = t;
})();
