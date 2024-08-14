import {
  OpenStreetMapNode,
  updateCachedItems
} from "./getOpenStreetMapAmenities";
// import localforage from "localforage";
import { osmAuth as _osmAuth } from "osm-auth";

// import type OsmAuth from "osm-auth";
// const _osmAuth = require("osm-auth").osmAuth; // CJS named import

import { Builder } from "xml2js";

const xmlBuilder = new Builder();

export const osmAuth = new _osmAuth({
  client_id: "UzKLAo2Jaaq3uuekbiMxIBX4NQQk5NrVwqMtKZZT7tA",
  client_secret: "qzp6Ydy22GiZKq0WZ-prWj1AVI9fNGOLsQckEhqRr6o",
  redirect_uri: "https://francescocioria.github.io/fontanelle/",
  scope: "write_api"
});

const osmApi = <R>(options: {
  method: string;
  path: string;
  headers?: { [k: string]: string };
  content?: string;
}): Promise<R> => {
  return new Promise((resolve, reject) => {
    osmAuth.xhr(options, (err: any, result: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

const osmGet = <R>(options: { path: string }): Promise<R> =>
  osmApi<string>({
    method: "GET",
    path: options.path,
    headers: {
      Accept: "application/json"
    }
  }).then(JSON.parse);

const osmPut = <R>(options: {
  path: string;
  content: { osm?: { [k in "node" | "changeset"]?: object } };
}) => {
  return osmApi<R>({
    method: "PUT",
    path: options.path,
    headers: { "Content-Type": "text/xml" },
    content: xmlBuilder.buildObject(options.content)
  });
};

const osmDelete = <R>(options: {
  path: string;
  content: { osm?: { [k in "node" | "changeset"]?: object } };
}) => {
  return osmApi<R>({
    method: "DELETE",
    path: options.path,
    headers: { "Content-Type": "text/xml" },
    content: xmlBuilder.buildObject(options.content)
  });
};

const wrapInChangeset = async <R>(
  changesetComment: string,
  mutation: (changesetId: string) => Promise<R>
) => {
  const changesetId = await osmPut<string>({
    path: "/api/0.6/changeset/create",

    content: {
      osm: { changeset: { tag: { $: { k: "comment", v: changesetComment } } } }
    }
  });

  const res = await mutation(changesetId);

  await osmPut({
    path: `/api/0.6/changeset/${changesetId}/close`,
    content: {}
  });

  return res;
};

export const osmDeleteNode = async (
  node: OpenStreetMapNode
): Promise<OpenStreetMapNode> => {
  await wrapInChangeset(
    `Delete "${node.tags.amenity}" amenity`,
    async changesetId => {
      const {
        elements: [fetchedNode]
      } = await osmGet<{ elements: [OpenStreetMapNode & { version: number }] }>(
        {
          path: `/api/0.6/node/${node.id}`
        }
      );

      osmDelete({
        path: `/api/0.6/node/${node.id}`,

        content: {
          osm: {
            node: {
              $: {
                changeset: changesetId,
                id: node.id,
                lat: node.lat,
                lon: node.lon,
                version: fetchedNode.version
              }
            }
          }
        }
      });
    }
  );

  return node;
};

export const osmUpdateNode = async (
  node: OpenStreetMapNode
): Promise<OpenStreetMapNode> => {
  await wrapInChangeset(
    `Update "${node.tags.amenity}" amenity`,
    async changesetId => {
      const {
        elements: [fetchedNode]
      } = await osmGet<{ elements: [OpenStreetMapNode & { version: number }] }>(
        {
          path: `/api/0.6/node/${node.id}`
        }
      );

      osmPut({
        path: `/api/0.6/node/${node.id}`,

        content: {
          osm: {
            node: {
              $: {
                changeset: changesetId,
                id: node.id,
                lat: node.lat,
                lon: node.lon,
                version: fetchedNode.version
              },
              tag: (Object.keys(node.tags) as Array<keyof typeof node.tags>)
                .filter(t => node.tags[t])
                .map(k => ({
                  $: {
                    k: k,
                    v: node.tags[k]
                  }
                }))
            }
          }
        }
      });
    }
  );

  return node;
};

export const osmCreateNode = async (
  node: Omit<OpenStreetMapNode, "id">
): Promise<OpenStreetMapNode> => {
  const nodeId = await wrapInChangeset<string>(
    `Add "${node.tags.amenity}" amenity`,
    changesetId =>
      osmPut({
        path: `/api/0.6/node/create`,
        content: {
          osm: {
            node: {
              $: {
                changeset: changesetId,
                lat: node.lat,
                lon: node.lon
              },
              tag: (Object.keys(node.tags) as Array<keyof typeof node.tags>)
                .filter(t => node.tags[t])
                .map(k => ({
                  $: {
                    k: k,
                    v: node.tags[k]
                  }
                }))
            }
          }
        }
      })
  );

  return {
    ...node,
    id: parseInt(nodeId)
  };
};

export const osmGetNode = async (node: OpenStreetMapNode) => {
  const {
    elements: [fetchedNode]
  } = await fetch(
    `https://www.openstreetmap.org/api/0.6/node/${node.id}.json`
  ).then(res => res.json());

  updateCachedItems([fetchedNode]);

  return fetchedNode;
};
