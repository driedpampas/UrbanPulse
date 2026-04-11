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
        <div
            class="animate-slide-up"
            style="margin-top:10px;padding:14px;border-radius:10px;border:1px solid var(--border);background:var(--bg-subtle);display:flex;flex-direction:column;gap:14px;"
        >
            <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <label
                        style="font-size:12px;font-weight:600;color:var(--text-secondary);"
                        for="radius-input"
                    >
                        Radius filter
                    </label>
                    <span style="font-size:12px;font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums;">
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
                    style="width:100%;accent-color:var(--accent);cursor:pointer;"
                    aria-label={`Radius: ${radius} meters`}
                />
            </div>

            <div style="padding-top:12px;border-top:1px solid var(--border);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <label
                        style="font-size:12px;font-weight:600;color:var(--text-secondary);"
                        for="limit-input"
                    >
                        Pulse capacity
                    </label>
                    <span style="font-size:10px;font-weight:800;color:var(--accent);text-transform:uppercase;">
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
                    style="width:100%;accent-color:var(--accent);cursor:pointer;"
                    aria-label={`Limit: ${limit} pulses`}
                />
            </div>
        </div>
    );
}

export const DashboardFiltersPanel = memo(DashboardFiltersPanelComponent);
