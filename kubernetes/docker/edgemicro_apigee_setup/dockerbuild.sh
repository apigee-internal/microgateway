#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ $# -ne 2 ]; then 
	echo "Please app version and GCP project id"
fi

version=$1
project_id=$2

docker build -t edgemicro_apigee_setup:$version $DIR

if [ $# -eq 2 ]; then
  docker tag edgemicro_apigee_setup:$version gcr.io/$project_id/edgemicro_apigee_setup:$version
  docker tag edgemicro_apigee_setup:$version gcr.io/$project_id/edgemicro_apigee_setup:latest
  docker push gcr.io/$project_id/edgemicro_apigee_setup:$version
  docker push gcr.io/$project_id/edgemicro_apigee_setup:latest
fi
