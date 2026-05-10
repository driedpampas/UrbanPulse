import { AlertCircle, ArrowRight } from 'lucide-preact';
import type { IncidentFeedItem } from '../../lib/incidentApi';
import { HoverButton } from '../ui/HoverButton';

interface Props {
    incident: IncidentFeedItem;
    onClick: () => void;
}

export function IncidentBanner({ incident, onClick }: Props) {
    const confidence = Math.round(incident.confidenceScore);

    return (
        <div class="mx-4 mt-3 animate-slide-up">
            <HoverButton
                onClick={onClick}
                class="w-full text-left p-0 border-none bg-transparent block"
            >
                <div
                    style="position:relative;overflow:hidden;border-radius:12px;border:1px solid rgba(220,38,38,0.3);background:linear-gradient(135deg,#2d0808 0%,#4a0f0f 50%,#2d0808 100%);box-shadow:0 4px 20px rgba(0,0,0,0.6);"
                    class="group transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                    {/* Animated pulse effect background */}
                    <div class="absolute inset-0 bg-linear-to-r from-white/0 via-white/5 to-white/0 -translate-x-full animate-[shimmer_2s_infinite]" />

                    <div class="relative p-3 sm:p-4 stack-h gap-md items-center">
                        <div class="shrink-0 w-10 h-10 rounded-full bg-white/20 flex-center text-white backdrop-blur-sm animate-pulse">
                            <AlertCircle size={20} fill="currentColor" class="text-(--danger)" />
                        </div>

                        <div class="flex-1 min-w-0">
                            <div class="stack-h gap-xs items-center">
                                <span class="px-1.5 py-0.5 rounded-md bg-white/20 text-[10px] font-black text-white uppercase tracking-wider backdrop-blur-sm">
                                    {incident.typeLabel}
                                </span>
                                <span class="text-[10px] font-bold text-white/80 uppercase tracking-widest">
                                    Emergency
                                </span>
                            </div>
                            <h3 class="text-base font-black text-white truncate mt-0.5 tracking-tight">
                                {incident.reports[0]?.title || 'Active Incident Reported'}
                            </h3>
                            <p class="text-xs font-bold text-white/90">
                                Confidence score: {confidence}%
                            </p>
                        </div>

                        <div class="shrink-0 stack-h gap-sm items-center pr-1">
                            <span class="hidden sm:block text-[11px] font-black text-white uppercase tracking-widest opacity-80 group-hover:opacity-100 transition-opacity">
                                View Details
                            </span>
                            <div class="w-8 h-8 rounded-full bg-white/20 flex-center text-white backdrop-blur-sm group-hover:translate-x-1 transition-transform">
                                <ArrowRight size={16} />
                            </div>
                        </div>
                    </div>
                </div>
            </HoverButton>
        </div>
    );
}
