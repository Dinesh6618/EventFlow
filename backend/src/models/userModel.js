import { query } from '../db.js';

const PUBLIC_COLUMNS = `id, name, email, role, created_at AS "createdAt"`;

export async function findByEmail(email) {
  const rows = await query(`SELECT ${PUBLIC_COLUMNS}, password FROM users WHERE email = $1`, [email]);
  return rows[0];
}

export async function findById(id) {
  const rows = await query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0];
}

export async function createUser({ name, email, passwordHash, role }) {
  const rows = await query(
    `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING ${PUBLIC_COLUMNS}`,
    [name, email, passwordHash, role],
  );
  return rows[0];
}

export async function updateName(id, name) {
  const rows = await query(`UPDATE users SET name = $2 WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`, [id, name]);
  return rows[0];
}

export async function countByRole() {
  const rows = await query(`SELECT role, COUNT(*)::int AS count FROM users GROUP BY role`);
  const counts = { organizer: 0, participant: 0, admin: 0 };
  for (const row of rows) counts[row.role] = row.count;
  return counts;
}
