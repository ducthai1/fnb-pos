#!/usr/bin/env bash
# Installs a release made by `pnpm release:pack`:
#   install-release.sh [--no-start] fnb-<id>.tar.gz     (its .sha256 file beside it)
#
# --no-start is for the very first install: the service units and the API's environment file
# do not exist yet (they are copied from this release), so it stops after switching `current`.
#
# 1. checks the tarball's checksum, extracts it to releases/<id>, checks every file's sum
# 2. installs the production dependencies
# 3. backs the database up, then runs the migrations
# 4. switches `current` to the release in one rename and restarts the services
# 5. asks /health; when it never answers, switches back to the previous release and exits 1
# 6. keeps the newest FNB_KEEP_RELEASES releases (default 5)
#
# Run as the user that owns /srv/fnb (fnb); root-only steps go through FNB_SUDO.
# The variables that let a test run it without root are listed in release-common.sh, and
# FNB_BACKUP_COMMAND / FNB_PROVISION_COMMAND are the two steps that talk to the database.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=release-common.sh
. "${HERE}/release-common.sh"
hold_release_lock

FNB_KEEP_RELEASES="${FNB_KEEP_RELEASES:-5}"
# The backup runs as the backup user from the release that is live now; the migrations run
# as the database admin from the release being installed. Each reads its own env file.
FNB_BACKUP_COMMAND="${FNB_BACKUP_COMMAND:-${FNB_SUDO} -u fnbbackup bash -c 'set -a; . /etc/fnb/backup.env; set +a; ${FNB_PNPM} -s ops:backup'}"
FNB_PROVISION_COMMAND="${FNB_PROVISION_COMMAND:-${FNB_SUDO} bash -c 'set -a; . /etc/fnb/admin.env; set +a; ${FNB_PNPM} db:provision'}"

START=1
if [ "${1:-}" = "--no-start" ]; then
  START=0
  shift
fi
[ "$#" -eq 1 ] || die "usage: install-release.sh [--no-start] fnb-<id>.tar.gz"
TARBALL="$1"
[ -f "${TARBALL}" ] || die "no such file: ${TARBALL}"
[ -f "${TARBALL}.sha256" ] || die "missing ${TARBALL}.sha256 (it is made with the tarball)"

log "checking ${TARBALL}"
(cd "$(dirname "${TARBALL}")" && sha256sum --check --quiet "$(basename "${TARBALL}").sha256") \
  || die "the tarball does not match its checksum: not installing"

mkdir -p "${FNB_RELEASES_DIR}"
INCOMING="${FNB_RELEASES_DIR}/.incoming.$$"
trap 'rm -rf "${INCOMING}"' EXIT
mkdir "${INCOMING}"
tar -xzf "${TARBALL}" -C "${INCOMING}"
(cd "${INCOMING}" && sha256sum --check --quiet SHA256SUMS) \
  || die "a file in the tarball does not match SHA256SUMS: not installing"
RELEASE="$(tr -d '\n' < "${INCOMING}/RELEASE_ID")"
[ -n "${RELEASE}" ] || die "the tarball has no RELEASE_ID"
PREVIOUS="$(current_release)"
[ "${RELEASE}" != "${PREVIOUS}" ] || die "release ${RELEASE} is the one running now"
rm -rf "${FNB_RELEASES_DIR:?}/${RELEASE}"
mv "${INCOMING}" "${FNB_RELEASES_DIR}/${RELEASE}"
DIR="${FNB_RELEASES_DIR}/${RELEASE}"
log "extracted release ${RELEASE}"

log "installing production dependencies"
(cd "${DIR}" && ${FNB_PNPM} install --frozen-lockfile --prod) || die "dependency install failed; nothing changed"

if [ -n "${PREVIOUS}" ]; then
  log "backing up the database"
  (cd "${FNB_CURRENT_LINK}" && sh -c "${FNB_BACKUP_COMMAND}") \
    || die "the backup failed; nothing changed. Fix it before updating"
else
  log "first release on this server: no backup to take"
fi

log "running migrations"
(cd "${DIR}" && sh -c "${FNB_PROVISION_COMMAND}") \
  || die "the migrations failed; the previous release is still running. See infra/README.md section 12"

log "switching to ${RELEASE}"
switch_to "${RELEASE}"
if [ "${START}" -eq 0 ]; then
  log "release ${RELEASE} is in place; the services were not started (--no-start)"
  exit 0
fi
restart_units || log "warning: restarting the units reported an error"
if ! wait_healthy; then
  log "release ${RELEASE} did not answer ${FNB_HEALTH_URL}"
  if [ -n "${PREVIOUS}" ]; then
    switch_to "${PREVIOUS}"
    restart_units || log "warning: restarting the units reported an error"
    if migrations_of "${RELEASE}" > /dev/null 2>&1 && migrations_of "${PREVIOUS}" > /dev/null 2>&1; then
      ADDED="$(comm -23 <(migrations_of "${RELEASE}") <(migrations_of "${PREVIOUS}") | tr '\n' ' ')"
      [ -z "${ADDED}" ] || log "note: ${PREVIOUS} now runs on a database that also has: ${ADDED}"
    fi
    # Out of the release list, so a later rollback with no id never picks the release that
    # just failed; kept on disk for its logs and files.
    FAILED="${FNB_RELEASES_DIR}/.failed-${RELEASE}-$(date +%Y%m%d%H%M%S)"
    mv "${DIR}" "${FAILED}"
    log "the failed release is kept at ${FAILED}; delete it once looked at"
    die "switched back to ${PREVIOUS}"
  fi
  die "there is no previous release to go back to"
fi
log "release ${RELEASE} is up"

# Keep the newest FNB_KEEP_RELEASES; the live one and the one before it always stay.
KEPT=0
while IFS= read -r name; do
  [ -n "${name}" ] || continue
  KEPT=$((KEPT + 1))
  if [ "${KEPT}" -gt "${FNB_KEEP_RELEASES}" ] && [ "${name}" != "${RELEASE}" ] && [ "${name}" != "${PREVIOUS}" ]; then
    log "removing old release ${name}"
    rm -rf "${FNB_RELEASES_DIR:?}/${name}"
  fi
done < <(releases_newest_first)
