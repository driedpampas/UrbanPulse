import { z } from 'zod';
import { withCors } from './cors.middleware';

export const SUCCESS = new Response(null, { status: 200 });
export const OPTIONS_RESPONSE = new Response(null, { status: 204 });
export const BAD_REQUEST = new Response(null, { status: 400 });
export const UNAUTHORIZED = new Response(null, { status: 401 });
export const FORBIDDEN = new Response(null, { status: 403 });
export const NOT_FOUND = new Response(null, { status: 404 });
export const SERVER_ERROR = new Response(null, { status: 500 });

export async function caught(handler: () => Promise<Response>): Promise<Response> {
    try {
        return await handler();
    } catch (err) {
        if (err instanceof z.ZodError) {
            return withCors(BAD_REQUEST);
        }
        console.error(err);
        return withCors(SERVER_ERROR);
    }
}
