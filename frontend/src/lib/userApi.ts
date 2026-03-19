import { readStoredAuthSession } from "./auth";
import { API_BASE_URL } from "./api";
import type { User } from "./types";

type BackendUser = {
	id: string;
	role?: string;
	email?: string | null;
	displayName?: string | null;
	skillsAndResources?: string[] | null;
	trustScore?: number | null;
	verified?: boolean;
	radius?: number | null;
	location?: {
		lat?: number | null;
		lng?: number | null;
	} | null;
	quietHours?: Array<{
		start?: string;
		end?: string;
	}> | null;
	quietDays?: number[] | null;
	bio?: string | null;
};

class ApiError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

function fallbackDisplayName(id: string) {
	return `Neighbor ${id.slice(0, 6)}`;
}

function toAvatarUrl(seed: string) {
	return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
}

function mapBackendUser(user: BackendUser): User {
	const firstQuietRange = user.quietHours?.[0];

	return {
		id: user.id,
		name: user.displayName || fallbackDisplayName(user.id),
		avatar: toAvatarUrl(user.displayName || user.id),
		bio: user.bio || "No bio yet.",
		skills: user.skillsAndResources || [],
		trustScore: Math.round(user.trustScore || 0),
		verified: Boolean(user.verified),
		lat: user.location?.lat ?? 0,
		lng: user.location?.lng ?? 0,
		quietHoursStart: firstQuietRange?.start || undefined,
		quietHoursEnd: firstQuietRange?.end || undefined,
		distanceLimitKm: Math.max(1, Math.round((user.radius || 1000) / 1000)),
	};
}

function getAuthHeaders(extraHeaders?: HeadersInit): Headers {
	const headers = new Headers(extraHeaders);
	const session = readStoredAuthSession();
	if (session?.token) {
		headers.set("Authorization", `Bearer ${session.token}`);
	}
	return headers;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(`${API_BASE_URL}${path}`, {
		...init,
		headers: getAuthHeaders(init.headers),
	});

	if (!response.ok) {
		let message = "Request failed";
		try {
			const payload = (await response.json()) as { error?: string };
			if (payload.error) {
				message = payload.error;
			}
		} catch {
			message = response.statusText || message;
		}

		throw new ApiError(message, response.status);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	const contentType = response.headers.get("content-type") || "";
	if (contentType.includes("application/json")) {
		return (await response.json()) as T;
	}

	return undefined as T;
}

export async function fetchCurrentUser(): Promise<User> {
	const user = await request<BackendUser>("/user", { method: "GET" });
	return mapBackendUser(user);
}

export async function updateProfile(updates: Partial<User>): Promise<User> {
	const quietHoursProvided =
		updates.quietHoursStart !== undefined ||
		updates.quietHoursEnd !== undefined;

	const patchBody: {
		displayName?: string;
		bio?: string;
		radius?: number;
		location?: { lat: number; lng: number };
		quietHours?: Array<{ start: string; end: string }> | null;
		skills_and_resources?: string[] | null;
	} = {};

	if (typeof updates.name === "string") {
		patchBody.displayName = updates.name.trim();
	}

	if (typeof updates.bio === "string") {
		patchBody.bio = updates.bio;
	}

	if (typeof updates.distanceLimitKm === "number") {
		patchBody.radius = Math.max(0, Math.round(updates.distanceLimitKm * 1000));
	}

	if (typeof updates.lat === "number" && typeof updates.lng === "number") {
		patchBody.location = { lat: updates.lat, lng: updates.lng };
	}

	if (quietHoursProvided) {
		if (updates.quietHoursStart && updates.quietHoursEnd) {
			patchBody.quietHours = [
				{
					start: updates.quietHoursStart,
					end: updates.quietHoursEnd,
				},
			];
		} else {
			patchBody.quietHours = null;
		}
	}

	if (updates.skills) {
		patchBody.skills_and_resources = updates.skills;
	}

	await request<void>("/user", {
		method: "PATCH",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(patchBody),
	});

	return fetchCurrentUser();
}

export async function deleteAccount(): Promise<void> {
	await request<void>("/user", { method: "DELETE" });
}

export async function fetchUsers(): Promise<User[]> {
	const users = await request<BackendUser[]>("/users", { method: "GET" });
	return users.map(mapBackendUser);
}
