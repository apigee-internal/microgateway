#!/usr/bin/env bash
#
# Unified Test Framework, Self-Healing Fixture Manager, Readiness Poller,
# and DRY Assertion Library for Edge Microgateway Functional Tests.
#

TEST_FUNC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${TEST_FUNC_DIR}/.." && pwd)"

export MOCHA_ORG="${MOCHA_ORG:-connectors-test2}"
export MOCHA_ENV="${MOCHA_ENV:-test}"

export PROXY_NAME="${PROXY_NAME:-edgemicro_ci_proxy}"
export PROXY_NAME_QUOTA="${PROXY_NAME_QUOTA:-edgemicro_ci_proxy_quota}"
export PRODUCT_NAME="${PRODUCT_NAME:-edgemicro_ci_product}"
export PRODUCT_NAME_QUOTA="${PRODUCT_NAME_QUOTA:-edgemicro_ci_product_quota}"
export DEVELOPER_NAME="${DEVELOPER_NAME:-edgemicro_ci_dev}"
export DEVELOPER_APP_NAME="${DEVELOPER_APP_NAME:-edgemicro_ci_dev_app}"
export proxyTargetUrl="${proxyTargetUrl:-http://mocktarget.apigee.net/json}"
export proxyBundleVersion="1"

API_PRODUCT_URL="https://api.enterprise.apigee.com/v1/o"
API_PROXY_URL="https://api.enterprise.apigee.com/v1/organizations"
CURL="curl -q -s"

export EMG_WORK_DIR="${EMG_WORK_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/emg-functional.XXXXXX")}"
export EMG_CONFIG_DIR="${EMG_CONFIG_DIR:-${HOME}/.edgemicro}"
export FUNCTIONAL_SPONGE_XML="${FUNCTIONAL_SPONGE_XML:-${REPO_ROOT}/test-reports/functional_tests_sponge_log.xml}"

export CACHED_CONSUMER_KEY=""
export CACHED_CONSUMER_SECRET=""
export CACHED_ACCESS_TOKEN=""
export FIXTURE_WAS_MUTATED=0

logError() {
  echo -e "[ERROR]: $*" >> "${LOGFILE:-/dev/null}"
  echo -e "[ERROR]: $*" >&2
}

logInfo() {
  echo -e "[INFO]: $*" >> "${LOGFILE:-/dev/null}"
}

logWarn() {
  echo -e "[WARN]: $*" >> "${LOGFILE:-/dev/null}"
}

# ==============================================================================
# 1. Mode Resolution & Auto OAuth2 Bearer Token Minting
# ==============================================================================

resolve_edgemicro_mode() {
  local mode_arg="${1:-}"
  local filter_arg="${2:-}"

  # Ensure Node 20+ is active if available in NVM
  local current_major
  current_major=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo "0")
  if [ "${current_major}" -lt 20 ] && [ -d "${HOME}/.nvm/versions/node" ]; then
    local nvm_v20
    nvm_v20=$(ls -d "${HOME}/.nvm/versions/node/v20"* 2>/dev/null | sort -V | tail -n 1)
    if [ -n "${nvm_v20}" ] && [ -d "${nvm_v20}/bin" ]; then
      export PATH="${nvm_v20}/bin:${PATH}"
    fi
  fi

  # Ensure NODE_OPTIONS is compatible with the current Node.js OpenSSL build
  if ! node -e "process.exit(0)" >/dev/null 2>&1; then
    export NODE_OPTIONS="${NODE_OPTIONS//--openssl-legacy-provider/}"
  elif NODE_OPTIONS="${NODE_OPTIONS:-} --openssl-legacy-provider" node -e "process.exit(0)" >/dev/null 2>&1; then
    case " ${NODE_OPTIONS:-} " in
      *" --openssl-legacy-provider "*) ;;
      *) export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--openssl-legacy-provider" ;;
    esac
  fi

  if [ -n "${filter_arg}" ]; then
    export EMG_TEST_FILTER="${filter_arg}"
  fi

  local effective_mode="${mode_arg:-${EMG_TEST_MODE:-branch}}"
  case "${effective_mode}" in
    branch|local|1)
      export EMG_TEST_MODE="branch"
      export EDGEMICRO="node ${REPO_ROOT}/cli/edgemicro"
      ;;
    master|pack)
      export EMG_TEST_MODE="master"
      export EDGEMICRO="$(command -v edgemicro 2>/dev/null || echo edgemicro)"
      ;;
    npm|public|release)
      export EMG_TEST_MODE="npm"
      export EMG_NPM_VERSION="${EMG_NPM_VERSION:-latest}"
      export EDGEMICRO="$(command -v edgemicro 2>/dev/null || echo edgemicro)"
      ;;
    npm:*)
      export EMG_TEST_MODE="npm"
      export EMG_NPM_VERSION="${effective_mode#npm:}"
      export EDGEMICRO="$(command -v edgemicro 2>/dev/null || echo edgemicro)"
      ;;
    docker:*)
      export EMG_TEST_MODE="docker"
      export EMG_DOCKER_IMAGE="${effective_mode#docker:}"
      export EDGEMICRO="node ${REPO_ROOT}/cli/edgemicro"
      ;;
    *)
      # Argument is a test name filter (e.g. `./NightlyTests.sh testQuota`)
      export EMG_TEST_FILTER="${effective_mode}"
      export EMG_TEST_MODE="${EMG_TEST_MODE:-branch}"
      if [ "${EMG_TEST_MODE}" = "branch" ]; then
        export EDGEMICRO="node ${REPO_ROOT}/cli/edgemicro"
      else
        export EDGEMICRO="$(command -v edgemicro 2>/dev/null || echo edgemicro)"
      fi
      ;;
  esac

  echo "=========================================================="
  echo "EMG Functional Test Mode : ${EMG_TEST_MODE}${EMG_NPM_VERSION:+ (edgemicro@${EMG_NPM_VERSION})}"
  echo "EMG CLI Invocation       : ${EDGEMICRO}"
  echo "Target Apigee Org / Env  : ${MOCHA_ORG} / ${MOCHA_ENV}"
  if [ -n "${EMG_TEST_FILTER:-}" ]; then
    echo "Active Test Filter       : ${EMG_TEST_FILTER}"
  fi
  echo "=========================================================="
}

ensure_apigee_bearer_token() {
  if [ -n "${MOCHA_BEARER_TOKEN:-}" ]; then
    return 0
  fi
  if [ -z "${MOCHA_USER:-}" ] || [ -z "${MOCHA_PASSWORD:-}" ]; then
    echo "ERROR: Set MOCHA_USER and MOCHA_PASSWORD (or MOCHA_BEARER_TOKEN)" >&2
    return 1
  fi

  echo "Minting Apigee OAuth2 Bearer Token for ${MOCHA_USER}..."
  local token_resp
  token_resp=$(curl -s -X POST "https://login.apigee.com/oauth/token" \
    -H "Authorization: Basic ZWRnZWNsaTplZGdlY2xpc2VjcmV0" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "username=${MOCHA_USER}" \
    --data-urlencode "password=${MOCHA_PASSWORD}" \
    --data-urlencode "grant_type=password")

  export MOCHA_BEARER_TOKEN=$(echo "${token_resp}" | jq -r '.access_token // empty')
  if [ -z "${MOCHA_BEARER_TOKEN}" ] || [ "${MOCHA_BEARER_TOKEN}" = "null" ]; then
    echo "ERROR: Failed to mint OAuth2 Bearer token from login.apigee.com" >&2
    return 1
  fi
  return 0
}

# ==============================================================================
# 2. Deterministic Readiness & Process Helpers (Zero Hardcoded Sleeps)
# ==============================================================================

safe_kill_edgemicro() {
  local pid cmdline
  for pid in $(pgrep -x node 2>/dev/null || true); do
    [ "$pid" -le 1 ] 2>/dev/null && continue
    cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
    if [[ "$cmdline" == *"edgemicro"* ]] || [[ "$cmdline" == *"start-agent.js"* ]]; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done

  local elapsed=0
  while [ $elapsed -lt 2000 ]; do
    local still_running=0
    for pid in $(pgrep -x node 2>/dev/null || true); do
      [ "$pid" -le 1 ] 2>/dev/null && continue
      cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
      if [[ "$cmdline" == *"edgemicro"* ]] || [[ "$cmdline" == *"start-agent.js"* ]]; then
        still_running=1
        break
      fi
    done
    [ $still_running -eq 0 ] && break
    sleep 0.05
    elapsed=$((elapsed + 50))
  done

  for pid in $(pgrep -x node 2>/dev/null || true); do
    [ "$pid" -le 1 ] 2>/dev/null && continue
    cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
    if [[ "$cmdline" == *"edgemicro"* ]] || [[ "$cmdline" == *"start-agent.js"* ]]; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done

  rm -f "${HOME}/.edgemicro/edgemicro.sock" "${HOME}/.edgemicro/edgemicro.pid" edgemicro.sock 2>/dev/null || true
  return 0
}

wait_for_port_open() {
  local port="${1:-8000}"
  local timeout_ms="${2:-15000}"
  local elapsed=0 code
  while [ $elapsed -lt "$timeout_ms" ]; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 1 --max-time 2 "http://127.0.0.1:${port}/" 2>/dev/null || echo "000")
    if [ "$code" != "000" ] && [ -n "$code" ]; then
      return 0
    fi
    sleep 0.1
    elapsed=$((elapsed + 100))
  done
  return 1
}

wait_for_port_closed() {
  local port="${1:-8000}"
  local timeout_ms="${2:-10000}"
  local elapsed=0 code
  while [ $elapsed -lt "$timeout_ms" ]; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 1 --max-time 1 "http://127.0.0.1:${port}/" 2>/dev/null || echo "000")
    [ "$code" = "000" ] && return 0
    sleep 0.1
    elapsed=$((elapsed + 100))
  done
  return 1
}

wait_for_log_pattern() {
  local file="$1" pattern="$2" timeout_ms="${3:-8000}" elapsed=0
  while [ $elapsed -lt "$timeout_ms" ]; do
    if [ -f "$file" ] && grep -a -q "$pattern" "$file" 2>/dev/null; then
      return 0
    fi
    sleep 0.05
    elapsed=$((elapsed + 50))
  done
  return 1
}

wait_for_log_count() {
  local file="$1" pattern="$2" expected_count="$3" timeout_ms="${4:-15000}" elapsed=0 current_count=0
  while [ $elapsed -lt "$timeout_ms" ]; do
    if [ -f "$file" ]; then
      current_count=$(grep -a -c "$pattern" "$file" 2>/dev/null || true)
      if [ "${current_count:-0}" -ge "$expected_count" ]; then
        return 0
      fi
    fi
    sleep 0.05
    elapsed=$((elapsed + 50))
  done
  return 1
}

reloadMicrogatewayNow() {
  emg_ensure_keys || return 1
  local prev_reloads=0
  if [ -f edgemicro.logs ]; then
    prev_reloads=$(grep -a -c "Reload completed" edgemicro.logs 2>/dev/null || true)
  fi

  local reload_cmd=("$EDGEMICRO" reload -o "${MOCHA_ORG}" -e "${MOCHA_ENV}" -k "${EMG_KEY}" -s "${EMG_SECRET}")
  if [ "${EMG_TEST_MODE:-}" = "docker" ]; then
    docker exec edgemicro_sanity_test edgemicro reload -o "${MOCHA_ORG}" -e "${MOCHA_ENV}" -k "${EMG_KEY}" -s "${EMG_SECRET}" > /dev/null 2>&1 || {
      logError "Failed to reload EMG inside Docker container"
      return 1
    }
  else
    $EDGEMICRO reload -o "${MOCHA_ORG}" -e "${MOCHA_ENV}" -k "${EMG_KEY}" -s "${EMG_SECRET}" > /dev/null 2>&1 || {
      logError "Failed to reload EMG"
      return 1
    }
  fi

  wait_for_log_count "edgemicro.logs" "Reload completed" $(( ${prev_reloads:-0} + 1 )) 10000 || true
  wait_for_port_open 8000 5000 || true
  return 0
}

# ==============================================================================
# 3. Self-Healing Persistent Apigee Cloud Fixtures (`ensureApigeeFixtures`)
# ==============================================================================

createAPIProxyBundle() {
  local apiProxyName="$1"
  local proxyPrefix="edgemicro_proxy"
  local bundle_dir="${EMG_WORK_DIR}/apiproxy"

  rm -rf "${bundle_dir}" "${EMG_WORK_DIR}/${apiProxyName}.zip"
  mkdir -p "${bundle_dir}"
  cp -rf templates/apiproxy_template/* "${bundle_dir}/"
  sed "s,${proxyPrefix},${apiProxyName},g" "templates/apiproxy_template/${proxyPrefix}.xml" > "${bundle_dir}/${apiProxyName}.xml"
  rm -f "${bundle_dir}/${proxyPrefix}.xml"
  sed "s,${proxyPrefix},${apiProxyName},g" "templates/apiproxy_template/proxies/default.xml" > "${bundle_dir}/proxies/default.xml"
  sed "s,TARGET_URL,${proxyTargetUrl},g" "templates/apiproxy_template/targets/default.xml" > "${bundle_dir}/targets/default.xml"
  (cd "${EMG_WORK_DIR}" && zip -q -r "${apiProxyName}.zip" apiproxy/)
  rm -rf "${bundle_dir}"
  [ -f "${EMG_WORK_DIR}/${apiProxyName}.zip" ]
}

ensure_proxy_deployed() {
  local proxy_name="$1"
  local deploy_url="${API_PROXY_URL}/${MOCHA_ORG}/environments/${MOCHA_ENV}/apis/${proxy_name}/deployments"
  local tmp_body="${EMG_WORK_DIR}/deploy_check_${proxy_name}.json"
  local http_code

  http_code=$(curl -s -o "$tmp_body" -w "%{http_code}" \
    -H "Authorization: Bearer ${MOCHA_BEARER_TOKEN}" "$deploy_url" 2>/dev/null || echo "000")

  if [ "$http_code" = "200" ] && grep -q '"state"[[:space:]]*:[[:space:]]*"deployed"' "$tmp_body" 2>/dev/null; then
    logInfo "Fixture proxy '${proxy_name}' is already deployed (fast path)"
    return 0
  fi

  logInfo "Self-healing fixture proxy '${proxy_name}'..."
  FIXTURE_WAS_MUTATED=1

  local proxy_check_code
  proxy_check_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${MOCHA_BEARER_TOKEN}" "${API_PROXY_URL}/${MOCHA_ORG}/apis/${proxy_name}" 2>/dev/null || echo "000")

  if [ "$proxy_check_code" != "200" ]; then
    curl -s -o /dev/null -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${MOCHA_BEARER_TOKEN}" \
      -d "{\"name\":\"${proxy_name}\"}" \
      "${API_PROXY_URL}/${MOCHA_ORG}/apis" || return 1
  fi

  createAPIProxyBundle "$proxy_name" || return 1
  curl -s -o /dev/null -X POST \
    -H "Content-Type: multipart/form-data" \
    -H "Authorization: Bearer ${MOCHA_BEARER_TOKEN}" \
    -F "file=@${EMG_WORK_DIR}/${proxy_name}.zip" \
    "${API_PROXY_URL}/${MOCHA_ORG}/apis/${proxy_name}/revisions/${proxyBundleVersion}" || return 1

  curl -s -o /dev/null -X POST \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "Authorization: Bearer ${MOCHA_BEARER_TOKEN}" \
    "${API_PROXY_URL}/${MOCHA_ORG}/environments/${MOCHA_ENV}/apis/${proxy_name}/revisions/${proxyBundleVersion}/deployments" || return 1
  return 0
}

ensure_product_exists() {
  local product_name="$1" proxy_name="$2" enable_quota="$3"
  local product_url="${API_PRODUCT_URL}/${MOCHA_ORG}/apiproducts/${product_name}"
  local tmp_body="${EMG_WORK_DIR}/product_check_${product_name}.json"
  local http_code

  http_code=$(curl -s -o "$tmp_body" -w "%{http_code}" \
    -H "Authorization: Bearer ${MOCHA_BEARER_TOKEN}" "$product_url" 2>/dev/null || echo "000")

  if [ "$http_code" = "200" ] && grep -q "\"${proxy_name}\"" "$tmp_body" 2>/dev/null && grep -q '"edgemicro-auth"' "$tmp_body" 2>/dev/null; then
    if [ "$enable_quota" = "true" ] && grep -q '"quota"[[:space:]]*:[[:space:]]*"3"' "$tmp_body" 2>/dev/null; then
      return 0
    elif [ "$enable_quota" != "true" ] && ! grep -q '"quota"[[:space:]]*:[[:space:]]*"3"' "$tmp_body" 2>/dev/null; then
      return 0
    fi
  fi

  logInfo "Self-healing fixture product '${product_name}'..."
  FIXTURE_WAS_MUTATED=1

  local payload_file="${EMG_WORK_DIR}/product_payload_${product_name}.json"
  if [ "$enable_quota" = "true" ]; then
    cat > "$payload_file" <<EOF
{"apiResources":[],"approvalType":"auto","attributes":[{"name":"access","value":"public"}],"description":"EMG CI Quota Product","displayName":"${product_name}","name":"${product_name}","scopes":[],"proxies":["${proxy_name}","edgemicro-auth"],"environments":["${MOCHA_ENV}"],"quota":"3","quotaInterval":"1","quotaTimeUnit":"minute"}
EOF
  else
    cat > "$payload_file" <<EOF
{"apiResources":[],"approvalType":"auto","attributes":[{"name":"access","value":"public"}],"description":"EMG CI Standard Product","displayName":"${product_name}","name":"${product_name}","scopes":[],"proxies":["${proxy_name}","edgemicro-auth"],"environments":["${MOCHA_ENV}"]}
EOF
  fi

  local method="POST" target_url="${API_PRODUCT_URL}/${MOCHA_ORG}/apiproducts"
  if [ "$http_code" = "200" ]; then
    method="PUT"
    target_url="${product_url}"
  fi

  local write_code
  write_code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${MOCHA_BEARER_TOKEN}" \
    -d @"$payload_file" "$target_url" 2>/dev/null || echo "000")
  [ "$write_code" = "200" ] || [ "$write_code" = "201" ]
}

ensure_developer_and_app() {
  local dev_name="$1" app_name="$2" prod_std="$3" prod_quota="$4"
  local dev_url="${API_PROXY_URL}/${MOCHA_ORG}/developers/${dev_name}@google.com"
  local app_url="${dev_url}/apps/${app_name}"
  local tmp_body="${EMG_WORK_DIR}/app_check.json"

  local dev_code
  dev_code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${MOCHA_BEARER_TOKEN}" "$dev_url" 2>/dev/null || echo "000")
  if [ "$dev_code" != "200" ]; then
    FIXTURE_WAS_MUTATED=1
    curl -s -o /dev/null -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${MOCHA_BEARER_TOKEN}" \
      -d "{\"email\":\"${dev_name}@google.com\",\"firstName\":\"EMG\",\"lastName\":\"CI\",\"userName\":\"${dev_name}\"}" \
      "${API_PROXY_URL}/${MOCHA_ORG}/developers" || return 1
  fi

  local app_code
  app_code=$(curl -s -o "$tmp_body" -w "%{http_code}" -H "Authorization: Bearer ${MOCHA_BEARER_TOKEN}" "$app_url" 2>/dev/null || echo "000")
  if [ "$app_code" = "200" ] && grep -q "\"${prod_std}\"" "$tmp_body" 2>/dev/null && grep -q "\"${prod_quota}\"" "$tmp_body" 2>/dev/null; then
    export CACHED_CONSUMER_KEY=$(jq -r '.credentials[0].consumerKey // empty' "$tmp_body")
    export CACHED_CONSUMER_SECRET=$(jq -r '.credentials[0].consumerSecret // empty' "$tmp_body")
    if [ -n "$CACHED_CONSUMER_KEY" ] && [ -n "$CACHED_CONSUMER_SECRET" ]; then
      return 0
    fi
  fi

  FIXTURE_WAS_MUTATED=1
  if [ "$app_code" = "200" ]; then
    curl -s -o /dev/null -X DELETE -H "Authorization: Bearer ${MOCHA_BEARER_TOKEN}" "$app_url" || true
  fi

  local create_code
  create_code=$(curl -s -o "$tmp_body" -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${MOCHA_BEARER_TOKEN}" \
    -d "{\"name\":\"${app_name}\",\"apiProducts\":[\"${prod_std}\",\"${prod_quota}\"],\"attributes\":[{\"name\":\"DisplayName\",\"value\":\"${app_name}\"}]}" \
    "${dev_url}/apps" 2>/dev/null || echo "000")

  if [ "$create_code" = "200" ] || [ "$create_code" = "201" ]; then
    export CACHED_CONSUMER_KEY=$(jq -r '.credentials[0].consumerKey // empty' "$tmp_body")
    export CACHED_CONSUMER_SECRET=$(jq -r '.credentials[0].consumerSecret // empty' "$tmp_body")
    [ -n "$CACHED_CONSUMER_KEY" ] && [ -n "$CACHED_CONSUMER_SECRET" ] && return 0
  fi
  return 1
}

ensureApigeeFixtures() {
  FIXTURE_WAS_MUTATED=0
  ensure_proxy_deployed "$PROXY_NAME" || return 1
  ensure_proxy_deployed "$PROXY_NAME_QUOTA" || return 1
  ensure_product_exists "$PRODUCT_NAME" "$PROXY_NAME" "false" || return 1
  ensure_product_exists "$PRODUCT_NAME_QUOTA" "$PROXY_NAME_QUOTA" "true" || return 1
  ensure_developer_and_app "$DEVELOPER_NAME" "$DEVELOPER_APP_NAME" "$PRODUCT_NAME" "$PRODUCT_NAME_QUOTA" || return 1

  if [ "$FIXTURE_WAS_MUTATED" -eq 1 ]; then
    logInfo "Fixtures self-healed; polling edgemicro-auth/token readiness..."
    local elapsed=0 tok=""
    while [ $elapsed -lt 30000 ]; do
      CACHED_ACCESS_TOKEN=""
      tok=$(getAuthToken "$CACHED_CONSUMER_KEY" "$CACHED_CONSUMER_SECRET" 2>/dev/null || true)
      if [ -n "$tok" ] && [ "$tok" != "null" ]; then
        break
      fi
      sleep 1
      elapsed=$((elapsed + 1000))
    done
  fi
  return 0
}

getDeveloperApiKey() {
  if [ -n "${CACHED_CONSUMER_KEY:-}" ] && [ -n "${CACHED_CONSUMER_SECRET:-}" ]; then
    printf '{"consumerKey":"%s","consumerSecret":"%s"}\n' "${CACHED_CONSUMER_KEY}" "${CACHED_CONSUMER_SECRET}"
    return 0
  fi
  ensure_developer_and_app "${1:-$DEVELOPER_NAME}" "${2:-$DEVELOPER_APP_NAME}" "$PRODUCT_NAME" "$PRODUCT_NAME_QUOTA" || return 1
  printf '{"consumerKey":"%s","consumerSecret":"%s"}\n' "${CACHED_CONSUMER_KEY}" "${CACHED_CONSUMER_SECRET}"
}

getAuthToken() {
  if [ -n "${CACHED_ACCESS_TOKEN:-}" ]; then
    echo "${CACHED_ACCESS_TOKEN}"
    return 0
  fi
  local clientId="$1" clientSecret="$2"
  local resp_file="${EMG_WORK_DIR}/auth_token_resp.json"
  local code
  code=$(curl -s -o "$resp_file" -w "%{http_code}" -X POST \
    "https://${MOCHA_ORG}-${MOCHA_ENV}.apigee.net/edgemicro-auth/token" \
    -H "Content-Type: application/json" \
    -d "{\"client_id\":\"${clientId}\",\"client_secret\":\"${clientSecret}\",\"grant_type\":\"client_credentials\"}" 2>/dev/null || echo "000")
  if [ "$code" = "200" ]; then
    export CACHED_ACCESS_TOKEN=$(jq -r '.access_token // empty' "$resp_file")
    echo "${CACHED_ACCESS_TOKEN}"
    return 0
  fi
  return 1
}

# ==============================================================================
# 4. KISS & DRY Test Primitives & Runner
# ==============================================================================

emg_ensure_keys() {
  if [ -z "${EMG_KEY:-}" ] || [ -z "${EMG_SECRET:-}" ]; then
    [ -f edgemicro.configure.txt ] || return 1
    export EMG_KEY=$(grep "key:" edgemicro.configure.txt | awk '{print $NF}')
    export EMG_SECRET=$(grep "secret:" edgemicro.configure.txt | awk '{print $NF}')
  fi
  [ -n "${EMG_KEY:-}" ] && [ -n "${EMG_SECRET:-}" ]
}

emg_ensure_consumer_creds() {
  if [ -z "${CACHED_CONSUMER_KEY:-}" ] || [ -z "${CACHED_CONSUMER_SECRET:-}" ]; then
    getDeveloperApiKey "${DEVELOPER_NAME}" "${DEVELOPER_APP_NAME}" >/dev/null
  fi
  [ -n "${CACHED_CONSUMER_KEY:-}" ]
}

emg_config_reload() {
  [ -f "${EMG_CONFIG_FILE}" ] || return 1
  local tmp_yaml="${EMG_WORK_DIR}/tmp_emg_config.yaml"
  node setYamlVars "${EMG_CONFIG_FILE}" "$@" > "${tmp_yaml}" &&
  cp "${tmp_yaml}" "${EMG_CONFIG_FILE}" &&
  reloadMicrogatewayNow
}

assert_proxy_status() {
  local expected="$1" proxy_path="$2"
  shift 2
  local resp_file="${EMG_WORK_DIR}/last_proxy_response.txt" actual
  actual=$(curl -q -s -o "${resp_file}" -w "%{http_code}" "http://localhost:8000/v1/${proxy_path}" "$@" 2>/dev/null || echo "000")
  if [ "${actual}" = "${expected}" ]; then
    return 0
  fi
  logError "Expected HTTP ${expected} for /v1/${proxy_path}, got ${actual}"
  return 1
}

emg_active_log_file() {
  [ -f edgemicro.logs ] && grep -a "logging to" edgemicro.logs | tail -n 1 | awk '{print $NF}'
}

emg_reset_log() {
  local lf
  lf=$(emg_active_log_file)
  [ -n "${lf}" ] && [ -f "${lf}" ] && : > "${lf}"
}

assert_log_has() {
  local pattern="$1" secondary="${2:-}" timeout_ms="${3:-5000}" lf
  lf=$(emg_active_log_file)
  [ -n "${lf}" ] && [ -f "${lf}" ] || return 1
  wait_for_log_pattern "${lf}" "${pattern}" "${timeout_ms}" || return 1
  if [ -n "${secondary}" ]; then
    local matched_lines
    matched_lines=$(grep -a "${pattern}" "${lf}" 2>/dev/null || true)
    [[ "${matched_lines}" == *"${secondary}"* ]] || return 1
  fi
  return 0
}

assert_log_lacks() {
  local pattern="$1" lf
  lf=$(emg_active_log_file)
  [ -z "${lf}" ] || [ ! -f "${lf}" ] && return 0
  sleep 0.15
  ! grep -a -F -q "${pattern}" "${lf}" 2>/dev/null
}

cleanup_test_harness() {
  if declare -F removeZookeeperBlocklist >/dev/null 2>&1; then
    removeZookeeperBlocklist >/dev/null 2>&1 || true
  fi
  safe_kill_edgemicro >/dev/null 2>&1 || true
  rm -rf "${EMG_WORK_DIR}" 2>/dev/null || true
  rm -f "${TEST_FUNC_DIR}/headers.txt" "${TEST_FUNC_DIR}/proxy_response.txt" \
        "${TEST_FUNC_DIR}/tmp_emg_file.yaml" "${TEST_FUNC_DIR}/edgemicro.sock" 2>/dev/null || true
}

xml_escape() {
  local s="$1"
  s="${s//&/&amp;}"; s="${s//</&lt;}"; s="${s//>/&gt;}"; s="${s//\"/&quot;}"; s="${s//\'/&apos;}"
  printf '%s' "$s"
}

declare -a XML_TESTCASES=()
export HARNESS_TOTAL=0 HARNESS_PASSED=0 HARNESS_FAILED=0 HARNESS_SKIPPED=0 HARNESS_RESULT=0 HARNESS_START_MS=0

init_test_harness() {
  HARNESS_TOTAL=0; HARNESS_PASSED=0; HARNESS_FAILED=0; HARNESS_SKIPPED=0; HARNESS_RESULT=0
  HARNESS_START_MS=$(date +%s%3N)
  XML_TESTCASES=()
  mkdir -p "${EMG_WORK_DIR}" "$(dirname "${FUNCTIONAL_SPONGE_XML}")"
  trap cleanup_test_harness EXIT SIGINT SIGTERM
}

run_test() {
  local test_fn="$1"
  shift
  local start_ms end_ms elapsed_ms elapsed_sec ret=0

  HARNESS_TOTAL=$((HARNESS_TOTAL + 1))
  echo
  echo "${HARNESS_TOTAL}) ${test_fn}"

  start_ms=$(date +%s%3N)
  "${test_fn}" "$@"
  ret=$?
  end_ms=$(date +%s%3N)
  elapsed_ms=$((end_ms - start_ms))
  elapsed_sec=$(awk "BEGIN {printf \"%.3f\", ${elapsed_ms}/1000}")

  local escaped_name
  escaped_name=$(xml_escape "${test_fn}")

  if [ $ret -eq 0 ]; then
    echo "${STATUS_PASS_STR} (${elapsed_ms}ms)"
    HARNESS_PASSED=$((HARNESS_PASSED + 1))
    XML_TESTCASES+=("  <testcase classname=\"edgemicro.functional.${EMG_TEST_MODE}\" name=\"${escaped_name}\" time=\"${elapsed_sec}\"/>")
  else
    echo "${STATUS_FAIL_STR} (${elapsed_ms}ms)"
    HARNESS_FAILED=$((HARNESS_FAILED + 1))
    HARNESS_RESULT=1
    XML_TESTCASES+=("  <testcase classname=\"edgemicro.functional.${EMG_TEST_MODE}\" name=\"${escaped_name}\" time=\"${elapsed_sec}\"><failure message=\"Test failed: ${escaped_name} (exit code ${ret})\"/></testcase>")
  fi
  return $ret
}

run_test_suite() {
  local fn
  for fn in "$@"; do
    if [ -n "${EMG_TEST_FILTER:-}" ] && [[ "${fn}" != *"${EMG_TEST_FILTER}"* ]]; then
      continue
    fi
    run_test "${fn}" || true
  done
}

write_sponge_xml() {
  local end_ms total_ms total_sec
  end_ms=$(date +%s%3N)
  total_ms=$((end_ms - HARNESS_START_MS))
  total_sec=$(awk "BEGIN {printf \"%.3f\", ${total_ms}/1000}")
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo "<testsuite name=\"edgemicro_functional_${EMG_TEST_MODE}_suite\" tests=\"${HARNESS_TOTAL}\" failures=\"${HARNESS_FAILED}\" errors=\"0\" skipped=\"${HARNESS_SKIPPED}\" time=\"${total_sec}\">"
    for tc in "${XML_TESTCASES[@]}"; do
      echo "$tc"
    done
    echo '</testsuite>'
  } > "${FUNCTIONAL_SPONGE_XML}"
}