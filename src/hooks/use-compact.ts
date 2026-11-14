import { useEffect, useState } from "react";

/** Phones and other small screens (narrow portrait or short landscape) get the compact game layout. */
export const COMPACT_QUERY = "(max-width: 639px), (max-height: 520px)";
/** Phones turned sideways: very little height, plenty of width. */
export const SHORT_QUERY = "(max-height: 520px) and (min-width: 640px)";
function useMedia(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query), on = () => setMatch(mql.matches);
    on(); mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, [query]);
  return match;
}
export const useCompact = () => useMedia(COMPACT_QUERY);
export const useShortLandscape = () => useMedia(SHORT_QUERY);
