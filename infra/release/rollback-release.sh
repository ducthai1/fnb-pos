#!/usr/bin/env bash
# Switches back to an earlier release without building anything:
#   rollback-release.sh [--after-migration-i-understand] [<release-id>]
#
# With no id it goes to the release that was live before this one. It REFUSES when the
# release being left carries migrations the target does not have: the target's code may not
# run on that database. Pass --after-migration-i-understand only after reading infra/README.md
# section 12 and deciding the added migrations are safe for the older code.
# Variables that point it at other places or commands: see release-common.sh.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=release-common.sh
. "${HERE}/release-common.sh"
hold_release_lock

FORCE=0
TARGET=""
for argument in "$@"; do
  case "${argument}" in
    --after-migration-i-understand) FORCE=1 ;;
    -*) die "unknown option ${argument}" ;;
    *) [ -z "${TARGET}" ] || die "one release id at most"; TARGET="${argument}" ;;
  esac
done

LEAVING="$(current_release)"
[ -n "${LEAVING}" ] || die "no release is running (${FNB_CURRENT_LINK} is not a link)"
if [ -z "${TARGET}" ]; then
  # Newest other release: the one that was live before, since a switch makes a release newest.
  TARGET="$(releases_newest_first | grep -vxF "${LEAVING}" | head -n 1 || true)"
  [ -n "${TARGET}" ] || die "there is no other release to go back to"
fi
[ "${TARGET}" != "${LEAVING}" ] || die "${TARGET} is already the running release"
[ -d "${FNB_RELEASES_DIR}/${TARGET}" ] || die "no such release: ${TARGET}"

refuse() {
  cat >&2 <<EOF
REFUSED: $1

Going back to ${TARGET} is only safe when the database is still one its code understands.
  1. Prefer fixing forward: ship a patch release on top of ${LEAVING}.
  2. Or restore the backup that install-release.sh took before ${LEAVING} was installed
     (infra/restore-drill.md): restore into a NEW database, check it, then point the API at it.
     Everything sold since that backup is then missing: decide that with the owner.
  3. If the added migrations are additive and ${TARGET}'s code ignores them, run again with
     --after-migration-i-understand.
EOF
  exit 1
}

if [ "${FORCE}" -eq 0 ]; then
  migrations_of "${LEAVING}" > /dev/null || refuse "${LEAVING} has no migrations.txt, so what it added is unknown."
  migrations_of "${TARGET}" > /dev/null || refuse "${TARGET} has no migrations.txt, so what it can run on is unknown."
  ADDED="$(comm -23 <(migrations_of "${LEAVING}") <(migrations_of "${TARGET}") | tr '\n' ' ')"
  [ -z "${ADDED}" ] || refuse "${LEAVING} added migrations that ${TARGET} does not have: ${ADDED}"
fi

log "switching ${LEAVING} -> ${TARGET}"
switch_to "${TARGET}"
restart_units || log "warning: restarting the units reported an error"
wait_healthy || die "${TARGET} did not answer ${FNB_HEALTH_URL}; check journalctl -u fnb-api"
log "release ${TARGET} is up"
