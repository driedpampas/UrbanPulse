import * as bun from 'bun';
import { websocketHandlers } from './controllers/http.controller';
import * as db from './db';
import { httpRoutes } from './routes/http.routes';

const PORT = 3000;

bun.serve({
    port: PORT,
    error(err) {
        console.log(err);
    },
    routes: httpRoutes,
    websocket: websocketHandlers,
});

void db.purgeExpiredUserDeletions().catch(console.error);
setInterval(() => {
    void db.purgeExpiredUserDeletions().catch(console.error);
}, 60_000);

void db.purgeInactiveIncidents().catch(console.error);
setInterval(() => {
    void db.purgeInactiveIncidents().catch(console.error);
}, 600_000);
