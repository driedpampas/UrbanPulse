import { httpClient } from './httpClient';
import type { LibraryItem } from './types';

export type LibraryItemUpdateInput = {
    title?: string;
    description?: string;
    tags?: string[];
    isAvailable?: boolean;
};

export async function fetchLibrary(): Promise<LibraryItem[]> {
    return httpClient<LibraryItem[]>('/library');
}

export async function fetchMyLibraryItems(): Promise<LibraryItem[]> {
    return httpClient<LibraryItem[]>('/library/mine');
}

export async function postLibraryItem(item: {
    type: 'item' | 'skill';
    title: string;
    description: string;
    tags: string[];
}): Promise<LibraryItem> {
    return httpClient<LibraryItem>('/library', {
        method: 'POST',
        body: JSON.stringify(item),
    });
}

export async function updateLibraryItemAvailability(
    itemId: string,
    available: boolean
): Promise<boolean> {
    const res = await httpClient<{ success: boolean }>(`/library/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable: available }),
    });
    return res.success;
}

export async function updateLibraryItem(
    itemId: string,
    updates: LibraryItemUpdateInput
): Promise<boolean> {
    const res = await httpClient<{ success: boolean }>(`/library/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
    });
    return res.success;
}

export async function deleteLibraryItem(itemId: string): Promise<boolean> {
    const res = await httpClient<{ success: boolean }>(`/library/${itemId}`, {
        method: 'DELETE',
    });
    return res.success;
}

export async function fetchAdminLibrary(): Promise<LibraryItem[]> {
    const res = await httpClient<{ items: LibraryItem[] }>('/admin/library', {
        method: 'GET',
    });

    return res.items;
}
