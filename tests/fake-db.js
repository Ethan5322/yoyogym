// An in-memory stand-in for the Supabase client, for handler tests.
//
// Understands the queries the member-service handlers make: select (with one
// level of related rows, e.g. `members(full_name)` found through member_id),
// the filters eq / neq / is / not-is-null / gt / gte / lt / lte / in, order,
// limit, maybeSingle / single, head counts, insert, update, upsert, delete.
// It is deliberately small: a query it does not understand throws, so a test
// can never pass by accident.
import { randomUUID } from 'node:crypto';

export function fakeDb(seed = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
  const table = (name) => (tables[name] ||= []);

  function query(name) {
    const filters = [];
    let op = 'select';
    let payload = null;
    let columns = '*';
    let head = false;
    let order = null;
    let limit = null;
    let returning = false;
    let conflict = null;

    const api = {
      select(cols = '*', opts = {}) {
        if (op === 'select') columns = cols;
        else returning = true;
        head = Boolean(opts.head);
        return api;
      },
      insert(rows) { op = 'insert'; payload = rows; return api; },
      update(patch) { op = 'update'; payload = patch; return api; },
      upsert(row, opts = {}) { op = 'upsert'; payload = row; conflict = (opts.onConflict || 'id').split(','); return api; },
      delete() { op = 'delete'; return api; },
      eq(c, v) { filters.push((r) => r[c] === v); return api; },
      neq(c, v) { filters.push((r) => r[c] !== v); return api; },
      is(c, v) { filters.push((r) => (r[c] ?? null) === v); return api; },
      not(c, operator, v) {
        if (operator !== 'is' || v !== null) throw new Error(`fakeDb: not(${operator}) unsupported`);
        filters.push((r) => r[c] !== null && r[c] !== undefined);
        return api;
      },
      gt(c, v) { filters.push((r) => r[c] > v); return api; },
      gte(c, v) { filters.push((r) => r[c] >= v); return api; },
      lt(c, v) { filters.push((r) => r[c] < v); return api; },
      lte(c, v) { filters.push((r) => r[c] <= v); return api; },
      in(c, list) { filters.push((r) => list.includes(r[c])); return api; },
      order(c, { ascending = true } = {}) { order = { c, ascending }; return api; },
      limit(n) { limit = n; return api; },
      maybeSingle() { return run().then(({ data, error }) => ({ data: Array.isArray(data) ? data[0] ?? null : data, error })); },
      single() { return run().then(({ data, error }) => ({ data: Array.isArray(data) ? data[0] ?? null : data, error })); },
      then(resolve, reject) { return run().then(resolve, reject); },
    };

    const matches = () => table(name).filter((r) => filters.every((f) => f(r)));

    function project(r) {
      const out = { ...r };
      for (const m of String(columns).matchAll(/(\w+)\(([^)]*)\)/g)) {
        const rel = m[1];
        const key = `${rel.replace(/s$/, '')}_id`;
        out[rel] = table(rel).find((x) => x.id === r[key]) || null;
      }
      return out;
    }

    async function run() {
      if (op === 'insert') {
        const rows = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...r }));
        table(name).push(...rows);
        return { data: returning ? rows : null, error: null };
      }
      if (op === 'upsert') {
        const existing = table(name).find((r) => conflict.every((c) => r[c] === payload[c]));
        if (existing) Object.assign(existing, payload);
        else table(name).push({ id: randomUUID(), ...payload });
        return { data: null, error: null };
      }
      if (op === 'update') {
        const rows = matches();
        for (const r of rows) Object.assign(r, payload);
        return { data: returning ? rows.map((r) => ({ ...r })) : null, error: null };
      }
      if (op === 'delete') {
        const keep = table(name).filter((r) => !filters.every((f) => f(r)));
        tables[name] = keep;
        return { data: null, error: null };
      }
      let rows = matches();
      if (head) return { data: null, count: rows.length, error: null };
      if (order) rows = [...rows].sort((a, b) => (a[order.c] > b[order.c] ? 1 : a[order.c] < b[order.c] ? -1 : 0) * (order.ascending ? 1 : -1));
      if (limit !== null) rows = rows.slice(0, limit);
      return { data: rows.map(project), error: null };
    }

    return api;
  }

  return { from: query, tables, storage: null };
}
