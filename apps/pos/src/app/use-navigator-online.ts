import { useSyncExternalStore } from "react";

const subscribe = (changed: () => void) => {
  window.addEventListener("online", changed);
  window.addEventListener("offline", changed);
  return () => {
    window.removeEventListener("online", changed);
    window.removeEventListener("offline", changed);
  };
};

/**
 * Whether the device says it has a network. True does not mean the API answers (a call
 * still finds that out); false is certain, so a screen can say so before trying.
 */
export function useNavigatorOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
