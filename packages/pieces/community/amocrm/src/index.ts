import { createPiece, PieceCategory } from '@activepieces/pieces-framework';
import { createCustomApiCallAction } from '@activepieces/pieces-common';
import { amocrmAuth } from './lib/auth';
import { amocrmTriggers } from './lib/triggers';

// ponytail: placeholder logo, this asset does not exist on the fork's CDN yet — replace when uploaded.
export const amocrm = createPiece({
  displayName: 'amoCRM',
  description: 'CRM automation for amoCRM: leads, contacts, companies, tasks and more.',
  auth: amocrmAuth,
  logoUrl: 'https://cdn.activepieces.com/pieces/amocrm.png',
  categories: [PieceCategory.SALES_AND_CRM, PieceCategory.COMMUNICATION],
  authors: [],
  actions: [
    createCustomApiCallAction({
      auth: amocrmAuth,
      baseUrl: (auth) => {
        if (!auth) {
          return '';
        }
        const authValue = auth.props;
        return `https://${authValue.subdomain}.${authValue.zone}/api/v4`;
      },
      authMapping: async (auth) => {
        const authValue = auth.props;
        return {
          Authorization: `Bearer ${authValue.apiToken}`,
        };
      },
    }),
  ],
  triggers: amocrmTriggers,
});
