import { Bell, CheckCircle, ShieldAlert, X } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { acceptPulseRequest, connectWebSocket, disconnectWebSocket } from '../../lib/pulseApi';
import type { Pulse } from '../../lib/types';
import { HoverButton } from '../ui/HoverButton';
import { UserAvatar } from '../ui/UserAvatar';

const HERO_NOTIFICATION_PROMPT_DISMISSED_KEY = 'hero-notification-prompt-dismissed';

export function HeroAlert() {
    const [activeAlert, setActiveAlert] = useState<Pulse | null>(null);
    const [matchedResources, setMatchedResources] = useState<string[]>([]);
    const [accepting, setAccepting] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(
        typeof Notification !== 'undefined' ? Notification.permission : 'default'
    );
    const [notificationPromptDismissed, setNotificationPromptDismissed] = useState(() => {
        if (typeof window === 'undefined') {
            return false;
        }

        return localStorage.getItem(HERO_NOTIFICATION_PROMPT_DISMISSED_KEY) === 'true';
    });
    const [isForeground, setIsForeground] = useState(() => {
        if (typeof document === 'undefined') {
            return true;
        }

        return document.visibilityState === 'visible' && document.hasFocus();
    });

    useEffect(() => {
        if (typeof document === 'undefined' || typeof window === 'undefined') {
            return;
        }

        const refresh = () => {
            setIsForeground(document.visibilityState === 'visible' && document.hasFocus());
        };

        refresh();
        document.addEventListener('visibilitychange', refresh);
        window.addEventListener('focus', refresh);
        window.addEventListener('blur', refresh);

        return () => {
            document.removeEventListener('visibilitychange', refresh);
            window.removeEventListener('focus', refresh);
            window.removeEventListener('blur', refresh);
        };
    }, []);

    useEffect(() => {
        const handleEvent = (event: {
            event: string;
            pulse?: Pulse;
            matchedResources?: string[];
            pulseId?: string;
        }) => {
            if (event.event === 'hero.alert' && event.pulse) {
                if (!isForeground) {
                    return;
                }

                const alertPulseId = event.pulse.id;
                setActiveAlert(event.pulse);
                setMatchedResources(
                    Array.isArray(event.matchedResources) ? event.matchedResources : []
                );

                // Auto-hide after 15 seconds
                setTimeout(() => {
                    setActiveAlert((curr) => (curr?.id === alertPulseId ? null : curr));
                    setMatchedResources((curr) => (curr.length > 0 ? [] : curr));
                }, 15000);
            }
        };

        connectWebSocket(handleEvent);
        return () => disconnectWebSocket(handleEvent);
    }, [isForeground]);

    const requestNotificationPermission = async () => {
        if (typeof Notification === 'undefined') return;
        const result = await Notification.requestPermission();
        setPermissionStatus(result);
        if (result !== 'default') {
            setNotificationPromptDismissed(false);
            localStorage.removeItem(HERO_NOTIFICATION_PROMPT_DISMISSED_KEY);
        }
    };

    const dismissNotificationPrompt = () => {
        setNotificationPromptDismissed(true);
        if (typeof window !== 'undefined') {
            localStorage.setItem(HERO_NOTIFICATION_PROMPT_DISMISSED_KEY, 'true');
        }
    };

    const handleAcceptRequest = async () => {
        if (!activeAlert || accepting) {
            return;
        }

        setAccepting(true);
        try {
            await acceptPulseRequest(activeAlert.id);
            setActiveAlert(null);
            setMatchedResources([]);
        } catch (error) {
            if (error instanceof Error && error.message === 'Already accepted') {
                setActiveAlert(null);
                setMatchedResources([]);
            } else {
                alert(error instanceof Error ? error.message : 'Could not accept request.');
            }
        } finally {
            setAccepting(false);
        }
    };

    if (!activeAlert) {
        if (
            permissionStatus === 'default' &&
            typeof Notification !== 'undefined' &&
            !notificationPromptDismissed
        ) {
            return (
                <div class="fixed bottom-6 right-6 z-90 stack-h items-start gap-md p-4 bg-(--surface) border border-(--border) rounded-xl shadow-lg border-l-4 border-l-(--accent) animate-fade-in max-w-[min(360px,calc(100vw-24px))]">
                    <div class="flex-1 min-w-0">
                        <p class="m-0 text-[12px] font-bold text-(--text)">
                            Enable Hero Notifications?
                        </p>
                        <p class="mt-0.5 text-[11px] text-(--text-secondary)">
                            Get alerted instantly when your skills are needed.
                        </p>
                        <div class="stack-h gap-sm mt-3">
                            <HoverButton
                                type="button"
                                onClick={requestNotificationPermission}
                                class="btn-primary h-8 px-3 text-[11px]"
                            >
                                Enable
                            </HoverButton>
                            <HoverButton
                                type="button"
                                onClick={dismissNotificationPrompt}
                                class="btn-ghost h-8 px-3 text-[11px]"
                            >
                                Not now
                            </HoverButton>
                        </div>
                    </div>
                    <HoverButton
                        type="button"
                        onClick={dismissNotificationPrompt}
                        class="btn-icon w-6 h-6 text-(--text-secondary) shrink-0"
                        aria-label="Dismiss notification prompt"
                        title="Dismiss"
                    >
                        <X size={14} />
                    </HoverButton>
                </div>
            );
        }
        return null;
    }

    return (
        <div class="animate-slide-up fixed top-6 left-1/2 -translate-x-1/2 w-full max-w-[440px] z-100 bg-(--surface) border border-(--type-emergency-border) rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden backdrop-blur-xl">
            <div class="p-4 bg-linear-to-br from-(--type-emergency-bg) to-white/5">
                <div class="flex-between mb-3">
                    <div class="stack-h gap-sm">
                        <div class="bg-(--danger) text-white p-1.5 rounded-lg flex-center">
                            <ShieldAlert size={18} />
                        </div>
                        <span class="font-extrabold text-[14px] text-(--type-emergency-text) tracking-wider uppercase">
                            Hero Alert
                        </span>
                    </div>
                    <HoverButton
                        type="button"
                        onClick={() => setActiveAlert(null)}
                        class="bg-black/10 text-(--text) p-1 rounded-full flex hover:brightness-110 transition-all"
                    >
                        <X size={16} />
                    </HoverButton>
                </div>

                <div class="bg-white/3 border border-white/5 rounded-xl p-3 mb-3">
                    <div class="stack-h gap-md mb-2">
                        <UserAvatar
                            userId={activeAlert.userId}
                            fallbackSrc={activeAlert.userAvatar}
                            className="w-7 h-7 rounded-full border-2 border-(--accent-muted)"
                            alt={`${activeAlert.userName}'s profile picture`}
                        />
                        <span class="text-[13px] font-bold text-(--text)">
                            {activeAlert.userName}
                        </span>
                        <span class="text-[11px] text-(--text-secondary) ml-auto">
                            Just now
                        </span>
                    </div>
                    <p class="m-0 text-[14px] text-(--text) leading-relaxed font-medium">
                        {activeAlert.content}
                    </p>
                </div>

                <div class="stack-h gap-sm flex-wrap mb-4">
                    {(matchedResources.length > 0
                        ? matchedResources
                        : (activeAlert.requiredSkills ?? [])
                    ).map((skill) => (
                        <span
                            key={skill}
                            class="bg-(--accent) text-white px-2.5 py-0.5 rounded-full text-[11px] font-bold shadow-sm"
                        >
                            {skill}
                        </span>
                    ))}
                </div>

                <div class="stack-h gap-md">
                    <HoverButton
                        type="button"
                        onClick={handleAcceptRequest}
                        disabled={accepting}
                        class="btn-primary flex-1 h-[42px] rounded-xl font-bold shadow-lg shadow-(--accent-muted)/20"
                    >
                        <CheckCircle size={14} />
                        {accepting ? 'Accepting...' : 'Accept Request'}
                    </HoverButton>
                </div>
            </div>

            <div class="bg-black/20 px-4 py-2 stack-h gap-xs">
                <Bell size={10} class="text-(--text-tertiary)" />
                <span class="text-[10px] text-(--text-tertiary) uppercase tracking-widest font-bold opacity-80">
                    Targeted alert based on your location and skills
                </span>
            </div>
        </div>
    );
}
