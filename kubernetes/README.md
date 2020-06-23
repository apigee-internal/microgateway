# Microgateway on Kubernetes

## Overview

Edge Microgateway can be deployed as a service or as a sidecar gateway in front og your services deployed in kubernetes cluster. Developers faces challenges in exposing their microservices and rely on API Management providers for exposing,securing and managing their apis. This document explains how to deploy microgateway on the kubernetes platform.

# Edgemicro as Service 
![Edgemicro as Service](./docs/images/service-arch.png)
# Edgemicro as Sidecar 
![Edgemicro as Sidecar](./docs/images/arch.png)

## Quick Start

### Prerequisites

* Kubernetes version 1.8+ or 1.9+(Automatic Sidecar)
* Kubernetes CLI kubectl v1.9 or greater
* Cluster with atleast 3 nodes having 2 VCPU each.
* Minikube - Coming soon ...
* GKE
   - Create container cluster in GKE with atleast 3 node and machine size having 2 VCPU each.
   ![GKE](./docs/images/gke-container.png)

   - Retrieve your credentials for kubectl (replace <cluster-name> with the name of the cluster you want to use, and <zone> with the zone where that cluster is located):
     ```
     gcloud container clusters get-credentials <cluster-name> --zone <zone> --project <project-name>
     ```
   - Grant cluster admin permissions to the current user (admin permissions are required to create the necessary RBAC rules for edgemicrok8):
     ```
     kubectl create clusterrolebinding cluster-admin-binding --clusterrole=cluster-admin --user=$(gcloud config get-value core/account)
     ```
* Openshift - Coming soon ...

### Installation Steps

1. If you are using a MacOS or Linux system, you can also run the following command to download and extract the latest release automatically:
      ```
        curl -L https://raw.githubusercontent.com/apigee-internal/microgateway/master/kubernetes/release/downloadEdgeMicrok8s.sh | sh - 
      ```
    If you are downloading a particular version, use this command :
    ```
        curl -L https://raw.githubusercontent.com/apigee-internal/microgateway/master/kubernetes/release/downloadEdgeMicrok8s.sh | sh -s  2.5.25-beta
      ```

2. It extracts the package in the current location with a folder named microgateway_version_os_arch
    * Installation .yaml files for Kubernetes in install/
    * Sample applications in samples/
    * The edgemicroctl client binary in the bin/ directory. edgemicroctl is used when manually injecting Edgemicro as a sidecar gateway or Service.

3.  Change directory to microgateway package. For example, if the package is microgateway_2.5.25-beta_Darwin_x86_64
    ```
    cd  microgateway_2.5.25-beta_Darwin_x86_64
    ```
4.  Add the edgemicroctl client to your PATH. For example, run the following command on a MacOS or Linux
system:
    ```
    export PATH=$PWD/bin:$PATH
    ```
5. Install the base microgateway setup. This will create edgemicro-system namespaces and create cluster roles for edgemicro sidecar and Service.

    ```
    kubectl apply -f install/kubernetes/edgemicro.yaml
    ```

6. Confgure nginx ingress controller. This step is required if you are running on a GCP and you have a Loadbalancer. 

    ```
    kubectl apply -f install/kubernetes/edgemicro-nginx-gke.yaml
    ```
    

#### Verify Installation

1. To check if the ingress controller pods have started, run the following command:

    ```
    kubectl get pods --all-namespaces -l app=edgemicro-ingress --watch
    ```
    This takes some time (a minute or two) and may go through cycles of Error and Restarts. Once the operator pods are running, you can cancel the above command by typing Ctrl+C. 
    
    **** Please note that there should not be any other nginx controller running.
2. Ensure the following Kubernetes services are deployed
    ```
    kubectl get svc -n edgemicro-system
    ```
    ```
    NAME                        TYPE           CLUSTER-IP     EXTERNAL-IP    PORT(S)                     AGE
    default-http-backend        ClusterIP      10.19.255.106  <none>         80/TCP                       2h
    edgemicro-ingress           LoadBalancer   10.19.247.156  35.224.24.13   80:30176/TCP,443:32325/TCP   2h
    edgemicro-sidecar-injector  ClusterIP      10.19.240.55   <none>         443/TCP                      2h
    ```
    ** If you have not enabled sidecar injector, you will not see edgemicro-sidecar-injector.Refer Automatic injection section to enable sidecar injector.

3. Verify all pods are running
    ```
    kubectl get pods -n edgemicro-system
     ```
      ```
    NAME                                            READY     STATUS    RESTARTS   AGE
    default-http-backend-55c6c69b88-jf4tn           1/1       Running   0          3h
    edgemicro-ingress-controller-64444469bf-zw8r4   1/1       Running   3          3h
    edgemicro-sidecar-injector-65d78d5cf9-wv6vm     1/1       Running   0          3h
      ```
  
#### Install and Configure Edgemicro

   - Refer [here](https://docs.apigee.com/api-platform/microgateway/2.5.x/installing-edge-microgateway) for more details about installing edgemicro.

        ```
        npm install edgemicro -g
        edgemicro init
        ```
    - Configure Edgemicro to get Key and Secret. You may skip this step if you are doing automatic sidecar injection. The script can generate for you.
        ```
        edgemicro configure -o <org> -e <env> -u <user> -p <password>
        ```
    - Note down the key and secret generated. It also generates org-env-config.yaml file.


## Edgemicro as Service

#### Deploy Edgemicro

- Use edgemicroctl to deploy edgemicro in a kubernetes cluster. It uses the key and secret generated  above .
```
kubectl apply -f <(edgemicroctl -org=<org> -env=<env> -key=<edgemicro-key> -sec=<edgemicro-secret> -conf=<file path of org-env-config.yaml>)
```

- Setup nginx ingress controller for edgemicro
```
cat <<EOF | kubectl apply -f -
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: edge-microgateway-ingress
  annotations:
    kubernetes.io/ingress.class: "nginx"
spec:
  rules:
  - http:
      paths:
      - path: /
        backend:
          serviceName: edge-microgateway
          servicePort: 8000
EOF
```

#### Deploy Application 

- Deploy your service without any ingress controller.
```
kubectl apply -f samples/helloworld/helloworld-service.yaml
```

#### Verification Steps 

```
kubectl get services -n default
```
```
NAME                TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)          AGE
edge-microgateway   NodePort    10.55.242.99   <none>        8000:31984/TCP   5h
kubernetes          ClusterIP   10.55.240.1    <none>        443/TCP          6h
```

- Get Ingress controller
```
kubectl get ing -o wide
```

```
NAME                HOSTS     ADDRESS         PORTS     AGE
edge-microgateway   *         35.225.100.55   80        5h
```

- Get Ingress IP

```
export GATEWAY_IP=$(kubectl describe ing edge-microgateway --namespace default | grep "Address" | cut -d ':' -f2 | tr -d "[:space:]")

echo $GATEWAY_IP

```

- Get ClusterIP for helloworld service

```
kubectl get services helloworld
```


```
NAME         TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)          AGE
helloworld   NodePort   10.55.254.255   <none>        8081:30329/TCP   3m
```

- Record the clusterIP to generate the edgemicro api proxy in Edge. For ex - target IP in this case would be http://10.55.254.255:8081 (Cluster IP of helloworld service as above). 
Follow instructions [here](https://docs.apigee.com/api-platform/microgateway/2.5.x/setting-and-configuring-edge-microgateway#part2createentitiesonapigeeedge) to finish apigee setup.


- Call API 
You may have to wait for upto 10 mins(default refresh time) to get changes synched from edge.

```
echo "Call with API Key:"
curl  'x-api-key:your-edge-api-key' $GATEWAY_IP:80/hello;echo
```

### Cleanup Service Deployment

```
kubectl delete ing edge-microgateway
kubectl delete -f samples/helloworld/helloworld-service.yaml
kubectl delete -f <(edgemicroctl -org=<org> -env=<env> -key=<edgemicro-key> -sec=<edgemicro-secret> -conf=<file path of org-env-config.yaml>)


```

## Edgemicro as Sidecar

#### Deploy Application

You can now deploy your own application or one of the sample applications provided with the installation like helloworld. Note: the application must use HTTP/1.1 or HTTP/2.0 protocol for all its HTTP traffic because HTTP/1.0 is not supported.

If you started the edgemicro-sidecar-injector, as shown above, you can deploy the application directly using kubectl create. The steps for automatic sidecar injection is mentioned in sections below:

If you do not have the edgemicro-sidecar-injector installed, you must use edgemictoctl to manuallly inject Edgemicro containers in your application pods before deploying them:


```
kubectl apply -f <(edgemicroctl -org=<org> -env=<env> -key=<edgemicro-key> -sec=<edgemicro-secret>  -conf=<file path of org-env-config.yaml> -svc=<your-app-spec>.yaml)
```

Use the svc parameter to pass your service file. See the helloworld sample below for demonstration.


### Helloworld sample
[here](./docs/helloworld.md)

### Automatic Sidecar Injection
[here](./docs/automatic_sidecar.md)


### Container Ports and Service Ports for Sidecars

Edgemicro and Service runs on same pod as separate containers. Edgemicro creates a local proxy to your service and thus it requires to know the container port on which it can create a local proxy. The edgemicro container is aware of service port but not the container port. if your container port is same as service port, it picks up the port and create a local proxy on that port.

In case, you run your container on a seperate port than your service port, edgemicro needs to be aware of the containerport. In such case, edgemicro looks for “containerPort” label in your deployment template metadata and creates local connection on that port.

For ex :
```
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: httpbin-deployment
spec:
  replicas: 1
  template:
    metadata:
      labels:
        app: httpbin-app
        containerPort: "8082"
    spec:
      containers:
      - name: httpbin
        image: gcr.io/apigee-microgateway/httpbin:latest
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 8082
---
```

### Custom Plugins

To enable custom plugins to Microgateway, please refer to the documentation [here](./docker/edgemicro/README.md).

### Scaling Deployment

If you have deployed edgemicro as sidecar, by default it comes with 1 replica. You can use kubernetes scaling principles to scale your deployments

1. **Edgemicro as Service**

- Check the current deployment State
```
kubectl get deployments
NAME                DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
edge-microgateway   1         1         1            1           18h
helloworld          1         1         1            1           1d
```

- Scale the deployment from 1 to as many replicas you desire
```
kubectl scale deployment edge-microgateway --replicas=2
```

- In case you want to set for autoscaling, you can use following command 

```
kubectl autoscale deployment edge-microgateway --cpu-percent=50 --min=1 --max=10
```

- Check deployment and pods after Scaling
```
NAME                DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
edge-microgateway   2         2         2            2           18h
helloworld          1         1         1            1           1d

kubectl get pods
NAME                                 READY     STATUS    RESTARTS   AGE
edge-microgateway-57ccc7776b-g7nrg   1/1       Running   0          18h
edge-microgateway-57ccc7776b-rvfz4   1/1       Running   0          41s
helloworld-6987878fc4-cltc2          1/1       Running   0          1d

```

2. **Edgemicro as Sidecar**

- Check the Current deployment and Pod state
```
kubectl get deployments
NAME         DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
helloworld   1         1         1            1           2d

kubectl get pods
NAME                          READY     STATUS    RESTARTS   AGE
helloworld-6987878fc4-gz74k   2/2       Running   0          2d
```
- Scale the deployment from 1 to as many replicas you desire. In this case you scale the actual service.
```
kubectl scale deployment helloworld --replicas=2
```
- In case you want to set for autoscaling, you can use following command 

```
kubectl autoscale deployment helloworld --cpu-percent=50 --min=1 --max=10
```

- Check deployment and Pod state after Scaling
```
kubectl get deployments
NAME         DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
helloworld   2         2         2            2           2d

kubectl get pods
NAME                          READY     STATUS    RESTARTS   AGE
helloworld-6987878fc4-ftw78   2/2       Running   0          32s
helloworld-6987878fc4-gz74k   2/2       Running   0          2d
```


### Configuration Change 

There can be cases when you need to modify edgemicro configuration. Edgemicro gets its configuration from org-env-config.yaml file. When deploying edgemicro as a Service or as manual sidecar you pass a -conf parameter to edgemicroctl command. Edgemicro pod picks up this configuration from kubernetes secret object mgwsecret. This org-env config file tells edgemicro which policies to execute. What if you want to add a new policy to a running edgemicro? You don't have to wipe out the existing setup. You can follow the steps below to change the configuration.


- Create a secret configuration file secret.yaml as shown below :

```
---
apiVersion: v1
kind: Secret
metadata:
  name: mgwsecret
type: Opaque
data:
  mgorg: EDGEMICRO_ORG
  mgenv: EDGEMICRO_ENV
  mgkey: EDGEMICRO_KEY
  mgsecret: EDGEMICRO_SECRET
  mgconfig: EDGEMICRO_CONFIG
---
```

- Create base64 encoded value for mgorg,mgenv, mgkey,mgsecret, mgconfig and replace EDGEMICRO_ORG,EDGEMICRO_ENV,EDGEMICRO_KEY,EDGEMICRO_SECRET in secret.yaml file.

```
echo -n "your-org" | base64 | tr -d '\n'
echo -n "your-org-env" | base64 | tr -d '\n'
echo -n "your-mg-key" | base64 | tr -d '\n'
echo -n "your-mg-secret" | base64 | tr -d '\n'

```

- Update oue org-env-config.yaml with desired changes. If you are adding policy update the sequence section and add the new policy.
- Base64 Encode twice the contents of  config file. Update value of mgconfig in the secret.yaml file.
```
cat ~/.edgemicro/org-env-config.yaml | base64 | tr -d '\n' | base64  | tr -d '\n'
```

- Apply changes to kubernetes on the namespace where your service is running.
```
kubectl apply -f secret.yaml -n <your name space>
for ex in default namespace:
kubectl apply -f secret.yaml -n default


```

- These new changes will still be not picked up by existing microgateway pods. However the new pods will get the changes. You can delete the existing pod so that deployment creates a new pod. 

ex: for service:

```
kubectl get pods
NAME                                 READY     STATUS    RESTARTS   AGE
edge-microgateway-57ccc7776b-g7nrg   1/1       Running   0          19h
helloworld-6987878fc4-cltc2          1/1       Running   0          1d

kubectl delete pod edge-microgateway-57ccc7776b-g7nrg
pod "edge-microgateway-57ccc7776b-g7nrg" deleted

kubectl get pods
NAME                                 READY     STATUS    RESTARTS   AGE
edge-microgateway-57ccc7776b-7f6tc   1/1       Running   0          5s
helloworld-6987878fc4-cltc2          1/1       Running   0          1d
```

ex: for sidecar:

```
kubectl get pods
NAME                          READY     STATUS    RESTARTS   AGE
helloworld-7d5f5b6769-vcq6m   2/2       Running   0          32m

kubectl delete pod helloworld-7d5f5b6769-vcq6m
pod "helloworld-7d5f5b6769-vcq6m" deleted

kubectl get pods
NAME                          READY     STATUS        RESTARTS   AGE
helloworld-7d5f5b6769-cr4z5   2/2       Running       0          5s
helloworld-7d5f5b6769-vcq6m   0/2       Terminating   0          32m
```



### Multiple Edgemicro configuration

There may be scenarios where each service may require different set of policy. For ex Service A needs spike arrest and Service B needs oauth.

This can be handled by namespaces. Deploy serviceA and ServiceB  in seperate namespace. Edgemicro Configurations are specific to a namespace.

You can use -n option to specify namespace in your manual sidecar or service deployment

For ex: This deploys ServiceA in ServiceA namespace with its own configuration
```
kubectl apply -f <(edgemicroctl -org=myorgA -env=test-key=0e3ecea28a64099410594406b30e54439af5265f8 -sec=e3919250bee37c69cb2e5b41170b488e1c1d -conf=/Users/joed/.edgemicro/orgA-test-config.yaml -svc=samples/helloworld/helloworld.yaml) -n serviceA

```
This deploys ServiceB in ServiceB namespace with its own configuration

```
kubectl apply -f <(edgemicroctl -org=myorgB -env=test-key=0e3ecea28a64099410594406b30e54439af5265f8 -sec=e3919250bee37c69cb2e5b41170b488e1c1d -conf=/Users/joed/.edgemicro/orgB-test-config.yaml -svc=samples/helloworld/helloworld.yaml) -n serviceB

```

### Understanding edgemicroctl

edgemicroctl is a tool that allows you to deploy edgemicro in a kubernetes container. You can use this for edgemicro as service deployment or manual sidecar deployment.

```
Usage: edgemicroctl -org=<orgname> -env=<envname> -user=<username> -pass=<password> -conf=<conf file>

Options:
org  = Apigee Edge Organization name (mandatory)
env  = Apigee Edge Environment name (mandatory)
key  = Apigee Edge Microgateway Key (mandatory)
sec  = Apigee Edge Microgateway Secret (mandatory)
conf = Apigee Edge Microgateway configuration file (mandatory)

For Sidecar deployment
svc  = Kubernetes Service configuration file (mandatory)

Other options:
nam    = Kubernetes namespace; default is default
mgVer  = Microgateway version; default is latest
img  = Apigee Edge Microgateway docker image (optional)
debug  = Enable debug mode (default: false)


Example for Sidecar: edgemicroctl -org=trial -env=test -conf=trial-test-config.yaml -svc=myservice.yaml -key=xxxx -sec=xxxx


Example for Sidecar: edgemicroctl -org=trial -env=test -conf=trial-test-config.yaml -svc=myservice.yaml -key=xxxx -sec=xxxx -svc=samples/helloworld/helloworld.yaml

Example for Pod: edgemicroctl -org=trial -env=test -conf=trial-test-config.yaml -svc=myservice.yaml -key=xxxx -sec=xxxx
```


## Uninstall Edgemicro
```
kubectl delete -f install/kubernetes/edgemicro-nginx-gke.yaml
kubectl delete -f install/kubernetes/edgemicro.yaml
gcloud beta container clusters delete edge-micro

```

### Build & Release


In order to build the binaries locally, you need to install these two components

- go
- goreleaser

Once these are installed, there are many choices to build and release edgemicroctl. On your ./kubernetes/edgemicroctl  folder :


- Build locally with go for testing.

```
go build
```
This will create edgemicroctl binary under the same folder.


- Build locally with goreleaser

```
goreleaser --snapshot --skip-publish --rm-dist
```
This will create the snapshot release under ./kubernetes/edgemicroctl/dist folder. 


- Create github release:
```
export GITHUB_TOKEN=<<your github api token>>
goreleaser
```

## References
It uses istio-sidecar-proxy-injector and istio-init docker images from istio project.


## License

Apache 2.0 - See [LICENSE](LICENSE) for more information.
