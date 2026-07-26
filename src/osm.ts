import {
  normalizeElement,
  OpenStreetMapNode,
  updateCachedItems
} from "./getOpenStreetMapAmenities";
import { osmAuth as _osmAuth } from "osm-auth";

export const osmAuth = new _osmAuth({
  client_id: "UzKLAo2Jaaq3uuekbiMxIBX4NQQk5NrVwqMtKZZT7tA",
  redirect_uri: "https://fontanelle.pages.dev/",
  scope: "write_api",
  singlepage: true
});

/**
 * Every mutation goes through our own server, which runs the whole changeset
 * dance against OSM and then writes the result into the shared D1 cache.
 *
 * Doing it here instead meant four round trips from a phone, a changeset left
 * open whenever the browser died mid-sequence, and — worst — a server that
 * could only *guess* what had changed by re-asking Overpass, which lags OSM by
 * minutes and would happily answer that the node the user just created does not
 * exist.
 *
 * ⚠️ `osmAuth.fetch` attaches the user's bearer token to whatever URL it is
 * given, so the token reaches our same-origin endpoint without this file ever
 * touching it. Don't replace it with a plain `fetch` plus a hand-read token
 * out of localStorage: the storage key is osm-auth's private business.
 */
const osmWrite = async (
  action: "create" | "update" | "delete",
  node: Omit<OpenStreetMapNode, "id"> & { id?: number }
): Promise<OpenStreetMapNode> => {
  const res = await osmAuth.fetch("/api/osm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, node })
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json?.error || `OSM write failed (${res.status})`);
  }

  return json.node as OpenStreetMapNode;
};

export const osmCreateNode = (
  node: Omit<OpenStreetMapNode, "id">
): Promise<OpenStreetMapNode> => osmWrite("create", node);

export const osmUpdateNode = (
  node: OpenStreetMapNode
): Promise<OpenStreetMapNode> => osmWrite("update", node);

export const osmDeleteNode = (
  node: OpenStreetMapNode
): Promise<OpenStreetMapNode> => osmWrite("delete", node);

export const osmGetNode = async (node: OpenStreetMapNode) => {
  const type = node.elementType || "node";

  const {
    elements: [fetchedNode]
  } = await fetch(
    `https://www.openstreetmap.org/api/0.6/${type}/${node.id}.json`
  ).then(res => res.json());

  // the OSM API returns raw tags (e.g. `leisure=playground`, `tourism=picnic_site`)
  // and no center for
  // ways/relations — normalize before caching, or we poison the cache
  const normalized = normalizeElement(fetchedNode);
  if (normalized) {
    updateCachedItems([normalized]);
  }

  return fetchedNode;
};
