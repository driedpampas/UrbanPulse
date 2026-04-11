/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';

// 1. Define your environment bindings
export interface Env {
	// Binds to the queue you created
	EMAIL_QUEUE: Queue<VerificationEmailMsg>;
	// Binds to the native Send Email capability
	SEND_MAIL: SendEmail;
}

// 2. Define the shape of your queue messages
export interface VerificationEmailMsg {
	email: string;
	token: string;
	timestamp: number;
}

export default {
	// THE PRODUCER: Receives the POST request and writes to the queue
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405 });
		}

		try {
			// Cast the parsed JSON to a partial type to safely check properties
			const body = (await request.json()) as Partial<VerificationEmailMsg>;

			if (!body.email || !body.token) {
				return new Response('Missing email or token', { status: 400 });
			}

			// TypeScript now enforces the shape of the data you send to the queue
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

	async queue(batch: MessageBatch<VerificationEmailMsg>, env: Env, ctx: ExecutionContext<unknown>): Promise<void> {
		for (const msg of batch.messages) {
			const { email, token } = msg.body;
			const verificationLink = `https://yourdomain.com/verify?token=${token}`;

			try {
				const mimeMsg = createMimeMessage();
				mimeMsg.setSender({ name: 'Acme Auth', addr: 'noreply@yourdomain.com' });
				mimeMsg.setRecipient(email);
				mimeMsg.setSubject('Verify your account');
				mimeMsg.addMessage({
					contentType: 'text/html',
					data: `<p>Click here to verify: <a href="${verificationLink}">${verificationLink}</a></p>`,
				});

				const message = new EmailMessage('noreply@yourdomain.com', email, mimeMsg.asRaw());

				await env.SEND_MAIL.send(message);

				msg.ack();
			} catch (error) {
				console.error(`Failed to send email to ${email}:`, error);
				msg.retry();
			}
		}
	},
} satisfies ExportedHandler<Env>;
