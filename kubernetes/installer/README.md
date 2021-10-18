# Apigee Edge Microgateway Installer for Kubernetes

This installation guide provides instructions and manifests required for deploying Apigee Edge Microgateway on Kubernetes.

Edge Microgateway is orchestrated on Kubernetes using a [Kubernetes Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/). The Microgateway configuration file and other configuration parameters are provided to the Microgateway pods using a [Kubernetes Secret](https://kubernetes.io/docs/concepts/configuration/secret/). The Microgateway API endpoint can be accessed on the Kubernetes cluster using a [Kubernetes Service](https://kubernetes.io/docs/concepts/services-networking/service/). It could also be exposed using a [Load Balancer](https://kubernetes.io/docs/concepts/configuration/secret/).

First, complete [prerequisites](#Prerequisites) and move to the next steps according your requirement.

## Outline

- [Prerequisites](#Prerequisites)
- [Deploy Microgateway on Kubernetes](#Deploy-Microgateway-on-Kubernetes)
- [Expose Microgateway using a Load Balancer](#Expose-Microgateway-using-a-Load-Balancer)
- [Enable Northbound One-Way TLS](#Enable-Northbound-One-Way-TLS)
- [Enable Northbound Two-Way TLS](#Enable-Northbound-Two-Way-TLS)
- [Enable Southbound Two-Way TLS](#Enable-Southbound-Two-Way-TLS)
- [Undeploy Microgateway](#Undeploy-Microgateway)

## Prerequisites

1. Install Microgateway on a host which has internet connectivity:
   ```
   npm install edgemicro -g
   ```
   Please refer to [Microgateway Installation Guide](https://docs.apigee.com/api-platform/microgateway/3.2.x/installing-edge-microgateway) for detailed information. 

2. Generate Microgateway Configuration file, key and secret:
   ```
   edgemicro init

   MGW_ORG=#Apigee organization
   MGW_ENV=#Apigee environment
   MGW_USER=#Apigee username

   # For Edge Cloud, if basic auth is used
   edgemicro configure -o $MGW_ORG -e $MGW_ENV -u $MGW_USER

   # For Edge Cloud, if OAuth is used
   edgemicro configure -o $MGW_ORG -e $MGW_ENV -t $(get_token)
   ```

   ```
   edgemicro v3.2.1
   Usage: configure [options]

   Automated, one-time configuration with Edge Cloud

   Options:
     -o, --org <org>                    the organization
     -e, --env <env>                    the environment
     -v, --virtualHosts <virtualHosts>  override virtualHosts (default: "default,secure")
     -u, --username <user>              username of the organization admin
     -p, --password <password>          password of the organization admin
     -t, --token <token>                OAuth token to use with management API
     -r, --url <url>                    organization's custom API URL (https://api.example.com)
     -d, --debug                        execute with debug output
     -c, --configDir <configDir>        Set the directory where configs are written.
     -x, --proxyName <proxyName>        Set the custom proxy name for edgemicro-auth
     -k  --key <key>                    Path to private key to be used by Apigee Edge
     -s  --cert <cert>                  Path to certificate to be used by Apigee Edge
     -h, --help                         output usage information
   ```

   Please refer to [Setting up and configuring Edge Microgateway](https://docs.apigee.com/api-platform/microgateway/3.2.x/setting-and-configuring-edge-microgateway) for detailed information.

3. Configure kubectl CLI pointing to your Kubernetes cluster:

   - On Google Kubernetes Engine (GKE), execute below command to configure kubectl CLI:
     ```
     gcloud container clusters get-credentials $CLUSTER_NAME --zone $ZONE --project $PROJECT_ID
     ```

   - Please refer [Kubernetes documentation](https://kubernetes.io/docs/tasks/tools/) or to the relevant cloud platform documentation for any other Kubernetes deployment.


4. Create a new folder on your local machine and download Kubernetes manifests files found in the `manifests/` folder of this repository:
   
   For an example:
   ```
   /opt/apigee/microgateway/kubernetes/manifests/

   ```

## Create entities on Apigee Edge

Creating a "microgateway-aware" proxy is a standard Edge Microgateway requirement. See also [What you need to know about Microgateway-aware proxies](https://apigee.devsite.corp.google.com/api-platform/microgateway/2.5.x/overview-edge-microgateway#whatyouneedtoknowaboutedgemicrogateway-whatyouneedtoknowaboutedgemicrogatewayawareproxies).

Do the following steps to create an API proxy, API product, developer, and developer app:

1. Create a microgateway-aware proxy with these properties:

  - Proxy name: `edgemicro_hello`
  - Base path: `/hello`
  - Target: https://mocktarget.apigee.net

    For detailed steps, see [Create an Edge Microgateway-aware API proxy on Edge](https://apigee.devsite.corp.google.com/api-platform/microgateway/3.2.x/setting-and-configuring-edge-microgateway#part2createentitiesonapigeeedge-1createanedgemicrogatewayawareapiproxyonedge).

2. Create an API product that references the proxy. The product must include these API resources:

  - `edgemicro_hello`
  - `edgemicro-auth`

    For detailed steps, see [Create an API product](https://apigee.devsite.corp.google.com/api-platform/microgateway/3.2.x/setting-and-configuring-edge-microgateway#part2createentitiesonapigeeedge-2createaproduct).

3. Create a developer. For detailed steps, see [Create a developer](https://apigee.devsite.corp.google.com/api-platform/microgateway/3.2.x/setting-and-configuring-edge-microgateway#part2createentitiesonapigeeedge-3optionalcreateatestdeveloper).

4. Create a developer app that includes the API product you just created. [Create a developer app](https://apigee.devsite.corp.google.com/api-platform/microgateway/3.2.x/setting-and-configuring-edge-microgateway#part2createentitiesonapigeeedge-4createadeveloperapp).


## Deploy Microgateway on Kubernetes

1. Generate Microgateway Kubernetes secret:
   ```
   # Define context
   MGW_ORG=#Apigee organization
   MGW_ENV=#Apigee environment
   MGW_KEY=#key generated by "edgemicro config" command
   MGW_SECRET=#secret generated by "edgemicro config" command
   MGW_CONFIG=$(cat microgateway-config.yaml | base64)

   # Create Microgateway Kubernetes secret
   kubectl create secret generic mgwsecret --from-literal=mgw-config=$MGW_CONFIG --from-literal=mgw-org=$MGW_ORG --from-literal=mgw-env=$MGW_ENV --from-literal=mgw-key=$MGW_KEY --from-literal=mgw-secret=$MGW_SECRET
   ```

2. Deploy Microgateway on Kubernetes:
   ```
   # Create Microgateway Kubernetes deployment
   kubectl apply -f manifests/edge-microgateway-deployment.yaml

   # Create Microgateway Kubernetes service
   kubectl apply -f manifests/edge-microgateway-service.yaml
   ```

3. Verify the status of the Microgateway deployment:

   - If the Microgateway pod is started successfully the pod status should be changed to `Running` and ready value should be changed to `1/1`:
     ```
     kubectl get pods -l app=edge-microgateway
     ```

     An example output:
     ```
     NAME                                 READY   STATUS    RESTARTS   AGE
     edge-microgateway-75f6bb8994-4j8zp   1/1     Running   0          58s
     ```
   
   - Check logs of the Microgateway pod:
     ```
     kubectl logs -l app=edge-microgateway --tail 100
     ```

     An example output:
     ```
     Log Location: [ /opt/apigee/logs/edgemicro.log ]
     SIGTERM delay : [  ]
     edgemicro start -o $org -e $env -k 571e224555bfb2aecc3bc56234e0c6fadb57904de99e2f072961e1b717b86f02 -s 50b9d041ab5eadb170add087bd54b63a75e09b527b939bfbd2e5eee3c2390f11 -r 8000 -d /opt/apigee/plugins &
     2021-08-17T07:07:52.157Z [26] [microgateway edgemicro] current nodejs version is v12.22.3
     2021-08-17T07:07:52.159Z [26] [microgateway edgemicro] current edgemicro version is 3.2.2
     2021-08-17T07:07:52.159Z [26] [microgateway edgemicro] Current NodeJS version is v12.22.3.
     2021-08-17T07:07:54.239Z [26] [microgateway-config network] config download from https://edgemicroservices.apigee.net/edgemicro/bootstrap/organization/$org/environment/$env returned 200 OK
     2021-08-17T07:07:54.253Z [26] [microgateway-config network] jwt_public_key download from https://$org-$env.apigee.net/edgemicro-auth/publicKey returned 200 OK
     2021-08-17T07:07:54.680Z [26] [microgateway-config network] products download from https://$org-$env.apigee.net/edgemicro-auth/products returned 200 OK
     2021-08-17T07:07:54.726Z [26] [microgateway gateway] PROCESS PID : 26
     ```

4. Now, create a Kubernetes port forwarding session and access Microgateway API endpoint through the Microgateway service:
   ```
   # Create a port forwarding session from your local machine to the Microgateway service:
   kubectl port-forward service/edge-microgateway 8000:8000

   # Using a new terminal send an API request to the Microgateway service:
   curl -i http://localhost:8000/${PROXY_PATH}
   ```

4. If required, [expose Microgateway API endpoint using a Load Balancer](#expose-microgateway-using-a-load-balancer).


## Expose Microgateway using a Load Balancer

1. Execute below command to expose Microgateway using a cloud platform load balancer. This step will create a Load Balancer type Kubernetes service using the name `edge-microgateway-load-balancer`. As a result, the cloud platform will create a TCP load balancer and route traffic to the Microgateway pods via the Kubernetes service through the port 8000:
   ```
   kubectl expose deployment edge-microgateway --type=LoadBalancer --port=8000 --name=edge-microgateway-load-balancer
   ```

2. Wait until the Load Balancer get an external IP address assigned:
   ```
   kubectl get service edge-microgateway-load-balancer
   ```

   An example output:
   ```
   NAME                              TYPE           CLUSTER-IP   EXTERNAL-IP     PORT(S)          AGE
   edge-microgateway-load-balancer   LoadBalancer   10.8.0.189   34.123.45.678   8000:31272/TCP   39h
   ```

3. Assign the external IP address of the Load Balancer to an environment variable:
   ```
   export GATEWAY_IP=$(kubectl get service \
   edge-microgateway-load-balancer \
   -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

   echo $GATEWAY_IP
   ```

4. Send a sample API request and verify the deployment:
   ```
   curl -i http://$GATEWAY_IP:8000/${PROXY_PATH}
   ```


## Enable Northbound One-Way TLS

1. Generate a TLS certificate and a key for enabling one-way TLS in the Microgateway. Copy these files using the filenames server.pem and server.key to the current directory.

2. Update Microgateway configuration file and configure ssl/key and ssl/cert properties exactly as specified below:
   ```
   ...
   edgemicro:
     ...
     ssl:
       key: /opt/apigee/tls/server.key
       cert: /opt/apigee/tls/server.pem
     ...
   ```

3. Update `edge-microgateway-deployment.yaml, add a volume mount and a volume for mounting the TLS certificate and key exactly as specified below:
   ```
   ---
   apiVersion: apps/v1
   kind: Deployment
   metadata:
   name: edge-microgateway
   ...
   template:
      ...
      spec:
         containers:
           ...
           volumeMounts:
           - name: mgw-northbound-tls
              mountPath: "/opt/apigee/tls"
              readOnly: true
         volumes:
         - name: mgw-northbound-tls
         secret:
            secretName: mgwsecret
            items:
            - key: mgw-northbound-tls-server-key
               path: "server.key"
            - key: mgw-northbound-tls-server-cert
               path: "server.pem"
         securityContext:
           runAsNonRoot: true
           runAsUser: 101
   ```

4. Generate the Microgateway Kubernetes secret:
   ```
   # Define context
   MGW_KEY=#key generated by "edgemicro config" command
   MGW_SECRET=#secret generated by "edgemicro config" command
   MGW_CONFIG=$(cat microgateway-config.yaml | base64)
   MGW_NORTHBOUND_TLS_SERVER_KEY=$(cat server.key)
   MGW_NORTHBOUND_TLS_SERVER_CERT=$(cat server.pem)

   # Create Microgateway Kubernetes secret
   kubectl create secret generic mgwsecret --from-literal=mgw-config=$MGW_CONFIG --from-literal=mgw-org="$MGW_ORG" --from-literal=mgw-env="$MGW_ENV" --from-literal=mgw-key="$MGW_KEY" --from-literal=mgw-secret="$MGW_SECRET" --from-literal=mgw-northbound-tls-server-key="$MGW_NORTHBOUND_TLS_SERVER_KEY" --from-literal=mgw-northbound-tls-server-cert="$MGW_NORTHBOUND_TLS_SERVER_CERT"
   ```

5. Deploy Microgateway on the Kubernetes cluster:
   ```
   kubectl apply -f manifests/edge-microgateway-deployment.yaml
   ```


## Enable Northbound Two-Way TLS

1. Generate a TLS certificate for the Microgateway server and another TLS certificate for the client. Copy generated files to the current directory using following filenames `server.pem, server.key, client.pem, client.key, client-ca.pem`.

2. Update Microgateway configuration file and configure `ssl key`, `cert`, `requestCert`, and `ca` properties exactly as specified below:
   ```
   ...
   edgemicro:
     ...
     ssl:
       key: /opt/apigee/tls/server.key
       cert: /opt/apigee/tls/server.pem
       requestCert: true
       ca: /opt/apigee/tls/client-ca.pem
     ...
   ```

3. Update `edge-microgateway-deployment.yaml, add a volume mount and a volume for mounting the server TLS certificate, server key and client CA certificate exactly as specified below:
   ```
   ---
   apiVersion: apps/v1
   kind: Deployment
   metadata:
   name: edge-microgateway
   ...
   template:
      ...
      spec:
         containers:
           ...
           volumeMounts:
           - name: mgw-northbound-tls
             mountPath: "/opt/apigee/tls"
             readOnly: true
         volumes:
         - name: mgw-northbound-tls
           secret:
             secretName: mgwsecret
             items:
             - key: mgw-northbound-tls-server-key
               path: "server.key"
             - key: mgw-northbound-tls-server-cert
               path: "server.pem"
             - key: mgw-northbound-tls-client-ca-cert
               path: "client-ca.pem"
         securityContext:
           runAsNonRoot: true
           runAsUser: 101
   ```

4. Generate the Microgateway Kubernetes secret:
   ```
   # Define context
   MGW_KEY=#key generated by "edgemicro config" command
   MGW_SECRET=#secret generated by "edgemicro config" command
   MGW_CONFIG=$(cat microgateway-config.yaml | base64)
   MGW_NORTHBOUND_TLS_SERVER_KEY=$(cat server.key)
   MGW_NORTHBOUND_TLS_SERVER_CERT=$(cat server.pem)
   MGW_NORTHBOUND_TLS_CLIENT_CA_CERT=$(cat client-ca.pem)

   # Create Microgateway Kubernetes secret
   kubectl create secret generic mgwsecret --from-literal=mgw-config="$MGW_CONFIG" --from-literal=mgw-org="$MGW_ORG" --from-literal=mgw-env="$MGW_ENV" --from-literal=mgw-key="$MGW_KEY" --from-literal=mgw-secret="$MGW_SECRET" --from-literal=mgw-northbound-tls-server-key="$MGW_NORTHBOUND_TLS_SERVER_KEY" --from-literal=mgw-northbound-tls-server-cert="$MGW_NORTHBOUND_TLS_SERVER_CERT" --from-literal=mgw-northbound-tls-client-ca-cert="$MGW_NORTHBOUND_TLS_CLIENT_CA_CERT"
   ```

5. Deploy Microgateway on the Kubernetes cluster:  
   ```
   kubectl apply -f manifests/edge-microgateway-deployment.yaml
   ```


## Enable Southbound Two-Way TLS

1. Obtain certificate authority (CA) certificate chain and the key file of the client TLS certificate. Copy these files using the filenames client-ca.pem and client.key to the current directory.

2. Update Microgateway configuration file and configure `targets/ssl/client/key`, `targets/ssl/client/cert` and `passphrase` properties exactly as specified below:
   ```
   edgemicro:
   ...
   targets:
     - host: 'target.server.hostname'
       ssl:
         client:
           key: /opt/apigee/tls/target/client.key
           cert: /opt/apigee/tls/target/client-ca.pem
           passphrase: secret
           rejectUnauthorized: true
   ```

3. Update `edge-microgateway-deployment.yaml, add a volume mount and a volume for mounting the TLS certificate and key exactly as specified below:
   ```
   ---
   apiVersion: apps/v1
   kind: Deployment
   metadata:
   name: edge-microgateway
   ...
   template:
      ...
      spec:
         containers:
           ...
           volumeMounts:
           - name: mgw-southbound-tls
              mountPath: "/opt/apigee/tls/target"
              readOnly: true
         volumes:
         - name: mgw-southbound-tls
         secret:
            secretName: mgwsecret
            items:
            - key: mgw-southbound-tls-client-key
               path: "client.key"
            - key: mgw-southbound-tls-client-cert
               path: "client-ca.pem"
         securityContext:
           runAsNonRoot: true
           runAsUser: 101
   ```

4. Generate the Microgateway Kubernetes secret:
   ```
   # Define context
   MGW_KEY=#key generated by "edgemicro config" command
   MGW_SECRET=#secret generated by "edgemicro config" command
   MGW_CONFIG=$(cat microgateway-config.yaml | base64)
   MGW_SOUTHBOUND_TLS_SERVER_KEY=$(cat client.key)
   MGW_SOUTHBOUND_TLS_SERVER_CERT=$(cat client-ca.pem)

   # Create Microgateway Kubernetes secret
   kubectl create secret generic mgwsecret --from-literal=mgw-config=$MGW_CONFIG --from-literal=mgw-org="$MGW_ORG" --from-literal=mgw-env="$MGW_ENV" --from-literal=mgw-key="$MGW_KEY" --from-literal=mgw-secret="$MGW_SECRET" --from-literal=mgw-southbound-tls-server-key="$MGW_SOUTHBOUND_TLS_SERVER_KEY" --from-literal=mgw-southbound-tls-server-cert="$MGW_SOUTHBOUND_TLS_SERVER_CERT"
   ```

5. Deploy Microgateway on the Kubernetes cluster:
   ```
   kubectl apply -f manifests/edge-microgateway-deployment.yaml
   ```


## Undeploy Microgateway

   Execute below command to delete all resources created for deploying Microgateway on Kubernetes:
   ```
   # Delete Microgateway deployment and services
   kubectl delete deployment,services -l app=edge-microgateway

   # Delete Microgateway secret
   kubectl delete secret mgwsecret
   ```