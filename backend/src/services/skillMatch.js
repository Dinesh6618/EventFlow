// Rule-based skill matching. No AI involved: a skill matches another when the text matches
// (exact or one contains the other) or when both belong to the same skill family below.

/** Lower-case, trimmed, single-spaced. Used as the de-duplication key for a skill. */
export const skillKey = (skill) => String(skill).toLowerCase().replace(/\s+/g, ' ').trim();

/** Clean a user-supplied list: trimmed, non-empty, unique, at most `max` entries. */
export function cleanSkills(list, max = 15) {
  const seen = new Map();
  for (const raw of Array.isArray(list) ? list : []) {
    const skill = String(raw).replace(/\s+/g, ' ').trim().slice(0, 40);
    if (skill && !seen.has(skillKey(skill))) seen.set(skillKey(skill), skill);
  }
  return [...seen.values()].slice(0, max);
}

// Families of related skills. A person with "Figma" is a reasonable fit for a team that needs
// a "UI/UX Designer", even though the words differ.
const FAMILIES = {
  design: ['ui', 'ux', 'ui/ux', 'figma', 'design', 'designer', 'product design', 'graphic design', 'sketch', 'adobe xd', 'wireframing', 'prototyping', 'illustrator', 'photoshop', 'canva', 'branding'],
  frontend: ['frontend', 'front-end', 'front end', 'react', 'vue', 'angular', 'html', 'css', 'javascript', 'typescript', 'tailwind', 'web development', 'web dev', 'next.js', 'svelte'],
  backend: ['backend', 'back-end', 'back end', 'node', 'node.js', 'express', 'django', 'flask', 'spring', 'spring boot', 'java', 'api', 'rest', 'php', 'laravel', 'ruby', 'rails', 'golang', 'go', '.net', 'c#'],
  data: ['python', 'machine learning', 'ml', 'ai', 'deep learning', 'data science', 'data analysis', 'pandas', 'numpy', 'tensorflow', 'pytorch', 'nlp', 'computer vision', 'statistics', 'analytics', 'data scientist'],
  mobile: ['mobile', 'android', 'ios', 'flutter', 'react native', 'kotlin', 'swift', 'dart'],
  cloud: ['cloud', 'devops', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'ci/cd', 'linux', 'terraform', 'sre'],
  database: ['database', 'sql', 'mysql', 'postgres', 'postgresql', 'mongodb', 'firebase', 'redis', 'nosql'],
  hardware: ['iot', 'arduino', 'raspberry pi', 'embedded', 'electronics', 'robotics', 'hardware', 'pcb', 'sensors', 'vlsi'],
  business: ['presentation', 'public speaking', 'pitching', 'pitch', 'product management', 'product manager', 'marketing', 'business', 'writing', 'management', 'storytelling', 'research', 'strategy'],
};

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const termIn = (key, term) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}($|[^a-z0-9])`).test(key);

function familiesOf(key) {
  return Object.entries(FAMILIES)
    .filter(([, terms]) => terms.some((term) => key === term || termIn(key, term)))
    .map(([family]) => family);
}

/** How well `have` covers `need`: 'exact' (3), 'close' (2: one contains the other), 'related' (1: same family). */
export function matchStrength(need, have) {
  const a = skillKey(need);
  const b = skillKey(have);
  if (!a || !b) return null;
  if (a === b) return { strength: 'exact', points: 3 };
  if ((a.length >= 2 && termIn(b, a)) || (b.length >= 2 && termIn(a, b))) return { strength: 'close', points: 2 };
  const shared = familiesOf(a).some((family) => familiesOf(b).includes(family));
  return shared ? { strength: 'related', points: 1 } : null;
}

/**
 * Score a person's skills against what a team needs.
 * Each needed skill is credited with the best match among the person's skills.
 */
export function scoreSkills(needed, have) {
  const matches = [];
  let score = 0;
  for (const need of needed) {
    let best = null;
    for (const skill of have) {
      const m = matchStrength(need, skill);
      if (m && (!best || m.points > best.points)) best = { ...m, need, skill };
    }
    if (best) {
      matches.push({ need: best.need, skill: best.skill, strength: best.strength });
      score += best.points;
    }
  }
  return { score, matches };
}
