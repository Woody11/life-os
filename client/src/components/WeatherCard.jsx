import { useEffect, useState } from 'react';
import { CloudLightning, Snowflake, CloudRain, CloudFog, Cloud, Sun, CloudSun, Thermometer } from 'lucide-react';

const CONDITION_ICON = [
  [/thunder|storm/i, CloudLightning],
  [/snow|sleet|blizzard/i, Snowflake],
  [/rain|drizzle|shower/i, CloudRain],
  [/fog|mist|haze/i, CloudFog],
  [/cloud/i, Cloud],
  [/overcast/i, Cloud],
  [/clear|sunny/i, Sun],
  [/partly/i, CloudSun],
];

function conditionIcon(cond) {
  if (!cond) return Thermometer;
  for (const [re, Icon] of CONDITION_ICON) if (re.test(cond)) return Icon;
  return Thermometer;
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

  const ConditionIcon = weather ? conditionIcon(weather.condition) : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-6">
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Weather</div>
      {!weather ? (
        <div className="mt-3 h-8 w-24 animate-pulse rounded bg-white/5" />
      ) : (
        <>
          <div className="mt-3 flex items-end gap-3">
            <ConditionIcon className="h-9 w-9 text-sky-300" />
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
