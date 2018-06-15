#!/bin/bash

set -x
set -o errexit
set -o nounset
set -o pipefail

#echo $EDGEMICRO_ORG >> /tmp/test.txt
#echo $EDGEMICRO_ENV >> /tmp/test.txt
#echo $EDGEMICRO_KEY >> /tmp/test.txt
#echo $EDGEMICRO_SECRET >> /tmp/test.txt
#echo $EDGEMICRO_MGMTURL >> /tmp/test.txt
#echo $EDGEMICRO_ADMINEMAIL >> /tmp/test.txt
#echo $EDGEMICRO_ADMINPASSWORD >> /tmp/test.txt
#echo $POD_NAME >> /tmp/test.txt
#echo $POD_NAMESPACE >> /tmp/test.txt
#echo $INSTANCE_IP >> /tmp/test.txt
SERVICE_NAME_UPPERCASE=`echo "${SERVICE_NAME}" | tr '[a-z]' '[A-Z]'`
#echo $SERVICE_NAME >> /tmp/test.txt
SERVICE_PORT_NAME=${SERVICE_NAME_UPPERCASE}_SERVICE_PORT
SERVICE_PORT=${!SERVICE_PORT_NAME}
#echo $SERVICE_PORT >> /tmp/test.txt


APIGEE_ADMIN_EMAIL=$EDGEMICRO_ADMINEMAIL
APIGEE_ADMINPW=$EDGEMICRO_ADMINPASSWORD
mgmt_api=$EDGEMICRO_MGMTURL
org=$EDGEMICRO_ORG
env_name=$EDGEMICRO_ENV
proxy_name=edgemicro_${SERVICE_NAME}_service
target_port=$SERVICE_PORT
base_path=$SERVICE_NAME


curl -X POST -u $APIGEE_ADMIN_EMAIL:$APIGEE_ADMINPW -H "Content-Type:application/json" ${mgmt_api}/v1/organizations/${org}/apis  -d "{\"name\" : \"$proxy_name\"}" 
curl -X POST -u $APIGEE_ADMIN_EMAIL:$APIGEE_ADMINPW -H "Content-Type:application/json" ${mgmt_api}/v1/organizations/${org}/apis/$proxy_name/revisions/1/targets -d \
"{
\"connection\": {
\"connectionType\": \"httpConnection\",
\"uRL\": \"http:\/\/localhost:$target_port\"
},
\"connectionType\": \"httpConnection\",
\"description\": \"\",
\"faultRules\": [],
\"flows\": [],
\"name\": \"default\",
\"postFlow\": {
 \"name\": \"PostFlow\",
\"request\": {
  \"children\": []
},
\"response\": {
\"children\": []
}
},
\"preFlow\": {
\"name\": \"PreFlow\",
\"request\": {
  \"children\": []
},
\"response\": {
\"children\": []
}
},
\"type\": \"Target\"
}"  

curl -v -X POST -u $APIGEE_ADMIN_EMAIL:$APIGEE_ADMINPW -H "Content-Type:application/json" ${mgmt_api}/v1/organizations/${org}/apis/$proxy_name/revisions/1/proxies -d \
"{
 \"connection\": {
   \"basePath\": \"\/$base_path\",
   \"connectionType\": \"httpConnection\",
      \"virtualHost\": [
          \"default\",
          \"secure\"
      ]
 },
 \"connectionType\": \"httpConnection\",
 \"description\": \"\",
 \"faultRules\": [],
 \"flows\": [],
 \"name\": \"default\",
 \"postFlow\": {
    \"name\": \"PostFlow\",
    \"request\": {
       \"children\": []
    },
    \"response\": {
       \"children\": []
    }
  },
  \"preFlow\": {
      \"name\": \"PreFlow\",
      \"request\": {
         \"children\": []
      },
      \"response\": {
         \"children\": []
      }
  },
  \"routeRule\": [
  {
     \"empty\": false,
     \"name\": \"default\",
     \"targetEndpoint\": \"default\"
  }
  ],
  \"routeRuleNames\": [
     \"default\"
  ],
  \"type\": \"Proxy\"
}"

curl -v -X POST -u $APIGEE_ADMIN_EMAIL:$APIGEE_ADMINPW -H "Content-Type:application/x-www-form-urlencoded" ${mgmt_api}/v1/organizations/${org}/environments/${env_name}/apis/${proxy_name}/revisions/1/deployments

#create product

if [[ -n "$EDGEMICRO_CREATE_PRODUCT"  && "$EDGEMICRO_CREATE_PRODUCT" == "1" ]]; then
  
  curl -v -X POST -u $APIGEE_ADMIN_EMAIL:$APIGEE_ADMINPW -H "Content-Type:application/json" ${mgmt_api}/v1/organizations/${org}/apiproducts -d \
  "{
      \"name\" : \"${proxy_name}-product\",
      \"displayName\": \"${proxy_name}-product\",
      \"approvalType\": \"auto\",
      \"attributes\": [
      {
        \"name\": \"access\",
        \"value\": \"public\"
      }
      ],
      \"description\": \"Edgemicro proxy\",
      \"environments\": [ \"${env_name}\"],
      \"proxies\": [\"edgemicro-auth\", \"$proxy_name\"],
      \"apiResources\": [ \"/\", \"/**\"],
      \"quota\": \"\",
      \"quotaInterval\": \"\",
      \"quotaTimeUnit\": \"\",
      \"scopes\": []
  }"

fi



#while true
#do
#        tail -f /dev/null & wait ${!}
#done
