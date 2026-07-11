# pieces-amocrm

Activepieces piece for [amoCRM](https://www.amocrm.ru/) — triggers and actions over the amoCRM REST API v4.

## Authentication

Uses a **long-lived access token** (no OAuth2). In amoCRM: Settings → Integrations → create an integration → "Keys and access" tab → long-lived token.

- **Subdomain** — the part before `.amocrm.ru` in your account URL.
- **Zone** — `amocrm.ru` or `amocrm.com`.
- **Access Token** — the long-lived token.

The token is validated against `GET /api/v4/account` when the connection is saved.

## Triggers

All triggers are webhook-based (registered via `POST /webhooks` on enable, removed on disable).

- Lead Added / Updated / Status Changed / Responsible User Changed / Deleted / Restored
- Contact Added / Updated / Responsible User Changed / Deleted
- Company Added / Updated / Responsible User Changed / Deleted
- Task Added / Updated or Completed / Deleted
- Note Added
- Incoming Message (requires a connected amoJo/chat channel)

## Actions

- Create / Update / Copy Lead
- Create / Update Contact
- Create / Update Company
- Create / Update / Complete Task
- Create Note
- Add Tags / Remove Tags / Remove All Tags
- Link Entities / Unlink Entities
- Find Entity
- Change Responsible User (with optional cascade)
- Run Salesbot
- Find / Link / Unlink Catalog Element
- Wait for Task Completed / Wait for Customer Reply (waitpoints)

Custom fields are supported on create/update actions via dynamic properties fetched from the account.

## Building

Run `turbo run build --filter=@activepieces/piece-amocrm` to build the library.
