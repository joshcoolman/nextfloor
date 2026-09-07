# Sponsored generation

The optional public allowance funds at most four floor attempts per Los Angeles
calendar day. All sponsored AI calls share a $10 calendar-month allocation:
$9.50 for floors and $0.50 for suggestions. Hosting, storage, taxes, provider
credit purchases and visitors' own keys are outside this AI usage allocation.

## Enable once

Set `SPONSORED_ANTHROPIC_KEY` and `SPONSORED_FAL_KEY` to dedicated provider keys,
then set `SPONSORED_GENERATION=true`. Use a dedicated Anthropic workspace with a
provider-side spending limit and a separately funded fal account as additional
protection. The fal credential needs read access to the pricing API. Do not
reuse the browser's personal keys. Legacy `ALLOW_SERVER_KEYS` is ignored.

No credentials are included in this branch, and public funding defaults off.
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

Suggestion batches reserve $0.02: at most 8,000 Haiku input and 2,000 output
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
