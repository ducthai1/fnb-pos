/**
 * The release this page was built as: stamped into the bundle by the build (see
 * build-release.ts), "dev" when the page runs from the dev server.
 */
export const RUNNING_RELEASE: string = import.meta.env.VITE_FNB_RELEASE_ID ?? "dev";

/**
 * The build number stamped into this page (see buildNumberOf in build-release.ts), sent to
 * the server with every sync request so it can refuse a build below its minimum; none from
 * the dev server, which no deployment's minimum applies to.
 */
export const RUNNING_BUILD: number | null = (() => {
  const stamped = import.meta.env.VITE_FNB_RELEASE_BUILD;
  return typeof stamped === "string" && /^[0-9]+$/.test(stamped) ? Number(stamped) : null;
})();
