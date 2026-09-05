# DemandGraph API Python SDK

Fuse search, developer, product, employment and commerce signals into demand momentum, acceleration, commercial-intent and durability scores.

This package is the standard-library-only Python client from the audited public
integration repository. It supports Python 3.10 or newer. Import and
construction perform no network request.

## Install

```sh
python -m pip install demandgraph
```

## Authenticated client

```python
import os
from demandgraph import DemandGraph

client = DemandGraph(os.environ["DEMANDGRAPH_API_KEY"])
```

Never place an API key in source control, logs, or examples. Requesting a
sandbox key is an email-verification and claim flow; it does not return a key
in the initial response.

- [Product, docs, demo, pricing, privacy, and terms](https://demandgraph-api.com/?utm_source=pypi&utm_medium=project&utm_campaign=demandgraph&utm_content=readme)
- [Source and changelog](https://github.com/API-Disk-Integrations/demandgraph)
- [Issues](https://github.com/API-Disk-Integrations/demandgraph/issues)

Security reports must not be filed in a public issue. Use the repository's
private security-reporting path after the owner confirms it is enabled.

MIT licensed. The API service remains governed by the product site's terms.
