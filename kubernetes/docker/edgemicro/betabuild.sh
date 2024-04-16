#!/bin/bash


DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo DIR is $DIR

if [ $# -ne 2 ]; then
	echo "Please provide edgemicro version and GCP project id"
        exit 1
fi

version=$1
project_id=$2

#us-west1-docker.pkg.dev/apigee-microgateway/edgemicro-beta

if [ $# -eq 2 ]; then

  sed -i.bak  "s/ *edgemicro.*/ apigee-internal\/microgateway#$version/g" installnode.sh
  docker build --no-cache -t edgemicro-beta:$version $DIR -f Dockerfile.beta
  docker tag edgemicro-beta:$version us-west1-docker.pkg.dev/$project_id/edgemicro-beta/emg:$version
  docker tag edgemicro-beta:$version us-west1-docker.pkg.dev/$project_id/edgemicro-beta/emg:beta
  docker push us-west1-docker.pkg.dev/$project_id/edgemicro-beta/emg:$version
  docker push us-west1-docker.pkg.dev/$project_id/edgemicro-beta/emg:beta
  rm installnode.sh
  mv installnode.sh.bak installnode.sh

fi


