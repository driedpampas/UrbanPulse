import { memo } from 'preact/compat';

type Props = {
    showFilters: boolean;
    radius: number;
    limit: number;
    onRadiusChange: (value: number) => void;
    onLimitChange: (value: number) => void;
};

function DashboardFiltersPanelComponent({
    showFilters,
    radius,
    limit,
    onRadiusChange,
    onLimitChange,
}: Props) {
    if (!showFilters) {
        return null;
    }

    return (
        <div class="section animate-slide-up mt-2 p-4 stack-v gap-md">
            <div>
                <div class="flex-between mb-2">
                    <label
                        class="text-[12px] font-semibold text-[var(--text-secondary)]"
                        for="radius-input"
                    >
                        Radius filter
                    </label>
                    <span class="text-[12px] font-bold text-[var(--accent)] tabular-nums">
                        {radius} m
                    </span>
                </div>
                <input
                    id="radius-input"
                    type="range"
                    min={100}
                    max={5000}
                    step={100}
                    value={radius}
                    onInput={(event) =>
                        onRadiusChange(Number((event.target as HTMLInputElement).value))
                    }
                    style="accent-color:var(--accent);"
                    aria-label={`Radius: ${radius} meters`}
                />
            </div>

            <div class="pt-3 border-t border-[var(--border)]">
                <div class="flex-between mb-2">
                    <label
                        class="text-[12px] font-semibold text-[var(--text-secondary)]"
                        for="limit-input"
                    >
                        Pulse capacity
                    </label>
                    <span class="text-[10px] font-extrabold text-[var(--accent)] uppercase tracking-wider">
                        {limit} PER BATCH
                    </span>
                </div>
                <input
                    id="limit-input"
                    type="range"
                    min={10}
                    max={100}
                    step={10}
                    value={limit}
                    onInput={(event) =>
                        onLimitChange(Number((event.target as HTMLInputElement).value))
                    }
                    style="accent-color:var(--accent);"
                    aria-label={`Limit: ${limit} pulses`}
                />
            </div>
        </div>
    );
}

export const DashboardFiltersPanel = memo(DashboardFiltersPanelComponent);
