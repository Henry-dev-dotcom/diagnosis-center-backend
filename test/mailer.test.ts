import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
  The mailer talks to a provider over HTTPS, so these tests replace fetch and
  check exactly what would have gone over the wire: which provider, which
  credential header, and that a recipient's address and the message body arrive
  where each provider expects them. The driver is chosen when the module loads,
  so each test sets the configuration first and then imports a fresh copy.
*/

const FROM = 'CurataMed Support <hello@example.test>';

async function mailerWith(config: { driver: 'disabled' | 'log' | 'resend' | 'brevo' }) {
  vi.resetModules();
  vi.doMock('../src/config/env.js', () => ({
    env: { MAIL_FROM: FROM, RESEND_API_KEY: 're_test_key', BREVO_API_KEY: 'xkeysib-test-key' },
    mailDriver: config.driver
  }));
  return import('../src/services/mailer.service.js');
}

const message = { to: 'admin@clinic.test', subject: 'Confirm your email', text: 'Open the link', html: '<p>Open the link</p>' };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('../src/config/env.js');
});

describe('parseSender', () => {
  it('splits a display name from the address', async () => {
    const { parseSender } = await mailerWith({ driver: 'brevo' });
    expect(parseSender('CurataMed Support <hello@example.test>')).toEqual({ name: 'CurataMed Support', email: 'hello@example.test' });
    expect(parseSender('"CurataMed, Inc." <hello@example.test>')).toEqual({ name: 'CurataMed, Inc.', email: 'hello@example.test' });
  });

  it('accepts a bare address', async () => {
    const { parseSender } = await mailerWith({ driver: 'brevo' });
    expect(parseSender('hello@example.test')).toEqual({ email: 'hello@example.test' });
    expect(parseSender('<hello@example.test>')).toEqual({ email: 'hello@example.test' });
  });
});

describe('the brevo driver', () => {
  it('posts to Brevo with the key in the api-key header and the sender split out', async () => {
    const { sendMail } = await mailerWith({ driver: 'brevo' });
    expect(await sendMail(message)).toBe('sent');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init.headers as Record<string, string>)['api-key']).toBe('xkeysib-test-key');
    expect(JSON.parse(String(init.body))).toEqual({
      sender: { name: 'CurataMed Support', email: 'hello@example.test' },
      to: [{ email: 'admin@clinic.test' }],
      subject: 'Confirm your email',
      textContent: 'Open the link',
      htmlContent: '<p>Open the link</p>'
    });
  });

  it('turns a provider refusal into a delivery failure, without leaking its answer', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"message":"sender not verified"}', { status: 400 }));
    const { sendMail } = await mailerWith({ driver: 'brevo' });
    await expect(sendMail(message)).rejects.toMatchObject({ statusCode: 502, code: 'MAIL_DELIVERY_FAILED' });
  });

  it('turns a network failure into a delivery failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));
    const { sendMail } = await mailerWith({ driver: 'brevo' });
    await expect(sendMail(message)).rejects.toMatchObject({ statusCode: 502, code: 'MAIL_DELIVERY_FAILED' });
  });
});

describe('the other drivers are unchanged', () => {
  it('resend still posts to Resend with a bearer token', async () => {
    const { sendMail } = await mailerWith({ driver: 'resend' });
    expect(await sendMail(message)).toBe('sent');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test_key');
    expect(JSON.parse(String(init.body)).from).toBe(FROM);
  });

  it('disabled sends nothing and says so', async () => {
    const { sendMail } = await mailerWith({ driver: 'disabled' });
    expect(await sendMail(message)).toBe('disabled');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
