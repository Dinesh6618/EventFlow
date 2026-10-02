import bcrypt from 'bcryptjs';
import { signToken } from '../middleware/auth.js';
import * as users from '../models/userModel.js';
import { conflict, unauthorized } from '../utils/httpError.js';

export async function register(req, res) {
  const { name, email, password, role } = req.body;

  if (await users.findByEmail(email)) {
    throw conflict('Email is already registered', { email: 'An account with this email already exists' });
  }

  const user = await users.createUser({ name, email, role, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ user, token: signToken(user) });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const found = await users.findByEmail(email);

  // Same message for unknown email and wrong password so accounts cannot be probed.
  if (!found || !(await bcrypt.compare(password, found.password))) {
    throw unauthorized('Invalid email or password');
  }

  const { password: _hash, ...user } = found;
  res.json({ user, token: signToken(user) });
}

export function me(req, res) {
  res.json({ user: req.user });
}

export async function updateProfile(req, res) {
  const user = await users.updateName(req.user.id, req.body.name);
  res.json({ user });
}
