pwd
node ./dev/package-switch.js
rm npm-shrinkwrap.json
rm -r node_modules/microgateway-config
rm -r node_modules/microgateway-core
rm -r node_modules/microgateway-plugins
npm install .
npm shrinkwrap
