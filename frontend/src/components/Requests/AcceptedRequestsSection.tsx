import { CheckCircle } from 'lucide-preact';
import { memo } from 'preact/compat';
import type { AcceptedInteraction } from '../../types';
import { timeAgo } from './requests.utils';

type Props = {
    acceptedByMe: AcceptedInteraction[];
};

function AcceptedRequestsSectionComponent({ acceptedByMe }: Props) {
    return (
        <section class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;gap:7px;">
                <CheckCircle size={14} style="color:var(--success);" />
                <h2 style="margin:0;font-size:13px;color:var(--text);">Requests I Accepted</h2>
            </div>

            {acceptedByMe.length === 0 && (
                <p style="margin:0;font-size:12px;color:var(--text-tertiary);">
                    You have not accepted any requests yet.
                </p>
            )}

            {acceptedByMe.map((entry) => (
                <article
                    key={entry.interaction.id}
                    style="padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--surface-raised);display:flex;flex-direction:column;gap:6px;"
                >
                    <p style="margin:0;font-size:13px;color:var(--text);line-height:1.5;">
                        {entry.pulse.content}
                    </p>
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        <span style="font-size:11px;color:var(--text-tertiary);">
                            Author: {entry.author.name}
                        </span>
                        <span style="font-size:11px;color:var(--text-tertiary);">
                            Accepted {timeAgo(entry.interaction.acceptedAt)}
                        </span>
                        {entry.pulse.isSolved && (
                            <span style="font-size:11px;font-weight:700;color:var(--success);">
                                Pulse solved
                            </span>
                        )}
                        {entry.interaction.status === 'successful' ? (
                            <span style="font-size:11px;font-weight:700;color:var(--success);margin-left:auto;">
                                Successful (+{entry.interaction.trustAwarded} trust)
                            </span>
                        ) : (
                            <span style="font-size:11px;font-weight:700;color:var(--warning);margin-left:auto;">
                                Waiting author confirmation
                            </span>
                        )}
                    </div>
                </article>
            ))}
        </section>
    );
}

export const AcceptedRequestsSection = memo(AcceptedRequestsSectionComponent);
