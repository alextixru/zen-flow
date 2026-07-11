# pieces-amocrm

Activepieces piece for [amoCRM](https://www.amocrm.ru/) — triggers and actions over the amoCRM REST API v4.

## Authentication

Uses a **long-lived access token** (no OAuth2). In amoCRM: Settings → Integrations → create an integration → "Keys and access" tab → long-lived token.

- **Subdomain** — the part before `.amocrm.ru` in your account URL.
- **Zone** — `amocrm.ru` or `amocrm.com`.
- **Access Token** — the long-lived token.

The token is validated against `GET /api/v4/account` when the connection is saved.

## Triggers

### Webhook triggers

Registered via `POST /webhooks` on enable, removed on disable. Fire within seconds.

- Lead Added / Updated / Status Changed / Responsible User Changed / Deleted / Restored
- Contact Added / Updated / Responsible User Changed / Deleted
- Company Added / Updated / Responsible User Changed / Deleted
- Task Added / Updated or Completed / Deleted
- Note Added
- Incoming Message (requires a connected amoJo/chat channel)

### Events-feed triggers (doorbell)

Built on the amoCRM events feed (`GET /api/v4/events`): an `update_*` webhook is only a wake-up signal, the data — including the `value_before` / `value_after` diff — is pulled from the feed by a stored cursor. Fire within seconds.

- Custom Field Changed (per-field; one trigger watches exactly one field — an amoCRM feed-filter restriction)
- Budget Changed
- Lead Entered Stage (fires only on entering the selected status)
- Tag Added / Tag Removed

### Events-feed triggers (polling)

amoCRM sends no webhook for these events, so the feed is polled with the same cursor — expect up to 1 minute of delay. Load is negligible: each enabled poll trigger costs 1 request per minute against the account limit of ~7 requests per second.

- Incoming Call / Outgoing Call (requires connected telephony)
- Event Occurred (catch-all for any other feed event type: entity linked/merged, invoice paid, chat opened/closed, …)

## Actions

- Create / Update / Copy Lead
- Create / Update Contact
- Create / Update Company
- Create / Update / Complete Task
- Create Note
- Add Tags / Remove Tags / Remove All Tags
- Link Entities / Unlink Entities
- Find Entity
- Find Events (audit history: who changed what and when on an entity)
- Change Responsible User (with optional cascade)
- Run Salesbot
- Find / Link / Unlink Catalog Element
- Wait for Task Completed / Wait for Customer Reply (pause the run and re-check the events feed on a configurable interval until completion or timeout)

Custom fields are supported on create/update actions via dynamic properties fetched from the account.

## Building

Run `turbo run build --filter=@activepieces/piece-amocrm` to build the library.
