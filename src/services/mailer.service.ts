import { env, mailDriver } from '../config/env.js';
import { AppError } from '../utils/appError.js';

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Sends one transactional email and reports how it was handled, so the caller
 * can decide what to tell the user:
 *  - 'sent'     handed to the mail provider
 *  - 'logged'   written to the server log (development default)
 *  - 'disabled' dropped (production default until MAIL_DRIVER is configured)
 *
 * No email library on purpose: one HTTPS POST keeps the dependency tree, and
 * its audit surface, unchanged.
 */
export async function sendMail(message: MailMessage): Promise<'sent' | 'logged' | 'disabled'> {
  if (mailDriver === 'disabled') {
    return 'disabled';
  }

  if (mailDriver === 'log') {
    console.info(`[mail] To: ${message.to} | Subject: ${message.subject}\n${message.text}`);
    return 'logged';
  }

  /*
    A deadline on the provider.

    Without one, a provider that accepts the connection and then says nothing
    holds the request open until the platform gives up on it - and the person
    waiting is looking at a spinner for a minute.
  */
  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {})
      }),
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    throw new AppError('The email could not be sent. Please try again later.', 502, 'MAIL_DELIVERY_FAILED');
  }

  if (!response.ok) {
    throw new AppError('The email could not be sent. Please try again later.', 502, 'MAIL_DELIVERY_FAILED');
  }
  return 'sent';
}
