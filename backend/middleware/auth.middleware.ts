import type { AuthTokenPayload } from '../auth';
import * as auth from '../auth';
import * as db from '../db';
import { withCors } from './cors.middleware';
import { FORBIDDEN, UNAUTHORIZED } from './error.middleware';

type AuthorizationContext = {
    session: AuthTokenPayload;
    role: string | null;
};

export async function authorize(
    request: Request,
    handler: (payload: AuthTokenPayload) => Response | Promise<Response>,
    fallback: () => Response | Promise<Response> = () => withCors(UNAUTHORIZED)
): Promise<Response> {
    const authContext = await getAuthorizationContext(request);

    if (authContext === null) {
        return await fallback();
    }

    if (authContext.role === 'banned') {
        return withCors(FORBIDDEN);
    }

    return await handler(authContext.session);
}

export async function adminAuthorize(
    request: Request,
    handler: (payload: AuthTokenPayload) => Response | Promise<Response>,
    fallback: () => Response | Promise<Response> = () => withCors(UNAUTHORIZED)
): Promise<Response> {
    const authContext = await getAuthorizationContext(request);

    if (authContext === null) {
        return await fallback();
    }

    if (authContext.role === 'banned') {
        return withCors(FORBIDDEN);
    }

    if (authContext.role !== 'admin' && authContext.role !== 'mod') {
        return withCors(FORBIDDEN);
    }

    return await handler(authContext.session);
}

export async function unauthorize(
    request: Request,
    handler: () => Response | Promise<Response>
): Promise<Response> {
    const session = auth.verifyToken(request);

    if (session !== null) {
        return await withCors(FORBIDDEN);
    }

    return await handler();
}

async function getAuthorizationContext(request: Request): Promise<AuthorizationContext | null> {
    const session = auth.verifyToken(request);

    if (session === null) {
        return null;
    }

    return {
        session,
        role: (await db.selectUserRole(session.id))?.toLowerCase() ?? null,
    };
}
