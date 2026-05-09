declare const __COMMIT_HASH__: string;

interface BatteryManager extends EventTarget {
    charging: boolean;
    chargingTime: number;
    dischargingTime: number;
    level: number;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

interface WakeLockSentinel extends EventTarget {
    released: boolean;
    release(): Promise<void>;
}

interface WakeLock {
    request(type: 'screen'): Promise<WakeLockSentinel>;
}

interface Navigator {
    getBattery?: () => Promise<BatteryManager>;
    wakeLock?: WakeLock;
}
