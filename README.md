# TeklaPelletClassic-card

Karta Lovelace dla Home Assistant – replika panelu kotła Tekla/Estyma Igneo Touch,
wyłącznie dla integracji [TeklaPelletCAN](https://github.com/GieOeRZet/TeklaPelletCan)
(urządzenie wyszukiwane w rejestrze HA po domenie integracji, encje dobierane
automatycznie po ID punktu – bez ręcznego mapowania).

## Instalacja (HACS)

1. HACS → Frontend → ⋮ → Własne repozytoria → dodaj
   `https://github.com/GieOeRZet/TeklaPelletClassic-card` jako **Plugin**.
2. Zainstaluj, odśwież stronę (Ctrl+Shift+R).
3. Dodaj kartę na dashboardzie: typ `custom:teklapelletcan-card`.

## Zależności

Ten plugin ładuje runtime z `pelletcan-card.js` → `tekla-panel-card.js`
(silnik renderowania, ten sam co oryginalny projekt PelletCAN) + tłumaczenia
z `pelletcan-lang.js`. Wszystko wchodzi w skład tego repozytorium – nie trzeba
instalować niczego dodatkowego.

## Licencja

Jak w [TeklaPelletCan](https://github.com/GieOeRZet/TeklaPelletCan) – zobacz [LICENSE](LICENSE).
