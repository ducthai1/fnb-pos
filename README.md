# fnb-pos

Multi-tenant point-of-sale and management system for food & beverage shops (cafe, milk tea, restaurant, bar, bakery) in Vietnam. Offline-first counter app on Windows, Android, iPad and phones; cloud backoffice.

Status: phases 01–05 work end to end in tests (counter and table sales, offline sync, VietQR auto-confirm, e-invoice with a fake provider, shifts, day close); not yet used in a shop. Documentation (Vietnamese) starts at [`docs/docs-index-and-reading-order.md`](docs/docs-index-and-reading-order.md).

```
pnpm install
pnpm verify
```

## Try it on this machine

```
pnpm dev:stack            # Postgres + API + POS + backoffice, seeded with a sample cafe
pnpm dev:stack --reset    # start over from an empty database
```

It prints the URLs, the owner's login, the staff PINs and a fresh pairing code for the POS (valid 10 minutes). Data stays in `tmp/dev-stack/` between runs; Ctrl+C stops everything.

To see a QR payment confirm itself, start a QR payment on the POS and send the bank's notice:

```
pnpm dev:bank-notice <content code shown under the QR> <amount>
```
