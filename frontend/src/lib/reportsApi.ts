import { httpClient } from './httpClient';
import type { AdminFlag } from './types';

export async function createReport(params: {
    targetId: string;
    targetType: 'pulse' | 'user' | 'message';
    reason: string;
    content: string;
}): Promise<AdminFlag> {
    const res = await httpClient.post('/api/reports', {
        body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error('Failed to submit report');
    return res.json();
}

export async function fetchAdminReports(limit = 50, offset = 0): Promise<AdminFlag[]> {
    const res = await httpClient.get(`/api/admin/reports?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error('Failed to fetch reports');
    const data = await res.json();
    return data.reports;
}

export async function updateReportStatus(id: string, status: 'resolved' | 'dismissed'): Promise<void> {
    const res = await httpClient.patch(`/api/admin/reports/${id}/status`, {
        body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update report status');
}
