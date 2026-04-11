import { httpClient } from './httpClient';
import type { AdminFlag } from './types';

export async function createReport(params: {
    targetId: string;
    targetType: 'pulse' | 'user' | 'message';
    reason: string;
    content: string;
}): Promise<AdminFlag> {
    return httpClient<AdminFlag>('/reports', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

export async function fetchAdminReports(limit = 50, offset = 0): Promise<AdminFlag[]> {
    const data = await httpClient<{ reports: AdminFlag[] }>(
        `/admin/reports?limit=${limit}&offset=${offset}`
    );
    return data.reports;
}

export async function updateReportStatus(
    id: string,
    status: 'resolved' | 'dismissed'
): Promise<void> {
    await httpClient(`/admin/reports/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
    });
}
