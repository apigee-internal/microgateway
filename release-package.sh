#!/bin/bash
rm -f apigee-edge-micro.zip
VERSION=2.0.4
PRODUCT_NAME=apigee-edge-micro
DIR_TO_CREATE="$HOME/$PRODUCT_NAME-$VERSION"
SOURCE_DIR=`pwd`
echo "Copying source to temp directory $DIR_TO_CREATE"
cp -r . $DIR_TO_CREATE
pushd $DIR_TO_CREATE
rm -rf tests*
rm -rf .git
rm -f .gitignore
rm -rf .idea
rm -rf .travis.yml
rm -rf .vscode
npm i --production
popd
pushd $HOME
echo "creating  zip"
zip -r -q apigee-edge-micro.zip $PRODUCT_NAME-$VERSION -x "*.git*"
popd
echo "Deleting the temp directory"
rm -rf $DIR_TO_CREATE
mv $HOME/apigee-edge-micro.zip .
echo 'Done. Get the zipfile :  apigee-edge-micro.zip'
