import { Battery, BatteryCharging, BatteryWarning, Shield, Zap } from 'lucide-preact';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface BatteryInfo {
    level: number;
    charging: boolean;
    chargingTime: number;
    dischargingTime: number;
}

interface Props {
    open: boolean;
    battery: BatteryInfo | null;
    onRequestExclusion: () => Promise<boolean>;
    onDismiss: () => void;
}

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function BatteryIcon({ level, charging }: { level: number; charging: boolean }) {
    if (charging) return <BatteryCharging class="h-5 w-5 text-(--success)" />;
    if (level <= 0.15) return <BatteryWarning class="h-5 w-5 text-(--danger)" />;
    return <Battery class="h-5 w-5 text-(--warning)" />;
}

export function BatterySaverDialog({ open, battery, onRequestExclusion, onDismiss }: Props) {
    const levelPercent = battery ? Math.round(battery.level * 100) : null;

    const handleEnable = async () => {
        await onRequestExclusion();
    };

    return (
        <ConfirmDialog
            open={open}
            title="Battery Saver Recommended"
            message={
                <div class="stack-v gap-md">
                    <p>
                        Crisis mode is active. To extend your device's battery life, we recommend
                        enabling Battery Saver in your device settings.
                    </p>

                    {battery && (
                        <div class="rounded-xl border border-(--border) bg-(--bg-subtle) p-3">
                            <div class="stack-h gap-sm">
                                <BatteryIcon level={battery.level} charging={battery.charging} />
                                <div class="stack-v">
                                    <span class="text-xs font-semibold text-(--text)">
                                        {levelPercent}% {battery.charging ? '(Charging)' : ''}
                                    </span>
                                    {!battery.charging &&
                                        battery.dischargingTime > 0 &&
                                        Number.isFinite(battery.dischargingTime) && (
                                            <span class="text-xs text-(--text-tertiary)">
                                                ~{formatTime(battery.dischargingTime)} remaining
                                            </span>
                                        )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div class="rounded-xl border border-(--accent-muted) bg-(--accent-subtle) p-3">
                        <div class="stack-h gap-sm">
                            <Shield class="h-4 w-4 text-(--accent) shrink-0" />
                            <p class="text-xs text-(--text-secondary)">
                                With your permission, we can request that your system exclude this
                                site from battery optimizations so UrbanPulse keeps running even
                                when Battery Saver is on.
                            </p>
                        </div>
                    </div>

                    <div class="rounded-xl border border-(--success)/20 bg-(--success-subtle) p-3">
                        <div class="stack-h gap-sm">
                            <Zap class="h-4 w-4 text-(--success) shrink-0" />
                            <p class="text-xs text-(--text-secondary)">
                                Enable Battery Saver on your device, then tap below to request
                                exclusion.
                            </p>
                        </div>
                    </div>
                </div>
            }
            confirmLabel="Request Exclusion"
            cancelLabel="Not Now"
            onConfirm={handleEnable}
            onCancel={onDismiss}
        />
    );
}
