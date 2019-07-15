pwd
branch_name=for302
if [ "$1" != '' ]; then
    branch_name=$1
    echo ${branch_name}
fi
echo ${branch_name}
node ./dev/package-switch.js $branch_name
#rm npm-shrinkwrap.json
#rm -r node_modules/microgateway-config
#rm -r node_modules/microgateway-core
#rm -r node_modules/microgateway-plugins
#npm install .
#npm shrinkwrap
