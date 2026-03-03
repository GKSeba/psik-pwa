# Psik Psik (PWA)

Prosta aplikacja PWA pokazująca:
- PM2.5 / PM10 (µg/m³) + kolorowanie wg progów
- prognozę pyłków (grass/birch/alder/mugwort/ragweed/olive) z kolorowaniem wg progów

Źródło danych: Open‑Meteo Air Quality API (model/prognoza, nie pomiary ze stacji).

## Uruchomienie lokalnie
Najprościej:
- VS Code → rozszerzenie Live Server → uruchom `index.html`

## Publikacja (GitHub Pages)
Aplikacja jest hostowana na GitHub Pages (HTTPS), co umożliwia:
- geolokalizację na telefonie
- instalację jako PWA na Androidzie

## Prywatność
Aplikacja używa geolokalizacji wyłącznie do pobrania prognozy dla bieżącej pozycji.
Nie zapisuje kont użytkowników ani nie wysyła danych do innych usług niż Open‑Meteo.

## Bezpieczeństwo
- Brak kluczy API (Open‑Meteo bez klucza).
- CSP ogranicza źródła skryptów do `self` oraz połączenia do `air-quality-api.open-meteo.com`.