// Document retention (D-054).
//
// Two of the four documents we ask a gym owner for are identity documents.
// Keeping those longer than we need them is not untidiness, it is a POPIA
// problem — and the gym, not the platform, is the responsible party for its
// members, which makes our own housekeeping the one part we cannot delegate.
//
//   >>> THIS IS THE ONLY JOB ON THE PLATFORM THAT DELETES ANYTHING. <<<
//
// Everything else reports and leaves the decision to a human. This one does
// not, because "delete personal data you no longer need" is not a judgement
// call — it is the obligation. So the care goes into the ORDER of operations
// and into never deleting a row whose file is still there.

/** How long a rejected applicant has to come back and argue (D-061). */
export const APPEAL_WINDOW_DAYS = 90;

const DAY_MS = 86_400_000;

/**
 * When may this application's documents be deleted?
 *
 * @returns {string|null} a date (YYYY-MM-DD), or null for "not yet, and not on
 *   a timer" — which is deliberately the answer for anything still in flight.
 */
export function retentionDateFor(application, now = new Date()) {
  if (application?.status !== 'rejected') {
    // An APPROVED gym's documents are kept while it trades: they are the
    // paperwork we would need if anything about that gym were ever disputed.
    // Its clock starts when it leaves, which is a different event entirely.
    //
    // An UNDECIDED application obviously keeps its documents — they are the
    // thing being decided.
    return null;
  }

  const from = application.decided_at ? new Date(application.decided_at) : now;
  return new Date(from.getTime() + APPEAL_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Delete documents whose retention date has passed.
 *
 * DRY RUN BY DEFAULT, like everything else here that has consequences.
 *
 * @param {object} deps  { listExpiredDocuments, removeStorageObject,
 *                         deleteDocumentRow, audit }
 */
export async function purgeExpiredDocuments(deps, { now = new Date(), dryRun = true } = {}) {
  const expired = await deps.listExpiredDocuments(now.toISOString().slice(0, 10));

  const report = {
    dryRun,
    ran_at: now.toISOString(),
    checked: expired.length,
    wouldDelete: dryRun ? expired.length : 0,
    deleted: 0,
    errors: [],
  };

  if (dryRun) return report;

  for (const doc of expired) {
    try {
      // THE FILE FIRST, THEN THE ROW.
      //
      // Row first, and a crash in between leaves a file in the bucket that
      // nothing points at — somebody's ID document, permanently orphaned and
      // invisible. File first, and a crash leaves a row pointing at nothing,
      // which is visible, harmless and fixable.
      await deps.removeStorageObject(doc.storage_ref);
      await deps.deleteDocumentRow(doc.id);

      // Written after the fact and without the file: the audit log is the only
      // remaining evidence that this document ever existed, which is the whole
      // reason to write it.
      await deps.audit({
        action: 'platform.document.purged',
        actor_kind: 'system',
        entity: 'document',
        entity_id: doc.id,
        detail: { storage_ref: doc.storage_ref, application_id: doc.application_id },
      });

      report.deleted += 1;
    } catch (err) {
      // The row is NOT deleted when the file could not be. Deleting it anyway
      // would throw away the only pointer to a file still holding personal
      // data, and the next run would not know to try again.
      report.errors.push({ document_id: doc.id, error: err?.message || String(err) });
    }
  }

  await deps.audit({
    action: 'platform.retention.run',
    actor_kind: 'system',
    detail: { checked: report.checked, deleted: report.deleted, errors: report.errors.length },
  });

  return report;
}
