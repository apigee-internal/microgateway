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
#MOCHA_ENV=test

proxyNamePrefix="edgemicro_"
proxyTargetUrl="http://mocktarget.apigee.net/json"

EMG_CONFIG_DIR="$HOME/.edgemicro"
EMG_CONFIG_FILE="$HOME/.edgemicro/$MOCHA_ORG-$MOCHA_ENV-config.yaml"

PRODUCT_NAME="edgemicro_product_pr"
PROXY_NAME="edgemicro_proxy_pr"
DEVELOPER_NAME="edgemicro_dev_pr"
DEVELOPER_APP_NAME="edgemicro_dev_app_pr"

EDGEMICRO=$(which edgemicro || echo edgemicro)

TIMESTAMP=`date "+%Y-%m-%d-%H"`
LOGFILE="PullRequestTestLog.$TIMESTAMP"

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

  let testSkipCount="$testCount - ($testPassCount + $testFailCount)"
  echo "$testCount tests, $testPassCount passed, $testFailCount failed, $testSkipCount skipped"

  exit $result

}

main $@

