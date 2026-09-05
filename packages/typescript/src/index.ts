/**
 * DemandGraph API client.
 *
 * Zero dependencies — uses the platform `fetch`, so it runs in Node 18+, Deno,
 * Bun and Cloudflare Workers without a bundler argument.
 *
 * NOT the browser: these endpoints need an API key and deliberately do not
 * support CORS. A key in front-end JavaScript is a published key.
 *
 * ```ts
 * const client = new DemandGraph()                 // reads DEMANDGRAPH_API_KEY
 * const client = new DemandGraph({ apiKey: 'sp_live_…' })
 * ```
 *
 * Start free-key verification, then claim the token delivered by email:
 * ```
 * curl -X POST https://demandgraph-api.com/v1/keys \
 *   -H 'content-type: application/json' -d '{"email":"you@example.com","source":{"source":"sdk","medium":"typescript"}}'
 * ```
 */

export const DEFAULT_BASE_URL = 'https://demandgraph-api.com'

/** The six signal sources the API accepts. Anything else is rejected by name. */
export type SignalSource = 'search' | 'developer' | 'product' | 'employment' | 'social' | 'commerce'

/**
 * Server-side defaults, mirrored here so a caller can reason about a score
 * offline. Authoritative copy: `GET /v1/weights`.
 */
export const DEFAULT_WEIGHTS: Record<SignalSource, number> = {
  commerce: 1.0, employment: 0.9, developer: 0.7, product: 0.6, search: 0.5, social: 0.3,
}

export interface SignalPoint {
  source: SignalSource
  /** ISO-8601. Points are sorted server-side, so input order does not matter. */
  at: string
  /** Unitless — momentum is a relative rate, so raw counts are fine. */
  value: number
  /** Overrides the default weight for this one observation, 0–1. */
  weight?: number
}

export interface TopicInput {
  topic: string
  /** At least two: a single point has no rate of change. */
  points: SignalPoint[]
}

export type Trend = 'accelerating' | 'rising' | 'flat' | 'declining' | 'collapsing'

export interface SourceBreakdown {
  source: SignalSource
  points: number
  changePct: number
  weight: number
}

export interface TopicScore {
  topic: string
  /** Weighted rate of change, −100…100. A large but flat market scores 0. */
  momentum: number
  /** Change in the rate itself. Separates "big" from "taking off". */
  acceleration: number
  /** Share of signal from buy-intent sources rather than read-intent, 0…100. */
  commercialIntent: number
  /** Consistency of direction, 0…100. A single viral day scores low. */
  durability: number
  trend: Trend
  sourceCount: number
  /** How much the inputs support the score. Discard thin scores, don't act on them. */
  confidence: number
  breakdown: SourceBreakdown[]
  windowStart: string
  windowEnd: string
}

export interface ScoreResponse {
  count: number
  weightsApplied: Record<SignalSource, number>
  scores: TopicScore[]
  requestId: string
}

export type ApiErrorCode =
  | 'invalid_api_key' | 'missing_api_key' | 'quota_exceeded' | 'rate_limited'
  | 'invalid_request' | 'not_found' | 'method_not_allowed' | 'payload_too_large'
  | 'conflict' | 'internal_error'

/**
 * Thrown for any non-2xx response. Branch on `code` — it is a stable enum,
 * unlike `message`. Quote `requestId` when reporting a problem.
 */
export class ApiError extends Error {
  // Declared as fields rather than constructor parameter properties: those are
  // unsupported by strip-only TypeScript runtimes (Node --experimental-strip-types),
  // and an SDK should run without a build step.
  readonly status: number
  readonly code: ApiErrorCode | 'unknown'
  readonly requestId?: string
  readonly details?: unknown

  constructor(status: number, code: ApiErrorCode | 'unknown', message: string, requestId?: string, details?: unknown) {
    super(`[${status} ${code}] ${message}`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.details = details
  }
}

export interface ClientOptions {
  apiKey?: string
  baseUrl?: string
  /** Milliseconds. Default 30000. */
  timeoutMs?: number
  fetch?: typeof fetch
}

/** Optional acquisition metadata. Invalid values are ignored by the service. */
export interface KeySource {
  source?: string
  medium?: string
  campaign?: string
  content?: string
}

export class DemandGraph {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: ClientOptions = {}) {
    const key = options.apiKey ?? (globalThis as any).process?.env?.DEMANDGRAPH_API_KEY
    if (!key) {
      throw new Error(
        'No API key. Pass { apiKey } or set DEMANDGRAPH_API_KEY. ' +
          'Request a free key verification email: POST ' + (options.baseUrl ?? DEFAULT_BASE_URL) + '/v1/keys',
      )
    }
    this.apiKey = key
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.fetchImpl = options.fetch ?? globalThis.fetch
  }

  private async request(method: string, path: string, body?: unknown, auth = true): Promise<any> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await this.fetchImpl(this.baseUrl + path, {
        method,
        signal: controller.signal,
        headers: {
          ...(auth ? { authorization: `Bearer ${this.apiKey}` } : {}),
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
      const text = await res.text()
      const json = text ? JSON.parse(text) : {}
      if (!res.ok) {
        const e = json?.error ?? {}
        throw new ApiError(res.status, e.code ?? 'unknown', e.message ?? text.slice(0, 200), e.requestId, e.details)
      }
      return json
    } finally {
      clearTimeout(timer)
    }
  }

  /** Liveness and deployed version. Does not require a key. */
  async health(): Promise<{ ok: boolean; product: string; version: string }> {
    return this.request('GET', '/health', undefined, false)
  }

  /**
   * Score and rank topics by demand momentum.
   *
   * Billed one unit per topic, so a 50-topic call costs 50. Point count inside
   * a topic is free, so denser history costs nothing.
   */
  async score(topics: TopicInput[], weights?: Partial<Record<SignalSource, number>>): Promise<ScoreResponse> {
    return this.request('POST', '/v1/scores', weights ? { topics, weights } : { topics })
  }

  /**
   * The real engine with no key: at most 3 topics and 60 observations.
   * Nothing is stored and nothing is metered.
   */
  async demoScore(topics: TopicInput[]): Promise<ScoreResponse> {
    return this.request('POST', '/v1/demo/score', { topics }, false)
  }

  /** The default source weights and the reasoning behind them. */
  async weights(): Promise<{ weights: Record<SignalSource, number>; rationale: string }> {
    return this.request('GET', '/v1/weights', undefined, false)
  }

  /** Request a free sandbox key; this emails a claim token. Claiming returns the key once. */
  static async createKey(email: string, opts: { baseUrl?: string; name?: string; source?: KeySource } = {}): Promise<any> {
    const res = await fetch((opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '') + '/v1/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        ...(opts.name ? { name: opts.name } : {}),
        source: opts.source ?? { source: 'sdk', medium: 'typescript' },
      }),
    })
    const json = await res.json()
    if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'unknown', json?.error?.message ?? 'failed', json?.error?.requestId)
    return json
  }
}

export default DemandGraph

// ---8<--- BEGIN GENERATED BY tools/gen-sdk.mjs — DO NOT EDIT BELOW ---8<---
// Everything between these markers is written from openapi.json. Change the
// service, regenerate the contract, then re-run `npm run gen:sdk`.

/** The contract this SDK was generated from. */
export const API_TITLE = "DemandGraph API"
export const API_VERSION = "1.0.0"
/** The origin the published contract names. `DEFAULT_BASE_URL` resolves to this unless overridden. */
export const API_BASE_URL = "https://demandgraph-api.com"

/**
 * Every `error.code` the contract publishes.
 *
 * The runtime companion to the `ApiErrorCode` union: a union is erased at
 * compile time, so a caller wanting to test an unknown string against the
 * documented set had nothing to test it with.
 */
export const ERROR_CODES = ["invalid_api_key", "missing_api_key", "quota_exceeded", "rate_limited", "invalid_request", "not_found", "method_not_allowed", "payload_too_large", "conflict", "internal_error"] as const

/** One published operation, exactly as the contract describes it. */
export interface OperationDescriptor {
  readonly operationId: string
  readonly method: string
  readonly path: string
  readonly summary: string
  /** True when the operation requires an API key. False does NOT mean public — see `authKind`. */
  readonly auth: boolean
  /**
   * The credential the operation actually takes.
   *
   * `api_key` — the bearer token this client sends.
   * `session` — the dashboard session cookie, plus `x-csrf-token` on writes.
   *             An API key is REFUSED: these endpoints change what you are
   *             billed and read your payment history, and a key that lives
   *             in CI must not reach them. Call them from the signed-in
   *             dashboard, not from this SDK.
   * `signature` — machine-to-machine; not callable by API consumers.
   * `public` — no credential at all.
   */
  readonly authKind: 'api_key' | 'session' | 'signature' | 'public'
  readonly pathParams: readonly string[]
  readonly queryParams: readonly string[]
  readonly requiredBodyFields: readonly string[]
  readonly successStatus: number | null
  /** Property names of the documented 2xx body. A field absent here is a field the service does not promise. */
  readonly responseFields: readonly string[]
}

/**
 * The published surface, generated. Ships with the client so an integration
 * can assert against the contract instead of against a changelog.
 */
export const OPERATIONS: readonly OperationDescriptor[] = [
  {
    operationId: "get/",
    method: "GET",
    path: "/",
    summary: "Service index — endpoints, auth and error format",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "postApiBillingWebhook",
    method: "POST",
    path: "/api/billing/webhook",
    summary: "Square billing events, forwarded by the shared hub",
    auth: false,
    authKind: "signature",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "getHealth",
    method: "GET",
    path: "/health",
    summary: "Liveness and deployed version",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "postV1Checkout",
    method: "POST",
    path: "/v1/checkout",
    summary: "Start a hosted Square checkout for a paid tier",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["tier"],
    successStatus: 200,
    responseFields: ["checkoutUrl", "tier", "sku", "requestId"],
  },
  {
    operationId: "postV1DemoScore",
    method: "POST",
    path: "/v1/demo/score",
    summary: "Public demo — scores one topic without a key",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["topics"],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "getV1Invoices",
    method: "GET",
    path: "/v1/invoices",
    summary: "Every invoice issued against this account, newest first (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "count", "note", "invoices", "requestId"],
  },
  {
    operationId: "getV1Keys",
    method: "GET",
    path: "/v1/keys",
    summary: "List your API keys for this API",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "accountId", "keys", "requestId"],
  },
  {
    operationId: "postV1Keys",
    method: "POST",
    path: "/v1/keys",
    summary: "Request a free sandbox API key (sends a verification email)",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["email"],
    successStatus: 202,
    responseFields: ["status", "email", "expiresAt", "next", "message", "requestId"],
  },
  {
    operationId: "postV1KeysIdRevoke",
    method: "POST",
    path: "/v1/keys/{id}/revoke",
    summary: "Revoke one of your API keys",
    auth: true,
    authKind: "api_key",
    pathParams: ["id"],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["id", "status", "message", "requestId"],
  },
  {
    operationId: "postV1KeysIdRotate",
    method: "POST",
    path: "/v1/keys/{id}/rotate",
    summary: "Replace one of your API keys with a new secret",
    auth: true,
    authKind: "api_key",
    pathParams: ["id"],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 201,
    responseFields: ["apiKey", "keyId", "replaced", "product", "quotaPerPeriod", "plan", "warning", "requestId"],
  },
  {
    operationId: "postV1KeysClaim",
    method: "POST",
    path: "/v1/keys/claim",
    summary: "Exchange an emailed claim token for the API key",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["token"],
    successStatus: 201,
    responseFields: ["apiKey", "keyId", "product", "quotaPerPeriod", "plan", "warning", "usage", "requestId"],
  },
  {
    operationId: "getV1Payments",
    method: "GET",
    path: "/v1/payments",
    summary: "Every payment attempted against this account and how it went (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "count", "note", "payments", "requestId"],
  },
  {
    operationId: "postV1Scores",
    method: "POST",
    path: "/v1/scores",
    summary: "Score and rank topics by demand momentum",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["topics"],
    successStatus: 200,
    responseFields: ["count", "scores"],
  },
  {
    operationId: "getV1Subscription",
    method: "GET",
    path: "/v1/subscription",
    summary: "Your current plan, billing window and available changes (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "subscribed", "status", "plan", "pendingPlan", "planChangesGoThrough", "baseFeeOwner", "cancellation", "tiers", "requestId"],
  },
  {
    operationId: "postV1SubscriptionCancel",
    method: "POST",
    path: "/v1/subscription/cancel",
    summary: "Cancel this plan and end metered access (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["canceled", "canceledAt", "entitlement", "money", "finalInvoice", "requestId"],
  },
  {
    operationId: "postV1SubscriptionPlan",
    method: "POST",
    path: "/v1/subscription/plan",
    summary: "Upgrade or downgrade to another plan (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["planId"],
    successStatus: 200,
    responseFields: ["changed", "direction", "from", "to", "entitlement", "billing", "requestId"],
  },
  {
    operationId: "getV1Usage",
    method: "GET",
    path: "/v1/usage",
    summary: "Your consumption and remaining allowance for this period",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "tier", "status", "unit", "period", "included", "used", "ceiling", "remaining", "overageSoFarMinor", "spendCapMinor", "requestId"],
  },
  {
    operationId: "getV1Weights",
    method: "GET",
    path: "/v1/weights",
    summary: "The default source weights, and why they differ",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
]
// ---8<--- END GENERATED BY tools/gen-sdk.mjs ---8<---
