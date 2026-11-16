// teklapelletclassic-card: karta Lovelace WYŁĄCZNIE dla integracji TeklaPelletCAN (domena "teklapelletcan").
// Nie zgaduje encji po całym Home Assistant jak oryginalna pelletcan-card (entity_prefix/auto) – urządzenie
// znajduje przez rejestr urządzeń HA (identifiers[0] === "teklapelletcan"), więc nie myli się z ESPHome
// ani z innymi integracjami. Renderuje się przez silnik teklapelletclassic-engine.js (ta sama baza co pelletcan-card),
// żeby mieć 1:1 tę samą funkcjonalność (ekrany, PIN-y, grafiki), bez przepisywania 1500 linii renderowania.
// JEDYNY zasób dashboardu tej karty: ten plik sam dociąga silnik (dynamic import, ten sam katalog HACS) –
// nie trzeba osobno dodawać drugiego zasobu w Ustawienia → Panele → Zasoby.
// Konfiguracja: tylko urządzenie (gdy więcej niż jedno), grafiki (domyślnie pełne), obraz kotła, język, ekran startowy.
//
// PRAWDZIWE GRAFIKI PANELU (img_b64/*.b64, ta sama bitmapa co img/panel/*.png zakodowana base64) – zamiast
// rysowanych SVG/CSS tam, gdzie oryginalny panel IgneoTouch ma gotową bitmapę: kafelki pulpitu, obraz kotła/
// palnika, animacje wentylatora/podajnika/pompy/zapalarki, pasek i poziom paliwa, duże przyciski trybu pracy
// (off/eco/harmonogram/komfort - te jako wektor 1:1 wytrasowany z bitmapy, nie bitmapa), strzałki historii
// alarmów, suwaki trybu/wartości. Zob. też WZORZEC-SLIDER.md / WZORZEC-TRYB-OGRZEWANIA.md w repo TeklaPelletCAN
// (tools/, dokumentacja robocza tej karty) - skrót zasad geometrii suwaków i ikon trybu.
(async () => {
  const DIR = new URL('.', import.meta.url).pathname;
  if (!customElements.get('tekla-panel-card')) { try { await import(DIR + 'teklapelletclassic-engine.js'); } catch (e) { console.error('teklapelletclassic-card: nie udało się załadować silnika renderowania', e); } }
  await customElements.whenDefined('tekla-panel-card').catch(() => {});
  const Base = customElements.get('tekla-panel-card');
  if (!Base) { console.warn('teklapelletclassic-card: brak silnika renderowania (teklapelletclassic-engine.js)'); return; }
  for (let i = 0; i < 50 && !window.__igneoFind; i++) await new Promise(r => setTimeout(r, 100));
  const IF = window.__igneoFind || {};

  const DOMAIN = 'teklapelletcan';

  // Urządzenia TYLKO tej integracji (identifiers = [["teklapelletcan", device_id]]). hass.devices/hass.entities
  // są standardowo dostarczane każdej karcie przez frontend HA – nie trzeba żadnych dodatkowych uprawnień.
  function ourDevices(hass) {
    if (!hass || !hass.devices) return [];
    return Object.values(hass.devices)
      .filter(d => Array.isArray(d.identifiers) && d.identifiers.some(id => Array.isArray(id) && id[0] === DOMAIN))
      .map(d => ({ id: d.id, name: (d.name_by_user || d.name || d.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  function deviceEntityIds(hass, deviceId) {
    if (!hass || !hass.entities) return [];
    return Object.values(hass.entities).filter(e => e.device_id === deviceId).map(e => e.entity_id);
  }
  // prefiks encji tego konkretnego urządzenia, wyliczony tym samym algorytmem co oryginalna karta (kotwice
  // typu "..._poziom_dostepu"), ale ograniczony wyłącznie do encji należących do wybranego urządzenia.
  function prefixOf(hass, deviceId) {
    const ids = deviceEntityIds(hass, deviceId);
    if (!ids.length || typeof IF.devices !== 'function') return '';
    const d = IF.devices(ids);
    return d.length ? d[0].p : '';
  }

  class TeklaPelletCanCard extends Base {
    setConfig(c) {
      if (!c || typeof c !== 'object') throw new Error('Nieprawidłowa konfiguracja karty');
      this._tcfg = Object.assign({ grafiki: 'pelne', boiler_image: '13', screen: 'main', language: 'auto' }, c);
      this._resolvedDevId = undefined;   // wymusza ponowne rozwiazanie urzadzenia/prefiksu (ale nie na kazdym tyknieciu hass!)
      if (this._lastHass) this._apply(this._lastHass); else super.setConfig(this._innerConfig({}));
    }
    _innerConfig(extra) {
      const t = this._tcfg || {};
      return Object.assign({
        type: 'custom:pelletcan-card',
        service_domain: DOMAIN,
        screen: t.screen || 'main',
        language: t.language || 'auto',
        grafiki: t.grafiki === 'domyslne' ? 'domyslne' : 'pelne',
        boiler_image: ['11', '12', '13', '14'].includes(String(t.boiler_image)) ? String(t.boiler_image) : '13',
      }, extra);
    }
    // WAZNE: tekla-panel-card.setConfig() resetuje biezacy ekran karty (this._scr = ...screen...). Dlatego
    // setConfig wolno wywolac ponownie TYLKO gdy faktycznie zmienilo sie urzadzenie (albo konfiguracja karty
    // z edytora) – NIGDY przy zwyklym odswiezeniu stanow z HA (co ~2 s), bo inaczej kazde klikniecie w karcie
    // cofa sie po chwili do ekranu glownego (dokladnie taki byl zglaszany blad).
    _apply(hass) {
      const devs = ourDevices(hass);
      if (!devs.length) {
        this._resolvedDevId = null;
        this.innerHTML = '<ha-card><div style="padding:16px;color:var(--error-color,#db4437);font-size:14px;line-height:1.5">' +
          '<b>TeklaPelletCAN</b><br>Nie znaleziono żadnego urządzenia tej integracji. Dodaj ją w ' +
          '<b>Ustawienia → Urządzenia i usługi → Dodaj integrację → TeklaPelletCAN</b>.</div></ha-card>';
        return;
      }
      const want = this._tcfg && this._tcfg.device_id;
      const dev = (want && devs.find(d => d.id === want)) || devs[0];
      this._multi = devs.length > 1;
      this._devName = dev.name;
      if (dev.id !== this._resolvedDevId || this._resolvedCfg !== this._tcfg) {
        this._resolvedDevId = dev.id;
        this._resolvedCfg = this._tcfg;
        this._pf = prefixOf(hass, dev.id);   // raz na urzadzenie: nazwa encji sie nie zmienia w trakcie dzialania karty
        if (this._warnEl) { this._warnEl.remove(); this._warnEl = null; }
        super.setConfig(this._innerConfig(this._pf ? { entity_prefix: this._pf } : {}));
      }
      super.hass = hass;
      if (this._multi && !want && !this._warnEl) {
        this._warnEl = document.createElement('div');
        this._warnEl.style.cssText = 'font-size:11px;opacity:.65;text-align:center;padding:4px 0 0';
        this._warnEl.textContent = 'Wykryto kilka urządzeń TeklaPelletCAN – pokazuję „' + this._devName + '” (wybierz właściwe w ustawieniach karty).';
        this.appendChild(this._warnEl);
      }
    }
    set hass(h) { this._lastHass = h; if (this._tcfg) this._apply(h); }
    get hass() { return this._lastHass; }
    static getConfigElement() { return document.createElement('teklapelletclassic-card-editor'); }
    static getStubConfig() { return { screen: 'main', grafiki: 'pelne' }; }
  }

  // ==== PRAWDZIWE GRAFIKI PANELU - ladowanie assetow (img_b64/N.b64, ta sama bitmapa co img/panel/NNN.png).
  // HACS przy instalacji karty kopiuje lokalnie TYLKO plik JS - katalog img_b64/ (tak samo jak img/) nigdy
  // nie trafia na dysk HA, wiec pod /hacsfiles/ ladujemy z CDN (ten sam wzorzec co img/panel w
  // teklapelletclassic-engine.js); przy instalacji recznej (katalog obok pliku karty) - sciezka lokalna ====
  const B64_BASE = DIR.includes('/hacsfiles/') ? 'https://cdn.jsdelivr.net/gh/GieOeRZet/TeklaPelletClassic-card@main/img_b64/' : (DIR + 'img_b64/');
  const IMG_IDS = [3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 19, 20, 36, 37, 38, 40, 41, 42, 48, 49, 50, 51, 52, 53, 54, 65, 66, 67, 70, 75, 76, 77, 79, 102, 103, 104, 110, 112, 113, 114, 115, 117, 118, 119, 122, 128, 138, 139, 140, 141, 142, 143, 144, 148, 149, 150, 157, 160, 161, 163, 165, 167, 168, 169, 174, 184, 185];
  const ASSET_B64 = {};
  await Promise.all(IMG_IDS.map(async n => {
    try {
      const r = await fetch(B64_BASE + n + '.b64');
      const txt = (await r.text()).trim();
      ASSET_B64[n] = `data:image/png;base64,${txt}`;
    } catch (e) {
      console.error(`teklapelletclassic-card: nie udalo sie wczytac grafiki ${n}`, e);
      ASSET_B64[n] = '';
    }
  }));
  const U = n => ASSET_B64[n] || '';
  const K = 0.2083; // 1px panelu = 0.2083cqw (480px = 100cqw), jak w natywnym module
  const img = (n, st) => `<img src="${U(n)}" draggable="false" style="${st || ''}">`;
  const seq = (ns, w, h, on) => `<span class="sp ${on ? 'on' : ''}" style="width:${(w * K).toFixed(2)}cqw;height:${(h * K).toFixed(2)}cqw">${ns.map(n => img(n)).join('')}</span>`;
  // rozmiary obrazow kotla 11/12/14 (inne proporcje niz domyslny wbudowany box 16cqw dla typu 13) -
  // skala 1:1 jak w panelu (K), wysrodkowane w tym samym miejscu co domyslny .boil
  const BOIL_BS = { 11: [105, 126], 12: [100.4, 131.1], 14: [73.9, 136.9] };
  const boilNum = cfg => ['11', '12', '13', '14'].includes(String(cfg && cfg.boiler_image)) ? +cfg.boiler_image : 13;

  // ---- ikony trybu (off/eco/harmonogram/komfort) - WEKTORY zamiast bitmap 124/125/126/127/130/131/133/134
  // (potrace 1:1 ze zrodlowych bitmap panela); stan aktywny = TEN SAM kontur + filtr blur/glow (nie osobna,
  // wiekszym rozmyta bitmapa jak w oryginale, ale wizualnie bardzo zblizone i w pelni sterowalne kolorem przez fill) ----
  const MODE_ICON_D = {
    off: 'M2168 2393 c-9 -10 -19 -28 -22 -40 -4 -12 -20 -26 -36 -32 -17 -5 -30 -15 -30 -21 0 -6 -18 -28 -40 -50 -22 -22 -40 -48 -40 -60 0 -16 -6 -20 -35 -20 -30 0 -37 5 -52 38 -17 34 -21 37 -66 40 -52 3 -74 -8 -88 -45 -4 -12 -25 -31 -46 -40 l-38 -18 0 -105 0 -105 38 -18 c21 -10 41 -25 44 -35 14 -38 35 -52 84 -52 49 0 72 14 84 49 3 11 21 29 40 40 l34 20 3 103 c3 99 4 103 26 106 50 7 55 -11 49 -154 -6 -142 -3 -154 44 -154 45 0 51 18 50 156 -1 82 2 131 10 140 14 17 100 19 117 2 8 -8 12 -54 12 -143 0 -89 4 -135 12 -143 16 -16 63 -15 76 1 7 8 13 69 14 147 l3 133 30 17 c22 12 30 24 30 45 0 21 -8 33 -30 45 -33 18 -41 58 -15 70 49 23 55 29 55 55 0 58 -70 60 -96 3 -8 -18 -25 -38 -37 -44 -13 -7 -32 -25 -42 -42 -15 -24 -28 -31 -66 -37 -40 -6 -50 -4 -61 11 -16 22 -13 44 7 54 46 21 55 29 58 49 7 46 -49 69 -80 34z m-270 -255 c16 -16 16 -180 0 -196 -16 -16 -100 -16 -116 0 -7 7 -12 44 -12 98 0 54 5 91 12 98 7 7 33 12 58 12 25 0 51 -5 58 -12z M904 2119 c-18 -20 -19 -43 -22 -343 -3 -315 -2 -323 18 -349 30 -38 90 -38 119 -1 20 26 21 38 21 336 0 324 -4 356 -45 372 -33 12 -72 6 -91 -15z M694 2012 c-44 -14 -237 -195 -336 -316 -39 -47 -48 -65 -48 -96 0 -33 -7 -46 -41 -80 l-41 -40 4 -89 c3 -82 5 -90 34 -123 20 -22 34 -51 38 -79 4 -24 19 -60 34 -79 16 -19 38 -52 50 -73 56 -97 206 -230 289 -257 21 -7 62 -26 92 -41 52 -28 59 -29 195 -29 113 1 151 4 191 19 200 75 188 68 286 164 153 149 164 164 183 248 10 41 29 97 43 126 22 46 25 62 22 141 -4 76 -8 94 -31 128 -14 21 -32 59 -38 84 -21 79 -152 238 -254 307 -22 15 -58 41 -79 57 -31 25 -48 30 -90 31 -46 0 -53 -3 -65 -27 -19 -39 1 -77 49 -94 116 -39 298 -216 316 -306 3 -18 14 -52 25 -76 23 -54 25 -180 3 -221 -8 -16 -19 -57 -24 -91 -12 -72 -34 -110 -117 -199 -47 -51 -75 -71 -163 -113 l-106 -51 -122 -5 c-120 -4 -122 -4 -175 26 -29 16 -70 32 -91 35 -39 6 -75 32 -170 125 -53 52 -102 136 -147 253 -26 68 -28 82 -20 135 4 32 27 103 50 157 52 119 138 222 233 279 96 56 120 80 120 116 0 55 -35 74 -99 54z',
    eco: 'M1383 2162 c-6 -4 -16 -20 -22 -34 -6 -17 -26 -35 -48 -45 l-38 -18 0 -105 0 -105 38 -18 c22 -10 42 -28 48 -45 14 -36 25 -42 84 -42 55 0 75 12 75 46 0 32 -19 43 -85 46 -55 3 -60 5 -63 27 -6 39 21 51 114 51 74 0 84 2 98 22 9 13 16 43 16 70 0 45 -2 49 -40 73 -22 14 -40 32 -40 39 0 28 -30 46 -78 46 -26 0 -52 -4 -59 -8z m111 -88 c9 -3 16 -14 16 -24 0 -30 -28 -50 -70 -50 -22 0 -45 7 -54 16 -19 19 -21 50 -3 57 18 8 93 8 111 1z M1777 2152 c-9 -10 -17 -24 -17 -30 0 -7 -17 -23 -39 -36 l-38 -24 -7 -96 c-4 -53 -4 -101 -1 -106 4 -6 22 -17 41 -25 19 -8 38 -25 43 -37 14 -38 36 -49 88 -46 41 3 50 7 68 35 11 17 34 37 50 45 51 23 43 88 -12 88 -17 0 -30 -10 -44 -35 -19 -32 -25 -35 -68 -35 -26 0 -52 5 -59 12 -16 16 -16 180 0 196 7 7 33 12 59 12 43 0 49 -3 68 -35 14 -25 27 -35 44 -35 55 0 63 65 12 88 -16 8 -39 28 -50 45 -18 28 -27 32 -71 35 -39 2 -54 -1 -67 -16z M2177 2152 c-10 -10 -17 -24 -17 -31 0 -6 -16 -21 -36 -33 -43 -25 -54 -51 -54 -128 0 -77 11 -103 54 -128 20 -12 36 -28 36 -35 0 -27 35 -47 82 -47 45 0 68 14 81 52 3 10 23 25 44 35 l38 18 0 105 0 105 -38 18 c-21 10 -41 25 -44 35 -14 38 -36 52 -83 52 -33 0 -52 -6 -63 -18z m121 -94 c16 -16 16 -180 0 -196 -16 -16 -100 -16 -116 0 -7 7 -12 44 -12 98 0 54 5 91 12 98 7 7 33 12 58 12 25 0 51 -5 58 -12z M780 2115 c-23 -19 -47 -35 -54 -35 -23 0 -151 -98 -201 -153 -84 -94 -101 -118 -151 -222 l-49 -100 0 -195 c0 -171 2 -199 18 -230 11 -19 31 -65 47 -102 31 -76 57 -112 150 -207 84 -85 160 -139 236 -166 33 -13 76 -31 95 -41 28 -15 63 -19 196 -22 97 -3 182 0 215 7 62 14 214 76 243 100 11 10 38 29 60 43 22 14 62 45 88 68 43 38 48 47 45 79 -4 52 -46 72 -123 58 -42 -8 -73 -7 -118 2 -116 24 -222 63 -287 106 -83 54 -192 155 -221 203 -13 20 -32 49 -44 63 -12 15 -39 78 -59 140 -38 113 -38 114 -34 249 4 131 5 138 41 216 42 92 46 125 17 154 -29 29 -63 25 -110 -15z',
    auto: 'M1177 2161 c-39 -6 -72 -18 -100 -38 -23 -17 -53 -34 -67 -38 -44 -14 -165 -122 -241 -216 -19 -24 -57 -89 -84 -144 l-49 -100 0 -181 -1 -180 36 -70 c20 -38 40 -80 44 -94 18 -56 237 -284 288 -298 7 -2 48 -22 93 -43 76 -38 87 -40 201 -46 l121 -6 17 27 c16 24 16 28 1 51 -14 22 -24 25 -73 25 -50 0 -61 4 -90 32 -26 25 -45 33 -95 40 -37 5 -73 16 -88 28 -14 11 -41 29 -60 39 -95 52 -216 219 -229 315 -6 40 -15 64 -34 84 -57 60 -57 116 -1 183 26 31 34 50 34 79 0 96 94 227 242 338 45 35 69 45 118 52 41 6 76 19 107 39 64 43 128 43 194 0 32 -20 66 -32 103 -36 30 -3 66 -13 79 -22 67 -44 139 -105 169 -142 18 -23 47 -58 65 -78 24 -28 36 -56 47 -109 8 -39 26 -91 40 -115 20 -33 26 -58 26 -99 0 -63 14 -81 57 -76 19 2 32 12 42 32 21 44 -8 297 -38 335 -11 14 -33 49 -47 76 -37 69 -118 170 -158 194 -18 11 -41 30 -52 42 -10 12 -41 32 -69 45 -27 14 -70 36 -94 51 -41 25 -50 26 -220 29 -97 1 -202 -1 -234 -5z m115 -247 c-22 -15 -22 -18 -22 -263 0 -230 1 -251 19 -272 19 -23 24 -24 191 -27 185 -4 200 0 200 47 0 46 -14 51 -155 51 -89 0 -135 4 -143 12 -9 9 -12 73 -12 224 0 209 0 213 -22 228 -12 9 -25 16 -28 16 -3 0 -16 -7 -28 -16z M1848 1273 c-9 -10 -18 -27 -22 -39 -3 -11 -21 -27 -39 -35 -30 -13 -32 -17 -37 -78 -5 -61 -6 -64 -40 -80 l-35 -16 0 -91 c0 -95 -11 -124 -44 -124 -25 0 -41 -20 -41 -51 0 -61 64 -66 95 -6 11 21 30 40 42 43 12 3 31 21 42 40 l20 34 91 0 91 0 20 -34 c11 -19 30 -37 42 -40 12 -3 31 -22 42 -43 31 -60 95 -55 95 6 0 31 -16 51 -41 51 -33 0 -44 29 -44 124 l0 91 -35 16 c-34 16 -35 19 -40 80 -5 61 -7 65 -37 78 -22 10 -36 25 -43 47 -15 46 -54 59 -82 27z m60 -95 c7 -7 12 -36 12 -65 0 -51 1 -53 35 -67 27 -12 35 -21 35 -40 0 -34 -21 -42 -116 -40 -92 1 -104 5 -104 40 0 19 8 28 35 40 34 14 35 16 35 67 0 54 12 77 40 77 9 0 21 -5 28 -12z',
    comf: 'M2568 2313 c-9 -10 -19 -28 -22 -40 -4 -12 -20 -26 -36 -32 -17 -5 -30 -15 -30 -21 0 -6 -18 -28 -40 -50 -22 -22 -40 -48 -40 -59 0 -47 -62 -38 -76 10 -18 63 -70 64 -86 2 -15 -57 -57 -53 -81 8 -13 32 -20 39 -42 39 -22 0 -29 -7 -42 -40 -11 -27 -24 -42 -39 -46 -32 -8 -40 -47 -40 -194 l1 -125 28 -3 c52 -6 57 8 57 152 0 139 5 156 46 156 31 0 36 -23 33 -153 -4 -136 2 -157 41 -157 39 0 44 21 45 174 0 102 2 120 18 130 12 8 22 8 35 0 15 -10 17 -28 17 -130 1 -154 6 -174 45 -174 39 0 44 20 44 180 1 123 1 125 24 128 46 7 52 -10 52 -152 0 -139 5 -156 46 -156 37 0 43 21 46 161 l3 134 27 13 c16 7 33 22 38 33 11 19 2 31 -54 77 -26 21 -19 41 22 59 40 19 53 52 32 79 -17 19 -54 18 -72 -3z M876 2298 c-23 -36 -25 -167 -3 -201 24 -36 70 -37 93 -2 20 30 21 154 1 194 -17 36 -70 42 -91 9z M1383 2162 c-6 -4 -16 -20 -22 -34 -6 -17 -26 -35 -48 -45 l-38 -18 -3 -99 c-2 -59 1 -103 8 -110 5 -5 24 -15 42 -20 22 -8 35 -20 41 -41 13 -40 23 -45 82 -45 57 0 75 12 75 51 0 37 -17 47 -85 51 l-60 3 -3 85 c-4 127 -3 130 66 130 64 0 82 11 82 50 0 14 -5 31 -12 38 -13 13 -106 16 -125 4z M1696 2155 c-8 -8 -18 -24 -21 -35 -4 -11 -23 -28 -43 -38 l-37 -17 0 -105 0 -105 37 -17 c20 -10 39 -27 43 -38 12 -37 34 -50 85 -50 50 0 73 14 85 49 3 11 21 29 40 40 l35 20 0 101 0 100 -40 25 c-22 14 -40 31 -40 39 0 41 -110 65 -144 31z m122 -97 c16 -16 16 -180 0 -196 -16 -16 -100 -16 -116 0 -7 7 -12 44 -12 98 0 54 5 91 12 98 7 7 33 12 58 12 25 0 51 -5 58 -12z M351 2053 c-20 -16 -22 -25 -16 -52 9 -41 66 -106 104 -119 42 -15 75 5 79 46 4 39 -14 71 -60 106 -47 35 -80 41 -107 19z M793 1931 c-62 -14 -90 -25 -118 -49 -19 -18 -49 -39 -65 -47 -16 -8 -37 -29 -45 -45 -8 -16 -30 -46 -47 -66 -24 -27 -36 -56 -50 -117 -22 -103 -22 -151 0 -252 14 -63 27 -92 60 -135 23 -30 42 -58 42 -62 0 -4 24 -23 53 -42 28 -20 63 -45 77 -55 16 -13 60 -26 125 -37 95 -16 105 -16 198 1 83 15 104 23 139 52 23 19 54 41 70 49 15 8 35 28 43 44 8 16 29 45 46 64 24 28 34 55 51 136 20 91 20 108 9 176 -18 105 -38 158 -71 188 -16 14 -36 41 -44 60 -8 20 -24 37 -38 41 -12 4 -39 23 -60 42 -30 30 -50 38 -125 54 -107 22 -144 22 -250 0z M156 1541 c-105 -15 -100 -118 7 -123 120 -6 167 12 167 62 0 51 -70 76 -174 61z M1567 1540 c-42 -13 -57 -29 -57 -61 0 -46 39 -64 128 -62 89 2 122 19 122 63 0 20 -7 34 -22 44 -29 17 -134 27 -171 16z M395 1049 c-66 -58 -83 -117 -41 -144 34 -22 70 -10 122 40 35 33 44 48 44 76 0 44 -15 59 -57 59 -22 0 -44 -10 -68 -31z M1332 1068 c-7 -7 -12 -27 -12 -45 0 -66 109 -150 159 -124 46 25 31 93 -33 149 -39 34 -91 43 -114 20z M876 868 c-11 -16 -16 -46 -16 -103 0 -94 15 -125 60 -125 45 0 60 31 60 125 0 94 -15 125 -60 125 -18 0 -34 -8 -44 -22z'
  };
  let modeIconSeq = 0;
  const modeIconSvg = (type, active, dxCqw, sizeCqw) => {
    const d = MODE_ICON_D[type];
    const sz = sizeCqw ? `width:${sizeCqw}cqw;height:${(sizeCqw * 296 / 280).toFixed(2)}cqw;flex:none;` : 'width:100%;height:100%;';
    const tf = dxCqw ? `transform:translateX(${dxCqw}cqw)` : '';
    if (!active) return `<svg viewBox="0 0 280 296" style="${sz}display:block;${tf}"><g transform="translate(0,296) scale(0.1,-0.1)" fill="#fff"><path d="${d}"/></g></svg>`;
    const id = 'pcg' + (modeIconSeq++);
    return `<svg viewBox="0 0 280 296" style="${sz}display:block;overflow:visible;${tf}"><defs><filter id="${id}" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#${id})" transform="translate(0,296) scale(0.1,-0.1)" fill="#fff"><path d="${d}"/></g></svg>`;
  };
  const MODE_TYPE = sup => sup === 'off' ? 'off' : sup === 'eco' ? 'eco' : sup === 'comf' ? 'comf' : 'auto';

  // ---- stale wzorca suwaka trybu/przelacznika on-off ----
  const KNOB_R_CQW = 3.25, OVERFLOW_PX = 1.5; // promien galki (.sl i margin-left:-3.25cqw) / nadwieszenie krawedzi na skrajach
  const MX = [28, 42.5, 57, 71.5]; // musi byc zgodne z MX w tekla-panel-card.js (_bDlg/_cDlg)
  const MX_TX = MX[0], MX_TW = MX[3] - MX[0];
  const PS4 = [0, 1 / 3, 2 / 3, 1];
  const slotExpr = (t, tw, tx = 0) => {
    const leftCqw = KNOB_R_CQW, leftPx = -OVERFLOW_PX;
    const rightCqw = tw - KNOB_R_CQW, rightPx = OVERFLOW_PX;
    const cqw = tx + leftCqw + t * (rightCqw - leftCqw);
    const px = leftPx + t * (rightPx - leftPx);
    return px === 0 ? `${cqw.toFixed(3)}cqw` : `calc(${cqw.toFixed(3)}cqw ${px >= 0 ? '+' : '-'} ${Math.abs(px).toFixed(3)}px)`;
  };
  // cmslide w bazowej karcie liczony na INNEJ geometrii (x=24,w=52) niz ikony (MX) - CM_RAW_PS to 4
  // "surowe" wartosci p jakie oryginalny kod moze zwrocic (do rozpoznania trybu), finalna pozycja i tak
  // liczona na wspolnej bazie MX_TX/MX_TW (wzorzec)
  const CM_RAW_PS = [0, 1, 2, 3].map(i => (MX[i] - 24) / 52);
  const nearestOf = (arr, p) => { let bi = 0, bd = 2; arr.forEach((v, i) => { const d = Math.abs(v - p); if (d < bd) { bd = d; bi = i; } }); return bi; };

  // ---- CSS: tla kafelkow nawigacji (73-76), boksy zadanej/harmonogramu (.tag/.box = 006/007), suwaki ----
  const oCss = Base.prototype._css;
  TeklaPelletCanCard.prototype._css = function () {
    const bt = BOIL_BS[boilNum(this._cfg)];
    const boilCss = bt ? `.boil{width:${(bt[0] * K).toFixed(2)}cqw!important;left:${(15 - bt[0] * K / 2).toFixed(2)}cqw!important;top:${(35.5 - bt[1] * K).toFixed(2)}cqw!important;height:auto!important}` : '';
    return oCss.call(this) + boilCss + `
      .sp{position:relative;display:inline-block;line-height:0}.sp img,.mbs{mix-blend-mode:screen}.sp img{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0}.sp img:first-child{opacity:1}
      .sp.on img{animation:spfr .45s linear infinite}.sp.on img:nth-child(2){animation-delay:.15s}.sp.on img:nth-child(3){animation-delay:.3s}
      @keyframes spfr{0%,33.3%{opacity:1}33.4%,100%{opacity:0}}.sp.on img:first-child{opacity:0}
      .sq{position:relative;display:inline-block;line-height:0}.sq img{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;mix-blend-mode:screen;animation:spf4 2s linear infinite}.sq img:nth-child(2){animation-delay:.5s}.sq img:nth-child(3){animation-delay:1s}.sq img:nth-child(4){animation-delay:1.5s}
      @keyframes spf4{0%,25%{opacity:1}25.01%,100%{opacity:0}}
      .ftk.pk{background:url(${U(54)}) 0 0/100% 100% no-repeat!important;border:0!important}.ftk.pk .fth,.ftk.pk .fhd{display:none}
      .cell{background:url(${U(76)}) center/100% 100% no-repeat!important;border-left:.3cqw solid #5a5e65!important}
      .cell:has(.ind){background:url(${U(75)}) center/100% 100% no-repeat!important}
      .ind{background:transparent!important;box-shadow:none!important}
      .ind.g{background:#86e61f!important;box-shadow:0 0 1.4cqw #86e61f!important}
      .ind.gb{animation:ignb 3s ease-in-out infinite}
      .ind.y{background:#ece23a!important;box-shadow:0 0 1.4cqw #ece23a!important}
      .ind.w{background:#cfe0ff!important;box-shadow:0 0 1.2cqw #9fc0ff!important}
      .ind.pulse{background:#FBAD32!important;box-shadow:0 0 1.4cqw #FBAD32!important;animation:indpulse 1.1s steps(1) infinite}
      .ind.pulse-g{background:#86e61f!important;box-shadow:0 0 1.4cqw #86e61f!important;animation:indpulse 1.1s steps(1) infinite}
      .ind.pulse-r{background:#ff3b30!important;box-shadow:0 0 1.4cqw #ff3b30!important;animation:indpulse 1.1s steps(1) infinite}
      @keyframes indpulse{50%{opacity:.12}}
      .bbar{background:linear-gradient(#787d86,#424242)!important}
      .screen{background:#282828!important}
      .s-main,.s-water,.s-heat,.s-burn,.s-alarm,.is-sub{background:#282828!important}
      .tgq,.row .tgq{background:#4a4e55 url(${U(184)}) 0 0/100% 100% no-repeat!important;box-shadow:none!important;border-radius:999px!important;height:auto!important;aspect-ratio:45/20}
      .tgq.on,.row .tgq.on{background-image:url(${U(185)})!important}
      .tgq::before,.tgq::after,.row .tgq::before,.row .tgq::after{display:none!important}
      .row .tgq:not(.on)::after,.row .tgq.on::before,.row .tgq:not(.on)::before,.row .tgq.on::after{content:none!important;display:none!important;border:0!important;width:0!important;height:0!important}
      .tgq i,.row .tgq i{display:block!important;position:absolute!important;top:50%!important;height:130%!important;width:auto!important;aspect-ratio:1/1;left:22.222%!important;right:auto!important;margin:0!important;transform:translate(-50%,-50%);background:url(${U(70)}) center/100% 100% no-repeat!important;border-radius:0!important}
      .tgq.on i,.row .tgq.on i{left:77.778%!important;right:auto!important}
      .sl[data-act="slider"],.sl[data-act="bmslide"],.sl[data-act="cmslide"]{background:url(${U(163)}) center/100% 100% no-repeat!important;box-shadow:none!important}
      .sl[data-act="slider"] b,.sl[data-act="bmslide"] b,.sl[data-act="cmslide"] b{background-image:url(${U(165)})!important;background-repeat:no-repeat!important}
      .sl[data-act="slider"] i{width:3.9cqw!important;height:3.9cqw!important;margin-left:-1.95cqw!important;top:-0.85cqw!important;border-radius:999px!important;background:url(${U(70)}) center/100% 100% no-repeat!important;box-shadow:none!important}
      .tag{background:url(${U(6)}) center/100% 100% no-repeat!important;border:0!important}
      .tag:active{background-image:url(${U(7)})!important}
      .box{background:url(${U(6)}) center/100% 100% no-repeat!important;border:0!important}
      .box:active{background-image:url(${U(7)})!important}
      .qok{background:url(${U(110)}) center/100% 100% no-repeat!important;border:0!important;border-radius:0!important;box-shadow:none!important;color:transparent!important}
      .bpm{background:url(${U(104)}) center/35% 35% no-repeat,url(${U(168)}) center/100% 100% no-repeat!important;border:0!important;border-radius:0!important;box-shadow:none!important}
      .bpm.pl{background:url(${U(119)}) center/35% 35% no-repeat,url(${U(168)}) center/100% 100% no-repeat!important}
      .bpm:active{background-image:url(${U(104)}),url(${U(169)})!important}
      .bpm.pl:active{background-image:url(${U(119)}),url(${U(169)})!important}
      .alar.bk{background:url(${U(168)}) center/100% 100% no-repeat!important;border:0!important;box-shadow:none!important}
      .alar.bk:active{background-image:url(${U(169)})!important}
      .alar.bk img{width:45%;height:45%;object-fit:contain;display:block;margin:auto}
      .bpm:not(.sm){background:url(${U(102)}) center/100% 100% no-repeat!important}
      .bpm:not(.sm):active{background-image:url(${U(103)})!important}
      .bpm.pl:not(.sm){background:url(${U(117)}) center/100% 100% no-repeat!important}
      .bpm.pl:not(.sm):active{background-image:url(${U(118)})!important}
      .bpm i,.bpm i+i{display:none!important}
      .sl{border-radius:0!important}
      .sl[data-act="bslide"],.sl[data-act="cslide"],.sl[data-act="spslide"]{background:url(${U(163)}) center/100% 100% no-repeat!important;box-shadow:none!important}
      .sl[data-act="bslide"] b,.sl[data-act="cslide"] b,.sl[data-act="spslide"] b{background-image:url(${U(167)})!important;background-repeat:no-repeat!important}
      .sl[data-act="prslide"],.sl[data-act="q2slide"]{background:url(${U(163)}) center/100% 100% no-repeat!important;box-shadow:none!important}
      .sl.sl-v b{background-image:url(${U(165)})!important;background-repeat:no-repeat!important}
      .sl.sl-t b{background-image:url(${U(167)})!important;background-repeat:no-repeat!important}
      .tag .chipb{display:block;width:7cqw;height:3cqw;background-repeat:no-repeat;background-size:129.6% 336.4%;background-position:50% 50%;align-self:flex-start;margin-top:1.2cqw}
      .cell[data-go=heat]>.radi{top:5.47cqw;left:calc(50% + -0.56cqw);display:block}.cell[data-go=heat] .radi svg{width:5.02cqw!important;height:6.14cqw!important;display:block}
      .cell[data-go=heat] .radi img{width:6.99cqw!important;height:6.14cqw!important;display:block}
      .cell[data-go=heat] .radi sup{right:auto;left:calc(100% + .9cqw);top:-.1cqw;font-size:2.7cqw;line-height:1}
      .cell>svg,.cell>img,.cell>.radi{position:absolute!important;left:50%;margin:0!important;transform:translateX(-50%)}
      .cell[data-act=fuel]>svg,.cell[data-act=fuel]>img{width:6.66cqw!important;height:5.52cqw!important;top:6.75cqw;left:calc(50% + 0.04cqw)}
      .cell[data-go=water]>svg.ic2,.cell[data-go=water]>img.ic2{width:6.83cqw!important;height:7.32cqw!important;top:4.88cqw;left:calc(50% + 0.16cqw)}
      .cell[data-act=quick]>svg.ic2,.cell[data-act=quick]>img.ic2{width:7.59cqw!important;height:7.41cqw!important;top:4.88cqw;left:calc(50% + 0.24cqw)}
      .rad{display:flex!important}
      .tr .tb{background:url(${U(19)}) 0 0/100% 100% no-repeat!important;border:0!important;border-radius:0!important;width:6.25cqw!important;height:6.46cqw!important}
      .tr .tb.ck{background-image:url(${U(20)})!important}
      .tr .tb svg{display:none!important}
      .bpm:not(.sm){left:calc(20.25cqw - 1.5px)!important;width:calc(29.75cqw + 1.5px)!important}
      .bpm.pl:not(.sm){left:50cqw!important;width:calc(29.75cqw + 1.5px)!important}
      .tg{background:#4a4e55 url(${U(184)}) 0 0/100% 100% no-repeat!important;box-shadow:none!important;border-radius:999px!important;height:auto!important;aspect-ratio:45/20;width:7.4cqw!important}
      .tg.on{background-image:url(${U(185)})!important}
      .tg i{position:absolute!important;top:50%!important;height:130%!important;width:auto!important;aspect-ratio:1/1;left:22.222%!important;right:auto!important;margin:0!important;transform:translate(-50%,-50%);background:url(${U(70)}) center/100% 100% no-repeat!important;border-radius:0!important}
      .tg.on i{left:77.778%!important;right:auto!important}
      .h2{background:url(${U(79)}) center/100% 100% no-repeat!important;height:9.37cqw!important}
      .brow{background:#424242!important}
      .brow>div{border-left:.3cqw solid #5a5e65!important;background:linear-gradient(#5a5e65,#3d4147)!important}
      .brow .cg{background:url(${U(160)}) center/100% 100% no-repeat!important}
      .brow .cg:active{background-image:url(${U(161)})!important}
      .qbg{background:url(${U(114)}) center/100% 100% no-repeat!important;border:0!important;border-radius:0!important;box-shadow:none!important;position:relative;overflow:hidden}
      .qbg::before,.qbg::after{content:'';position:absolute;top:0;height:100%;aspect-ratio:10/242;background:center/100% 100% no-repeat}
      .qbg::before{left:0;background-image:url(${U(112)})}
      .qbg::after{right:0;background-image:url(${U(113)})}
      .qd{background:rgba(26,28,31,.75)!important}
    `;
  };

  // ---- wentylator (ekran Palnik) / podajnik (ekran Palnik + przycisk "podaj" w oknie paliwa) - prawdziwe
  // animowane bitmapy panela (8/9/10 wentylator, 36/37/38 podajnik) zamiast rysowanego SVG ----
  TeklaPelletCanCard.prototype._fan = function (spin) { return seq([8, 9, 10], 34, 27, spin); };
  TeklaPelletCanCard.prototype._augSvg = function (anim = true) { return seq([36, 37, 38], 34, 27, anim); };
  TeklaPelletCanCard.prototype._auger = function (n, run) {
    return run ? `<span class="augw">${seq(n === 2 ? [40, 41, 42] : [36, 37, 38], 34, 27, true)}</span>` : '';
  };

  // ---- okno paliwa: tlo zbiornika (54), pasek wypelnienia (48 podstawa + 49 wypelnienie wg %), linia
  // poziomu (50) - zamiast rysowanego SVG/CSS; strzalki +/- (fch) usuniete, bo juz sa na bitmapie 54 ----
  const oFuelDlg = Base.prototype._fuelDlg;
  TeklaPelletCanCard.prototype._fuelDlg = function () {
    let h = oFuelDlg.call(this);
    const W = (29 * K).toFixed(2), H = (155 * K).toFixed(2);
    h = h.replace('<div class="ftk">', '<div class="ftk pk">');
    h = h.replace(/<div class="fbar"><i style="height:([\d.]+)%"><\/i><\/div>/, (m, p) =>
      `<div style="position:absolute;left:9.7cqw;top:9.58cqw;width:${W}cqw;height:${H}cqw">${img(48, 'position:absolute;left:0;top:0;width:100%;height:100%')}<div style="position:absolute;left:0;right:0;bottom:0;height:${p}%;overflow:hidden">${img(49, `position:absolute;left:0;bottom:0;width:100%;height:${H}cqw`)}</div></div>`);
    h = h.replace(/<div class="fhn" style="top:([\d.]+)cqw"><\/div>/, (m, y) => `<img src="${U(50)}" draggable="false" style="position:absolute;left:11.6cqw;top:${(y - 21 * K).toFixed(2)}cqw;width:${(57 * K).toFixed(2)}cqw">`);
    return h.replace(/<svg viewBox="0 0 24 13" class="fch"[\s\S]*?<\/svg>/g, '');
  };

  // ---- zapalarka (grzalka) w trzeciej komorce paska ekranu Palnik: 65 zimna, 66 grzeje, 67 rozgrzana,
  // animacja 65-66-67-66 (2s) widoczna tylko gdy zapalarka faktycznie pracuje (burn_ign > 0) ----
  const oBurn = Base.prototype._burn;
  TeklaPelletCanCard.prototype._burn = function (ctx) {
    const h = oBurn.call(this, ctx), g = this._v('burn_ign');
    if (isNaN(g) || g <= 0) return h;
    const ic = `<span class="sq" style="width:${(34 * K).toFixed(2)}cqw;height:${(15 * K).toFixed(2)}cqw">${img(65)}${img(66)}${img(67)}${img(66)}</span>`;
    return h.replace('<div class="c"></div>', `<div class="c">${ic}</div>`);
  };

  // ---- obraz kotla (pulpit) i palnika (ekran Palnik) - prawdziwe bitmapy panela. Typ kotla WYBIERALNY
  // w edytorze karty (boiler_image: 11/12/13/14, domyslnie 13 - jak dotychczas) ----
  TeklaPelletCanCard.prototype._boilerMain = function (burning) {
    return `<img class="boil" alt="Tekla" src="${U(boilNum(this._cfg))}" draggable="false">`;
  };
  TeklaPelletCanCard.prototype._burner = function () {
    return `<img class="burn" alt="Palnik" src="${U(17)}" draggable="false">`;
  };

  // ---- animacja pracy pompy CO/CWU (kafelek "Ogrzewanie"/"Woda") - rotujaca strzalka obiegu (138-143,
  // 6 klatek) zamiast rysowanego SVG, ten sam wzorzec .sp co wentylator/podajnik ----
  TeklaPelletCanCard.prototype._pump = function (spin) {
    return seq([138, 139, 140, 141, 142, 143], 19, 19, spin);
  };

  // ---- strzalki historii alarmow (gora/dol) - prawdziwy guzik panela (168 normalny/169 wcisniety) +
  // ikony 5 (gora) / 3 (dol) zamiast niebieskiego gradientowego przycisku + SVG/znaku unicode ----
  const oAlarmPg = Base.prototype._alarmPg;
  TeklaPelletCanCard.prototype._alarmPg = function (back) {
    let h = oAlarmPg.call(this, back);
    return h.replace(/<div class="alar"([^>]*)>([\s\S]*?)<\/div>/g, (m, attrs, inner) => {
      const up = /alup|&#8963;|top:22cqw/.test(attrs + inner);
      return `<div class="alar bk"${attrs}>${img(up ? 5 : 3)}</div>`;
    });
  };

  // ---- znaczek AUTO/MAN w boksie zadanej - prawdziwe bitmapy 122/128 (wariant bez obwodki - ta jest dla listy wyboru) ----
  TeklaPelletCanCard.prototype._chipHtml = function (bm) {
    if (bm < 2) return `<span class="ck"><ha-icon icon="mdi:clock-outline"></ha-icon><sup>${bm ? 'M' : 'A'}</sup></span>`;
    return `<span class="chipb" style="background-image:url(${U(bm === 2 ? 122 : 128)})"></span>`;
  };

  // ---- zasobnik na pulpicie: dynamiczna ikona z kropkami z Base.prototype._hopper, bez nadpisywania (nie
  // zastepujemy statycznymi bitmapami - zasobnik ma wyswietlac rzeczywisty poziom paliwa na biezaco) ----

  // ---- os harmonogramu (0/6/12/18/24) - bitmapa 157 zamiast rysowanych kresek/cyfr (wysokosc dopasowana
  // do natywnych proporcji bitmapy 370x24px, kolor pasm dopasowany do czerwieni z instrukcji) ----
  TeklaPelletCanCard.prototype._sched = function (bands) {
    const X = h => 29 + h * 6.35;
    const bs = (bands || []).map(([a, b]) => `<rect x="${X(a).toFixed(1)}" y="9" width="${((b - a) * 6.35).toFixed(1)}" height="14" fill="#e2231a"/>`).join('');
    return `<svg viewBox="0 0 205 56" preserveAspectRatio="none" class="sched"><rect x="27" y="20" width="155" height="3" fill="#e2231a"/>${bs}<image href="${U(157)}" x="22" y="30.7" width="163" height="10.6"/></svg>`;
  };

  // ---- grzejnik na ekranie "Ogrzewanie" - prawdziwa konstrukcja z bitmap panela (148 lewy kraniec z
  // przylaczami, 149 powtarzalne zebro x9, 150 prawy kraniec) zamiast rysowanego SVG; bitmapy maja
  // teraz prawdziwa przezroczystosc tla (usunieta kluczem koloru z oryginalnego RGB(41,40,41)) ----
  TeklaPelletCanCard.prototype._rad = function () {
    const mid = Array(9).fill(`<img src="${U(149)}" draggable="false" style="height:100%;width:auto;display:block">`).join('');
    return `<span class="rad"><img src="${U(148)}" draggable="false" style="height:100%;width:auto;display:block">${mid}<img src="${U(150)}" draggable="false" style="height:100%;width:auto;display:block"></span>`;
  };

  // ---- wzorzec dla WSZYSTKICH suwakow trybu (4-pozycyjnych w _cDlg, 2-/4-pozycyjnych w _bDlg) - pozycja
  // ikon i galki liczona przez slotExpr na wspolnej bazie MX_TX/MX_TW. cmslide ujednolicony do tej samej
  // bazy co bmslide/ikony (w bazowej karcie mial inna geometrie: x=24,w=52) ----
  const oSl = Base.prototype._sl;
  TeklaPelletCanCard.prototype._sl = function (attrs, x, y, w, p) {
    if (attrs.includes('cmslide') || attrs.includes('bmslide')) {
      const raw = attrs.includes('cmslide') ? CM_RAW_PS : PS4;
      const idx = nearestOf(raw, p);
      const pe = slotExpr(PS4[idx], MX_TW);
      const f = Math.max(PS4[idx], 0.001);
      return `<div class="sl" ${attrs} style="left:${MX_TX}cqw;top:${y}cqw;width:${MX_TW}cqw"><b style="width:${pe};background-size:${(100 / f).toFixed(1)}% 100%"></b><i style="left:${pe}"></i></div>`;
    }
    p = Math.max(0, Math.min(1, p));
    if (p > 0 && p < 1) return oSl.call(this, attrs, x, y, w, p);
    const f = Math.max(p, 0.001), pe = slotExpr(p, w);
    return `<div class="sl" ${attrs} style="left:${x}cqw;top:${y}cqw;width:${w}cqw"><b style="width:${pe};background-size:${(100 / f).toFixed(1)}% 100%"></b><i style="left:${pe}"></i></div>`;
  };
  const oMdiIcon = Base.prototype._mdiIcon;
  TeklaPelletCanCard.prototype._mdiIcon = function (attrs, x, y, inner, on) {
    const idx = MX.indexOf(x);
    if (idx < 0) return oMdiIcon.call(this, attrs, x, y, inner, on);
    const left = slotExpr(PS4[idx], MX_TW, MX_TX);
    return `<span class="mdi ${on ? 'on' : ''}" ${attrs} style="left:${left};top:${y}cqw">${inner}</span>`;
  };

  // ---- okno szybkich ustawien (Kociol + tryb CO/CWU) - ikony trybow (off/eco/harmonogram/komfort) jako
  // prawdziwe bitmapy panela: nieaktywna wersja na kazdej pozycji, a na pozycji najblizszej aktualnie
  // wybranemu trybowi - wersja aktywna/podswietlona. Geometria TEJ galki (3.9cqw, WIEKSZA niz w _cDlg) ma
  // WLASNY lokalny promien/overflow (promien 1.95cqw, overflow 1px), NIE globalny KNOB_R_CQW=3.25/
  // OVERFLOW_PX=1.5 (ten jest dla INNYCH suwakow, cDlg/bDlg). Kazda ikona dodatkowo przesunieta w poziomie
  // o GLYPH_DX, zeby SRODEK SAMEGO ZNACZKA (bez tekstu "off/eco/A/comf" obok) pokrywal sie ze srodkiem
  // galki - nie srodek calego plotna 35x37 (ktore jest przesuniete w lewo, bo po prawej jest miejsce na tekst) ----
  TeklaPelletCanCard.prototype._quick = function (sw) {
    const MODE_KEYS = ['off', 'eco', 'auto', 'comf'];
    const GLYPH_DX = { off: 0.973, eco: 0.640, auto: 0.162, comf: 1.054 };
    const KNOB_R = 1.95, OVERFLOW_PX = 1; // lokalna geometria TEJ galki (3.9cqw)
    const slotExprMode = (t, tw, tx = 0) => {
      const leftCqw = KNOB_R, leftPx = -OVERFLOW_PX;
      const rightCqw = tw - KNOB_R, rightPx = OVERFLOW_PX;
      const cqw = tx + leftCqw + t * (rightCqw - leftCqw);
      const px = leftPx + t * (rightPx - leftPx);
      return px === 0 ? `${cqw.toFixed(3)}cqw` : `calc(${cqw.toFixed(3)}cqw ${px >= 0 ? '+' : '-'} ${Math.abs(px).toFixed(3)}px)`;
    };
    const PS = PS4;
    const nearestIdx = p => nearestOf(PS, p);
    const posX = (tx, tw) => PS.map(p => slotExprMode(p, tw, tx));
    const idxOf = m => !m ? -1 : m.sup === 'off' ? 0 : m.sup === 'eco' ? 1 : m.sup === 'comf' ? 3 : 2;
    const set = this._v('cwu_set'), cf = this._v('cwu_comfort'), eco = this._v('cwu_eco');
    const wm = this._mode('cwu_mode');
    const wIdx = idxOf(wm) >= 0 ? idxOf(wm) : (!isNaN(set) && !isNaN(eco) && set === eco && set !== cf ? 1 : 3);
    const wpos = PS[wIdx];
    const cm = (this._s('co_mode') ? this._t('co_mode', 'comf') : 'comf').toLowerCase();
    const cmm = this._mode('co_mode');
    const cIdx = idxOf(cmm) >= 0 ? idxOf(cmm) : (cm.startsWith('eco') ? 1 : cm.startsWith('off') ? 0 : 3);
    const cpos = PS[cIdx];
    const mi = (k, n, x, y, sel) => { const type = MODE_KEYS[n]; return `<span class="mdi" data-act="setmode" data-k="${k}" data-i="${n}" style="left:${x};top:${y}cqw">${modeIconSvg(type, sel, GLYPH_DX[type])}</span>`; };
    const modes = (k, y, xs, pos) => { const sel = nearestIdx(pos); return xs.map((x, n) => mi(k, n, x, y, n === sel)).join(''); };
    const slider = (k, x, y, w, p) => { const f = Math.max(p, 0.001), pe = slotExprMode(p, w); return `<div class="sl" data-act="slider" data-k="${k}" style="left:${x}cqw;top:${y}cqw;width:${w}cqw"><b style="width:${pe};background-size:${(100 / f).toFixed(1)}% 100%"></b><i style="left:${pe}"></i></div>`; };
    return `<div class="qd"><div class="qbg"></div>
      <span class="qa" style="left:8.1cqw;top:11.7cqw">Kocioł</span><span class="tgq ${sw ? 'on' : ''}" data-act="toggle"><i></i></span>
      <span class="qa" style="left:7.8cqw;top:25.2cqw">Ogrzewanie 1</span>${modes('co_mode', 22.5157, posX(37.5, 38.4), cpos)}${slider('co_mode', 37.5, 26.3629, 38.4, cpos)}
      <span class="qa" style="left:7.6cqw;top:45.5cqw">Woda użytkowa</span>${modes('cwu_mode', 42.8157, posX(37.1, 38.4), wpos)}${slider('cwu_mode', 37.1, 46.6629, 38.4, wpos)}
      <div class="qok" data-act="ok">OK</div></div>`;
  };

  // ---- okno edycji komfort/eco (CO/CWU, otwierane klikiem w kafelek na ekranie Ogrzewanie/Woda) -
  // ikonki sun/moon jako prawdziwe bitmapy; etykiety min/max wyrownane do srodkow skrajnych pozycji
  // galki (ta sama baza co suwak trybu: tor tx=21,tw=58cqw), wartosc wysrodkowana dokladnie na srodku
  // toru (50cqw), dol wartosci = dol etykiet min/max, +/- wyrownane w pionie ze slidorem ----
  const oCDlg = Base.prototype._cDlg;
  const reBlbLo = /(<span class="blb" style="left:)21cqw(;top:)([\d.]+)(cqw">)/g;
  const reBlbHi = /(<span class="blb" style="left:)79cqw(;top:)([\d.]+)(cqw">)/g;
  const reCval = /class="cval" style="top:([\d.]+)cqw"/g;
  const reBpmMinus = /(data-d="-1" style="left:)6\.5cqw(;top:)([\d.]+)(cqw")/g;
  const reBpmPlus = /(data-d="1" style="left:)81\.5cqw(;top:)([\d.]+)(cqw")/g;
  const DELTA_BLB = 1.24, DELTA_CVAL = 3.13, DELTA_BPM = 1.2;
  const CS_TX = 21, CS_TW = 58;
  TeklaPelletCanCard.prototype._cDlg = function (k) {
    let h = oCDlg.call(this, k);
    if (!h) return h;
    const mk = k === 'cwu' ? 'cwu_mode' : 'co_mode';
    const mm = this._mode(mk), sup = mm ? mm.sup : '';
    const comfImg = modeIconSvg('comf', sup === 'comf');
    const ecoImg = modeIconSvg('eco', sup === 'eco');
    h = h.replace(/<span class="mdi[^"]*"\s+style="([^"]*)">(?:(?!<\/span>)[\s\S])*?<sup>comf<\/sup><\/span>/, (_, st) => `<span class="mdi" style="${st}">${comfImg}</span>`);
    h = h.replace(/<span class="mdi[^"]*"\s+style="([^"]*)">(?:(?!<\/span>)[\s\S])*?<sup>eco<\/sup><\/span>/, (_, st) => `<span class="mdi" style="${st}">${ecoImg}</span>`);
    h = h.replace(reBlbLo, (_, pre, mid, t, suf) => `${pre}${slotExpr(0, CS_TW, CS_TX)}${mid}${(parseFloat(t) + DELTA_BLB).toFixed(2)}${suf}`);
    h = h.replace(reBlbHi, (_, pre, mid, t, suf) => `${pre}${slotExpr(1, CS_TW, CS_TX)}${mid}${(parseFloat(t) + DELTA_BLB).toFixed(2)}${suf}`);
    h = h.replace(reCval, (_, t) => `class="cval" style="left:50cqw;top:${(parseFloat(t) + DELTA_CVAL).toFixed(2)}cqw;transform:translateX(-50%)"`);
    h = h.replace(reBpmMinus, (_, pre, mid, t, suf) => `${pre}6.5cqw${mid}${(parseFloat(t) + DELTA_BPM).toFixed(2)}${suf}`);
    h = h.replace(reBpmPlus, (_, pre, mid, t, suf) => `${pre}81.5cqw${mid}${(parseFloat(t) + DELTA_BPM).toFixed(2)}${suf}`);
    return h;
  };

  // ---- kafelki dolnego paska na pulpicie: MENU(77)/CO(144)/CWU(174)/zasilanie(115) zamiast wektorow mdi.
  // wskaznik kafelka palnika wg stanu palnika (burner_code): 0/9 brak koloru, 5 staly zielony, 8 pulsujacy
  // zielony, 10 pulsujacy czerwony, kazdy inny (1,2,6,7) pulsujacy pomaranczowy ----
  const oMain = Base.prototype._main;
  TeklaPelletCanCard.prototype._main = function (ctx) {
    let h = oMain.call(this, ctx);
    const bc = this._v('burner_code') % 256;
    const burnCls = [0, 9].includes(bc) ? 'ind'
      : bc === 5 ? 'ind g'
      : bc === 8 ? 'ind pulse-g'
      : bc === 10 ? 'ind pulse-r'
      : 'ind pulse'; // 1,2,6,7
    h = h.replace(/(data-go="burn">)<i class="ind[^"]*"><\/i>/, `$1<i class="${burnCls}"></i>`);
    h = h.replace(/<svg viewBox="0 0 35 30\.2" class="ic mic">[\s\S]*?<\/svg>/, `<img class="ic mic" src="${U(77)}" draggable="false" style="object-fit:contain">`);
    h = h.replace(/<span class="radi"><svg[^>]*class="ic2"[\s\S]*?<\/svg><sup>1<\/sup><\/span>/, `<span class="radi"><img class="ic2" src="${U(144)}" draggable="false" style="object-fit:contain"></span>`);
    h = h.replace(/(data-go="water">(?:<i class="ind[^>]*><\/i>)?)<svg[^>]*class="ic2"[\s\S]*?<\/svg>/, `$1<img class="ic2" src="${U(174)}" draggable="false" style="object-fit:contain">`);
    h = h.replace(/(data-act="quick">(?:<i class="ind[^>]*><\/i>)?)<svg[^>]*class="ic2"[\s\S]*?<\/svg>/, `$1<img class="ic2" src="${U(115)}" draggable="false" style="object-fit:contain">`);
    return h;
  };

  // ---- ekrany Ogrzewanie/Woda: duzy guzik trybu pracy (off/eco/harmonogram/komfort) jako prawdziwa
  // bitmapa (ta sama co na suwaku szybkich ustawien) zamiast plaskiej ikonki mdi ----
  const oHeat = Base.prototype._heat;
  TeklaPelletCanCard.prototype._heat = function (ctx) {
    let h = oHeat.call(this, ctx);
    const mm = this._mode('co_mode');
    const type = MODE_TYPE(mm ? mm.sup : 'comf');
    h = h.replace(/<span class="mi lone"><ha-icon[^>]*><\/ha-icon><sup>[^<]*<\/sup><\/span>/, `<span class="mi lone">${modeIconSvg(type, true, 0, 6)}</span>`);
    return h;
  };
  const oWater = Base.prototype._water;
  TeklaPelletCanCard.prototype._water = function (ctx) {
    let h = oWater.call(this, ctx);
    const set = this._v('cwu_set'), cf = this._v('cwu_comfort'), eco = this._v('cwu_eco');
    const wm = this._mode('cwu_mode');
    const sup = wm ? wm.sup : (!isNaN(set) && !isNaN(eco) && set === eco && set !== cf ? 'eco' : 'comf');
    const type = MODE_TYPE(sup);
    h = h.replace(/<span class="mi"><ha-icon[^>]*><\/ha-icon><sup>[^<]*<\/sup><\/span>/, `<span class="mi">${modeIconSvg(type, true, 0, 6)}</span>`);
    return h;
  };

  // ---- NASTAWY kotla: "Temperatura zadana" klikalna (poziom 0) - otwiera JUZ ISTNIEJACE okno trybu
  // kotla (_bOpen/_bDlg), ktore zapisuje przez set_setpoint which=4 -> rejestr 0x2003 "Temperatura zadana
  // kotla (reczna)". Zadnego nowego zapisu/rejestru nie dodajemy - tylko wpinamy istniejacy, bezpieczny
  // mechanizm w nowym miejscu ----
  const oBoilS = Base.prototype._boilS;
  TeklaPelletCanCard.prototype._boilS = function () {
    let h = oBoilS.call(this);
    return h.replace(
      /<div class="row"><span class="l">Temperatura zadana \[°C\]<\/span><span class="v">([^<]*)<\/span><\/div>/,
      (_, v) => `<div class="row go" data-act="boilsp"><span class="l">Temperatura zadana [°C]</span><span class="v">${v}</span></div>`
    );
  };

  // ---- wzorzec WARTOSCI (niebieski 165) dla generycznych edytorow _prDlg/_q2Dlg (Histereza, korekty,
  // kalibracje, moce, czasy itd.) - ten sam uklad/wyrownanie co wzorzec TEMPERATURY (_spDlg), ale tor
  // koloruje sie na niebiesko (165) zamiast teczowo (167) - chyba ze etykieta zawiera "°C" I NIE jest
  // delta/korekta/kalibracja (prawdziwa, bezwzgledna wartosc temperatury) - wtedy zostaje teczowy wzorzec temperatury ----
  const patchPrLike = (h, act) => {
    if (!h || !h.includes(`data-act="${act}"`)) return h;
    const m = /<span class="fmt"[^>]*>([^<]*)<\/span>/.exec(h);
    const label = m ? m[1] : '';
    const isDeltaWord = /Histereza|Kalibracj|Korekt|Zwiększenie|Delta|Obniżenie/i.test(label);
    const isTemp = /°C/.test(label) && !isDeltaWord;
    h = h.replace(`<div class="sl" data-act="${act}"`, `<div class="sl ${isTemp ? 'sl-t' : 'sl-v'}" data-act="${act}"`);
    h = h.replace('<span class="blb" style="left:17cqw">', '<span class="blb" style="left:calc(20.250cqw - 1.500px)">');
    h = h.replace('<span class="blb" style="left:79cqw">', '<span class="blb" style="left:calc(79.750cqw + 1.500px)">');
    h = h.replace('<div class="bval" style="top:12.4cqw;font-size:10.5cqw">', '<div class="bval" style="top:14.39cqw;font-size:10.5cqw">');
    return h;
  };
  const oPrDlg = Base.prototype._prDlg;
  TeklaPelletCanCard.prototype._prDlg = function () { return patchPrLike(oPrDlg.call(this), 'prslide'); };
  const oQ2Dlg = Base.prototype._q2Dlg;
  TeklaPelletCanCard.prototype._q2Dlg = function () { return patchPrLike(oQ2Dlg.call(this), 'q2slide'); };

  // ---- NASTAWY CO/CWU: "Temperatura komfortowa"/"ekonomiczna" - PROSTY edytor jednej wartosci (jak
  // Histereza itp., ten sam wyglad co _prDlg), NIE okno trybu (_cOpen) - zapis przez set_setpoint
  // which=0..3 -> rejestry 0x2010/0x2012 (CWU), 0x2032/0x2048 (CO). Renderowany NA TYM SAMYM ekranie
  // (bez przechodzenia na 'main'/'heat'/'water') ----
  TeklaPelletCanCard.prototype._spOpen = function (vkey, which, lo, hi, label, dec) {
    const v = this._v(vkey);
    const val = isNaN(v) ? lo : Math.max(lo, Math.min(hi, v));
    this._spv = { vkey, which, lo, hi, label, dec: dec || 0, val, v0: val };
    this._render(true);
  };
  TeklaPelletCanCard.prototype._spDlg = function () {
    const d = this._spv, f = x => x.toFixed(d.dec);
    const p = (d.val - d.lo) / (d.hi - d.lo);
    return `<div class="qd"><div class="qx" data-act="spcancel"></div><div class="qbg"></div>
      <span class="fmt" style="top:7.6cqw;font-size:4.2cqw">${d.label}</span>
      <div class="bval" style="top:14.39cqw;font-size:10.5cqw">${f(d.val)}</div>
      <span class="blb" style="left:calc(20.250cqw - 1.500px)">${f(d.lo)}</span><span class="blb" style="left:calc(79.750cqw + 1.500px)">${f(d.hi)}</span>
      ${this._sl('data-act="spslide"', 17, 27, 66, p)}
      <div class="bpm" data-act="spval" data-d="-1" style="left:17cqw"><i></i></div><div class="bpm pl" data-act="spval" data-d="1" style="left:50.5cqw"><i></i><i></i></div>
      <div class="qok" data-act="spok">OK</div></div>`;
  };
  const spRow = function (label, vkey, which, lo, hi, dec) {
    return `<div class="row go" data-act="spopen" data-vkey="${vkey}" data-which="${which}" data-lo="${lo}" data-hi="${hi}" data-label="${label}" data-dec="${dec || 0}"><span class="l">${label}</span><span class="v">${this._p(this._v(vkey), dec || 0)}</span></div>`;
  };
  const reComf = /<div class="row"><span class="l">Temperatura komfortowa \[°C\]<\/span><span class="v">([^<]*)<\/span><\/div>/;
  const reEco = /<div class="row"><span class="l">Temperatura ekonomiczna \[°C\]<\/span><span class="v">([^<]*)<\/span><\/div>/;
  const oCwuS = Base.prototype._cwuS;
  TeklaPelletCanCard.prototype._cwuS = function () {
    let h = oCwuS.call(this);
    h = h.replace(reComf, () => spRow.call(this, 'Temperatura komfortowa [°C]', 'cwu_comfort', 0, 20, 70, 0));
    h = h.replace(reEco, () => spRow.call(this, 'Temperatura ekonomiczna [°C]', 'cwu_eco', 1, 20, 70, 0));
    return h + (this._spv ? this._spDlg() : '');
  };
  const oBodyCopen = Base.prototype._body;
  TeklaPelletCanCard.prototype._body = function (s) {
    let h = oBodyCopen.call(this, s);
    if (s === 'co_s') {
      h = h.replace(reComf, () => spRow.call(this, 'Temperatura komfortowa [°C]', 'co_comfort', 2, 15, 30, 1));
      h = h.replace(reEco, () => spRow.call(this, 'Temperatura ekonomiczna [°C]', 'co_eco', 3, 10, 30, 1));
      h += this._spv ? this._spDlg() : '';
    }
    return h;
  };

  // ---- przeciaganie palcem/myszka po KAZDYM suwaku (nie tylko klik w punkt) - dziala przez
  // "redyspozycje" syntetycznego eventu 'click' na AKTUALNY (odnaleziony na nowo) element przy kazdym
  // pointermove, co uruchamia IDENTYCZNA, juz zweryfikowana logike istniejacego handlera click (tu +
  // bazowa karta), bez duplikowania osobnej matematyki per typ suwaka. Element NIE moze byc
  // buforowany jako referencja - kazdy klik wywoluje _render(true), ktory podmienia scr.innerHTML
  // (nowe wezly DOM), wiec stara referencja staje sie odlaczona i przestaje propagowac eventy - stad
  // ponowne wyszukiwanie po (act,k,w) przy kazdym ruchu ----
  const SLIDE_ACTS = new Set(['bslide', 'cslide', 'bmslide', 'cmslide', 'slider', 'spslide', 'prslide', 'q2slide']);
  const oBuild = Base.prototype._build;
  TeklaPelletCanCard.prototype._build = function () {
    oBuild.apply(this, arguments);
    if (this.__tpcPatchedInit) return;
    this.__tpcPatchedInit = true;
    const R = this.shadowRoot;
    R.addEventListener('click', e => {
      if (e.target.closest('[data-act="boilsp"]')) { this._scr = 'main'; this._bOpen(); return; }
      const sp = e.target.closest('[data-act="spopen"]');
      if (sp) { this._spOpen(sp.dataset.vkey, +sp.dataset.which, +sp.dataset.lo, +sp.dataset.hi, sp.dataset.label, +(sp.dataset.dec || 0)); return; }
      if (this._spv) {
        if (e.target.closest('[data-act="spcancel"]')) { this._spv = null; this._render(true); return; }
        const slv = e.target.closest('[data-act="spval"]');
        if (slv) { const d = this._spv; d.val = Math.round(Math.max(d.lo, Math.min(d.hi, d.val + +slv.dataset.d))); this._render(true); return; }
        const sls = e.target.closest('[data-act="spslide"]');
        if (sls) { const d = this._spv; d.val = Math.round(d.lo + this._slFrac(sls, e) * (d.hi - d.lo)); this._render(true); return; }
        if (e.target.closest('[data-act="spok"]')) {
          const d = this._spv;
          if (d.val !== d.v0) this._svc('set_setpoint', { which: d.which, value: d.val });
          this._spv = null; this._render(true); return;
        }
      }
    });
    let dragSel = null;
    const slSelector = sl => {
      let s = `.sl[data-act="${sl.dataset.act}"]`;
      if (sl.dataset.k != null) s += `[data-k="${sl.dataset.k}"]`;
      if (sl.dataset.w != null) s += `[data-w="${sl.dataset.w}"]`;
      return s;
    };
    R.addEventListener('pointerdown', e => {
      const sl = e.target.closest('.sl[data-act]');
      if (!sl || !SLIDE_ACTS.has(sl.dataset.act)) return;
      dragSel = slSelector(sl);
      try { sl.setPointerCapture(e.pointerId); } catch (err) { }
      sl.dispatchEvent(new MouseEvent('click', { clientX: e.clientX, clientY: e.clientY, bubbles: true }));
    });
    R.addEventListener('pointermove', e => {
      if (!dragSel) return;
      const sl = R.querySelector(dragSel);
      if (sl) sl.dispatchEvent(new MouseEvent('click', { clientX: e.clientX, clientY: e.clientY, bubbles: true }));
    });
    ['pointerup', 'pointercancel'].forEach(t => R.addEventListener(t, () => { dragSel = null; }));
  };

  if (!customElements.get('teklapelletclassic-card')) customElements.define('teklapelletclassic-card', TeklaPelletCanCard);

  // ---- edytor: tylko urządzenie (gdy >1), grafiki, obraz kotła, język, ekran – bez ręcznego mapowania encji ----
  class TeklaPelletCanCardEditor extends HTMLElement {
    setConfig(c) { this._cfg = Object.assign({ grafiki: 'pelne', boiler_image: '13', screen: 'main', language: 'auto' }, c || {}); this._draw(); }
    set hass(h) { this._hass = h; this._draw(); }
    _draw() {
      if (!this._cfg) return;
      if (!this._form) {
        const info = document.createElement('div');
        info.style.cssText = 'font-size:13px;line-height:1.45;margin:0 0 10px;opacity:.9';
        info.textContent = 'Karta pokazuje wyłącznie urządzenia integracji TeklaPelletCAN i sama dobiera ich encje – nie trzeba nic mapować ręcznie.';
        this.appendChild(info);
        this._form = document.createElement('ha-form');
        this._form.computeLabel = s => s.label || s.name;
        this._form.addEventListener('value-changed', ev => this._changed(ev.detail.value));
        this.appendChild(this._form);
      }
      const devs = this._hass ? ourDevices(this._hass) : [];
      const D = window.__teklaDefs || { SCREEN_OPTS: [] };
      const schema = [
        { name: 'screen', label: 'Ekran startowy karty', selector: { select: { mode: 'dropdown', options: (D.SCREEN_OPTS || []).map(o => ({ value: o[0], label: o[1] })) } } },
        { name: 'language', label: 'Język / Language', selector: { select: { mode: 'dropdown', options: [{ value: 'auto', label: 'Auto (język Home Assistant)' }].concat(Object.keys((window.__pcLang || {}).names || {}).map(k => ({ value: k, label: window.__pcLang.names[k] }))) } } },
        { name: 'grafiki', label: 'Grafiki panela', selector: { select: { mode: 'dropdown', options: [{ value: 'pelne', label: 'Pełne (domyślne, oryginalne grafiki Estymy)' }, { value: 'domyslne', label: 'Domyślne karty (tylko zbiornik paliwa)' }] } } },
        { name: 'boiler_image', label: 'Obraz kotła (grafiki pełne)', selector: { select: { mode: 'dropdown', options: [{ value: '11', label: 'Typ 11' }, { value: '12', label: 'Typ 12' }, { value: '13', label: 'Typ 13' }, { value: '14', label: 'Typ 14' }] } } },
      ];
      if (devs.length > 1) {
        schema.unshift({
          name: 'device_id', label: 'Urządzenie',
          selector: { select: { mode: 'dropdown', options: [{ value: 'auto', label: 'Automatycznie (pierwsze znalezione)' }].concat(devs.map(d => ({ value: d.id, label: d.name }))) } },
        });
      }
      this._form.schema = schema;
      this._form.data = Object.assign({}, this._cfg, { device_id: this._cfg.device_id || 'auto' });
      if (this._hass) this._form.hass = this._hass;
    }
    _changed(v) {
      const cfg = Object.assign({}, this._cfg, {
        screen: v.screen || 'main', language: v.language || 'auto', grafiki: v.grafiki === 'domyslne' ? 'domyslne' : 'pelne',
        boiler_image: v.boiler_image || '13',
      });
      if (v.device_id && v.device_id !== 'auto') cfg.device_id = v.device_id; else delete cfg.device_id;
      this._cfg = cfg;
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: cfg }, bubbles: true, composed: true }));
    }
  }
  if (!customElements.get('teklapelletclassic-card-editor')) customElements.define('teklapelletclassic-card-editor', TeklaPelletCanCardEditor);

  window.customCards = window.customCards || [];
  if (!window.customCards.some(c => c.type === 'teklapelletclassic-card')) {
    window.customCards.push({
      type: 'teklapelletclassic-card',
      name: 'TeklaPelletClassic-card',
      description: 'Panel kotła Tekla/Estyma (replika panelu) – wyłącznie dla integracji TeklaPelletCAN (encje dobierane automatycznie).',
      preview: true,
    });
  }
})();
