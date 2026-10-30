import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs without globals, so Testing Library cannot unmount after each test by itself.
afterEach(cleanup);

// `findBy…` and `waitFor` wait for what the screen shows, not for a time: they return the
// moment it is there. Their default deadline is one second, which a whole-repo test run on a
// loaded machine overruns while the page is still rendering (the stations page and the home
// page each failed that way, alone green). The deadline only decides how long a screen that
// really never shows it is waited for, so it is long.
configure({ asyncUtilTimeout: 10_000 });
