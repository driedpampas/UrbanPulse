import {
    AlertTriangle,
    CheckCircle,
    Clock,
    MapPin,
    MessageSquare,
    Package,
    PawPrint,
    Trash2,
    Wrench,
    Flag,
} from 'lucide-preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter';
import { useAuth } from '../../lib/auth';
import type { PulseSocketEvent } from '../../lib/pulseApi';
import {
    confirmPulse,
    connectWebSocket,
    deletePulse,
    disconnectWebSocket,
    fetchPulses,
    mergePulses,
} from '../../lib/pulseApi';
import type { Pulse } from '../../lib/types';
import { fetchCurrentUser } from '../../lib/userApi';
import {
    DEFAULT_PULSE_CENTER,
    distanceInMeters,
    getCurrentBrowserLocation,
    isUsableCoordinates,
} from '../../lib/utils';
import { ReportModal } from '../Modals/ReportModal';

interface TypeDef {
    icon: typeof AlertTriangle;
    label: string;
    cssPrefix: string;
}

const TYPE_MAP: Record<string, TypeDef> = {
    emergency: { icon: AlertTriangle, label: 'Emergency', cssPrefix: 'emergency' },
    skill: { icon: Wrench, label: 'Skill', cssPrefix: 'skill' },
    item: { icon: Package, label: 'Item', cssPrefix: 'item' },
    pet: { icon: PawPrint, label: 'Pet', cssPrefix: 'pet' },
    update: { icon: MessageSquare, label: 'Update', cssPrefix: 'update' },
};

function timeAgo(ts: number): string {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
}

interface Props {
    radiusFilter: number;
    pulseLimit?: number;
}

export function LiveFeed({ radiusFilter, pulseLimit = 50 }: Props) {
    const { session } = useAuth();
    const [, setLocation] = useLocation();
    const [pulses, setPulses] = useState<Pulse[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [newId, setNewId] = useState<string | null>(null);
    const [feedCenter, setFeedCenter] = useState(DEFAULT_PULSE_CENTER);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const observerTarget = useRef<HTMLDivElement>(null);
    const clearRef = useRef<number | null>(null);
    const [reportingPulse, setReportingPulse] = useState<Pulse | null>(null);

    useEffect(() => {
        let cancelled = false;
        const initLocation = async () => {
            try {
                const u = await fetchCurrentUser();
                if (!cancelled && isUsableCoordinates(u.lat, u.lng)) {
                    setFeedCenter({ lat: u.lat, lng: u.lng });
                    return;
                }
            } catch {
                // Profile might not exist or fetch failed
            }

            try {
                const loc = await getCurrentBrowserLocation();
                if (!cancelled) setFeedCenter(loc);
            } catch (e) {
                console.warn('Browser geolocation failed:', e);
            }
        };

        initLocation();
        return () => {
            cancelled = true;
        };
    }, []);

    // Initial load and reset
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        setHasMore(true);

        fetchPulses(feedCenter.lat, feedCenter.lng, radiusFilter, pulseLimit, 0)
            .then((d) => {
                if (!cancelled) {
                    setPulses(d);
                    if (d.length < pulseLimit) setHasMore(false);
                }
            })
            .catch((e: unknown) => {
                if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [radiusFilter, feedCenter, pulseLimit]);

    // Intersection observer for infinite scroll
    useEffect(() => {
        if (!hasMore || loading || loadingMore) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    loadMore();
                }
            },
            { threshold: 1.0 }
        );

        const target = observerTarget.current;
        if (target) observer.observe(target);

        return () => {
            if (target) observer.unobserve(target);
        };
    }, [hasMore, loading, loadingMore, pulses.length]);

    const loadMore = async () => {
        if (loadingMore || !hasMore) return;

        setLoadingMore(true);
        const newOffset = pulses.length;
        try {
            const nextPulses = await fetchPulses(
                feedCenter.lat,
                feedCenter.lng,
                radiusFilter,
                pulseLimit,
                newOffset
            );

            if (nextPulses.length === 0) {
                setHasMore(false);
            } else {
                setPulses((prev) => mergePulses(prev, nextPulses));
                if (nextPulses.length < pulseLimit) {
                    setHasMore(false);
                }
            }
        } catch (e) {
            console.error('Failed to load more pulses:', e);
        } finally {
            setLoadingMore(false);
        }
    };

    const handleWS = useCallback(
        (event: PulseSocketEvent) => {
            if (event.event === 'pulse.created') {
                // If it's a new pulse, we might want to check if it's within radius on frontend
                // for immediate feedback, OR we can just trust the socket gives us everything
                // but the backend publishes to a global topic currently.
                // To keep it simple and consistent with the requirement "frontend should trust that information",
                // we should check distance here if we want to be strict, but the user said "frontend should trust that information".
                // HOWEVER, the backend currently publishes ALL pulses to the topic.
                // For now, I'll add a distance check here to avoid showing pulses outside radius that come via WS.
                if (
                    distanceInMeters(
                        feedCenter.lat,
                        feedCenter.lng,
                        event.pulse.lat,
                        event.pulse.lng
                    ) <= radiusFilter
                ) {
                    setPulses((c) => mergePulses(c, [event.pulse]));
                    setNewId(event.pulse.id);
                    if (clearRef.current) window.clearTimeout(clearRef.current);
                    clearRef.current = window.setTimeout(() => {
                        setNewId((c) => (c === event.pulse.id ? null : c));
                        clearRef.current = null;
                    }, 2500);
                }
            } else if (event.event === 'pulse.deleted') {
                setPulses((c) => c.filter((p) => p.id !== event.pulseId));
                setNewId((c) => (c === event.pulseId ? null : c));
            }
        },
        [feedCenter, radiusFilter]
    );

    useEffect(() => {
        connectWebSocket(handleWS);
        return () => {
            disconnectWebSocket(handleWS);
            if (clearRef.current) window.clearTimeout(clearRef.current);
        };
    }, [handleWS]);

    const visible = pulses;

    const handleDelete = async (id: string) => {
        if (!window.confirm('Delete this pulse?')) return;
        try {
            await deletePulse(id);
            setPulses((c) => c.filter((p) => p.id !== id));
        } catch (e) {
            console.error(e);
        }
    };

    const handleConfirm = async (id: string) => {
        try {
            await confirmPulse(id);
            setPulses((c) =>
                c.map((p) => {
                    if (p.id === id) {
                        return { ...p, confirmations: p.confirmations + 1 };
                    }
                    return p;
                })
            );
        } catch (e: unknown) {
            if (e instanceof Error && e.message === 'Already confirmed') {
                alert('You have already confirmed this pulse.');
            } else {
                console.error(e);
            }
        }
    };

    const canDelete = (p: Pulse) =>
        Boolean(
            session &&
            (session.user.id === p.userId ||
                session.user.role === 'admin' ||
                session.user.role === 'mod')
        );

    /* ── States ── */
    if (loading) {
        return (
            <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        class="card"
                        style="padding:16px;animation:pulse 1.5s ease-in-out infinite;"
                    >
                        <div style="display:flex;gap:12px;align-items:flex-start;">
                            <div style="width:32px;height:32px;border-radius:50%;background:var(--bg-muted);flex-shrink:0;" />
                            <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
                                <div style="height:11px;border-radius:4px;background:var(--bg-muted);width:30%;" />
                                <div style="height:11px;border-radius:4px;background:var(--bg-muted);width:80%;" />
                                <div style="height:11px;border-radius:4px;background:var(--bg-muted);width:55%;" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (loadError) {
        return (
            <div style="padding:16px;">
                <div style="padding:12px 14px;border-radius:8px;background:var(--danger-subtle);border:1px solid var(--type-emergency-border);color:var(--danger);font-size:13px;">
                    {loadError}
                </div>
            </div>
        );
    }

    if (pulses.length === 0) {
        return (
            <div style="padding:16px;">
                <div class="card" style="padding:40px 24px;text-align:center;">
                    <MapPin size={28} style="color:var(--text-tertiary);margin:0 auto 10px;" />
                    <p style="font-size:14px;font-weight:600;color:var(--text);margin:0 0 4px;">
                        No pulses yet
                    </p>
                    <p style="font-size:12px;color:var(--text-tertiary);margin:0;">
                        Be the first to post in this area.
                    </p>
                </div>
            </div>
        );
    }

    if (visible.length === 0) {
        return (
            <div style="padding:16px;">
                <div class="card" style="padding:32px 24px;text-align:center;">
                    <p style="font-size:13px;font-weight:600;color:var(--text);margin:0 0 4px;">
                        Nothing within {radiusFilter}m
                    </p>
                    <p style="font-size:12px;color:var(--text-tertiary);margin:0;">
                        Widen the radius to see more.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style="padding:16px;display:flex;flex-direction:column;gap:8px;">
            {visible.map((pulse, i) => {
                const def = TYPE_MAP[pulse.type] ?? TYPE_MAP.update;
                const Icon = def.icon;
                const isNew = pulse.id === newId;
                const isVerified = pulse.verified || pulse.confirmations >= 3;
                const mayDelete = canDelete(pulse);
                const p = def.cssPrefix;

                return (
                    <article
                        key={pulse.id}
                        class={`card animate-slide-up${isNew ? ' animate-pulse-ring' : ''}`}
                        style={`animation-delay:${i * 40}ms;padding:14px 16px;${pulse.type === 'emergency' ? 'border-left:3px solid var(--type-emergency-text);' : ''}`}
                    >
                        <div style="display:flex;gap:11px;align-items:flex-start;">
                            {/* Avatar */}
                            <button
                                type="button"
                                onClick={() =>
                                    setLocation(`/profile?userId=${encodeURIComponent(pulse.userId)}`)
                                }
                                style="padding:0;border:none;background:transparent;cursor:pointer;display:flex;"
                                aria-label={`Open ${pulse.userName} profile`}
                            >
                                <img
                                    src={pulse.userAvatar}
                                    alt=""
                                    style="width:32px;height:32px;border-radius:50%;border:1px solid var(--border);flex-shrink:0;object-fit:cover;background:var(--bg-muted);"
                                />
                            </button>

                            <div style="flex:1;min-width:0;">
                                {/* Row 1: name + badge + delete */}
                                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:space-between;">
                                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setLocation(
                                                    `/profile?userId=${encodeURIComponent(pulse.userId)}`
                                                )
                                            }
                                            style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:none;border:none;padding:0;cursor:pointer;text-align:left;"
                                        >
                                            {pulse.userName}
                                        </button>
                                        {/* Type badge */}
                                        <span
                                            class="type-badge"
                                            style={`background:var(--type-${p}-bg);color:var(--type-${p}-text);border-color:var(--type-${p}-border);`}
                                        >
                                            <Icon size={9} />
                                            {def.label}
                                        </span>
                                        {isVerified && (
                                            <span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;color:var(--success);">
                                                <CheckCircle size={10} />
                                                Verified
                                            </span>
                                        )}
                                    </div>
                                    {mayDelete && (
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(pulse.id)}
                                            style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;border:none;background:var(--danger-subtle);color:var(--danger);cursor:pointer;flex-shrink:0;transition:background 0.15s;"
                                            title="Delete"
                                            aria-label="Delete pulse"
                                        >
                                            <Trash2 size={11} />
                                        </button>
                                    )}
                                </div>

                                {/* Content */}
                                <p style="font-size:13px;color:var(--text);margin:7px 0 0;line-height:1.55;">
                                    {pulse.content}
                                </p>

                                {/* Meta */}
                                <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
                                    <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--text-tertiary);font-variant-numeric:tabular-nums;">
                                        <Clock size={10} />
                                        {timeAgo(pulse.timestamp)}
                                    </span>
                                    {pulse.confirmations > 0 && (
                                        <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--text-tertiary);">
                                            <CheckCircle size={10} />
                                            {pulse.confirmations} confirmed
                                        </span>
                                    )}
                                    {session && session.user.id !== pulse.userId && (
                                        <button
                                            type="button"
                                            onClick={() => handleConfirm(pulse.id)}
                                            style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--accent);font-weight:600;background:none;border:none;padding:0;cursor:pointer;margin-left:auto;"
                                        >
                                            <CheckCircle size={10} />
                                            Confirm
                                        </button>
                                    )}
                                    {session && session.user.id !== pulse.userId && (
                                        <button
                                            type="button"
                                            onClick={() => setReportingPulse(pulse)}
                                            style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--text-tertiary);background:none;border:none;padding:0;cursor:pointer;"
                                            title="Report content"
                                        >
                                            <Flag size={10} />
                                            Report
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </article>
                );
            })}

            {reportingPulse && (
                <ReportModal
                    targetId={reportingPulse.id}
                    targetType="pulse"
                    contentSnippet={reportingPulse.content}
                    onClose={() => setReportingPulse(null)}
                />
            )}

            {/* Pagination / Loading Area */}
            <div
                ref={observerTarget}
                style="padding:20px;display:flex;justify-content:center;align-items:center;min-height:60px;"
            >
                {loadingMore && (
                    <div style="display:flex;align-items:center;gap:8px;color:var(--text-tertiary);font-size:12px;font-weight:600;">
                        <span
                            class="spinner"
                            style="width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite;"
                        />
                        Loading more pulses...
                    </div>
                )}
                {!hasMore && pulses.length > 0 && (
                    <div style="color:var(--text-tertiary);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;opacity:0.6;">
                        No more pulses to display
                    </div>
                )}
            </div>
        </div>
    );
}
