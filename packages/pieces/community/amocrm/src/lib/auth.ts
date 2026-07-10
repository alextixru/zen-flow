import { HttpMethod, httpClient } from '@activepieces/pieces-common';
import { PieceAuth, Property, tryCatch } from '@activepieces/pieces-framework';

const markdownDescription = `
To generate a long-lived token:

1. In amoCRM, go to **Settings -> Integrations**.
2. Create a private integration (or open an existing one).
3. Open the **Keys and access** tab and copy the long-lived token.

Your **Subdomain** is the part before \`.amocrm.ru\` in your account URL (e.g. \`mycompany\` for \`mycompany.amocrm.ru\`).
`;

export const amocrmAuth = PieceAuth.CustomAuth({
  displayName: 'Connection',
  description: markdownDescription,
  required: true,
  props: {
    subdomain: PieceAuth.SecretText({
      displayName: 'Subdomain',
      required: true,
    }),
    zone: Property.StaticDropdown({
      displayName: 'Zone',
      required: true,
      defaultValue: 'amocrm.ru',
      options: {
        options: [
          { label: 'amocrm.ru', value: 'amocrm.ru' },
          { label: 'amocrm.com', value: 'amocrm.com' },
        ],
      },
    }),
    apiToken: PieceAuth.SecretText({
      displayName: 'Long-lived Token',
      required: true,
    }),
  },
  validate: async ({ auth }) => {
    const { error } = await tryCatch(() =>
      httpClient.sendRequest({
        method: HttpMethod.GET,
        url: `https://${auth.subdomain}.${auth.zone}/api/v4/account`,
        headers: {
          Authorization: `Bearer ${auth.apiToken}`,
        },
      }),
    );

    if (error) {
      return {
        valid: false,
        error: 'Invalid subdomain, zone or token.',
      };
    }

    return { valid: true };
  },
});
