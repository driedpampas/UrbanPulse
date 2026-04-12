import {
    Ban,
    CalendarDays,
    Crosshair,
    Flag,
    Globe,
    LogOut,
    MapPin,
    MessageSquare,
    Moon,
    Pencil,
    Save,
    ShieldCheck,
    ShieldOff,
    ShieldX,
    Slash,
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
import { ReportModal } from '../components/Modals/ReportModal';
import { RoleBadge } from '../components/Profile/RoleBadge';
import { TrustBadge } from '../components/Profile/TrustBadge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import 'mapbox-gl/dist/mapbox-gl.css';
import { HoverButton } from '../components/ui/HoverButton';
import { useAuth } from '../lib/auth';
import {
    blockUser,
    fetchBlockedUserIds,
    startDirectConversation,
    unblockUser,
} from '../lib/chatApi';
import { readQueryParam } from '../lib/navigation';
import { useTheme } from '../lib/theme';
import type { User } from '../lib/types';
import {
    cancelAccountDeletion,
    deleteAccount,
    deleteAdminUser,
    fetchCurrentUser,
    fetchUserById,
    updateAdminUserRole,
    updateProfile,
} from '../lib/userApi';
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

// Centralized UI classes are defined in index.css

const PROFILE_MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN?.trim() || '';
const PROFILE_MAPBOX_STYLE_DARK = 'mapbox/dark-v11';
const PROFILE_MAPBOX_STYLE_LIGHT = 'mapbox/light-v11';

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

// Focus handling is now managed by .input-field:focus in index.css

export function Profile() {
    const { theme } = useTheme();
    const [location, setLocation] = useLocation();
    const { logout, session, updateLocalUser } = useAuth();
    const [user, setUser] = useState<User | null>(null);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Partial<User>>({});
    const [saving, setSaving] = useState(false);
    const [showDel, setShowDel] = useState(false);
    const [blocked, setBlocked] = useState(false);
    const [showReportUserModal, setShowReportUserModal] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);
    const [confirmAction, setConfirmAction] = useState<null | {
        title: string;
        message: string;
        confirmLabel: string;
        destructive?: boolean;
        onConfirm: () => Promise<void>;
    }>(null);
    const [showRoleOptions, setShowRoleOptions] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const isAdmin = session?.user.role?.toLowerCase() === 'admin';
    const targetRole = user?.role?.toLowerCase() ?? 'user';
    const [mapError, setMapError] = useState<string | null>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapboxMap | null>(null);
    const mapboxGlRef = useRef<typeof import('mapbox-gl')['default'] | null>(null);
    const locationMarkerRef = useRef<MapboxMarker | null>(null);
    const toastTimerRef = useRef<number | null>(null);

    const selectedUserId = readQueryParam('userId');
    const isOwnProfile = !selectedUserId || selectedUserId === session?.user.id;
    const isSetupMode = readQueryParam('setup') === '1';
    const selectedLocation = resolveLocationValue(editing ? draft : user);
    const editableLocationMap = isOwnProfile && editing;
    const displayLocationMap = isOwnProfile && Boolean(selectedLocation || editableLocationMap);
    const mapStyle = theme === 'dark' ? PROFILE_MAPBOX_STYLE_DARK : PROFILE_MAPBOX_STYLE_LIGHT;

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
                : selectedUserId
                  ? await fetchUserById(selectedUserId)
                  : null;

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
                const [{ default: mapboxgl }] = await Promise.all([import('mapbox-gl')]);

                if (disposed || !mapContainerRef.current) {
                    return;
                }

                mapboxGlRef.current = mapboxgl;
                mapboxgl.accessToken = PROFILE_MAPBOX_TOKEN;

                const initialLocation = selectedLocation ?? DEFAULT_PULSE_CENTER;
                const map = new mapboxgl.Map({
                    container: mapContainerRef.current,
                    style: `mapbox://styles/${mapStyle}`,
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
                    setMapError(null);

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

                    // Force a resize after render to ensure the map fills the container
                    requestAnimationFrame(() => {
                        map.resize();
                    });
                });

                map.on('error', (event: MapboxErrorEvent) => {
                    const message =
                        event.error?.message || 'Mapbox failed to render the location picker.';
                    setMapError(message);
                    setMapLoaded(false);
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

    useEffect(() => {
        if (mapRef.current && mapLoaded) {
            mapRef.current.setStyle(`mapbox://styles/${mapStyle}`);
        }
    }, [mapStyle, mapLoaded]);

    useEffect(() => {
        return () => {
            if (toastTimerRef.current !== null) {
                window.clearTimeout(toastTimerRef.current);
            }
        };
    }, []);

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

    const requestBlockToggle = () => {
        setConfirmAction({
            title: blocked ? 'Unblock user' : 'Block user',
            message: blocked
                ? `Remove the block for ${user?.name ?? 'this user'}?`
                : `Block ${user?.name ?? 'this user'}? They won't be able to message you or see your detailed activity.`,
            confirmLabel: blocked ? 'Unblock' : 'Block',
            destructive: !blocked,
            onConfirm: handleToggleBlock,
        });
    };

    const requestRoleChange = (nextRole: 'admin' | 'mod' | 'user' | 'banned') => {
        setConfirmAction({
            title:
                nextRole === 'banned'
                    ? 'Ban user'
                    : nextRole === 'admin'
                      ? 'Promote user'
                      : nextRole === 'mod'
                        ? 'Promote user'
                        : 'Demote user',
            message:
                nextRole === 'banned'
                    ? `Ban ${user?.name ?? 'this user'}?`
                    : nextRole === 'admin'
                      ? `Promote ${user?.name ?? 'this user'} to admin?`
                      : nextRole === 'mod'
                        ? `Promote ${user?.name ?? 'this user'} to mod?`
                        : `Demote ${user?.name ?? 'this user'}?`,
            confirmLabel:
                nextRole === 'admin' || nextRole === 'mod'
                    ? 'Promote'
                    : nextRole === 'banned'
                      ? 'Ban'
                      : 'Demote',
            destructive: nextRole === 'banned' || nextRole === 'user',
            onConfirm: async () => {
                await handleAdminRole(nextRole);
            },
        });
    };

    const handleAdminRole = async (nextRole: 'admin' | 'mod' | 'user' | 'banned') => {
        if (!selectedUserId || actionBusy) {
            return;
        }

        setActionBusy(true);
        try {
            await updateAdminUserRole(selectedUserId, nextRole);
            // Refresh user state
            const updatedUser = await fetchUserById(selectedUserId);
            if (updatedUser) setUser(updatedUser);
            setShowRoleOptions(false);
            setToastMessage(`${updatedUser?.name ?? 'User'} role changed to ${nextRole}.`);
            if (toastTimerRef.current !== null) {
                window.clearTimeout(toastTimerRef.current);
            }
            toastTimerRef.current = window.setTimeout(() => {
                setToastMessage(null);
            }, 2400);
        } catch (error) {
            console.error(error);
            window.alert(error instanceof Error ? error.message : 'Could not update user role.');
        } finally {
            setActionBusy(false);
        }
    };

    const handleDeleteProfile = async () => {
        if (!selectedUserId || actionBusy) {
            return;
        }

        setActionBusy(true);
        try {
            await deleteAdminUser(selectedUserId);
            setLocation('/admin');
        } catch (error) {
            console.error(error);
            window.alert('Could not delete profile.');
        } finally {
            setActionBusy(false);
        }
    };

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
                <div class="section-body gap-md">
                    {[80, 120, 100].map((h, i) => (
                        <div
                            key={i}
                            style={`height:${h}px;border-radius:12px;background:var(--bg-muted);animation:pulse 1.5s ease-in-out infinite;animation-delay:${i * 100}ms;`}
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
                    <HoverButton
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
                    </HoverButton>
                ) : undefined
            }
        >
            <div class="section-body gap-md">
                {/* Identity card */}
                <div class="section animate-slide-up">
                    <div class="section-header">
                        <p class="label-caps !m-0">IDENTITY</p>
                    </div>
                    <div class="section-body !p-5 stack-h gap-lg" style="align-items:flex-start;">
                        <img src={user.avatar} alt="" class="avatar avatar-lg shadow-sm" />
                        <div class="stack-v gap-xs flex-1 min-w-0">
                            {editing ? (
                                <input
                                    value={draft.name ?? ''}
                                    onInput={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            name: (e.target as HTMLInputElement).value,
                                        }))
                                    }
                                    class="input-field"
                                    placeholder="Display name"
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
                            <div class="stack-h gap-sm mt-1.5 flex-wrap">
                                <TrustBadge score={user.trustScore} verified={user.verified} />
                                {user.role && <RoleBadge role={user.role} />}
                            </div>
                        </div>
                    </div>

                    {/* Bio row */}
                    <div class="section-body !px-5 !pb-5 !pt-0">
                        <p class="label-caps !mb-2">Bio</p>
                        {editing ? (
                            <textarea
                                value={draft.bio ?? ''}
                                onInput={(e) =>
                                    setDraft((d) => ({
                                        ...d,
                                        bio: (e.target as HTMLTextAreaElement).value,
                                    }))
                                }
                                class="input-field"
                                style="height:100px;resize:none;"
                                placeholder="Tell your neighbors a bit about yourself…"
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
                    <div class="stack-v gap-sm">
                        <p class="label-caps">Personal Actions</p>
                        <div class="stack-h gap-sm" style="flex-wrap:wrap;">
                            <HoverButton
                                type="button"
                                class="btn-primary"
                                onClick={handleMessageUser}
                                disabled={actionBusy}
                                style="flex:1 1 150px;height:36px;"
                            >
                                <MessageSquare size={14} />
                                Message
                            </HoverButton>
                            <HoverButton
                                type="button"
                                class="btn-ghost"
                                onClick={requestBlockToggle}
                                disabled={actionBusy}
                                style="flex:1 1 110px;height:36px;color:var(--danger);border-color:var(--danger-muted);"
                            >
                                <ShieldOff size={14} />
                                {blocked ? 'Unblock' : 'Block'}
                            </HoverButton>
                            <HoverButton
                                type="button"
                                class="btn-ghost"
                                onClick={() => setShowReportUserModal(true)}
                                disabled={actionBusy}
                                style="flex:1 1 110px;height:36px;color:var(--warning);border-color:var(--warning-muted);"
                            >
                                <Flag size={14} />
                                Report
                            </HoverButton>
                        </div>
                    </div>
                )}

                {isAdmin && !isOwnProfile && (
                    <div
                        class="animate-slide-up stack-v gap-sm"
                        style="background:var(--danger-subtle);padding:14px;border-radius:12px;border:1px solid var(--danger-muted);position:relative;"
                    >
                        <p class="label-caps" style="color:var(--danger);opacity:0.8;">
                            Admin Control Panel
                        </p>
                        <div class="stack-h gap-sm" style="flex-wrap:wrap;">
                            <HoverButton
                                id="manage-role-btn"
                                type="button"
                                class="btn-ghost"
                                onClick={() => setShowRoleOptions(!showRoleOptions)}
                                disabled={actionBusy}
                                style={`height:36px;flex:1 1 120px;border-color:var(--accent-muted);${
                                    showRoleOptions
                                        ? 'background:var(--accent);color:#fff;'
                                        : 'color:var(--accent);'
                                }`}
                            >
                                <ShieldCheck size={14} />
                                {showRoleOptions ? 'Close Menu' : 'Manage User Role'}
                            </HoverButton>

                            <HoverButton
                                type="button"
                                class="btn-ghost"
                                onClick={handleDeleteProfile}
                                disabled={actionBusy}
                                style="height:36px;flex:1 1 120px;color:var(--danger);border-color:var(--danger-muted);"
                            >
                                <Trash2 size={14} />
                                Delete Account
                            </HoverButton>
                        </div>

                        {showRoleOptions && (
                            <div
                                style="display:flex;flex-direction:column;gap:6px;margin-top:4px;padding-top:10px;border-top:1px solid var(--danger-muted);"
                                class="animate-fade-in"
                            >
                                <p style="font-size:11px;font-weight:700;color:var(--danger);opacity:0.6;text-transform:uppercase;">
                                    Available Role Actions
                                </p>
                                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                                    {targetRole !== 'admin' && (
                                        <HoverButton
                                            type="button"
                                            class="btn-ghost"
                                            onClick={() => requestRoleChange('admin')}
                                            style="height:32px;font-size:12px;color:var(--accent);border-color:var(--accent-muted);"
                                        >
                                            <ShieldCheck size={13} />
                                            Make Admin
                                        </HoverButton>
                                    )}
                                    {targetRole !== 'mod' && (
                                        <HoverButton
                                            type="button"
                                            class="btn-ghost"
                                            onClick={() => requestRoleChange('mod')}
                                            style="height:32px;font-size:12px;color:var(--warning);border-color:var(--warning-muted);"
                                        >
                                            <ShieldCheck size={13} />
                                            {targetRole === 'admin' ? 'Demote to Mod' : 'Make Mod'}
                                        </HoverButton>
                                    )}
                                    {targetRole !== 'user' && (
                                        <HoverButton
                                            type="button"
                                            class="btn-ghost"
                                            onClick={() => requestRoleChange('user')}
                                            style="height:32px;font-size:12px;color:var(--text-secondary);border-color:var(--border);"
                                        >
                                            <ShieldX size={13} />
                                            Demote to User
                                        </HoverButton>
                                    )}
                                    {targetRole !== 'banned' && (
                                        <HoverButton
                                            type="button"
                                            class="btn-ghost"
                                            onClick={() => requestRoleChange('banned')}
                                            style="height:32px;font-size:12px;color:var(--danger);border-color:var(--danger-muted);"
                                        >
                                            <Slash size={13} />
                                            Ban User
                                        </HoverButton>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Preferences */}
                <div class="section animate-slide-up" style="animation-delay:100ms">
                    <div class="section-header">
                        <p class="label-caps" style="margin:0;">
                            PREFERENCES
                        </p>
                    </div>
                    <div class="section-body gap-md">
                        {/* Home location */}
                        {isOwnProfile && (
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
                                        <HoverButton
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
                                        </HoverButton>
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
                                                displayLocationMap ? 'block' : 'none'
                                            };`}
                                        />
                                        {displayLocationMap && !mapLoaded && !mapError && (
                                            <div style="position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--text-secondary);font-size:12px;background:var(--bg-subtle);">
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
                                                    <HoverButton
                                                        type="button"
                                                        onClick={() => setMapError(null)}
                                                        style="background:none;border:none;cursor:pointer;padding:4px;color:var(--danger);opacity:0.6;display:flex;border-radius:6px;transition:background 0.2s;"
                                                        onMouseEnter={(e) =>
                                                            ((
                                                                e.target as HTMLElement
                                                            ).style.background =
                                                                'var(--danger-muted)')
                                                        }
                                                        onMouseLeave={(e) =>
                                                            ((
                                                                e.target as HTMLElement
                                                            ).style.background = 'transparent')
                                                        }
                                                        aria-label="Clear error"
                                                    >
                                                        <X size={14} />
                                                    </HoverButton>
                                                </div>
                                                {!mapLoaded && !PROFILE_MAPBOX_TOKEN && (
                                                    <p style="margin:4px 0 0 22px;font-size:11px;font-weight:500;color:var(--danger);line-height:1.45;opacity:0.8;">
                                                        Tip: Set VITE_MAPBOX_TOKEN in your
                                                        environment to enable the interactive map
                                                        preview.
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
                                            Click the map or drag the pin to set the account
                                            location.
                                        </p>
                                    )}

                                    <p style="font-size:12px;color:var(--text-tertiary);margin:0;">
                                        Selected: {locationText(selectedLocation)}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Distance limit */}
                        {isOwnProfile && (
                            <div class="flex-between">
                                <div class="stack-h gap-sm">
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
                                        class="input-field"
                                        style="width:80px;height:32px;padding:4px 8px;font-size:12px;text-align:right;"
                                    />
                                ) : (
                                    <span style="font-size:13px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;">
                                        {user.distanceLimit} m
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Quiet hours */}
                        <div class="flex-between">
                            <div class="stack-h gap-sm">
                                <Moon size={13} style="color:var(--text-tertiary);flex-shrink:0;" />
                                <span style="font-size:13px;color:var(--text-secondary);">
                                    Quiet hours
                                </span>
                            </div>
                            {editing ? (
                                <div class="stack-h gap-sm">
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
                                        class="input-field"
                                        style="padding:4px 8px;height:32px;width:auto;font-size:12px;"
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
                                        class="input-field"
                                        style="padding:4px 8px;height:32px;width:auto;font-size:12px;"
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
                                        <HoverButton
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
                                        </HoverButton>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Edit action bar */}
                {isOwnProfile && editing && (
                    <div class="animate-fade-in" style="display:flex;gap:8px;">
                        <HoverButton
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
                        </HoverButton>
                        <HoverButton
                            type="button"
                            class="btn-ghost"
                            onClick={() => {
                                setEditing(false);
                                setDraft(user);
                            }}
                            style="height:40px;padding:0 16px;"
                        >
                            Cancel
                        </HoverButton>
                    </div>
                )}

                {/* Sign out */}
                {isOwnProfile && (
                    <>
                        <HoverButton
                            type="button"
                            id="account-settings-btn"
                            class="btn-ghost"
                            onClick={() => setLocation('/settings')}
                            style="height:38px;width:100%;font-size:13px;color:var(--text-secondary);"
                        >
                            <ShieldCheck size={14} />
                            Account Settings
                        </HoverButton>

                        <HoverButton
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
                        </HoverButton>

                        {/* Delete account */}
                        <HoverButton
                            type="button"
                            id="delete-account-btn"
                            onClick={() => setShowDel(true)}
                            style="width:100%;height:32px;display:flex;align-items:center;justify-content:center;gap:5px;font-size:12px;font-weight:500;color:var(--text-tertiary);background:none;border:none;cursor:pointer;"
                        >
                            <Trash2 size={12} />
                            Delete Account
                        </HoverButton>
                    </>
                )}
            </div>

            {/* Delete confirm */}
            {isOwnProfile && showDel && (
                <div role="dialog" aria-modal="true" class="modal-overlay">
                    <div
                        class="modal-content animate-slide-up"
                        style="max-width:340px;padding:20px;"
                    >
                        <h3 style="font-size:15px;font-weight:700;color:var(--danger);margin:0 0 6px;">
                            Delete Account?
                        </h3>
                        <p style="font-size:13px;color:var(--text-secondary);margin:0 0 18px;line-height:1.5;">
                            Your account will be queued for deletion and removed after 7 days.
                        </p>
                        <div class="stack-h gap-sm">
                            <HoverButton
                                type="button"
                                onClick={() => {
                                    deleteAccount();
                                    logout();
                                    setLocation('/auth');
                                }}
                                style="flex:1;height:38px;border-radius:8px;border:none;background:var(--danger);color:#fff;font-size:13px;font-weight:600;cursor:pointer;"
                            >
                                Schedule Delete
                            </HoverButton>
                            <HoverButton
                                type="button"
                                class="btn-ghost"
                                onClick={async () => {
                                    await cancelAccountDeletion();
                                    setShowDel(false);
                                }}
                                style="flex:1;height:38px;"
                            >
                                Cancel Queue
                            </HoverButton>
                            <HoverButton
                                type="button"
                                class="btn-ghost"
                                onClick={() => setShowDel(false)}
                                style="flex:1;height:38px;"
                            >
                                Cancel
                            </HoverButton>
                        </div>
                    </div>
                </div>
            )}

            {!isOwnProfile && selectedUserId && showReportUserModal && (
                <ReportModal
                    targetId={selectedUserId}
                    targetType="user"
                    contentSnippet={user.bio?.trim() || user.name}
                    onClose={() => setShowReportUserModal(false)}
                />
            )}
            <ConfirmDialog
                open={confirmAction !== null}
                title={confirmAction?.title ?? ''}
                message={confirmAction?.message ?? ''}
                confirmLabel={confirmAction?.confirmLabel}
                destructive={confirmAction?.destructive}
                busy={actionBusy}
                onCancel={() => setConfirmAction(null)}
                onConfirm={async () => {
                    if (!confirmAction) return;
                    try {
                        await confirmAction.onConfirm();
                    } finally {
                        setConfirmAction(null);
                    }
                }}
            />
            {toastMessage && (
                <div
                    role="status"
                    aria-live="polite"
                    class="animate-fade-in"
                    style="position:fixed;right:16px;bottom:88px;z-index:140;max-width:min(92vw,320px);padding:10px 12px;border-radius:10px;border:1px solid var(--accent-muted);background:var(--accent-subtle);color:var(--accent);font-size:12px;font-weight:700;box-shadow:var(--shadow-lg);"
                >
                    {toastMessage}
                </div>
            )}
        </AppLayout>
    );
}
