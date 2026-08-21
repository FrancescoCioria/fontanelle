import { formatDistance } from "./format";
import { MAX_SEARCH_RESULTS } from "./search";
import { useAppStore } from "./store";

/**
 * What the pill row becomes in search mode: the one thing on screen saying
 * which question the map is currently answering, and the way back out.
 *
 * ⚠️ Search mode has its own status line rather than reusing `DataStatus`.
 * That banner reasons about tiles — fresh, held, cooling, partial — and a
 * search has none of that: it is one request that either answered or didn't.
 * The kinds of empty are different too ("nothing within 1 km" vs "nothing
 * mapped in this area"), and saying the wrong one is exactly the confusion
 * both of these exist to prevent.
 */
const SearchBar = (props: { onRetry: () => void }) => {
  const search = useAppStore(s => s.search)!;
  const setSearch = useAppStore(s => s.setSearch);
  const setIsSearchPickerOpen = useAppStore(s => s.setIsSearchPickerOpen);

  // ⚠️ Text only: whether the line can be tapped is `status === "failed"`, read
  // where it is used. A `retryable` flag next to the status it is derived from
  // is a second copy of the same fact.
  const status = (): string | null => {
    switch (search.status) {
      case "searching":
        return "Searching…";
      case "failed":
        // ⚠️ Which kind of failure, like the tile banner does: a search has no
        // saved copy to fall back on, so being offline isn't "OSM is down" —
        // it is the one state where this mode simply cannot work, and saying
        // the wrong one sends the user hunting for a problem that isn't theirs.
        return navigator.onLine
          ? "Can't reach OpenStreetMap. Tap to retry."
          : "You're offline — searching needs a connection. Tap to retry.";
      case "done":
        // ⚠️ Not "showing the first 2000": Overpass returns objects in its own
        // order, so a truncated set is a scatter across the whole disc that
        // would hide the nearest one. Nothing is drawn, and the way out is the
        // radius slider the user already has.
        if (search.tooMany) {
          return `Over ${MAX_SEARCH_RESULTS.toLocaleString()} here — reduce the search radius to see them`;
        }

        // ⚠️ the run's own radius: this line's advice is "change the radius",
        // so the live value is about to stop describing what is on screen
        return search.nodes.length === 0
          ? `No ${search.preset.label.toLowerCase()} within ${formatDistance(
              search.radius
            )}`
          : null;
    }
  };

  const line = status();
  const retryable = search.status === "failed";

  return (
    <>
      <div className="search-bar">
        <button
          className="search-bar-back"
          aria-label="Back to the map"
          onClick={() => setSearch(null)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>

        {/* the label is the way to swap preset without leaving search mode */}
        <button
          className="search-bar-preset"
          onClick={() => setIsSearchPickerOpen(true)}
        >
          <span className="search-bar-label">{search.preset.label}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* a zero would only repeat the line below, which says it in words */}
        {search.status === "done" &&
          !search.tooMany &&
          search.nodes.length > 0 && (
            <span className="search-bar-count">{search.nodes.length}</span>
          )}
      </div>

      {line && (
        <div
          /* ⚠️ A failure has to look like one: the amber is the same the tile
             banner uses, and reads differently from "nothing here", which is
             news of a different kind. */
          className={`data-status${
            search.status === "failed" ? " data-status--unreachable" : ""
          }`}
          role="status"
          style={{ cursor: retryable ? "pointer" : "default" }}
          onClick={() => {
            if (retryable) props.onRetry();
          }}
        >
          {line}
        </div>
      )}
    </>
  );
};

export default SearchBar;
