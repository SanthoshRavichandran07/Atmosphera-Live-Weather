/* ========================================
   ATMOSPHERA — WEATHER APP SCRIPT
   ======================================== */

const API_KEY = 'bd5e378503939ddaee76f12ad7a97608';
const BASE    = 'https://api.openweathermap.org';

// ---- STATE ----
let currentUnit   = 'C';  // 'C' or 'F'
let currentData   = null; // latest weather API response
let forecastData  = null; // latest forecast API response
let clockInterval = null; // local-time ticker
let lastCity      = '';

// ---- DOM REFS ----
const cityInput     = document.getElementById('cityInput');
const searchBtn     = document.getElementById('searchBtn');
const clearBtn      = document.getElementById('clearBtn');
const refreshBtn    = document.getElementById('refreshBtn');
const locationBtn   = document.getElementById('locationBtn');
const geoBtn        = document.getElementById('geoBtn');
const geoHint       = document.getElementById('geoHint');
const btnCelsius    = document.getElementById('btnCelsius');
const btnFahrenheit = document.getElementById('btnFahrenheit');
const loading       = document.getElementById('loading');
const errorMsg      = document.getElementById('errorMsg');
const errorText     = document.getElementById('errorText');
const weatherCard   = document.getElementById('weatherCard');
const suggestions   = document.getElementById('suggestions');
const weatherOverlay= document.getElementById('weatherOverlay');
const recentSection = document.getElementById('recentSection');
const recentList    = document.getElementById('recentList');

// ========================================
//  TEMPERATURE CONVERSION
// ========================================
function kelvinToCelsius(k)    { return Math.round(k - 273.15); }
function celsiusToFahrenheit(c){ return Math.round(c * 9/5 + 32); }

function displayTemp(kelvin) {
  const c = kelvinToCelsius(kelvin);
  return currentUnit === 'C' ? `${c}°C` : `${celsiusToFahrenheit(c)}°F`;
}

function displayTempVal(kelvin) {
  const c = kelvinToCelsius(kelvin);
  return currentUnit === 'C' ? c : celsiusToFahrenheit(c);
}

// ========================================
//  WEATHER EMOJI
// ========================================
function getWeatherEmoji(id, isDay = true) {
  if (id >= 200 && id < 300) return '⛈️';
  if (id >= 300 && id < 400) return '🌦️';
  if (id >= 500 && id < 510) return '🌧️';
  if (id === 511)             return '🌨️';
  if (id >= 511 && id < 600) return '🌧️';
  if (id >= 600 && id < 700) return '❄️';
  if (id >= 700 && id < 800) return '🌫️';
  if (id === 800)             return isDay ? '☀️' : '🌙';
  if (id === 801)             return isDay ? '🌤️' : '🌙';
  if (id === 802)             return '⛅';
  if (id >= 803 && id < 900) return '☁️';
  return '🌡️';
}

// ========================================
//  WIND DIRECTION
// ========================================
function windDirLabel(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

// ========================================
//  DYNAMIC BACKGROUND OVERLAY
// ========================================
function applyWeatherTheme(weatherId, isDay) {
  let gradient = '';
  if (weatherId >= 200 && weatherId < 300)
    gradient = 'radial-gradient(ellipse at 50% 0%, rgba(60,60,100,.35) 0%, transparent 70%)';
  else if (weatherId >= 500 && weatherId < 600)
    gradient = 'radial-gradient(ellipse at 50% 0%, rgba(30,60,100,.4) 0%, transparent 70%)';
  else if (weatherId >= 600 && weatherId < 700)
    gradient = 'radial-gradient(ellipse at 50% 0%, rgba(180,210,255,.08) 0%, transparent 70%)';
  else if (weatherId === 800 && isDay)
    gradient = 'radial-gradient(ellipse at 70% 10%, rgba(255,213,79,.07) 0%, transparent 55%)';
  else if (weatherId >= 801 && weatherId < 900)
    gradient = 'radial-gradient(ellipse at 50% 0%, rgba(100,130,180,.12) 0%, transparent 65%)';

  weatherOverlay.style.background = gradient;
  weatherOverlay.style.opacity    = '1';
}

// ========================================
//  TIME HELPERS
// ========================================
function formatUnixTime(unix, timezoneOffset) {
  const d = new Date((unix + timezoneOffset) * 1000);
  return d.toUTCString().slice(17, 22); // HH:MM
}

function startLocalClock(timezoneOffset) {
  clearInterval(clockInterval);
  const el = document.getElementById('localTime');
  function tick() {
    const now    = Math.floor(Date.now() / 1000);
    const local  = new Date((now + timezoneOffset) * 1000);
    const hh     = String(local.getUTCHours()).padStart(2,'0');
    const mm     = String(local.getUTCMinutes()).padStart(2,'0');
    const ss     = String(local.getUTCSeconds()).padStart(2,'0');
    el.textContent = `Local time: ${hh}:${mm}:${ss}`;
  }
  tick();
  clockInterval = setInterval(tick, 1000);
}

// ========================================
//  RECENT SEARCHES (localStorage)
// ========================================
function getRecent() {
  try { return JSON.parse(localStorage.getItem('atm_recent') || '[]'); }
  catch { return []; }
}

function saveRecent(city) {
  let list = getRecent().filter(c => c.toLowerCase() !== city.toLowerCase());
  list.unshift(city);
  list = list.slice(0, 6);
  localStorage.setItem('atm_recent', JSON.stringify(list));
}

function renderRecent() {
  const list = getRecent();
  if (list.length === 0) {
    recentSection.style.display = 'none';
    return;
  }
  recentSection.style.display = 'block';
  recentList.innerHTML = list.map(c =>
    `<div class="recent-chip" data-city="${c}">🕒 ${c}</div>`
  ).join('');
  recentList.querySelectorAll('.recent-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      cityInput.value = chip.dataset.city;
      fetchWeather(chip.dataset.city);
    });
  });
}

// ========================================
//  CITY SUGGESTIONS (hardcoded list)
// ========================================
const POPULAR_CITIES = [
  'London','New York','Tokyo','Paris','Sydney','Dubai','Mumbai','Singapore',
  'Berlin','Los Angeles','Toronto','Seoul','Shanghai','Istanbul','Cape Town',
  'Moscow','Amsterdam','Bangkok','Rome','Barcelona','Chicago','Melbourne',
  'Hong Kong','Bangalore','Karachi','Lagos','Johannesburg','Nairobi','Lima'
];

function showSuggestions(query) {
  if (query.length < 2) { suggestions.style.display = 'none'; return; }
  const matches = POPULAR_CITIES.filter(c =>
    c.toLowerCase().startsWith(query.toLowerCase())
  ).slice(0, 5);
  if (matches.length === 0) { suggestions.style.display = 'none'; return; }
  suggestions.innerHTML = matches.map(c =>
    `<div class="suggestion-item" data-city="${c}"><span class="sug-icon">🌆</span>${c}</div>`
  ).join('');
  suggestions.style.display = 'block';
  suggestions.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      cityInput.value = item.dataset.city;
      suggestions.style.display = 'none';
      fetchWeather(item.dataset.city);
    });
  });
}

// ========================================
//  UV INDEX
// ========================================
async function fetchUV(lat, lon) {
  try {
    const res  = await fetch(`${BASE}/data/2.5/uvi?lat=${lat}&lon=${lon}&appid=${API_KEY}`);
    const data = await res.json();
    const uv   = Math.round(data.value ?? 0);
    document.getElementById('uvVal').textContent = uv;
    const pct = Math.min((uv / 11) * 100, 100);
    document.getElementById('uvBar').style.width = pct + '%';
  } catch {
    document.getElementById('uvVal').textContent = 'N/A';
  }
}

// ========================================
//  HUMIDITY RING
// ========================================
function animateHumidityRing(pct) {
  const circumference = 201; // 2 * Math.PI * 32 ≈ 201
  const offset = circumference - (pct / 100) * circumference;
  document.getElementById('humRing').style.strokeDashoffset = offset;
  document.getElementById('humCenter').textContent = pct + '%';
}

// ========================================
//  FORECAST
// ========================================
async function fetchForecast(city) {
  try {
    const res  = await fetch(`${BASE}/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}`);
    const data = await res.json();
    if (data.cod !== '200') return;
    forecastData = data;
    renderForecast(data);
  } catch { /* silent */ }
}

function renderForecast(data) {
  // Group by date, pick midday reading
  const byDay = {};
  data.list.forEach(item => {
    const date = item.dt_txt.split(' ')[0];
    const hour = parseInt(item.dt_txt.split(' ')[1]);
    if (!byDay[date]) byDay[date] = item;
    if (Math.abs(hour - 12) < Math.abs(parseInt(byDay[date].dt_txt.split(' ')[1]) - 12)) {
      byDay[date] = item;
    }
  });

  const days = Object.entries(byDay).slice(0, 5);
  const today = new Date().toISOString().split('T')[0];

  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  document.getElementById('forecastRow').innerHTML = days.map(([date, item]) => {
    const d     = new Date(date + 'T12:00:00');
    const name  = date === today ? 'Today' : dayNames[d.getDay()];
    const icon  = getWeatherEmoji(item.weather[0].id);
    const max   = displayTemp(item.main.temp_max);
    const min   = displayTemp(item.main.temp_min);
    return `
      <div class="forecast-day ${date === today ? 'today' : ''}">
        <div class="fc-day-name">${name}</div>
        <div class="fc-icon">${icon}</div>
        <div class="fc-temp-max">${max}</div>
        <div class="fc-temp-min">${min}</div>
      </div>`;
  }).join('');
}

// ========================================
//  POPULATE WEATHER UI
// ========================================
function populateUI(data) {
  const isDay = data.dt > data.sys.sunrise && data.dt < data.sys.sunset;
  const wid   = data.weather[0].id;

  // Main
  document.getElementById('cityName').textContent  = data.name;
  document.getElementById('cityMeta').textContent  = `${data.sys.country} · ${new Date().toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}`;
  document.getElementById('weatherIcon').textContent = getWeatherEmoji(wid, isDay);
  document.getElementById('tempBig').textContent   = displayTempVal(data.main.temp);
  document.getElementById('tempUnit').textContent  = currentUnit === 'C' ? '°C' : '°F';
  document.getElementById('weatherDesc').textContent = data.weather[0].description;
  document.getElementById('feelsLikeBadge').textContent = `Feels ${displayTemp(data.main.feels_like)}`;

  // Pills
  document.getElementById('tempHigh').textContent  = displayTemp(data.main.temp_max);
  document.getElementById('tempLow').textContent   = displayTemp(data.main.temp_min);
  document.getElementById('humidity').textContent  = data.main.humidity;
  document.getElementById('wind').textContent      = Math.round(data.wind.speed);

  // Detail grid
  document.getElementById('sunrise').textContent   = formatUnixTime(data.sys.sunrise, data.timezone);
  document.getElementById('sunset').textContent    = formatUnixTime(data.sys.sunset,  data.timezone);
  document.getElementById('pressure').textContent  = data.main.pressure + ' hPa';
  document.getElementById('visibility').textContent= data.visibility ? (data.visibility/1000).toFixed(1)+' km' : 'N/A';
  document.getElementById('windDir').textContent   = windDirLabel(data.wind.deg ?? 0);
  document.getElementById('cloudCover').textContent= (data.clouds?.all ?? 0) + '%';

  // Local clock
  startLocalClock(data.timezone);

  // Humidity ring
  animateHumidityRing(data.main.humidity);

  // UV (uses lat/lon)
  if (data.coord) fetchUV(data.coord.lat, data.coord.lon);

  // Theme
  applyWeatherTheme(wid, isDay);
}

// ========================================
//  FETCH WEATHER (by city name)
// ========================================
async function fetchWeather(city) {
  city = (city || cityInput.value).trim();
  if (!city) { cityInput.focus(); return; }

  lastCity = city;
  suggestions.style.display = 'none';

  // Show loading
  loading.style.display   = 'block';
  errorMsg.style.display  = 'none';
  weatherCard.style.display = 'none';
  searchBtn.disabled = true;

  try {
    const res  = await fetch(`${BASE}/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}`);
    const data = await res.json();

    if (data.cod !== 200) throw new Error(data.message || 'City not found');

    currentData = data;
    saveRecent(data.name);
    renderRecent();
    populateUI(data);
    fetchForecast(data.name);

    loading.style.display     = 'none';
    weatherCard.style.display = 'flex';

  } catch (e) {
    loading.style.display   = 'none';
    errorText.textContent   = e.message === 'city not found'
      ? '🌫️ City not found. Check spelling and try again.'
      : `⚠️ ${e.message}`;
    errorMsg.style.display  = 'block';
  }

  searchBtn.disabled = false;
}

// ========================================
//  FETCH BY COORDINATES (geolocation)
// ========================================
async function fetchByCoords(lat, lon) {
  loading.style.display     = 'block';
  errorMsg.style.display    = 'none';
  weatherCard.style.display = 'none';
  searchBtn.disabled = true;

  try {
    const res  = await fetch(`${BASE}/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}`);
    const data = await res.json();

    if (data.cod !== 200) throw new Error(data.message || 'Location error');

    currentData = data;
    cityInput.value = data.name;
    lastCity = data.name;
    saveRecent(data.name);
    renderRecent();
    populateUI(data);
    fetchForecast(data.name);

    loading.style.display     = 'none';
    weatherCard.style.display = 'flex';
    geoHint.style.display     = 'none';

  } catch (e) {
    loading.style.display  = 'none';
    errorText.textContent  = `⚠️ ${e.message}`;
    errorMsg.style.display = 'block';
  }

  searchBtn.disabled = false;
}

// ========================================
//  UNIT TOGGLE — re-render with new unit
// ========================================
function switchUnit(unit) {
  currentUnit = unit;
  btnCelsius.classList.toggle('active', unit === 'C');
  btnFahrenheit.classList.toggle('active', unit === 'F');

  if (currentData) {
    // Update temperatures in-place
    document.getElementById('tempBig').textContent   = displayTempVal(currentData.main.temp);
    document.getElementById('tempUnit').textContent  = unit === 'C' ? '°C' : '°F';
    document.getElementById('feelsLikeBadge').textContent = `Feels ${displayTemp(currentData.main.feels_like)}`;
    document.getElementById('tempHigh').textContent  = displayTemp(currentData.main.temp_max);
    document.getElementById('tempLow').textContent   = displayTemp(currentData.main.temp_min);
  }
  if (forecastData) renderForecast(forecastData);
}

// ========================================
//  GEOLOCATION
// ========================================
function requestGeolocation() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => fetchByCoords(pos.coords.latitude, pos.coords.longitude),
    ()  => { errorText.textContent = '📍 Location access denied. Please search manually.'; errorMsg.style.display = 'block'; }
  );
}

// ========================================
//  EVENT LISTENERS
// ========================================
searchBtn.addEventListener('click', () => fetchWeather());

cityInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') fetchWeather();
});

cityInput.addEventListener('input', e => {
  showSuggestions(e.target.value);
});

// Close suggestions on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) suggestions.style.display = 'none';
});

clearBtn.addEventListener('click', () => {
  weatherCard.style.display = 'none';
  errorMsg.style.display    = 'none';
  cityInput.value           = '';
  currentData               = null;
  forecastData              = null;
  lastCity                  = '';
  clearInterval(clockInterval);
  weatherOverlay.style.opacity = '0';
  cityInput.focus();
});

refreshBtn.addEventListener('click', () => {
  if (lastCity) fetchWeather(lastCity);
});

locationBtn.addEventListener('click', requestGeolocation);
geoBtn.addEventListener('click',      requestGeolocation);

btnCelsius.addEventListener('click',    () => switchUnit('C'));
btnFahrenheit.addEventListener('click', () => switchUnit('F'));

// ========================================
//  INIT
// ========================================
renderRecent();

// Auto-fetch if only one recent city
const recent = getRecent();
if (recent.length > 0) {
  cityInput.value = recent[0];
  fetchWeather(recent[0]);
}
