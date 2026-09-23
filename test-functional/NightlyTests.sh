#!/usr/bin/env bash
# Re-exec under bash if invoked via `sh NightlyTests.sh ...`
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

#
# Edge Microgateway Functional Test Runner
#
# Usage:
#   ./NightlyTests.sh [branch|master|npm|npm:<version>|docker:<image>] [testName]
#
# Examples:
#   ./NightlyTests.sh                                           # Default: 'branch' mode (tests current repo code)
#   ./NightlyTests.sh master                                    # 'master' mode (npm pack + global install from repo)
#   ./NightlyTests.sh npm                                       # 'npm' mode (npm install -g edgemicro@latest)
#   ./NightlyTests.sh npm:3.3.3                                 # 'npm' mode for a specific published version
#   ./NightlyTests.sh docker:gcr.io/apigee-microgateway/edgemicro:3.3.11  # 'docker' mode (runs full suite + SIGTERM check in container)
#   ./NightlyTests.sh testQuota                                 # Run a single test case against current branch code
#   ./NightlyTests.sh npm testZookeeperDowntimeResilience       # Run a single test case against published npm release
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

source ./testhelper.sh
source ./testEMG.sh

EMG_CONFIG_DIR="$HOME/.edgemicro"
EMG_CONFIG_FILE="$HOME/.edgemicro/$MOCHA_ORG-$MOCHA_ENV-config.yaml"

resolve_edgemicro_mode "${1:-}" "${2:-}"

TIMESTAMP=$(date "+%Y-%m-%d-%H")
LOGFILE="${EMG_WORK_DIR}/NightlyTestLog.${TIMESTAMP}"

if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
  RED=$(tput setaf 1 2>/dev/null || true)
  GREEN=$(tput setaf 2 2>/dev/null || true)
  NC=$(tput sgr0 2>/dev/null || true)
else
  RED=""; GREEN=""; NC=""
fi

STATUS_PASS_STR="Status: ${GREEN}PASS${NC}"
STATUS_FAIL_STR="Status: ${RED}FAIL${NC}"

# 1. Suite Setup Lifecycle
LIFECYCLE_SETUP=(
  ensureApigeeFixtures
  installEMG
  checkEMGVersion
  initEMG
  configureEMG
  verifyEMG
  startEMG
)

# 2. Self-Contained Functional Test Cases (Arrange -> Act -> Assert -> Restore)
FUNCTIONAL_TESTS=(
  # Auth, OAuth2 JWT & Quota Enforcement
  testAPIProxy
  testQuota
  testAuthToken
  testApiProxyWithAuthToken
  testInvalidAPIKey
  testInvalidAPIKeyWithUpstreamResp
  testInvalidAPIKeyWithUpstreamRespFalse
  testRevokedAPIKey
  testInvalidJWT
  testExpiredJWT

  # Observability, Structured Logging & Stack Trace
  testLogFileCreated
  testInvalidApiKeyEventLog
  testInfoLogs
  testDebugLogs
  testTraceEventLog
  testStackTraceConfig
  testStackTraceFalseConfig

  # Product Filter, Public URL Mode & Control-Plane (Zookeeper) Outage Resilience
  testInvalidProductNameFilter
  testPublicUrlProxy
  testZookeeperDowntimeResilience
)

# In 'docker' mode, run the entire FUNCTIONAL_TESTS suite plus container SIGTERM graceful shutdown
if [ "${EMG_TEST_MODE:-}" = "docker" ]; then
  FUNCTIONAL_TESTS+=(testDockerGracefulShutdown)
fi

# 3. Suite Teardown Lifecycle
LIFECYCLE_TEARDOWN=(
  stopEMG
  uninstallEMG
)

main() {
  ensure_apigee_bearer_token || exit 1

  init_test_harness
  cleanUp

  for fn in "${LIFECYCLE_SETUP[@]}"; do
    run_test "${fn}" || break
  done

  if [ "${HARNESS_RESULT}" -eq 0 ]; then
    run_test_suite "${FUNCTIONAL_TESTS[@]}"
  fi

  for fn in "${LIFECYCLE_TEARDOWN[@]}"; do
    run_test "${fn}" || true
  done

  write_sponge_xml

  echo
  echo "${HARNESS_TOTAL} tests, ${HARNESS_PASSED} passed, ${HARNESS_FAILED} failed, ${HARNESS_SKIPPED} skipped"
  exit "${HARNESS_RESULT}"
}

main "$@"
