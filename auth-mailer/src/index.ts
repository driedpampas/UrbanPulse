import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';

type AuthMailerAction = 'verification' | 'password_change';

export interface Env {
    EMAIL_QUEUE: Queue<AuthMailerMsg>;
    SEND_EMAIL?: SendEmail;
    RESEND_API_KEY?: string;
    MAIL_FROM?: string;
    MAIL_FROM_NAME?: string;
}

export interface AuthMailerRequest {
    action?: AuthMailerAction;
    email: string;
    verification_link?: string;
    password_change_link?: string;
}

export interface AuthMailerMsg {
    action: AuthMailerAction;
    email: string;
    link: string;
    timestamp: number;
}

const DEFAULT_FROM_EMAIL = 'urbanpulse-noreply@syu.nl.eu.org';
const DEFAULT_FROM_NAME = 'UrbanPulse Security';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

function isValidEmail(value: string): boolean {
    return EMAIL_PATTERN.test(value);
}

function isValidAction(value: string): value is AuthMailerAction {
    return value === 'verification' || value === 'password_change';
}

function isValidVerificationLink(value: string): boolean {
    try {
        const parsed = new URL(value);
        if (parsed.protocol === 'https:') {
            return true;
        }

        const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
        return parsed.protocol === 'http:' && isLocalhost;
    } catch {
        return false;
    }
}

function buildVerificationEmailHtml(verificationLink: string): string {
    return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verify your UrbanPulse email</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;background:#f4f5f7;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;background:linear-gradient(135deg,#0f172a,#1e293b);color:#ffffff;">
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.8;">UrbanPulse Security</p>
                <h1 style="margin:0;font-size:24px;line-height:1.25;">Verify your email address</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#374151;">
                  Welcome to UrbanPulse. Confirm your email to unlock high-trust features and keep your account secure.
                </p>
                <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#4b5563;">
                  This verification link is single-use for your safety.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
                  <tr>
                    <td style="border-radius:10px;background:#2563eb;">
                      <a href="${verificationLink}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Verify Email</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6b7280;">If the button does not work, use this link:</p>
                <p style="margin:0 0 16px;font-size:12px;line-height:1.6;word-break:break-all;">
                  <a href="${verificationLink}" style="color:#2563eb;text-decoration:underline;">${verificationLink}</a>
                </p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;">If you did not create an UrbanPulse account, you can safely ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();
}

function buildPasswordChangeEmailHtml(passwordChangeLink: string): string {
    return `
<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Confirm your UrbanPulse password change</title>
    </head>
    <body style="margin:0;padding:0;background:#f4f5f7;font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;background:#f4f5f7;">
            <tr>
                <td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
                        <tr>
                            <td style="padding:24px 28px;background:linear-gradient(135deg,#111827,#1f2937);color:#ffffff;">
                                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.8;">UrbanPulse Security</p>
                                <h1 style="margin:0;font-size:24px;line-height:1.25;">Confirm your password change</h1>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:28px;">
                                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#374151;">
                                    We received a password change request for your UrbanPulse account.
                                </p>
                                <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#4b5563;">
                                    Use the secure link below to complete the password update. The token will expire shortly.
                                </p>
                                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
                                    <tr>
                                        <td style="border-radius:10px;background:#dc2626;">
                                            <a href="${passwordChangeLink}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Confirm Password Change</a>
                                        </td>
                                    </tr>
                                </table>
                                <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6b7280;">If the button does not work, use this link:</p>
                                <p style="margin:0 0 16px;font-size:12px;line-height:1.6;word-break:break-all;">
                                    <a href="${passwordChangeLink}" style="color:#2563eb;text-decoration:underline;">${passwordChangeLink}</a>
                                </p>
                                <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;">If you did not request this, ignore this message and review your account security settings immediately.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>
`.trim();
}

function buildVerificationEmailText(verificationLink: string): string {
    return [
        'Verify your UrbanPulse email address',
        '',
        'Open the link below to verify your account:',
        verificationLink,
        '',
        'If you did not create this account, you can ignore this email.',
    ].join('\n');
}

function buildPasswordChangeEmailText(passwordChangeLink: string): string {
    return [
        'Confirm your UrbanPulse password change',
        '',
        'Open the link below to update your password:',
        passwordChangeLink,
        '',
        'If you did not request this change, ignore this email and secure your account.',
    ].join('\n');
}

function buildMailContent(payload: AuthMailerMsg): { subject: string; html: string; text: string } {
    if (payload.action === 'password_change') {
        return {
            subject: 'Confirm your UrbanPulse password change',
            html: buildPasswordChangeEmailHtml(payload.link),
            text: buildPasswordChangeEmailText(payload.link),
        };
    }

    return {
        subject: 'Verify your UrbanPulse account',
        html: buildVerificationEmailHtml(payload.link),
        text: buildVerificationEmailText(payload.link),
    };
}

async function sendVerificationWithResend(env: Env, payload: AuthMailerMsg): Promise<boolean> {
    if (!env.RESEND_API_KEY) {
        return false;
    }

    const from = env.MAIL_FROM || DEFAULT_FROM_EMAIL;
    const fromName = env.MAIL_FROM_NAME || DEFAULT_FROM_NAME;
    const content = buildMailContent(payload);

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: `${fromName} <${from}>`,
            to: [payload.email],
            subject: content.subject,
            html: content.html,
            text: content.text,
        }),
    });

    if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`Resend API error ${response.status}: ${bodyText}`);
    }

    return true;
}

async function sendVerificationWithCloudflareEmail(
    env: Env,
    payload: AuthMailerMsg
): Promise<boolean> {
    if (!env.SEND_EMAIL) {
        return false;
    }

    const fromAddress = env.MAIL_FROM || DEFAULT_FROM_EMAIL;
    const fromName = env.MAIL_FROM_NAME || DEFAULT_FROM_NAME;
    const content = buildMailContent(payload);

    const mimeMessage = createMimeMessage();
    mimeMessage.setSender({ name: fromName, addr: fromAddress });
    mimeMessage.setRecipient(payload.email);
    mimeMessage.setSubject(content.subject);
    mimeMessage.addMessage({
        contentType: 'text/plain',
        data: content.text,
    });
    mimeMessage.addMessage({
        contentType: 'text/html',
        data: content.html,
    });

    const message = new EmailMessage(fromAddress, payload.email, mimeMessage.asRaw());
    await env.SEND_EMAIL.send(message);
    return true;
}

async function sendVerificationEmail(env: Env, payload: AuthMailerMsg): Promise<void> {
    const sentByResend = await sendVerificationWithResend(env, payload);
    if (sentByResend) {
        return;
    }

    const sentByCloudflare = await sendVerificationWithCloudflareEmail(env, payload);
    if (sentByCloudflare) {
        return;
    }

    throw new Error('No configured email provider. Set RESEND_API_KEY or SEND_EMAIL binding.');
}

function isNonRetriableDeliveryError(error: unknown): boolean {
    const message = String((error as { message?: unknown } | null)?.message ?? error).toLowerCase();

    return (
        message.includes('destination address is not a verified address') ||
        message.includes('invalid email') ||
        message.includes('mailbox does not exist')
    );
}

export default {
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return jsonResponse({ error: 'Method not allowed' }, 405);
        }

        try {
            const body = (await request.json()) as Partial<AuthMailerRequest>;

            const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
            const action =
                typeof body.action === 'string' && isValidAction(body.action)
                    ? body.action
                    : 'verification';

            const verificationLink =
                typeof body.verification_link === 'string' ? body.verification_link.trim() : null;
            const passwordChangeLink =
                typeof body.password_change_link === 'string'
                    ? body.password_change_link.trim()
                    : null;
            const link = action === 'password_change' ? passwordChangeLink : verificationLink;

            if (!email || !link) {
                return jsonResponse(
                    {
                        error:
                            action === 'password_change'
                                ? 'Missing required fields: email and password_change_link.'
                                : 'Missing required fields: email and verification_link.',
                    },
                    400
                );
            }

            if (!isValidEmail(email)) {
                return jsonResponse({ error: 'Invalid email format.' }, 400);
            }

            if (!isValidVerificationLink(link)) {
                return jsonResponse(
                    {
                        error:
                            action === 'password_change'
                                ? 'Invalid password_change_link URL.'
                                : 'Invalid verification_link URL.',
                    },
                    400
                );
            }

            await env.EMAIL_QUEUE.send({
                action,
                email,
                link,
                timestamp: Date.now(),
            });

            return jsonResponse({ success: true, message: 'Email queued.' }, 200);
        } catch {
            return jsonResponse({ error: 'Invalid request body.' }, 400);
        }
    },

    async queue(batch, env, ctx) {
        for (const msg of batch.messages) {
            try {
                await sendVerificationEmail(env, msg.body);
                msg.ack();
            } catch (error) {
                console.error(`Failed to send verification email to ${msg.body.email}:`, error);

                if (isNonRetriableDeliveryError(error)) {
                    msg.ack();
                    continue;
                }

                msg.retry();
            }
        }
    },
} satisfies ExportedHandler<Env, AuthMailerMsg>;
