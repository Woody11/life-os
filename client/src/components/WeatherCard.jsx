import { useEffect, useState } from 'react';

const CONDITION_EMOJI = [
  [/thunder|storm/i, '⛈'],
  [/snow|sleet|blizzard/i, '❄️'],
  [/rain|drizzle|shower/i, '🌧'],
  [/fog|mist|haze/i, '🌫'],
  [/cloud/i, '☁️'],
  [/overcast/i, '☁️'],
  [/clear|sunny/i, '☀️'],
  [/partly/i, '⛅'],
];

function conditionEmoji(cond) {
  if (!cond) return '🌡';
  for (const [re, emoji] of CONDITION_EMOJI) if (re.test(cond)) return emoji;
  return '🌡';
}

export default function WeatherCard() {
  const [weather, setWeather] = useState(null);
  const [error, setError]     = useState(false);

  useEffect(() => {
    fetch('/api/weather')
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(setWeather)
      .catch(() => setError(true));
  }, []);

  if (error) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-6">
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Weather</div>
      {!weather ? (
        <div className="mt-3 h-8 w-24 animate-pulse rounded bg-white/5" />
      ) : (
        <>
          <div className="mt-3 flex items-end gap-3">
            <span className="text-4xl">{conditionEmoji(weather.condition)}</span>
            <span className="text-4xl font-bold tracking-tight text-white">{weather.tempC}°</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">{weather.condition}</div>
          <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
            <span>Feels {weather.feelsLikeC}°</span>
            <span className="text-slate-700">·</span>
            <span>H:{weather.highC}° L:{weather.lowC}°</span>
          </div>
        </>
      )}
    </div>
  );
}
