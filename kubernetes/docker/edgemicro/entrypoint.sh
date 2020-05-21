#!/bin/bash

APIGEE_ROOT="/opt/apigee"
EDGEMICRO_PLUGIN_DIRECTORY="/opt/apigee/plugins"

# Log File on Server.
LOG_FILE=${APIGEE_ROOT}/logs/edgemicro.log
echo "Log Location: [ $LOG_FILE ]"
echo "SIGTERM delay : [ $EDGEMICRO_STOP_DELAY ]"

start_edge_micro() {
  
  if  [[ -n "$SERVICE_NAME" ]]
    then
          SERVICE_NAME="default"
    else
          SERVICE_NAME=$(env | grep POD_NAME=| cut -d '=' -f2| cut -d '-' -f1 | tr '[a-z]' '[A-Z]')
  fi

  SERVICE_PORT_HTTP=$(echo  ${SERVICE_NAME}_SERVICE_PORT_HTTP)

  if [[ -n "$CONTAINER_PORT"  ]]
      then
      SERVICE_PORT=$CONTAINER_PORT
  elif [[ -n "$SERVICE_PORT_HTTP"  ]]
    then
    ## We should create a Service name label if the deployment name is not same as service name
    ## In most of the cases it will work. The workaround is to add a containerPort label
    SERVICE_PORT=$(env | grep $SERVICE_PORT_HTTP=| cut -d '=' -f 2)
  fi

  if [[ -n "$EDGEMICRO_CONFIG"  ]]
    then
      echo "$EDGEMICRO_CONFIG" | base64 -d > ${APIGEE_ROOT}/.edgemicro/$EDGEMICRO_ORG-$EDGEMICRO_ENV-config.yaml
      chown apigee:apigee ${APIGEE_ROOT}/.edgemicro/*
  fi

  #Always override the port with 8000 because that port is exposed. 
  if [[ -n "$EDGEMICRO_PORT" ]] 
  then
    echo "Overriding port to "$EDGEMICRO_PORT
  else
    EDGEMICRO_PORT=8000
  fi
  
  if [[ -n "$EDGEMICRO_OVERRIDE_edgemicro_config_change_poll_interval" ]]; then
    sed -i.back "s/config_change_poll_interval.*/config_change_poll_interval: $EDGEMICRO_OVERRIDE_edgemicro_config_change_poll_interval/g" ${APIGEE_ROOT}/.edgemicro/$EDGEMICRO_ORG-$EDGEMICRO_ENV-config.yaml
  fi

  if [[ -n "$EDGEMICRO_PLUGIN_DIR" ]]
    then
    EDGEMICRO_PLUGIN_DIRECTORY=$EDGEMICRO_PLUGIN_DIR
  fi

  PROXY_NAME=edgemicro_$SERVICE_NAME
  TARGET_PORT=$SERVICE_PORT
  BASE_PATH=/
  BACKGROUND=" &"
  MGSTART=" edgemicro start -o $EDGEMICRO_ORG -e $EDGEMICRO_ENV -k $EDGEMICRO_KEY -s $EDGEMICRO_SECRET -r $EDGEMICRO_PORT -d $EDGEMICRO_PLUGIN_DIRECTORY"
  LOCALPROXY=" export EDGEMICRO_LOCAL_PROXY=$EDGEMICRO_LOCAL_PROXY "
  MGDIR="cd ${APIGEE_ROOT} "
  DECORATOR=" export EDGEMICRO_DECORATOR=$EDGEMICRO_DECORATOR "
  DEBUG=" export DEBUG=$DEBUG "
  EDGEMICRO_PROXY=""
  EDGEMICRO_NODE_OPTS=""

  if [[ -n "$HTTPS_PROXY" ]]
    then
    EDGEMICRO_HTTPS_PROXY=" export HTTPS_PROXY="$HTTPS_PROXY
    EDGEMICRO_PROXY="$EDGEMICRO_HTTPS_PROXY && $EDGEMICRO_PROXY"
  fi

  if [[ -n "$HTTP_PROXY" ]]
    then
    EDGEMICRO_HTTP_PROXY=" export HTTP_PROXY="$HTTP_PROXY
    EDGEMICRO_PROXY="$EDGEMICRO_HTTP_PROXY && $EDGEMICRO_PROXY"
  fi

  if [[ -n "$NO_PROXY" ]]
    then
    EDGEMICRO_NO_PROXY=" export NO_PROXY="$NO_PROXY
    EDGEMICRO_PROXY="$EDGEMICRO_NO_PROXY && $EDGEMICRO_PROXY"
  fi

  if [[ -n "$EDGEMICRO_PROCESSES" ]]
    then
    MGSTART=" edgemicro start -o $EDGEMICRO_ORG -e $EDGEMICRO_ENV -k $EDGEMICRO_KEY -s $EDGEMICRO_SECRET -p $EDGEMICRO_PROCESSES  -d $EDGEMICRO_PLUGIN_DIRECTORY"
  fi

  if [[ -n "$NODE_EXTRA_CA_CERTS" ]]
    then
    EDGEMICRO_NODE_OPTS=" export NODE_EXTRA_CA_CERTS="$NODE_EXTRA_CA_CERTS
  elif [[ -n "$NODE_TLS_REJECT_UNAUTHORIZED" ]]
    then
    EDGEMICRO_NODE_OPTS=" export NODE_TLS_REJECT_UNAUTHORIZED="$NODE_TLS_REJECT_UNAUTHORIZED
  fi

  if [[ -n "$EDGEMICRO_NODE_OPTS" ]]
    then
    MGSTART="$EDGEMICRO_NODE_OPTS && $MGSTART"
  fi

  if [[ -n "$EDGEMICRO_PROXY" ]]
    then
    MGSTART="$EDGEMICRO_PROXY $MGSTART"
  fi

  if [[ -n "$EDGEMICRO_LOCAL_PROXY" ]]
    then
    DECORATOR=" export EDGEMICRO_DECORATOR=1 "
    CMDSTRING="$MGDIR && $DECORATOR &&  $LOCALPROXY && $MGSTART -a $PROXY_NAME -v 1 -b / -t http://localhost:$TARGET_PORT  $BACKGROUND"
  else
    CMDSTRING="$MGDIR && $MGSTART $BACKGROUND"
  fi

  if [[ -n "$DEBUG" ]]
    then
    /bin/bash -c "$DEBUG && $CMDSTRING"
  else
    /bin/bash -c "$CMDSTRING"
  fi

  echo $CMDSTRING
}

start_edge_micro  2>&1 | tee -i $LOG_FILE

# SIGUSR1-handler
my_handler() {
  echo "my_handler" >> /tmp/entrypoint.log
  /bin/bash -c "cd ${APIGEE_ROOT} && edgemicro stop" 2>&1  | tee -i $LOG_FILE
}

# SIGTERM-handler
term_handler() {
  echo "term_handler" >> /tmp/entrypoint.log
  if [[ -n "$EDGEMICRO_STOP_DELAY" ]]
    then
    if [[ $EDGEMICRO_STOP_DELAY -lt 1 || $EDGEMICRO_STOP_DELAY -gt 1800 ]]
      then
      EDGEMICRO_STOP_DELAY=5
    fi
    echo "term_handler_sleep $EDGEMICRO_STOP_DELAY" >> /tmp/entrypoint.log
    sleep $EDGEMICRO_STOP_DELAY
  fi
  /bin/bash -c "cd ${APIGEE_ROOT} && edgemicro stop"  2>&1 | tee -i $LOG_FILE
  exit 143; # 128 + 15 -- SIGTERM
}

# setup handlers
# on callback, kill the last background process, which is `tail -f /dev/null` and execute the specified handler
trap 'kill ${!}; my_handler' SIGUSR1
trap 'kill ${!}; term_handler' SIGTERM

while true
do
  tail -f /dev/null & wait ${!}
done
