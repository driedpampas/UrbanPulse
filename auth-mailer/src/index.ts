import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';

export interface Env {
    EMAIL_QUEUE: Queue<VerificationEmailMsg>;
    SEND_MAIL: SendEmail;
}

export interface VerificationEmailMsg {
    email: string;
    token: string;
    timestamp: number;
}

export default {
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        try {
            const body = (await request.json()) as Partial<VerificationEmailMsg>;

            if (!body.email || !body.token) {
                return new Response('Missing email or token', { status: 400 });
            }

            await env.EMAIL_QUEUE.send({
                email: body.email,
                token: body.token,
                timestamp: Date.now(),
            });

            return new Response(JSON.stringify({ success: true, message: 'Verification queued.' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return new Response('Invalid request body', { status: 400 });
        }
    },

    async queue(batch, env, ctx) {
        for (const msg of batch.messages) {
            const { email, token } = msg.body;
            const verificationLink = `https://yourdomain.com/verify?token=${token}`;

            try {
                const mimeMsg = createMimeMessage();
                mimeMsg.setSender({ name: 'UrbanPulse Auth', addr: 'noreply@urbanpulse.syu.nl.eu.org' });
                mimeMsg.setRecipient(email);
                mimeMsg.setSubject('Verify your account');
                mimeMsg.addMessage({
                    contentType: 'text/html',
                    data: `<p>Click here to verify: <a href="${verificationLink}">${verificationLink}</a></p>`,
                });

                const message = new EmailMessage('noreply@urbanpulse.syu.nl.eu.org', email, mimeMsg.asRaw());

                await env.SEND_MAIL.send(message);

                msg.ack();
            } catch (error) {
                console.error(`Failed to send email to ${email}:`, error);
                msg.retry();
            }
        }
    },
} satisfies ExportedHandler<Env, VerificationEmailMsg>;
