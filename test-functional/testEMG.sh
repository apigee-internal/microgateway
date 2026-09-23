#!/usr/bin/env bash
#
# Modular KISS & DRY Edge Microgateway Functional Test Cases & Lifecycle Helpers.
#
# Every `test*` function is a self-contained test case (Arrange -> Act -> Assert -> Restore)
# that encapsulates its own internal setup and state restoration, just like Mocha / JUnit / pytest.
#

cleanUp() {
  if declare -F safe_kill_edgemicro >/dev/null 2>&1; then
    safe_kill_edgemicro
  fi
  rm -f edgemicro.sock edgemicro.logs edgemicro.configure.txt verifyEMG.txt tmp_emg_file.yaml
  rm -rf "${EMG_CONFIG_DIR}"
  return 0
}

# ==============================================================================
# 1. EMG CLI & Gateway Lifecycle Test Cases / Hooks
# ==============================================================================

installEMG() {
  logInfo "Install EMG (mode=${EMG_TEST_MODE:-branch})"

  case "${EMG_TEST_MODE:-branch}" in
    branch)
      logInfo "Running EMG directly from repository source: ${EDGEMICRO}"
      return 0
      ;;
    npm)
      local pkg_spec="edgemicro@${EMG_NPM_VERSION:-latest}"
      logInfo "Installing published EMG package from npm registry (${pkg_spec})..."
      npm install -g "${pkg_spec}" > "${EMG_WORK_DIR}/installEMG.txt" 2>&1 || return 1
      export EDGEMICRO="$(command -v edgemicro 2>/dev/null || echo edgemicro)"
      return 0
      ;;
    master|*)
      logInfo "Packing and installing EMG globally from repository (${REPO_ROOT})..."
      local tarball
      tarball=$(cd "${REPO_ROOT}" && npm pack --quiet | tail -n 1)
      npm install -g "${REPO_ROOT}/${tarball}" > "${EMG_WORK_DIR}/installEMG.txt" 2>&1
      local ret=$?
      rm -f "${REPO_ROOT}/${tarball}"
      export EDGEMICRO="$(command -v edgemicro 2>/dev/null || echo edgemicro)"
      return $ret
      ;;
  esac
}

checkEMGVersion() {
  local version_out="${EMG_WORK_DIR}/emgVersion.txt"
  $EDGEMICRO --version > "${version_out}" || {
    logError "Failed to retrieve EMG version"
    return 1
  }
  local emgVersion nodejsVersion
  emgVersion=$(grep 'current edgemicro version is' "${version_out}" | awk '{print $NF}')
  nodejsVersion=$(grep 'current nodejs version is' "${version_out}" | awk '{print $NF}')
  logInfo "EMG version is ${emgVersion} and Node.js version is ${nodejsVersion}"
  return 0
}

initEMG() {
  logInfo "Initialize EMG"
  mkdir -p "${EMG_CONFIG_DIR}"
  $EDGEMICRO init > "${EMG_WORK_DIR}/initEMG.txt"
}

configureEMG() {
  logInfo "Configure EMG"
  $EDGEMICRO configure -o "${MOCHA_ORG}" -e "${MOCHA_ENV}" -u "${MOCHA_USER}" -t "${MOCHA_BEARER_TOKEN}" > edgemicro.configure.txt || return 1
  [ -f "${EMG_CONFIG_FILE}" ] && emg_ensure_keys
}

verifyEMG() {
  logInfo "Verify EMG configuration"
  emg_ensure_keys || return 1
  local verify_out="${EMG_WORK_DIR}/verifyEMG.txt"
  $EDGEMICRO verify -o "${MOCHA_ORG}" -e "${MOCHA_ENV}" -k "${EMG_KEY}" -s "${EMG_SECRET}" > "${verify_out}" 2>&1 || return 1
  grep -q "verification complete" "${verify_out}"
}

startEMG() {
  logInfo "Start EMG (mode=${EMG_TEST_MODE:-branch})"
  emg_ensure_keys || return 1

  if [ "${EMG_TEST_MODE:-}" = "docker" ]; then
    [ -n "${EMG_DOCKER_IMAGE:-}" ] || { logError "EMG_DOCKER_IMAGE is required for docker mode"; return 1; }
    chmod -R 777 "${EMG_CONFIG_DIR}" 2>/dev/null || true
    local cfg_b64
    cfg_b64=$(base64 "${EMG_CONFIG_FILE}" | tr -d '\n\r')
    docker rm -f edgemicro_sanity_test >/dev/null 2>&1 || true
    docker run -d --name edgemicro_sanity_test -p 8000:8000 \
      -v "${EMG_CONFIG_DIR}:/opt/apigee/.edgemicro" \
      -e EDGEMICRO_ORG="${MOCHA_ORG}" -e EDGEMICRO_ENV="${MOCHA_ENV}" \
      -e EDGEMICRO_KEY="${EMG_KEY}" -e EDGEMICRO_SECRET="${EMG_SECRET}" \
      -e EDGEMICRO_CONFIG="${cfg_b64}" -e SERVICE_NAME=default -e EDGEMICRO_PROCESSES=1 \
      "${EMG_DOCKER_IMAGE}" > "${EMG_WORK_DIR}/docker_run.log" 2>&1 || return 1
    docker logs -f edgemicro_sanity_test > edgemicro.logs 2>&1 &
    if wait_for_log_pattern "edgemicro.logs" "PROCESS PID" 20000 && wait_for_port_open 8000 20000; then
      setProductNameFilter && configAndReloadEMG
      return $?
    fi
    docker logs edgemicro_sanity_test >&2 || true
    return 1
  fi

  $EDGEMICRO start -o "${MOCHA_ORG}" -e "${MOCHA_ENV}" -k "${EMG_KEY}" -s "${EMG_SECRET}" -p 1 > edgemicro.logs 2>&1 &
  if wait_for_log_pattern "edgemicro.logs" "PROCESS PID" 15000 && wait_for_port_open 8000 15000; then
    setProductNameFilter && configAndReloadEMG
    return $?
  fi
  logError "Failed to start EMG within readiness timeout"
  cat edgemicro.logs >&2 || true
  return 1
}

testDockerGracefulShutdown() {
  docker kill --signal=SIGTERM edgemicro_sanity_test >/dev/null 2>&1 || return 1
  local exit_code
  exit_code=$(docker wait edgemicro_sanity_test 2>/dev/null || echo "1")
  [ "${exit_code}" -eq 143 ]
}

stopEMG() {
  logInfo "Stop EMG (mode=${EMG_TEST_MODE:-branch})"
  if [ "${EMG_TEST_MODE:-}" = "docker" ]; then
    docker rm -f edgemicro_sanity_test >/dev/null 2>&1 || true
    wait_for_port_closed 8000 5000 || true
    return 0
  fi
  $EDGEMICRO stop > "${EMG_WORK_DIR}/stopEMG.txt" 2>&1 || true
  wait_for_port_closed 8000 5000 || true
  safe_kill_edgemicro
  return 0
}

uninstallEMG() {
  logInfo "Uninstall EMG (mode=${EMG_TEST_MODE:-branch})"
  local ret=0
  if [ "${EMG_TEST_MODE:-branch}" = "master" ] || [ "${EMG_TEST_MODE:-branch}" = "npm" ]; then
    npm uninstall -g edgemicro > "${EMG_WORK_DIR}/uninstallEMG.txt" 2>&1 || ret=$?
  fi
  rm -rf "${EMG_CONFIG_DIR}"
  rm -f edgemicro.logs edgemicro.sock edgemicro.configure.txt headers.txt tmp_emg_file.yaml
  return $ret
}

# ==============================================================================
# 2. Internal Config / Network Helpers (Used inside self-contained test cases)
# ==============================================================================

setProductNameFilter() {
  emg_config_reload 'edge_config.products' "https://${MOCHA_ORG}-${MOCHA_ENV}.apigee.net/edgemicro-auth/products?productnamefilter=.*${PRODUCT_NAME}.*"
}

configAndReloadEMG() {
  emg_config_reload \
    'edgemicro.config_change_poll_interval' 10 \
    'oauth.allowNoAuthorization' false \
    'edgemicro.plugins.sequence[1]' 'quota'
}

setInvalidProductNameFilter() {
  emg_config_reload 'edge_config.products' "https://${MOCHA_ORG}-${MOCHA_ENV}.apigee.net/edgemicro-auth/products?productnamefilter=*${PRODUCT_NAME}*"
}

resetInvalidProductNameFilter() {
  emg_config_reload 'edge_config.products' "https://${MOCHA_ORG}-${MOCHA_ENV}.apigee.net/edgemicro-auth/products"
}

configAndReloadEMGForPublicUrl() {
  emg_config_reload 'oauth.allowNoAuthorization' true 'oauth.allowInvalidAuthorization' true
}

setZookeeperTrap() {
  if declare -F cleanup_test_harness >/dev/null 2>&1; then
    trap 'cleanup_test_harness' EXIT SIGINT SIGTERM
  else
    trap 'removeZookeeperBlocklist' EXIT SIGINT SIGTERM
  fi
}

unsetZookeeperTrap() {
  if declare -F cleanup_test_harness >/dev/null 2>&1; then
    trap 'cleanup_test_harness' EXIT SIGINT SIGTERM
  else
    trap - EXIT SIGINT SIGTERM
  fi
}

addZookeeperBlocklist() {
  setZookeeperTrap
  if [ -f "${EMG_CONFIG_FILE}" ]; then
    cp -f "${EMG_CONFIG_FILE}" "${EMG_CONFIG_FILE}.zk_bak"
    sed -i 's/edgemicroservices\.apigee\.net/127.0.0.1:59999/g' "${EMG_CONFIG_FILE}"
  fi
  if sudo -n true >/dev/null 2>&1; then
    if ! grep -q "127.0.0.1 edgemicroservices.apigee.net" /etc/hosts; then
      sudo -n bash -c 'echo "127.0.0.1 edgemicroservices.apigee.net" >> /etc/hosts' || true
    fi
  fi
  return 0
}

removeZookeeperBlocklist() {
  if [ -f "${EMG_CONFIG_FILE}.zk_bak" ]; then
    mv -f "${EMG_CONFIG_FILE}.zk_bak" "${EMG_CONFIG_FILE}"
  fi
  if sudo -n true >/dev/null 2>&1 && grep -q "127.0.0.1 edgemicroservices.apigee.net" /etc/hosts; then
    local tmp_hosts
    tmp_hosts=$(mktemp)
    grep -v "127.0.0.1 edgemicroservices.apigee.net" /etc/hosts > "${tmp_hosts}"
    sudo -n cp "${tmp_hosts}" /etc/hosts || true
    rm -f "${tmp_hosts}"
  fi
  unsetZookeeperTrap
  return 0
}

# ==============================================================================
# 3. Self-Contained Functional Test Cases (`test*`)
#    Each test encapsulates its own Arrange -> Act -> Assert -> Restore logic.
# ==============================================================================

testAPIProxy() {
  emg_ensure_consumer_creds || return 1
  assert_proxy_status 200 "${PROXY_NAME}" -H "x-api-key: ${CACHED_CONSUMER_KEY}"
}

testQuota() {
  emg_ensure_consumer_creds || return 1
  local counter=1
  while [ $counter -le 10 ]; do
    if [ $counter -eq 1 ]; then
      assert_proxy_status 200 "${PROXY_NAME_QUOTA}" -H "x-api-key: ${CACHED_CONSUMER_KEY}" || return 1
    elif [ $counter -eq 10 ]; then
      assert_proxy_status 403 "${PROXY_NAME_QUOTA}" -H "x-api-key: ${CACHED_CONSUMER_KEY}" || return 1
    else
      curl -q -s -o /dev/null "http://localhost:8000/v1/${PROXY_NAME_QUOTA}" -H "x-api-key: ${CACHED_CONSUMER_KEY}"
    fi
    counter=$((counter + 1))
  done
  return 0
}

testAuthToken() {
  emg_ensure_consumer_creds || return 1
  TOKEN=$(getAuthToken "${CACHED_CONSUMER_KEY}" "${CACHED_CONSUMER_SECRET}")
  [ -n "${TOKEN}" ] && [ "${TOKEN}" != "null" ]
}

testApiProxyWithAuthToken() {
  emg_ensure_consumer_creds || return 1
  TOKEN=$(getAuthToken "${CACHED_CONSUMER_KEY}" "${CACHED_CONSUMER_SECRET}")
  assert_proxy_status 200 "${PROXY_NAME}" -H "Authorization: Bearer ${TOKEN}"
}

testInvalidAPIKey() {
  assert_proxy_status 403 "${PROXY_NAME}" -H "x-api-key: API KEY INVALID TO BE BLOCKED"
}

testInvalidAPIKeyWithUpstreamResp() {
  emg_config_reload 'oauth.useUpstreamResponse' true || return 1
  local ret=0
  assert_proxy_status 401 "${PROXY_NAME}" -H "x-api-key: API KEY INVALID TO BE BLOCKED" || ret=1
  emg_config_reload 'oauth.useUpstreamResponse' false || ret=1
  return $ret
}

testInvalidAPIKeyWithUpstreamRespFalse() {
  emg_config_reload 'oauth.useUpstreamResponse' false &&
  assert_proxy_status 403 "${PROXY_NAME}" -H "x-api-key: API KEY INVALID TO BE BLOCKED"
}

testRevokedAPIKey() {
  assert_proxy_status 403 "${PROXY_NAME}" -H "x-api-key: 2UKv8QSMmi5ehtqDShRQPvXBAqEWqPIS"
}

testInvalidJWT() {
  local jwt="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
  assert_proxy_status 401 "${PROXY_NAME}" -H "Authorization: Bearer ${jwt}"
}

testExpiredJWT() {
  testInvalidJWT
}

testInvalidProductNameFilter() {
  emg_ensure_consumer_creds || return 1
  setInvalidProductNameFilter || return 1
  local ret=0
  assert_proxy_status 200 "${PROXY_NAME}" -H "x-api-key: ${CACHED_CONSUMER_KEY}" || ret=1
  resetInvalidProductNameFilter || ret=1
  return $ret
}

testPublicUrlProxy() {
  configAndReloadEMGForPublicUrl || return 1
  local ret=0
  assert_proxy_status 200 "${PROXY_NAME}" || ret=1
  configAndReloadEMG || ret=1
  return $ret
}

testZookeeperDowntimeResilience() {
  addZookeeperBlocklist || return 1
  local ret=0
  configAndReloadEMG && assert_proxy_status 200 "${PROXY_NAME}" -H "x-api-key: ${CACHED_CONSUMER_KEY}" || ret=1
  removeZookeeperBlocklist || ret=1
  return $ret
}

testLogFileCreated() {
  curl -q -s -o /dev/null "http://localhost:8000/v1/${PROXY_NAME}" -H "x-api-key: API KEY INVALID TO BE LOGGED"
  wait_for_log_pattern "edgemicro.logs" "logging to" 5000 || return 1
  local lf
  lf=$(emg_active_log_file)
  [ -n "${lf}" ] && [ -f "${lf}" ]
}

testInvalidApiKeyEventLog() {
  local invalid_key="API KEY INVALID TO BE LOGGED"
  emg_reset_log || return 1
  curl -q -s -o /dev/null "http://localhost:8000/v1/${PROXY_NAME}" -H "x-api-key: ${invalid_key}"
  assert_log_has "${invalid_key}" "[error]"
}

testInfoLogs() {
  emg_ensure_consumer_creds || return 1
  emg_reset_log || return 1
  emg_config_reload 'edgemicro.logging.level' 'info' || return 1
  assert_log_has "info" || return 1

  curl -q -s -o /dev/null "http://localhost:8000/v1/${PROXY_NAME}" -H "x-api-key: ${CACHED_CONSUMER_KEY}"
  assert_log_has "\\[info\\]" "[info]" || return 1
  assert_log_lacks "[debug]" || return 1

  curl -q -s -o /dev/null "http://localhost:8000/v1/invalidproxyFortesting" -H "x-api-key: ${CACHED_CONSUMER_KEY}"
  assert_log_lacks "[trace]"
}

testDebugLogs() {
  emg_ensure_consumer_creds || return 1
  emg_reset_log || return 1
  emg_config_reload 'edgemicro.logging.level' 'debug' 'edgemicro.maxHttpHeaderSize' 400 || return 1
  assert_log_has "debug" || return 1

  local oversized_key="${CACHED_CONSUMER_KEY}-adding-too-log-header-for-testing-$(printf '%s-' $(seq 1 9 | xargs -I{} echo "${CACHED_CONSUMER_KEY}"))"
  curl -q -s -o /dev/null "http://localhost:8000/v1/${PROXY_NAME}" -H "x-api-key: ${oversized_key}"
  assert_log_has "header length more than allowed size" "[debug]" || return 1

  curl -q -s -o /dev/null "http://localhost:8000/v1/invalidproxyFortesting" -H "x-api-key: ${CACHED_CONSUMER_KEY}"
  assert_log_lacks "[trace]"
}

testTraceEventLog() {
  emg_ensure_consumer_creds || return 1
  emg_reset_log || return 1
  emg_config_reload 'edgemicro.logging.level' 'trace' || return 1
  curl -q -s -o /dev/null "http://localhost:8000/v1/invalidproxyFortesting" -H "x-api-key: ${CACHED_CONSUMER_KEY}"
  assert_log_has "\\[trace\\]" "[trace]"
}

testStackTraceConfig() {
  emg_ensure_consumer_creds || return 1
  emg_reset_log || return 1
  emg_config_reload 'edgemicro.logging.level' 'error' 'edgemicro.logging.stack_trace' true || return 1
  curl -q -s -o /dev/null "http://localhost:8000/v1/invalidproxyFortesting" -H "x-api-key: ${CACHED_CONSUMER_KEY}"
  assert_log_has "Error:"
}

testStackTraceFalseConfig() {
  emg_ensure_consumer_creds || return 1
  emg_reset_log || return 1
  emg_config_reload 'edgemicro.logging.level' 'error' 'edgemicro.logging.stack_trace' false || return 1
  curl -q -s -o /dev/null "http://localhost:8000/v1/invalidproxyFortesting" -H "x-api-key: ${CACHED_CONSUMER_KEY}"
  assert_log_lacks "Error:"
}