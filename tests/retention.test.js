// Document retention (D-054).
//
// Two of the four documents we ask for are identity documents, which makes
// keeping them longer than necessary a POPIA problem rather than an untidiness
// problem. `application_documents.retention_until` has existed in the schema
// since it was written; nothing set it and nothing acted on it.
//
// This is the one job on the platform that deletes. It is therefore the one
// that gets the most tests about NOT deleting.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { retentionDateFor, APPEAL_WINDOW_DAYS, purgeExpiredDocuments } from '../platform/retention.js';

const T0 = new Date('2026-06-01T00:00:00Z');
const days = (n, from = T0) => new Date(from.getTime() + n * 86400_000);

// ---------------------------------------------------------------------------
// Setting the date
// ---------------------------------------------------------------------------

test('a rejected application keeps its documents for the appeal window, then no longer', () => {
  const until = retentionDateFor({ status: 'rejected', decided_at: T0.toISOString() }, T0);
  assert.equal(until, days(APPEAL_WINDOW_DAYS).toISOString().slice(0, 10));
});

test('an approved gym keeps its documents with NO expiry date while it trades', () => {
  // A date would mean deleting the registration of a gym that is still
  // operating, which is the paperwork we would need if anything went wrong.
  assert.equal(retentionDateFor({ status: 'approved', decided_at: T0.toISOString() }, T0), null);
});

test('an undecided application is never given an expiry date', () => {
  assert.equal(retentionDateFor({ status: 'submitted' }, T0), null);
  assert.equal(retentionDateFor({ status: 'more_info_requested' }, T0), null);
});

// ---------------------------------------------------------------------------
// The purge
// ---------------------------------------------------------------------------

function deps(over = {}) {
  const calls = { removedFiles: [], removedRows: [], audits: [] };
  return {
    calls,
    listExpiredDocuments: async () => [
      { id: 'd1', storage_ref: 'applications/app-1/id_document/a.pdf', application_id: 'app-1' },
      { id: 'd2', storage_ref: 'applications/app-1/proof_of_address/b.pdf', application_id: 'app-1' },
    ],
    removeStorageObject: async (ref) => { calls.removedFiles.push(ref); },
    deleteDocumentRow: async (id) => { calls.removedRows.push(id); },
    audit: async (a) => { calls.audits.push(a); },
    ...over,
  };
}

test('a dry run deletes nothing and still says what it would delete', async () => {
  const d = deps();
  const report = await purgeExpiredDocuments(d, { now: T0, dryRun: true });

  assert.equal(d.calls.removedFiles.length, 0);
  assert.equal(d.calls.removedRows.length, 0);
  assert.equal(report.wouldDelete, 2);
});

test('a live run removes the FILE before the row', async () => {
  // Order matters, and this is the safe order. Row first, and a crash in
  // between leaves a file nobody knows about and nobody can find — the exact
  // orphan the reconciliation report exists to catch. File first, and a crash
  // leaves a row pointing at nothing, which is visible and fixable.
  const order = [];
  const d = deps({
    removeStorageObject: async (ref) => order.push(`file:${ref}`),
    deleteDocumentRow: async (id) => order.push(`row:${id}`),
  });

  await purgeExpiredDocuments(d, { now: T0, dryRun: false });

  assert.deepEqual(order, [
    'file:applications/app-1/id_document/a.pdf',
    'row:d1',
    'file:applications/app-1/proof_of_address/b.pdf',
    'row:d2',
  ]);
});

test('a file that cannot be deleted does NOT have its row deleted', async () => {
  // Deleting the row anyway would lose the only pointer to a file that is
  // still sitting in the bucket holding somebody's ID.
  const d = deps({ removeStorageObject: async () => { throw new Error('storage down'); } });
  const report = await purgeExpiredDocuments(d, { now: T0, dryRun: false });

  assert.equal(d.calls.removedRows.length, 0);
  assert.equal(report.errors.length, 2);
  assert.equal(report.deleted, 0);
});

test('one bad document does not stop the rest being purged', async () => {
  const d = deps({
    removeStorageObject: async (ref) => {
      if (ref.includes('id_document')) throw new Error('nope');
      d.calls.removedFiles.push(ref);
    },
  });

  const report = await purgeExpiredDocuments(d, { now: T0, dryRun: false });

  assert.equal(report.deleted, 1);
  assert.equal(report.errors.length, 1);
});

test('every deletion is audited, because the evidence of it is what is being deleted', async () => {
  const d = deps();
  await purgeExpiredDocuments(d, { now: T0, dryRun: false });

  const deletions = d.calls.audits.filter((a) => a.action === 'platform.document.purged');
  assert.equal(deletions.length, 2);
  // The audit keeps the path and the application, never the file.
  assert.equal(deletions[0].detail.storage_ref, 'applications/app-1/id_document/a.pdf');
});

test('nothing expired means nothing happens, quietly', async () => {
  const d = deps({ listExpiredDocuments: async () => [] });
  const report = await purgeExpiredDocuments(d, { now: T0, dryRun: false });

  assert.equal(report.deleted, 0);
  assert.equal(d.calls.audits.filter((a) => a.action === 'platform.document.purged').length, 0);
});
