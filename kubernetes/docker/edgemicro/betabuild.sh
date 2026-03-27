#!/bin/bash


DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo DIR is $DIR

if [ $# -lt 2 ]; then
	echo "Please provide edgemicro version and GCP project id"
	echo "Usage: $0 <version> <gcp-project-id> [github-repo]"
	echo "Example: $0 for-3.3.9 apigee-microgateway apigee-internal/microgateway"
        exit 1
fi

version=$1
project_id=$2
repo=${3:-apigee-internal/microgateway}

#us-west1-docker.pkg.dev/apigee-microgateway/edgemicro-beta

# Using '|' as the sed delimiter eliminates the need to escape slashes in the repo path
sed -i.bak  "s| *edgemicro.*| ${repo}#$version|g" installnode.sh

# Build with --platform linux/amd64 to ensure it runs correctly on general-purpose servers (x86_64) instead of ARM64
docker build --platform linux/amd64 --no-cache -t edgemicro-beta:$version $DIR -f Dockerfile.beta

docker tag edgemicro-beta:$version us-west1-docker.pkg.dev/$project_id/edgemicro-beta/emg:$version
docker tag edgemicro-beta:$version us-west1-docker.pkg.dev/$project_id/edgemicro-beta/emg:beta

docker push us-west1-docker.pkg.dev/$project_id/edgemicro-beta/emg:$version
docker push us-west1-docker.pkg.dev/$project_id/edgemicro-beta/emg:beta

rm installnode.sh
mv installnode.sh.bak installnode.sh

