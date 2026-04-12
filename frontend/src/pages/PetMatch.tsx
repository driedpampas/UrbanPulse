import { ArrowRight, Clock, MapPin, PawPrint, Sparkles, Wand2 } from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import { HoverButton } from '../components/ui/HoverButton';
import { fetchPulses } from '../lib/pulseApi';
import type { Pulse } from '../types';

interface PetMatchResult {
    id: string; // The candidate ID
    confidence: number;
    reason: string;
}

function timeAgo(ts: number) {
    const d = Date.now() - ts;
    if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
    return `${Math.floor(d / 86400000)}d ago`;
}

export function PetMatch() {
    const [pulses, setPulses] = useState<Pulse[]>([]);
    const [loading, setLoading] = useState(true);
    const [matching, setMatching] = useState(false);
    const [matches, setMatches] = useState<Record<string, PetMatchResult[]>>({});

    useEffect(() => {
        fetchPulses(undefined, undefined, undefined, 100, 0, 'pet')
            .then((data) => {
                setPulses(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const lostPets = useMemo(
        () =>
            pulses.filter(
                (p) =>
                    p.content.toLowerCase().includes('lost') ||
                    p.content.toLowerCase().includes('missing')
            ),
        [pulses]
    );

    const foundPets = useMemo(
        () =>
            pulses.filter(
                (p) =>
                    p.content.toLowerCase().includes('found') ||
                    p.content.toLowerCase().includes('seen')
            ),
        [pulses]
    );

    const runAiMatch = async () => {
        if (lostPets.length === 0 || foundPets.length === 0) return;

        setMatching(true);
        try {
            const results: Record<string, PetMatchResult[]> = {};

            // We'll process each lost pet against all found pets
            // In a real high-traffic app, we'd do this in batches or on the backend
            for (const lost of lostPets) {
                const response = await fetch('/api/pet/match', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: { id: lost.id, content: lost.content },
                        candidates: foundPets.map((p) => ({ id: p.id, content: p.content })),
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.matches && data.matches.length > 0) {
                        results[lost.id] = data.matches;
                    }
                }
            }
            setMatches(results);
        } catch (err) {
            console.error('AI Matching failed:', err);
        } finally {
            setMatching(false);
        }
    };

    return (
        <AppLayout title="Pet Guardian">
            <div style="padding:16px;display:flex;flex-direction:column;gap:20px;max-width:800px;margin:0 auto;">
                {/* AI Header */}
                <div
                    class="card animate-slide-up"
                    style="padding:20px;background:linear-gradient(135deg, var(--accent-subtle) 0%, var(--surface) 100%);border:1px solid var(--accent);display:flex;align-items:center;justify-content:space-between;gap:16px;"
                >
                    <div style="flex:1;">
                        <h2 style="font-size:16px;font-weight:700;color:var(--text);margin:0 0 4px;display:flex;align-items:center;gap:8px;">
                            <Sparkles size={18} style="color:var(--warning);" />
                            AI Matcher (70% Threshold)
                        </h2>
                        <p style="font-size:13px;color:var(--text-secondary);margin:0;">
                            Qwen3 analyzes descriptions to find lost pets. Confirm matches manually.
                        </p>
                    </div>
                    <HoverButton
                        onClick={runAiMatch}
                        disabled={matching || loading || lostPets.length === 0}
                        style="background:var(--accent);color:white;padding:10px 18px;height:auto;font-size:13px;font-weight:600;"
                    >
                        {matching ? (
                            'Thinking...'
                        ) : (
                            <div style="display:flex;align-items:center;gap:8px;">
                                <Wand2 size={16} />
                                Find Matches
                            </div>
                        )}
                    </HoverButton>
                </div>

                {/* AI Matches Section */}
                {Object.keys(matches).length > 0 && (
                    <section>
                        <h3 style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">
                            Strong Potential Matches
                        </h3>
                        <div style="display:flex;flex-direction:column;gap:12px;">
                            {Object.entries(matches).map(([lostId, matchResults]) => {
                                const lostPulse = lostPets.find((p) => p.id === lostId);
                                if (!lostPulse) return null;

                                return matchResults.map((m) => {
                                    const foundPulse = foundPets.find((p) => p.id === m.id);
                                    if (!foundPulse) return null;

                                    return (
                                        <div
                                            key={`${lostId}-${m.id}`}
                                            class="card animate-slide-up"
                                            style="padding:0;overflow:hidden;border-left:4px solid var(--warning);"
                                        >
                                            <div style="padding:12px 16px;background:var(--bg-muted);display:flex;justify-content:space-between;align-items:center;">
                                                <span style="font-size:11px;font-weight:800;color:var(--warning);display:flex;align-items:center;gap:4px;">
                                                    <Sparkles size={12} />
                                                    {m.confidence}% MATCH
                                                </span>
                                                <span style="font-size:11px;color:var(--text-tertiary);">
                                                    {foundPulse.userName}'s report
                                                </span>
                                            </div>
                                            <div style="padding:16px;display:grid;grid-template-columns:1fr auto 1fr;gap:20px;align-items:center;">
                                                <div style="font-size:13px;color:var(--text);">
                                                    <span style="font-size:10px;font-weight:800;color:var(--danger);display:block;margin-bottom:4px;">
                                                        LOST
                                                    </span>
                                                    {lostPulse.content}
                                                </div>
                                                <ArrowRight
                                                    size={18}
                                                    style="color:var(--text-tertiary);"
                                                />
                                                <div style="font-size:13px;color:var(--text);">
                                                    <span style="font-size:10px;font-weight:800;color:var(--success);display:block;margin-bottom:4px;">
                                                        FOUND
                                                    </span>
                                                    {foundPulse.content}
                                                </div>
                                            </div>
                                            <div style="padding:12px 16px;border-top:1px solid var(--border);background:var(--surface-raised);font-size:12px;color:var(--text-secondary);font-style:italic;">
                                                " {m.reason} "
                                            </div>
                                        </div>
                                    );
                                });
                            })}
                        </div>
                    </section>
                )}

                {/* All Reports Section */}
                <section>
                    <h3 style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">
                        Recent Neighborhood Reports
                    </h3>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        {loading && (
                            <div style="color:var(--text-secondary);font-size:13px;padding:20px;text-align:center;">
                                Scanning neighborhood...
                            </div>
                        )}
                        {!loading && pulses.length === 0 && (
                            <div style="color:var(--text-secondary);font-size:13px;padding:20px;text-align:center;">
                                No pet reports found in your area.
                            </div>
                        )}
                        {pulses.map((pet, i) => {
                            const isLost =
                                pet.content.toLowerCase().includes('lost') ||
                                pet.content.toLowerCase().includes('missing');
                            return (
                                <div
                                    key={pet.id}
                                    class="card animate-slide-up"
                                    style={`padding:14px;display:flex;gap:14px;animation-delay:${i * 40}ms;`}
                                >
                                    <div
                                        style={`width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:${isLost ? 'var(--danger-subtle)' : 'var(--success-subtle)'};color:${isLost ? 'var(--danger)' : 'var(--success)'};`}
                                    >
                                        <PawPrint size={20} />
                                    </div>
                                    <div style="flex:1;">
                                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                                            <span
                                                style={`font-size:10px;font-weight:800;padding:2px 6px;border-radius:4px;background:${isLost ? 'var(--danger)' : 'var(--success)'};color:white;`}
                                            >
                                                {isLost ? 'LOST' : 'FOUND'}
                                            </span>
                                            <span style="font-size:13px;font-weight:700;color:var(--text);">
                                                {pet.userName}
                                            </span>
                                            <span style="font-size:11px;color:var(--text-tertiary);margin-left:auto;display:flex;align-items:center;gap:4px;">
                                                <Clock size={12} />
                                                {timeAgo(pet.timestamp)}
                                            </span>
                                        </div>
                                        <p style="font-size:13px;color:var(--text-secondary);margin:0;line-height:1.4;">
                                            {pet.content}
                                        </p>
                                        <div style="display:flex;align-items:center;gap:4px;margin-top:8px;font-size:11px;color:var(--text-tertiary);">
                                            <MapPin size={10} />
                                            {pet.lat.toFixed(4)}, {pet.lng.toFixed(4)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>
        </AppLayout>
    );
}
