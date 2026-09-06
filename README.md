# DemandGraph API

Score customer-supplied market signals into momentum, acceleration, commercial intent, durability, and confidence.

- [Product and pricing](https://demandgraph-api.com/?utm_source=github&utm_medium=developer&utm_campaign=demandgraph-github&utm_content=readme#pricing)
- [Developer documentation](https://demandgraph-api.com/docs?utm_source=github&utm_medium=developer&utm_campaign=demandgraph-github&utm_content=readme)
- [Create a free account](https://demandgraph-api.com/signup?utm_source=github&utm_medium=developer&utm_campaign=demandgraph-github&utm_content=readme)
- [OpenAPI contract](https://demandgraph-api.com/openapi.json)
- [Postman collection](./postman_collection.json)

## Quickstart: score one topic from three signal families without an account

The public demo runs the real production engine, stores nothing, meters nothing,
and requires no API key. The data below is synthetic.

```bash
cat > request.json <<'JSON'
{
  "topics": [
    {
      "topic": "mcp servers",
      "points": [
        {
          "source": "search",
          "at": "2026-06-01T00:00:00Z",
          "value": 1200
        },
        {
          "source": "search",
          "at": "2026-07-01T00:00:00Z",
          "value": 2100
        },
        {
          "source": "search",
          "at": "2026-08-01T00:00:00Z",
          "value": 4800
        },
        {
          "source": "developer",
          "at": "2026-06-01T00:00:00Z",
          "value": 340
        },
        {
          "source": "developer",
          "at": "2026-07-01T00:00:00Z",
          "value": 910
        },
        {
          "source": "developer",
          "at": "2026-08-01T00:00:00Z",
          "value": 2400
        },
        {
          "source": "employment",
          "at": "2026-06-01T00:00:00Z",
          "value": 12
        },
        {
          "source": "employment",
          "at": "2026-08-01T00:00:00Z",
          "value": 47
        }
      ]
    }
  ]
}
JSON

curl -sS -X POST https://demandgraph-api.com/v1/demo/score \
  -H 'content-type: application/json' \
  --data-binary @request.json
```

Selected fields from the deterministic 200 response (evaluated at
`2026-09-06T20:30:00.000Z` for this example):

```json
{
  "count": 1,
  "scores": [
    {
      "topic": "mcp servers",
      "momentum": 100,
      "acceleration": 11.5,
      "commercialIntent": 42.9,
      "durability": 100,
      "trend": "accelerating",
      "sourceCount": 3,
      "breakdown": [
        {
          "source": "developer",
          "points": 3,
          "changePct": 605.9,
          "weight": 0.7
        },
        {
          "source": "employment",
          "points": 2,
          "changePct": 291.7,
          "weight": 0.9
        },
        {
          "source": "search",
          "points": 3,
          "changePct": 300,
          "weight": 0.5
        }
      ],
      "confidence": 84,
      "windowStart": "2026-06-01T00:00:00.000Z",
      "windowEnd": "2026-08-01T00:00:00.000Z"
    }
  ],
  "requestId": "req_example"
}
```

The first useful result is the combination of `trend`, `momentum`, `commercialIntent`, and `confidence`: it tells a product team that this supplied series is accelerating, while making the evidence depth visible instead of pretending DemandGraph collected the data.

### Input contract

Supply at least two dated observations per topic. Values are unitless within a source; DemandGraph compares relative change and does not acquire or resell signal data.

## Create and use a free API key

```bash
curl -sS -X POST https://demandgraph-api.com/v1/keys \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","name":"github-quickstart","source":{"source":"github","medium":"developer","campaign":"demandgraph-github","content":"readme"}}'

curl -sS -X POST https://demandgraph-api.com/v1/keys/claim \
  -H 'content-type: application/json' \
  -d '{"token":"PASTE_ONE_TIME_TOKEN_FROM_EMAIL"}'

export API_KEY='PASTE_API_KEY_FROM_CLAIM_RESPONSE'

curl -sS -X POST https://demandgraph-api.com/v1/scores \
  -H "Authorization: Bearer $API_KEY" \
  -H 'content-type: application/json' \
  --data-binary @request.json
```

The key-request response is `202` and sends a one-time claim token by email. The
claim response is the only place the raw API key is returned; store it securely
and never commit it. The authenticated endpoint accepts the same request shape
as the demo, with the documented production batch limits and metering.

## What to do next

Add a second candidate topic to the authenticated `topics` array and compare rank, confidence, and source breakdown before changing a roadmap.

The stable code catalogue for this product is `GET /v1/weights`. Branch on
machine-readable codes, not human-readable detail text.

## Authentication and troubleshooting

- `401`: the authenticated endpoint did not receive a valid active key. Set
  `API_KEY` to the value returned once by `/v1/keys/claim`; do not send a claim
  token as a bearer credential.
- `400 invalid_request`: read `error.details.path` when present and correct the
  named field. This service does **not** emit `422`; a client-side schema tool may
  show `422` before a request reaches the API.
- `429 quota_exceeded` or `429 rate_limited`: inspect `error.code`, honor
  `Retry-After` when present, and retry with bounded exponential backoff. A quota
  exhaustion requires a later quota window or plan change, not a tight retry loop.

Every API error has `{"error":{"code","message","requestId"}}`. Share the
request ID with support, never the API key, claim token, or customer payload.

## SDKs and authoritative contract

- Python: `./sdk/python/demandgraph.py`
- TypeScript: `./sdk/typescript/index.ts`

The live OpenAPI document is authoritative for operations and schemas. This
overlay is a customer-runnable example aligned to that contract; it does not
replace the OpenAPI document or claim that an unresolved external contract is
authoritative.

## Distribution attribution

The key request above uses `demandgraph-github` as the stable GitHub campaign. The
Postman collection uses `postman / collection / demandgraph-postman /
public-collection`. These are attribution inputs, not claims of customers or
revenue.

## License

[MIT](./LICENSE)
