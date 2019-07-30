#!/bin/sh

#
# Author: dkoroth@google.com
#

source ./testhelper.sh
source ./testEMG.sh

# Username and Password for the api.enterprise.apigee.com
#MOCHA_USER=
#MOCHA_PASSWORD=

# OrgName configured at api.enterprise.apigee.com
#MOCHA_ORG=

# Proxy environment configured at api.enterprise.apigee.com
# Default is 'test' environment
#MOCHA_ENV=

proxyNamePrefix="edgemicro_"
proxyTargetUrl="http://mocktarget.apigee.net/json"

EMG_CONFIG_DIR="$HOME/.edgemicro"
EMG_CONFIG_FILE="$HOME/.edgemicro/$MOCHA_ORG-$MOCHA_ENV-config.yaml"

PRODUCT_NAME="edgemicro_product_nightly"
PROXY_NAME="edgemicro_proxy_nightly"
DEVELOPER_NAME="edgemicro_dev_nightly"
DEVELOPER_APP_NAME="edgemicro_dev_app_nightly"

EDGEMICRO=$(which edgemicro || echo edgemicro)

TIMESTAMP=`date "+%Y-%m-%d-%H"`
LOGFILE="NightlyTestLog.$TIMESTAMP"

RED=`tput setaf 1`
GREEN=`tput setaf 2`
NC=`tput sgr0`

STATUS_PASS_STR="Status: ${GREEN}PASS${NC}"
STATUS_FAIL_STR="Status: ${RED}FAIL${NC}"

main() {

  local result=0
  local ret=0
  local testCount=0
  local testPassCount=0
  local testFailCount=0
  local testSkipCount=0

  # check MOCHA_USER is set
  if [ -z $MOCHA_USER ]; then
       echo "MOCHA_USER is not set"
       exit 1
  fi
   
  # check MOCHA_PASSWORD is set
  if [ -z $MOCHA_PASSWORD ]; then
       echo "MOCHA_PASSWORD is not set"
       exit 1
  fi

  # check MOCHA_ORG is set
  if [ -z $MOCHA_ORG ]; then
       echo "MOCHA_ORG is not set"
       exit 1
  fi

  # check MOCHA_ENV is set
  if [ -z $MOCHA_ENV ]; then
       echo "MOCHA_ENV is not set"
       exit 1
  fi

  # Cleanup all the temporary files
  cleanUp

  testCount=`expr $testCount + 1`
  echo "$testCount) listAPIProxies"
  listAPIProxies; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) createAPIProxy"
  createAPIProxy ${PROXY_NAME}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) createAPIProxyBundle"
  createAPIProxyBundle ${PROXY_NAME}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) updateAPIProxy"
  updateAPIProxy ${PROXY_NAME} ${PROXY_NAME}.zip ${proxyBundleVersion}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) deployAPIProxy"
  deployAPIProxy ${PROXY_NAME} ${MOCHA_ENV} ${proxyBundleVersion}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) listAPIProxy"
  listAPIProxy ${PROXY_NAME}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) createAPIProduct"
  cat templates/apiproduct-template.json | jq --arg proxyArr "${PROXY_NAME} edgemicro-auth" '(.proxies) = ($proxyArr|split(" ")) | .quota = 3' > ${PRODUCT_NAME}.json
  createAPIProduct ${PRODUCT_NAME}; ret=$?
  rm -f ${PRODUCT_NAME}.json
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) listAPIProduct"
  listAPIProduct ${PRODUCT_NAME}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) listDevelopers"
  listDevelopers; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) createDeveloper"
  createDeveloper ${DEVELOPER_NAME}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) listDeveloper"
  listDeveloper ${DEVELOPER_NAME}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) listDeveloperApps"
  listDeveloperApps ${DEVELOPER_NAME}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) createDeveloperApp"
  cat templates/apideveloperapp-template.json | jq --arg productArr ${PRODUCT_NAME} '(.apiProducts) = ($productArr|split(" "))' > ${DEVELOPER_APP_NAME}.json
  createDeveloperApp ${DEVELOPER_NAME} ${DEVELOPER_APP_NAME}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi
  rm -f ${DEVELOPER_APP_NAME}.json

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) listDeveloperApps"
  listDeveloperApps ${DEVELOPER_NAME}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) listDeveloperApp"
  listDeveloperApp ${DEVELOPER_NAME} ${DEVELOPER_APP_NAME}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) installEMG"
  installEMG; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) checkEMGVersion"
  checkEMGVersion; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) initEMG"
  initEMG; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) configureEMG"
  configureEMG; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) verifyEMG"
  verifyEMG; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) startEMG"
  startEMG; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) configAndReloadEMG"
  configAndReloadEMG; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) setProductNameFilter"
  setProductNameFilter; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) testAPIProxy"
  testAPIProxy; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
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

  echo
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

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) testRevokedAPIKey"
  testRevokedAPIKey; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) testInvalidJWT"
  testInvalidJWT; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) testExpiredJWT"
  testExpiredJWT; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) setInvalidProductNameFilter"
  setInvalidProductNameFilter; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) testInvalidProductNameFilter"
  testInvalidProductNameFilter; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) resetInvalidProductNameFilter"
  resetInvalidProductNameFilter; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) stopEMG"
  stopEMG; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) uninstallEMG"
  uninstallEMG; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) deleteDeveloperApp"
  deleteDeveloperApp ${DEVELOPER_NAME} ${DEVELOPER_APP_NAME}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) deleteAPIProduct"
  deleteAPIProduct ${PRODUCT_NAME}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) undeployAPIProxy"
  undeployAPIProxy ${PROXY_NAME} ${MOCHA_ENV} ${proxyBundleVersion}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi
  rm -f ${PROXY_NAME}.zip

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) deleteAPIProxy"
  deleteAPIProxy ${PROXY_NAME}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  testCount=`expr $testCount + 1`
  echo "$testCount) deleteDeveloper"
  deleteDeveloper ${DEVELOPER_NAME}; ret=$?
  if [ $ret -eq 0 ]; then
       echo "$STATUS_PASS_STR"
       testPassCount=`expr $testPassCount + 1`
  else
       echo "$STATUS_FAIL_STR"
       result=1
       testFailCount=`expr $testFailCount + 1`
  fi

  echo
  let testSkipCount="$testCount - ($testPassCount + $testFailCount)"
  echo "$testCount tests, $testPassCount passed, $testFailCount failed, $testSkipCount skipped"

  exit $result

}

main $@


