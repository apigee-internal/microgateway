# Apigee Microgateway 
#

**Note: Description and code apply to Microgateway v2.x It's not compatible with v1.x series of Microgateway.**

![Build Status](https://travis-ci.org/apigee-internal/microgateway.svg?branch=master)

The Apigee Microgateway is a lightweight API management proxy that routes requests and responses between  API consumers and API providers. As  requests are routed the microgateway introduces an eventing model that is based on the concept of http middleware.  You can add custom plugins to the http router via the plugins directory.  You can also change the code to explicitly load plugins via the gateway.addPlugin method.  For more information about plugins see [https://github.com/apigee/microgateway-plugins](https://github.com/apigee/microgateway-plugins).
For more information on how to use the producet see the [product documentation](http://docs.apigee.com/microgateway/content/edge-microgateway-home)

![microgateway](microgateway.png)



The Microgateway is composed of 3 components

* [microgateway-core](https://github.com/apigee/microgateway-core): a lightweight core server that forwards requests and responses between northbound and southbound endpoints.  Core also contains an event model that will call each plugin.    
* [microgateway-config](https://github.com/apigee/microgateway-config): a config module that allows a user to pull down and load yaml configs from Apigee Edge
* [microgateway-plugins](https://github.com/apigee/microgateway-plugins): a file system reference to a collection of directories that allow a user to extend the microgateway.  

It also provides a CLI that an admin uses to wire/configure an instance of Microgateway with their Edge (Cloud or On-Premises) org as well as start Microgateway. Below is the workflow of the cli.  In order to load custom plugins you must load your plugin in the plugins directory.  The plugins directory is configured in the [default.yaml](config/default.yaml) or in the specified config directory.


![micro-flow](micro-flow.png)

# Official Microgateway Docs

The official docs for Microgateway can be found on the Apigee website.

 * [Official Microgateway Docs] (http://docs.apigee.com/microgateway/content/edge-microgateway-home)

# Get support and help

The Apigee community is the best place to ask questions, suggest features, and learn best practices with Microgateway.

 * [Get support and help] (https://community.apigee.com/spaces/71/index.html)

# Filing Issues

For filing issues please follow the following steps, and file the issue [here](https://github.com/apigee-internal/microgateway/issues).

* An issue should have a clear concise title to indicate the problem
* Reproduction steps should be included to verify what the issue is
* Including a relevant Apigee Community post to ensure that fix information is propogated into the community.



# Guidelines for Contribution

Pull requests to microgateway repos are gladly accepted. However, to make it easier on maintainers reviewing requests we kindly ask that
you include the following with each pull request.

* Title should be clear and concise as to what is in the Pull Request
* Please include some unit tests with your PR.
* If it is a feature addition please include a use case, and how to use the feature.
* If it is a bug fix please include reproduction steps for the bug, or link to an issue with reproduction steps.
* Ensure your PR is compatible with Node.js as far back as 4.5.X
* Follow our general style of coding. Taking advantage of the latest ES6 features.

# License

Apache
