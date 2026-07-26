import { OverpassElement } from "../../shared/amenities";

/**
 * Talking to Overpass is the server's job, and the reason this app is
 * server-first: the public instances are slow, rate-limited and regularly half
 * down. On 2026-07-26 all four answered a Paris query with a 504 or a >17s
 * response — from a browser, with a 10s deadline and no shared cache, that is
 * simply an empty map.
 *
 * ⚠️ Only world-wide instances belong here. overpass.osm.ch was removed
 * 2026-07-19: it serves Switzerland only, so failing over to it returned
 * `200 []` for Milan — an empty map with no error, which is worse than a 500.
 */
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
];

/**
 * Per-attempt deadline. Generous on purpose: nobody is watching a spinner —
 * this runs behind an already-sent response, and the answer lands in D1 where
 * the next reader gets it for free. Measured 2026-07-26 on the four instances,
 * a dense z12 tile came back in 12s, 37s and 61s on three consecutive tries:
 * the variance is queueing on their side, so a tight timeout buys nothing but
 * a guaranteed miss.
 */
const ATTEMPT_TIMEOUT_MS = 30000;

/**
 * ⚠️ Endpoints are **hedged, not queued**: after this long without an answer we
 * start asking the next instance too, and keep the first good reply.
 *
 * Trying them strictly one after another is what failed on 2026-07-26: two dead
 * instances ate 30s each and the deadline arrived before the one instance that
 * was actually serving Paris was ever asked. A tile is fetched once per TTL, so
 * the occasional duplicate query costs Overpass far less than our retry loop
 * would.
 */
const HEDGE_DELAY_MS = 8000;

/** Never more than this many instances asked at once for one tile. */
const MAX_PARALLEL = 3;

/**
 * Rotates across isolate lifetime so the last instance that actually answered
 * is asked first next time.
 */
let cursor = 0;

export type OverpassResult = {
  elements: OverpassElement[];
  /**
   * ⚠️ How far behind OSM this answer is, in epoch ms — NOT when we received
   * it. Overpass instances replicate with a lag (measured 2026-07-26:
   * 1.3–1.9 minutes), so an answer routinely describes a world in which
   * something created a minute ago does not exist yet. Anything that decides
   * "this object is gone" has to reason against this instant, never the clock.
   */
  dataTimestamp: number | null;
  endpoint: string;
  attempts: number;
  ms: number;
};

type Answer = {
  elements: OverpassElement[];
  dataTimestamp: number | null;
};

const attempt = async (
  endpoint: string,
  query: string,
  signal: AbortSignal
): Promise<Answer> => {
  const res = await fetch(endpoint, {
    method: "POST",
    body: new URLSearchParams({ data: query }),
    headers: {
      // Overpass asks clients to identify themselves; an anonymous flood is
      // what gets an app throttled first.
      "User-Agent": "fontanelle.pages.dev (+https://fontanelle.pages.dev)"
    },
    signal
  });

  if (!res.ok) throw new Error(String(res.status));

  // ⚠️ A 200 is not a success: Overpass reports "runtime error: Query timed
  // out" inside a 200 body, and some proxies answer HTML. Parse before treating
  // the endpoint as healthy, or we cache an empty tile for a month.
  const json = (await res.json()) as {
    elements?: OverpassElement[];
    osm3s?: { timestamp_osm_base?: string };
  };

  if (!Array.isArray(json.elements)) throw new Error("200 without elements");

  const base = json.osm3s?.timestamp_osm_base;
  const parsed = base ? Date.parse(base) : NaN;

  return {
    elements: json.elements,
    dataTimestamp: Number.isFinite(parsed) ? parsed : null
  };
};

export const overpassFetch = async (
  query: string,
  options: { deadline?: number; signal?: AbortSignal } = {}
): Promise<OverpassResult> => {
  const started = Date.now();
  const deadline = options.deadline ?? started + ATTEMPT_TIMEOUT_MS;
  const errors: string[] = [];

  // last known-good first
  const order = ENDPOINTS.map(
    (_, i) => ENDPOINTS[(cursor + i) % ENDPOINTS.length]
  );

  type Settled = { i: number; answer?: Answer; error?: string };

  const inflight = new Map<number, Promise<Settled>>();
  const aborts = new Map<number, AbortController>();
  let next = 0;

  const launch = () => {
    const i = next++;
    const endpoint = order[i];
    const controller = new AbortController();
    const timeout = AbortSignal.timeout(
      Math.max(1, Math.min(ATTEMPT_TIMEOUT_MS, deadline - Date.now()))
    );
    const signals = [controller.signal, timeout];

    if (options.signal) signals.push(options.signal);

    aborts.set(i, controller);
    inflight.set(
      i,
      attempt(endpoint, query, AbortSignal.any(signals)).then(
        answer => ({ i, answer }),
        (e: Error) => ({ i, error: `${endpoint} -> ${e.name}: ${e.message}` })
      )
    );
  };

  try {
    for (;;) {
      if (
        next < order.length &&
        inflight.size < MAX_PARALLEL &&
        Date.now() < deadline
      ) {
        launch();
      }

      if (inflight.size === 0) break;

      const canHedge = next < order.length && Date.now() < deadline;
      let hedgeTimer: ReturnType<typeof setTimeout> | undefined;

      const hedge = canHedge
        ? new Promise<null>(resolve => {
            hedgeTimer = setTimeout(() => resolve(null), HEDGE_DELAY_MS);
          })
        : null;

      const settled = await Promise.race(
        hedge ? [...inflight.values(), hedge] : [...inflight.values()]
      );

      if (hedgeTimer) clearTimeout(hedgeTimer);

      // hedge fired: nobody answered in time, widen the net
      if (settled === null) continue;

      inflight.delete(settled.i);
      aborts.delete(settled.i);

      if (settled.answer) {
        const endpoint = order[settled.i];
        cursor = ENDPOINTS.indexOf(endpoint);

        return {
          elements: settled.answer.elements,
          dataTimestamp: settled.answer.dataTimestamp,
          endpoint,
          attempts: settled.i + 1,
          ms: Date.now() - started
        };
      }

      errors.push(settled.error!);
    }
  } finally {
    // whoever is still running lost the race and nobody will read them
    aborts.forEach(controller => controller.abort());
  }

  throw new Error(
    `all Overpass endpoints failed (${
      errors.join(" | ") || "deadline reached before any attempt"
    })`
  );
};

/**
 * Fixed-concurrency pool. Not `Promise.all`: Workers cap simultaneous outbound
 * connections, and hammering four public Overpass instances in parallel is how
 * you earn a 429 for everyone.
 */
export const pool = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;

  const run = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, run)
  );

  return results;
};
