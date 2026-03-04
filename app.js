// ===== 1) UI helpers =====
const $ = (id) => document.getElementById(id);

const ui = {
  btnGeo: $("btnGeo"),
  city: $("city"),
  btnSearch: $("btnSearch"),
  results: $("results"),
  place: $("place"),
  day: $("day"),
  msg: $("msg"),
  air: $("air"),
  pollen: $("pollen"),
  fabToggle: $("fabToggle"),
  viewNow: $("viewNow"),
  viewForecast: $("viewForecast"),
  forecastDays: $("forecastDays"),
};

let loadCounter = 0;

function setMsg(text) {
  ui.msg.textContent = text;
}

function formatValue(v) {
  if (v == null || Number.isNaN(v)) return "—";
  // lekko zaokrąglamy, żeby UI było czytelne
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Fallback jednostek:
 * - PM: i tak zwykle przychodzą w hourly_units jako µg/m³
 * - Pyłki: ustawiamy "gr/m³" jeśli API nie poda
 *
 * Uwaga merytoryczna: często spotyka się "grains/m³" (ziarna/m³),
 * ale zostawiam "gr/m³" zgodnie z Twoją prośbą.
 */
const DEFAULT_UNITS = {
  pm2_5: "µg/m³",
  pm10: "µg/m³",
  grass_pollen: "grains/m³",
  birch_pollen: "grains/m³",
  alder_pollen: "grains/m³",
  mugwort_pollen: "grains/m³",
  ragweed_pollen: "grains/m³",
};

// ===== 2) Kategorie jakości dla PM (wg tabeli µg/m³) =====
function pmCategory(pmType, value) {
  if (value == null || Number.isNaN(value)) return null;
  const v = Number(value);

  // PM2.5 24h: 0-10, 10-20, 20-25, 25-50, 50-75, 75-800
  if (pmType === "pm2_5") {
    if (v <= 10) return "good";
    if (v <= 20) return "fair";
    if (v <= 35) return "moderate";
    if (v <= 50) return "poor";
    if (v <= 100) return "verypoor";
    return "extremelypoor";
  }

  // PM10 24h: 0-20, 20-40, 40-50, 50-100, 100-150, 150-1200
  if (pmType === "pm10") {
    if (v <= 20) return "good";
    if (v <= 40) return "fair";
    if (v <= 50) return "moderate";
    if (v <= 100) return "poor";
    if (v <= 150) return "verypoor";
    return "extremelypoor";
  }

  return null;
}

const POLLEN_THRESHOLDS = {
  grass_pollen: { okMax: 10, alarmFrom: 50, extremeFrom: 150 },
  birch_pollen: { okMax: 15, alarmFrom: 80, extremeFrom: 400 },
  alder_pollen: { okMax: 30, alarmFrom: 100, extremeFrom: 300 },
  mugwort_pollen: { okMax: 10, alarmFrom: 30, extremeFrom: 100 },
  ragweed_pollen: { okMax: 5, alarmFrom: 20, extremeFrom: 50 },
};

// Zwraca: "ok" | "medium" | "alarm" | "extreme"
function pollenCategory(allergenKey, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;

  const t = POLLEN_THRESHOLDS[allergenKey];
  if (!t) return null;

  // Brak/Niskie (OK): < okMax
  if (v < t.okMax) return "ok";

  // Ekstremalne!: > extremeFrom
  if (v > t.extremeFrom) return "extreme";

  // Wysokie (Alarm): alarmFrom – extremeFrom
  if (v >= t.alarmFrom) return "alarm";

  // Średnie: okMax – alarmFrom
  return "medium";
}

const categoryLabelPL = {
  good: "Super",
  fair: "OK",
  moderate: "W miarę",
  poor: "Kiepsko",
  verypoor: "Źle!",
  extremelypoor: "Nie wychodź!",
  pollen: "gr/m³",
  ok: "OK",
  medium: "Kichasz?",
  alarm: "Już swędzi!",
  extreme: "Dramat!",
};

function renderTiles(containerEl, items) {
  containerEl.innerHTML = items
    .map(
      ({ name, value, unit, category }) => `
  <div class="tile ${category ?? ""}">
    <div class="tileHead">
      <div class="tileName">${name}</div>
      ${category ? `<span class="chip ${category}">${categoryLabelPL?.[category] ?? category}</span>` : ``}
    </div>
    <div class="tileValue">${formatValue(value)} <span class="small">${unit ?? ""}</span></div>
  </div>
`,
    )
    .join("");
}

// ===== 3) Geocoding (wyszukiwanie miasta) =====
// async function searchCity(name) {
//   const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
//   url.searchParams.set("name", name);
//   url.searchParams.set("count", "5");
//   url.searchParams.set("language", "pl");
//   url.searchParams.set("format", "json");

//   const res = await fetch(url);
//   if (!res.ok) throw new Error("Błąd geokodowania");
//   const data = await res.json();
//   return data.results ?? [];
// }

// function renderResults(results) {
//   ui.results.innerHTML = "";
//   results.forEach((r) => {
//     const li = document.createElement("li");
//     const admin = [r.admin1, r.admin2].filter(Boolean).join(", ");
//     li.textContent = `${r.name}${admin ? " (" + admin + ")" : ""}, ${r.country}`;

//     li.addEventListener("click", () => {
//       ui.results.innerHTML = "";
//       loadForLocation({
//         name: li.textContent,
//         latitude: r.latitude,
//         longitude: r.longitude,
//       });
//     });

//     ui.results.appendChild(li);
//   });
// }

// ===== 4) Open‑Meteo Air Quality API (pyłki + PM + EU AQI) =====
async function fetchAirQuality(latitude, longitude) {
  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "5");
  url.searchParams.set(
    "hourly",
    [
      "pm2_5",
      "pm10",
      "alder_pollen",
      "birch_pollen",
      "grass_pollen",
      "mugwort_pollen",
      "ragweed_pollen",
    ].join(","),
  );

  console.log("AirQuality URL:", url.toString());

  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  return JSON.parse(text);
}

function pickClosestHourIndex(hourly) {
  const times = hourly?.time;
  if (!Array.isArray(times) || times.length === 0) return 0;

  const now = Date.now();
  let best = 0;
  let bestDiff = Infinity;

  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]).getTime();
    const diff = Math.abs(t - now);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

function pickAt(hourly, key, idx) {
  const arr = hourly?.[key];
  if (!Array.isArray(arr)) return null;
  return arr[idx] ?? null;
}

//dodany kod
const POLLEN_KEYS = [
  "grass_pollen",
  "birch_pollen",
  "alder_pollen",
  "mugwort_pollen",
  "ragweed_pollen",
];

const POLLEN_NAME_PL = {
  grass_pollen: "Trawy",
  birch_pollen: "Brzoza",
  alder_pollen: "Olcha",
  mugwort_pollen: "Bylica",
  ragweed_pollen: "Ambrozja",
};

function toISODate(isoDateTime) {
  return (isoDateTime || "").split("T")[0] || "";
}

function groupDailyMax(hourly, key) {
  const times = hourly?.time;
  const values = hourly?.[key];
  if (!Array.isArray(times) || !Array.isArray(values)) return new Map();

  const map = new Map(); // date -> max
  for (let i = 0; i < times.length; i++) {
    const d = toISODate(times[i]);
    const v = Number(values[i]);
    if (!d || !Number.isFinite(v)) continue;
    const cur = map.get(d);
    if (cur == null || v > cur) map.set(d, v);
  }
  return map;
}

function renderPollenForecast(days, units) {
  if (!ui.forecastDays) return;

  const fmtDay = (dateStr) => {
    // "2026-03-04" -> "04.03"
    const [y, m, d] = (dateStr || "").split("-");
    return d && m ? `${d}.${m}` : dateStr;
  };

  ui.forecastDays.className = "forecastBlock";

  ui.forecastDays.innerHTML = POLLEN_KEYS.map((k) => {
    const rowTiles = days
      .map((day) => {
        const v = day[k];
        const cat = pollenCategory(k, v); // ok/medium/alarm/extreme
        return `
      <div class="miniTile ${cat ?? ""}">
        <div class="d">${fmtDay(day.date)}</div>
        <div class="v">${formatValue(v)}</div>
        <div class="u">${units[k] ?? ""}</div>
      </div>
    `;
      })
      .join("");

    return `
    <div>
      <div class="forecastTitle">${POLLEN_NAME_PL[k]}</div>
      <div class="forecastRow">${rowTiles}</div>
    </div>
  `;
  }).join("");
}

// ===== 5) Główna funkcja =====
async function loadForLocation({ name, latitude, longitude }) {
  const id = ++loadCounter;
  ui.place.textContent = name;
  ui.air.innerHTML = "";
  ui.pollen.innerHTML = "";
  setMsg(`Pobieram dane… (#${id})`);

  try {
    const data = await fetchAirQuality(latitude, longitude);
    const hourly = data.hourly || {};

    const units = { ...DEFAULT_UNITS, ...(data.hourly_units || {}) };

    // daty na podstawie hourly.time
    const allDates = [...new Set((hourly.time || []).map(toISODate))].filter(
      Boolean,
    );
    const today = toISODate(new Date().toISOString());

    const dates = allDates
      .filter((d) => d !== today) // wyrzuć dzisiaj
      .slice(0, 5);

    // max dzienny dla każdego pyłku
    const maxMaps = Object.fromEntries(
      POLLEN_KEYS.map((k) => [k, groupDailyMax(hourly, k)]),
    );

    // składamy strukturę dni
    const days = dates.map((date) => {
      const o = { date };
      for (const k of POLLEN_KEYS) o[k] = maxMaps[k].get(date) ?? null;
      return o;
    });

    // render prognozy
    renderPollenForecast(days, units);

    const idx = pickClosestHourIndex(hourly);

    ui.day.textContent = hourly?.time?.[idx] ?? "";
    const iso = hourly?.time?.[idx] ?? "";
    const [d, t] = iso.split("T");
    ui.day.innerHTML = `${d || "—"}<br>${t || "—"}`;

    const pm25 = pickAt(hourly, "pm2_5", idx);
    const pm10 = pickAt(hourly, "pm10", idx);

    const grass = pickAt(hourly, "grass_pollen", idx);
    const birch = pickAt(hourly, "birch_pollen", idx);
    const alder = pickAt(hourly, "alder_pollen", idx);
    const mugwort = pickAt(hourly, "mugwort_pollen", idx);
    const ragweed = pickAt(hourly, "ragweed_pollen", idx);

    const airTiles = [
      {
        name: "PM2.5",
        value: pm25,
        unit: "µg/m³",
        category: pmCategory("pm2_5", pm25),
      },
      {
        name: "PM10",
        value: pm10,
        unit: "µg/m³",
        category: pmCategory("pm10", pm10),
      },
    ];

    const pollenTiles = [
      {
        name: "Trawy",
        value: grass,
        unit: "grains/m³",
        category: pollenCategory("grass_pollen", grass),
      },
      {
        name: "Brzoza",
        value: birch,
        unit: "grains/m³",
        category: pollenCategory("birch_pollen", birch),
      },
      {
        name: "Olcha",
        value: alder,
        unit: "grains/m³",
        category: pollenCategory("alder_pollen", alder),
      },
      {
        name: "Bylica",
        value: mugwort,
        unit: "grains/m³",
        category: pollenCategory("mugwort_pollen", mugwort),
      },
      {
        name: "Ambrozja",
        value: ragweed,
        unit: "grains/m³",
        category: pollenCategory("ragweed_pollen", ragweed),
      },
    ];

    renderTiles(ui.air, airTiles);
    renderTiles(ui.pollen, pollenTiles);
    setMsg("Dane zaktualizowane");
  } catch (e) {
    console.error("loadForLocation error:", e);
    setMsg(`Błąd (#${id})`);
  }
}

// ===== 6) Zdarzenia UI =====
// ui.btnSearch.addEventListener("click", async () => {
// const q = ui.city.value.trim();
// if (!q) return;

// setMsg("Szukam miasta…");
// try {
//   const results = await searchCity(q);
//   if (results.length === 0) {
//     ui.results.innerHTML = "";
//     setMsg("Brak wyników");
//     return;
//   }
//   renderResults(results);
//   setMsg("Wybierz z listy");
// } catch (e) {
//   console.error(e);
//   setMsg("Błąd wyszukiwania");
// }
// });

ui.btnGeo.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setMsg("Geolokalizacja niedostępna");
    return;
  }

  setMsg("Pobieram lokalizację…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      loadForLocation({
        name: `Twoja lokalizacja (${latitude.toFixed(3)}, ${longitude.toFixed(3)})`,
        latitude,
        longitude,
      });
    },
    () => setMsg("Brak zgody na lokalizację lub błąd"),
  );
});

// ===== 7) Start =====
loadForLocation({ name: "Tychy, PL", latitude: 50.092, longitude: 18.998 });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js");
  });
}

const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

let showingForecast = false;

function showNow() {
  showingForecast = false;
  ui.viewNow.classList.remove("hidden");
  ui.viewForecast.classList.add("hidden");
  ui.fabToggle.textContent = "Prognoza";
  ui.fabToggle.setAttribute("aria-label", "Pokaż prognozę");
  ui.fabToggle.title = "Prognoza";
}

function showForecast() {
  showingForecast = true;
  ui.viewNow.classList.add("hidden");
  ui.viewForecast.classList.remove("hidden");
  ui.fabToggle.textContent = "Wróć";
  ui.fabToggle.setAttribute("aria-label", "Wróć do ekranu głównego");
  ui.fabToggle.title = "Wróć";
}

ui.fabToggle?.addEventListener("click", () => {
  console.log("FAB CLICK", {
    fab: !!ui.fabToggle,
    viewNow: !!ui.viewNow,
    viewForecast: !!ui.viewForecast,
  });

  if (!ui.viewNow || !ui.viewForecast) {
    alert("Brakuje viewNow/viewForecast w HTML (sprawdź id).");
    return;
  }

  if (showingForecast) showNow();
  else showForecast();
});

showNow();
