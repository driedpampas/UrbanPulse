import { httpClient } from './httpClient';
import type {
    AdminFlag,
    AdminMessageReport,
    MessageReportAction,
    MessageReportStatus,
} from './types';

export async function createReport(params: {
    targetId: string;
    targetType: 'pulse' | 'user';
    reason: string;
    content: string;
}): Promise<AdminFlag> {
    return httpClient<AdminFlag>('/reports', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

export async function createMessageReport(params: {
    messageId: string;
    reason: string;
}): Promise<AdminMessageReport> {
    return httpClient<AdminMessageReport>(`/messages/${params.messageId}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason: params.reason }),
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

export async function fetchAdminMessageReports(
    limit = 50,
    offset = 0,
    status: MessageReportStatus = 'pending'
): Promise<AdminMessageReport[]> {
    const data = await httpClient<{ reports: AdminMessageReport[] }>(
        `/admin/reports/messages?status=${encodeURIComponent(status)}&limit=${limit}&offset=${offset}`
    );
    return data.reports;
}

export async function applyAdminMessageReportAction(
    reportId: string,
    action: MessageReportAction
): Promise<void> {
    await httpClient(`/admin/reports/messages/${reportId}/action`, {
        method: 'POST',
        body: JSON.stringify({ action }),
    });
}
