import { useEffect, useState } from "react";

/** Phones and other small screens (narrow portrait or short landscape) get the compact game layout. */
export const COMPACT_QUERY = "(max-width: 639px), (max-height: 520px)";
export function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(COMPACT_QUERY), on = () => setCompact(mql.matches);
    on(); mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, []);
  return compact;
}
