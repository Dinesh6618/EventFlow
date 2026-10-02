import * as student from '../models/studentModel.js';

export async function dashboard(req, res) {
  res.json(await student.dashboard(req.user));
}

export async function publicStats(_req, res) {
  res.json(await student.publicStats());
}
