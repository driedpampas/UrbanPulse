import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

const BATTERY_SAVER_SESSION_KEY = 'up_battery_saver_dismissed';

interface BatteryState {
    level: number;
    charging: boolean;
    chargingTime: number;
    dischargingTime: number;
}

function readDismissedFlag(): boolean {
    try {
        return sessionStorage.getItem(BATTERY_SAVER_SESSION_KEY) === 'true';
    } catch {
        return false;
    }
}

function writeDismissedFlag(dismissed: boolean) {
    try {
        if (dismissed) {
            sessionStorage.setItem(BATTERY_SAVER_SESSION_KEY, 'true');
        } else {
            sessionStorage.removeItem(BATTERY_SAVER_SESSION_KEY);
        }
    } catch {
        // sessionStorage unavailable
    }
}

interface UseBatterySaverOptions {
    crisisMode: boolean;
}

export function useBatterySaver({ crisisMode }: UseBatterySaverOptions) {
    const [battery, setBattery] = useState<BatteryState | null>(null);
    const [wakeLockActive, setWakeLockActive] = useState(false);
    const [dialogDismissed, setDialogDismissed] = useState(readDismissedFlag);
    const batteryRef = useRef<BatteryState | null>(null);
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);

    useEffect(() => {
        if (!crisisMode) {
            setWakeLockActive(false);
            if (wakeLockRef.current) {
                void wakeLockRef.current.release();
                wakeLockRef.current = null;
            }
            return;
        }

        const dismissed = readDismissedFlag();
        setDialogDismissed(dismissed);
    }, [crisisMode]);

    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.getBattery) {
            return;
        }

        let mounted = true;

        void navigator.getBattery().then((batt: BatteryManager) => {
            if (!mounted) return;

            const isPlaceholder =
                batt.level === 1 &&
                batt.charging &&
                batt.chargingTime === 0 &&
                batt.dischargingTime === Infinity;

            const sync = () => {
                if (!mounted) return;
                const placeholder =
                    batt.level === 1 &&
                    batt.charging &&
                    batt.chargingTime === 0 &&
                    batt.dischargingTime === Infinity;
                if (placeholder) {
                    batteryRef.current = null;
                    setBattery(null);
                    return;
                }
                batteryRef.current = {
                    level: batt.level,
                    charging: batt.charging,
                    chargingTime: batt.chargingTime,
                    dischargingTime: batt.dischargingTime,
                };
                setBattery(batteryRef.current);
            };

            if (!isPlaceholder) {
                batteryRef.current = {
                    level: batt.level,
                    charging: batt.charging,
                    chargingTime: batt.chargingTime,
                    dischargingTime: batt.dischargingTime,
                };
                setBattery(batteryRef.current);
            }

            batt.addEventListener('levelchange', sync);
            batt.addEventListener('chargingchange', sync);
            batt.addEventListener('chargingtimechange', sync);
            batt.addEventListener('dischargingtimechange', sync);
        });

        return () => {
            mounted = false;
        };
    }, []);

    const requestWakeLock = useCallback(async () => {
        if (typeof navigator === 'undefined' || !navigator.wakeLock) {
            return false;
        }
        try {
            const sentinel = await navigator.wakeLock.request('screen');
            wakeLockRef.current = sentinel;
            setWakeLockActive(true);
            setDialogDismissed(true);
            writeDismissedFlag(true);
            sentinel.addEventListener('release', () => {
                wakeLockRef.current = null;
                setWakeLockActive(false);
            });
            return true;
        } catch {
            return false;
        }
    }, []);

    const dismissDialog = useCallback(() => {
        setDialogDismissed(true);
        writeDismissedFlag(true);
    }, []);

    const shouldShowDialog = crisisMode && !dialogDismissed && !wakeLockActive;

    return {
        battery,
        wakeLockActive,
        shouldShowDialog,
        requestWakeLock,
        dismissDialog,
    };
}
