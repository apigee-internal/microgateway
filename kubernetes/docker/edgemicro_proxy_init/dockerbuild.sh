#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ $# -ne 2 ]; then 
	echo "Please provide edgemicro_proxy_init version and GCP project id"
fi

version=$1
project_id=$2

docker build -t edgemicro_proxy_init:$version $DIR

if [ $# -eq 2 ]; then
  docker tag edgemicro_proxy_init:$version gcr.io/$project_id/edgemicro_proxy_init:$version
  docker tag edgemicro_proxy_init:$version gcr.io/$project_id/edgemicro_proxy_init:latest
  docker push gcr.io/$project_id/edgemicro_proxy_init:$version
  docker push gcr.io/$project_id/edgemicro_proxy_init:latest
fi
