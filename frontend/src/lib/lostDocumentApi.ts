import type { LostDocument } from '../types';
import { API_BASE_URL } from './api';
import { readStoredAuthSession } from './auth';

class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

function getAuthHeaders(extraHeaders?: HeadersInit): Headers {
    const headers = new Headers(extraHeaders);
    const session = readStoredAuthSession();
    if (session?.token) {
        headers.set('Authorization', `Bearer ${session.token}`);
    }
    return headers;
}

export async function fetchLostDocuments(limit = 50, offset = 0): Promise<LostDocument[]> {
    const response = await fetch(`${API_BASE_URL}/lost-documents?limit=${limit}&offset=${offset}`, {
        method: 'GET',
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        throw new ApiError('Failed to fetch lost documents', response.status);
    }

    return response.json();
}

export async function createLostDocument(formData: FormData): Promise<{ id: string }> {
    const response = await fetch(`${API_BASE_URL}/lost-documents`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new ApiError(payload.error || 'Failed to post document', response.status);
    }

    return response.json();
}

export function getLostDocumentImageUrl(filename: string): string {
    return `${API_BASE_URL}/lost-documents/image/${encodeURIComponent(filename)}`;
}
