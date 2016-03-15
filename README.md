# Microgateway 
The Microgateway is composed of 4 components

* microgateway-core: a lightweight core server that forwards requests and responses between northbound and southbound endpoints.  Core also contains an event model that will call each plugin.    
* microgateway-config: a config module that allows a user to pull down and load yaml configs from Apigee Edge
* microgateway-plugins: a file system reference to a collection of directories that allow a user to extend the microgateway.  
* microgateway-cli: a command line driven runtime that will download the configuration, instantiate the plugins and run the microgateway-core. This component contains knowledge about where things are.  

 

![microgateway](microgateway.png)

![micro-flow](micro-flow.png)



