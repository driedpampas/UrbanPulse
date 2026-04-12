import { useEffect, useMemo, useState } from 'preact/hooks';
import { fetchProtectedProfilePicture } from '../../lib/userApi';

type Props = {
    userId?: string | null;
    fallbackSrc: string;
    alt: string;
    className?: string;
    style?: string;
};

const avatarUrlCache = new Map<string, string | null>();
const avatarLoadCache = new Map<string, Promise<string | null>>();

async function resolveAvatarUrl(userId: string): Promise<string | null> {
    if (avatarUrlCache.has(userId)) {
        return avatarUrlCache.get(userId) ?? null;
    }

    const inFlight = avatarLoadCache.get(userId);
    if (inFlight) {
        return inFlight;
    }

    const request = fetchProtectedProfilePicture(userId)
        .then((url) => {
            avatarUrlCache.set(userId, url);
            avatarLoadCache.delete(userId);
            return url;
        })
        .catch(() => {
            avatarUrlCache.set(userId, null);
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
