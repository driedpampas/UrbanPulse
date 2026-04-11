import { ArrowRight, Clock, MapPin, PawPrint, Sparkles } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import { fetchPetMatches } from '../lib/mockApi';
import type { PetMatch as PetMatchType } from '../lib/types';
import { HoverButton } from '../components/ui/HoverButton';

function timeAgo(ts: number) {
    const d = Date.now() - ts;
    if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
    return `${Math.floor(d / 86400000)}d ago`;
}

export function PetMatch() {
    const [pets, setPets] = useState<PetMatchType[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPetMatches().then((data) => {
            setPets(data);
            setLoading(false);
        });
    }, []);

    const matches = pets.filter(
        (p) => p.reportType === 'found' && p.matchConfidence && p.matchedWith
    );

    return (
        <AppLayout title="Pet Guardian">
            <div style="padding:16px;display:flex;flex-direction:column;gap:20px;">
                {/* AI Matches section */}
                {matches.length > 0 && (
                    <section>
                        <h2 style="font-size:12px;font-weight:700;color:var(--text-secondary);letter-spacing:0.05em;margin:0 0 10px;text-transform:uppercase;display:flex;align-items:center;gap:6px;">
                            <Sparkles size={13} style="color:var(--warning);" />
                            AI Matches
                        </h2>
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            {matches.map((foundPet, i) => {
                                const lostPet = pets.find((p) => p.id === foundPet.matchedWith);
                                if (!lostPet) return null;
                                const conf = foundPet.matchConfidence ?? 0;
                                return (
                                    <div
                                        key={foundPet.id}
                                        class="card animate-slide-up"
                                        style={`padding:16px;animation-delay:${i * 60}ms;border-left:3px solid var(--warning);`}
                                    >
                                        {/* Confidence header */}
                                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                                            <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:var(--warning);">
                                                <Sparkles size={11} />
                                                {conf}% match
                                            </span>
                                            <span style="font-size:11px;color:var(--text-tertiary);">
                                                {foundPet.species} · {foundPet.breed}
                                            </span>
                                        </div>

                                        {/* Progress bar */}
                                        <div style="height:4px;border-radius:2px;background:var(--bg-muted);margin-bottom:12px;overflow:hidden;">
                                            <div
                                                style={`height:100%;border-radius:2px;background:var(--warning);width:${conf}%;transition:width 1s ease;`}
                                            />
                                        </div>

                                        {/* Lost / Found comparison */}
                                        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:start;">
                                            <div style="padding:10px;border-radius:8px;background:var(--type-emergency-bg);border:1px solid var(--type-emergency-border);">
                                                <span style="font-size:10px;font-weight:800;color:var(--type-emergency-text);letter-spacing:0.06em;">
                                                    LOST
                                                </span>
                                                <p style="font-size:12px;font-weight:600;color:var(--text);margin:4px 0 2px;">
                                                    {lostPet.breed}
                                                </p>
                                                <p style="font-size:11px;color:var(--text-secondary);margin:0 0 2px;">
                                                    {lostPet.color}
                                                </p>
                                                <p style="font-size:10px;color:var(--text-tertiary);margin:0 0 6px;font-style:italic;">
                                                    "{lostPet.markings}"
                                                </p>
                                                <span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;color:var(--text-tertiary);">
                                                    <MapPin size={9} />
                                                    {lostPet.location}
                                                </span>
                                            </div>

                                            <div style="display:flex;align-items:center;justify-content:center;padding-top:20px;">
                                                <ArrowRight
                                                    size={14}
                                                    style="color:var(--text-tertiary);"
                                                />
                                            </div>

                                            <div style="padding:10px;border-radius:8px;background:var(--type-item-bg);border:1px solid var(--type-item-border);">
                                                <span style="font-size:10px;font-weight:800;color:var(--type-item-text);letter-spacing:0.06em;">
                                                    FOUND
                                                </span>
                                                <p style="font-size:12px;font-weight:600;color:var(--text);margin:4px 0 2px;">
                                                    {foundPet.breed}
                                                </p>
                                                <p style="font-size:11px;color:var(--text-secondary);margin:0 0 2px;">
                                                    {foundPet.color}
                                                </p>
                                                <p style="font-size:10px;color:var(--text-tertiary);margin:0 0 6px;font-style:italic;">
                                                    "{foundPet.markings}"
                                                </p>
                                                <span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;color:var(--text-tertiary);">
                                                    <MapPin size={9} />
                                                    {foundPet.location}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div style="display:flex;gap:8px;margin-top:12px;">
                                            <HoverButton
                                                type="button"
                                                class="btn-primary"
                                                style="flex:1;height:36px;font-size:12px;background:var(--accent);"
                                                onMouseEnter={(e) =>
                                                    ((e.target as HTMLElement).style.filter =
                                                        'var(--hover-brightness)')
                                                }
                                                onMouseLeave={(e) =>
                                                    ((e.target as HTMLElement).style.filter =
                                                        'none')
                                                }
                                            >
                                                Contact Finder
                                            </HoverButton>
                                            <HoverButton
                                                type="button"
                                                class="btn-ghost"
                                                style="height:36px;padding:0 14px;font-size:12px;"
                                                onMouseEnter={(e) =>
                                                    ((e.target as HTMLElement).style.filter =
                                                        'var(--hover-brightness)')
                                                }
                                                onMouseLeave={(e) =>
                                                    ((e.target as HTMLElement).style.filter =
                                                        'none')
                                                }
                                            >
                                                Not a match
                                            </HoverButton>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* All reports */}
                <section>
                    <h2 style="font-size:12px;font-weight:700;color:var(--text-secondary);letter-spacing:0.05em;margin:0 0 10px;text-transform:uppercase;display:flex;align-items:center;gap:6px;">
                        <PawPrint size={13} style="color:var(--text-secondary);" />
                        All Reports
                    </h2>
                    {loading ? (
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            {[1, 2].map((i) => (
                                <div
                                    key={i}
                                    style="height:68px;border-radius:10px;background:var(--bg-muted);animation:pulse 1.5s ease-in-out infinite;"
                                />
                            ))}
                        </div>
                    ) : (
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            {pets.map((pet, i) => {
                                const isLost = pet.reportType === 'lost';
                                return (
                                    <div
                                        key={pet.id}
                                        class="card animate-slide-up"
                                        style={`padding:12px 14px;display:flex;align-items:center;gap:12px;animation-delay:${i * 40}ms;`}
                                    >
                                        {/* Icon */}
                                        <div
                                            style={`width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${isLost ? 'var(--type-emergency-bg)' : 'var(--type-item-bg)'};color:${isLost ? 'var(--type-emergency-text)' : 'var(--type-item-text)'};`}
                                        >
                                            <PawPrint size={16} />
                                        </div>

                                        <div style="flex:1;min-width:0;">
                                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
                                                <span
                                                    class="type-badge"
                                                    style={`background:${isLost ? 'var(--type-emergency-bg)' : 'var(--type-item-bg)'};color:${isLost ? 'var(--type-emergency-text)' : 'var(--type-item-text)'};border-color:${isLost ? 'var(--type-emergency-border)' : 'var(--type-item-border)'};`}
                                                >
                                                    {isLost ? 'LOST' : 'FOUND'}
                                                </span>
                                                <span style="font-size:13px;font-weight:600;color:var(--text);">
                                                    {pet.breed}
                                                </span>
                                            </div>
                                            <p style="font-size:11px;color:var(--text-tertiary);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                                {pet.markings}
                                            </p>
                                        </div>

                                        <div style="text-align:right;flex-shrink:0;">
                                            <span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;color:var(--text-tertiary);font-variant-numeric:tabular-nums;">
                                                <Clock size={9} />
                                                {timeAgo(pet.timestamp)}
                                            </span>
                                            {pet.matchConfidence && (
                                                <p style="font-size:10px;color:var(--warning);font-weight:700;margin:2px 0 0;">
                                                    {pet.matchConfidence}% match
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </AppLayout>
    );
}
