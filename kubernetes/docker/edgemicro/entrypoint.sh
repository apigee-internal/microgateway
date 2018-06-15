#!/bin/bash

# Log Location on Server.
LOG_LOCATION=/opt/apigee/logs
exec > >(tee -i $LOG_LOCATION/edgemicro.log)
exec 2>&1

echo "Log Location should be: [ $LOG_LOCATION ]"

SERVICE_NAME_UPPERCASE=`echo "${SERVICE_NAME}" | tr '[a-z]' '[A-Z]'`
SERVICE_PORT_NAME=${SERVICE_NAME_UPPERCASE}_SERVICE_PORT
SERVICE_PORT=${!SERVICE_PORT_NAME}
proxy_name=edgemicro_${SERVICE_NAME}_service
product_name=$proxy_name-product


if [[ ${EDGEMICRO_CONFIG} != "" ]]; then
	echo ${EDGEMICRO_CONFIG} >> /tmp/test.txt
	echo ${EDGEMICRO_CONFIG} | base64 --decode > /opt/apigee/.edgemicro/$EDGEMICRO_ORG-$EDGEMICRO_ENV-config.yaml
	# Decorate Proxy with the proxy name
  sed -i.bak s/proxy_name/${proxy_name}/g /tmp/proxies.yaml
  if [[ ${EDGEMICRO_DECORATOR} != "" ]]; then
         sed -i.bak '/edgemicro:/r /tmp/proxies.yaml' /opt/apigee/.edgemicro/$EDGEMICRO_ORG-$EDGEMICRO_ENV-config.yaml
  fi
  chown apigee:apigee /opt/apigee/.edgemicro/*
fi

#Always override the port with 8000 for now.
sed -i.back "s/port.*/port: 8000/g" /opt/apigee/.edgemicro/$EDGEMICRO_ORG-$EDGEMICRO_ENV-config.yaml

if [[ -n "$EDGEMICRO_OVERRIDE_edgemicro_config_change_poll_interval" ]]; then
  sed -i.back "s/config_change_poll_interval.*/config_change_poll_interval: $EDGEMICRO_OVERRIDE_edgemicro_config_change_poll_interval/g" /opt/apigee/.edgemicro/$EDGEMICRO_ORG-$EDGEMICRO_ENV-config.yaml
fi

commandString="cd /opt/apigee && export EDGEMICRO_DECORATOR=$EDGEMICRO_DECORATOR && edgemicro start -o $EDGEMICRO_ORG -e $EDGEMICRO_ENV -k $EDGEMICRO_KEY -s $EDGEMICRO_SECRET &"
#echo $commandString
if [[ ${EDGEMICRO_DOCKER} != "" ]]; then
	su - apigee -c "$commandString"
else 
	su - apigee -m -c "$commandString"
fi 
#edgemicro start &

# SIGUSR1-handler
my_handler() {
  echo "my_handler" >> /tmp/entrypoint.log
  su - apigee -m -c "cd /opt/apigee && edgemicro stop"
  #if [[ ${EDGEMICRO_DECORATOR} != "" ]]; then
      #Attempt deleting the proxy here
      #curl -v -X DELETE -u $EDGEMICRO_ADMINEMAIL:$EDGEMICRO_ADMINPASSWORD -H "Content-Type:application/x-www-form-urlencoded" ${EDGEMICRO_MGMTURL}/v1/organizations/${EDGEMICRO_ORG}/apiproducts/${product_name}
      #curl -v -X DELETE -u $EDGEMICRO_ADMINEMAIL:$EDGEMICRO_ADMINPASSWORD -H "Content-Type:application/x-www-form-urlencoded" ${EDGEMICRO_MGMTURL}/v1/organizations/${EDGEMICRO_ORG}/environments/${EDGEMICRO_ENV}/apis/${proxy_name}/revisions/1/deployments
      #curl -v -X DELETE -u $EDGEMICRO_ADMINEMAIL:$EDGEMICRO_ADMINPASSWORD -H "Content-Type:application/x-www-form-urlencoded" ${EDGEMICRO_MGMTURL}/v1/organizations/${EDGEMICRO_ORG}/apis/${proxy_name}
  #fi
  #edgemicro stop
}

# SIGTERM-handler
term_handler() {
  echo "term_handler" >> /tmp/entrypoint.log
  su - apigee -m -c "cd /opt/apigee && edgemicro stop"
  #if [[ ${EDGEMICRO_DECORATOR} != "" ]]; then
      #curl -v -X DELETE -u $EDGEMICRO_ADMINEMAIL:$EDGEMICRO_ADMINPASSWORD -H "Content-Type:application/x-www-form-urlencoded" ${EDGEMICRO_MGMTURL}/v1/organizations/${EDGEMICRO_ORG}/apiproducts/${product_name}
      #curl -v -X DELETE -u $EDGEMICRO_ADMINEMAIL:$EDGEMICRO_ADMINPASSWORD -H "Content-Type:application/x-www-form-urlencoded" ${EDGEMICRO_MGMTURL}/v1/organizations/${EDGEMICRO_ORG}/environments/${EDGEMICRO_ENV}/apis/${proxy_name}/revisions/1/deployments
      #curl -v -X DELETE -u $EDGEMICRO_ADMINEMAIL:$EDGEMICRO_ADMINPASSWORD -H "Content-Type:application/x-www-form-urlencoded" ${EDGEMICRO_MGMTURL}/v1/organizations/${EDGEMICRO_ORG}/apis/${proxy_name}
  #fi
  #edgemicro stop
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
