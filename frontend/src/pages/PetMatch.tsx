import { ArrowRight, Clock, MapPin, PawPrint, Sparkles } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import { fetchPetMatches } from '../lib/mockApi';
import type { PetMatch as PetMatchType } from '../lib/types';

function timeAgo(ts: number) {
    const diff = Date.now() - ts;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
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
        <AppLayout title="AI Guardian">
            <div class="p-4 space-y-4">
                {matches.length > 0 && (
                    <div>
                        <h2 class="text-sm font-bold flex items-center gap-1.5 mb-3">
                            <Sparkles size={16} class="text-accent" /> Potential Matches
                        </h2>
                        <div class="space-y-3">
                            {matches.map((foundPet, i) => {
                                const lostPet = pets.find((p) => p.id === foundPet.matchedWith);
                                if (!lostPet) return null;
                                return (
                                    <div
                                        key={foundPet.id}
                                        class="glass rounded-2xl p-4 animate-fade-up border-l-4 border-l-accent"
                                        style={{ animationDelay: `${i * 80}ms` }}
                                    >
                                        <div class="flex items-center justify-between mb-3">
                                            <span class="text-xs font-bold text-accent flex items-center gap-1">
                                                <Sparkles size={12} /> {foundPet.matchConfidence}%
                                                Match
                                            </span>
                                            <span class="text-[10px] text-text-secondary">
                                                {foundPet.species} • {foundPet.breed}
                                            </span>
                                        </div>
                                        <div class="w-full bg-surface-dim rounded-full h-1.5 mb-3">
                                            <div
                                                class="bg-linear-to-r from-accent to-secondary h-1.5 rounded-full transition-all duration-1000"
                                                style={{ width: `${foundPet.matchConfidence}%` }}
                                            />
                                        </div>

                                        <div class="grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
                                            <div class="bg-danger/5 rounded-xl p-3">
                                                <span class="text-[10px] font-bold text-danger">
                                                    LOST
                                                </span>
                                                <p class="text-xs font-semibold mt-1">
                                                    {lostPet.breed}
                                                </p>
                                                <p class="text-[10px] text-text-secondary mt-0.5">
                                                    {lostPet.color}
                                                </p>
                                                <p class="text-[10px] text-text-secondary mt-1 italic">
                                                    "{lostPet.markings}"
                                                </p>
                                                <p class="text-[10px] text-text-secondary mt-1.5 flex items-center gap-0.5">
                                                    <MapPin size={8} />
                                                    {lostPet.location}
                                                </p>
                                            </div>

                                            <div class="flex items-center justify-center pt-6">
                                                <ArrowRight size={16} class="text-accent" />
                                            </div>

                                            <div class="bg-secondary/5 rounded-xl p-3">
                                                <span class="text-[10px] font-bold text-secondary">
                                                    FOUND
                                                </span>
                                                <p class="text-xs font-semibold mt-1">
                                                    {foundPet.breed}
                                                </p>
                                                <p class="text-[10px] text-text-secondary mt-0.5">
                                                    {foundPet.color}
                                                </p>
                                                <p class="text-[10px] text-text-secondary mt-1 italic">
                                                    "{foundPet.markings}"
                                                </p>
                                                <p class="text-[10px] text-text-secondary mt-1.5 flex items-center gap-0.5">
                                                    <MapPin size={8} />
                                                    {foundPet.location}
                                                </p>
                                            </div>
                                        </div>

                                        <div class="mt-3 flex gap-2">
                                            <button
                                                type="button"
                                                class="flex-1 bg-linear-to-r from-primary to-primary-dark text-white text-xs py-2.5 rounded-xl font-semibold shadow-lg"
                                            >
                                                Contact Finder
                                            </button>
                                            <button
                                                type="button"
                                                class="px-4 text-xs border border-border rounded-xl hover:bg-surface-dim"
                                            >
                                                Not a match
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div>
                    <h2 class="text-sm font-bold flex items-center gap-1.5 mb-3">
                        <PawPrint size={16} class="text-primary" /> All Reports
                    </h2>
                    {loading ? (
                        [1, 2].map((i) => (
                            <div key={i} class="glass rounded-2xl p-4 animate-pulse h-20 mb-2" />
                        ))
                    ) : (
                        <div class="space-y-2">
                            {pets.map((pet, i) => (
                                <div
                                    key={pet.id}
                                    class="glass rounded-2xl p-3 flex items-center gap-3 animate-fade-up"
                                    style={{ animationDelay: `${i * 50}ms` }}
                                >
                                    <div
                                        class={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                            pet.reportType === 'lost'
                                                ? 'bg-danger/10 text-danger'
                                                : 'bg-secondary/10 text-secondary'
                                        }`}
                                    >
                                        <PawPrint size={18} />
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2">
                                            <span
                                                class={`text-[10px] font-bold uppercase ${pet.reportType === 'lost' ? 'text-danger' : 'text-secondary'}`}
                                            >
                                                {pet.reportType}
                                            </span>
                                            <span class="text-xs font-semibold">{pet.breed}</span>
                                        </div>
                                        <p class="text-[10px] text-text-secondary truncate">
                                            {pet.markings}
                                        </p>
                                    </div>
                                    <div class="text-right shrink-0">
                                        <p class="text-[10px] text-text-secondary flex items-center gap-0.5">
                                            <Clock size={8} />
                                            {timeAgo(pet.timestamp)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
