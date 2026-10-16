#!/bin/bash

red=`tput setaf 1`
green=`tput setaf 2`
blue=`tput setaf 4`
reset=`tput sgr0`

#edgemicroctlDist='https://github.com/apigee-internal/microgateway/blob/master/kubernetes/edgemicroctl/dist'
#ORG=apigee-internal
#REPO=microgateway
#PROJECT_ID=apigee-microgateway

### repo details
ORG=apigee-internal
REPO=microgateway
PROJECT_ID=apigee-microgateway

REQUEST_FILE="$(mktemp /tmp/github.request.XXXX)"
RESPONSE_FILE="$(mktemp /tmp/github.response.XXXX)"

## Command to build and release microgateway

usage() {

  echo "${blue}Usage: $0 [option...]" >&2
  echo
  echo "   -v, --build-version        * Build Docker Image Version "
  echo "   -d, -- build-docker        * Do you want to Build Docker images and push to registry? y/n. "
  echo "   -k, --git-key              * Git Key. "
  echo "   -u, --git-user             * Git User. "
  echo "   -r, --release-version      * Release Version. "
  echo "${reset}"

  exit 1
}


while [[ $# -gt 0 ]]; do
param="$1"
case $param in
        -v|--build-verion )          VERSION=$2
                       shift # past argument
                       shift # past value
                       ;;
        -d|--build-docker )          BUILD_DOCKER=$2
                       shift # past argument
                       shift # past value
                       ;;
        -k|--git-key )          GIT_KEY=$2
                       shift # past argument
                       shift # past value
                       ;;
        -u|--git-user )          GIT_USER=$2
                       shift # past argument
                       shift # past value
                       ;;
        -r|--release-version )   RELEASE_VERSION=$2
                       shift # past argument
                       shift # past value
                       ;;
        -h|*         ) shift
                       shift
                       usage
                       exit
    esac
done

while [ "$VERSION" = "" ]
do
    read  -p "${blue}Build Docker Image Version [latest]:${reset}" VERSION
    if [[ "$VERSION" = "" ]]; then
     VERSION="latest"
    fi
done

while [ "$GIT_KEY" = "" ]
do
    read  -p "${blue}Git Key :${reset}" GIT_KEY
done

while [ "$GIT_USER" = "" ]
do
    read  -p "${blue}Git User :${reset}" GIT_USER
done

while [ "$RELEASE_VERSION" = "" ]
do
    read  -p "${blue}Release Version :${reset}" RELEASE_VERSION
done

while [ "$BUILD_DOCKER" = "" ]
do
	read  -p "${blue}Do you want to Build Docker images and push to registry?[Y/n] :${reset}" BUILD_DOCKER

	if [[ "$BUILD_DOCKER" = "" ]]; then
		BUILD_DOCKER="y"
	fi
done
#Build and deploy all docker images with the version supplied

if [[ "$BUILD_DOCKER" == "y" ]]; then
	../docker/edgemicro/dockerbuild.sh $VERSION $PROJECT_ID
	../docker/helloworld/dockerbuild.sh $VERSION $PROJECT_ID
  ../docker/httpbin/dockerbuild.sh $VERSION $PROJECT_ID
fi




# curl -s -S -o $RESPONSE_FILE https://api.github.com/repos/$ORG/$REPO/releases -H "Accept: application/vnd.github.manifold-preview+json"


# RELEASE_ID=$(cat $RESPONSE_FILE | jq '.[0].id')
# UPLOAD_URL=$(cat $RESPONSE_FILE | jq '.[0].upload_url')
# UPLOAD_URL=$(echo $UPLOAD_URL | sed 's/{?name,label}//g')
# UPLOAD_URL=$(echo $UPLOAD_URL | sed 's/\"//g')

# ## Create a temp directory and move all install files here
# rm -fr tmp 
# mkdir -p tmp

# release_os=("darwin_amd64" "darwin_386" "linux_386" "linux_amd64")
# #release_os=("darwinamd64")

# for os in "${release_os[@]}"; 
# 	do echo ${os};
# 	mkdir -p tmp/microgateway-${RELEASE_VERSION}-${os}
# 	mkdir -p tmp/microgateway-${RELEASE_VERSION}-${os}/bin
# 	cp -fr ../install tmp/microgateway-${RELEASE_VERSION}-${os}/install
# 	cp -fr ../samples tmp/microgateway-${RELEASE_VERSION}-${os}/samples
# 	cp version.txt tmp/microgateway-${RELEASE_VERSION}-${os}/
# 	echo $RELEASE_VERSION > tmp/microgateway-${RELEASE_VERSION}-${os}/version.txt

# 	# Replace version information
# 	sed -i.bak s/latest/$VERSION/g tmp/microgateway-${RELEASE_VERSION}-${os}/install/kubernetes/edgemicro-sidecar-injector-configmap-release.yaml
# 	sed -i.bak s/latest/$VERSION/g tmp/microgateway-${RELEASE_VERSION}-${os}/install/kubernetes/edgemicro-sidecar-injector.yaml
#   sed -i.bak s/latest/$VERSION/g tmp/microgateway-${RELEASE_VERSION}-${os}/samples/helloworld/helloworld.yaml
#   sed -i.bak s/latest/$VERSION/g tmp/microgateway-${RELEASE_VERSION}-${os}/samples/helloworld/helloworld-service.yaml
#   sed -i.bak s/latest/$VERSION/g tmp/microgateway-${RELEASE_VERSION}-${os}/samples/httpbin/httpbin.yaml


#   sed -i.bak s/apigee-microgateway/$PROJECT_ID/g tmp/microgateway-${RELEASE_VERSION}-${os}/install/kubernetes/edgemicro-sidecar-injector-configmap-release.yaml
#   sed -i.bak s/apigee-microgateway/$PROJECT_ID/g tmp/microgateway-${RELEASE_VERSION}-${os}/install/kubernetes/edgemicro-sidecar-injector.yaml
#   sed -i.bak s/apigee-microgateway/$PROJECT_ID/g tmp/microgateway-${RELEASE_VERSION}-${os}/samples/helloworld/helloworld.yaml
#   sed -i.bak s/apigee-microgateway/$PROJECT_ID/g tmp/microgateway-${RELEASE_VERSION}-${os}/samples/helloworld/helloworld-service.yaml
#   sed -i.bak s/apigee-microgateway/$PROJECT_ID/g tmp/microgateway-${RELEASE_VERSION}-${os}/samples/httpbin/httpbin.yaml


# 	rm -fr tmp/microgateway-${RELEASE_VERSION}-${os}/install/kubernetes/edgemicro-sidecar-injector-configmap-release.yaml.bak
# 	rm -fr tmp/microgateway-${RELEASE_VERSION}-${os}/install/kubernetes/edgemicro-sidecar-injector.yaml.bak
#   rm -fr tmp/microgateway-${RELEASE_VERSION}-${os}/samples/helloworld/helloworld.yaml.bak
#   rm -fr tmp/microgateway-${RELEASE_VERSION}-${os}/samples/helloworld/helloworld-service.yaml.bak
#   rm -fr tmp/microgateway-${RELEASE_VERSION}-${os}/samples/httpbin/httpbin.yaml.bak


#   curl $edgemicroctlDist/${os}/edgemicroctl -o   tmp/microgateway-${RELEASE_VERSION}-${os}/bin/edgemicroctl
# 	chmod +x tmp/microgateway-${RELEASE_VERSION}-${os}/bin/edgemicroctl

# 	cd tmp

# 	tar -czvf microgateway-${RELEASE_VERSION}-${os}.tar.gz microgateway-${RELEASE_VERSION}-${os}

	
# 	EDGEMICRO_UPLOAD_URL=$UPLOAD_URL?name=microgateway-${RELEASE_VERSION}-${os}.tar.gz
#         echo $EDGEMICRO_UPLOAD_URL
# 	curl -X POST $EDGEMICRO_UPLOAD_URL -u  $GIT_USER:$GIT_KEY \
# -H "Content-Type:application/octet-stream" --data-binary @microgateway-${RELEASE_VERSION}-${os}.tar.gz

# 	rm -fr microgateway-${RELEASE_VERSION}-${os}
# 	cd ..

# done

# rm -fr tmp
