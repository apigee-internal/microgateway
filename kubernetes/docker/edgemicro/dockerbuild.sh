#!/bin/bash


DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ $# -ne 2 ]; then
	echo "Please provide edgemicro version and GCP project id"
        exit 1
fi

version=$1
project_id=$2

if [ $# -eq 2 ]; then

  sed -i.bak  "s/ *edgemicro.*/ edgemicro@$version/g" installnode.sh
  docker build --no-cache -t edgemicro:$version $DIR
  docker tag edgemicro:$version gcr.io/$project_id/edgemicro:$version
  docker tag edgemicro:$version gcr.io/$project_id/edgemicro:latest
  docker tag edgemicro:$version gcr.io/$project_id/edgemicro:public-image-for-$version
  docker push gcr.io/$project_id/edgemicro:$version
  docker push gcr.io/$project_id/edgemicro:latest
  docker push gcr.io/$project_id/edgemicro:public-image-for-$version
  rm installnode.sh
  mv installnode.sh.bak installnode.sh

fi


