import { budgetChanged } from './budget-changed';
import { companyAdded } from './company-added';
import { companyDeleted } from './company-deleted';
import { companyResponsibleChanged } from './company-responsible-changed';
import { companyUpdated } from './company-updated';
import { contactAdded } from './contact-added';
import { contactDeleted } from './contact-deleted';
import { contactResponsibleChanged } from './contact-responsible-changed';
import { contactUpdated } from './contact-updated';
import { customFieldChanged } from './custom-field-changed';
import { entityTagAdded } from './entity-tag-added';
import { entityTagDeleted } from './entity-tag-deleted';
import { eventOccurred } from './event-occurred';
import { incomingCall } from './incoming-call';
import { incomingMessage } from './incoming-message';
import { leadEnteredStage } from './lead-entered-stage';
import { leadAdded } from './lead-added';
import { leadDeleted } from './lead-deleted';
import { leadResponsibleChanged } from './lead-responsible-changed';
import { leadRestored } from './lead-restored';
import { leadStatusChanged } from './lead-status-changed';
import { leadUpdated } from './lead-updated';
import { noteAdded } from './note-added';
import { outgoingCall } from './outgoing-call';
import { taskAdded } from './task-added';
import { taskDeleted } from './task-deleted';
import { taskUpdatedOrCompleted } from './task-updated-or-completed';

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
  companyAdded,
  companyUpdated,
  companyResponsibleChanged,
  companyDeleted,
  taskAdded,
  taskUpdatedOrCompleted,
  taskDeleted,
  noteAdded,
  incomingMessage,
  customFieldChanged,
  budgetChanged,
  leadEnteredStage,
  incomingCall,
  outgoingCall,
  entityTagAdded,
  entityTagDeleted,
  eventOccurred,
];
