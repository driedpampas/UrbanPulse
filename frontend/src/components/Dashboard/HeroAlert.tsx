import { Bell, CheckCircle, ShieldAlert, X } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { acceptPulseRequest, connectWebSocket, disconnectWebSocket } from '../../lib/pulseApi';
import type { Pulse } from '../../lib/types';
import { HoverButton } from '../ui/HoverButton';

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
        const handleEvent = (event: any) => {
            if (event.event === 'hero.alert') {
                if (!isForeground) {
                    return;
                }

                setActiveAlert(event.pulse);
                setMatchedResources(
                    Array.isArray(event.matchedResources) ? event.matchedResources : []
                );

                // Auto-hide after 15 seconds
                setTimeout(() => {
                    setActiveAlert((curr) => (curr?.id === event.pulse.id ? null : curr));
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
                <div style="position:fixed;bottom:24px;right:24px;z-index:90;display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-lg);border-left:4px solid var(--accent);animate-fade-in;max-width:min(360px, calc(100vw - 24px));">
                    <div style="flex:1;min-width:0;">
                        <p style="margin:0;font-size:12px;font-weight:600;color:var(--text);">
                            Enable Hero Notifications?
                        </p>
                        <p style="margin:2px 0 0;font-size:11px;color:var(--text-secondary);">
                            Get alerted instantly when your skills are needed.
                        </p>
                        <div style="display:flex;align-items:center;gap:8px;margin-top:10px;">
                            <HoverButton
                                type="button"
                                onClick={requestNotificationPermission}
                                class="btn-primary"
                                style="height:32px;padding:0 12px;font-size:11px;background:var(--accent);"
                                onMouseEnter={(e) =>
                                    ((e.target as HTMLElement).style.filter =
                                        'var(--hover-brightness)')
                                }
                                onMouseLeave={(e) =>
                                    ((e.target as HTMLElement).style.filter = 'none')
                                }
                            >
                                Enable
                            </HoverButton>
                            <HoverButton
                                type="button"
                                onClick={dismissNotificationPrompt}
                                class="btn-ghost"
                                style="height:32px;padding:0 12px;font-size:11px;"
                            >
                                Not now
                            </HoverButton>
                        </div>
                    </div>
                    <HoverButton
                        type="button"
                        onClick={dismissNotificationPrompt}
                        class="btn-icon"
                        aria-label="Dismiss notification prompt"
                        title="Dismiss"
                        style="width:24px;height:24px;color:var(--text-secondary);flex-shrink:0;"
                        onMouseEnter={(e) =>
                            ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                        }
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                    >
                        <X size={14} />
                    </HoverButton>
                </div>
            );
        }
        return null;
    }

    return (
        <div
            class="animate-slide-up"
            style={`
				position:fixed;top:24px;left:50%;transform:translateX(-50%);
				width:100%;max-width:440px;z-index:100;
				background:var(--surface);border:1px solid var(--type-emergency-border);
				border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,0.3);
				overflow:hidden;backdrop-filter:blur(20px);
			`}
        >
            <div style="padding:16px;background:linear-gradient(135deg, var(--type-emergency-bg), rgba(255,255,255,0.05));">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div style="background:var(--danger);color:white;padding:5px;border-radius:8px;display:flex;align-items:center;justify-content:center;">
                            <ShieldAlert size={18} />
                        </div>
                        <span style="font-weight:800;font-size:14px;color:var(--type-emergency-text);letter-spacing:0.02em;text-transform:uppercase;">
                            Hero Alert
                        </span>
                    </div>
                    <HoverButton
                        type="button"
                        onClick={() => setActiveAlert(null)}
                        style="background:rgba(0,0,0,0.1);border:none;color:var(--text);padding:4px;border-radius:50%;cursor:pointer;display:flex;"
                        onMouseEnter={(e) =>
                            ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                        }
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                    >
                        <X size={16} />
                    </HoverButton>
                </div>

                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:12px;margin-bottom:12px;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                        <img
                            src={activeAlert.userAvatar}
                            style="width:28px;height:28px;border-radius:50%;border:2px solid var(--accent-muted);"
                            alt={`${activeAlert.userName}'s avatar`}
                        />
                        <span style="font-size:13px;font-weight:700;color:var(--text);">
                            {activeAlert.userName}
                        </span>
                        <span style="font-size:11px;color:var(--text-secondary);margin-left:auto;">
                            Just now
                        </span>
                    </div>
                    <p style="margin:0;font-size:14px;color:var(--text);line-height:1.5;font-weight:500;">
                        {activeAlert.content}
                    </p>
                </div>

                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
                    {(matchedResources.length > 0
                        ? matchedResources
                        : (activeAlert.requiredSkills ?? [])
                    ).map((skill) => (
                        <span
                            key={skill}
                            style="background:var(--accent);color:white;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;"
                        >
                            {skill}
                        </span>
                    ))}
                </div>

                <div style="display:flex;gap:12px;">
                    <HoverButton
                        type="button"
                        onClick={handleAcceptRequest}
                        disabled={accepting}
                        class="btn-primary"
                        style="flex:1;height:42px;background:var(--accent);border-radius:10px;font-weight:700;box-shadow:0 4px 15px var(--accent-muted);"
                        onMouseEnter={(e) =>
                            ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                        }
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                    >
                        <CheckCircle size={14} />
                        {accepting ? 'Accepting...' : 'Accept Request'}
                    </HoverButton>
                </div>
            </div>

            <div style="background:rgba(0,0,0,0.2);padding:8px 16px;display:flex;align-items:center;gap:6px;">
                <Bell size={10} style="color:var(--text-tertiary);" />
                <span style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">
                    Targeted alert based on your location and skills
                </span>
            </div>
        </div>
    );
}
