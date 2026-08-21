import { useEffect, useMemo, useRef, useState } from "react";
import { Popup } from "./Popup";
import { SEARCH_PRESETS, SearchPreset, searchMatcher } from "./search";
import {
  Amenity,
  amenities,
  getAmenityIcon,
  getAmenityTitle
} from "./getOpenStreetMapAmenities";
import { useAppStore } from "./store";

/** `amenity=vending_machine + vending=parking_tickets` — what will be asked of OSM. */
const tagLine = (preset: SearchPreset): string =>
  Object.keys(preset.tags)
    .map(key => `${key}=${preset.tags[key]}`)
    .join(" + ");

/**
 * The other way into the map: pick a thing, see it around here, come back.
 *
 * ⚠️ The catalogue deliberately excludes what the map already carries, and that
 * would leave typing "toilets" staring at an empty list — a dead end in the one
 * place the user is asking a question. So the amenities the app draws itself
 * are matched too, and answer the search their own way: they turn their pill on
 * alone instead of entering search mode. Same question, and the honest answer
 * is "that one is already here".
 */
const SearchPicker = (props: { onPick: (preset: SearchPreset) => void }) => {
  const isOpen = useAppStore(s => s.isSearchPickerOpen);
  const setIsOpen = useAppStore(s => s.setIsSearchPickerOpen);
  const showOnlyFilter = useAppStore(s => s.showOnlyFilter);
  const setSearch = useAppStore(s => s.setSearch);

  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    setText("");
    // desktop convenience only: on a phone the keyboard would cover the list it
    // is meant to filter, and the list is the point
    if (!("ontouchstart" in window)) inputRef.current?.focus();
  }, [isOpen]);

  /**
   * ⚠️ Only once something is typed. With an empty box these nine would be the
   * first screenful of a picker whose whole point is the *other* list — the
   * catalogue would start below the fold, and the answer to "what can I search
   * for" would be "the things you already have". They exist to catch a typed
   * "toilets", not to greet you.
   */
  const matcher = useMemo(() => searchMatcher(text), [text]);

  const onMap: Amenity[] = useMemo(
    () =>
      !text.trim()
        ? []
        : amenities.filter(amenity =>
            matcher({ label: getAmenityTitle(amenity) })
          ),
    [matcher, text]
  );

  const matches = useMemo(() => SEARCH_PRESETS.filter(matcher), [matcher]);

  const groups = useMemo(() => {
    const byGroup: { group: string; presets: SearchPreset[] }[] = [];

    matches.forEach(preset => {
      const last = byGroup[byGroup.length - 1];

      if (last && last.group === preset.group) last.presets.push(preset);
      else byGroup.push({ group: preset.group, presets: [preset] });
    });

    return byGroup;
  }, [matches]);

  const pick = (preset: SearchPreset) => {
    setIsOpen(false);
    props.onPick(preset);
  };

  const pickAmenity = (amenity: Amenity) => {
    setIsOpen(false);
    // ⚠️ Back to the map first. This picker is also reachable *from inside*
    // search mode, where every amenity layer is hidden — turning a pill on
    // there rewrites the user's saved filters and shows them nothing, so the
    // request reads as ignored.
    setSearch(null);
    showOnlyFilter(amenity);
  };

  // ⚠️ Nothing at all while closed. `Popup` only sets `display: none`, so
  // rendering it anyway kept ~70 rows of DOM alive from the map's first paint
  // and reconciled them on every parent render — including every frame of a
  // radius-slider drag. All the hooks above still run, so this is a render
  // decision, not a conditional hook.
  if (!isOpen) return null;

  return (
    <Popup
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      aria-label="Search for a place type"
    >
      <h4 style={{ marginTop: 0, marginBottom: 4 }}>Find nearby</h4>
      <span style={{ fontSize: 13, color: "#64748b" }}>
        One live look around the area you're on — not kept on the map
      </span>

      <input
        ref={inputRef}
        className="search-picker-input"
        value={text}
        placeholder="Bench, pharmacy, parking meter…"
        aria-label="Filter place types"
        onChange={e => setText(e.currentTarget.value)}
        onKeyDown={e => {
          // Enter takes the obvious one, so a desktop search is type-and-go
          if (e.key !== "Enter") return;
          // whatever is at the top of the list — the on-map group renders first
          if (onMap.length) pickAmenity(onMap[0]);
          else if (matches.length) pick(matches[0]);
        }}
      />

      <div className="search-picker-list">
        {onMap.length > 0 && (
          <>
            <div className="search-picker-group">Already on the map</div>
            {onMap.map(amenity => (
              <button
                key={amenity}
                className="search-picker-row"
                onClick={() => pickAmenity(amenity)}
              >
                <span className="search-picker-row-icon">
                  {getAmenityIcon(amenity, 22)}
                </span>
                <span className="search-picker-row-text">
                  <span className="search-picker-row-label">
                    {getAmenityTitle(amenity)}
                  </span>
                  <span className="search-picker-row-hint">
                    already on the map — show only this
                  </span>
                </span>
              </button>
            ))}
          </>
        )}

        {groups.map(({ group, presets }) => (
          <div key={group}>
            <div className="search-picker-group">{group}</div>
            {presets.map(preset => (
              <button
                key={preset.id}
                className="search-picker-row"
                onClick={() => pick(preset)}
              >
                <span className="search-picker-row-dot" />
                <span className="search-picker-row-text">
                  <span className="search-picker-row-label">{preset.label}</span>
                  {/* the real OSM tag, spelled out: this app is used by people
                      who map, and it is also what makes an unexpected result
                      set explainable instead of mysterious */}
                  <span className="search-picker-row-tag">{tagLine(preset)}</span>
                </span>
              </button>
            ))}
          </div>
        ))}

        {matches.length === 0 && onMap.length === 0 && (
          <div className="search-picker-empty">
            Nothing in the catalogue matches “{text.trim()}”.
          </div>
        )}
      </div>
    </Popup>
  );
};

export default SearchPicker;
