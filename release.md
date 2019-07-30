# Microgateway Release Notes 


## 3.0.2  ::  07/03/2019 - pre

Code has been reviewed for quality and code changes have been made to meet quality standards requested by users.

Code quality errors and warning derived from Jshint were addressed. Some actual code errors were identified and repaired
as a result. All apigee microgateway modules were put through this process. Code quality changes were made for: microgateway-config,
microgateway-core, microgateway-plugins, and this microgateway product. 

All modules with code quality changes have been tested with internal tools that verify the execution of edgemicro for customer use cases.

## 3.0.1  ::  06/27/2019 - pre

In these release the Apigee team brought Edgemicro up to version 3.0.0 and beyond. 

Tests have been repaired and  organized in order to make them run well on the Travis system. 
The state of tests, in particular unit tests,  that run on Travis makes a baseline for test quality. 
In the future, more tests will be added and will be required to function within the existing test pool
and keep Travis functional. 

Some minor bug fixes have been  done in relation to unit tests. And, we have begun with preparations for
some code improvement. 

The Travis system now runs tests on newer versions of node.js than in the past. 
Previously the Travis system ran against node.js v6.14
The microgateway code now runs against node.js versions v8 LTS, v10 TLS, and v12 LTS additionally to v6.14.


## Prior

Prio to July 2019 there has not been a release notes file. 
The product is stable and mature at version 3.0.2 as of July 2019.
Since its inception in 2013, code has been written and many issues have been addressed. 
There is a substantial log in internal tracking systems.
For ongoing releases, we shall keep notes. 


