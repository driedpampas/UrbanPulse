export const API_BASE_URL = '/api';
export const PULSE_FEED_WS_URL = import.meta.env.VITE_PULSE_FEED_WS_URL;

if(!PULSE_FEED_WS_URL) {
    throw new Error("VITE_PULSE_FEED_WS_URL not set in .env");
}
