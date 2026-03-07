import * as bun from "bun";

const PORT = 3000;

bun.serve({
    port: PORT,
    routes: {
        "/": new Response("Hello, World!"),
    },
});

