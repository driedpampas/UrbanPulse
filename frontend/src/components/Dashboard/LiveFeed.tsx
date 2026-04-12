import {
    AlertTriangle,
    Check,
    CheckCircle,
    Clock,
    Edit2,
    Flag,
    Loader2,
    MapPin,
    MessageSquare,
    Package,
    PawPrint,
    Plus,
    Send,
    Trash2,
    Wrench,
    X,
} from 'lucide-preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter';
import { useAuth } from '../../lib/auth';
import { fetchMyLibraryItems } from '../../lib/libraryApi';
import type { PulseSocketEvent } from '../../lib/pulseApi';
import {
    acceptPulseRequest,
    confirmPulse,
    connectWebSocket,
    deletePulse,
    disconnectWebSocket,
    editPulse,
    fetchAcceptedPulseInteractions,
    fetchPulseResourceCatalog,
    fetchPulses,
    mergePulses,
} from '../../lib/pulseApi';
import type { Pulse, ResourceCatalogEntry } from '../../lib/types';
import { fetchCurrentUser } from '../../lib/userApi';
import { distanceInMeters, getCurrentBrowserLocation, isUsableCoordinates } from '../../lib/utils';
import { ReportModal } from '../Modals/ReportModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { HoverButton } from '../ui/HoverButton';

interface TypeDef {
    icon: typeof AlertTriangle;
    label: string;
    cssPrefix: string;
}

const TYPE_MAP: Record<string, TypeDef> = {
    emergency: { icon: AlertTriangle, label: 'Emergency', cssPrefix: 'emergency' },
    skill: { icon: Wrench, label: 'Skill', cssPrefix: 'skill' },
    item: { icon: Package, label: 'Item', cssPrefix: 'item' },
    pet: { icon: PawPrint, label: 'Pet', cssPrefix: 'emergency' },
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

const MIN_RESOURCE_TOKEN_LENGTH = 3;
const PULSE_CONTENT_MAX = 280;

function normalizeResourceText(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function resourceTokens(values: string[]): Set<string> {
    const tokens = new Set<string>();

    for (const value of values) {
        const normalized = normalizeResourceText(value);
        if (!normalized) {
            continue;
        }

        tokens.add(normalized);
        for (const token of normalized.split(' ')) {
            if (token.length >= MIN_RESOURCE_TOKEN_LENGTH) {
                tokens.add(token);
            }
        }
    }

    return tokens;
}

function pulseCanBeAcceptedByUser(pulse: Pulse, userTokens: Set<string>): boolean {
    if (pulse.type !== 'need') {
        return false;
    }

    const required = pulse.requiredSkills ?? [];
    if (required.length === 0) {
        return false;
    }

    const requiredTokens = resourceTokens(required);
    if (requiredTokens.size === 0) {
        return false;
    }

    const candidates = Array.from(userTokens);
    for (const token of requiredTokens) {
        if (
            candidates.some(
                (candidate) =>
                    candidate === token ||
                    (token.length >= MIN_RESOURCE_TOKEN_LENGTH && candidate.includes(token)) ||
                    (candidate.length >= MIN_RESOURCE_TOKEN_LENGTH && token.includes(candidate))
            )
        ) {
            return true;
        }
    }

    return false;
}

export function LiveFeed({ radiusFilter, pulseLimit = 50 }: Props) {
    const { session } = useAuth();
    const [, setLocation] = useLocation();
    const [pulses, setPulses] = useState<Pulse[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [newId, setNewId] = useState<string | null>(null);
    const [feedCenter, setFeedCenter] = useState<{ lat: number; lng: number } | null>(null);
    const [locationResolved, setLocationResolved] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const observerTarget = useRef<HTMLDivElement>(null);
    const clearRef = useRef<number | null>(null);
    const [reportingPulse, setReportingPulse] = useState<Pulse | null>(null);
    const [myResourceTokens, setMyResourceTokens] = useState<Set<string>>(new Set());
    const [acceptedPulseIds, setAcceptedPulseIds] = useState<Set<string>>(new Set());
    const [acceptingPulseId, setAcceptingPulseId] = useState<string | null>(null);
    const [deleteConfirmPulseId, setDeleteConfirmPulseId] = useState<string | null>(null);
    const [editingPulseId, setEditingPulseId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [editIsEmergency, setEditIsEmergency] = useState(false);
    const [editResourceQuery, setEditResourceQuery] = useState('');
    const [editSelectedResources, setEditSelectedResources] = useState<string[]>([]);
    const [editCatalog, setEditCatalog] = useState<ResourceCatalogEntry[]>([]);
    const [editCatalogLoading, setEditCatalogLoading] = useState(false);
    const [editCatalogError, setEditCatalogError] = useState<string | null>(null);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const editingPulse = editingPulseId
        ? (pulses.find((pulse) => pulse.id === editingPulseId) ?? null)
        : null;

    useEffect(() => {
        if (!editingPulse || editingPulse.type !== 'need') {
            setEditResourceQuery('');
            setEditCatalog([]);
            setEditCatalogLoading(false);
            setEditCatalogError(null);
            return;
        }

        let cancelled = false;
        setEditCatalogLoading(true);
        setEditCatalogError(null);

        const timer = window.setTimeout(() => {
            fetchPulseResourceCatalog(editResourceQuery, 120)
                .then((resources) => {
                    if (!cancelled) {
                        setEditCatalog(resources);
                    }
                })
                .catch((apiError) => {
                    if (!cancelled) {
                        setEditCatalogError(
                            apiError instanceof Error
                                ? apiError.message
                                : 'Could not load skills/items.'
                        );
                    }
                })
                .finally(() => {
                    if (!cancelled) {
                        setEditCatalogLoading(false);
                    }
                });
        }, 180);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [editResourceQuery, editingPulse]);

    useEffect(() => {
        let cancelled = false;
        const initLocation = async () => {
            let nextCenter: { lat: number; lng: number } | null = null;

            try {
                const u = await fetchCurrentUser();
                if (!cancelled && isUsableCoordinates(u.lat, u.lng)) {
                    nextCenter = { lat: u.lat, lng: u.lng };
                }
            } catch {
                // Profile might not exist or fetch failed
            }

            if (!nextCenter) {
                try {
                    const loc = await getCurrentBrowserLocation();
                    if (!cancelled) {
                        nextCenter = loc;
                    }
                } catch (e) {
                    console.warn('Browser geolocation failed:', e);
                }
            }

            if (!cancelled) {
                setFeedCenter(nextCenter);
                setLocationResolved(true);
            }
        };

        initLocation();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!session) {
            setMyResourceTokens(new Set());
            setAcceptedPulseIds(new Set());
            return;
        }

        let cancelled = false;

        Promise.all([fetchMyLibraryItems(), fetchAcceptedPulseInteractions(100, 0)])
            .then(([items, accepted]) => {
                if (cancelled) {
                    return;
                }

                const values: string[] = [];
                for (const item of items) {
                    if (!item.available) {
                        continue;
                    }
                    values.push(item.title, ...item.tags);
                }
                setMyResourceTokens(resourceTokens(values));

                setAcceptedPulseIds(
                    new Set(accepted.map((acceptedInteraction) => acceptedInteraction.pulse.id))
                );
            })
            .catch(() => {
                if (!cancelled) {
                    setMyResourceTokens(new Set());
                }
            });

        return () => {
            cancelled = true;
        };
    }, [session]);

    useEffect(() => {
        if (!locationResolved || feedCenter) {
            return;
        }

        setPulses([]);
        setHasMore(false);
        setLoading(false);
    }, [feedCenter, locationResolved]);

    // Initial load and reset
    useEffect(() => {
        if (!locationResolved) {
            return;
        }

        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        setHasMore(true);

        if (!feedCenter) {
            setPulses([]);
            setHasMore(false);
            setLoading(false);
            return () => {
                cancelled = true;
            };
        }

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
    }, [radiusFilter, feedCenter, locationResolved, pulseLimit]);

    // Intersection observer for infinite scroll
    useEffect(() => {
        if (!hasMore || loading || loadingMore || !feedCenter) return;

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
    }, [feedCenter, hasMore, loading, loadingMore, pulses.length]);

    const loadMore = async () => {
        if (loadingMore || !hasMore || !feedCenter) return;

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
                if (event.pulse.isSolved) {
                    return;
                }

                // If it's a new pulse, we might want to check if it's within radius on frontend
                // for immediate feedback, OR we can just trust the socket gives us everything
                // but the backend publishes to a global topic currently.
                // To keep it simple and consistent with the requirement "frontend should trust that information",
                // we should check distance here if we want to be strict, but the user said "frontend should trust that information".
                // HOWEVER, the backend currently publishes ALL pulses to the topic.
                // For now, I'll add a distance check here to avoid showing pulses outside radius that come via WS.
                if (
                    feedCenter &&
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
                setEditingPulseId((current) => (current === event.pulseId ? null : current));
            } else if (event.event === 'pulse.updated') {
                setPulses((current) => {
                    let found = false;
                    const next = current.map((pulse) => {
                        if (pulse.id === event.pulse.id) {
                            found = true;
                            return event.pulse;
                        }

                        return pulse;
                    });

                    return found ? next : current;
                });
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

    const visible = pulses.filter((pulse) => !pulse.isSolved);

    const handleDelete = async (id: string) => {
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

    const handleAcceptRequest = async (pulseId: string) => {
        if (acceptingPulseId) {
            return;
        }

        setAcceptingPulseId(pulseId);
        try {
            await acceptPulseRequest(pulseId);
            setAcceptedPulseIds((current) => {
                const next = new Set(current);
                next.add(pulseId);
                return next;
            });
        } catch (apiError) {
            if (apiError instanceof Error && apiError.message === 'Already accepted') {
                setAcceptedPulseIds((current) => {
                    const next = new Set(current);
                    next.add(pulseId);
                    return next;
                });
            } else {
                console.error(apiError);
                alert(apiError instanceof Error ? apiError.message : 'Could not accept request.');
            }
        } finally {
            setAcceptingPulseId(null);
        }
    };

    const beginPulseEdit = (pulse: Pulse) => {
        setEditingPulseId(pulse.id);
        setEditContent(pulse.content);
        setEditIsEmergency(Boolean(pulse.isEmergency));
        setEditResourceQuery('');
        setEditSelectedResources([...(pulse.requiredSkills ?? [])]);
        setEditCatalog([]);
        setEditCatalogError(null);
        setEditError(null);
    };

    const cancelPulseEdit = () => {
        setEditingPulseId(null);
        setSavingEdit(false);
        setEditError(null);
    };

    const handleSavePulseEdit = async (pulse: Pulse) => {
        if (!session || session.user.id !== pulse.userId) {
            return;
        }

        const nextContent = editContent.trim();
        if (!nextContent) {
            setEditError('Pulse content cannot be empty.');
            return;
        }

        if (nextContent.length > PULSE_CONTENT_MAX) {
            setEditError(`Pulse content must be ${PULSE_CONTENT_MAX} characters or fewer.`);
            return;
        }

        const updates: Partial<Pulse> = {
            content: nextContent,
        };

        if (pulse.type === 'need') {
            updates.isEmergency = editIsEmergency;
            updates.requiredSkills = editSelectedResources;
        }

        setSavingEdit(true);
        setEditError(null);
        try {
            const updatedPulse = await editPulse(pulse.id, updates);
            setPulses((current) =>
                current.map((currentPulse) =>
                    currentPulse.id === updatedPulse.id ? updatedPulse : currentPulse
                )
            );
            setEditingPulseId(null);
        } catch (error) {
            setEditError(error instanceof Error ? error.message : 'Failed to update pulse.');
        } finally {
            setSavingEdit(false);
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
                        {feedCenter ? 'No pulses yet' : 'No home location selected'}
                    </p>
                    <p style="font-size:12px;color:var(--text-tertiary);margin:0;">
                        {feedCenter
                            ? 'Be the first to post in this area.'
                            : 'Set a home location or allow location access to see nearby pulses.'}
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
                const isEmergencyPulse = Boolean(pulse.isEmergency) || pulse.type === 'emergency';
                const def = isEmergencyPulse
                    ? TYPE_MAP.emergency
                    : (TYPE_MAP[pulse.type] ?? TYPE_MAP.update);
                const Icon = def.icon;
                const isNew = pulse.id === newId;
                const isVerified = pulse.verified || pulse.confirmations >= 3;
                const mayDelete = canDelete(pulse);
                const mayEdit = Boolean(session && session.user.id === pulse.userId);
                const isEditing = editingPulseId === pulse.id;
                const p = def.cssPrefix;
                const canAcceptRequest = Boolean(
                    session &&
                        session.user.id !== pulse.userId &&
                        !acceptedPulseIds.has(pulse.id) &&
                        !pulse.isSolved &&
                        pulseCanBeAcceptedByUser(pulse, myResourceTokens)
                );
                const hasAcceptedRequest = acceptedPulseIds.has(pulse.id);
                const editCharactersLeft = PULSE_CONTENT_MAX - editContent.length;
                const canMarkEmergency = pulse.type === 'need';
                const showResourceSelector = pulse.type === 'need';

                return (
                    <article
                        key={pulse.id}
                        class={`card animate-slide-up${isNew ? ' animate-pulse-ring' : ''}`}
                        style={`animation-delay:${i * 40}ms;padding:14px 16px;${isEmergencyPulse ? 'border-left:3px solid var(--type-emergency-text);' : ''}`}
                    >
                        <div style="display:flex;gap:11px;align-items:flex-start;">
                            {/* Avatar */}
                            <HoverButton
                                type="button"
                                onClick={() =>
                                    setLocation(
                                        `/profile?userId=${encodeURIComponent(pulse.userId)}`
                                    )
                                }
                                style="padding:0;border:none;background:transparent;cursor:pointer;display:flex;"
                                aria-label={`Open ${pulse.userName} profile`}
                                onMouseEnter={(e) => {
                                    (e.target as HTMLElement).style.filter =
                                        'var(--hover-brightness)';
                                    (e.target as HTMLElement).style.background = 'var(--bg-muted)';
                                }}
                                onMouseLeave={(e) => {
                                    (e.target as HTMLElement).style.filter = 'none';
                                    (e.target as HTMLElement).style.background = 'transparent';
                                }}
                            >
                                <img
                                    src={pulse.userAvatar}
                                    alt=""
                                    style="width:32px;height:32px;border-radius:50%;border:1px solid var(--border);flex-shrink:0;object-fit:cover;background:var(--bg-muted);"
                                />
                            </HoverButton>

                            <div style="flex:1;min-width:0;">
                                {/* Row 1: name + badge + delete */}
                                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:space-between;">
                                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;">
                                        <HoverButton
                                            type="button"
                                            onClick={() =>
                                                setLocation(
                                                    `/profile?userId=${encodeURIComponent(pulse.userId)}`
                                                )
                                            }
                                            style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:none;border:none;padding:0;cursor:pointer;text-align:left;"
                                            onMouseEnter={(e) =>
                                                ((e.target as HTMLElement).style.filter =
                                                    'var(--hover-brightness)')
                                            }
                                            onMouseLeave={(e) =>
                                                ((e.target as HTMLElement).style.filter = 'none')
                                            }
                                        >
                                            {pulse.userName}
                                        </HoverButton>
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
                                    {(mayEdit || mayDelete) && (
                                        <div style="display:flex;align-items:center;gap:6px;">
                                            {mayEdit && (
                                                <HoverButton
                                                    type="button"
                                                    onClick={() => beginPulseEdit(pulse)}
                                                    style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;border:none;background:var(--accent-subtle);color:var(--accent);cursor:pointer;flex-shrink:0;transition:background 0.15s;"
                                                    title="Edit"
                                                    aria-label="Edit pulse"
                                                >
                                                    <Edit2 size={11} />
                                                </HoverButton>
                                            )}
                                            {mayDelete && (
                                                <HoverButton
                                                    type="button"
                                                    onClick={() =>
                                                        setDeleteConfirmPulseId(pulse.id)
                                                    }
                                                    style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;border:none;background:var(--danger-subtle);color:var(--danger);cursor:pointer;flex-shrink:0;transition:background 0.15s;"
                                                    title="Delete"
                                                    aria-label="Delete pulse"
                                                    onMouseEnter={(e) =>
                                                        ((e.target as HTMLElement).style.filter =
                                                            'var(--hover-brightness)')
                                                    }
                                                    onMouseLeave={(e) =>
                                                        ((e.target as HTMLElement).style.filter =
                                                            'none')
                                                    }
                                                >
                                                    <Trash2 size={11} />
                                                </HoverButton>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Content */}
                                {isEditing ? (
                                    <div style="display:flex;flex-direction:column;gap:0;margin-top:9px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--surface-raised);">
                                        {canMarkEmergency && (
                                            <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-raised);cursor:pointer;">
                                                <input
                                                    type="checkbox"
                                                    checked={editIsEmergency}
                                                    onChange={(event) =>
                                                        setEditIsEmergency(
                                                            (event.target as HTMLInputElement)
                                                                .checked
                                                        )
                                                    }
                                                />
                                                <span
                                                    style={`font-size:12px;font-weight:600;color:${editIsEmergency ? 'var(--danger)' : 'var(--text-secondary)'};`}
                                                >
                                                    Mark as emergency
                                                </span>
                                            </label>
                                        )}

                                        <div style="position:relative;margin-bottom:12px;">
                                            <textarea
                                                class="input-field"
                                                value={editContent}
                                                onInput={(event) =>
                                                    setEditContent(
                                                        (event.target as HTMLTextAreaElement).value
                                                    )
                                                }
                                                rows={3}
                                                maxLength={PULSE_CONTENT_MAX + 20}
                                                placeholder="What's happening in your neighborhood?"
                                                style="height:100px;resize:none;padding-bottom:28px;font-family:inherit;font-size:13px;line-height:1.6;"
                                            />
                                            <span
                                                style={`position:absolute;right:10px;bottom:10px;font-size:11px;font-variant-numeric:tabular-nums;color:${
                                                    editCharactersLeft < 0
                                                        ? 'var(--danger)'
                                                        : editCharactersLeft < 40
                                                          ? 'var(--warning)'
                                                          : 'var(--text-tertiary)'
                                                };`}
                                            >
                                                {editCharactersLeft}
                                            </span>
                                        </div>

                                        {showResourceSelector && (
                                            <div style="margin-bottom:14px;display:flex;flex-direction:column;gap:8px;">
                                                <label
                                                    htmlFor={`pulse-edit-skills-${pulse.id}`}
                                                    style="display:block;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;"
                                                >
                                                    Skills / Items Needed
                                                </label>
                                                <div style="display:flex;align-items:center;gap:8px;padding:0 10px;height:36px;border-radius:8px;border:1px solid var(--border);background:var(--surface-raised);">
                                                    <input
                                                        id={`pulse-edit-skills-${pulse.id}`}
                                                        type="text"
                                                        value={editResourceQuery}
                                                        onInput={(event) =>
                                                            setEditResourceQuery(
                                                                (event.target as HTMLInputElement)
                                                                    .value
                                                            )
                                                        }
                                                        placeholder="Search available skills or items"
                                                        style="flex:1;border:none;background:transparent;outline:none;color:var(--text);font-size:12px;font-family:inherit;"
                                                    />
                                                    {editCatalogLoading && (
                                                        <Loader2 size={12} class="animate-spin" />
                                                    )}
                                                </div>

                                                <div style="max-height:140px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;background:var(--surface-raised);">
                                                    {editCatalog.length === 0 &&
                                                    !editCatalogLoading ? (
                                                        <p style="margin:0;padding:10px 12px;font-size:12px;color:var(--text-tertiary);">
                                                            {editCatalogError ||
                                                                'No matching skills/items found.'}
                                                        </p>
                                                    ) : (
                                                        editCatalog.map((resource) => {
                                                            const isSelected =
                                                                editSelectedResources.some(
                                                                    (value) =>
                                                                        value
                                                                            .trim()
                                                                            .toLowerCase() ===
                                                                        resource.value
                                                                            .trim()
                                                                            .toLowerCase()
                                                                );

                                                            return (
                                                                <HoverButton
                                                                    key={`${resource.type}:${resource.value}`}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const normalized =
                                                                            resource.value
                                                                                .trim()
                                                                                .toLowerCase();

                                                                        setEditSelectedResources(
                                                                            (current) => {
                                                                                const exists =
                                                                                    current.some(
                                                                                        (entry) =>
                                                                                            entry
                                                                                                .trim()
                                                                                                .toLowerCase() ===
                                                                                            normalized
                                                                                    );

                                                                                if (exists) {
                                                                                    return current.filter(
                                                                                        (entry) =>
                                                                                            entry
                                                                                                .trim()
                                                                                                .toLowerCase() !==
                                                                                            normalized
                                                                                    );
                                                                                }

                                                                                return [
                                                                                    ...current,
                                                                                    resource.value.trim(),
                                                                                ];
                                                                            }
                                                                        );
                                                                    }}
                                                                    style={`
                                                                        width:100%;display:flex;align-items:center;justify-content:space-between;
                                                                        gap:10px;padding:8px 10px;border:none;border-bottom:1px solid var(--border);
                                                                        background:${isSelected ? 'var(--accent-subtle)' : 'transparent'};
                                                                        color:${isSelected ? 'var(--accent)' : 'var(--text-secondary)'};
                                                                        font-size:12px;font-weight:600;cursor:pointer;text-align:left;
                                                                    `}
                                                                >
                                                                    <span style="display:flex;align-items:center;gap:7px;">
                                                                        <Plus size={11} />
                                                                        {resource.value}
                                                                    </span>
                                                                    {isSelected && (
                                                                        <Check size={12} />
                                                                    )}
                                                                </HoverButton>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {showResourceSelector &&
                                            editSelectedResources.length > 0 && (
                                                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                                                    {editSelectedResources.map((resource) => (
                                                        <HoverButton
                                                            key={resource}
                                                            type="button"
                                                            onClick={() => {
                                                                setEditSelectedResources(
                                                                    (current) =>
                                                                        current.filter(
                                                                            (entry) =>
                                                                                entry
                                                                                    .trim()
                                                                                    .toLowerCase() !==
                                                                                resource
                                                                                    .trim()
                                                                                    .toLowerCase()
                                                                        )
                                                                );
                                                            }}
                                                            style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;border:1px solid var(--accent-muted);background:var(--accent-subtle);color:var(--accent);font-size:11px;font-weight:700;cursor:pointer;"
                                                        >
                                                            {resource}
                                                            <X size={10} />
                                                        </HoverButton>
                                                    ))}
                                                </div>
                                            )}

                                        {editError && (
                                            <p
                                                style="margin:10px 0 0;padding:8px 12px;border-radius:6px;background:var(--danger-subtle);color:var(--danger);font-size:12px;border:1px solid var(--type-emergency-border);"
                                                role="alert"
                                            >
                                                {editError}
                                            </p>
                                        )}

                                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px;">
                                            <HoverButton
                                                type="button"
                                                class="btn-primary"
                                                onClick={() => handleSavePulseEdit(pulse)}
                                                disabled={savingEdit || editCharactersLeft < 0}
                                                style="height:38px;font-size:13px;background:var(--accent);border-radius:8px;opacity:1;padding:0 14px;"
                                            >
                                                <Send size={13} />
                                                {savingEdit ? 'Saving...' : 'Save Pulse'}
                                            </HoverButton>
                                            <HoverButton
                                                type="button"
                                                class="btn-ghost"
                                                onClick={cancelPulseEdit}
                                                disabled={savingEdit}
                                                style="height:38px;padding:0 14px;"
                                            >
                                                Cancel
                                            </HoverButton>
                                        </div>
                                    </div>
                                ) : (
                                    <p style="font-size:13px;color:var(--text);margin:7px 0 0;line-height:1.55;">
                                        {pulse.content}
                                    </p>
                                )}

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
                                        <HoverButton
                                            type="button"
                                            onClick={() => handleConfirm(pulse.id)}
                                            style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--accent);font-weight:600;background:none;border:none;padding:0;cursor:pointer;margin-left:auto;"
                                            onMouseEnter={(e) =>
                                                ((e.target as HTMLElement).style.filter =
                                                    'var(--hover-brightness)')
                                            }
                                            onMouseLeave={(e) =>
                                                ((e.target as HTMLElement).style.filter = 'none')
                                            }
                                        >
                                            <CheckCircle size={10} />
                                            Confirm
                                        </HoverButton>
                                    )}
                                    {canAcceptRequest && (
                                        <HoverButton
                                            type="button"
                                            onClick={() => handleAcceptRequest(pulse.id)}
                                            disabled={acceptingPulseId === pulse.id}
                                            style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--success);font-weight:700;background:none;border:none;padding:0;cursor:pointer;"
                                        >
                                            <CheckCircle size={10} />
                                            {acceptingPulseId === pulse.id
                                                ? 'Accepting...'
                                                : 'Accept Request'}
                                        </HoverButton>
                                    )}
                                    {hasAcceptedRequest && (
                                        <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--success);font-weight:700;">
                                            <CheckCircle size={10} />
                                            Accepted
                                        </span>
                                    )}
                                    {session && session.user.id !== pulse.userId && (
                                        <HoverButton
                                            type="button"
                                            onClick={() => setReportingPulse(pulse)}
                                            style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--text-tertiary);background:none;border:none;padding:0;cursor:pointer;"
                                            title="Report content"
                                            onMouseEnter={(e) =>
                                                ((e.target as HTMLElement).style.filter =
                                                    'var(--hover-brightness)')
                                            }
                                            onMouseLeave={(e) =>
                                                ((e.target as HTMLElement).style.filter = 'none')
                                            }
                                        >
                                            <Flag size={10} />
                                            Report
                                        </HoverButton>
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
            <ConfirmDialog
                open={deleteConfirmPulseId !== null}
                title="Delete pulse"
                message="Delete this pulse?"
                confirmLabel="Delete"
                destructive
                busy={false}
                onCancel={() => setDeleteConfirmPulseId(null)}
                onConfirm={async () => {
                    if (!deleteConfirmPulseId) return;
                    await handleDelete(deleteConfirmPulseId);
                    setDeleteConfirmPulseId(null);
                }}
            />

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
