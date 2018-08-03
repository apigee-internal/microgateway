# Docker for Microgateway
The following steps will allow you to run Microgateway as a Docker container.

## Pre-requisites
* Microgateway is configured against an org/environment
* User has the configuration file for microgateway
* User has the credentials to start microgateway

### Step 1: Download Microgateway container for docker
```
docker pull gcr.io/apigee-microgateway/edgemicro:2.5.19
```
Use a tag to download a specific version

### Step 2: Base64 encode the microgateway configuration file
```
export EDGEMICRO_CONFIG=`base64 .edgemicro/nycdevjam1-test-config.yaml`
```

NOTE: This version of docker accepts a microgateway configuration as a base64 encoded string. This allows you to pass the configuration file as an environment variable. When using Kubernetes, the configuration file can be stored in a Kubernetes Secret entity.

### Step 3: Start Microgateway with params
```
docker run -P -p 8000:8000 -d --name edgemicro -e EDGEMICRO_DOCKER=1 -e EDGEMICRO_ORG=org -e EDGEMICRO_ENV=test -e EDGEMICRO_KEY=xxx -e EDGEMICRO_SECRET=xxx -e EDGEMICRO_CONFIG=$EDGEMICRO_CONFIG -e SERVICE_NAME=edgemicro gcr.io/apigee-microgateway/edgemicro:2.5.19
```

P = publish all exposed ports to the host
d = run in detached mode
expose port 8443 if you are expose node.js over TLS

List of environment variables
* `EDGEMICRO_ORG` = Apigee Edge org name
* `EDGEMICRO_ENV` = Apigee Edge environment name
* `EDGEMICRO_DOCKER` = set to 1; do not set this when running in Kubernetes
* `EDGEMICRO_KEY` = Microgateway key 
* `EDGEMICRO_SECRET` = Microgateway secret
* `EDGEMICRO_CONFIG` = A base64 encoded string of the microgateway config file
* `SERVICE_NAME` = set to "edgemicro" (used in Kubernetes)

### Step 4: Stop Microgateway
```
docker stop edgemicro
```

NOTE: You can now restart Microgateway using this command
```
docker start $(docker ps -aqf name=edgemicro)
```

## Enable Custom Plugins

To enable custom plugins to Microgateway, perform the following steps

### Step 1: Add plugins to the docker container 
```
FROM gcr.io/apigee-microgateway/edgemicro:2.5.19
RUN apt-get install unzip
COPY plugins.zip /opt/apigee/
RUN chown apigee:apigee /opt/apigee/plugins.zip
RUN su - apigee -c "unzip /opt/apigee/plugins.zip -d /opt/apigee"
EXPOSE 8000
EXPOSE 8443
ENTRYPOINT ["/tmp/entrypoint.sh"]
```
NOTE: Use npm install to add any additional dependencies required by the custom plugins

### Step 2: Create a new Microgateway image (with the plugins)
```
docker build -t edgemicroplugins .
```

### Step 3: Set the plugin directory in the configuration file

```
edgemicro:
  ...
  plugins:
    dir: /opt/apigee/plugins
    sequence:
      - oauth
```
