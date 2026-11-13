# MARS 2100 — Translation review status

**Every translation in this project still needs review by a native
speaker ("perlu tinjauan penutur asli").** None has been checked by a human yet, so none may be
described as verified. Locked terms and rules: [`glossary.md`](./glossary.md).

Source of truth: `locales/en.ts` (829 keys). The key count includes plural variants
(`.one` / `.other`) that some languages do not use but must still provide.

## Status per language

| Language | File | Keys | Automated checks | Native review | Reviewer / date |
|---|---|---|---|---|---|
| English (source) | `en.ts` | 829 | — | source text | — |
| Bahasa Indonesia | `id.ts` | 829 / 829 | ✓ | **needs native review** | — |
| Español | `es.ts` | 829 / 829 | ✓ | **needs native review** | — |
| 简体中文 | `zh-Hans.ts` | 829 / 829 | ✓ | **needs native review** | — |
| العربية | `ar.ts` | 853 (829 + Arabic plural forms) | ✓ | **needs native review** | — |
| Français | `fr.ts` | 829 / 829 | ✓ | **needs native review** | — |
| 日本語 | `ja.ts` | 829 / 829 | ✓ | **needs native review** | — |
| 한국어 | `ko.ts` | 829 / 829 | ✓ | **needs native review** | — |
| Deutsch | `de.ts` | 829 / 829 | ✓ | **needs native review** | — |
| Português (Brasil) | `pt-BR.ts` | 829 / 829 | ✓ | **needs native review** | — |
| Русский | `ru.ts` | 841 (829 + Russian plural forms) | ✓ | **needs native review** | — |
| हिन्दी | `hi.ts` | 829 / 829 | ✓ | **needs native review** | — |
| Türkçe | `tr.ts` | 829 / 829 | ✓ | **needs native review** | — |
| Italiano | `it.ts` | 829 / 829 | ✓ | **needs native review** | — |
| Tiếng Việt | `vi.ts` | 829 / 829 | ✓ | **needs native review** | — |

✓ = `npm run i18n:check` passes: keys complete, `{placeholders}` identical, every number in the English text present
(value unchanged, local separators allowed), fixed names kept in Latin script, leading/trailing
spaces kept, plural forms present for every count 0–1000 (`Intl.PluralRules`), evidence letters
distinct. In the browser, every language was also checked for leftover English text and for the same
page structure as English across 21 seeded mission scenes, and the layout was measured at 375, 1024
and 1280 px wide (no sideways overflow, no word cut between two letters, no overlapping controls).
The full mission (approach → site → entry → trajectory decision → touchdown → all phases → dust storm →
solar flare → report, plus a failed run) was played through the real interface in en, id, ar, zh-Hans,
de and hi at 1280×800 and 375×812, including a language switch mid-mission and in the report.
Layout was tested in Chromium only — not in Safari, Firefox or on real phones.

Automated checks show the text is *structurally* safe (nothing missing, every number and name kept).
They cannot show that a sentence is natural or scientifically well phrased — that needs a person.

## Most sensitive sentences (review these first, in every language)

These carry real measurements, mission history or the disclaimer. A wrong word here misleads.

| Key | Why it is sensitive |
|---|---|
| `sources.intro`, `approach.footnote` | Main disclaimer: educational simulation, procedural landing-site terrain (no MOLA/HiRISE data), the globe from Viking colour + MOLA relief **exaggerated 4 times**, **not endorsed by NASA**. Rewritten in all languages on 2026-10-15 when the globe switched to real data. |
| `sources.gameplay.text`, `report.footer`, `approach.footnote`, `site.footnote`, `edl.disclaimer` | Say which values are invented and that this is not an official mission design. |
| `common.evidence.*`, `common.evidenceLetter.*`, `site.legend.*` | OBSERVED / MODELLED / GAMEPLAY must stay strong and distinct. |
| `phase.HABITAT.learn.0`, `sources.radiation.text` | Curiosity RAD: ≈ 0.64 mSv per day at Gale Crater. |
| `phase.PROTECT.learn.1`, `flare.observed`, `sources.radiation.text` | September 2017 solar event: surface radiation more than doubled, for over two days. |
| `site.utopia.fact.resources.*`, `sources.sites.text` | SHARAD (2016): 50–85 % water ice, 80–170 m thick, under ~1–10 m of soil, ~39–49° N; purity unconfirmed. |
| `site.elysium.fact.elevation.note`, `sources.sites.text` | InSight at ≈ −2,613 m; site rule about −2.5 km (see note below). |
| `site.jezero.fact.*` | Jezero floor ≈ 2,600 m below datum; Terrain-Relative Navigation. |
| `phase.LIFE_SUPPORT.learn.0/1`, `sources.tech.text` | ISS ≈ 98 % water recovery (2023); MOXIE 122 g of O₂ (2021–2023). |
| `phase.POWER.learn.0/1` | Sunlight ≈ 43 % of Earth (~590 vs ~1,361 W/m²); KRUSTY 2018; Kilopower 1–10 kWe. |
| `phase.CRISIS.learn.0`, `storm.observed` | Opportunity fell silent in the 2018 global dust storm. |
| `sources.edl.text`, `landingCopy.ENTRY.why` | ~20,000 km/h entry, 21.5 m parachute at ~11 km and ~1,500 km/h, heat shield ~20 s later. |
| `glossary.*.meaning`, `*.simple` keys | Simplified wording for ages ~10–14 must stay correct. |

## Notes for reviewers

### Bahasa Indonesia (`id`) — choices to confirm
- **GAMEPLAY → "Asumsi permainan"**, OBSERVED → "Diamati", MODELLED → "Dimodelkan"; tag letters
  **D / M / A** ("Diamati" and "Dimodelkan" both start with D, so MODELLED uses M for *model*).
- **outpost → "pangkalan"**, **berm → "tanggul regolit"** (simple: "dinding tanah"),
  **life support → "penunjang kehidupan"** (short label: "penunjang hidup"),
  **solar particle event → "peristiwa partikel surya"** (simple: "badai matahari"),
  **solar flare (report row) → "Flare matahari"**.
- **km/h is kept** as the unit symbol (glossary rule 2), although Indonesian texts often write "km/jam".
- **ECLSS** keeps the English expansion "Environmental Control and Life Support System" followed by
  an Indonesian explanation, per glossary rule 3.
- Numbers inside sentences use Indonesian separators ("20.000", "0,6", "1.361"); values are unchanged.
- `.simple` texts address the player as "kamu"; `.detailed` texts are more formal.
- `site.elysium.fact.elevation.note`: the English says "Site rules required **at least −2.5 km**",
  which can be misread. The Indonesian states the meaning explicitly: "ketinggian −2,5 km **atau lebih
  rendah**" (InSight needed a landing elevation of −2.5 km or lower so there was enough air to slow
  down). The English text was left unchanged, because the English text must stay as it is.

### Applies to every translated language
- `site.elysium.fact.elevation.note` says the meaning explicitly in every language: the landing
  elevation had to be **−2.5 km or lower** (the English "at least −2.5 km" is ambiguous; the English
  text itself was not changed).
- `phase.POWER.learn.0`: sunlight on Mars is **about 43 % of Earth's**. Early drafts of Hindi,
  Russian and Italian said "43 % stronger" — corrected; please re-read this sentence in every language.
- The player is addressed with the informal, friendly "you" everywhere (es tú · fr tu · de du ·
  pt-BR você · it tu · ru ты · tr sen · vi bạn · zh 你 · hi आप · ko polite 해요/합니다 forms).
  Please say if a more formal register suits school use better in your language.
- Unit symbols stay Latin in every script (km, m, kPa, mSv, km/h, W/m², kWe, g) — glossary rule 2.
  This is unusual in Russian (normally км, кПа, мЗв) and should be confirmed by a reviewer.
- Sources stay in English; `common.sourcesInEnglish` says so next to each link.

### Choices to confirm per language
- **es** — Supuesto de juego (S); "puesto avanzado" for outpost; numbers "2613" without separator below 10 000 (RAE style).
- **fr** — Hypothèse de jeu (H); non-breaking space before `:` and `%` ("28 %"), narrow
  non-breaking space before `; ? !` and between thousands ("2 613"); "merlon de régolithe" for berm.
- **pt-BR** — Suposição de jogo (S); "posto avançado" for outpost; "pouso" (Brazilian) for landing.
- **it** — Ipotesi di gioco (I); "terrapieno di regolite" for berm. The small top-bar label
  `vitals.crewSafety` is written without the article ("Sicurezza equipaggio") so it fits on phones.
- **de** — Beobachtet (B) / Modelliert (M) / Spielannahme (S); "Regolithwall" for berm.
  Long compounds wrap in narrow panels.
- **ru** — Наблюдение (Н) / Модель (М) / Игровое допущение (И); full plural forms (one/few/many);
  four-digit numbers without separator ("2613"), a no-break space from five digits ("20 000");
  Latin unit symbols (see above).
- **tr** — Gözlenen (G) / Modellenen (M) / Oyun varsayımı (V); the percent sign comes first
  ("%42"; an invisible word joiner keeps "−%15" together on one line). Sentences were built so
  that no case suffix follows a `{placeholder}` (a suffix such as
  ’e/’a depends on the number or name that is filled in), which sometimes makes the order unusual.
- **vi** — Quan sát (Q) / Mô hình (M) / Giả định trò chơi (G); regolith kept with an explanation.
- **zh-Hans** — 观测（观）/ 模型（模）/ 游戏设定（设）; full-width punctuation; counters added after
  numbers where Chinese needs them (e.g. 个, 块).
- **ja** — 観測（観）/ モデル（モ）/ ゲーム上の仮定（仮）; counters where needed. Conversational
  texts use です/ます; facts, task lines and report rows use the plain form (〜する。) — about 60 keys.
  Please say if one register throughout would read better.
- **ko** — 관측(관) / 모델(모) / 게임 가정(가). No particle (은/는, 이/가, 을/를) directly after a
  `{placeholder}`, because the right particle depends on the filled-in word. `.simple` texts use
  해요체; other texts use both 해요체 and 합니다체, and 5 keys mix them inside one text
  (`app.description`, `app.sceneUnavailable`, `help.p1.detailed`, `help.p2.detailed`,
  `sources.modelled.text`) — please make the register consistent if that reads oddly.
- **hi** — अवलोकित (अ) / मॉडल आधारित (म) / खेल की धारणा (ख); Western digits 0–9 (decision);
  sentence end "।"; common English loanwords (रोवर, पैराशूट, बैटरी) kept, with Hindi in brackets
  where helpful.
- **ar** — مرصود (ر) / مُنمذَج (ن) / افتراض اللعبة (ف); right-to-left; Western digits 0–9 (decision);
  six plural forms (zero/one/two/few/many/other); "نحو" is used for "about/~"; arrows written ← ↖;
  the chart axis label is "س{sol}". Numbers, ratios and percentages are kept left-to-right by the app.
