#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ $# -ne 2 ]; then
	echo "Please provide app version and GCP project id"
    exit 1
fi

version=$1
project_id=$2

docker build -t helloworld:$version $DIR

if [ $# -eq 2 ]; then
  docker tag helloworld:$version gcr.io/$project_id/helloworld:$version
  docker tag helloworld:$version gcr.io/$project_id/helloworld:latest
  docker push gcr.io/$project_id/helloworld:$version
  docker push gcr.io/$project_id/helloworld:latest
fi
