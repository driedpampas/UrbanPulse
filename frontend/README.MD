# UrbanPulse frontend

## Local frontend env

To run in dev mode, create a `.env` file:

```txt
VITE_MAPBOX_TOKEN=pk...
VITE_BACKEND_URL=http://localhost:3000
VITE_ORIGIN=http://localhost:5173
VITE_PULSE_FEED_WS_URL=ws:localhost:3000/api/pulse/live
```

No backend proxy secret is required; the client sends its own bearer auth token.
