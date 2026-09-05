"""
DemandGraph API client.

Zero dependencies beyond the standard library — no requests, no httpx — so it
drops into any environment without a dependency negotiation.

    from demandgraph import DemandGraph

    client = DemandGraph()            # reads DEMANDGRAPH_API_KEY
    client = DemandGraph("sp_live_…") # or pass it explicitly

Start free-key verification, then claim the token delivered by email:

    curl -X POST https://demandgraph-api.com/v1/keys \
      -H 'content-type: application/json' -d '{"email":"you@example.com","source":{"source":"sdk","medium":"python"}}'
"""

from __future__ import annotations

import json as _json
import os
import urllib.error
import urllib.parse
import urllib.request

__all__ = ["DemandGraph", "ApiError", "SOURCES", "DEFAULT_WEIGHTS", "API_TITLE", "API_VERSION", "API_BASE_URL", "ERROR_CODES", "OPERATIONS"]

DEFAULT_BASE_URL = "https://demandgraph-api.com"

#: The six signal sources the API accepts. Anything else is rejected by name.
SOURCES = ("search", "developer", "product", "employment", "social", "commerce")

#: Server-side defaults, mirrored here so a caller can reason about a score
#: offline. Authoritative copy: GET /v1/weights.
DEFAULT_WEIGHTS = {
    "commerce": 1.0,
    "employment": 0.9,
    "developer": 0.7,
    "product": 0.6,
    "search": 0.5,
    "social": 0.3,
}


class ApiError(Exception):
    """
    Raised for any non-2xx response.

    Branch on ``code`` — it is a stable enum, unlike the message. Always quote
    ``request_id`` when reporting a problem; it identifies the exact request in
    the service's logs.
    """

    def __init__(self, status: int, code: str, message: str, request_id: str | None = None, details=None):
        super().__init__(f"[{status} {code}] {message}")
        self.status = status
        self.code = code
        self.message = message
        self.request_id = request_id
        self.details = details


class DemandGraph:
    def __init__(self, api_key: str | None = None, *, base_url: str = DEFAULT_BASE_URL, timeout: float = 30.0):
        key = api_key or os.environ.get("DEMANDGRAPH_API_KEY")
        if not key:
            raise ValueError(
                "No API key. Pass one to DemandGraph(...) or set DEMANDGRAPH_API_KEY. "
                'Request a free key verification email: POST {}/v1/keys with {{"email": "you@example.com"}}'.format(base_url)
            )
        self.api_key = key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # -- transport ---------------------------------------------------------
    def _request(self, method: str, path: str, *, body=None, params=None, auth: bool = True) -> dict:
        url = self.base_url + path
        if params:
            url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})

        data = _json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        if auth:
            req.add_header("Authorization", f"Bearer {self.api_key}")
        req.add_header("Accept", "application/json")
        if data:
            req.add_header("Content-Type", "application/json")

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return _json.loads(res.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            raw = e.read().decode()
            try:
                err = _json.loads(raw).get("error", {})
            except Exception:
                err = {}
            raise ApiError(
                e.code,
                err.get("code", "unknown"),
                err.get("message", raw[:200]),
                err.get("requestId"),
                err.get("details"),
            ) from None

    # -- API ---------------------------------------------------------------
    def health(self) -> dict:
        """Liveness and deployed version. Does not require a key."""
        return self._request("GET", "/health", auth=False)

    def score(self, topics: list[dict], *, weights: dict[str, float] | None = None) -> dict:
        """
        Score and rank topics by demand momentum.

        ``topics`` is a list of ``{"topic": str, "points": [...]}``. Each point
        is ``{"source": str, "at": ISO-8601, "value": number}`` and each topic
        needs at least two — a single point has no rate of change.

        Billed one unit per topic, so a 50-topic call costs 50. Point count
        inside a topic is free, so denser history costs nothing.
        """
        body: dict = {"topics": topics}
        if weights:
            body["weights"] = weights
        return self._request("POST", "/v1/scores", body=body)

    def demo_score(self, topics: list[dict]) -> dict:
        """
        The real engine with no key: at most 3 topics and 60 observations.

        Nothing is stored and nothing is metered. Useful for a smoke test in CI
        without spending quota.
        """
        return self._request("POST", "/v1/demo/score", body={"topics": topics}, auth=False)

    def weights(self) -> dict:
        """The default source weights and the reasoning behind them."""
        return self._request("GET", "/v1/weights", auth=False)

    @staticmethod
    def create_key(
        email: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        name: str | None = None,
        source: dict[str, str] | None = None,
    ) -> dict:
        """Request a free sandbox key; this emails a claim token. Claiming returns the key once."""
        payload: dict = {
            "email": email,
            "source": source if source is not None else {"source": "sdk", "medium": "python"},
        }
        if name:
            payload["name"] = name
        req = urllib.request.Request(
            base_url.rstrip("/") + "/v1/keys", data=_json.dumps(payload).encode(), method="POST"
        )
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=30) as res:
            return _json.loads(res.read().decode())

# ---8<--- BEGIN GENERATED BY tools/gen-sdk.mjs — DO NOT EDIT BELOW ---8<---
# Everything between these markers is written from openapi.json. Change the
# service, regenerate the contract, then re-run `npm run gen:sdk`.

#: The contract this SDK was generated from.
API_TITLE = "DemandGraph API"
API_VERSION = "1.0.0"
#: The origin the published contract names.
API_BASE_URL = "https://demandgraph-api.com"

#: Every ``error.code`` the contract publishes. Branch on these, never on the message.
ERROR_CODES = ("invalid_api_key", "missing_api_key", "quota_exceeded", "rate_limited", "invalid_request", "not_found", "method_not_allowed", "payload_too_large", "conflict", "internal_error")

#: The published surface, generated. Ships with the client so an integration
#: can assert against the contract instead of against a changelog.
OPERATIONS = (
    {
        "operation_id": "get/",
        "method": "GET",
        "path": "/",
        "summary": "Service index — endpoints, auth and error format",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "postApiBillingWebhook",
        "method": "POST",
        "path": "/api/billing/webhook",
        "summary": "Square billing events, forwarded by the shared hub",
        "auth": False,
        "auth_kind": "signature",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "getHealth",
        "method": "GET",
        "path": "/health",
        "summary": "Liveness and deployed version",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "postV1Checkout",
        "method": "POST",
        "path": "/v1/checkout",
        "summary": "Start a hosted Square checkout for a paid tier",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("tier",),
        "success_status": 200,
        "response_fields": ("checkoutUrl", "tier", "sku", "requestId"),
    },
    {
        "operation_id": "postV1DemoScore",
        "method": "POST",
        "path": "/v1/demo/score",
        "summary": "Public demo — scores one topic without a key",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("topics",),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "getV1Invoices",
        "method": "GET",
        "path": "/v1/invoices",
        "summary": "Every invoice issued against this account, newest first (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "count", "note", "invoices", "requestId"),
    },
    {
        "operation_id": "getV1Keys",
        "method": "GET",
        "path": "/v1/keys",
        "summary": "List your API keys for this API",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "accountId", "keys", "requestId"),
    },
    {
        "operation_id": "postV1Keys",
        "method": "POST",
        "path": "/v1/keys",
        "summary": "Request a free sandbox API key (sends a verification email)",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("email",),
        "success_status": 202,
        "response_fields": ("status", "email", "expiresAt", "next", "message", "requestId"),
    },
    {
        "operation_id": "postV1KeysIdRevoke",
        "method": "POST",
        "path": "/v1/keys/{id}/revoke",
        "summary": "Revoke one of your API keys",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": ("id",),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("id", "status", "message", "requestId"),
    },
    {
        "operation_id": "postV1KeysIdRotate",
        "method": "POST",
        "path": "/v1/keys/{id}/rotate",
        "summary": "Replace one of your API keys with a new secret",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": ("id",),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 201,
        "response_fields": ("apiKey", "keyId", "replaced", "product", "quotaPerPeriod", "plan", "warning", "requestId"),
    },
    {
        "operation_id": "postV1KeysClaim",
        "method": "POST",
        "path": "/v1/keys/claim",
        "summary": "Exchange an emailed claim token for the API key",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("token",),
        "success_status": 201,
        "response_fields": ("apiKey", "keyId", "product", "quotaPerPeriod", "plan", "warning", "usage", "requestId"),
    },
    {
        "operation_id": "getV1Payments",
        "method": "GET",
        "path": "/v1/payments",
        "summary": "Every payment attempted against this account and how it went (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "count", "note", "payments", "requestId"),
    },
    {
        "operation_id": "postV1Scores",
        "method": "POST",
        "path": "/v1/scores",
        "summary": "Score and rank topics by demand momentum",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("topics",),
        "success_status": 200,
        "response_fields": ("count", "scores"),
    },
    {
        "operation_id": "getV1Subscription",
        "method": "GET",
        "path": "/v1/subscription",
        "summary": "Your current plan, billing window and available changes (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "subscribed", "status", "plan", "pendingPlan", "planChangesGoThrough", "baseFeeOwner", "cancellation", "tiers", "requestId"),
    },
    {
        "operation_id": "postV1SubscriptionCancel",
        "method": "POST",
        "path": "/v1/subscription/cancel",
        "summary": "Cancel this plan and end metered access (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("canceled", "canceledAt", "entitlement", "money", "finalInvoice", "requestId"),
    },
    {
        "operation_id": "postV1SubscriptionPlan",
        "method": "POST",
        "path": "/v1/subscription/plan",
        "summary": "Upgrade or downgrade to another plan (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("planId",),
        "success_status": 200,
        "response_fields": ("changed", "direction", "from", "to", "entitlement", "billing", "requestId"),
    },
    {
        "operation_id": "getV1Usage",
        "method": "GET",
        "path": "/v1/usage",
        "summary": "Your consumption and remaining allowance for this period",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "tier", "status", "unit", "period", "included", "used", "ceiling", "remaining", "overageSoFarMinor", "spendCapMinor", "requestId"),
    },
    {
        "operation_id": "getV1Weights",
        "method": "GET",
        "path": "/v1/weights",
        "summary": "The default source weights, and why they differ",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
)
# ---8<--- END GENERATED BY tools/gen-sdk.mjs ---8<---
