#! /bin/sh
#
# DEPRECATED: The edgemicroctl CLI tool and release bundle downloaded by this
# script are deprecated and no longer supported (see b/161263992).
# Please use the standard kubectl installation workflow and manifests documented
# in kubernetes/installer/README.md instead.
#
# Download microgateway

echo "================================================================================"
echo "WARNING: This script and the 'edgemicroctl' packages it downloads are DEPRECATED."
echo "Please use the supported kubectl installation method and manifests located at:"
echo "  kubernetes/installer/README.md"
echo "================================================================================"

OS="$(uname)"
if [ "x${OS}" = "xDarwin" ] ; then
  arch="$(uname -m)"
  if [ "y${arch}" = "yx86_64" ]; then
  	OSEXT="Darwin_x86_64"
  else
  	OSEXT="Darwin_386"
  fi
else
  # TODO we should check more/complain if not likely to work, etc...
  arch="$(uname -m)"
  if [ "y${arch}" = "yx86_64" ]; then
  	OSEXT="Linux_x86_64"
  else
  	OSEXT="Linux_386"
  fi
fi

tag=$1
if [[ "$tag" == "" ]]; then
  if [ "x${EDGEMICRO_VERSION}" = "x" ] ; then
    EDGEMICRO_VERSION=$(curl -L -s https://api.github.com/repos/apigee-internal/microgateway/releases/latest | \
                  grep tag_name | sed "s/ *\"tag_name\": *\"\(.*\)\",*/\1/")
  fi

else

  if [ "x${EDGEMICRO_VERSION}" = "x" ] ; then
    EDGEMICRO_VERSION=$(curl -L -s https://api.github.com/repos/apigee-internal/microgateway/releases/tags/$tag | \
                  grep tag_name | sed "s/ *\"tag_name\": *\"\(.*\)\",*/\1/")
  fi

fi


NAME="microgateway_${EDGEMICRO_VERSION}_${OSEXT}"


URL="https://github.com/apigee-internal/microgateway/releases/download/${EDGEMICRO_VERSION}/${NAME}.tar.gz"
echo "Downloading $NAME from $URL ..."

curl -L "$URL" | tar xz && cd $NAME && mkdir -p bin && mv edgemicroctl bin/edgemicroctl

# TODO: change this so the version is in the tgz/directory name (users trying multiple versions)

echo "Downloaded into $NAME:"

BINDIR="$(cd bin; pwd)"
echo "Add $BINDIR to your path; e.g copy paste in your shell and/or ~/.profile:"
echo "export PATH=\"\$PATH:$BINDIR\""

