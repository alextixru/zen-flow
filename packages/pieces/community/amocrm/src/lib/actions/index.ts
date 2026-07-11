import { addTags } from './add-tags';
import { changeResponsible } from './change-responsible';
import { completeTask } from './complete-task';
import { copyLead } from './copy-lead';
import { createCompany } from './create-company';
import { createContact } from './create-contact';
import { createLead } from './create-lead';
import { createNote } from './create-note';
import { createTask } from './create-task';
import { findCatalogElements } from './find-catalog-elements';
import { findEntity } from './find-entity';
import { findEvents } from './find-events';
import { linkCatalogElement } from './link-catalog-element';
import { linkEntities } from './link-entities';
import { removeAllTags } from './remove-all-tags';
import { removeTags } from './remove-tags';
import { runSalesbot } from './run-salesbot';
import { unlinkCatalogElement } from './unlink-catalog-element';
import { updateCompany } from './update-company';
import { updateContact } from './update-contact';
import { updateLead } from './update-lead';
import { unlinkEntities } from './unlink-entities';
import { updateTask } from './update-task';
import { waitForCustomerReply } from './wait-for-customer-reply';
import { waitForTaskCompleted } from './wait-for-task-completed';

export const amocrmActions = [
  createLead,
  updateLead,
  copyLead,
  createContact,
  updateContact,
  createCompany,
  updateCompany,
  createTask,
  updateTask,
  completeTask,
  waitForTaskCompleted,
  waitForCustomerReply,
  createNote,
  addTags,
  removeTags,
  removeAllTags,
  linkEntities,
  unlinkEntities,
  findEntity,
  findEvents,
  changeResponsible,
  runSalesbot,
  findCatalogElements,
  linkCatalogElement,
  unlinkCatalogElement,
];
