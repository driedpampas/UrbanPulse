import {
    type AlertTriangle,
    Check,
    Loader2,
    MapPin,
    MessageSquare,
    Plus,
    Send,
    X,
} from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { fetchPulseResourceCatalog, matchPulseHeroes, postPulse } from '../../lib/pulseApi';
import type { HeroMatchUser, Pulse, ResourceCatalogEntry } from '../../lib/types';
import { fetchCurrentUser } from '../../lib/userApi';
import { DEFAULT_PULSE_CENTER, isUsableCoordinates } from '../../lib/utils';
import { HoverButton } from '../ui/HoverButton';

const TYPES: { val: Pulse['type']; label: string; icon: typeof AlertTriangle; css: string }[] = [
    { val: 'update', label: 'Update', icon: MessageSquare, css: 'update' },
    { val: 'need', label: 'Need', icon: Plus, css: 'item' },
];

const EMERGENCY_ELIGIBLE_TYPES: Pulse['type'][] = ['need'];

const MAX = 280;

interface Props {
    onClose: () => void;
}

export function NeedPostingForm({ onClose }: Props) {
    const [type, setType] = useState<Pulse['type']>('update');
    const [isEmergency, setIsEmergency] = useState(false);
    const [content, setContent] = useState('');
    const [resourceQuery, setResourceQuery] = useState('');
    const [selectedResources, setSelectedResources] = useState<string[]>([]);
    const [catalog, setCatalog] = useState<ResourceCatalogEntry[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [heroMatches, setHeroMatches] = useState<HeroMatchUser[]>([]);
    const [matchingHeroes, setMatchingHeroes] = useState(false);
    const [heroMatchError, setHeroMatchError] = useState<string | null>(null);
    const [location, setLocation] = useState<{ lat: number; lng: number }>(DEFAULT_PULSE_CENTER);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const left = MAX - content.length;

    const canMarkEmergency = EMERGENCY_ELIGIBLE_TYPES.includes(type);
    const showResourceSelector = type === 'need';

    const catalogHint = useMemo(() => {
        if (!showResourceSelector) {
            return 'Need pulses can include skills/items to target matching helpers.';
        }
        if (selectedResources.length === 0) {
            return 'Select at least one skill or item to target matching heroes.';
        }

        return `${selectedResources.length} target${selectedResources.length === 1 ? '' : 's'} selected`;
    }, [showResourceSelector, selectedResources.length]);

    const suppressedMatches = heroMatches.filter((match) => match.suppressedByQuietHours).length;
    const activeMatches = heroMatches.length - suppressedMatches;

    useEffect(() => {
        if (!canMarkEmergency && isEmergency) {
            setIsEmergency(false);
        }
    }, [canMarkEmergency, isEmergency]);

    useEffect(() => {
        let cancelled = false;

        fetchCurrentUser()
            .then((currentUser) => {
                if (cancelled) {
                    return;
                }

                const userLocation = currentUser.location;
                if (
                    userLocation &&
                    isUsableCoordinates(Number(userLocation.lat), Number(userLocation.lng))
                ) {
                    setLocation({
                        lat: Number(userLocation.lat),
                        lng: Number(userLocation.lng),
                    });
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setLocation(DEFAULT_PULSE_CENTER);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!showResourceSelector) {
            setResourceQuery('');
            setSelectedResources([]);
            setCatalog([]);
            setHeroMatches([]);
            setCatalogError(null);
            setHeroMatchError(null);
            return;
        }

        let cancelled = false;
        setCatalogLoading(true);
        setCatalogError(null);

        const timer = window.setTimeout(() => {
            fetchPulseResourceCatalog(resourceQuery, 120)
                .then((resources) => {
                    if (!cancelled) {
                        setCatalog(resources);
                    }
                })
                .catch((apiError) => {
                    if (!cancelled) {
                        setCatalogError(
                            apiError instanceof Error
                                ? apiError.message
                                : 'Could not load skills/items.'
                        );
                    }
                })
                .finally(() => {
                    if (!cancelled) {
                        setCatalogLoading(false);
                    }
                });
        }, 180);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [resourceQuery, showResourceSelector]);

    useEffect(() => {
        if (!showResourceSelector || selectedResources.length === 0) {
            setHeroMatches([]);
            setHeroMatchError(null);
            setMatchingHeroes(false);
            return;
        }

        let cancelled = false;
        setMatchingHeroes(true);
        setHeroMatchError(null);

        const timer = window.setTimeout(() => {
            matchPulseHeroes(selectedResources, location)
                .then((matches) => {
                    if (!cancelled) {
                        setHeroMatches(matches);
                    }
                })
                .catch((apiError) => {
                    if (!cancelled) {
                        setHeroMatchError(
                            apiError instanceof Error
                                ? apiError.message
                                : 'Could not match heroes for the selected targets.'
                        );
                    }
                })
                .finally(() => {
                    if (!cancelled) {
                        setMatchingHeroes(false);
                    }
                });
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [location, selectedResources, showResourceSelector]);

    const toggleResource = (resourceValue: string) => {
        const normalized = resourceValue.trim().toLowerCase();
        if (!normalized) {
            return;
        }

        setSelectedResources((current) => {
            const exists = current.some((value) => value.trim().toLowerCase() === normalized);
            if (exists) {
                return current.filter((value) => value.trim().toLowerCase() !== normalized);
            }
            return [...current, resourceValue.trim()];
        });
    };

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        if (!content.trim() || left < 0) return;
        setSending(true);
        setError(null);

        try {
            await postPulse({
                type,
                isEmergency,
                content,
                lat: location.lat,
                lng: location.lng,
                requiredSkills: selectedResources.length > 0 ? selectedResources : undefined,
            });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to post pulse.');
        } finally {
            setSending(false);
        }
    };

    return (
        /* Overlay */
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Post a pulse"
            style="position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);"
        >
            {/* Tap-outside to close */}
            <div style="position:absolute;inset:0;" onClick={onClose} aria-hidden="true" />

            {/* Sheet */}
            <div
                class="animate-slide-up"
                style={`
					position:relative;
					width:100%;
					max-width:680px;
					background:var(--surface);
					border:1px solid var(--border);
					border-bottom:none;
					border-radius:14px 14px 0 0;
					box-shadow:0 -8px 40px rgba(0,0,0,0.2);
					padding:20px 20px 28px;
				`}
            >
                {/* Header */}
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                    <p style="font-size:15px;font-weight:700;color:var(--text);margin:0;letter-spacing:-0.01em;">
                        Post a Pulse
                    </p>
                    <HoverButton
                        type="button"
                        class="btn-icon"
                        onClick={onClose}
                        aria-label="Close"
                        style="color:var(--text-secondary);"
                        onMouseEnter={(e) =>
                            ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                        }
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                    >
                        <X size={16} />
                    </HoverButton>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Type pills */}
                    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
                        {TYPES.map((t) => {
                            const Icon = t.icon;
                            const active = type === t.val;
                            return (
                                <HoverButton
                                    key={t.val}
                                    type="button"
                                    onClick={() => setType(t.val)}
                                    style={`
										display:inline-flex;align-items:center;gap:5px;
										padding:4px 10px;border-radius:6px;border:1px solid;
										font-size:12px;font-weight:600;cursor:pointer;transition:all 0.15s;
										${
                                            active
                                                ? `background:var(--type-${t.css}-bg);color:var(--type-${t.css}-text);border-color:var(--type-${t.css}-border);`
                                                : 'background:transparent;color:var(--text-tertiary);border-color:var(--border);'
                                        }
									`}
                                    onMouseEnter={(e) => {
                                        (e.target as HTMLElement).style.filter =
                                            'var(--hover-brightness)';
                                        (e.target as HTMLElement).style.background =
                                            'var(--bg-muted)';
                                    }}
                                    onMouseLeave={(e) => {
                                        (e.target as HTMLElement).style.filter = 'none';
                                        (e.target as HTMLElement).style.background = 'transparent';
                                    }}
                                >
                                    <Icon size={11} />
                                    {t.label}
                                </HoverButton>
                            );
                        })}
                    </div>

                    {canMarkEmergency && (
                        <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-raised);cursor:pointer;">
                            <input
                                type="checkbox"
                                checked={isEmergency}
                                onChange={(e) =>
                                    setIsEmergency((e.target as HTMLInputElement).checked)
                                }
                            />
                            <span
                                style={`font-size:12px;font-weight:600;color:${isEmergency ? 'var(--danger)' : 'var(--text-secondary)'};`}
                            >
                                Mark as emergency
                            </span>
                        </label>
                    )}

                    {/* Textarea */}
                    <div style="position:relative; margin-bottom: 12px;">
                        <textarea
                            value={content}
                            onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)}
                            placeholder="What's happening in your neighborhood?"
                            class="input-field"
                            style="height:100px;resize:none;padding-bottom:28px;font-family:inherit;font-size:13px;line-height:1.6;"
                            maxLength={MAX + 20}
                        />
                        <span
                            style={`
								position:absolute;right:10px;bottom:10px;
								font-size:11px;font-variant-numeric:tabular-nums;
								color:${left < 0 ? 'var(--danger)' : left < 40 ? 'var(--warning)' : 'var(--text-tertiary)'};
							`}
                        >
                            {left}
                        </span>
                    </div>

                    {showResourceSelector && (
                        <div style="margin-bottom:14px;display:flex;flex-direction:column;gap:8px;">
                            <label style="display:block;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;">
                                Skills / Items Needed
                            </label>

                            <div style="display:flex;align-items:center;gap:8px;padding:0 10px;height:36px;border-radius:8px;border:1px solid var(--border);background:var(--surface-raised);">
                                <input
                                    type="text"
                                    value={resourceQuery}
                                    onInput={(e) =>
                                        setResourceQuery((e.target as HTMLInputElement).value)
                                    }
                                    placeholder="Search available skills or items"
                                    style="flex:1;border:none;background:transparent;outline:none;color:var(--text);font-size:12px;font-family:inherit;"
                                />
                                {catalogLoading && <Loader2 size={12} class="animate-spin" />}
                            </div>

                            <div style="max-height:140px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;background:var(--surface-raised);">
                                {catalog.length === 0 && !catalogLoading ? (
                                    <p style="margin:0;padding:10px 12px;font-size:12px;color:var(--text-tertiary);">
                                        {catalogError || 'No matching skills/items found.'}
                                    </p>
                                ) : (
                                    catalog.map((resource) => {
                                        const isSelected = selectedResources.some(
                                            (value) =>
                                                value.trim().toLowerCase() ===
                                                resource.value.trim().toLowerCase()
                                        );

                                        return (
                                            <HoverButton
                                                key={`${resource.type}:${resource.value}`}
                                                type="button"
                                                onClick={() => toggleResource(resource.value)}
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
                                                {isSelected && <Check size={12} />}
                                            </HoverButton>
                                        );
                                    })
                                )}
                            </div>

                            {selectedResources.length > 0 && (
                                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                                    {selectedResources.map((resource) => (
                                        <HoverButton
                                            key={resource}
                                            type="button"
                                            onClick={() => toggleResource(resource)}
                                            style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;border:1px solid var(--accent-muted);background:var(--accent-subtle);color:var(--accent);font-size:11px;font-weight:700;cursor:pointer;"
                                        >
                                            {resource}
                                            <X size={10} />
                                        </HoverButton>
                                    ))}
                                </div>
                            )}

                            <div style="display:flex;flex-direction:column;gap:3px;">
                                <p style="margin:0;font-size:11px;color:var(--text-tertiary);">
                                    {catalogHint}
                                </p>
                                {matchingHeroes ? (
                                    <p style="margin:0;font-size:11px;color:var(--text-secondary);">
                                        Matching heroes nearby...
                                    </p>
                                ) : (
                                    <p style="margin:0;font-size:11px;color:var(--text-secondary);">
                                        {activeMatches} hero match{activeMatches === 1 ? '' : 'es'}
                                        ready to receive alerts
                                        {suppressedMatches > 0
                                            ? ` (${suppressedMatches} currently in quiet time)`
                                            : ''}
                                    </p>
                                )}
                                {heroMatchError && (
                                    <p style="margin:0;font-size:11px;color:var(--danger);">
                                        {heroMatchError}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Location note */}
                    <p style="font-size:11px;color:var(--text-tertiary);margin:8px 0 0;display:flex;align-items:center;gap:4px;">
                        <MapPin size={10} />
                        Location auto-detected from your profile
                    </p>

                    {error && (
                        <p style="margin:10px 0 0;padding:8px 12px;border-radius:6px;background:var(--danger-subtle);color:var(--danger);font-size:12px;border:1px solid var(--type-emergency-border);">
                            {error}
                        </p>
                    )}

                    <HoverButton
                        type="submit"
                        id="post-pulse-submit"
                        disabled={!content.trim() || sending || left < 0}
                        class="btn-primary"
                        style="margin-top:14px;width:100%;height:38px;font-size:13px;background:var(--accent);border-radius:8px;opacity:1;"
                        onMouseEnter={(e) =>
                            ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                        }
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                    >
                        <Send size={13} />
                        {sending ? 'Posting…' : 'Post Pulse'}
                    </HoverButton>
                </form>
            </div>
        </div>
    );
}
