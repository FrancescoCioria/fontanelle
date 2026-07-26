/**
 * Append-only write log (`audit_events`).
 *
 * ⚠️ **Nothing reads this to decide anything.** State lives in `nodes` and
 * `tiles`; this table is history, for a human, after the fact. Reading it to
 * drive logic is the line between "CRUD + event logging" and event sourcing,
 * and we are firmly on this side of it.
 *
 * It exists because `console.log` in a Pages Function is only visible to a
 * `wrangler tail` attached at that very moment — real user edits left nothing
 * to inspect afterwards.
 */

export type AuditActor =
  | { type: "osm_user"; id: string; name: string }
  | { type: "unknown" };

export type AuditEvent = {
  /** Namespaced verb, past tense: "node.created", "node.delete_failed". */
  action: string;
  actor: AuditActor;
  subjectType: string;
  subjectId: string | null;
  metadata?: Record<string, unknown>;
  request?: Request;
};

/**
 * The single write point — no scattered inserts.
 *
 * ⚠️ Best-effort by design, and never awaited into the caller's failure path.
 * The mutation it describes happened on a remote server (OSM), so it cannot be
 * atomic with it whatever we do; losing a log line must not turn a successful
 * edit into an error shown to the user.
 */
export const recordEvent = async (
  db: D1Database,
  event: AuditEvent
): Promise<void> => {
  try {
    await db
      .prepare(
        `INSERT INTO audit_events
           (id, occurred_at, action, actor_type, actor_id, actor_name,
            subject_type, subject_id, metadata, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        Date.now(),
        event.action,
        event.actor.type,
        event.actor.type === "osm_user" ? event.actor.id : null,
        event.actor.type === "osm_user" ? event.actor.name : null,
        event.subjectType,
        event.subjectId,
        JSON.stringify(event.metadata ?? {}),
        event.request?.headers.get("CF-Connecting-IP") ?? null,
        event.request?.headers.get("User-Agent")?.slice(0, 300) ?? null
      )
      .run();
  } catch (e) {
    // the log failing must never be why an edit fails
    console.log(`[audit] could not record ${event.action}: ${(e as Error).message}`);
  }
};
