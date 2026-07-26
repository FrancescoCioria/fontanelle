import { editableAmenities, normalizeElement } from "../../shared/amenities";
import { deleteNode, upsertNode } from "../lib/store";

/**
 * `POST /api/osm` — the write path, proxied.
 *
 * The browser used to run the whole changeset dance itself (create changeset →
 * read version → PUT/DELETE → close) and then merely *tell* the server to
 * expire the tile. That left the server guessing: it had to re-ask Overpass,
 * which lags OSM by minutes, so the refetch could easily not contain the node
 * the user had just created — and mark the tile fresh anyway.
 *
 * Now the server performs the mutation, reads the result back from the
 * authoritative OSM API (no replication lag there) and writes that into D1. The
 * cache is correct the instant the user's edit succeeds, with nothing inferred.
 *
 * ⚠️ It never accepts node data as truth: what goes into D1 is what OSM returns
 * when we read the object back, not what the client sent.
 *
 * The user's OAuth token rides in `Authorization` and is forwarded to OSM. It
 * is never stored and never logged — the app is same-origin, so this adds no
 * exposure the browser didn't already have.
 */

type Env = { DB: D1Database };

const OSM_API = "https://api.openstreetmap.org";

type Action = "create" | "update" | "delete";

type Body = {
  action?: Action;
  node?: {
    id?: unknown;
    lat?: unknown;
    lon?: unknown;
    tags?: Record<string, unknown>;
  };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/**
 * Hand-rolled rather than pulling an XML builder into the Worker: the whole
 * grammar is four attributes and a flat list of tags, and every value goes
 * through `escapeXml` — a user typing `Bar "Le Rêve" & co` in `operator` must
 * not be able to produce a malformed changeset.
 */
const nodeXml = (
  attributes: Record<string, string | number>,
  tags?: Record<string, string>
): string => {
  const attrs = Object.entries(attributes)
    .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
    .join(" ");

  const children = tags
    ? Object.entries(tags)
        .map(([k, v]) => `<tag k="${escapeXml(k)}" v="${escapeXml(v)}"/>`)
        .join("")
    : "";

  return `<osm><node ${attrs}>${children}</node></osm>`;
};

class OsmError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const osmFetch = async (
  token: string,
  method: string,
  path: string,
  body?: string
): Promise<string> => {
  const res = await fetch(`${OSM_API}${path}`, {
    method,
    headers: {
      Authorization: token,
      ...(body ? { "Content-Type": "text/xml" } : {})
    },
    body
  });

  const text = await res.text();

  if (!res.ok) {
    // OSM puts the real reason in the body (409 conflict, 412 precondition,
    // "changeset already closed"); swallowing it leaves the user with "failed"
    throw new OsmError(res.status, `${method} ${path} -> ${res.status} ${text}`);
  }

  return text;
};

/** Only plain nodes with an amenity this app knows how to tag back. */
const validate = (
  body: Body
): { action: Action; id: number | null; lat: number; lon: number; tags: Record<string, string> } | string => {
  const action = body.action;

  if (action !== "create" && action !== "update" && action !== "delete") {
    return "action must be create, update or delete";
  }

  const node = body.node || {};
  const lat = Number(node.lat);
  const lon = Number(node.lon);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return "node.lat and node.lon are required";
  }

  const id = action === "create" ? null : Number(node.id);

  if (action !== "create" && (!Number.isFinite(id) || id! <= 0)) {
    return "node.id is required to update or delete";
  }

  const rawTags = node.tags || {};
  const amenity = rawTags.amenity;

  // ⚠️ The same gate the add menu applies client-side, repeated here because
  // this endpoint is reachable without it. Playgrounds and picnic sites live
  // under `leisure`/`tourism`; writing `amenity=playground` would put a tag
  // into OSM that means nothing to anybody.
  if (
    typeof amenity !== "string" ||
    !(editableAmenities as string[]).includes(amenity)
  ) {
    return `node.tags.amenity must be one of ${editableAmenities.join(", ")}`;
  }

  const tags: Record<string, string> = {};

  Object.entries(rawTags).forEach(([k, v]) => {
    // drop empties rather than writing `fee=""` into OSM
    if (typeof v === "string" && v !== "") tags[k] = v;
  });

  return { action, id: id as number | null, lat, lon, tags };
};

const currentVersion = async (token: string, id: number): Promise<number> => {
  const raw = await osmFetch(token, "GET", `/api/0.6/node/${id}.json`);
  const { elements } = JSON.parse(raw) as {
    elements: { version: number }[];
  };

  if (!elements?.[0]) throw new OsmError(404, `node/${id} not found`);

  return elements[0].version;
};

export const onRequestPost: PagesFunction<Env> = async context => {
  const token = context.request.headers.get("Authorization");

  if (!token || !token.startsWith("Bearer ")) {
    return json({ error: "OSM authentication required" }, 401);
  }

  let body: Body;

  try {
    body = await context.request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const parsed = validate(body);

  if (typeof parsed === "string") return json({ error: parsed }, 400);

  const { action, lat, lon, tags } = parsed;
  const db = context.env.DB;

  try {
    const comment = `${
      action === "create" ? "Add" : action === "update" ? "Update" : "Delete"
    } "${tags.amenity}" amenity`;

    const changesetId = await osmFetch(
      token,
      "PUT",
      "/api/0.6/changeset/create",
      `<osm><changeset><tag k="comment" v="${escapeXml(
        comment
      )}"/><tag k="created_by" v="fontanelle.pages.dev"/></changeset></osm>`
    );

    let id = parsed.id;

    try {
      if (action === "create") {
        const created = await osmFetch(
          token,
          "PUT",
          "/api/0.6/node/create",
          nodeXml({ changeset: changesetId, lat, lon }, tags)
        );

        id = parseInt(created, 10);

        if (!Number.isFinite(id)) {
          throw new OsmError(502, `OSM returned no node id ("${created}")`);
        }
      } else {
        const version = await currentVersion(token, id!);
        const attributes = { changeset: changesetId, id: id!, lat, lon, version };

        await osmFetch(
          token,
          action === "update" ? "PUT" : "DELETE",
          `/api/0.6/node/${id}`,
          action === "update"
            ? nodeXml(attributes, tags)
            : nodeXml(attributes)
        );
      }
    } finally {
      // Best effort: an open changeset auto-closes after an hour, but leaving
      // one behind on every failed edit is rude to the OSM API.
      await osmFetch(
        token,
        "PUT",
        `/api/0.6/changeset/${changesetId}/close`
      ).catch(() => undefined);
    }

    if (action === "delete") {
      await deleteNode(db, `node/${id}`);
      console.log(`[osm] delete node/${id} ok (changeset ${changesetId})`);

      return json({ node: { id, lat, lon, tags, elementType: "node" } });
    }

    // ⚠️ Read back from the OSM API, not from what the client sent and not from
    // Overpass: this is the only source that already knows about the edit.
    const raw = await osmFetch(token, "GET", `/api/0.6/node/${id}.json`);
    const { elements } = JSON.parse(raw) as { elements: unknown[] };
    const stored = normalizeElement(elements?.[0] as never);

    if (!stored) {
      // The edit went through, but the result is something this app can't
      // render (e.g. the amenity was changed to an unsupported value). Don't
      // put it in the cache; the tile refresh will settle it.
      console.log(`[osm] ${action} node/${id} ok but not renderable`);

      return json({ node: { id, lat, lon, tags, elementType: "node" } });
    }

    await upsertNode(db, stored, Date.now());
    console.log(`[osm] ${action} node/${id} ok (changeset ${changesetId})`);

    return json({ node: stored });
  } catch (e) {
    const status = e instanceof OsmError ? e.status : 502;
    const message = (e as Error).message || String(e);

    console.log(`[osm] ${action} FAILED: ${message}`);

    return json({ error: message }, status === 401 ? 401 : status);
  }
};
