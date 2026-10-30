/**
 * Request header of a till naming its build: a whole number that only ever grows from one
 * build to the next (the commit time in seconds, stamped by the POS build). A server given a
 * minimum refuses a till whose build is below it. A till that sends none (a build from before
 * this header) is let through: it cannot be told apart from one that does not understand the
 * refusal, so the server keeps taking the build just before this one.
 */
export const POS_BUILD_HEADER = "x-fnb-pos-build";

/** The answer of a sync endpoint to a till below the server's minimum build. */
export const POS_RELEASE_TOO_OLD_STATUS = 426;
export const POS_RELEASE_TOO_OLD_CODE = "API_POS_RELEASE_TOO_OLD";
