import { httpClient } from './httpClient';
import type { AdminFlag } from './types';

export async function createReport(params: {
    targetId: string;
    targetType: 'pulse' | 'user' | 'message';
    reason: string;
    content: string;
}): Promise<AdminFlag> {
    return httpClient<AdminFlag>('/api/reports', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

export async function fetchAdminReports(limit = 50, offset = 0): Promise<AdminFlag[]> {
    const data = await httpClient<{ reports: AdminFlag[] }>(
        `/api/admin/reports?limit=${limit}&offset=${offset}`
    );
    return data.reports;
}

export async function updateReportStatus(id: string, status: 'resolved' | 'dismissed'): Promise<void> {
    await httpClient(`/api/admin/reports/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
    });
}
