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
  wxIcon: $("wxIcon"),
  wxDesc: $("wxDesc"),
  wxFeels: $("wxFeels"),
  wxWind: $("wxWind"),
  wxNextHours: $("wxNextHours"),
  wxStability: $("wxStability"),
  weatherDays: $("weatherDays"),
};

let loadCounter = 0;

function setMsg(text) {
  ui.msg.textContent = text;
}

function formatValue(v) {
  if (v == null || Number.isNaN(v)) return "—";
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function windDirToText(deg) {
  if (!Number.isFinite(deg)) return "";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

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
    if (v <= 5) return "good";
    if (v <= 15) return "fair";
    if (v <= 50) return "moderate";
    if (v <= 90) return "poor";
    if (v <= 140) return "verypoor";
    return "extremelypoor";
  }

  // PM10 24h: 0-20, 20-40, 40-50, 50-100, 100-150, 150-1200
  if (pmType === "pm10") {
    if (v <= 15) return "good";
    if (v <= 45) return "fair";
    if (v <= 120) return "moderate";
    if (v <= 195) return "poor";
    if (v <= 270) return "verypoor";
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
  good: "Petarda",
  fair: "Super",
  moderate: "OK",
  poor: "Kiepsko",
  verypoor: "Źle",
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

// ===== 4) Open‑Meteo Air Quality API (pogoda pyłki + PM + EU AQI) =====

async function fetchWeather(latitude, longitude) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set(
    "hourly",
    ["weather_code", "is_day", "apparent_temperature"].join(","),
  );
  url.searchParams.set("forecast_hours", "48");

  url.searchParams.set(
    "current",
    [
      "weather_code",
      "is_day",
      "apparent_temperature",
      "wind_speed_10m",
      "wind_direction_10m",
    ].join(","),
  );

  // pod przyszły widok 5 dni:
  url.searchParams.set(
    "daily",
    [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "wind_speed_10m_max",
    ].join(","),
  );
  url.searchParams.set("forecast_days", "6");

  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`Weather HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}

// zjawiska

function wxKindFromCode(code) {
  code = Number(code);

  if (code === 0) return "clear";
  if (code === 1) return "mainly_clear"; // gł. bezchmurnie
  if (code === 2) return "partly_cloudy"; // częściowe zachmurzenie
  if (code === 3) return "overcast"; // zachmurzenie całkowite
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 57) || (code >= 80 && code <= 82))
    return "showers";
  if (code >= 61 && code <= 67) return "rain";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "snow";
  if (code === 95) return "storm";
  if (code >= 96 && code <= 99) return "stormhail";
  return "unknown";
}

const WX_FILES = {
  clear: {
    day: "wi-day-sunny.svg",
    night: "wi-night-clear.svg",
    neutral: null,
  },
  mainly_clear: {
    day: "wi-day-sunny-overcast.svg", // masz w day
    night: "wi-night-alt-partly-cloudy.svg", // masz w night
    neutral: null, // fallback na day (bo neutral słonecznych brak)
  },
  partly_cloudy: {
    day: "wi-day-cloudy.svg",
    night: "wi-night-alt-cloudy.svg",
    neutral: "wi-cloud.svg", // masz w neutral
  },
  overcast: {
    day: "wi-day-cloudy-high.svg", // masz w day
    night: "wi-night-alt-cloudy-high.svg", // masz w night
    neutral: "wi-cloudy.svg", // masz w neutral
  },
  fog: {
    day: "wi-day-fog.svg",
    night: "wi-night-fog.svg",
    neutral: "wi-fog.svg",
  },
  showers: {
    day: "wi-day-showers.svg",
    night: "wi-night-alt-showers.svg",
    neutral: "wi-showers.svg",
  },
  rain: {
    day: "wi-day-rain.svg",
    night: "wi-night-alt-rain.svg",
    neutral: "wi-rain.svg",
  },
  snow: {
    day: "wi-day-snow.svg",
    night: "wi-night-alt-snow.svg",
    neutral: "wi-snow.svg",
  },
  storm: {
    day: "wi-day-thunderstorm.svg",
    night: "wi-night-alt-thunderstorm.svg",
    neutral: "wi-thunderstorm.svg",
  },
  stormhail: {
    day: "\wi-storm-showers.svg",
    night: "wi-night-alt-thunderstorm.svg",
    neutral: "wi-night-alt-thunderstorm.svg",
  },
  unknown: {
    day: "wi-day-cloudy.svg",
    night: "wi-night-alt-cloudy.svg",
    neutral: "wi-cloud.svg",
  },
};

function wxIconPath({ code, isDay, mode = "auto" }) {
  const kind = wxKindFromCode(code);
  const files = WX_FILES[kind] || WX_FILES.unknown;

  if (mode === "neutral") {
    if (files.neutral) return `./icons/weather/neutral/${files.neutral}`;
    return `./icons/weather/day/${files.day}`;
  }

  // day/night/auto
  if (mode === "day") return `./icons/weather/day/${files.day}`;
  if (mode === "night") return `./icons/weather/night/${files.night}`;
  return isDay
    ? `./icons/weather/day/${files.day}`
    : `./icons/weather/night/${files.night}`;
}

function wxLabelPL(code) {
  const kind = wxKindFromCode(code);
  return {
    clear: "Bezchmurnie",
    mainly_clear: "Głównie bezchmurnie",
    partly_cloudy: "Częściowe zachmurzenie",
    overcast: "Zachmurzenie",
    fog: "Mgła",
    showers: "Przelotne opady",
    rain: "Deszcz",
    snow: "Śnieg",
    storm: "Burza",
    unknown: `Pogoda (kod ${code})`,
  }[kind];
}

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

function pickCurrentHourIndexFromTimes(times) {
  if (!Array.isArray(times) || times.length === 0) return 0;

  const now = Date.now();
  let best = 0;

  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]).getTime();
    if (Number.isNaN(t)) continue;
    if (t <= now) best = i;
    else break;
  }
  return best;
}

function hourHHMM(iso) {
  // "2026-03-04T14:00" -> "14:00"
  const t = (iso || "").split("T")[1];
  return t ? t.slice(0, 5) : "—";
}

function renderNextHoursStrip(wxData) {
  if (!ui.wxNextHours || !ui.wxStability) return;

  const hourly = wxData.hourly;
  if (!hourly || !Array.isArray(hourly.time)) {
    ui.wxStability.textContent = "Brak danych godzinowych pogody";
    ui.wxNextHours.innerHTML = "";
    return;
  }

  const idx0 = pickCurrentHourIndexFromTimes(hourly.time);
  const step = 2; // co 2 godziny
  const take = 10; // 6 kafelków
  const end = Math.min(idx0 + step * take, hourly.time.length);

  const kindNow = wxKindFromCode(
    wxData.current?.weather_code ?? hourly.weather_code?.[idx0],
  );

  let firstChange = -1;
  for (let i = idx0 + step; i < end; i += step) {
    const kind = wxKindFromCode(hourly.weather_code?.[i]);
    if (kind && kind !== kindNow) {
      firstChange = i;
      break;
    }
  }

  if (firstChange === -1) {
    ui.wxStability.textContent = "Nie zanosi się na zmianę";
  } else {
    const inH = firstChange - idx0; // tu już jest w godzinach, bo indeks = 1h
    const fromLabel = wxLabelPL(
      wxData.current?.weather_code ?? hourly.weather_code?.[idx0],
    );
    const toLabel = wxLabelPL(hourly.weather_code?.[firstChange]);
    ui.wxStability.textContent = `Zmiana za ~${inH}h: ${fromLabel} → ${toLabel}`;
  }

  ui.wxNextHours.innerHTML = "";
  for (let i = idx0 + step; i < end; i += step) {
    const code = hourly.weather_code?.[i];
    const isDay = hourly.is_day?.[i] === 1;
    const icon = wxIconPath({ code, isDay, mode: "auto" });

    const div = document.createElement("div");
    div.className = `wxHour${i === firstChange ? " change" : ""}`;
    div.title = wxLabelPL(code);

    const temp = hourly.apparent_temperature?.[i];
    const tempText = Number.isFinite(Number(temp))
      ? `${Math.round(Number(temp))}°`
      : "—";

    div.innerHTML = `
<div class="wxHour__t">${hourHHMM(hourly.time[i])}</div>
<img class="wxHour__icon" src="${icon}" alt="" />
<div class="wxHour__temp">${tempText}</div>
`;

    ui.wxNextHours.appendChild(div);
  }
}

function pickAt(hourly, key, idx) {
  const arr = hourly?.[key];
  if (!Array.isArray(arr)) return null;
  return arr[idx] ?? null;
}

function fmtDateDDMM(dateStr) {
  const [y, m, d] = (dateStr || "").split("-");
  return d && m ? `${d}.${m}` : dateStr;
}

function renderWeatherForecast5Days(wxData) {
  if (!ui.weatherDays) return;

  const daily = wxData.daily;
  if (!daily || !Array.isArray(daily.time)) {
    ui.weatherDays.innerHTML = "";
    return;
  }

  // forecast_days=6 -> [0]=dziś, [1..5]=kolejne 5 dni
  const start = 1;
  const end = Math.min(6, daily.time.length);

  ui.weatherDays.innerHTML = "";

  for (let i = start; i < end; i++) {
    const date = daily.time[i];
    const code = daily.weather_code?.[i];

    const tMax = daily.temperature_2m_max?.[i];
    const tMin = daily.temperature_2m_min?.[i];
    const windMax = daily.wind_speed_10m_max?.[i];

    const icon = wxIconPath({ code, isDay: true, mode: "neutral" }); // neutral dla daily

    const el = document.createElement("div");
    el.className = "weatherDay";
    el.innerHTML = `
    <div class="weatherDay__date">${fmtDateDDMM(date)}</div>
    <div class="weatherDay__main">
      <img class="weatherDay__icon" src="${icon}" alt="" />
      <div>
        <div class="weatherDay__temps">
          ${Number.isFinite(Number(tMax)) ? Math.round(Number(tMax)) : "—"}° /
          ${Number.isFinite(Number(tMin)) ? Math.round(Number(tMin)) : "—"}°
        </div>
        <div class="weatherDay__desc">${wxLabelPL(code)}</div>
      </div>
    </div>
    <div class="weatherDay__desc">
      Wiatr max: ${Number.isFinite(Number(windMax)) ? Math.round(Number(windMax)) : "—"}
      ${wxData.daily_units?.wind_speed_10m_max ?? "km/h"}
    </div>
  `;
    ui.weatherDays.appendChild(el);
  }
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

function formatInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

function renderWeatherNow(wxData) {
  const c = wxData.current;
  const isDay = c.is_day === 1;

  const icon = wxIconPath({ code: c.weather_code, isDay, mode: "auto" });

  ui.wxIcon.src = icon;
  ui.wxIcon.alt = wxLabelPL(c.weather_code);
  ui.wxDesc.textContent = wxLabelPL(c.weather_code);

  const feelsUnit = wxData.current_units?.apparent_temperature ?? "°C";
  ui.wxFeels.textContent = `${formatInt(c.apparent_temperature)} ${feelsUnit}`;

  const windUnit = wxData.current_units?.wind_speed_10m ?? "km/h";
  const dir = windDirToText(Number(c.wind_direction_10m));
  ui.wxWind.textContent = `${formatValue(c.wind_speed_10m)} ${windUnit}${dir ? " " + dir : ""}`;
}

// ===== 5) Główna funkcja =====
async function loadForLocation({ name, latitude, longitude }) {
  const id = ++loadCounter;
  ui.place.textContent = name;
  ui.air.innerHTML = "";
  ui.pollen.innerHTML = "";
  setMsg(`Pobieram dane… (#${id})`);

  try {
    const [airData, wxData] = await Promise.all([
      fetchAirQuality(latitude, longitude),
      fetchWeather(latitude, longitude),
    ]);

    renderWeatherNow(wxData);
    renderWeatherForecast5Days(wxData);

    renderNextHoursStrip(wxData);

    const hourly = airData.hourly || {};

    const units = { ...DEFAULT_UNITS, ...(airData.hourly_units || {}) };

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
    ui.day.textContent = `${d || "—"} ${t || "—"}`;

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
  ui.fabToggle.title = "Prognoza";
  ui.fabToggle.setAttribute("aria-label", "Pokaż prognozę");
}

function showForecast() {
  showingForecast = true;
  ui.viewNow.classList.add("hidden");
  ui.viewForecast.classList.remove("hidden");

  ui.fabToggle.textContent = "Wróć";
  ui.fabToggle.title = "Wróć";
  ui.fabToggle.setAttribute("aria-label", "Wróć do ekranu głównego");
}

ui.fabToggle.onclick = () => {
  if (showingForecast) showNow();
  else showForecast();
};

showNow();

showNow();
