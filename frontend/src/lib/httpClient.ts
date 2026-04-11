import { API_BASE_URL } from './api';
import { readStoredAuthSession } from './auth';

type ErrorResponse = {
    error: string;
};

export async function httpClient<T>(path: string, options: RequestInit = {}): Promise<T> {
    const session = readStoredAuthSession();
    const headers = new Headers(options.headers);

    if (session?.token) {
        headers.set('Authorization', `Bearer ${session.token}`);
    }

    if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        let errorBody: ErrorResponse;
        try {
            errorBody = await response.json();
        } catch {
            errorBody = { error: 'Unknown error' };
        }
        throw new Error(errorBody.error || `Request failed with status ${response.status}`);
    }

    if (response.status === 204) {
        return {} as T;
    }

    return response.json();
}
