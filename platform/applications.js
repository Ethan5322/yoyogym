// Application review — where a human decision becomes infrastructure.
//
// Every gym application is reviewed by a person, with no published SLA
// (D-048). That is not slowness for its own sake: under app-based discovery
// (D-036) gym search IS how members find a gym, so an unvetted listing is a
// fake gym sitting in the product's own discovery surface.
//
// TWO THINGS THIS FILE IS BUILT AROUND
//
// 1. APPROVING TWICE MUST NOT PROVISION TWICE. Approval creates a Supabase
//    project that is billed monthly. A double-click that bills twice is a real
//    failure, so the state machine refuses any decision on an application that
//    has already been decided.
//
// 2. EVERY DECISION LEAVES A TRACE. Decisions are appended to
//    application_events and never edited — that table is the record of why a
//    gym was let in or turned away. This module is given an `appendEvent`
//    function and no update or delete, so it cannot rewrite history even by
//    mistake.

/** Only an application awaiting a decision can be decided. */
import { retentionDateFor } from './retention.js';

const DECIDABLE = new Set(['submitted', 'under_review', 'info_requested']);

function can(actor, permission) {
  return Array.isArray(actor?.permissions) && actor.permissions.includes(permission);
}

async function refuse(deps, application, actor, reason) {
  await deps.audit({
    action: 'application.decision.refused',
    entity: 'application',
    entity_id: application?.id,
    detail: { actor: actor?.id, reason },
  });
  return { ok: false, error: reason };
}

/**
 * Approve an application and provision the gym.
 *
 * @param {object} [options]
 * @param {boolean} [options.dryRun=true] passed straight to the orchestrator,
 *   which also defaults to a dry run. Two defaults rather than one, because the
 *   consequence of getting it wrong is a monthly bill.
 */
export async function approveApplication(applicationId, actor, deps, options = {}) {
  const dryRun = options.dryRun !== false;
  const application = await deps.getApplication(applicationId);

  if (!application) return refuse(deps, null, actor, 'Application not found.');
  if (!can(actor, 'application.approve')) {
    return refuse(deps, application, actor, 'You do not have permission to approve applications.');
  }
  if (!DECIDABLE.has(application.status)) {
    // The guard against a double bill.
    return refuse(
      deps,
      application,
      actor,
      `This application has already been decided (${application.status}).`
    );
  }

  const now = new Date().toISOString();

  // The decision is recorded BEFORE provisioning is attempted. If provisioning
  // fails, the human decision still stands and is still auditable — the failure
  // is a separate event, not a reversal of the judgement.
  await deps.updateApplication(applicationId, {
    status: 'approved',
    decided_by: actor.id,
    decided_at: now,
    updated_at: now,
  });

  await deps.appendEvent({
    application_id: applicationId,
    event: 'approved',
    actor_user_id: actor.id,
    created_at: now,
  });

  const result = await deps.provisionGym(application, { dryRun });

  if (!result.ok) {
    await deps.appendEvent({
      application_id: applicationId,
      event: 'provision_failed',
      actor_user_id: actor.id,
      detail: {
        failed_at: result.failedAt,
        error: result.error,
        // Surfaced here too: a stranded project is a bill nobody is tracking.
        orphaned_project_ref: result.orphanedProjectRef ?? null,
      },
      created_at: new Date().toISOString(),
    });
    return { ok: false, error: result.error, provision: result };
  }

  await deps.appendEvent({
    application_id: applicationId,
    event: 'provisioned',
    actor_user_id: actor.id,
    detail: { gym_id: result.gym?.id, dry_run: dryRun },
    created_at: new Date().toISOString(),
  });

  // The owner needs a way in. Issued AFTER provisioning succeeds, because an
  // activation link to a gym that does not exist is worse than no email at
  // all — the owner clicks it, sets a password, and finds nothing.
  //
  // A failure here does NOT undo the approval. The gym exists and the decision
  // stands; the owner can be sent a fresh link. Losing a provisioned gym over
  // a failed email would be the wrong trade by a wide margin.
  let activation = null;
  if (!dryRun && deps.issueActivation && result.gym?.id) {
    try {
      activation = await deps.issueActivation({
        userId: application.applicant_user_id,
        gymId: result.gym.id,
      });
    } catch (err) {
      await deps.appendEvent({
        application_id: applicationId,
        event: 'activation_failed',
        actor_user_id: actor.id,
        detail: { error: err?.message || String(err), gym_id: result.gym.id },
        created_at: new Date().toISOString(),
      });
    }
  }

  return { ok: true, application, gym: result.gym, activation, dryRun };
}

/**
 * Reject an application. A reason is REQUIRED: the owner is told why and may
 * reapply once it is fixed (D-061). There is no formal appeal, which makes the
 * reason the only thing they have to work with.
 */
export async function rejectApplication(applicationId, actor, reason, deps) {
  const application = await deps.getApplication(applicationId);

  if (!application) return refuse(deps, null, actor, 'Application not found.');
  if (!can(actor, 'application.reject')) {
    return refuse(deps, application, actor, 'You do not have permission to reject applications.');
  }
  if (!reason || !String(reason).trim()) {
    return refuse(deps, application, actor, 'A reason is required to reject an application.');
  }
  if (!DECIDABLE.has(application.status)) {
    return refuse(deps, application, actor, `This application has already been decided (${application.status}).`);
  }

  const now = new Date().toISOString();

  await deps.updateApplication(applicationId, {
    status: 'rejected',
    decided_by: actor.id,
    decided_at: now,
    decision_reason: String(reason).trim(),
    updated_at: now,
  });

  // The retention clock starts at the rejection, not at the purge run (D-054).
  // Two of the documents we asked for are identity documents, and the appeal
  // window is the only reason we are still holding them.
  if (deps.setDocumentRetention) {
    const until = retentionDateFor({ status: 'rejected', decided_at: now }, new Date(now));
    await deps.setDocumentRetention(applicationId, until);
  }

  await deps.appendEvent({
    application_id: applicationId,
    event: 'rejected',
    actor_user_id: actor.id,
    reason: String(reason).trim(),
    created_at: now,
  });

  return { ok: true, application };
}

/**
 * Send an application back for more information.
 *
 * Deliberately NOT a decision: `decided_at` stays empty, so an incomplete
 * application is not counted as a refusal in any reporting later.
 */
export async function requestMoreInfo(applicationId, actor, message, deps) {
  const application = await deps.getApplication(applicationId);

  if (!application) return refuse(deps, null, actor, 'Application not found.');
  if (!can(actor, 'application.approve') && !can(actor, 'application.reject')) {
    return refuse(deps, application, actor, 'You do not have permission to review applications.');
  }
  if (!message || !String(message).trim()) {
    return refuse(deps, application, actor, 'Say what information is needed.');
  }
  if (!DECIDABLE.has(application.status)) {
    return refuse(deps, application, actor, `This application has already been decided (${application.status}).`);
  }

  const now = new Date().toISOString();

  await deps.updateApplication(applicationId, {
    status: 'info_requested',
    review_notes: String(message).trim(),
    updated_at: now,
  });

  await deps.appendEvent({
    application_id: applicationId,
    event: 'info_requested',
    actor_user_id: actor.id,
    reason: String(message).trim(),
    created_at: now,
  });

  return { ok: true, application };
}
