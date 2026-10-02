/**
 * zod skips object-level refinements when any single field is invalid, so a user who also forgot
 * a title would not hear about "end before start" until the next attempt. This wraps a schema so
 * rules that compare fields run on their own and every problem is reported at once.
 *
 * `check(input)` returns an array of { path: [field], message } for the fields it can judge.
 * The result keeps the safeParse contract the validate() middleware relies on.
 */
export function withCrossFieldChecks(schema, check) {
  return {
    safeParse(input) {
      const result = schema.safeParse(input);
      const issues = [...(result.success ? [] : result.error.issues)];
      for (const issue of check(input ?? {})) {
        if (!issues.some((i) => i.path[0] === issue.path[0])) issues.push(issue);
      }
      return issues.length ? { success: false, error: { issues } } : result;
    },
  };
}
