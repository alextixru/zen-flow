import { addTags } from './add-tags';
import { completeTask } from './complete-task';
import { createCompany } from './create-company';
import { createContact } from './create-contact';
import { createLead } from './create-lead';
import { createNote } from './create-note';
import { createTask } from './create-task';
import { removeAllTags } from './remove-all-tags';
import { removeTags } from './remove-tags';
import { updateCompany } from './update-company';
import { updateContact } from './update-contact';
import { updateLead } from './update-lead';
import { updateTask } from './update-task';

export const amocrmActions = [
  createLead,
  updateLead,
  createContact,
  updateContact,
  createCompany,
  updateCompany,
  createTask,
  updateTask,
  completeTask,
  createNote,
  addTags,
  removeTags,
  removeAllTags,
];
