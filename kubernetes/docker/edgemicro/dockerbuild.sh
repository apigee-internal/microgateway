#!/bin/bash


DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ $# -ne 2 ]; then 
	echo "Please provide edgemicro version and GCP project id"
        exit 1
fi

version=$1
project_id=$2

docker build -t edgemicro:$version $DIR

if [ $# -eq 2 ]; then
  docker tag edgemicro:$version gcr.io/$project_id/edgemicro:$version
  docker tag edgemicro:$version gcr.io/$project_id/edgemicro:latest
  docker push gcr.io/$project_id/edgemicro:$version
  docker push gcr.io/$project_id/edgemicro:latest
fi
