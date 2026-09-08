# Sponsored generation

## Ordinary API keys and room hints

In local development (`NODE_ENV=development`), `ANTHROPIC_API_KEY` and `FAL_KEY`
(or `FAL_API_KEY`) enable API access automatically. Browser keys override them
per provider. Production ignores environment keys for direct access: anonymous
use requires `PUBLIC_GENERATION=true`. Complete BYOK works regardless of that
flag and bypasses public allowances, price gates and reset windows. Invalid
provided credentials are never retried with another key. Partial production
BYOK does not silently consume public credit to supply the missing provider.

Room hints need only Anthropic, not fal. Hints use the visitor's Anthropic key
or the local development environment key before considering public funding. Shared
batches contain 18 ideas, warmed in the background once startup metadata and
browser keys are ready. Opening the dialog draws the next three from the page's
pool without a network request; loading never waits for hints. Batches are
cached for 24 hours and refreshed when the building changes; direct
keys have no six-hour sponsored cooldown. A short in-flight claim deduplicates
concurrent refreshes. Neither browser keys nor their values enter the cache.

## Public production setup

Set `PUBLIC_GENERATION=true`, `ANTHROPIC_API_KEY`, `FAL_KEY`, and
`PUBLIC_MONTHLY_BUDGET_USD=10` (or another nonnegative dollar amount, to cents).
Keys alone never opt a production server into anonymous spending. Invalid
budgets fail closed. Keep provider-side limits as an independent safeguard.

The monthly amount accrues in equal calendar-day portions in Los Angeles time:
by day 7 of a 30-day month, 7/30 of the budget is available. Unused portions carry
within that month, with a fresh allocation each month. Five percent is reserved
for hints, and four floor attempts/day remains an additional ceiling. The
existing ledger accounts for concurrent work, failures and uncertain charges.

Every floor still needs a conservative $0.60 reservation before it starts.
A $10 monthly budget accrues about $0.33/day, so it cannot guarantee a new floor
every day: credit may accumulate over multiple days. Known unused reservation
amounts are released. This is an AI-usage allowance, not a whole hosting/provider
invoice guarantee. No production settings are changed by this implementation.

The optional public allowance funds at most four floor attempts per Los Angeles
calendar day. All sponsored AI calls share a $10 calendar-month allocation:
$9.50 for floors and $0.50 for suggestions. Hosting, storage, taxes, provider
credit purchases and visitors' own keys are outside this AI usage allocation.

## Legacy dedicated-key setup

Set `SPONSORED_ANTHROPIC_KEY` and `SPONSORED_FAL_KEY` to dedicated provider keys,
then set `SPONSORED_GENERATION=true`. Use a dedicated Anthropic workspace with a
provider-side spending limit and a separately funded fal account as additional
protection. The fal credential needs read access to the pricing API. Do not
reuse the browser's personal keys. Legacy `ALLOW_SERVER_KEYS` is ignored.

No credentials are included in this branch, and capped public funding defaults off.
The database adds its ledger/cache tables automatically. Rollback is setting
`SPONSORED_GENERATION=false`; keep ledger rows intact.

The app automatically reads Anthropic's pricing table and fal's model pricing
endpoint. Results are cached for one minute; failures close sponsored generation.
Unknown units, changed formats, and prices above the configured ceiling are
rejected. Models are pinned for sponsorship, regardless of BYOK model overrides.
Provider-side limits remain necessary for protection against billing changes
outside the application's control; this is not a guarantee about an entire
provider invoice or unrelated usage on the same account.

## Accounting

Reservations use integer microdollars under a Postgres transaction lock. The
floor slot and request ID commit with the reservation before paid work starts.
No network calls run while the lock is held. BYOK uses the same idempotent slot
reservation without a sponsored charge. Incomplete BYOK pairs are rejected.

Each floor reserves $0.60: up to 20,000 Sonnet input tokens ($0.04), 16,000 output
tokens ($0.16), and two image calls at a conservative $0.20 each. The full
structured request is token-counted before sending. Interpreter retries are
disabled; image validation may retry once. Known interpreter usage releases
unused token allowance. An image attempt retains its $0.20 ceiling even if its
response is lost. A crash or unknown interpreter usage keeps the full reservation.

Suggestion batches reserve $0.02: at most 8,000 Haiku input and 2,400 output
tokens. Successful calls settle to reported usage. Refresh attempts are globally
limited to one per six hours, with a 24-hour freshness window; no timer generates
suggestions when nobody visits. Empty or invalid suggestions never block typing.

Unfinished reservations count in subsequent periods. Calls that finish across a
period boundary count in both periods. New sponsored work stops in the last ten
minutes before midnight, and each paid stage checks its deadline. This errs on
the side of fewer free floors. Repeated crashes can exhaust the allowance until
the provider outcomes are reconciled; the app never guesses that money was unspent.
Deleting floors or restarting the server cannot refund reservations.

## Verification

Use an isolated local database; never point tests at the shared Railway database.

```sh
docker run --detach --name nextfloor-verification \
  --publish 127.0.0.1:55439:5432 \
  --env POSTGRES_PASSWORD=nextfloor-test --env POSTGRES_DB=nextfloor_test postgres:17-alpine
TEST_DATABASE_URL=postgres://postgres:nextfloor-test@127.0.0.1:55439/nextfloor_test pnpm test
DATABASE_URL=postgres://postgres:nextfloor-test@127.0.0.1:55439/nextfloor_test DATABASE_SSL=false SPONSORED_GENERATION=false pnpm build
DATABASE_URL=postgres://postgres:nextfloor-test@127.0.0.1:55439/nextfloor_test DATABASE_SSL=false SPONSORED_GENERATION=false pnpm start --port 3147
pnpm exec playwright install chromium
pnpm test:browser
```

Backend tests reject nonlocal databases and names not ending in `_test`; they
truncate only the isolated fixture tables. Paid providers are mocked. Browser
tests intercept floor/suggestion responses and prevent generation submissions.

References: [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing),
[fal pricing API](https://fal.ai/docs/platform-apis/v1/models/pricing),
[Anthropic workspace limits](https://platform.claude.com/docs/en/manage-claude/workspaces).
