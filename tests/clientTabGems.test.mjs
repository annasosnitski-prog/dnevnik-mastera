import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Каркас вкладок вынесен в общий модуль (PR «карточка клиента ↔ Личный
// кабинет мастера») — используется и DetailScreen'ом, и MasterDashboardScreen
// (TattoDiary.tsx), поэтому сама sprite-математика теперь читается оттуда, а
// не из DetailScreen.tsx.
const tabBarModule = readFileSync(
  new URL('../src/components/client/ClientCardTabBar.tsx', import.meta.url),
  'utf8',
);
const detailScreen = readFileSync(
  new URL('../src/components/screens/DetailScreen.tsx', import.meta.url),
  'utf8',
);
const tattoDiary = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
const gemSprite = readFileSync(new URL('../public/gem-icons.svg', import.meta.url), 'utf8');
const navFab = readFileSync(new URL('../src/components/navigation/NavFab.tsx', import.meta.url), 'utf8');
const pendantIcon = readFileSync(new URL('../src/components/navigation/PendantIcon.tsx', import.meta.url), 'utf8');
const designTokens = readFileSync(new URL('../src/components/ui/designTokens.ts', import.meta.url), 'utf8');
const indexCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('each client tab crops exactly one tile from the shared gemstone sprite', () => {
  assert.doesNotMatch(tabBarModule, /gem-icons\.svg#/);
  assert.match(tabBarModule, /backgroundImage: 'url\(\/gem-icons\.svg\)'/);
  assert.match(tabBarModule, /backgroundSize: `\$\{GEM_SIZE \* 6\}px \$\{GEM_SIZE\}px`/);
  // Слот спрайта берётся прямо из kind — отдельного gemKind больше нет
  // (см. следующий тест: подмену камней Инфо/Проекты убрали в #238).
  assert.match(tabBarModule, /backgroundPosition: `\$\{-GEM_INDEX\[kind\] \* GEM_SIZE\}px 0`/);
});

// Раньше карточка клиента (и только она) меняла местами камни Инфо и Проекты
// — clientOrnateGemKind + признак clientTabs по ariaLabel. Переход на круглые
// gem-вкладки (#238) эту подмену убрал, и последующая доводка той же визуалки
// (#243, #244) её не возвращала: теперь каждая вкладка везде показывает
// собственный камень, а карточка клиента и Личный кабинет ничем не отличаются.
// Тест до этого продолжал требовать удалённую функцию и висел красным.
test('every tab keeps its own gem — no client-card-only Инфо/Проекты swap', () => {
  assert.doesNotMatch(tabBarModule, /clientOrnateGemKind/);
  assert.doesNotMatch(tabBarModule, /gemKind/);
  // Никакого спец-кейса по ariaLabel: каркас одинаков для карточки клиента
  // и Личного кабинета.
  assert.doesNotMatch(tabBarModule, /ariaLabel === 'Разделы клиента'/);
  // Цвет и Минимализм-иконка по-прежнему ключуются от kind.
  assert.match(tabBarModule, /const color = GEM_COLOR\[kind\];/);
  assert.match(tabBarModule, /<ClientTabIcon name=\{kind\} size=\{26\} \/>/);
});

test('all six tabs keep the same order as the six tiles in gem-icons.svg', () => {
  assert.match(
    tabBarModule,
    /const GEM_INDEX: Record<ClientTabIconName, number> = \{\s*sessions: 0,\s*consultations: 1,\s*content: 2,\s*notes: 3,\s*info: 4,\s*projects: 5,/s,
  );

  assert.match(gemSprite, /width="384"[\s\S]*height="64"[\s\S]*viewBox="0 0 384 64"/);
  assert.match(gemSprite, /id="sessions-icon"/);
  assert.match(gemSprite, /id="consultations-icon"[\s\S]*transform="translate\(64 0\)"/);
  assert.match(gemSprite, /id="content-icon"[\s\S]*transform="translate\(128 0\)"/);
  assert.match(gemSprite, /id="notes-icon"[\s\S]*transform="translate\(192 0\)"/);
  assert.match(gemSprite, /id="info-icon"[\s\S]*transform="translate\(256 0\)"/);
  assert.match(gemSprite, /id="projects-icon"[\s\S]*transform="translate\(320 0\)"/);
});

test('toolbar and client tabs share one semantic colour palette', () => {
  assert.match(designTokens, /clients: '#008A5A'/);
  assert.match(designTokens, /personal: '#C99516'/);
  assert.match(designTokens, /content: '#7935B2'/);
  assert.match(designTokens, /projects: '#1448A7'/);
  assert.match(designTokens, /notes: '#D45A1F'/);
  assert.match(designTokens, /admin: '#B01236'/);

  assert.match(navFab, /label: "Проекты"[\s\S]*?color: TERRITORY_COLORS\.projects/);
  assert.match(tabBarModule, /sessions: TERRITORY_COLORS\.admin/);
  assert.match(tabBarModule, /consultations: TERRITORY_COLORS\.clients/);
  assert.match(tabBarModule, /info: TERRITORY_COLORS\.personal/);
  assert.match(tabBarModule, /projects: TERRITORY_COLORS\.projects/);
  assert.doesNotMatch(tabBarModule, /clientOrnateGemKind|gemKind/);
});

test('toolbar stones render optical depth below the crown without extra blur filters', () => {
  assert.match(pendantIcon, /data-optical-layer="pavilion-depth"/);
  assert.match(pendantIcon, /data-optical-layer="pavilion-facets"/);
  assert.match(pendantIcon, /data-optical-layer="internal-caustic"/);
  assert.match(pendantIcon, /data-optical-layer="internal-reflection"/);
  assert.match(pendantIcon, /data-optical-layer="surface-lens"/);
  assert.match(pendantIcon, /data-optical-layer="refracted-girdle"/);
  assert.match(pendantIcon, /const pavilionFocus: \[number, number\] = \[cx \+ 4\.6, cy \+ 5\.2\]/);
  assert.match(pendantIcon, /strokeWidth="1\.65"/);
  assert.match(pendantIcon, /id=\{depthCaustic\}[\s\S]*crisp vector caustic|crisp vector caustic[\s\S]*id=\{depthCaustic\}/);
});

test('ornate tabs use the main-button gold material and a one-sixth centre stone', () => {
  assert.match(gemSprite, /id="gold-face"[\s\S]*stop-color="#FFF8D7"[\s\S]*stop-color="#B88B32"[\s\S]*stop-color="#E2B655"[\s\S]*stop-color="#431A00"/);
  assert.doesNotMatch(pendantIcon, /#C77A14|#EFAD3C|#B45F0B|#F1B54A/);
  assert.doesNotMatch(gemSprite, /#C77A14|#EFAD3C|#B45F0B|#F1B54A/);
  assert.match(gemSprite, /id="gold-medallion"[\s\S]*scale\(\.724138\)[\s\S]*r="29" fill="url\(#gold-face\)"/);
  assert.equal((gemSprite.match(/r="5\.333333"/g) ?? []).length, 3);
  assert.match(gemSprite, /id="sessions-icon" color="#B01236"/);
  assert.match(gemSprite, /id="consultations-icon" color="#008A5A"/);
  assert.match(gemSprite, /id="info-icon" color="#C99516"/);
  assert.match(gemSprite, /id="content-icon" color="#7935B2"/);
  assert.match(gemSprite, /id="projects-icon" color="#1448A7"/);
});

test('tab names stay accessible without browser-native tooltip boxes', () => {
  assert.match(tabBarModule, /aria-label=\{tab\.label\}/);
  assert.doesNotMatch(tabBarModule, /title=\{tab\.label\}/);
});

test('tab medallions shrink inside their fixed slots without an active underline', () => {
  assert.match(tabBarModule, /const GEM_SIZE = 54/);
  assert.match(tabBarModule, /width: GEM_SIZE,[\s\S]*height: GEM_SIZE/);
  assert.doesNotMatch(tabBarModule, /borderBottom:\s*isActive/);
  assert.doesNotMatch(tabBarModule, /tabButtonStyle\(activeTab === tab\.id\)/);
});

test('client tabs hang from a gold tube carrying the client-colour reflection', () => {
  assert.match(detailScreen, /boxSizing: 'border-box',[\s\S]*height: 5,[\s\S]*borderRadius: 999/);
  assert.match(detailScreen, /#FFD777[\s\S]*#FFF8D7[\s\S]*#431A00/);
  assert.match(detailScreen, /color-mix\(in srgb, \$\{client\.color\}[\s\S]*mixBlendMode: 'screen'/);
  assert.match(detailScreen, /0 0 3px rgba\(255,215,119,\.42\)/);
});

test('gold tube separators stay centred between neighbouring medallions at any tab count', () => {
  assert.match(detailScreen, /data-tube-dividers[\s\S]*left: 8,[\s\S]*right: 8,[\s\S]*top: '50%'/);
  assert.match(detailScreen, /CLIENT_TABS\.slice\(0, -1\)\.map/);
  assert.match(detailScreen, /data-tube-divider=\{index \+ 1\}/);
  assert.match(detailScreen, /\(\(index \+ 1\) \/ CLIENT_TABS\.length\) \* 100/);
  assert.match(detailScreen, /width: 5\.5,[\s\S]*height: 5\.5,[\s\S]*borderRadius: '50%'/);
  assert.match(detailScreen, /#FFFDF0[\s\S]*#FFD777[\s\S]*#B88B32[\s\S]*#431A00/);
  assert.match(detailScreen, /0 0 4px rgba\(255,215,119,\.36\)/);
});

test('tube light falls onto the pendant hardware and upper crown', () => {
  assert.match(tabBarModule, /className="client-card-tabbar__bail"/);
  assert.match(tabBarModule, /className="client-card-tabbar__medallion"/);
  assert.match(indexCss, /\.client-card-tabbar__jump-ring[\s\S]*drop-shadow\(0 -1px 1px rgba\(255, 215, 119, 0\.58\)\)/);
  assert.match(indexCss, /\.client-card-tabbar__bail[\s\S]*drop-shadow\(0 -1px 0\.8px rgba\(255, 240, 179, 0\.42\)\)/);
  assert.match(gemSprite, /data-tube-reflection="ambient"[\s\S]*data-tube-reflection="highlight"/);
});

test('every centre stone emits its own colour and the active stone intensifies', () => {
  assert.match(tabBarModule, /className=\{active[\s\S]*client-card-tabbar__gem-glow--active[\s\S]*--gem-glow-color/);
  assert.match(indexCss, /\.client-card-tabbar__gem-glow[\s\S]*z-index: 3[\s\S]*var\(--gem-glow-color\) 58%[\s\S]*mix-blend-mode: screen[\s\S]*opacity: 0\.7/);
  assert.match(indexCss, /\.client-card-tabbar__gem-glow--active[\s\S]*width: 29px[\s\S]*opacity: 1[\s\S]*var\(--gem-glow-color\) 78%/);
  assert.match(tabBarModule, /client-card-tabbar__pendulum[\s\S]*client-card-tabbar__gem-glow[\s\S]*client-card-tabbar__medallion/);
});

test('active medallion halo rises into the tube glow without following the pendulum swing', () => {
  assert.match(tabBarModule, /active && \([\s\S]*className="client-card-tabbar__active-halo"[\s\S]*--active-gem-color/);
  assert.match(indexCss, /\.client-card-tabbar__marker[\s\S]*isolation: isolate/);
  assert.match(indexCss, /\.client-card-tabbar__pendulum[\s\S]*z-index: 1/);
  assert.match(indexCss, /\.client-card-tabbar__active-halo[\s\S]*z-index: 0[\s\S]*top: -17px[\s\S]*ellipse 29px 34px at 50% 50%[\s\S]*ellipse 13px 39px at 50% 0%/);
  assert.match(indexCss, /\.client-card-tabbar__active-halo[\s\S]*var\(--active-gem-color\) 52%[\s\S]*rgba\(255, 248, 215, 0\.22\)[\s\S]*rgba\(255, 215, 119, 0\.14\)/);
  assert.match(tabBarModule, /client-card-tabbar__active-halo[\s\S]*<GemJumpRing active=\{active\} \/>[\s\S]*client-card-tabbar__pendulum/);
});

test('shared sky keeps irregular stars without a repeating dot grid', () => {
  assert.match(tattoDiary, /<StarfieldBackground \/>/);
  assert.doesNotMatch(tattoDiary, /backgroundSize: '22px 22px'/);
  assert.doesNotMatch(tattoDiary, /rgba\(var\(--gold-rgb\),0\.035\) 1px/);
});

test('jump-ring is threaded through the tube and swivels through a true profile', () => {
  assert.match(tabBarModule, /function GemJumpRing\(\{ active \}: \{ active: boolean \}\)[\s\S]*viewBox="0 0 18 14"/);
  assert.match(tabBarModule, /Rear wire:[\s\S]*Front wire:/);
  assert.match(tabBarModule, /function GemBail\(\)[\s\S]*d="M9 1 C8\.8 4\.2 6\.5 7\.2 6\.2 11\.8/);
  assert.doesNotMatch(tabBarModule, /width: 1\.4,[\s\S]*height: 8/);
  assert.match(tabBarModule, /<GemJumpRing active=\{active\} \/>[\s\S]*className=\{active \? 'client-card-tabbar__pendulum pendant-swing'/);
  assert.doesNotMatch(tabBarModule, /client-card-tabbar__marker pendant-swing/);
  assert.match(indexCss, /@keyframes jump-ring-swivel[\s\S]*rotateY\(58deg\)[\s\S]*rotateY\(88deg\)[\s\S]*rotateY\(111deg\)/);
  assert.match(indexCss, /\.pendant-swing\s*\{[\s\S]*transform-origin: 50% 3px/);
});

// Вкладки Сессии/Консультации убраны: сессия и консультация живут внутри
// проекта, поэтому вход в работу — «Проекты», и она же стоит первой. Камни в
// спрайте при этом остались все шесть (см. GEM_INDEX выше) — просто карточка
// клиента показывает четыре из них.
test('the client card wires its four tabs, Проекты first, via the shared tab bar', () => {
  assert.match(detailScreen, /<ClientCardTabBar tabs=\{CLIENT_TABS\} activeTab=\{activeTab\} onTab=\{onTab\}/);
  const listMatch = detailScreen.match(/const CLIENT_TABS: ClientCardTabDef<[^>]+>\[\] = \[([\s\S]*?)\];/);
  assert.ok(listMatch, 'CLIENT_TABS array not found');
  const ids = [...listMatch[1].matchAll(/\{ id: '([^']+)', kind: '([^']+)'/g)].map(([, id, kind]) => [id, kind]);
  assert.deepEqual(ids, [
    ['projects', 'projects'],
    ['content', 'content'],
    ['extra', 'notes'],
    ['info', 'info'],
  ]);
  // Никакой вкладки-сессии/консультации в карточке не осталось.
  assert.doesNotMatch(listMatch[1], /kind: 'sessions'|kind: 'consultations'/);
});

test('Личный кабинет мастера reuses the same shared tab bar (Инфо/Проекты)', () => {
  assert.match(tattoDiary, /<ClientCardTabBar tabs=\{MASTER_TABS\} activeTab=\{tab\} onTab=\{setTab\}/);
  const listMatch = tattoDiary.match(/const MASTER_TABS: ClientCardTabDef<[^>]+>\[\] = \[([\s\S]*?)\];/);
  assert.ok(listMatch, 'MASTER_TABS array not found');
  const ids = [...listMatch[1].matchAll(/\{ id: '([^']+)', kind: '([^']+)'/g)].map(([, id, kind]) => [id, kind]);
  assert.deepEqual(ids, [
    ['info', 'info'],
    ['projects', 'projects'],
  ]);
});
