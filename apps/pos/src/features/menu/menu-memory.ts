import {
  type MutableRefObject,
  type RefObject,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * Where the cashier was on the menu: the category picked, the search typed and how far the
 * screen was scrolled. The selling screen is drawn again after every whole-screen step
 * (the buyer's details, the finished sale) and after a look at the floor or a tool, so this
 * lives above it, for the till's whole session.
 */
export interface MenuPlace {
  categoryId: string | null;
  query: string;
  scrollTop: number;
  /** The order the search and scroll belong to: a new order starts them afresh. */
  orderId: string | null;
}

export type MenuMemory = MutableRefObject<MenuPlace>;

const MenuMemoryContext = createContext<MenuMemory | null>(null);
export const MenuMemoryProvider = MenuMemoryContext.Provider;

/** A fresh place for a till session to keep while it sells. */
export function useNewMenuMemory(): MenuMemory {
  return useRef<MenuPlace>({ categoryId: null, query: "", scrollTop: 0, orderId: null });
}

/**
 * The place to start the menu from for `orderId`. Back on the same order (after the buyer's
 * details, the floor, a tool) everything is as it was; on a new order (the next customer)
 * the search and scroll start over and only the category stays, since a counter tends to
 * sell from the same one. Without a provider (a screen shown alone) it starts from the top.
 */
function placeFor(memory: MenuMemory | null, orderId: string | undefined): MenuPlace | null {
  if (memory === null) return null;
  if (orderId !== undefined && memory.current.orderId !== orderId) {
    memory.current = { ...memory.current, query: "", scrollTop: 0, orderId };
  }
  return memory.current;
}

export interface MenuPlaceState {
  categoryId: string | null;
  setCategoryId(id: string | null): void;
  query: string;
  setQuery(query: string): void;
  /** Put on the menu's element: the screen that scrolls it is found from there. */
  anchor: RefObject<HTMLElement | null>;
}

/** The menu's category and search, kept in the till's memory and with the scroll restored. */
export function useMenuPlaceState(
  orderId: string | undefined,
  categoryIds: readonly string[],
): MenuPlaceState {
  const memory = useContext(MenuMemoryContext);
  const start = placeFor(memory, orderId);
  // A category taken off the menu since is no place to come back to.
  const kept = start?.categoryId ?? null;
  const [categoryId, setCategoryId] = useState(
    kept !== null && categoryIds.includes(kept) ? kept : null,
  );
  const [query, setQuery] = useState(start?.query ?? "");
  const anchor = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (memory !== null) memory.current = { ...memory.current, categoryId, query };
  }, [memory, categoryId, query]);
  useLayoutEffect(() => {
    const root = anchor.current?.closest<HTMLElement>("[data-scroll-root]") ?? null;
    if (root !== null && memory !== null && memory.current.scrollTop > 0) {
      root.scrollTop = memory.current.scrollTop;
    }
    return () => {
      if (root !== null && memory !== null) {
        memory.current = { ...memory.current, scrollTop: root.scrollTop };
      }
    };
  }, [memory]);
  return { categoryId, setCategoryId, query, setQuery, anchor };
}
