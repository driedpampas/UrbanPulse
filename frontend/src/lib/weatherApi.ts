import type { WeatherData } from './types';

const WMO_CODE_MAP: Record<number, { description: string; icon: string; severe: boolean }> = {
    0: { description: 'Clear sky', icon: '☀️', severe: false },
    1: { description: 'Mainly clear', icon: '🌤️', severe: false },
    2: { description: 'Partly cloudy', icon: '⛅', severe: false },
    3: { description: 'Overcast', icon: '☁️', severe: false },
    45: { description: 'Foggy', icon: '🌫️', severe: false },
    48: { description: 'Depositing rime fog', icon: '🌫️', severe: false },
    51: { description: 'Light drizzle', icon: '🌧️', severe: false },
    53: { description: 'Moderate drizzle', icon: '🌧️', severe: false },
    55: { description: 'Dense drizzle', icon: '🌧️', severe: false },
    61: { description: 'Slight rain', icon: '🌧️', severe: false },
    63: { description: 'Moderate rain', icon: '🌧️', severe: false },
    65: { description: 'Heavy rain', icon: '🌧️', severe: true },
    71: { description: 'Slight snow', icon: '❄️', severe: false },
    73: { description: 'Moderate snow', icon: '❄️', severe: false },
    75: { description: 'Heavy snow', icon: '❄️', severe: true },
    80: { description: 'Slight rain showers', icon: '🌧️', severe: false },
    81: { description: 'Moderate rain showers', icon: '🌧️', severe: false },
    82: { description: 'Violent rain showers', icon: '🌧️', severe: true },
    95: { description: 'Thunderstorm', icon: '⛈️', severe: true },
    96: { description: 'Thunderstorm with slight hail', icon: '⛈️', severe: true },
    99: { description: 'Thunderstorm with heavy hail', icon: '⛈️', severe: true },
};

export async function fetchWeather(lat: number, lng: number): Promise<WeatherData> {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`;

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error('Failed to fetch weather');
    }

    const data = await res.json();
    const current = data.current_weather;
    const code = current.weathercode;
    const mapping = WMO_CODE_MAP[code] || { description: 'Unknown', icon: '❓', severe: false };

    return {
        temp: Math.round(current.temperature),
        description: mapping.description,
        icon: mapping.icon,
        severe: mapping.severe,
        warning: mapping.severe
            ? `Severe weather condition (${mapping.description}) detected in your area.`
            : undefined,
    };
}
