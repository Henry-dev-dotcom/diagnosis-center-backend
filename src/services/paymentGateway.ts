import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env, paymentGateway } from '../config/env.js';
import { AppError } from '../utils/appError.js';

/*
  Payment gateway (Phase 5). Paystack in production (GHS: cards and mobile
  money, with reusable authorisations for renewals). The 'fake' gateway
  simulates Paystack's behaviour in development and tests: checkout links go
  to a local page, and outcomes can be forced, so every billing path is
  exercised without real money or network access. The fake gateway is refused
  in production by the environment check.

  Amounts cross this boundary in pesewas (1 GHS = 100 pesewas), as Paystack expects.
*/

export type ChargeResult = {
  status: 'success' | 'failed' | 'pending';
  reference: string;
  amountPesewas: number;
  message?: string;
  paidAt?: Date;
  customerCode?: string;
  authorization?: { code: string; reusable: boolean; hint: string };
};

export interface PaymentGateway {
  readonly name: 'paystack' | 'fake';
  initialize(input: { email: string; amountPesewas: number; reference: string; callbackUrl: string; metadata: Record<string, unknown> }): Promise<{ authorizationUrl: string }>;
  verify(reference: string): Promise<ChargeResult>;
  chargeAuthorization(input: { authorizationCode: string; email: string; amountPesewas: number; reference: string; metadata: Record<string, unknown> }): Promise<ChargeResult>;
  verifySignature(rawBody: Buffer, signature: string | undefined): boolean;
}

function hmacMatches(secret: string, rawBody: Buffer, signature: string | undefined) {
  if (!signature) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------------------------------------------------------------- paystack */

type PaystackTransaction = {
  status: string;
  reference: string;
  amount: number;
  gateway_response?: string;
  paid_at?: string;
  customer?: { customer_code?: string };
  authorization?: { authorization_code?: string; reusable?: boolean; channel?: string; last4?: string; bank?: string; brand?: string };
};

function toResult(t: PaystackTransaction): ChargeResult {
  const a = t.authorization;
  return {
    status: t.status === 'success' ? 'success' : t.status === 'failed' || t.status === 'abandoned' || t.status === 'reversed' ? 'failed' : 'pending',
    reference: t.reference,
    amountPesewas: t.amount,
    message: t.gateway_response,
    paidAt: t.paid_at ? new Date(t.paid_at) : undefined,
    customerCode: t.customer?.customer_code,
    authorization: a?.authorization_code
      ? { code: a.authorization_code, reusable: Boolean(a.reusable), hint: [a.channel === 'mobile_money' ? 'Mobile money' : a.brand, a.bank, a.last4 ? `ending ${a.last4}` : null].filter(Boolean).join(' ') }
      : undefined
  };
}

class PaystackGateway implements PaymentGateway {
  readonly name = 'paystack' as const;
  constructor(private readonly secret: string, private readonly baseUrl: string) {}

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${this.secret}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000)
      });
    } catch {
      throw new AppError('The payment provider could not be reached; try again shortly', 502, 'GATEWAY_UNAVAILABLE');
    }
    const json = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
    if (!response.ok || !json?.status || json.data === undefined) {
      throw new AppError(json?.message || 'The payment provider refused the request', 502, 'GATEWAY_ERROR');
    }
    return json.data;
  }

  async initialize(input: Parameters<PaymentGateway['initialize']>[0]) {
    const data = await this.call<{ authorization_url: string }>('POST', '/transaction/initialize', {
      email: input.email,
      amount: input.amountPesewas,
      currency: 'GHS',
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
      channels: ['card', 'mobile_money', 'bank_transfer']
    });
    return { authorizationUrl: data.authorization_url };
  }

  async verify(reference: string) {
    return toResult(await this.call<PaystackTransaction>('GET', `/transaction/verify/${encodeURIComponent(reference)}`));
  }

  async chargeAuthorization(input: Parameters<PaymentGateway['chargeAuthorization']>[0]) {
    return toResult(await this.call<PaystackTransaction>('POST', '/transaction/charge_authorization', {
      authorization_code: input.authorizationCode,
      email: input.email,
      amount: input.amountPesewas,
      currency: 'GHS',
      reference: input.reference,
      metadata: input.metadata
    }));
  }

  verifySignature(rawBody: Buffer, signature: string | undefined) {
    return hmacMatches(this.secret, rawBody, signature);
  }
}

/* -------------------------------------------------------------------- fake */

export const FAKE_WEBHOOK_SECRET = 'fake-gateway-webhook-secret';

type FakeTransaction = { reference: string; amountPesewas: number; email: string; status: ChargeResult['status']; paidAt?: Date; reusable: boolean };

/** In-memory stand-in for Paystack. Tests and the local checkout page drive it. */
export class FakeGateway implements PaymentGateway {
  readonly name = 'fake' as const;
  readonly transactions = new Map<string, FakeTransaction>();
  /** Renewal charges fail while this is set (to exercise past-due and grace). */
  failCharges = false;

  async initialize(input: Parameters<PaymentGateway['initialize']>[0]) {
    this.transactions.set(input.reference, { reference: input.reference, amountPesewas: input.amountPesewas, email: input.email, status: 'pending', reusable: true });
    const base = `${env.API_PREFIX}/billing/fake-checkout/${encodeURIComponent(input.reference)}`;
    return { authorizationUrl: `http://localhost:${env.PORT}${base}?return=${encodeURIComponent(input.callbackUrl)}` };
  }

  /** The payer completes (or abandons) checkout on the fake page. */
  complete(reference: string, outcome: 'success' | 'failed') {
    const t = this.transactions.get(reference);
    if (!t) throw new AppError('Unknown fake transaction', 404, 'GATEWAY_REFERENCE_UNKNOWN');
    t.status = outcome;
    if (outcome === 'success') t.paidAt = new Date();
    return t;
  }

  private result(t: FakeTransaction): ChargeResult {
    return {
      status: t.status,
      reference: t.reference,
      amountPesewas: t.amountPesewas,
      paidAt: t.paidAt,
      message: t.status === 'failed' ? 'Declined (test gateway)' : undefined,
      customerCode: `CUS_fake_${t.email}`,
      authorization: t.status === 'success' ? { code: `AUTH_fake_${t.email}`, reusable: t.reusable, hint: 'Test card ending 4081' } : undefined
    };
  }

  async verify(reference: string) {
    const t = this.transactions.get(reference);
    if (!t) throw new AppError('The payment provider does not know this reference', 404, 'GATEWAY_REFERENCE_UNKNOWN');
    return this.result(t);
  }

  async chargeAuthorization(input: Parameters<PaymentGateway['chargeAuthorization']>[0]) {
    const t: FakeTransaction = { reference: input.reference, amountPesewas: input.amountPesewas, email: input.email, status: this.failCharges ? 'failed' : 'success', paidAt: this.failCharges ? undefined : new Date(), reusable: true };
    this.transactions.set(input.reference, t);
    return this.result(t);
  }

  verifySignature(rawBody: Buffer, signature: string | undefined) {
    return hmacMatches(FAKE_WEBHOOK_SECRET, rawBody, signature);
  }

  /** Signs a body the way Paystack would, for tests of the webhook endpoint. */
  static sign(rawBody: string) {
    return createHmac('sha512', FAKE_WEBHOOK_SECRET).update(rawBody).digest('hex');
  }
}

let instance: PaymentGateway | null = null;

/** The configured gateway; throws a clear 503 when payments are switched off. */
export function gateway(): PaymentGateway {
  if (instance) return instance;
  if (paymentGateway === 'paystack') instance = new PaystackGateway(env.PAYSTACK_SECRET_KEY as string, env.PAYSTACK_BASE_URL);
  else if (paymentGateway === 'fake') instance = new FakeGateway();
  else throw new AppError('Online payment is not set up on this server yet. Contact support.', 503, 'PAYMENTS_NOT_CONFIGURED');
  return instance;
}

export const paymentsEnabled = () => paymentGateway !== 'disabled';

/** A unique reference for a new gateway transaction. */
export const newReference = (invoiceNumber: string) => `${invoiceNumber}-${randomUUID().slice(0, 8)}`;
