# MARS 2100 — Translation glossary (locked terms)

Every translation must use these terms, the same way, everywhere in the app.
English (`src/i18n/locales/en.ts`) is the source of truth.

> **Status: needs native-speaker review (perlu tinjauan penutur asli).**
> No language below has been checked by a human native speaker yet. See `REVIEW.md`.

## 1. Rules for every language

1. **Numbers, units and facts never change.** Values that change at runtime come from
   `{placeholders}` and are formatted by the app. Numbers written inside a message
   (e.g. "0.6 kPa", "2017", "122 g") keep their value; only the **digit separators follow the
   language** (e.g. Indonesian/German "20.000" and "0,6", French "20 000" and "0,6").
   Never leave English separators where they would be misread (Indonesian "20,000" means 20).
2. **Units stay as symbols:** %, km, m, km/h, kPa, mSv, W/m², kWe, g, m/s², °, sol.
   Write the language's usual spacing (e.g. French "28 %"), never a different unit.
3. **Fixed names stay in Latin script, untranslated:** MARS 2100, NASA, JPL, Jezero Crater,
   Utopia Planitia, Elysium Planitia, Perseverance, Curiosity, InSight, Phoenix, Opportunity,
   Viking 2, MOXIE, RAD, SHARAD, MOLA, HiRISE, MRO, KRUSTY, Kilopower, ISS, ECLSS, Veggie.
   (Decision 2026-10: site names stay Latin in every language, including Arabic,
   Chinese, Japanese, Korean, Hindi and Russian.) A generic word next to a name may be
   translated ("the crater floor of Jezero").
   Abbreviations keep the abbreviation; the explanation is translated
   (e.g. "ECLSS — sistem kendali lingkungan dan penunjang kehidupan").
4. **Evidence labels must stay strong and distinct** — never merge or soften them:
   OBSERVED = measured/seen by a real mission · MODELLED = calculated/simplified by us ·
   GAMEPLAY = invented for the game. The single-letter tags (`common.evidenceLetter.*`)
   must match the first letter of the translated word where possible and must be different
   from each other.
5. **Reading levels:** `.simple` keys are for learners aged about 10–14 (short sentences,
   everyday words, friendly "you"); `.detailed` keys keep the technical term. Both must say
   the same thing — the simple text may never be less correct.
6. **The disclaimer must stay clear** (`sources.intro`, `sources.gameplay.text`,
   `approach.footnote`, `site.footnote`, `edl.disclaimer`, `report.footer`): educational
   simulation · not an official mission design · not endorsed by NASA · procedural landing-site
   terrain, not MOLA/HiRISE data · the globe uses Viking colour and MOLA data, relief exaggerated 4 times.
7. **Links to NASA sources are not translated.** The app shows `common.sourcesInEnglish`
   next to them.
8. **When unsure, keep the English term and add a short explanation** in brackets. Never guess.
9. **Right-to-left (Arabic):** write arrows in reading direction (← instead of →, ↖ instead of ↗).
   The app keeps numbers, ratios and percentages left-to-right automatically.
10. Keep `{placeholders}` exactly, including leading spaces or punctuation in short fragments
    (e.g. `' + battery'`, `' · plan for them now'`).
11. **No grammar that depends on the filled-in value directly after a placeholder** — e.g. Turkish
    case suffixes (’e/’a) or Korean particles (은/는, 이/가) after `{site}` or `{percent}` — because the
    right form changes with the name or number. Rephrase the sentence instead.
12. **Unit symbols stay Latin in every script** (Russian "km", not "км"; Arabic "km", not "كم") so the
    numbers and units match the NASA sources.

## 2. Locked terms per language

Columns: **term** · *simple wording for young learners (if different)*.

### English (source)
sol · regolith · radiation dose · solar particle event (*solar storm*) · dust storm · life support ·
habitat (*home*) · cargo · heat shield · parachute · backshell · powered descent · landing legs ·
greenhouse (*garden*) · berm (*soil wall*) · outpost · rover · solar array (*solar panels*) ·
battery bank · water extractor (*water digger*) · fission unit (*small nuclear power unit*) ·
oxygen system / ECLSS (*air machine*) · Observed · Modelled · Gameplay assumption

### Bahasa Indonesia (`id`)
| English | Istilah baku | Mode SIMPLE |
|---|---|---|
| sol | sol (hari Mars) | sol |
| regolith | regolit | tanah Mars |
| radiation dose | dosis radiasi | dosis radiasi |
| solar particle event | peristiwa partikel surya | badai matahari |
| dust storm | badai debu | badai debu |
| life support | penunjang kehidupan | penunjang hidup |
| habitat | habitat | rumah |
| cargo | kargo | kargo |
| heat shield | perisai panas | perisai panas |
| parachute | parasut | parasut |
| backshell | cangkang belakang (backshell) | — |
| powered descent | penurunan bertenaga roket | — |
| landing legs | kaki pendarat | kaki pendarat |
| greenhouse | rumah kaca | kebun |
| berm | tanggul regolit (berm) | dinding tanah |
| outpost | pangkalan | pangkalan |
| rover | rover | rover |
| solar array | susunan panel surya | panel surya |
| battery bank | bank baterai | baterai |
| water extractor | ekstraktor air | penggali air |
| fission unit | unit fisi | unit nuklir kecil |
| oxygen system (ECLSS) | sistem oksigen (ECLSS) | mesin udara (ECLSS) |
| Observed / Modelled / Gameplay | Diamati (D) / Dimodelkan (M) / Asumsi permainan (A) | |

### Español (`es`)
sol (día marciano) · regolito · dosis de radiación · evento de partículas solares (*tormenta solar*) ·
tormenta de polvo · soporte vital · hábitat (*casa*) · carga · escudo térmico · paracaídas ·
cubierta trasera (backshell) · descenso propulsado · patas de aterrizaje · invernadero (*huerto*) ·
berma de regolito (*muro de tierra*) · puesto avanzado · rover · paneles solares · banco de baterías ·
extractor de agua (*excavadora de agua*) · unidad de fisión (*pequeña unidad nuclear*) ·
sistema de oxígeno, ECLSS (*máquina de aire*) · Observado (O) · Modelado (M) · Supuesto de juego (S)

### 简体中文 (`zh-Hans`)
火星日（sol）· 风化层 · 辐射剂量 · 太阳粒子事件（*太阳风暴*）· 沙尘暴 · 生命保障 · 居住舱（*家*）·
货物 · 隔热罩 · 降落伞 · 背罩 · 动力下降 · 着陆腿 · 温室（*菜园*）· 风化层护堤（*土墙*）· 前哨基地 ·
火星车 · 太阳能电池阵（*太阳能板*）· 蓄电池组 · 取水装置（*挖水机*）· 核裂变电源（*小型核电装置*）·
氧气系统 ECLSS（*造气机*）· 观测（观）· 模型（模）· 游戏设定（设）

### العربية (`ar`)
سول (يوم مريخي) · الريغوليث (التربة المفككة) · جرعة الإشعاع · حدث جسيمات شمسية (*عاصفة شمسية*) ·
عاصفة غبارية · دعم الحياة · الموئل (*البيت*) · الحمولة · الدرع الحراري · المظلة · الغلاف الخلفي ·
الهبوط بالدفع الصاروخي · أرجل الهبوط · الدفيئة (*الحديقة*) · ساتر من الريغوليث (*جدار ترابي*) ·
القاعدة المتقدمة · المركبة الجوالة · الألواح الشمسية · بنك البطاريات · مستخرج الماء (*حفّار الماء*) ·
وحدة انشطار نووي (*وحدة نووية صغيرة*) · نظام الأكسجين ECLSS (*آلة الهواء*) ·
مرصود (ر) · مُنمذَج (ن) · افتراض اللعبة (ف)

### Français (`fr`)
sol (jour martien) · régolithe · dose de rayonnement · événement à particules solaires (*tempête solaire*) ·
tempête de poussière · support de vie · habitat (*maison*) · cargaison · bouclier thermique · parachute ·
coque arrière (backshell) · descente propulsée · jambes d'atterrissage · serre (*potager*) ·
merlon de régolithe (*mur de terre*) · avant-poste · rover · panneaux solaires · batteries ·
extracteur d'eau (*foreuse à eau*) · unité à fission (*petite centrale nucléaire*) ·
système d'oxygène ECLSS (*machine à air*) · Observé (O) · Modélisé (M) · Hypothèse de jeu (H)

### 日本語 (`ja`)
ソル（火星日）· レゴリス · 放射線量 · 太陽粒子現象（*太陽嵐*）· 砂嵐 · 生命維持 · 居住モジュール（*家*）·
カーゴ · 耐熱シールド · パラシュート · バックシェル · 動力降下 · 着陸脚 · 温室（*菜園*）·
レゴリスの防護土手（*土のかべ*）· 前哨基地 · ローバー · 太陽電池パネル · バッテリーバンク ·
水抽出装置（*水ほり機*）· 核分裂電源（*小さな原子力電源*）· 酸素システム ECLSS（*空気マシン*）·
観測（観）· モデル（モ）· ゲーム上の仮定（仮）

### 한국어 (`ko`)
솔(화성일) · 레골리스 · 방사선량 · 태양 입자 사건(*태양 폭풍*) · 먼지 폭풍 · 생명 유지 · 거주 모듈(*집*) ·
화물 · 열 차폐막 · 낙하산 · 후방 덮개(백셸) · 동력 하강 · 착륙 다리 · 온실(*텃밭*) ·
레골리스 방벽(*흙벽*) · 전초기지 · 로버 · 태양전지판 · 배터리 뱅크 · 물 추출기(*물 파는 기계*) ·
핵분열 발전기(*작은 원자력 발전기*) · 산소 시스템 ECLSS(*공기 기계*) ·
관측(관) · 모델(모) · 게임 가정(가)

### Deutsch (`de`)
Sol (Marstag) · Regolith · Strahlendosis · solares Teilchenereignis (*Sonnensturm*) · Staubsturm ·
Lebenserhaltung · Habitat (*Wohnmodul*) · Fracht · Hitzeschild · Fallschirm · Rückschale (Backshell) ·
angetriebener Abstieg · Landebeine · Gewächshaus (*Garten*) · Regolithwall (*Erdwall*) · Außenposten ·
Rover · Solarmodule · Batteriespeicher · Wasserextraktor (*Wasserbohrer*) ·
Kernspaltungsmodul (*kleines Atomkraftwerk*) · Sauerstoffsystem ECLSS (*Luftmaschine*) ·
Beobachtet (B) · Modelliert (M) · Spielannahme (S)

### Português do Brasil (`pt-BR`)
sol (dia marciano) · regolito · dose de radiação · evento de partículas solares (*tempestade solar*) ·
tempestade de poeira · suporte de vida · habitat (*casa*) · carga · escudo térmico · paraquedas ·
casco traseiro (backshell) · descida propulsada · pernas de pouso · estufa (*horta*) ·
barreira de regolito (*muro de terra*) · posto avançado · rover · painéis solares · banco de baterias ·
extrator de água (*escavadeira de água*) · unidade de fissão (*pequena usina nuclear*) ·
sistema de oxigênio ECLSS (*máquina de ar*) · Observado (O) · Modelado (M) · Suposição de jogo (S)

### Русский (`ru`)
сол (марсианские сутки) · реголит · доза облучения · солнечное протонное событие (*солнечная буря*) ·
пылевая буря · жизнеобеспечение · жилой модуль (*дом*) · груз · теплозащитный экран · парашют ·
задний защитный кожух (backshell) · спуск на двигателях · посадочные опоры · теплица (*огород*) ·
вал из реголита (*земляной вал*) · аванпост · ровер · солнечные панели · аккумуляторная батарея ·
установка добычи воды (*водяной бур*) · ядерный энергоблок (*маленькая атомная установка*) ·
кислородная система ECLSS (*машина для воздуха*) · Наблюдение (Н) · Модель (М) · Игровое допущение (И)

### हिन्दी (`hi`)
सोल (मंगल का दिन) · रेगोलिथ (मंगल की ढीली मिट्टी) · विकिरण खुराक · सौर कण घटना (*सौर तूफ़ान*) ·
धूल भरी आँधी · जीवन रक्षा प्रणाली · आवास मॉड्यूल (*घर*) · कार्गो · हीट शील्ड (ऊष्मा कवच) · पैराशूट ·
बैकशेल (पिछला आवरण) · इंजन से अवतरण · लैंडिंग लेग · ग्रीनहाउस (*बगीचा*) · रेगोलिथ की मेड़ (*मिट्टी की दीवार*) ·
चौकी · रोवर · सौर पैनल · बैटरी बैंक · जल निष्कर्षक (*पानी खोदने की मशीन*) ·
विखंडन ऊर्जा इकाई (*छोटी परमाणु बिजली इकाई*) · ऑक्सीजन प्रणाली ECLSS (*हवा मशीन*) ·
अवलोकित (अ) · मॉडल आधारित (म) · खेल की धारणा (ख)

### Türkçe (`tr`)
sol (Mars günü) · regolit · radyasyon dozu · güneş parçacık olayı (*güneş fırtınası*) · toz fırtınası ·
yaşam desteği · yaşam modülü (*ev*) · kargo · ısı kalkanı · paraşüt · arka kabuk (backshell) ·
motorlu iniş · iniş ayakları · sera (*bahçe*) · regolit seddi (*toprak duvar*) · ileri üs · gezgin araç (rover) ·
güneş panelleri · batarya bankası · su çıkarıcı (*su kazıcı*) · fisyon birimi (*küçük nükleer güç birimi*) ·
oksijen sistemi ECLSS (*hava makinesi*) · Gözlenen (G) · Modellenen (M) · Oyun varsayımı (V)

### Italiano (`it`)
sol (giorno marziano) · regolite · dose di radiazione · evento di particelle solari (*tempesta solare*) ·
tempesta di polvere · supporto vitale · habitat (*casa*) · carico · scudo termico · paracadute ·
guscio posteriore (backshell) · discesa propulsa · gambe di atterraggio · serra (*orto*) ·
terrapieno di regolite (*muro di terra*) · avamposto · rover · pannelli solari · banco batterie ·
estrattore d'acqua (*scavatore d'acqua*) · unità a fissione (*piccola centrale nucleare*) ·
sistema dell'ossigeno ECLSS (*macchina dell'aria*) · Osservato (O) · Modellato (M) · Ipotesi di gioco (I)

### Tiếng Việt (`vi`)
sol (ngày sao Hỏa) · regolith (lớp đất đá vụn) · liều bức xạ · sự kiện hạt Mặt Trời (*bão Mặt Trời*) ·
bão bụi · hỗ trợ sự sống · mô-đun ở (*ngôi nhà*) · hàng hóa · tấm chắn nhiệt · dù · vỏ sau (backshell) ·
hạ độ cao bằng động cơ · chân đáp · nhà kính (*vườn*) · bờ chắn regolith (*bức tường đất*) · tiền đồn ·
xe tự hành (rover) · tấm pin mặt trời · dàn ắc quy · máy khai thác nước (*máy đào nước*) ·
tổ máy phân hạch (*máy điện hạt nhân nhỏ*) · hệ thống oxy ECLSS (*máy tạo khí*) ·
Quan sát (Q) · Mô hình (M) · Giả định trò chơi (G)
