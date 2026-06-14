// Codex verification seed data for the dedicated local test origin.

const PEM_VERIFICATION_SAMPLE_PORT = '8895';

function ensureVerificationSampleData() {
  if (!isPemVerificationSampleOrigin()) return;

  settings.homeCards = normalizeHomeCardsSettings(settings.homeCards);
  const weather = settings.homeCards.weather;
  const sampleWeather = buildVerificationSampleWeather();
  weather.enabled = true;
  weather.location = sampleWeather.location;
  weather.searchText = 'Abbotsford';
  weather.lastResult = sampleWeather.lastResult;
  weather.lastError = '';
  weather.lastErrorAt = '';
  weather.lastRequestAt = new Date().toISOString();
  weather.rateLimitUntil = '';
  weather.airQualityEnabled = true;
  weather.alertsEnabled = true;
  weather.previewMode = 'live';
  settings.homeCards.activityWatchMini.enabled = true;
  settings.homeCards.activityWatchMini.categoryMode = 'top';

  try {
    saveSettings(settings);
  } catch (err) {
    console.error('Could not seed verification settings sample data.', err);
  }

  if (typeof defaultActivityWatchData === 'function' && typeof saveActivityWatchData === 'function') {
    activityWatchData = buildVerificationSampleActivityWatchData();
    try {
      saveActivityWatchData();
    } catch (err) {
      console.error('Could not seed verification ActivityWatch sample data.', err);
    }
  }
}

function isPemVerificationSampleOrigin() {
  return window.location.hostname === '127.0.0.1'
    && window.location.port === PEM_VERIFICATION_SAMPLE_PORT;
}

function buildVerificationSampleWeather() {
  const now = new Date();
  const nowIso = now.toISOString();
  const hour = now.getHours();
  const isDay = hour >= 7 && hour < 21;
  const location = {
    name: 'Abbotsford',
    admin1: 'British Columbia',
    country: 'Canada',
    countryCode: 'CA',
    timezone: 'America/Vancouver',
    latitude: 49.0504,
    longitude: -122.3045,
  };
  const today = toDateStr(now);
  const hourly = Array.from({ length: 8 }, (_, index) => {
    const time = new Date(now);
    time.setMinutes(0, 0, 0);
    time.setHours(time.getHours() + index);
    const dayHour = time.getHours();
    return {
      time: time.toISOString(),
      temperature: 11 + Math.min(5, index),
      apparentTemperature: 11 + Math.min(4, index),
      humidity: 76 - index,
      windSpeed: 3 + Math.floor(index / 3),
      windDirection: 315,
      windGusts: 8,
      precipitationProbability: index > 5 ? 20 : 4,
      uvIndex: dayHour >= 10 && dayHour <= 15 ? 3 : 0,
      uvSource: 'Environment Canada',
      weatherCode: index > 5 ? 2 : 1,
      cloudCover: index > 5 ? 45 : 10,
      isDay: dayHour >= 7 && dayHour < 21,
      officialCondition: index > 5 ? 'Mainly clear' : 'Clear',
    };
  });
  return {
    location,
    lastResult: {
      fetchedAt: nowIso,
      locationLabel: 'Abbotsford, British Columbia',
      timezone: location.timezone,
      current: {
        fetchedAt: nowIso,
        time: nowIso,
        temperature: 11,
        apparentTemperature: 11,
        humidity: 77,
        windSpeed: 3,
        windDirection: 315,
        windGusts: 8,
        uvIndex: isDay ? 2 : 0,
        weatherCode: 1,
        isDay,
      },
      daily: {
        sunrise: `${today}T05:05:00`,
        sunset: `${today}T21:14:00`,
      },
      hourly,
      airQuality: {
        aqhi: 1,
        peakAqhi: 2,
        time: nowIso,
        peakTime: hourly[4]?.time || nowIso,
        label: 'Low',
        location: 'Abbotsford Central',
        publicationTime: nowIso,
      },
      alerts: [],
      officialCondition: {
        label: 'Clear',
        source: 'Environment Canada',
      },
      sources: {
        weather: 'Environment Canada',
        uv: 'Environment Canada',
        airQuality: 'Environment Canada',
      },
    },
  };
}

function buildVerificationSampleActivityWatchData() {
  const nowIso = new Date().toISOString();
  const current = typeof activityWatchCurrentWakingDateStr === 'function'
    ? activityWatchCurrentWakingDateStr()
    : todayStr();
  const daysByDate = {};
  Array.from({ length: 30 }, (_, index) => {
    const date = dateFromStr(current);
    date.setDate(date.getDate() - (29 - index));
    const dateStr = toDateStr(date);
    daysByDate[dateStr] = buildVerificationSampleActivityWatchDay(dateStr, index, nowIso);
  });

  return normalizeActivityWatchDataForStorage({
    ...defaultActivityWatchData(),
    host: 'codex-sample',
    activityWatchVersion: 'sample',
    startOfDay: settings.personalDayStartTime || '07:00',
    categoryColors: {
      Media: '#ff453a',
      Work: '#5cff45',
      'AI / LLM': '#f28b82',
      'PEM App': '#7b61ff',
      Uncategorized: '#8e8e8e',
      Programming: '#43a5dc',
      Admin: '#b5e3ff',
    },
    buckets: {
      window: 'aw-watcher-window_codex-sample',
      afk: 'aw-watcher-afk_codex-sample',
      browsers: ['aw-watcher-web-chrome_codex-sample'],
    },
    daysByDate,
    status: {
      code: 'ok',
      message: 'Codex verification sample data is loaded.',
      checkedAt: nowIso,
      warnings: [],
    },
    lastSyncAt: nowIso,
    lastSyncTrigger: 'codex-sample',
    lastErrorAt: '',
    lastError: '',
  });
}

function buildVerificationSampleActivityWatchDay(dateStr, index, syncedAt) {
  const multiplier = 0.72 + ((index % 6) * 0.08);
  const categoryTotals = {
    'Media > Video': Math.round(10140 * multiplier),
    'Work > Documents': Math.round(4020 * multiplier),
    'AI / LLM': Math.round(1860 * multiplier),
    'PEM App': Math.round(1800 * multiplier),
    Uncategorized: Math.round(1320 * multiplier),
    'Programming > App': Math.round(600 * multiplier),
    Admin: Math.round(2340 * multiplier),
  };
  const totalActiveSeconds = Object.values(categoryTotals).reduce((sum, seconds) => sum + seconds, 0);
  return {
    date: dateStr,
    periodStart: `${dateStr}T07:00:00`,
    periodEnd: `${dateStr}T23:59:59`,
    totalActiveSeconds,
    categoryTotals,
    appTotals: {
      'chrome.exe': categoryTotals['Media > Video'] + categoryTotals['AI / LLM'],
      'Code.exe': categoryTotals['Programming > App'],
      'Physio Exercise Manager': categoryTotals['PEM App'],
      'explorer.exe': categoryTotals.Admin,
    },
    hourlyCategoryTotals: buildVerificationSampleHourlyTotals(categoryTotals),
    syncedAt,
    queryVersion: ACTIVITYWATCH_QUERY_VERSION,
  };
}

function buildVerificationSampleHourlyTotals(categoryTotals) {
  const hourly = Array.from({ length: 24 }, () => ({}));
  const hours = [8, 9, 10, 11, 13, 14, 15, 16];
  Object.entries(categoryTotals).forEach(([category, seconds], index) => {
    const firstHour = hours[index % hours.length];
    hourly[firstHour][category] = Math.round(seconds * 0.6);
    hourly[Math.min(23, firstHour + 1)][category] = seconds - hourly[firstHour][category];
  });
  return hourly;
}
