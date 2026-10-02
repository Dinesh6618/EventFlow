/** Immutable update of a nested value by dotted path: setIn(plan, 'schedule.2.title', 'Keynote'). */
export function setIn(obj, path, value) {
  const [head, ...rest] = Array.isArray(path) ? path : path.split('.');
  const key = Array.isArray(obj) ? Number(head) : head;
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  copy[key] = rest.length ? setIn(obj?.[key] ?? {}, rest, value) : value;
  return copy;
}

export function getIn(obj, path) {
  return (Array.isArray(path) ? path : path.split('.')).reduce((value, key) => (value == null ? value : value[key]), obj);
}
