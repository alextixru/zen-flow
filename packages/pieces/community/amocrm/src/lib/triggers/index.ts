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
];
