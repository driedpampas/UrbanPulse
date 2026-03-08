import * as bun from "bun";
import * as db from "./db";
import * as auth from "./auth";
import { z } from "zod";
import swaggerDoc from "./swagger.json";

const PORT = 3000;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const registerUserSchema = z.object({
    email: z.email(),
    displayName: z.string(),
    password: z.string().min(8),
});

const loginUserSchema = z.object({
    email: z.email(),
    password: z.string(),
});

type RegisterUserBody = z.infer<typeof registerUserSchema>;
type LoginUserBody = z.infer<typeof loginUserSchema>;

bun.serve({
    port: PORT,
    routes: {
        "/api/docs/swagger.json": async (req) => {
            if (req.method != "GET") {
                return Response.json({ error: "Bad Request" }, { status: 400 });
            }
            return Response.json(swaggerDoc, { headers: corsHeaders });
        },
        "/api/docs": async (req) => {
            if (req.method != "GET") {
                return Response.json({ error: "Bad Request" }, { status: 400 });
            }

            const html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="utf-8" />
                  <meta name="viewport" content="width=device-width, initial-scale=1" />
                  <title>UrbanPulse API Docs</title>
                  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
                </head>
                <body>
                  <div id="swagger-ui"></div>
                  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
                  <script>
                    window.onload = () => {
                      window.ui = SwaggerUIBundle({
                        url: '/api/docs/swagger.json',
                        dom_id: '#swagger-ui',
                      });
                    };
                  </script>
                </body>
                </html>
          `;
            return new Response(html, {
                headers: { "Content-Type": "text/html" },
            });
        },
        "/api/auth/register": async (req) => {
            if (req.method != "POST") {
                return Response.json({ error: "Bad Request" }, { status: 400 });
            }
            const session = auth.verifyToken(req);

            if (session != null) {
                return Response.json(
                    {
                        error: "You are already authenticated. Please log out first.",
                    },
                    { status: 403, headers: corsHeaders },
                );
            }

            try {
                const body: RegisterUserBody = await req
                    .json()
                    .then((raw) => registerUserSchema.parse(raw));

                const res = await auth.registerUser(body as auth.RegisterUser);

                if (!res.success) {
                    return Response.json(
                        { error: res.error },
                        { status: res.status, headers: corsHeaders },
                    );
                }

                return Response.json(
                    { token: res.token, user: res.user },
                    { status: 200, headers: corsHeaders },
                );
            } catch (err) {
                if (err instanceof z.ZodError) {
                    return Response.json(
                        { error: "Invalid body" },
                        { status: 400, headers: corsHeaders },
                    );
                }
                console.error(err);
                return Response.json(
                    { error: `Internal error` },
                    { status: 500, headers: corsHeaders },
                );
            }
        },
        "/api/auth/login": async (req) => {
            if (req.method != "POST") {
                return Response.json(
                    { error: "Bad Request" },
                    { status: 400, headers: corsHeaders },
                );
            }

            try {
                const body: LoginUserBody = await req
                    .json()
                    .then((raw) => loginUserSchema.parse(raw));

                const res = await auth.loginUser(body as auth.LoginUser);

                if (!res.success) {
                    return Response.json(
                        { error: res.error },
                        { status: res.status, headers: corsHeaders },
                    );
                }

                return Response.json(
                    { token: res.token, user: res.user },
                    { status: 200, headers: corsHeaders },
                );
            } catch (err) {
                if (err instanceof z.ZodError) {
                    return Response.json(
                        { error: "Invalid body" },
                        { status: 400, headers: corsHeaders },
                    );
                }
                console.log(err);
                return Response.json(
                    { error: "Internal error" },
                    { status: 500, headers: corsHeaders },
                );
            }
        },
    },
});
