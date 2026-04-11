import * as bun from 'bun';
import { websocketHandlers } from './controllers/http.controller';
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
