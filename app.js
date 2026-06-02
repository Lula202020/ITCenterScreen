const STORAGE_KEY = "team-planner-state-v1";
const THEME_KEY = "team-planner-theme-v1";
const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const CLOCK_REFRESH_MS = 1000;
const STATE_API_URL = "/api/state";
const WEATHER_LOCATION = { latitude: 48.78, longitude: 11.42, label: "Ingolstadt" };
const DEFAULT_TEAM_NAMES = ["Sam", "Jordan", "Mila"];
const POPUP_SITE_URL = "http://localhost:8080"; // Flappy Bird WebGL server

const FIXED_CATEGORIES = [
  { id: "buero", name: "Büro" },
  { id: "unterwegs", name: "Unterwegs" },
  { id: "feierabend-pause", name: "Feierabend/Pause" },
  { id: "berufsschule", name: "Berufsschule" },
  { id: "urlaub", name: "Urlaub" }
];

const RETURN_DATE_REQUIRED = new Set(["berufsschule", "urlaub"]);

// Zentraler UI-Zustand: die App rendert daraus Board, Admin-Ansicht und Dialoge.
const state = {
  categories: [],
  members: [],
  selectedMemberId: null,
  adminOpen: false,
  theme: "light"
};

const refs = {
  board: document.getElementById("board"),
  weatherLocation: document.getElementById("weatherLocation"),
  weatherStatus: document.getElementById("weatherStatus"),
  weatherIcon: document.getElementById("weatherIcon"),
  weatherTemp: document.getElementById("weatherTemp"),
  weatherSummary: document.getElementById("weatherSummary"),
  weatherFeelsLike: document.getElementById("weatherFeelsLike"),
  weatherWind: document.getElementById("weatherWind"),
  weatherPrecip: document.getElementById("weatherPrecip"),
  weatherHumidity: document.getElementById("weatherHumidity"),
  weatherUv: document.getElementById("weatherUv"),
  weatherVisibility: document.getElementById("weatherVisibility"),
  weatherForecast: document.getElementById("weatherForecast"),
  weatherUpdateState: document.getElementById("weatherUpdateState"),
  clockTime: document.getElementById("clockTime"),
  clockDate: document.getElementById("clockDate"),
  memberForm: document.getElementById("memberForm"),
  memberName: document.getElementById("memberName"),
  memberCategory: document.getElementById("memberCategory"),
  themeToggle: document.getElementById("themeToggle"),
  themeToggleIcon: document.getElementById("themeToggleIcon"),
  adminToggle: document.getElementById("adminToggle"),
  adminClose: document.getElementById("adminClose"),
  adminPanel: document.getElementById("adminPanel"),
  adminBackdrop: document.getElementById("adminBackdrop"),
  memberManageList: document.getElementById("memberManageList"),
  returnDateDialog: document.getElementById("returnDateDialog"),
  returnDateBackdrop: document.getElementById("returnDateBackdrop"),
  returnDateDescription: document.getElementById("returnDateDescription"),
  calendarPrev: document.getElementById("calendarPrev"),
  calendarNext: document.getElementById("calendarNext"),
  calendarLabel: document.getElementById("calendarLabel"),
  calendarGrid: document.getElementById("calendarGrid")
  ,
  forecastDialog: document.getElementById("forecastDialog"),
  forecastBackdrop: document.getElementById("forecastBackdrop"),
  forecastClose: document.getElementById("forecastClose"),
  forecastTitle: document.getElementById("forecastTitle"),
  forecastDate: document.getElementById("forecastDate"),
  forecastChart: document.getElementById("forecastChart"),
  forecastChartTemperature: document.getElementById("forecastChartTemperature"),
  forecastChartRainProbability: document.getElementById("forecastChartRainProbability"),
  forecastChartRainAmount: document.getElementById("forecastChartRainAmount"),
  forecastChartUv: document.getElementById("forecastChartUv"),
  siteModal: document.getElementById("siteModal"),
  siteModalBackdrop: document.getElementById("siteModalBackdrop"),
  siteModalClose: document.getElementById("siteModalClose"),
  siteModalInfo: document.getElementById("siteModalInfo"),
  siteModalFrame: document.getElementById("siteModalFrame"),
  siteModalOpenNew: document.getElementById("siteModalOpenNew")
};

let returnDateResolver = null;
let weatherRefreshTimerId = null;
let clockRefreshTimerId = null;
let saveStateChain = Promise.resolve();
let latestWeatherData = null;
let forecastChartInstances = [];
let calendarState = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  minDate: todayIsoDate(),
  selectedDate: null
};

async function initialize() {
  // Reihenfolge ist wichtig: erst Daten laden, dann UI aufbauen, dann Nebenfunktionen starten.
  loadTheme();
  await loadState();
  seedMembers();
  renderCategorySelect();
  renderBoard();
  renderAdminLists();
  setupForms();
  setupThemeToggle();
  setupAdminPanel();
  setupForecastDialog();
  setupPopupButton();
  startWeatherRefresh();
  startClockRefresh();
  loadWeather();
  updateClock();
  applyTheme();
  applyAdminState();
  await saveState();
}

function setupPopupButton() {
  const btn = document.getElementById("openPopupBtn");
  if (!btn) return;

  btn.addEventListener("pointerup", () => {
    const url = POPUP_SITE_URL;
    openSitePopup(url);
  });
}

function setupForecastDialog() {
  if (!refs.forecastDialog || !refs.forecastBackdrop || !refs.forecastClose) {
    return;
  }

  const closeForecastDialog = () => {
    destroyForecastCharts();
    refs.forecastDialog.hidden = true;
    refs.forecastBackdrop.hidden = true;
  };

  refs.forecastBackdrop.addEventListener("pointerup", closeForecastDialog);
  refs.forecastClose.addEventListener("pointerup", closeForecastDialog);
}

function openForecastDialog(dayData) {
  if (!refs.forecastDialog || !refs.forecastBackdrop) {
    return;
  }

  refs.forecastTitle.textContent = dayData.dayLabel;
  refs.forecastDate.textContent = dayData.dateLabel;

  renderHourlyForecastChart(dayData.dateIso);

  refs.forecastDialog.hidden = false;
  refs.forecastBackdrop.hidden = false;
}

function openSitePopup(siteUrl) {
  // Show modal inside the current page with centered iframe.
  if (!refs.siteModal || !refs.siteModalFrame) {
    // Fallback: open in new window if modal elements missing
    const win = window.open(siteUrl, "sitePopup", "width=1000,height=700,resizable=yes,scrollbars=yes");
    if (win) try { win.focus(); } catch (e) {}
    return win;
  }

  refs.siteModalInfo.textContent = siteUrl;
  refs.siteModalFrame.src = siteUrl;
  refs.siteModal.classList.add('open');

  const closeModal = () => {
    refs.siteModal.classList.remove('open');
    try {
      refs.siteModalFrame.src = 'about:blank';
    } catch (e) {}
    refs.siteModalBackdrop.removeEventListener('pointerup', onBackdrop);
    refs.siteModalClose.removeEventListener('pointerup', onClose);
    refs.siteModalOpenNew.removeEventListener('pointerup', onOpenNew);
  };

  function onBackdrop() { closeModal(); }
  function onClose() { closeModal(); }
  function onOpenNew() { window.open(siteUrl, '_blank'); }

  refs.siteModalBackdrop.addEventListener('pointerup', onBackdrop);
  refs.siteModalClose.addEventListener('pointerup', onClose);
  refs.siteModalOpenNew.addEventListener('pointerup', onOpenNew);

  return {
    close: () => closeModal()
  };
}

function setupForms() {
  refs.memberForm.addEventListener("submit", onMemberFormSubmit);
}

function setupAdminPanel() {
  refs.adminToggle.addEventListener("pointerup", () => setAdminOpen(true));
  refs.adminClose.addEventListener("pointerup", () => setAdminOpen(false));
  refs.adminBackdrop.addEventListener("pointerup", () => setAdminOpen(false));
}

function setupThemeToggle() {
  refs.themeToggle.addEventListener("pointerup", toggleTheme);
}

function startWeatherRefresh() {
  if (weatherRefreshTimerId) {
    clearInterval(weatherRefreshTimerId);
  }

  weatherRefreshTimerId = setInterval(() => {
    void loadWeather();
  }, WEATHER_REFRESH_MS);
}

function startClockRefresh() {
  if (clockRefreshTimerId) {
    clearInterval(clockRefreshTimerId);
  }

  clockRefreshTimerId = setInterval(() => {
    updateClock();
  }, CLOCK_REFRESH_MS);
}

function seedMembers() {
  if (state.members.length > 0) {
    return;
  }

  // Fallback-Daten machen die App auch beim ersten Start direkt nutzbar.
  DEFAULT_TEAM_NAMES.forEach((name, index) => {
    state.members.push(createMember(name, state.categories[index % state.categories.length].id));
  });
}

function onMemberFormSubmit(event) {
  event.preventDefault();

  const name = refs.memberName.value.trim();
  const categoryId = refs.memberCategory.value;

  if (!name || !categoryId) {
    return;
  }

  state.members.push(createMember(name, categoryId));
  refs.memberName.value = "";
  renderBoard();
  renderAdminLists();
  void saveState();
}

function createMember(name, categoryId) {
  return {
    id: crypto.randomUUID(),
    name,
    categoryId,
    returnDate: null
  };
}

function loadTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  state.theme = savedTheme === "dark" ? "dark" : "light";
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme();
  saveTheme();
}

function saveTheme() {
  localStorage.setItem(THEME_KEY, state.theme);
}

function setAdminOpen(isOpen) {
  state.adminOpen = isOpen;
  applyAdminState();
}

function applyTheme() {
  document.body.dataset.theme = state.theme;
  refs.themeToggleIcon.textContent = state.theme === "dark" ? "☀️" : "🌙";
  refs.themeToggle.setAttribute("aria-label", state.theme === "dark" ? "Hellmodus aktivieren" : "Dunkelmodus aktivieren");
  refs.themeToggle.setAttribute("aria-pressed", String(state.theme === "light"));
}

function applyAdminState() {
  refs.adminPanel.classList.toggle("open", state.adminOpen);
  refs.adminBackdrop.classList.toggle("open", state.adminOpen);
  refs.adminToggle.setAttribute("aria-expanded", String(state.adminOpen));
  document.body.classList.toggle("admin-open", state.adminOpen);
}

function renderCategorySelect() {
  refs.memberCategory.innerHTML = "";

  const fragment = document.createDocumentFragment();
  state.categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    fragment.append(option);
  });

  refs.memberCategory.append(fragment);
}

function renderBoard() {
  refs.board.innerHTML = "";

  const fragment = document.createDocumentFragment();
  state.categories.forEach((category, index) => {
    fragment.append(createCategoryColumn(category, index));
  });

  refs.board.append(fragment);
  updateSelectedMemberVisuals();
}

function createCategoryColumn(category, index) {
  const column = document.createElement("article");
  column.className = "column stagger";
  column.dataset.categoryId = category.id;
  column.style.animationDelay = `${index * 45}ms`;

  column.addEventListener("click", () => {
    void moveSelectedMemberToCategory(category.id);
  });

  const header = document.createElement("div");
  header.className = "column-head";

  const title = document.createElement("h3");
  title.className = "column-title";
  title.textContent = category.name;

  const list = document.createElement("div");
  list.className = "member-list";

  state.members
    .filter((member) => member.categoryId === category.id)
    .forEach((member) => {
      list.append(createMemberCard(member));
    });

  header.append(title);
  column.append(header, list);
  return column;
}

function createMemberCard(member) {
  const card = document.createElement("div");
  card.className = "member-card";
  card.dataset.memberId = member.id;

  if (state.selectedMemberId === member.id) {
    card.classList.add("selected-member");
  }

  populateMemberCard(card, member);

  card.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMemberSelection(member.id);
  });

  return card;
}

function populateMemberCard(card, member) {
  card.innerHTML = "";

  const meta = document.createElement("div");
  meta.className = "member-meta";

  const avatar = document.createElement("div");
  avatar.className = "member-avatar";
  avatar.textContent = initialsFor(member.name);

  const textWrap = document.createElement("div");
  textWrap.className = "member-text";

  const name = document.createElement("div");
  name.className = "member-name";
  name.textContent = member.name;
  textWrap.append(name);

  if (member.returnDate && requiresReturnDate(member.categoryId)) {
    const returnInfo = document.createElement("div");
    returnInfo.className = "member-return";
    returnInfo.textContent = `Rückkehr: ${formatDateDe(member.returnDate)}`;
    textWrap.append(returnInfo);
  }

  meta.append(avatar, textWrap);
  card.append(meta);
}

function toggleMemberSelection(memberId) {
  state.selectedMemberId = state.selectedMemberId === memberId ? null : memberId;
  updateSelectedMemberVisuals();
}

async function moveSelectedMemberToCategory(targetCategoryId) {
  if (!state.selectedMemberId) {
    return;
  }

  const member = state.members.find((item) => item.id === state.selectedMemberId);
  if (!member || member.categoryId === targetCategoryId) {
    return;
  }

  const selectedCard = document.querySelector(`.member-card[data-member-id="${member.id}"]`);
  const targetColumn = refs.board.querySelector(`.column[data-category-id="${targetCategoryId}"]`);
  const targetList = targetColumn ? targetColumn.querySelector(".member-list") : null;
  const sourceList = selectedCard ? selectedCard.parentElement : null;

  if (!selectedCard || !targetList || !sourceList) {
    renderBoard();
    return;
  }

  const sourceCategoryId = member.categoryId;
  const sourceReturnDate = member.returnDate || null;

  // Das DOM wird sofort umgehängt; falls ein Rückkehrdatum nötig ist, wird bei Abbruch sauber zurückgerollt.
  targetList.append(selectedCard);
  member.categoryId = targetCategoryId;
  member.returnDate = null;
  populateMemberCard(selectedCard, member);

  if (requiresReturnDate(targetCategoryId)) {
    const returnDate = await askForReturnDate(member.name, targetCategoryId, sourceReturnDate);
    if (!returnDate) {
      member.categoryId = sourceCategoryId;
      member.returnDate = sourceReturnDate;
      sourceList.append(selectedCard);
      populateMemberCard(selectedCard, member);
      updateSelectedMemberVisuals();
      void saveState();
      return;
    }

    member.returnDate = returnDate;
    populateMemberCard(selectedCard, member);
  }

  state.selectedMemberId = null;
  updateSelectedMemberVisuals();
  void saveState();
}

function updateSelectedMemberVisuals() {
  refs.board.querySelectorAll(".member-card").forEach((card) => {
    const isSelected = state.selectedMemberId && card.dataset.memberId === state.selectedMemberId;
    card.classList.toggle("selected-member", Boolean(isSelected));
  });
}

function renderAdminLists() {
  refs.memberManageList.innerHTML = "";

  if (state.members.length === 0) {
    const empty = document.createElement("p");
    empty.className = "manage-empty";
    empty.textContent = "Keine Mitglieder vorhanden.";
    refs.memberManageList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.members
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((member) => {
      fragment.append(createManageRow(member));
    });

  refs.memberManageList.append(fragment);
}

function createManageRow(member) {
  const row = document.createElement("div");
  row.className = "manage-row";

  const label = document.createElement("span");
  label.textContent = member.name;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Entfernen";
  remove.addEventListener("pointerup", () => {
    deleteMember(member.id);
  });

  row.append(label, remove);
  return row;
}

function deleteMember(memberId) {
  state.members = state.members.filter((item) => item.id !== memberId);
  if (state.selectedMemberId === memberId) {
    state.selectedMemberId = null;
  }

  renderBoard();
  renderAdminLists();
  void saveState();
}

async function loadState() {
  state.categories = FIXED_CATEGORIES.map((category) => ({ ...category }));
  const categorySet = new Set(state.categories.map((category) => category.id));

  try {
    const response = await fetch(STATE_API_URL, { cache: "no-store" });
    if (!response.ok) {
      state.members = loadLegacyMembers(categorySet);
      return;
    }

    const parsed = await response.json();
    state.members = normalizeMembers(parsed.members, categorySet);

    if (state.members.length === 0) {
      state.members = loadLegacyMembers(categorySet);
    }
  } catch {
    state.members = loadLegacyMembers(categorySet);
  }
}

function loadLegacyMembers(categorySet) {
  try {
    const legacyRaw = localStorage.getItem(STORAGE_KEY);
    if (!legacyRaw) {
      return [];
    }

    const legacyParsed = JSON.parse(legacyRaw);
    return normalizeMembers(legacyParsed.members, categorySet);
  } catch {
    return [];
  }
}

function normalizeMembers(members, categorySet) {
  if (!Array.isArray(members)) {
    return [];
  }

  // Ein einziger Normalisierungspfad verhindert, dass API- und Legacy-Daten auseinanderlaufen.
  return members
    .filter((member) => member && typeof member.id === "string" && typeof member.name === "string" && typeof member.categoryId === "string")
    .map((member) => ({
      id: member.id,
      name: member.name.trim(),
      categoryId: member.categoryId,
      returnDate: typeof member.returnDate === "string" ? member.returnDate : null
    }))
    .filter((member) => member.name.length > 0 && categorySet.has(member.categoryId));
}

function saveState() {
  const snapshot = { members: state.members };

  // Mehrere Schreibvorgänge werden serialisiert, damit sich keine parallelen PUTs überschneiden.
  saveStateChain = saveStateChain
    .catch(() => undefined)
    .then(() => persistState(snapshot));

  return saveStateChain.catch((error) => {
    console.warn("State save failed", error);
  });
}

async function persistState(snapshot) {
  const response = await fetch(STATE_API_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(snapshot)
  });

  if (!response.ok) {
    throw new Error(`State save failed: ${response.status}`);
  }
}

async function loadWeather() {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(WEATHER_LOCATION.latitude));
    url.searchParams.set("longitude", String(WEATHER_LOCATION.longitude));
    url.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,visibility,uv_index");
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant,wind_gusts_10m_max,uv_index_max,sunrise,sunset");
    url.searchParams.set("hourly", "temperature_2m,precipitation_probability,precipitation,uv_index");
    url.searchParams.set("timezone", "auto");

    refs.weatherStatus.textContent = "Wetterdaten werden aktualisiert.";

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Weather request failed: ${response.status}`);
    }

    const data = await response.json();
    renderWeather(data, WEATHER_LOCATION.label);
    refs.weatherUpdateState.textContent = "Live-Daten";
  } catch {
    renderWeatherFallback();
    refs.weatherUpdateState.textContent = "Offline-Fallback";
  }
}

function renderWeather(data, locationLabel) {
  const current = data.current || {};
  const daily = data.daily || {};

  latestWeatherData = data;

  refs.weatherLocation.textContent = `${locationLabel} · ${data.timezone || "lokale Zeitzone"}`;
  refs.weatherIcon.textContent = weatherEmoji(current.weather_code);
  refs.weatherTemp.textContent = `${Math.round(current.temperature_2m ?? 0)}°C`;
  refs.weatherSummary.textContent = weatherText(current.weather_code);
  refs.weatherFeelsLike.textContent = `${Math.round(current.apparent_temperature ?? current.temperature_2m ?? 0)}°C`;
  refs.weatherWind.textContent = `${Math.round((current.wind_speed_10m ?? 0) * 0.621371)} km/h`;
  refs.weatherPrecip.textContent = `${Number(current.precipitation ?? 0).toFixed(1)} mm`;
  refs.weatherHumidity.textContent = `${Math.round(current.relative_humidity_2m ?? 0)}%`;
  refs.weatherUv.textContent = String(current.uv_index ?? "-");
  refs.weatherVisibility.textContent = `${Math.round((current.visibility ?? 0) / 1000)} km`;
  refs.weatherStatus.textContent = `Status: ${formatWeatherDate(current.time)}.`;

  refs.weatherForecast.innerHTML = "";
  const forecastCount = Math.min(daily.time?.length || 0, 4);
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < forecastCount; index += 1) {
    fragment.append(createForecastCard(daily, index));
  }

  refs.weatherForecast.append(fragment);
}

function createForecastCard(daily, index) {
  const dayCard = document.createElement("button");
  dayCard.className = "forecast-card";
  dayCard.type = "button";

  // Die Karten bleiben bewusst klein und datengetrieben, damit der Forecast leicht austauschbar ist.
  const dayDate = new Date(`${daily.time[index]}T00:00:00`);
  const dayName = new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(dayDate);
  const dayLabel = new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(dayDate);
  const dateLabel = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long" }).format(dayDate);
  const weatherCode = daily.weather_code?.[index];
  dayCard.setAttribute("aria-label", `Details für ${dayLabel}`);
  dayCard.innerHTML = `
      <div class="forecast-day">${dayName}</div>
      <div class="forecast-icon">${weatherEmoji(weatherCode)}</div>
      <div class="forecast-range">${Math.round(daily.temperature_2m_min?.[index] ?? 0)}° / ${Math.round(daily.temperature_2m_max?.[index] ?? 0)}°</div>
      <div class="forecast-precip">Regen: ${Math.round(daily.precipitation_probability_max?.[index] ?? 0)}%</div>
    `;

  dayCard.addEventListener("click", () => {
    openForecastDialog({
      dateIso: daily.time[index],
      dayLabel: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
      dateLabel
    });
  });

  return dayCard;
}

function renderWeatherFallback() {
  latestWeatherData = null;
  refs.weatherLocation.textContent = "Ingolstadt · Fallback";
  refs.weatherIcon.textContent = "⛅";
  refs.weatherTemp.textContent = "--°C";
  refs.weatherSummary.textContent = "Wetterdaten nicht verfügbar";
  refs.weatherFeelsLike.textContent = "--°C";
  refs.weatherWind.textContent = "-- km/h";
  refs.weatherPrecip.textContent = "-- mm";
  refs.weatherHumidity.textContent = "--%";
  refs.weatherUv.textContent = "--";
  refs.weatherVisibility.textContent = "-- km";
  refs.weatherStatus.textContent = "Kein Live-Zugriff auf Wetterdaten.";

  refs.weatherForecast.innerHTML = "";
  const fragment = document.createDocumentFragment();

  ["Heute", "Morgen", "Übermorgen", "In 4 Tagen"].forEach((label) => {
    const card = document.createElement("article");
    card.className = "forecast-card";
    card.innerHTML = `
      <div class="forecast-day">${label}</div>
      <div class="forecast-icon">⛅</div>
      <div class="forecast-range">--° / --°</div>
      <div class="forecast-precip">Details nicht verfügbar</div>
    `;
    fragment.append(card);
  });

  refs.weatherForecast.append(fragment);
}

function renderHourlyForecastChart(dateIso) {
  if (!window.Chart || !refs.forecastChartTemperature || !refs.forecastChartRainProbability || !refs.forecastChartRainAmount || !refs.forecastChartUv) {
    return;
  }

  destroyForecastCharts();

  const hourly = latestWeatherData?.hourly;
  const entries = getHourlyForecastEntries(hourly, dateIso);

  if (entries.length === 0) {
    return;
  }

  const labels = entries.map((entry) => formatHourLabel(entry.time));
  const palette = getForecastChartPalette();

  forecastChartInstances.push(createForecastChart(refs.forecastChartTemperature, "line", labels, {
    label: "Temperatur",
    data: entries.map((entry) => entry.temperature),
    borderColor: palette.accent,
    backgroundColor: palette.accentFill,
    pointBackgroundColor: palette.accent,
    pointBorderColor: palette.accent,
    yAxisTitle: "°C",
    beginAtZero: false,
    suggestedMin: Math.floor(Math.min(...entries.map((entry) => entry.temperature))) - 1,
    suggestedMax: Math.ceil(Math.max(...entries.map((entry) => entry.temperature))) + 1,
    yTickCallback: (value) => `${Math.round(value)}°`
  }, palette));

  forecastChartInstances.push(createForecastChart(refs.forecastChartRainProbability, "line", labels, {
    label: "Regenwahrscheinlichkeit",
    data: entries.map((entry) => entry.rainProbability),
    borderColor: palette.rainProbability,
    backgroundColor: palette.rainProbabilityFill,
    pointBackgroundColor: palette.rainProbability,
    pointBorderColor: palette.rainProbability,
    yAxisTitle: "%",
    beginAtZero: true,
    suggestedMin: 0,
    suggestedMax: 100,
    yTickCallback: (value) => `${Math.round(value)}%`
  }, palette));

  forecastChartInstances.push(createForecastChart(refs.forecastChartRainAmount, "line", labels, {
    label: "Regenmenge",
    data: entries.map((entry) => entry.rainAmount),
    borderColor: palette.rainAmount,
    backgroundColor: palette.rainAmountFill,
    pointBackgroundColor: palette.rainAmount,
    pointBorderColor: palette.rainAmount,
    yAxisTitle: "mm",
    beginAtZero: true,
    suggestedMin: 0,
    suggestedMax: Math.max(...entries.map((entry) => entry.rainAmount)) * 1.2 || 0.1,
    yTickCallback: (value) => `${Number(value).toFixed(1)} mm`
  }, palette));

  forecastChartInstances.push(createForecastChart(refs.forecastChartUv, "line", labels, {
    label: "UV-Index",
    data: entries.map((entry) => entry.uvIndex),
    borderColor: palette.uv,
    backgroundColor: palette.uvFill,
    pointBackgroundColor: palette.uv,
    pointBorderColor: palette.uv,
    yAxisTitle: "Index",
    beginAtZero: true,
    suggestedMin: 0,
    suggestedMax: Math.max(...entries.map((entry) => entry.uvIndex)) + 1,
    yTickCallback: (value) => `${Number(value).toFixed(1)}`
  }, palette));
}

function destroyForecastCharts() {
  forecastChartInstances.forEach((chart) => {
    try {
      chart.destroy();
    } catch {
      // Ignore teardown failures.
    }
  });

  forecastChartInstances = [];
}

function getHourlyForecastEntries(hourly, dateIso) {
  const times = hourly?.time;
  if (!Array.isArray(times) || !dateIso) {
    return [];
  }

  const entries = [];
  for (let index = 0; index < times.length; index += 1) {
    const time = times[index];
    if (typeof time !== "string" || !time.startsWith(dateIso)) {
      continue;
    }

    entries.push({
      time,
      temperature: Number(hourly.temperature_2m?.[index] ?? 0),
      rainProbability: Number(hourly.precipitation_probability?.[index] ?? 0),
      rainAmount: Number(hourly.precipitation?.[index] ?? 0),
      uvIndex: Number(hourly.uv_index?.[index] ?? 0)
    });
  }

  return entries;
}

function getForecastChartPalette() {
  const style = getComputedStyle(document.documentElement);
  const surface = style.getPropertyValue("--forecast-surface").trim() || "#000000";
  const border = style.getPropertyValue("--forecast-border").trim() || "rgba(255,255,255,0.12)";
  const grid = style.getPropertyValue("--forecast-grid").trim() || "rgba(255,255,255,0.08)";
  const text = style.getPropertyValue("--forecast-text").trim() || "#f4f8fc";
  const muted = style.getPropertyValue("--forecast-muted").trim() || "#c8d3df";
  const accent = style.getPropertyValue("--accent").trim() || "#20d3b8";

  return {
    surface,
    border,
    grid,
    text,
    muted,
    accent,
    accentFill: rgbaFromCssColor(accent, 0.18),
    rainProbability: "#6ca7ff",
    rainProbabilityFill: "rgba(108, 167, 255, 0.24)",
    rainAmount: "#76d7c4",
    rainAmountFill: "rgba(118, 215, 196, 0.24)",
    uv: "#ffd166",
    uvFill: "rgba(255, 209, 102, 0.24)"
  };
}

function rgbaFromCssColor(color, alpha) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return color;
  }

  context.fillStyle = color;
  const normalized = context.fillStyle;

  if (normalized.startsWith("#")) {
    const hex = normalized.slice(1);
    const size = hex.length === 3 ? 1 : 2;
    const parts = hex.length === 3
      ? hex.split("").map((part) => parseInt(part + part, 16))
      : [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16));
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }

  return color;
}

function formatHourLabel(value) {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function createForecastChart(canvas, chartType, labels, series, palette) {
  if (!canvas) {
    return null;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  return new Chart(context, {
    type: chartType,
    data: {
      labels,
      datasets: [
        {
          label: series.label,
          data: series.data,
          borderColor: series.borderColor,
          backgroundColor: series.backgroundColor,
          pointBackgroundColor: series.pointBackgroundColor || series.borderColor,
          pointBorderColor: series.pointBorderColor || series.borderColor,
          pointRadius: chartType === "line" ? 2.5 : 0,
          pointHoverRadius: 4,
          borderWidth: 3,
          tension: 0.35,
          fill: chartType === "line"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      normalized: true,
      layout: {
        padding: {
          top: 6,
          right: 10,
          bottom: 18,
          left: 8
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: palette.surface,
          titleColor: palette.text,
          bodyColor: palette.text,
          borderColor: palette.border,
          borderWidth: 1,
          displayColors: false
        }
      },
      scales: {
        x: {
          offset: true,
          grid: {
            color: palette.grid,
            drawBorder: false
          },
          ticks: {
            color: palette.muted,
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
            padding: 10,
            font: {
              size: 12,
              family: "Sora, Segoe UI, sans-serif"
            }
          }
        },
        y: {
          beginAtZero: Boolean(series.beginAtZero),
          suggestedMin: series.suggestedMin,
          suggestedMax: series.suggestedMax,
          grid: {
            color: palette.grid,
            drawBorder: false
          },
          ticks: {
            color: palette.muted,
            callback: series.yTickCallback,
            font: {
              size: 11,
              family: "Sora, Segoe UI, sans-serif"
            }
          },
          title: {
            display: Boolean(series.yAxisTitle),
            text: series.yAxisTitle,
            color: palette.text,
            font: {
              size: 12,
              family: "Sora, Segoe UI, sans-serif",
              weight: "600"
            }
          }
        }
      }
    }
  });
}

function formatWeatherClock(value) {
  if (!value) {
    return "--:--";
  }

  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function updateClock() {
  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const dateFormatter = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  refs.clockTime.textContent = timeFormatter.format(now);
  refs.clockDate.textContent = dateFormatter.format(now);
}

function formatWeatherDate(value) {
  if (!value) {
    return "unbekannt";
  }

  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value.replace(" ", "T")));
}

function weatherEmoji(code) {
  const numericCode = Number(code);
  if (numericCode === 0) return "☀️";
  if ([1, 2].includes(numericCode)) return "🌤️";
  if (numericCode === 3) return "☁️";
  if ([45, 48].includes(numericCode)) return "🌫️";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(numericCode)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(numericCode)) return "🌨️";
  if ([95, 96, 99].includes(numericCode)) return "⛈️";
  return "⛅";
}

function weatherText(code) {
  const numericCode = Number(code);
  if (numericCode === 0) return "Klarer Himmel";
  if ([1, 2].includes(numericCode)) return "Teilweise bewölkt";
  if (numericCode === 3) return "Bewölkt";
  if ([45, 48].includes(numericCode)) return "Nebel";
  if ([51, 53, 55].includes(numericCode)) return "Leichter Nieselregen";
  if ([61, 63, 65, 80, 81, 82].includes(numericCode)) return "Regen";
  if ([71, 73, 75, 77, 85, 86].includes(numericCode)) return "Schnee";
  if ([95, 96, 99].includes(numericCode)) return "Gewitter";
  return "Wetterlage";
}

function requiresReturnDate(categoryId) {
  return RETURN_DATE_REQUIRED.has(categoryId);
}

function categoryNameById(categoryId) {
  return state.categories.find((category) => category.id === categoryId)?.name || "Unbekannt";
}

function todayIsoDate() {
  return toIsoDate(new Date());
}

function parseIsoDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function askForReturnDate(memberName, categoryId, existingDate) {
  return new Promise((resolve) => {
    returnDateResolver = resolve;
    refs.returnDateDescription.textContent = `${memberName} wurde nach ${categoryNameById(categoryId)} verschoben. Bitte Rückkehrdatum wählen.`;

    const startDate = parseIsoDate(existingDate) || new Date();
    calendarState = {
      year: startDate.getFullYear(),
      month: startDate.getMonth(),
      minDate: todayIsoDate(),
      selectedDate: existingDate || null
    };

    renderCalendar();
    refs.returnDateDialog.hidden = false;
    refs.returnDateBackdrop.hidden = false;

    const cleanupListeners = () => {
      refs.returnDateBackdrop.removeEventListener("pointerup", onBackdrop);
      refs.calendarGrid.removeEventListener("pointerup", onCalendarClick);
      refs.calendarPrev.removeEventListener("pointerup", onPrev);
      refs.calendarNext.removeEventListener("pointerup", onNext);
    };

    const close = (value) => {
      if (!returnDateResolver) {
        return;
      }

      const done = returnDateResolver;
      returnDateResolver = null;
      refs.returnDateDialog.hidden = true;
      refs.returnDateBackdrop.hidden = true;
      done(value);
    };

    function onBackdrop() {
      cleanupListeners();
      close(null);
    }

    function onCalendarClick(event) {
      const button = event.target.closest(".calendar-day[data-date]");
      if (!button || button.classList.contains("disabled")) {
        return;
      }

      cleanupListeners();
      close(button.dataset.date);
    }

    function onPrev() {
      shiftCalendarMonth(-1);
    }

    function onNext() {
      shiftCalendarMonth(1);
    }

    refs.returnDateBackdrop.addEventListener("pointerup", onBackdrop);
    refs.calendarGrid.addEventListener("pointerup", onCalendarClick);
    refs.calendarPrev.addEventListener("pointerup", onPrev);
    refs.calendarNext.addEventListener("pointerup", onNext);
  });
}

function renderCalendar() {
  const firstDay = new Date(calendarState.year, calendarState.month, 1);
  const lastDay = new Date(calendarState.year, calendarState.month + 1, 0);
  const monthLabel = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(firstDay);

  // Die Kalenderansicht wird komplett neu aufgebaut, damit Navigation und Markierungen immer konsistent bleiben.
  refs.calendarLabel.textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  refs.calendarGrid.innerHTML = "";

  const fragment = document.createDocumentFragment();
  const startOffset = (firstDay.getDay() + 6) % 7;

  for (let index = 0; index < startOffset; index += 1) {
    const empty = document.createElement("div");
    empty.className = "calendar-empty";
    fragment.append(empty);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = new Date(calendarState.year, calendarState.month, day);
    const iso = toIsoDate(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.dataset.date = iso;
    button.textContent = String(day);

    if (iso < calendarState.minDate) {
      button.classList.add("disabled");
      button.disabled = true;
    }

    if (calendarState.selectedDate === iso) {
      button.classList.add("selected");
    }

    fragment.append(button);
  }

  refs.calendarGrid.append(fragment);
}

function shiftCalendarMonth(delta) {
  const next = new Date(calendarState.year, calendarState.month + delta, 1);
  calendarState.year = next.getFullYear();
  calendarState.month = next.getMonth();
  renderCalendar();
}

function formatDateDe(isoDate) {
  const [year, month, day] = isoDate.split("-").map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return new Intl.DateTimeFormat("de-DE").format(date);
}

function initialsFor(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((piece) => piece[0].toUpperCase())
    .join("");
}

void initialize();
