#!/bin/bash

# Check if docker image is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <docker-image-url>"
    echo "Example: $0 gcr.io/apigee-microgateway/edgemicro:3.3.10"
    exit 1
fi

DOCKER_IMAGE="$1"

# Import helpers
source ./testhelper.sh
source ./testEMG.sh

# Configuration
proxyNamePrefix="edgemicro_"
proxyTargetUrl="http://mocktarget.apigee.net/json"

EMG_CONFIG_DIR="$HOME/.edgemicro"
EMG_CONFIG_FILE="$HOME/.edgemicro/$MOCHA_ORG-$MOCHA_ENV-config.yaml"

PRODUCT_NAME="edgemicro_product_docker_sanity"
PROXY_NAME="edgemicro_proxy_docker_sanity"
PROXY_NAME_QUOTA="edgemicro_proxy_docker_sanity"
DEVELOPER_NAME="edgemicro_dev_docker_sanity_$$"
DEVELOPER_APP_NAME="edgemicro_dev_app_docker_sanity_$$"

TIMESTAMP=`date "+%Y-%m-%d-%H"`
LOGFILE="DockerSanityTestLog.$TIMESTAMP"

RED=`tput setaf 1`
GREEN=`tput setaf 2`
NC=`tput sgr0`

STATUS_PASS_STR="Status: ${GREEN}PASS${NC}"
STATUS_FAIL_STR="Status: ${RED}FAIL${NC}"

# Set the EDGEMICRO CLI tool path
EDGEMICRO="node ../cli/edgemicro"
LOCAL_REPOSITORY_TESTING=$(pwd)

initEMG() {
  local result=0
  logInfo "Initialize EMG (Custom)"
  mkdir -p "$EMG_CONFIG_DIR"
  $EDGEMICRO init > initEMG.txt 2>&1
  result=$?
  if [ $result -eq 0 ]; then
       logInfo "Initialize EMG with status $result"
  else
       logError "Failed to initialize EMG. Output:"
       cat initEMG.txt >> "$LOGFILE"
       cat initEMG.txt >&2
  fi
  rm -f initEMG.txt
  return $result
}

configureEMG() {
  local result=0
  logInfo "Configure EMG (Custom)"
  $EDGEMICRO configure -o $MOCHA_ORG -e $MOCHA_ENV -u $MOCHA_USER -t $MOCHA_BEARER_TOKEN > edgemicro.configure.txt 2>&1
  result=$?
  if [ $result -eq 0 ]; then
       if [ ! -f $EMG_CONFIG_FILE ]; then
            result=1
            logError "Failed to configure EMG and creation of $EMG_CONFIG_FILE"
       else
            logInfo "Successfully configured EMG with status $result"
       fi
  else
       logError "Failed to configure EMG. Output:"
       cat edgemicro.configure.txt >> "$LOGFILE"
       cat edgemicro.configure.txt >&2
  fi
  return $result
}

testApiProxyWithAuthToken() {
     local result=0
     local ret=0

     logInfo "Test Auth Token (Overridden)"
     apiKeysJson=$(getDeveloperApiKey "${DEVELOPER_NAME}" "${DEVELOPER_APP_NAME}")
     consumerKey=$(echo "$apiKeysJson" | jq -r '.consumerKey')
     consumerSecret=$(echo "$apiKeysJson" | jq -r '.consumerSecret')
     TOKEN=$(getAuthToken "$consumerKey" "$consumerSecret")
     
     curl -q -s http://localhost:8000/v1/${PROXY_NAME} -H "Authorization: Bearer $TOKEN" -D headers.txt -o proxy_response.txt ; ret=$?
     result=$(grep HTTP headers.txt | cut -d ' ' -f2)
     if [ ${ret} -eq 0 -a ${result} -eq 200 ]; then
          logInfo "Successfully tested API Proxy using auth token with code $result"
     else
          logError "Failed to test API Proxy using auth token with code $result"
          logError "--- API Error Response ---" >&2
          cat proxy_response.txt >&2
          logError "--------------------------" >&2
          ret=1
     fi

     rm -f headers.txt proxy_response.txt

     return $ret
}

# Let's restore the actual startEMGDocker with parsing key/secret
startEMGDocker() {
  local image=$1
  logInfo "Start EMG in Docker: $image"

  # We need the key and secret to run EMG. Since edgemicro configure prints them, we save them to edgemicro.configure.txt during configureEMG.
  # Let's read them from edgemicro.configure.txt before deleting it.
  # So in configureEMG, we shouldn't delete edgemicro.configure.txt immediately.
  # Let's verify startEMGDocker reads from edgemicro.configure.txt.
  EMG_KEY=$(cat edgemicro.configure.txt | grep "key:" | cut -d ' ' -f8)
  EMG_SECRET=$(cat edgemicro.configure.txt | grep "secret:" | cut -d ' ' -f8)
  if [ -z "$EMG_KEY" ] || [ -z "$EMG_SECRET" ]; then
     logError "Failed to retrieve emg key and secret from edgemicro.configure.txt"
     return 1
  fi

  if [ ! -f "$EMG_CONFIG_FILE" ]; then
     logError "Failed to locate EMG config file $EMG_CONFIG_FILE"
     return 1
  fi

  # Base64 encode the config
  if [[ "$OSTYPE" == "darwin"* ]]; then
     EMG_CONFIG_BASE64=$(cat "$EMG_CONFIG_FILE" | base64)
  else
     EMG_CONFIG_BASE64=$(cat "$EMG_CONFIG_FILE" | base64 -w 0)
  fi
  # Strip newlines
  EMG_CONFIG_BASE64=$(echo "$EMG_CONFIG_BASE64" | tr -d '\n' | tr -d '\r')

  logInfo "Running: docker run -p 8000:8000 -d --name edgemicro_sanity_test ..."
  docker run -d --name edgemicro_sanity_test \
    -p 8000:8000 \
    -e EDGEMICRO_ORG="$MOCHA_ORG" \
    -e EDGEMICRO_ENV="$MOCHA_ENV" \
    -e EDGEMICRO_KEY="$EMG_KEY" \
    -e EDGEMICRO_SECRET="$EMG_SECRET" \
    -e EDGEMICRO_CONFIG="$EMG_CONFIG_BASE64" \
    -e SERVICE_NAME=default \
    -e EDGEMICRO_PROCESSES=2 \
    "$image" > docker_run.log 2>&1

  local result=$?
  if [ $result -ne 0 ]; then
     logError "Failed to start docker container"
     cat docker_run.log
     return 1
  fi

  logInfo "Waiting 15s for EMG to start inside docker container..."
  sleep 15

  # Check logs to see if it booted successfully
  docker logs edgemicro_sanity_test > edgemicro_docker.logs 2>&1
  cat edgemicro_docker.logs | grep "PROCESS PID" > /dev/null 2>&1
  result=$?
  if [ $result -eq 0 ]; then
       logInfo "Successfully started EMG in Docker"
       return 0
  else
       logError "EMG inside Docker did not output PROCESS PID. Logs:"
       cat edgemicro_docker.logs
       return 1
  fi
}

stopEMGDocker() {
  logInfo "Stopping and removing EMG docker container..."
  logInfo "=== CONTAINER LOGS ==="
  docker logs edgemicro_sanity_test >> "$LOGFILE" 2>&1
  logInfo "======================"
  docker stop edgemicro_sanity_test > /dev/null 2>&1
  docker rm edgemicro_sanity_test > /dev/null 2>&1
  rm -f edgemicro_docker.logs docker_run.log edgemicro.configure.txt
  return 0
}

cleanDanglingResources() {
  logInfo "Cleaning up dangling developers and apps..."
  local devs
  devs=$(curl -s -H "Authorization: Bearer $MOCHA_BEARER_TOKEN" \
    "https://api.enterprise.apigee.com/v1/organizations/${MOCHA_ORG}/developers" 2>/dev/null)
  
  if [ -z "$devs" ] || [[ "$devs" != "["* ]]; then
      return 0
  fi

  for dev_email in $(echo "$devs" | jq -r '.[]' | grep "^edgemicro_dev_docker_sanity_"); do
      logInfo "Deleting dangling developer: $dev_email"
      
      local apps
      apps=$(curl -s -H "Authorization: Bearer $MOCHA_BEARER_TOKEN" \
        "https://api.enterprise.apigee.com/v1/organizations/${MOCHA_ORG}/developers/${dev_email}/apps" 2>/dev/null)
      
      if [ -n "$apps" ] && [[ "$apps" == "["* ]]; then
          for app_name in $(echo "$apps" | jq -r '.[]'); do
              logInfo "Deleting dangling developer app: $app_name for $dev_email"
              curl -s -X DELETE -H "Authorization: Bearer $MOCHA_BEARER_TOKEN" \
                "https://api.enterprise.apigee.com/v1/organizations/${MOCHA_ORG}/developers/${dev_email}/apps/${app_name}" >/dev/null 2>&1
          done
      fi
      
      curl -s -X DELETE -H "Authorization: Bearer $MOCHA_BEARER_TOKEN" \
        "https://api.enterprise.apigee.com/v1/organizations/${MOCHA_ORG}/developers/${dev_email}" >/dev/null 2>&1
  done
}

teardown() {
  echo "Tearing down and cleaning up resources..."
  stopEMGDocker
  cleanUp
  
  deleteDeveloperApp ${DEVELOPER_NAME} ${DEVELOPER_APP_NAME} >/dev/null 2>&1
  deleteAPIProduct ${PRODUCT_NAME} >/dev/null 2>&1
  undeployAPIProxy ${PROXY_NAME} ${MOCHA_ENV} ${proxyBundleVersion} >/dev/null 2>&1
  deleteAPIProxy ${PROXY_NAME} >/dev/null 2>&1
  deleteDeveloper ${DEVELOPER_NAME} >/dev/null 2>&1
  cleanDanglingResources

  rm -f "${DEVELOPER_APP_NAME}.json"
  rm -f "${PRODUCT_NAME}.json"
  rm -f "${PROXY_NAME}.zip"
}

main() {
  local result=0
  local ret=0
  local testCount=0
  local testPassCount=0
  local testFailCount=0

  # Check required environment variables
  if [ -z "$MOCHA_USER" ] || [ -z "$MOCHA_PASSWORD" ] || [ -z "$MOCHA_ORG" ] || [ -z "$MOCHA_ENV" ]; then
       echo "MOCHA_USER, MOCHA_PASSWORD, MOCHA_ORG, and MOCHA_ENV must be set"
       exit 1
  fi

  echo "Starting EMG Docker Sanity Test Suite against image: $DOCKER_IMAGE"
  echo "Clean up previous state..."
  teardown

  # 1. Provisioning Resources on Control Plane
  echo "Provisioning resources on Apigee Edge..."
  
  createAPIProxy ${PROXY_NAME}; ret=$?
  if [ $ret -ne 0 ]; then echo "Failed to create API Proxy"; teardown; exit 1; fi

  createAPIProxyBundle ${PROXY_NAME}; ret=$?
  if [ $ret -ne 0 ]; then echo "Failed to bundle API Proxy"; teardown; exit 1; fi

  updateAPIProxy ${PROXY_NAME} ${PROXY_NAME}.zip ${proxyBundleVersion}; ret=$?
  if [ $ret -ne 0 ]; then echo "Failed to upload API Proxy bundle"; teardown; exit 1; fi

  deployAPIProxy ${PROXY_NAME} ${MOCHA_ENV} ${proxyBundleVersion}; ret=$?
  if [ $ret -ne 0 ]; then echo "Failed to deploy API Proxy"; teardown; exit 1; fi

  createAPIProduct ${PRODUCT_NAME} ${PROXY_NAME} "edgemicro-auth"; ret=$?
  if [ $ret -ne 0 ]; then echo "Failed to create API Product"; teardown; exit 1; fi

  createDeveloper ${DEVELOPER_NAME}; ret=$?
  if [ $ret -ne 0 ]; then echo "Failed to create Developer"; teardown; exit 1; fi

  createDeveloperApp ${DEVELOPER_NAME} ${DEVELOPER_APP_NAME} ${PRODUCT_NAME}; ret=$?
  if [ $ret -ne 0 ]; then echo "Failed to create Developer App"; teardown; exit 1; fi

  echo "Waiting 45s for Apigee Edge Control Plane propagation..."
  sleep 45

  # 2. Config generation
  initEMG; ret=$?
  if [ $ret -ne 0 ]; then echo "Failed to init EMG config"; teardown; exit 1; fi

  configureEMG; ret=$?
  if [ $ret -ne 0 ]; then echo "Failed to configure EMG"; teardown; exit 1; fi

  # Enable Quota plugin locally before base64 encoding it for the container
  node setYamlVars ${EMG_CONFIG_FILE} 'edgemicro.plugins.sequence[1]' 'quota' > tmp_emg_file.yaml
  cp tmp_emg_file.yaml ${EMG_CONFIG_FILE}
  rm -f tmp_emg_file.yaml

  # 3. Start EMG in Docker
  testCount=`expr $testCount + 1`
  echo "$testCount) startEMG_in_docker"
  startEMGDocker "$DOCKER_IMAGE"; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`

       # 4. Happy Path API Key Test
       testCount=`expr $testCount + 1`
       echo "$testCount) testAPIProxy_with_apikey"
       testAPIProxy; ret=$?
       if [ $ret -eq 0 ]; then
            echo "$STATUS_PASS_STR"
            testPassCount=`expr $testPassCount + 1`
       else
            echo "$STATUS_FAIL_STR"
            result=1
            testFailCount=`expr $testFailCount + 1`
       fi

       # 5. Invalid API Key Test
       testCount=`expr $testCount + 1`
       echo "$testCount) testInvalidAPIKey"
       testInvalidAPIKey; ret=$?
       if [ $ret -eq 0 ]; then
            echo "$STATUS_PASS_STR"
            testPassCount=`expr $testPassCount + 1`
       else
            echo "$STATUS_FAIL_STR"
            result=1
            testFailCount=`expr $testFailCount + 1`
       fi

       # 6. OAuth Token Test
       testCount=`expr $testCount + 1`
       echo "$testCount) testAuthToken"
       testAuthToken; ret=$?
       if [ $ret -eq 0 ]; then
            echo "$STATUS_PASS_STR"
            testPassCount=`expr $testPassCount + 1`
       else
            echo "$STATUS_FAIL_STR"
            result=1
            testFailCount=`expr $testFailCount + 1`
       fi

       # 7. Happy Path API Proxy with Bearer Token Test
       testCount=`expr $testCount + 1`
       echo "$testCount) testApiProxyWithAuthToken"
       echo "Waiting 30s for OAuth token metadata synchronization..."
       sleep 30
       testApiProxyWithAuthToken; ret=$?
       if [ $ret -eq 0 ]; then
            echo "$STATUS_PASS_STR"
            testPassCount=`expr $testPassCount + 1`
       else
            echo "$STATUS_FAIL_STR"
            result=1
            testFailCount=`expr $testFailCount + 1`
       fi

       # 8. Quota Enforcement Test
       testCount=`expr $testCount + 1`
       echo "$testCount) testQuota"
       testQuota; ret=$?
       if [ $ret -eq 0 ]; then
            echo "$STATUS_PASS_STR"
            testPassCount=`expr $testPassCount + 1`
       else
            echo "$STATUS_FAIL_STR"
            result=1
            testFailCount=`expr $testFailCount + 1`
       fi

       # 9. Graceful Shutdown (SIGTERM) Test
       testCount=`expr $testCount + 1`
       echo "$testCount) graceful_shutdown_sigterm"
       docker kill --signal=SIGTERM edgemicro_sanity_test > /dev/null 2>&1
       exit_code=$(docker wait edgemicro_sanity_test)
       if [ "$exit_code" -eq 143 ]; then
            echo "$STATUS_PASS_STR"
            testPassCount=`expr $testPassCount + 1`
       else
            echo "$STATUS_FAIL_STR (exit code $exit_code)"
            result=1
            testFailCount=`expr $testFailCount + 1`
       fi
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  teardown

  echo
  echo "$testCount tests, $testPassCount passed, $testFailCount failed"
  exit $result
}

main "$@"
