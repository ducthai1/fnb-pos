# Shared by install-release.sh and rollback-release.sh (sourced, not run).
#
# Everything the scripts touch or run is named by a variable, so a test can point them at a
# temporary directory and stand-in commands, and nothing needs root:
#   FNB_BASE_DIR         where releases/<id> and the `current` link live (default /srv/fnb)
#   FNB_SUDO             prefix for commands that need root (default `sudo`; empty for none)
#   FNB_SYSTEMCTL        the systemctl command line (default "<FNB_SUDO> systemctl")
#   FNB_UNITS            units restarted after a switch (default "fnb-api fnb-backoffice")
#   FNB_PNPM, FNB_CURL   the pnpm and curl commands
#   FNB_HEALTH_URL       what must answer 200 after a switch (default the API's own /health,
#                        the same thing Caddy serves as /api/health)
#   FNB_HEALTH_TRIES, FNB_HEALTH_WAIT   how often and how many seconds apart it is asked

FNB_BASE_DIR="${FNB_BASE_DIR:-/srv/fnb}"
FNB_SUDO="${FNB_SUDO-sudo}"
FNB_SYSTEMCTL="${FNB_SYSTEMCTL:-${FNB_SUDO} systemctl}"
FNB_UNITS="${FNB_UNITS:-fnb-api fnb-backoffice}"
FNB_PNPM="${FNB_PNPM:-pnpm}"
FNB_CURL="${FNB_CURL:-curl}"
FNB_HEALTH_URL="${FNB_HEALTH_URL:-http://127.0.0.1:3000/health}"
FNB_HEALTH_TRIES="${FNB_HEALTH_TRIES:-15}"
FNB_HEALTH_WAIT="${FNB_HEALTH_WAIT:-2}"
FNB_RELEASES_DIR="${FNB_BASE_DIR}/releases"
FNB_CURRENT_LINK="${FNB_BASE_DIR}/current"

log() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# The release `current` points at, as a directory name; empty when there is none yet.
current_release() {
  if [ -L "${FNB_CURRENT_LINK}" ]; then
    basename "$(readlink "${FNB_CURRENT_LINK}")"
  fi
}

# Points `current` at release $1 in one rename, so a reader sees the old or the new, never none.
switch_to() {
  local target="${FNB_RELEASES_DIR}/$1"
  local staged="${FNB_BASE_DIR}/.current.$$"
  ln -sfn "${target}" "${staged}"
  mv -T "${staged}" "${FNB_CURRENT_LINK}"
  # A release that just went live counts as the newest, which is what "previous" and the
  # keep-five rule look at.
  touch "${target}"
}

restart_units() {
  # shellcheck disable=SC2086 # the command lines are meant to split into words
  ${FNB_SYSTEMCTL} restart ${FNB_UNITS}
}

# 0 once the health URL answers 200, 1 when it never did in FNB_HEALTH_TRIES tries.
wait_healthy() {
  local try=1
  while [ "${try}" -le "${FNB_HEALTH_TRIES}" ]; do
    # shellcheck disable=SC2086
    if ${FNB_CURL} -fsS --max-time 5 -o /dev/null "${FNB_HEALTH_URL}" 2>/dev/null; then
      return 0
    fi
    try=$((try + 1))
    [ "${try}" -le "${FNB_HEALTH_TRIES}" ] && sleep "${FNB_HEALTH_WAIT}"
  done
  return 1
}

# Migration names of a release directory, one per line, sorted; non-zero when it has no list
# (a release made before the list existed), so callers do not read "unknown" as "none".
migrations_of() {
  [ -f "${FNB_RELEASES_DIR}/$1/migrations.txt" ] || return 1
  LC_ALL=C sort "${FNB_RELEASES_DIR}/$1/migrations.txt"
}

# Release directories, newest first, leaving out the half-extracted ones.
releases_newest_first() {
  # shellcheck disable=SC2012 # names are release ids: no newlines
  ls -1t "${FNB_RELEASES_DIR}" 2>/dev/null | grep -v '^\.incoming' || true
}
