import {
    Ban,
    CalendarDays,
    Crosshair,
    Globe,
    LogOut,
    MapPin,
    MessageSquare,
    Moon,
    Pencil,
    Plus,
    Save,
    Trash2,
    X,
} from 'lucide-preact';
import type {
    ErrorEvent as MapboxErrorEvent,
    Map as MapboxMap,
    Marker as MapboxMarker,
} from 'mapbox-gl';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter';
import { AppLayout } from '../components/Layout/AppLayout';
import { RoleBadge } from '../components/Profile/RoleBadge';
import { TrustBadge } from '../components/Profile/TrustBadge';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAuth } from '../lib/auth';
import {
    blockUser,
    fetchBlockedUserIds,
    startDirectConversation,
    unblockUser,
} from '../lib/chatApi';
import type { User } from '../lib/types';
import { deleteAccount, fetchCurrentUser, fetchUserById, updateProfile } from '../lib/userApi';
import { DEFAULT_PULSE_CENTER, getCurrentBrowserLocation, isUsableCoordinates } from '../lib/utils';

const DAYS = [
    { v: 0, s: 'Sun' },
    { v: 1, s: 'Mon' },
    { v: 2, s: 'Tue' },
    { v: 3, s: 'Wed' },
    { v: 4, s: 'Thu' },
    { v: 5, s: 'Fri' },
    { v: 6, s: 'Sat' },
];

function normDays(days: Array<number | string> | undefined): number[] {
    return Array.from(
        new Set((days || []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))
    ).sort((a, b) => a - b);
}

const S = {
    label: 'display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:5px;letter-spacing:0.01em;text-transform:uppercase;',
    val: 'font-size:13px;color:var(--text);',
    section:
        'border:1px solid var(--border);border-radius:10px;background:var(--surface);overflow:hidden;',
    sectionHead:
        'padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;',
    sectionBody: 'padding:16px;display:flex;flex-direction:column;gap:14px;',
    row: 'display:flex;align-items:center;justify-content:space-between;gap:12px;',
    input: 'width:100%;padding:7px 10px;border-radius:7px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:13px;font-family:inherit;outline:none;transition:border-color 0.15s,box-shadow 0.15s;',
    textarea:
        'width:100%;padding:8px 10px;border-radius:7px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:13px;font-family:inherit;outline:none;resize:none;height:80px;transition:border-color 0.15s,box-shadow 0.15s;',
};

const PROFILE_MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN?.trim() || '';
const PROFILE_MAPBOX_STYLE = 'mapbox/dark-v11';

const MAP_FRAME_STYLE =
    'position:relative;border:1px solid var(--border);border-radius:16px;overflow:hidden;background:var(--bg-subtle);box-shadow:var(--shadow-sm);height:380px;';

function resolveLocationValue(
    value:
        | {
              location?: { lat?: number | null; lng?: number | null } | null;
              lat?: number | null;
              lng?: number | null;
          }
        | null
        | undefined
): { lat: number; lng: number } | null {
    const location = value?.location;
    const lat = location?.lat ?? value?.lat ?? null;
    const lng = location?.lng ?? value?.lng ?? null;

    if (typeof lat === 'number' && typeof lng === 'number' && isUsableCoordinates(lat, lng)) {
        return { lat, lng };
    }

    return null;
}

function locationText(location: { lat: number; lng: number } | null) {
    return location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : 'Not set';
}

const focusOn = (e: Event) => {
    const el = e.target as HTMLElement;
    el.style.borderColor = 'var(--border-focus)';
    el.style.boxShadow = '0 0 0 3px var(--accent-muted)';
};
const focusOff = (e: Event) => {
    const el = e.target as HTMLElement;
    el.style.borderColor = 'var(--border)';
    el.style.boxShadow = 'none';
};

export function Profile() {
    const [location, setLocation] = useLocation();
    const { logout, session, updateLocalUser } = useAuth();
    const [user, setUser] = useState<User | null>(null);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Partial<User>>({});
    const [newSkill, setNewSkill] = useState('');
    const [saving, setSaving] = useState(false);
    const [showDel, setShowDel] = useState(false);
    const [blocked, setBlocked] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);
    const [mapError, setMapError] = useState<string | null>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapboxMap | null>(null);
    const mapboxGlRef = useRef<typeof import('mapbox-gl')['default'] | null>(null);
    const locationMarkerRef = useRef<MapboxMarker | null>(null);

    const selectedUserId =
        typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('userId')
            : null;
    const isOwnProfile = !selectedUserId || selectedUserId === session?.user.id;
    const isSetupMode =
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('setup') === '1';
    const selectedLocation = resolveLocationValue(editing ? draft : user);
    const editableLocationMap = isOwnProfile && editing;
    const displayLocationMap = Boolean(selectedLocation || editableLocationMap);

    const applyLocation = (nextLocation: { lat: number; lng: number }) => {
        setDraft((current) => ({
            ...current,
            lat: nextLocation.lat,
            lng: nextLocation.lng,
            location: nextLocation,
        }));
    };

    useEffect(() => {
        setEditing(false);
        setShowDel(false);

        const loadUser = async () => {
            const loadedUser = isOwnProfile
                ? await fetchCurrentUser()
                : await fetchUserById(selectedUserId!);

            if (!loadedUser) {
                setUser(null);
                return;
            }

            setUser(loadedUser);
            setDraft(loadedUser);

            if (isOwnProfile && isSetupMode) {
                setEditing(true);
            }

            if (!isOwnProfile && selectedUserId) {
                const blockedUserIds = await fetchBlockedUserIds();
                setBlocked(blockedUserIds.includes(selectedUserId));
            }
        };

        void loadUser();
    }, [location, isOwnProfile, selectedUserId]);

    useEffect(() => {
        if (!displayLocationMap) {
            return;
        }

        let disposed = false;

        const initMap = async () => {
            if (!PROFILE_MAPBOX_TOKEN) {
                setMapError(
                    'Missing VITE_MAPBOX_TOKEN. Set a public Mapbox token to edit location.'
                );
                return;
            }

            try {
                const [{ default: mapboxgl }] = await Promise.all([
                    import('mapbox-gl'),
                ]);

                if (disposed || !mapContainerRef.current) {
                    return;
                }

                mapboxGlRef.current = mapboxgl;
                mapboxgl.accessToken = PROFILE_MAPBOX_TOKEN;

                const initialLocation = selectedLocation ?? DEFAULT_PULSE_CENTER;
                const map = new mapboxgl.Map({
                    container: mapContainerRef.current,
                    style: `mapbox://styles/${PROFILE_MAPBOX_STYLE}`,
                    center: [initialLocation.lng, initialLocation.lat],
                    zoom: 13,
                    interactive: editableLocationMap,
                    attributionControl: false,
                });

                mapRef.current = map;
                map.on('load', () => {
                    if (disposed) {
                        return;
                    }

                    const marker = new mapboxgl.Marker({
                        draggable: editableLocationMap,
                        color: '#0ea5e9',
                    })
                        .setLngLat([initialLocation.lng, initialLocation.lat])
                        .addTo(map);

                    locationMarkerRef.current = marker;
                    setMapLoaded(true);

                    if (editableLocationMap) {
                        marker.on('dragend', () => {
                            const next = marker.getLngLat();
                            applyLocation({ lat: next.lat, lng: next.lng });
                        });

                        map.on('click', (event) => {
                            const next = { lat: event.lngLat.lat, lng: event.lngLat.lng };
                            marker.setLngLat([next.lng, next.lat]);
                            applyLocation(next);
                        });
                    }
                });

                map.on('error', (event: MapboxErrorEvent) => {
                    const message =
                        event.error?.message || 'Mapbox failed to render the location picker.';
                    setMapError(message);
                });
            } catch (error) {
                if (!disposed) {
                    setMapError(error instanceof Error ? error.message : 'Failed to load map.');
                }
            }
        };

        void initMap();

        return () => {
            disposed = true;
            locationMarkerRef.current?.remove();
            locationMarkerRef.current = null;
            mapRef.current?.remove();
            mapRef.current = null;
            mapboxGlRef.current = null;
            setMapLoaded(false);
            setMapError(null);
        };
    }, [displayLocationMap, editableLocationMap, selectedLocation?.lat, selectedLocation?.lng]);

    useEffect(() => {
        const map = mapRef.current;
        const marker = locationMarkerRef.current;

        if (!mapLoaded || !map || !marker || !selectedLocation) {
            return;
        }

        marker.setLngLat([selectedLocation.lng, selectedLocation.lat]);
        map.setCenter([selectedLocation.lng, selectedLocation.lat]);
    }, [mapLoaded, selectedLocation]);

    const mapTitle = editableLocationMap ? 'Adjust your location' : 'Home location';
    const mapSubtitle = editableLocationMap
        ? 'Click the map or drag the pin to update your profile.'
        : selectedLocation
          ? 'Profile location preview'
          : 'No location shared yet';

    const handleSave = async () => {
        if (!draft) return;
        setSaving(true);
        try {
            const updated = await updateProfile(draft);
            updateLocalUser({ displayName: updated.name });
            setUser(updated);
            setDraft(updated);
            setEditing(false);
            if (isSetupMode) {
                setLocation('/profile');
            }
        } catch (error) {
            console.error(error);
            window.alert('Could not save profile changes.');
        } finally {
            setSaving(false);
        }
    };

    const handleMessageUser = async () => {
        if (!selectedUserId || actionBusy) {
            return;
        }

        setActionBusy(true);
        try {
            const result = await startDirectConversation(selectedUserId);
            setLocation(`/messages?threadId=${encodeURIComponent(result.threadId)}`);
        } catch (error) {
            console.error(error);
            window.alert('Could not open conversation.');
        } finally {
            setActionBusy(false);
        }
    };

    const handleToggleBlock = async () => {
        if (!selectedUserId || actionBusy) {
            return;
        }

        setActionBusy(true);
        try {
            if (blocked) {
                await unblockUser(selectedUserId);
                setBlocked(false);
            } else {
                await blockUser(selectedUserId);
                setBlocked(true);
            }
        } catch (error) {
            console.error(error);
            window.alert('Could not update block status.');
        } finally {
            setActionBusy(false);
        }
    };

    const addSkill = () => {
        if (!newSkill.trim()) return;
        setDraft((d) => ({ ...d, skills: [...(d.skills ?? []), newSkill.trim()] }));
        setNewSkill('');
    };

    const removeSkill = (s: string) =>
        setDraft((d) => ({ ...d, skills: (d.skills ?? []).filter((x) => x !== s) }));

    const toggleDay = (day: number) => {
        setDraft((d) => {
            const cur = normDays(d.quietDays === undefined ? user?.quietDays : d.quietDays);
            const next = cur.includes(day)
                ? cur.filter((x) => x !== day)
                : [...new Set([...cur, day])];
            return { ...d, quietDays: next.sort((a, b) => a - b) };
        });
    };

    const selDays = normDays(draft.quietDays === undefined ? user?.quietDays : draft.quietDays);

    if (!user) {
        return (
            <AppLayout title="Profile">
                <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">
                    {[80, 120, 100].map((h, i) => (
                        <div
                            key={i}
                            style={`height:${h}px;border-radius:10px;background:var(--bg-muted);animation:pulse 1.5s ease-in-out infinite;animation-delay:${i * 100}ms;`}
                        />
                    ))}
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout
            title="Profile"
            headerRight={
                isOwnProfile && !editing ? (
                    <button
                        type="button"
                        id="edit-profile-btn"
                        class="btn-ghost"
                        onClick={() => {
                            setDraft(user);
                            setEditing(true);
                        }}
                        style="height:30px;font-size:12px;gap:5px;"
                    >
                        <Pencil size={12} />
                        Edit
                    </button>
                ) : undefined
            }
        >
            <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">
                {/* Identity card */}
                <div style={S.section} class="animate-slide-up">
                    <div style={S.sectionHead}>
                        <p style="font-size:12px;font-weight:600;color:var(--text-secondary);margin:0;">
                            IDENTITY
                        </p>
                    </div>
                    <div style={`${S.sectionBody}flex-direction:row;align-items:flex-start;`}>
                        <img
                            src={user.avatar}
                            alt=""
                            style="width:48px;height:48px;border-radius:8px;border:1px solid var(--border);object-fit:cover;flex-shrink:0;background:var(--bg-muted);"
                        />
                        <div style="flex:1;min-width:0;">
                            {editing ? (
                                <input
                                    value={draft.name ?? ''}
                                    onInput={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            name: (e.target as HTMLInputElement).value,
                                        }))
                                    }
                                    style={S.input}
                                    placeholder="Display name"
                                    onFocus={focusOn}
                                    onBlur={focusOff}
                                />
                            ) : (
                                <>
                                    <p style="font-size:15px;font-weight:700;color:var(--text);margin:0;letter-spacing:-0.01em;">
                                        {user.name}
                                    </p>
                                    {isOwnProfile && (
                                        <p style="font-size:12px;color:var(--text-tertiary);margin:2px 0 6px;">
                                            {user.email}
                                        </p>
                                    )}
                                </>
                            )}
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px;">
                                <TrustBadge score={user.trustScore} verified={user.verified} />
                                {user.role && <RoleBadge role={user.role} />}
                            </div>
                        </div>
                    </div>

                    {/* Bio row */}
                    <div style="padding:0 16px 16px;">
                        <p style={S.label}>Bio</p>
                        {editing ? (
                            <textarea
                                value={draft.bio ?? ''}
                                onInput={(e) =>
                                    setDraft((d) => ({
                                        ...d,
                                        bio: (e.target as HTMLTextAreaElement).value,
                                    }))
                                }
                                style={S.textarea}
                                placeholder="Tell your neighbors a bit about yourself…"
                                onFocus={focusOn}
                                onBlur={focusOff}
                            />
                        ) : (
                            <p style="font-size:13px;color:var(--text-secondary);margin:0;line-height:1.55;">
                                {user.bio || (
                                    <span style="color:var(--text-tertiary);font-style:italic;">
                                        No bio set.
                                    </span>
                                )}
                            </p>
                        )}
                    </div>
                </div>

                {!isOwnProfile && (
                    <div style="display:flex;gap:8px;">
                        <button
                            type="button"
                            class="btn-primary"
                            onClick={handleMessageUser}
                            disabled={actionBusy}
                            style="flex:1;height:36px;"
                        >
                            <MessageSquare size={14} />
                            Message
                        </button>
                        <button
                            type="button"
                            class="btn-ghost"
                            onClick={handleToggleBlock}
                            disabled={actionBusy}
                            style="flex:1;height:36px;color:var(--danger);border-color:var(--danger-muted);"
                        >
                            <Ban size={14} />
                            {blocked ? 'Unblock' : 'Block'}
                        </button>
                    </div>
                )}

                {/* Skills */}
                <div style={S.section} class="animate-slide-up" style-animation-delay="50ms">
                    <div style={S.sectionHead}>
                        <p style="font-size:12px;font-weight:600;color:var(--text-secondary);margin:0;">
                            SKILLS & RESOURCES
                        </p>
                    </div>
                    <div style={S.sectionBody}>
                        <div style="display:flex;flex-wrap:wrap;gap:6px;">
                            {(editing ? draft.skills : user.skills)?.map((skill) => (
                                <span
                                    key={skill}
                                    style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:500;background:var(--accent-subtle);color:var(--accent);border:1px solid var(--accent-muted);"
                                >
                                    {skill}
                                    {editing && (
                                        <button
                                            type="button"
                                            onClick={() => removeSkill(skill)}
                                            style="background:none;border:none;cursor:pointer;padding:0;color:var(--text-tertiary);display:flex;align-items:center;"
                                            aria-label={`Remove ${skill}`}
                                        >
                                            <X size={11} />
                                        </button>
                                    )}
                                </span>
                            ))}
                            {!(editing ? draft.skills : user.skills)?.length && !editing && (
                                <span style="font-size:12px;color:var(--text-tertiary);font-style:italic;">
                                    No skills listed.
                                </span>
                            )}
                            {editing && (
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <input
                                        value={newSkill}
                                        onInput={(e) =>
                                            setNewSkill((e.target as HTMLInputElement).value)
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addSkill();
                                            }
                                        }}
                                        placeholder="Add skill…"
                                        style="width:100px;padding:3px 10px;border-radius:6px;border:1px dashed var(--border-strong);background:transparent;color:var(--text);font-size:12px;font-family:inherit;outline:none;"
                                        onFocus={(e) =>
                                            ((e.target as HTMLElement).style.borderColor =
                                                'var(--border-focus)')
                                        }
                                        onBlur={(e) =>
                                            ((e.target as HTMLElement).style.borderColor =
                                                'var(--border-strong)')
                                        }
                                    />
                                    <button
                                        type="button"
                                        onClick={addSkill}
                                        class="btn-icon"
                                        style="color:var(--accent);width:28px;height:28px;"
                                        aria-label="Add skill"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Preferences */}
                <div style={S.section} class="animate-slide-up" style-animation-delay="100ms">
                    <div style={S.sectionHead}>
                        <p style="font-size:12px;font-weight:600;color:var(--text-secondary);margin:0;">
                            PREFERENCES
                        </p>
                    </div>
                    <div style={S.sectionBody}>
                        {/* Home location */}
                        <div>
                            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
                                <div style="display:flex;align-items:center;gap:7px;">
                                    <Globe
                                        size={13}
                                        style="color:var(--text-tertiary);flex-shrink:0;"
                                    />
                                    <span style="font-size:13px;color:var(--text-secondary);">
                                        Home location
                                    </span>
                                </div>
                                {editing && (
                                    <button
                                        type="button"
                                        class="btn-ghost"
                                        onClick={async () => {
                                            try {
                                                const browserLocation =
                                                    await getCurrentBrowserLocation();
                                                applyLocation(browserLocation);
                                                setMapError(null);
                                            } catch (error) {
                                                let message =
                                                    'Could not read your current location.';
                                                if (error instanceof GeolocationPositionError) {
                                                    if (
                                                        error.code ===
                                                        GeolocationPositionError.PERMISSION_DENIED
                                                    ) {
                                                        message =
                                                            'Location access denied. Please enable location permissions in your browser settings.';
                                                    } else if (
                                                        error.code ===
                                                        GeolocationPositionError.POSITION_UNAVAILABLE
                                                    ) {
                                                        message =
                                                            'Location information is unavailable. Please try again.';
                                                    } else if (
                                                        error.code ===
                                                        GeolocationPositionError.TIMEOUT
                                                    ) {
                                                        message =
                                                            'Location request timed out. Please try again.';
                                                    }
                                                } else if (error instanceof Error) {
                                                    message = error.message;
                                                }
                                                setMapError(message);
                                            }
                                        }}
                                        style="height:28px;padding:0 10px;font-size:11px;gap:5px;"
                                    >
                                        <Crosshair size={12} />
                                        Use current location
                                    </button>
                                )}
                            </div>

                            <div style="display:flex;flex-direction:column;gap:8px;">
                                <div style={MAP_FRAME_STYLE}>
                                    <div style="position:absolute;top:12px;left:12px;z-index:2;display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:12px;background:rgba(15,23,42,0.72);backdrop-filter:blur(14px);color:#fff;max-width:calc(100% - 24px);">
                                        <span style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.72);">
                                            {mapTitle}
                                        </span>
                                        <span style="font-size:13px;font-weight:600;line-height:1.2;">
                                            {mapSubtitle}
                                        </span>
                                    </div>
                                    <div style="position:absolute;top:12px;right:12px;z-index:2;padding:8px 10px;border-radius:999px;background:rgba(15,23,42,0.72);border:1px solid rgba(255,255,255,0.12);box-shadow:var(--shadow-sm);font-size:11px;font-weight:600;color:#fff;backdrop-filter:blur(10px);">
                                        {locationText(selectedLocation)}
                                    </div>
                                    <div
                                        ref={mapContainerRef}
                                        style={`position:absolute;inset:0;width:100%;height:100%;display:${
                                            displayLocationMap && mapLoaded ? 'block' : 'none'
                                        };`}
                                    />
                                    {displayLocationMap && !mapLoaded && !mapError && (
                                        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--text-secondary);font-size:12px;background:var(--bg-subtle);">
                                            <div style="width:36px;height:36px;border-radius:999px;border:2px solid var(--accent-muted);border-top-color:var(--accent);animation:spin 1s linear infinite;" />
                                            Loading map preview…
                                        </div>
                                    )}
                                    {displayLocationMap && mapError && (
                                        <div
                                            style={`position:absolute;${
                                                mapLoaded
                                                    ? 'top:70px;left:12px;right:12px;z-index:10;border-radius:12px;border:1px solid var(--danger-muted);box-shadow:var(--shadow-md);'
                                                    : 'inset:0;justify-content:center;'
                                            } padding:14px;display:flex;flex-direction:column;gap:6px;background:var(--danger-subtle);backdrop-filter:blur(8px);`}
                                            class="animate-slide-up"
                                        >
                                            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
                                                <div style="display:flex;gap:8px;align-items:flex-start;">
                                                    <Ban
                                                        size={14}
                                                        style="color:var(--danger);flex-shrink:0;margin-top:2px;"
                                                    />
                                                    <div style="display:flex;flex-direction:column;gap:2px;">
                                                        <p style="margin:0;font-size:12px;font-weight:700;color:var(--danger);line-height:1.4;">
                                                            Action Failed
                                                        </p>
                                                        <p style="margin:0;font-size:12px;color:var(--danger);line-height:1.4;opacity:0.9;">
                                                            {mapError}
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setMapError(null)}
                                                    style="background:none;border:none;cursor:pointer;padding:4px;color:var(--danger);opacity:0.6;display:flex;border-radius:6px;transition:background 0.2s;"
                                                    onMouseEnter={(e) =>
                                                        ((e.target as HTMLElement).style.background =
                                                            'var(--danger-muted)')
                                                    }
                                                    onMouseLeave={(e) =>
                                                        ((e.target as HTMLElement).style.background =
                                                            'transparent')
                                                    }
                                                    aria-label="Clear error"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                            {!mapLoaded && !PROFILE_MAPBOX_TOKEN && (
                                                <p style="margin:4px 0 0 22px;font-size:11px;font-weight:500;color:var(--danger);line-height:1.45;opacity:0.8;">
                                                    Tip: Set VITE_MAPBOX_TOKEN in your environment to
                                                    enable the interactive map preview.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    {!displayLocationMap && (
                                        <div style="position:absolute;inset:0;padding:18px;display:flex;align-items:flex-end;background:var(--bg-subtle);">
                                            <div style="display:flex;flex-direction:column;gap:5px;max-width:220px;padding:12px 14px;border-radius:10px;background:var(--surface-raised);border:1px solid var(--border);box-shadow:var(--shadow-sm);">
                                                <span style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-tertiary);">
                                                    Location
                                                </span>
                                                <span style="font-size:13px;color:var(--text);font-weight:600;line-height:1.4;">
                                                    Not set yet
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {editing && (
                                    <p style="font-size:12px;color:var(--text-secondary);margin:0;line-height:1.45;">
                                        Click the map or drag the pin to set the account location.
                                    </p>
                                )}

                                <p style="font-size:12px;color:var(--text-tertiary);margin:0;">
                                    Selected: {locationText(selectedLocation)}
                                </p>
                            </div>
                        </div>

                        {/* Distance limit */}
                        <div style={S.row}>
                            <div style="display:flex;align-items:center;gap:7px;">
                                <MapPin
                                    size={13}
                                    style="color:var(--text-tertiary);flex-shrink:0;"
                                />
                                <span style="font-size:13px;color:var(--text-secondary);">
                                    Distance limit
                                </span>
                            </div>
                            {editing ? (
                                <input
                                    type="number"
                                    value={draft.distanceLimit}
                                    onInput={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            distanceLimit: Number(
                                                (e.target as HTMLInputElement).value
                                            ),
                                        }))
                                    }
                                    style="width:80px;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:12px;font-family:inherit;outline:none;text-align:right;"
                                    onFocus={focusOn}
                                    onBlur={focusOff}
                                />
                            ) : (
                                <span style="font-size:13px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;">
                                    {user.distanceLimit} m
                                </span>
                            )}
                        </div>

                        {/* Quiet hours */}
                        <div style={S.row}>
                            <div style="display:flex;align-items:center;gap:7px;">
                                <Moon size={13} style="color:var(--text-tertiary);flex-shrink:0;" />
                                <span style="font-size:13px;color:var(--text-secondary);">
                                    Quiet hours
                                </span>
                            </div>
                            {editing ? (
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <input
                                        type="time"
                                        value={draft.quietHoursStart}
                                        onInput={(e) =>
                                            setDraft((d) => ({
                                                ...d,
                                                quietHoursStart: (e.target as HTMLInputElement)
                                                    .value,
                                            }))
                                        }
                                        style="padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:12px;font-family:inherit;outline:none;"
                                        onFocus={focusOn}
                                        onBlur={focusOff}
                                    />
                                    <span style="color:var(--text-tertiary);font-size:12px;">
                                        –
                                    </span>
                                    <input
                                        type="time"
                                        value={draft.quietHoursEnd}
                                        onInput={(e) =>
                                            setDraft((d) => ({
                                                ...d,
                                                quietHoursEnd: (e.target as HTMLInputElement).value,
                                            }))
                                        }
                                        style="padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:12px;font-family:inherit;outline:none;"
                                        onFocus={focusOn}
                                        onBlur={focusOff}
                                    />
                                </div>
                            ) : (
                                <span style="font-size:13px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;">
                                    {user.quietHoursStart || '—'} – {user.quietHoursEnd || '—'}
                                </span>
                            )}
                        </div>

                        {/* Quiet days */}
                        <div>
                            <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                                <CalendarDays size={13} style="color:var(--text-tertiary);" />
                                <span style="font-size:13px;color:var(--text-secondary);">
                                    Quiet days
                                </span>
                            </div>
                            <div style="display:flex;flex-wrap:wrap;gap:5px;">
                                {DAYS.map((d) => {
                                    const sel = selDays.includes(d.v);
                                    const active = editing ? sel : user.quietDays?.includes(d.v);
                                    return (
                                        <button
                                            key={d.v}
                                            type="button"
                                            onClick={editing ? () => toggleDay(d.v) : undefined}
                                            aria-pressed={editing ? sel : undefined}
                                            disabled={!editing}
                                            style={`
												padding:4px 10px;border-radius:5px;border:1px solid;
												font-size:12px;font-weight:500;cursor:${editing ? 'pointer' : 'default'};
												transition:all 0.15s;
												${
                                                    active
                                                        ? 'background:var(--accent-subtle);color:var(--accent);border-color:var(--accent-muted);'
                                                        : 'background:transparent;color:var(--text-tertiary);border-color:var(--border);'
                                                }
											`}
                                        >
                                            {d.s}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Edit action bar */}
                {isOwnProfile && editing && (
                    <div class="animate-fade-in" style="display:flex;gap:8px;">
                        <button
                            type="button"
                            id="save-profile-btn"
                            class="btn-primary"
                            onClick={handleSave}
                            disabled={saving || (isSetupMode && !selectedLocation)}
                            style="flex:1;height:40px;background:var(--accent);"
                        >
                            <Save size={14} />
                            {saving
                                ? 'Saving…'
                                : isSetupMode && !selectedLocation
                                  ? 'Choose a location'
                                  : 'Save Changes'}
                        </button>
                        <button
                            type="button"
                            class="btn-ghost"
                            onClick={() => {
                                setEditing(false);
                                setDraft(user);
                            }}
                            style="height:40px;padding:0 16px;"
                        >
                            Cancel
                        </button>
                    </div>
                )}

                {/* Sign out */}
                {isOwnProfile && (
                    <>
                        <button
                            type="button"
                            id="sign-out-btn"
                            class="btn-ghost"
                            onClick={() => {
                                logout();
                                setLocation('/auth');
                            }}
                            style="height:38px;width:100%;font-size:13px;color:var(--text-secondary);"
                        >
                            <LogOut size={14} />
                            Sign Out
                        </button>

                        {/* Delete account */}
                        <button
                            type="button"
                            id="delete-account-btn"
                            onClick={() => setShowDel(true)}
                            style="width:100%;height:32px;display:flex;align-items:center;justify-content:center;gap:5px;font-size:12px;font-weight:500;color:var(--text-tertiary);background:none;border:none;cursor:pointer;"
                        >
                            <Trash2 size={12} />
                            Delete Account
                        </button>
                    </>
                )}
            </div>

            {/* Delete confirm */}
            {isOwnProfile && showDel && (
                <div
                    role="dialog"
                    aria-modal="true"
                    style="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,0.4);backdrop-filter:blur(4px);"
                >
                    <div
                        class="animate-slide-up"
                        style="width:100%;max-width:340px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;box-shadow:var(--shadow-xl);"
                    >
                        <h3 style="font-size:15px;font-weight:700;color:var(--danger);margin:0 0 6px;">
                            Delete Account?
                        </h3>
                        <p style="font-size:13px;color:var(--text-secondary);margin:0 0 18px;line-height:1.5;">
                            This is permanent. All your pulses and profile data will be removed.
                        </p>
                        <div style="display:flex;gap:8px;">
                            <button
                                type="button"
                                onClick={() => {
                                    deleteAccount();
                                    logout();
                                    setLocation('/auth');
                                }}
                                style="flex:1;height:38px;border-radius:8px;border:none;background:var(--danger);color:#fff;font-size:13px;font-weight:600;cursor:pointer;"
                            >
                                Delete
                            </button>
                            <button
                                type="button"
                                class="btn-ghost"
                                onClick={() => setShowDel(false)}
                                style="flex:1;height:38px;"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    );
}
