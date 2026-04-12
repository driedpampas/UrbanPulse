import { useEffect, useMemo, useState } from 'preact/hooks';
import { fetchProtectedProfilePicture } from '../../lib/userApi';

type Props = {
    userId?: string | null;
    fallbackSrc: string;
    alt: string;
    className?: string;
    style?: string;
};

type AvatarCacheEntry = {
    value: string | null;
    fetchedAt: number;
};

const AVATAR_CACHE_TTL_MS = 90_000;
const avatarUrlCache = new Map<string, AvatarCacheEntry>();
const avatarLoadCache = new Map<string, Promise<string | null>>();

function revokeBlobUrl(value: string | null) {
    if (typeof value === 'string' && value.startsWith('blob:')) {
        URL.revokeObjectURL(value);
    }
}

export function invalidateUserAvatarCache(userId?: string) {
    if (!userId) {
        for (const entry of avatarUrlCache.values()) {
            revokeBlobUrl(entry.value);
        }
        avatarUrlCache.clear();
        avatarLoadCache.clear();
        return;
    }

    const existing = avatarUrlCache.get(userId);
    if (existing) {
        revokeBlobUrl(existing.value);
        avatarUrlCache.delete(userId);
    }

    avatarLoadCache.delete(userId);
}

async function resolveAvatarUrl(userId: string): Promise<string | null> {
    const cached = avatarUrlCache.get(userId);
    if (cached && Date.now() - cached.fetchedAt <= AVATAR_CACHE_TTL_MS) {
        return cached.value;
    }

    if (cached) {
        revokeBlobUrl(cached.value);
        avatarUrlCache.delete(userId);
    }

    const inFlight = avatarLoadCache.get(userId);
    if (inFlight) {
        return inFlight;
    }

    const request = fetchProtectedProfilePicture(userId)
        .then((url) => {
            const previous = avatarUrlCache.get(userId);
            if (previous && previous.value !== url) {
                revokeBlobUrl(previous.value);
            }

            avatarUrlCache.set(userId, {
                value: url,
                fetchedAt: Date.now(),
            });
            avatarLoadCache.delete(userId);
            return url;
        })
        .catch(() => {
            avatarUrlCache.set(userId, {
                value: null,
                fetchedAt: Date.now(),
            });
            avatarLoadCache.delete(userId);
            return null;
        });

    avatarLoadCache.set(userId, request);
    return request;
}

export function UserAvatar({ userId, fallbackSrc, alt, className, style }: Props) {
    const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
    const imageSrc = useMemo(() => resolvedSrc || fallbackSrc, [resolvedSrc, fallbackSrc]);

    useEffect(() => {
        let cancelled = false;

        if (!userId) {
            setResolvedSrc(null);
            return () => {
                cancelled = true;
            };
        }

        void resolveAvatarUrl(userId).then((url) => {
            if (cancelled) {
                return;
            }
            setResolvedSrc(url);
        });

        return () => {
            cancelled = true;
        };
    }, [userId]);

    return <img src={imageSrc} alt={alt} class={className} style={style} />;
}
