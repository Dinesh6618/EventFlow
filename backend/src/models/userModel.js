import { query, transaction } from '../db.js';
import { cleanSkills, skillKey } from '../services/skillMatch.js';

const PUBLIC_COLUMNS = `id, name, email, role, department, college, created_at AS "createdAt",
  COALESCE((SELECT array_agg(s.skill ORDER BY s.skill) FROM user_skills s WHERE s.user_id = users.id), '{}') AS skills`;

export async function findByEmail(email) {
  const rows = await query(`SELECT ${PUBLIC_COLUMNS}, password FROM users WHERE email = $1`, [email]);
  return rows[0];
}

export async function findById(id) {
  const rows = await query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0];
}

export async function createUser({ name, email, passwordHash, role, department = null, college = null }) {
  const rows = await query(
    `INSERT INTO users (name, email, password, role, department, college)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${PUBLIC_COLUMNS}`,
    [name, email, passwordHash, role, department, college],
  );
  return rows[0];
}

export async function updateProfile(id, { name, department, college, skills }) {
  await transaction(async (run) => {
    await run(`UPDATE users SET name = $2, department = $3, college = $4 WHERE id = $1`, [id, name, department, college]);
    // Skills are only replaced when the request includes them.
    if (skills) {
      await run(`DELETE FROM user_skills WHERE user_id = $1`, [id]);
      for (const skill of cleanSkills(skills)) {
        await run(`INSERT INTO user_skills (user_id, skill, skill_key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [id, skill, skillKey(skill)]);
      }
    }
  });
  return findById(id);
}

export async function countByRole() {
  const rows = await query(`SELECT role, COUNT(*)::int AS count FROM users GROUP BY role`);
  const counts = { organizer: 0, participant: 0, admin: 0 };
  for (const row of rows) counts[row.role] = row.count;
  return counts;
}
