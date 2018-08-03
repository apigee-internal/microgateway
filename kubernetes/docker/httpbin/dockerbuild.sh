#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ $# -ne 2 ]; then
	echo "Please provide app version and GCP project id"
    exit 1
fi

version=$1
project_id=$2

docker build -t httpbin:$version $DIR

if [ $# -eq 2 ]; then
  docker tag httpbin:$version gcr.io/$project_id/httpbin:$version
  docker tag httpbin:$version gcr.io/$project_id/httpbin:latest
  docker push gcr.io/$project_id/httpbin:$version
  docker push gcr.io/$project_id/httpbin:latest
fi
