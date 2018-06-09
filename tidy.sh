find . -type f -name "*.js" -exec js-beautify -r {} \;
npm i
eslint . --fix
ncu -u
