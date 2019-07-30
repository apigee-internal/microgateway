#
# Author: dkoroth@google.com
#

function cleanUp() {

  killall node > /dev/null 2>&1
  rm -f edgemicro.sock
  rm -f edgemicro.logs
  rm -f edgemicro.configure.txt
  rm -f verifyEMG.txt
  rm -f tmp_emg_file.yaml
  rm -rf $EMG_CONFIG_DIR
  return 0

}

function installEMG() {

  local result=0

  logInfo "Install EMG"
  local usingLocalRepository=$1

  if [ -x "$(which edgemicro)" ]; then
    if [ -z "$usingLocalRepository" ]; then
        EDGEMICRO=$(which edgemicro)
        result=$?
        logInfo "EMG is already installed. Skip installation step"
    else
        result=0
        logInfo "EMG being run from local repository"
    fi
  else
    npm install -g edgemicro > installEMG.txt 2>&1
    result=$?
    logInfo "Install EMG with status $status"
    if [ -z "$usingLocalRepository" ]; then
        EDGEMICRO=$(which edgemicro)
    fi
    rm -f installEMG.txt
  fi

  echo $EDGEMICRO

  return $result
}

function checkEMGVersion() {

  local result=0

  $EDGEMICRO --version > emgVersion.txt
  result=$?

  if [ $result -eq 0 ]; then
       emgVersion=$(cat emgVersion.txt | grep 'current edgemicro version is' | cut -d ' ' -f5)
       nodejsVersion=$(cat emgVersion.txt | grep 'current nodejs version is' | cut -d ' ' -f5)
       logInfo "EMG version is $emgVersion and Nodejs version is $nodejsVersion"
  else
       logError "Failed to retrieve EMG version"
  fi

  rm -f emgVersion.txt

  return $result

}

function initEMG() {

  local result=0

  logInfo "Initialize EMG"

  mkdir -p $EMG_CONFIG_DIR

  $EDGEMICRO init > initEMG.txt
  result=$?

  if [ $result -eq 0 ]; then
       logInfo "Initialize EMG with status $result"
  else
       logError "Failed to initialize EMG"
  fi

  sleep 5

  rm -f initEMG.txt

  return $result

}

configureEMG() {

  local result=0

  logInfo "Configure EMG"

  $EDGEMICRO configure -o $MOCHA_ORG -e $MOCHA_ENV -u $MOCHA_USER -p $MOCHA_PASSWORD > edgemicro.configure.txt
  result=$?

  if [ $result -eq 0 ]; then
       if [ ! -f $EMG_CONFIG_FILE ];
       then
           result=1
           logError "Failed to configure EMG and creation of $EMG_CONFIG_FILE"
       else
           logInfo "Successfully configured EMG with status $result"
       fi
  else
       logError "Failed to configure EMG with status $result"
  fi

  sleep 5

  return $result
}

verifyEMG() {

  local result=0

  logInfo "Verifying EMG configuration"

  if [ ! -f edgemicro.configure.txt ]; then
     result=1
     logError "Failed to verify EMG configuration edgemicro.configure.txt"
     return $result
  fi 

  EMG_KEY=$(cat edgemicro.configure.txt | grep "key:" | cut -d ' ' -f4)
  EMG_SECRET=$(cat edgemicro.configure.txt | grep "secret:" | cut -d ' ' -f4)
  if [ -z $EMG_KEY -o -z $EMG_SECRET ]; then
     result=1
     logError "Failed to retrieve emg key and secret from edgemicro.configure.txt"
     return $result
  fi

  $EDGEMICRO verify -o $MOCHA_ORG -e $MOCHA_ENV -k $EMG_KEY -s $EMG_SECRET > verifyEMG.txt 2>&1
  result=$?
  if [ $result -ne 0 ]; then
       logError "Failed to verify configure of EMG with status $result"
  else
       cat verifyEMG.txt | grep "verification complete" > /dev/null 2>&1
       result=$?
       if [ $result -eq 0 ]; then
            logInfo "Successfully verifed EMG configuration with status $result"
       else
            logError "Failed to verify configure of EMG with status $result"
       fi
  fi

  rm -f verifyEMG.txt

  return $result

}

startEMG() {

  local result=0
  local catLog=$1

  logInfo "Start EMG"

  EMG_KEY=$(cat edgemicro.configure.txt | grep "key:" | cut -d ' ' -f4)
  EMG_SECRET=$(cat edgemicro.configure.txt | grep "secret:" | cut -d ' ' -f4)
  if [ -z $EMG_KEY -o -z $EMG_SECRET ]; then
     result=1
     logError "Failed to retrieve emg key and secret from edgemicro.configure.txt"
     return $result
  fi

  $EDGEMICRO start -o $MOCHA_ORG -e $MOCHA_ENV -k $EMG_KEY -s $EMG_SECRET -p 1 > edgemicro.logs 2>&1 &
  result=$?
  if [ $result -ne 0 ]; then
       logError "Failed to start EMG with status $result"
       if [ ! -z $catLog ]; then
           set -x
           echo $catLog
           cat edgemicro.logs
           set +x
       fi
  else
       sleep 5
       cat edgemicro.logs | grep "PROCESS PID" > /dev/null 2>&1
       result=$?
       if [ $result -eq 0 ]; then
            logInfo "Successfully started EMG with status $result"
       else
            logError "Failed to start EMG with status $result"
            set -x
            echo $catLog
            cat edgemicro.logs
            set +x
       fi
  fi

  return $result

}

configAndReloadEMG() {

  local result=0

  logInfo "Configure and Reload EMG"

  if [ ! -f $EMG_CONFIG_FILE ];
  then
     result=1
     logError "Failed to locate EMG configure file $EMG_CONFIG_FILE"
     return $result
  fi

  #
  node setYamlVars ${EMG_CONFIG_FILE} 'edgemicro.config_change_poll_interval' 10 'oauth.allowNoAuthorization' false 'edgemicro.plugins.sequence[1]' 'quota' > tmp_emg_file.yaml
  cp tmp_emg_file.yaml ${EMG_CONFIG_FILE}

  EMG_KEY=$(cat edgemicro.configure.txt | grep "key:" | cut -d ' ' -f4)
  EMG_SECRET=$(cat edgemicro.configure.txt | grep "secret:" | cut -d ' ' -f4)
  if [ -z $EMG_KEY -o -z $EMG_SECRET ]; then
     result=1
     logError "Failed to retrieve emg key and secret from edgemicro.configure.txt"
     return $result
  fi

  $EDGEMICRO reload -o $MOCHA_ORG -e $MOCHA_ENV -k $EMG_KEY -s $EMG_SECRET > /dev/null 2>&1
  result=$?
  if [ $result -ne 0 ]; then
       logError "Failed to reload EMG with status $result"
  else
       logInfo "Successfully reloaded EMG with status $result"
  fi

  sleep 10

  return $result

}

setProductNameFilter() {

  local result=0

  logInfo "SetProductName Filter"

  node setYamlVars ${EMG_CONFIG_FILE} 'edge_config.products' "https://${MOCHA_ORG}-${MOCHA_ENV}.apigee.net/edgemicro-auth/products?productnamefilter=.*$PRODUCT_NAME.*" > tmp_emg_file.yaml
  cp tmp_emg_file.yaml ${EMG_CONFIG_FILE}

  EMG_KEY=$(cat edgemicro.configure.txt | grep "key:" | cut -d ' ' -f4)
  EMG_SECRET=$(cat edgemicro.configure.txt | grep "secret:" | cut -d ' ' -f4)
  if [ -z $EMG_KEY -o -z $EMG_SECRET ]; then
     result=1
     logError "Failed to retrieve emg key and secret from edgemicro.configure.txt"
     return $result
  fi

  $EDGEMICRO reload -o $MOCHA_ORG -e $MOCHA_ENV -k $EMG_KEY -s $EMG_SECRET > /dev/null 2>&1
  result=$?
  if [ $result -ne 0 ]; then
       logError "Failed to set product name filter with status $result"
  else
       logInfo "Successfully set product name filter with status $result"
  fi

  return $result

}

testAPIProxy() {

  local result=0
  local ret=0

  logInfo "Test API Proxy"

  apiKey=$(getDeveloperApiKey ${DEVELOPER_NAME} ${DEVELOPER_APP_NAME})
  curl -q -s http://localhost:8000/v1/${PROXY_NAME} -H "x-api-key: $apiKey" -D headers.txt > /dev/null 2>&1 ; ret=$?
  result=$(grep HTTP headers.txt | cut -d ' ' -f2)
  if [ ${ret} -eq 0 -a ${result} -eq 200 ]; then
       logInfo "Successfully tested API Proxy with code $result"
  else
       logError "Failed to test API Proxy with code $result"
       ret=1
  fi

  rm -f headers.txt

  return $ret

}

testQuota() {

  local result=0
  local ret=0

#set -x

  logInfo "Test Quota"

  apiKey=$(getDeveloperApiKey ${DEVELOPER_NAME} ${DEVELOPER_APP_NAME})

  counter=1
  while [ $counter -le 10 ]
  do
    curl -q -s http://localhost:8000/v1/${PROXY_NAME} -H "x-api-key: $apiKey" -D headers.txt > /dev/null 2>&1 ; ret=$?
    #echo $counter
    echo '+'
    ((counter++))
  done
  result=$(grep HTTP headers.txt | cut -d ' ' -f2)
  if [ ${ret} -eq 0 -a ${result} -eq 403 ]; then
       logInfo "Successfully tested quota with code $result"
  else
       logError "Failed to test quota with code $result"
       ret=1
  fi

#set +x

  return $ret

}

testInvalidAPIKey() {

  local result=0

  logInfo "Test Invalid API Key"

  apiKey="API KEY INVALID TO BE BLOCKED"
  curl -q -s http://localhost:8000/v1/${PROXY_NAME} -H "x-api-key: $apiKey" -D headers.txt > /dev/null 2>&1 ; ret=$?
  result=$(grep HTTP headers.txt | cut -d ' ' -f2)
  if [ ${ret} -eq 0 -a ${result} -eq 403 ]; then
       logInfo "Successfully tested invalid API Key with code $result"
  else
       logError "Failed to test invalid API key with code $result"
       ret=1
  fi

  rm -f headers.txt

  return $ret
}

testRevokedAPIKey() {

  local result=0

  logInfo "Test Revoked API Key"

  apiKey="2UKv8QSMmi5ehtqDShRQPvXBAqEWqPIS"
  curl -q -s http://localhost:8000/v1/${PROXY_NAME} -H "x-api-key: $apiKey" -D headers.txt > /dev/null 2>&1 ; ret=$?
  result=$(grep HTTP headers.txt | cut -d ' ' -f2)
  if [ ${ret} -eq 0 -a ${result} -eq 403 ]; then
       logInfo "Successfully tested revoked API Key with code $result"
  else
       logError "Failed to test revoked API key with code $result"
       ret=1
  fi

  rm -f headers.txt

  return $ret
}

testInvalidJWT() {

  local result=0
  local ret=0

  logInfo "Test Invalid JWT"

  apiJWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
  curl -q -s http://localhost:8000/v1/${PROXY_NAME} -H "Authorization: Bearer $apiJWT" -D headers.txt > /dev/null 2>&1 ; ret=$?
  result=$(grep HTTP headers.txt | cut -d ' ' -f2)
  if [ ${ret} -eq 0 -a ${result} -eq 401 ]; then
       logInfo "Successfully tested invalid JWT with code $result"
  else
       logError "Failed to test invalid JWT with code $result"
       ret=1
  fi

  rm -f headers.txt

  return $ret

}

testExpiredJWT() {

  local result=0
  local ret=0

  logInfo "Test Expired JWT"

  apiJWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
  curl -q -s http://localhost:8000/v1/${PROXY_NAME} -H "Authorization: Bearer $apiJWT" -D headers.txt > /dev/null 2>&1 ; ret=$?
  result=$(grep HTTP headers.txt | cut -d ' ' -f2)
  if [ ${ret} -eq 0 -a ${result} -eq 401 ]; then
       logInfo "Successfully tested expired JWT with code $result"
  else
       logError "Failed to test expired JWT with code $result"
       ret=1
  fi

  rm -f headers.txt

  return $ret

}

setInvalidProductNameFilter() {

  local result=0

  logInfo "Set Invalid Product Name Filter"

  EMG_KEY=$(cat edgemicro.configure.txt | grep "key:" | cut -d ' ' -f4)
  EMG_SECRET=$(cat edgemicro.configure.txt | grep "secret:" | cut -d ' ' -f4)
  if [ -z $EMG_KEY -o -z $EMG_SECRET ]; then
     result=1
     logError "Failed to retrieve emg key and secret from edgemicro.configure.txt"
     return $result
  fi

  node setYamlVars ${EMG_CONFIG_FILE} 'edge_config.products' "https://${MOCHA_ORG}-${MOCHA_ENV}.apigee.net/edgemicro-auth/products?productnamefilter=*$PRODUCT_NAME*" > tmp_emg_file.yaml
  cp tmp_emg_file.yaml ${EMG_CONFIG_FILE}

  $EDGEMICRO reload -o $MOCHA_ORG -e $MOCHA_ENV -k $EMG_KEY -s $EMG_SECRET > /dev/null 2>&1
  result=$?
  if [ $result -ne 0 ]; then
       logError "Failed to set invalid product name filter with status $result"
  else
       logInfo "Successfully set invalid product name filter with status $result"
  fi

  return $result

}

testInvalidProductNameFilter() {

  local result=0
  local ret=0

  logInfo "Test Invalid Product Name Filter"

  apiKey=$(getDeveloperApiKey ${DEVELOPER_NAME} ${DEVELOPER_APP_NAME})

  curl -q -s http://localhost:8000/v1/${PROXY_NAME} -H "x-api-key: $apiKey" -D headers.txt > /dev/null 2>&1 ; ret=$?
  result=$(grep HTTP headers.txt | cut -d ' ' -f2)
  if [ ${ret} -eq 0 -a ${result} -eq 200 ]; then
       logInfo "Successfully tested invalid product name filter with code $result"
  else
       logError "Failed to test invalid product name filter with code $result"
       ret=1
  fi

  rm -f headers.txt

  return $ret

}

resetInvalidProductNameFilter() {

  local result=0

  logInfo "Reset Invalid Product Name Filter"

  node setYamlVars ${EMG_CONFIG_FILE} 'edge_config.products' "https://${MOCHA_ORG}-${MOCHA_ENV}.apigee.net/edgemicro-auth/products" > tmp_emg_file.yaml
  cp tmp_emg_file.yaml ${EMG_CONFIG_FILE}

  EMG_KEY=$(cat edgemicro.configure.txt | grep "key:" | cut -d ' ' -f4)
  EMG_SECRET=$(cat edgemicro.configure.txt | grep "secret:" | cut -d ' ' -f4)
  if [ -z $EMG_KEY -o -z $EMG_SECRET ]; then
     result=1
     logError "Failed to retrieve emg key and secret from edgemicro.configure.txt"
     return $result
  fi

  $EDGEMICRO reload -o $MOCHA_ORG -e $MOCHA_ENV -k $EMG_KEY -s $EMG_SECRET > /dev/null 2>&1
  result=$?
  if [ $result -ne 0 ]; then
       logError "Failed to set invalid product name filter with status $result"
  else
       logInfo "Successfully set invalid product name filter with status $result"
  fi

  return $result

}

stopEMG() {

  local result=0

  logInfo "Stop EMG"

  $EDGEMICRO stop > stopEMG.txt 2>&1
  result=$?
  if [ $result -ne 0 ]; then
       logError "Failed to stop EMG with status $result"
  else
       sleep 10
       killall node
#result=$?
       if [ $result -eq 0 ]; then
            logInfo "Successfully stopped EMG with status $result"
       else
            logError "Failed to stop EMG with status $result"
       fi
  fi

  rm -f stopEMG.txt

  return $result

}

uninstallEMG() {

  local result=0

  logInfo "Uninstall EMG"

  npm uninstall -g edgemicro > uninstallEMG.txt 2>&1
  result=$? 
  if [ $result -ne 0 ]; then
       logError "Failed to uninstall EMG with status $result"
  else
       rm -rf $EMG_CONFIG_DIR
       logInfo "Successfully uninstalled EMG with status $result"
  fi

  rm -f edgemicro.logs
  rm -f edgemicro.sock
  rm -f edgemicro.configure.txt
  rm -f headers.txt
  rm -f uninstallEMG.txt
  rm -f tmp_emg_file.yaml

  return $result

}

