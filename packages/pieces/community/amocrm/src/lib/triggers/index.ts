import { contactAdded } from './contact-added';
import { contactDeleted } from './contact-deleted';
import { contactResponsibleChanged } from './contact-responsible-changed';
import { contactUpdated } from './contact-updated';
import { leadAdded } from './lead-added';
import { leadDeleted } from './lead-deleted';
import { leadResponsibleChanged } from './lead-responsible-changed';
import { leadRestored } from './lead-restored';
import { leadStatusChanged } from './lead-status-changed';
import { leadUpdated } from './lead-updated';

export const amocrmTriggers = [
  leadAdded,
  leadUpdated,
  leadStatusChanged,
  leadResponsibleChanged,
  leadDeleted,
  leadRestored,
  contactAdded,
  contactUpdated,
  contactResponsibleChanged,
  contactDeleted,
];
