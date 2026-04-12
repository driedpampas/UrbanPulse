import { httpClient } from './httpClient';

type SuccessResponse = {
    success: true;
    message?: string;
};

type EmailUpdateResponse = SuccessResponse & {
    email: string;
    isEmailVerified: boolean;
};

export async function requestPasswordChangeLink(): Promise<SuccessResponse> {
    return httpClient<SuccessResponse>('/password/request', {
        method: 'POST',
        body: JSON.stringify({}),
    });
}

export async function confirmPasswordChange(
    token: string,
    newPassword: string
): Promise<SuccessResponse> {
    return httpClient<SuccessResponse>('/password/confirm', {
        method: 'POST',
        body: JSON.stringify({
            token,
            newPassword,
        }),
    });
}

export async function updateEmailAddress(email: string): Promise<EmailUpdateResponse> {
    return httpClient<EmailUpdateResponse>('/settings/email', {
        method: 'POST',
        body: JSON.stringify({ email }),
    });
}

export async function requestVerificationEmail(): Promise<SuccessResponse> {
    return httpClient<SuccessResponse>('/auth/verify/request', {
        method: 'POST',
        body: JSON.stringify({}),
    });
}
