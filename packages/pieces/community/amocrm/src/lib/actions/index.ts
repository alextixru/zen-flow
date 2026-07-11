import { createCompany } from './create-company';
import { createContact } from './create-contact';
import { createLead } from './create-lead';
import { updateCompany } from './update-company';
import { updateContact } from './update-contact';
import { updateLead } from './update-lead';

export const amocrmActions = [
  createLead,
  updateLead,
  createContact,
  updateContact,
  createCompany,
  updateCompany,
];
