import {
    ArrowRight,
    CheckCircle,
    Clock,
    MapPin,
    PawPrint,
    Plus,
    Send,
    ShieldCheck,
    Sparkles,
    Wand2,
    X,
} from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import { HoverButton } from '../components/ui/HoverButton';
import { useAuth } from '../lib/auth';
import { confirmPulse, fetchPulses, postPulse } from '../lib/pulseApi';
import { fetchCurrentUser, fetchCurrentUserAreaSelection } from '../lib/userApi';
import type { Pulse } from '../types';

interface PetMatchResult {
    id: string;
    confidence: number;
    reason: string;
}

type ReportMode = 'lost' | 'found' | 'stray';

function timeAgo(ts: number) {
    const d = Date.now() - ts;
    if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
    return `${Math.floor(d / 86400000)}d ago`;
}

function getPetKind(content: string): {
    label: string;
    variant: 'danger' | 'success' | 'warning' | 'accent';
} {
    const c = content.toLowerCase();
    if (
        c.startsWith('lost:') ||
        c.includes(' lost ') ||
        c.startsWith('missing:') ||
        c.includes(' missing ')
    )
        return { label: 'Lost', variant: 'danger' };
    if (
        c.startsWith('found:') ||
        c.includes(' found ') ||
        c.startsWith('spotted:') ||
        c.includes(' spotted ')
    )
        return { label: 'Found', variant: 'success' };
    if (c.startsWith('stray:') || c.includes(' stray '))
        return { label: 'Stray', variant: 'warning' };
    return { label: 'Pet', variant: 'accent' };
}

const PLACEHOLDERS: Record<ReportMode, string> = {
    lost: 'e.g. Lost golden retriever, red collar, last seen near Oak Street park…',
    found: 'e.g. Found a small tabby cat with white paws, friendly, near Main St…',
    stray: 'e.g. Stray dog near school playground — brown, medium-sized, seems scared…',
};

const CONTENT_MAX = 280;

export function PetMatch() {
    const { session } = useAuth();
    const [pulses, setPulses] = useState<Pulse[]>([]);
    const [loading, setLoading] = useState(true);
    const [matching, setMatching] = useState(false);
    const [matches, setMatches] = useState<Record<string, PetMatchResult[]>>({});
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());

    const [showForm, setShowForm] = useState(false);
    const [reportMode, setReportMode] = useState<ReportMode>('lost');
    const [reportContent, setReportContent] = useState('');
    const [posting, setPosting] = useState(false);
    const [postError, setPostError] = useState<string | null>(null);
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [areaSelection, setAreaSelection] = useState<{
        lat: number;
        lng: number;
        radius: number;
    } | null>(null);

    useEffect(() => {
        fetchCurrentUser()
            .then((u) => {
                if (u.lat !== 0 || u.lng !== 0) setUserLocation({ lat: u.lat, lng: u.lng });
            })
            .catch(() => {});

        void fetchCurrentUserAreaSelection()
            .then((selection) => setAreaSelection(selection))
            .catch(() => setAreaSelection(null));
    }, []);

    useEffect(() => {
        let cancelled = false;

        fetchPulses(areaSelection?.lat, areaSelection?.lng, areaSelection?.radius, 100, 0, 'pet')
            .then((data) => {
                if (!cancelled) {
                    setPulses(data);
                }
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [areaSelection?.lat, areaSelection?.lng, areaSelection?.radius]);

    const lostPets = useMemo(
        () =>
            pulses.filter((p) => {
                const k = getPetKind(p.content);
                return k.label === 'Lost';
            }),
        [pulses]
    );

    const foundPets = useMemo(
        () =>
            pulses.filter((p) => {
                const k = getPetKind(p.content);
                return k.label === 'Found';
            }),
        [pulses]
    );

    const strayPets = useMemo(
        () =>
            pulses.filter((p) => {
                const k = getPetKind(p.content);
                return k.label === 'Stray';
            }),
        [pulses]
    );

    const runAiMatch = async () => {
        if (lostPets.length === 0 || foundPets.length === 0) return;
        setMatching(true);
        try {
            const results: Record<string, PetMatchResult[]> = {};
            for (const lost of lostPets) {
                const res = await fetch('/api/pet/match', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: { id: lost.id, content: lost.content },
                        candidates: foundPets.map((p) => ({ id: p.id, content: p.content })),
                    }),
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.matches?.length > 0) results[lost.id] = data.matches;
                }
            }
            setMatches(results);
        } catch (err) {
            console.error('AI matching failed:', err);
        } finally {
            setMatching(false);
        }
    };

    const handleConfirm = async (pulseId: string) => {
        if (confirmingId || confirmedIds.has(pulseId)) return;
        setConfirmingId(pulseId);
        try {
            await confirmPulse(pulseId);
            setConfirmedIds((prev) => new Set([...prev, pulseId]));
            setPulses((prev) =>
                prev.map((p) =>
                    p.id === pulseId
                        ? {
                              ...p,
                              confirmations: p.confirmations + 1,
                              verified: p.confirmations + 1 >= 3,
                          }
                        : p
                )
            );
        } catch (e: unknown) {
            if (e instanceof Error && e.message === 'Already confirmed') {
                setConfirmedIds((prev) => new Set([...prev, pulseId]));
            }
        } finally {
            setConfirmingId(null);
        }
    };

    const handlePost = async () => {
        const trimmed = reportContent.trim();
        if (!trimmed) {
            setPostError('Please describe the pet.');
            return;
        }
        if (!userLocation) {
            setPostError('No home location set — update it in Settings.');
            return;
        }

        const prefixes: Record<ReportMode, string> = {
            lost: 'LOST: ',
            found: 'FOUND: ',
            stray: 'STRAY: ',
        };
        const prefix = prefixes[reportMode];
        const content = trimmed.toUpperCase().startsWith(prefix.trimEnd())
            ? trimmed
            : `${prefix}${trimmed}`;

        setPosting(true);
        setPostError(null);
        try {
            const pulse = await postPulse({
                type: 'pet',
                content,
                lat: userLocation.lat,
                lng: userLocation.lng,
            });
            setPulses((prev) => [pulse, ...prev]);
            setReportContent('');
            setShowForm(false);
        } catch (e: unknown) {
            setPostError(e instanceof Error ? e.message : 'Failed to post.');
        } finally {
            setPosting(false);
        }
    };

    const canConfirm = (p: Pulse) =>
        Boolean(session) && session?.user.id !== p.userId && !confirmedIds.has(p.id);

    const matchCount = Object.values(matches).reduce((s, m) => s + m.length, 0);

    return (
        <AppLayout title="Pet Guardian">
            <div class="stack-v" style="padding:16px;gap:20px;max-width:760px;margin:0 auto;">
                {/* Page Header */}
                <div class="section animate-slide-up">
                    <div class="p-4 stack-h flex-between gap-md">
                        <div class="stack-v" style="gap:2px;">
                            <h1 style="font-size:16px;font-weight:800;color:var(--text);margin:0;display:flex;align-items:center;gap:8px;">
                                <PawPrint size={18} style="color:var(--accent);" />
                                Pet Guardian
                            </h1>
                            <p style="font-size:12px;color:var(--text-secondary);margin:0;">
                                Report missing animals · confirm sightings · AI-powered matching
                            </p>
                        </div>
                        <HoverButton
                            onClick={() => {
                                setShowForm((v) => !v);
                                setPostError(null);
                            }}
                            class="btn-primary"
                            id="pet-report-btn"
                        >
                            {showForm ? <X size={14} /> : <Plus size={14} />}
                            {showForm ? 'Cancel' : 'New Report'}
                        </HoverButton>
                    </div>
                </div>

                {/* Report Form */}
                {showForm && (
                    <div class="section animate-slide-up">
                        <div class="section-header">
                            <span class="label-caps">Post a pet report</span>
                        </div>
                        <div class="section-body stack-v" style="gap:14px;">
                            <div class="tab-switcher" role="tablist">
                                {(['lost', 'found', 'stray'] as ReportMode[]).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        role="tab"
                                        class={`tab-btn${reportMode === mode ? ' active' : ''}`}
                                        aria-selected={reportMode === mode}
                                        onClick={() => {
                                            setReportMode(mode);
                                            setPostError(null);
                                        }}
                                        id={`pet-mode-${mode}`}
                                    >
                                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                    </button>
                                ))}
                            </div>

                            <textarea
                                class="input-field"
                                rows={4}
                                maxLength={CONTENT_MAX}
                                placeholder={PLACEHOLDERS[reportMode]}
                                value={reportContent}
                                onInput={(e) => {
                                    setReportContent((e.target as HTMLTextAreaElement).value);
                                    setPostError(null);
                                }}
                                style="resize:vertical;font-size:13px;line-height:1.55;"
                                id="pet-report-content"
                            />

                            <div class="stack-h flex-between" style="align-items:center;">
                                <span style="font-size:11px;color:var(--text-tertiary);">
                                    {reportContent.length} / {CONTENT_MAX}
                                    {!userLocation && (
                                        <span style="color:var(--warning);margin-left:10px;">
                                            ⚠ No home location
                                        </span>
                                    )}
                                </span>
                                <HoverButton
                                    onClick={handlePost}
                                    disabled={posting || !reportContent.trim() || !userLocation}
                                    class="btn-primary h-[34px] px-3.5 text-[12px]"
                                    id="pet-report-submit"
                                >
                                    <Send size={13} />
                                    {posting ? 'Posting…' : 'Post Report'}
                                </HoverButton>
                            </div>

                            {postError && (
                                <p style="font-size:12px;color:var(--danger);margin:0;">
                                    {postError}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* AI Matcher */}
                <div class="section animate-slide-up">
                    <div class="section-header">
                        <span class="label-caps" style="display:flex;align-items:center;gap:6px;">
                            <Sparkles size={12} style="color:var(--warning);" />
                            AI Matcher
                        </span>
                        <span style="font-size:11px;color:var(--text-tertiary);">
                            {lostPets.length} lost · {foundPets.length} found
                        </span>
                    </div>
                    <div
                        class="section-body stack-h flex-between gap-md"
                        style="align-items:center;"
                    >
                        <p style="font-size:12px;color:var(--text-secondary);margin:0;flex:1;">
                            Qwen3 reads text descriptions to suggest lost/found matches above 70%
                            confidence.
                        </p>
                        <HoverButton
                            onClick={runAiMatch}
                            disabled={
                                matching ||
                                loading ||
                                lostPets.length === 0 ||
                                foundPets.length === 0
                            }
                            class="btn-ghost"
                            style="height:34px;padding:0 14px;font-size:12px;gap:6px;flex-shrink:0;border-color:var(--warning);color:var(--warning);"
                            id="pet-run-match-btn"
                        >
                            <Wand2 size={13} />
                            {matching ? 'Thinking…' : 'Find Matches'}
                        </HoverButton>
                    </div>
                </div>

                {/* Match Results */}
                {matchCount > 0 && (
                    <div class="section animate-slide-up">
                        <div class="section-header">
                            <span class="label-caps">
                                {matchCount} potential {matchCount === 1 ? 'match' : 'matches'}
                            </span>
                        </div>
                        <div class="stack-v" style="gap:1px;">
                            {Object.entries(matches).map(([lostId, matchResults]) => {
                                const lostPulse = lostPets.find((p) => p.id === lostId);
                                if (!lostPulse) return null;
                                return matchResults.map((m) => {
                                    const foundPulse = foundPets.find((p) => p.id === m.id);
                                    if (!foundPulse) return null;
                                    const hi = m.confidence >= 90;
                                    return (
                                        <div
                                            key={`${lostId}-${m.id}`}
                                            class="card-raised"
                                            style="padding:14px 16px;border-radius:0;"
                                        >
                                            <div
                                                class="stack-h flex-between"
                                                style="margin-bottom:12px;align-items:center;"
                                            >
                                                <span
                                                    style={`font-size:12px;font-weight:700;color:${hi ? 'var(--success)' : 'var(--warning)'};display:flex;align-items:center;gap:5px;`}
                                                >
                                                    <Sparkles size={11} />
                                                    {m.confidence}% match
                                                </span>
                                                <span style="font-size:11px;color:var(--text-tertiary);">
                                                    reported by {foundPulse.userName}
                                                </span>
                                            </div>
                                            <div style="display:grid;grid-template-columns:1fr 24px 1fr;gap:12px;align-items:start;">
                                                <div>
                                                    <span
                                                        class="label-caps"
                                                        style="color:var(--danger);margin-bottom:4px;display:block;"
                                                    >
                                                        Lost
                                                    </span>
                                                    <p style="font-size:12px;color:var(--text);margin:0;line-height:1.5;">
                                                        {lostPulse.content}
                                                    </p>
                                                </div>
                                                <ArrowRight
                                                    size={14}
                                                    style="color:var(--text-tertiary);margin-top:18px;"
                                                />
                                                <div>
                                                    <span
                                                        class="label-caps"
                                                        style="color:var(--success);margin-bottom:4px;display:block;"
                                                    >
                                                        Found
                                                    </span>
                                                    <p style="font-size:12px;color:var(--text);margin:0;line-height:1.5;">
                                                        {foundPulse.content}
                                                    </p>
                                                </div>
                                            </div>
                                            <p style="font-size:11px;color:var(--text-secondary);margin:10px 0 0;font-style:italic;line-height:1.4;">
                                                {m.reason}
                                            </p>
                                        </div>
                                    );
                                });
                            })}
                        </div>
                    </div>
                )}

                {/* Stray Sightings */}
                {strayPets.length > 0 && (
                    <div class="section animate-slide-up">
                        <div class="section-header">
                            <span class="label-caps">Stray sightings</span>
                            <span style="font-size:11px;color:var(--text-tertiary);">
                                3 confirmations = Verified Info
                            </span>
                        </div>
                        <div class="stack-v" style="gap:1px;">
                            {strayPets.map((pet) => {
                                const verified = pet.verified || pet.confirmations >= 3;
                                const confirmed = confirmedIds.has(pet.id);
                                const confirming = confirmingId === pet.id;
                                return (
                                    <div
                                        key={pet.id}
                                        class="card-raised"
                                        style="padding:14px 16px;border-radius:0;"
                                    >
                                        <div
                                            class="stack-h flex-between gap-md"
                                            style="align-items:flex-start;"
                                        >
                                            <div
                                                class="stack-v"
                                                style="gap:6px;flex:1;min-width:0;"
                                            >
                                                <div
                                                    class="stack-h gap-sm"
                                                    style="align-items:center;flex-wrap:wrap;"
                                                >
                                                    <span style="font-size:10px;font-weight:700;letter-spacing:0.06em;color:var(--warning);text-transform:uppercase;">
                                                        Stray
                                                    </span>
                                                    <span style="font-size:13px;font-weight:600;color:var(--text);">
                                                        {pet.userName}
                                                    </span>
                                                    {verified && (
                                                        <span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;color:var(--success);">
                                                            <ShieldCheck size={11} /> Verified Info
                                                        </span>
                                                    )}
                                                </div>
                                                <p style="font-size:13px;color:var(--text-secondary);margin:0;line-height:1.5;">
                                                    {pet.content}
                                                </p>
                                                <div
                                                    class="stack-h gap-md"
                                                    style="font-size:11px;color:var(--text-tertiary);align-items:center;"
                                                >
                                                    <span style="display:flex;align-items:center;gap:3px;">
                                                        <Clock size={10} />
                                                        {timeAgo(pet.timestamp)}
                                                    </span>
                                                    <span style="display:flex;align-items:center;gap:3px;">
                                                        <MapPin size={10} />
                                                        {pet.lat.toFixed(3)}, {pet.lng.toFixed(3)}
                                                    </span>
                                                    {pet.confirmations > 0 && (
                                                        <span style="display:flex;align-items:center;gap:3px;color:var(--success);">
                                                            <CheckCircle size={10} />
                                                            {pet.confirmations}/3
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {canConfirm(pet) && !confirmed && (
                                                <HoverButton
                                                    onClick={() => handleConfirm(pet.id)}
                                                    disabled={confirming}
                                                    class="btn-ghost"
                                                    style="height:34px;padding:0 12px;font-size:12px;gap:5px;border-color:var(--success);color:var(--success);flex-shrink:0;"
                                                    title="Confirm you saw this animal"
                                                    id={`confirm-stray-${pet.id}`}
                                                >
                                                    <CheckCircle size={13} />
                                                    {confirming ? '…' : 'Confirm'}
                                                </HoverButton>
                                            )}
                                            {confirmed && (
                                                <span style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--success);font-weight:600;flex-shrink:0;">
                                                    <CheckCircle size={13} /> Confirmed
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* All Reports */}
                <div class="section animate-slide-up">
                    <div class="section-header">
                        <span class="label-caps">All reports</span>
                    </div>

                    {loading && (
                        <div class="section-body stack-v" style="gap:10px;">
                            {[1, 2, 3].map((i) => (
                                <div
                                    key={i}
                                    style="height:72px;border-radius:8px;background:var(--bg-muted);animation:pulse 1.5s ease-in-out infinite;"
                                />
                            ))}
                        </div>
                    )}

                    {!loading && pulses.length === 0 && (
                        <div class="section-body" style="padding:40px 16px;text-align:center;">
                            <PawPrint
                                size={26}
                                style="color:var(--text-tertiary);margin:0 auto 10px;"
                            />
                            <p style="font-size:14px;font-weight:600;color:var(--text);margin:0 0 4px;">
                                No pet reports yet
                            </p>
                            <p style="font-size:12px;color:var(--text-tertiary);margin:0;">
                                Be the first to post in your area.
                            </p>
                        </div>
                    )}

                    {!loading && pulses.length > 0 && (
                        <div class="stack-v" style="gap:1px;">
                            {pulses.map((pet, i) => {
                                const { label, variant } = getPetKind(pet.content);
                                const verified = pet.verified || pet.confirmations >= 3;
                                const confirmed = confirmedIds.has(pet.id);
                                const confirming = confirmingId === pet.id;
                                return (
                                    <div
                                        key={pet.id}
                                        class="card-raised animate-slide-up"
                                        style={`padding:14px 16px;border-radius:0;animation-delay:${i * 25}ms;`}
                                    >
                                        <div class="stack-h gap-md" style="align-items:flex-start;">
                                            <div
                                                style={`width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--${variant}-subtle);color:var(--${variant});`}
                                            >
                                                <PawPrint size={17} />
                                            </div>
                                            <div
                                                class="stack-v"
                                                style="gap:5px;flex:1;min-width:0;"
                                            >
                                                <div
                                                    class="stack-h gap-sm"
                                                    style="align-items:center;flex-wrap:wrap;"
                                                >
                                                    <span
                                                        style={`font-size:10px;font-weight:700;letter-spacing:0.06em;color:var(--${variant});text-transform:uppercase;`}
                                                    >
                                                        {label}
                                                    </span>
                                                    <span style="font-size:13px;font-weight:600;color:var(--text);">
                                                        {pet.userName}
                                                    </span>
                                                    {verified && (
                                                        <span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;color:var(--success);">
                                                            <ShieldCheck size={10} /> Verified
                                                        </span>
                                                    )}
                                                    <span style="display:flex;align-items:center;gap:3px;font-size:11px;color:var(--text-tertiary);margin-left:auto;">
                                                        <Clock size={10} />
                                                        {timeAgo(pet.timestamp)}
                                                    </span>
                                                </div>
                                                <p style="font-size:13px;color:var(--text-secondary);margin:0;line-height:1.5;">
                                                    {pet.content}
                                                </p>
                                                <div
                                                    class="stack-h gap-md"
                                                    style="font-size:11px;color:var(--text-tertiary);align-items:center;"
                                                >
                                                    <span style="display:flex;align-items:center;gap:3px;">
                                                        <MapPin size={10} />
                                                        {pet.lat.toFixed(3)}, {pet.lng.toFixed(3)}
                                                    </span>
                                                    {pet.confirmations > 0 && (
                                                        <span style="display:flex;align-items:center;gap:3px;color:var(--success);">
                                                            <CheckCircle size={10} />
                                                            {pet.confirmations}/3 confirmed
                                                        </span>
                                                    )}
                                                    {canConfirm(pet) && !confirmed && (
                                                        <HoverButton
                                                            onClick={() => handleConfirm(pet.id)}
                                                            disabled={confirming}
                                                            style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;color:var(--accent);background:none;border:none;padding:0;cursor:pointer;margin-left:auto;"
                                                            id={`confirm-pet-${pet.id}`}
                                                        >
                                                            <CheckCircle size={10} />
                                                            {confirming
                                                                ? 'Confirming…'
                                                                : 'Confirm sighting'}
                                                        </HoverButton>
                                                    )}
                                                    {confirmed && (
                                                        <span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;color:var(--success);margin-left:auto;">
                                                            <CheckCircle size={10} /> You confirmed
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
