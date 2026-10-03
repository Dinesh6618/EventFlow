import * as help from '../models/helpModel.js';
import { toDto } from '../services/helpAccess.js';
import { idParam } from '../utils/params.js';

/** Platform-wide monitoring. Metadata only: no descriptions, no participants, no photos. */
export async function requests(req, res) {
  const settings = await help.escalationSettings();
  const [rows, summary] = await Promise.all([help.listFiltered(req.query), help.summary(req.query.eventId ? { eventId: req.query.eventId } : {})]);
  res.json({ summary, requests: await Promise.all(rows.map((r) => toDto(r, 'admin', { settings }))) });
}

export async function analytics(_req, res) {
  res.json(await help.analytics({}));
}

export async function listCategories(_req, res) {
  res.json({ categories: await help.listCategories({ all: true }) });
}
export async function createCategory(req, res) {
  res.status(201).json({ category: await help.createCategory(req.body) });
}
export async function updateCategory(req, res) {
  res.json({ category: await help.updateCategory(idParam(req.params.id, 'Category'), req.body) });
}

export async function listContacts(_req, res) {
  res.json({ contacts: await help.listContacts() });
}
export async function createContact(req, res) {
  res.status(201).json({ contact: await help.createContact(req.body) });
}
export async function updateContact(req, res) {
  res.json({ contact: await help.updateContact(idParam(req.params.id, 'Contact'), req.body) });
}

export async function listTeams(_req, res) {
  res.json({ teams: await help.listTeams() });
}
export async function createTeam(req, res) {
  res.status(201).json({ team: await help.createTeam(req.body) });
}
export async function updateTeam(req, res) {
  res.json({ team: await help.updateTeam(idParam(req.params.id, 'Team'), req.body) });
}
export async function addTeamMember(req, res) {
  res.status(201).json({ team: await help.addTeamMember(idParam(req.params.id, 'Team'), req.body.email) });
}
export async function removeTeamMember(req, res) {
  res.json({ team: await help.removeTeamMember(idParam(req.params.id, 'Team'), idParam(req.params.userId, 'Member')) });
}

export async function getSettings(_req, res) {
  res.json({ escalation: await help.escalationSettings() });
}
export async function saveSettings(req, res) {
  res.json({ escalation: await help.saveEscalationSettings(req.body) });
}
