
## Automatic Sidecar Injection

This section lists the steps required to enable automatic sidecar injection.

#### Install Sidecar Injection Configmap.

```
kubectl apply -f install/kubernetes/edgemicro-sidecar-injector-configmap-release.yaml
```

#### Install Webhook

Webhooks requires a signed cert/key pair. Use install/kubernetes/webhook-create-signed-cert.sh to generate a cert/key pair signed by the Kubernetes’ CA. The resulting cert/key file is stored as a Kubernetes secret for the sidecar injector webhook to consume.

Note: Kubernetes CA approval requires permissions to create and approve CSR. See https://kubernetes.io/docs/tasks/tls/managing-tls-in-a-cluster and install/kubernetes/webhook-create-signed-cert.sh for more information.

```
./install/kubernetes/webhook-create-signed-cert.sh \
    --service edgemicro-sidecar-injector \
    --namespace edgemicro-system \
    --secret sidecar-injector-certs
```


Set the caBundle in the webhook install YAML that the Kubernetes api-server uses to invoke the webhook.

```
cat install/kubernetes/edgemicro-sidecar-injector.yaml | \
     ./install/kubernetes/webhook-patch-ca-bundle.sh > \
     install/kubernetes/edgemicro-sidecar-injector-with-ca-bundle.yaml

```

Install the sidecar injector webhook.

```
kubectl apply -f install/kubernetes/edgemicro-sidecar-injector-with-ca-bundle.yaml

```

The sidecar injector webhook should now be running.

```
kubectl -n edgemicro-system get deployment -ledgemicro=sidecar-injector

NAME                         DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
edgemicro-sidecar-injector   1         1         1            1           12m

```

The sidecar injector pod should look like 

```
kubectl get pods -n edgemicro-system

NAME                                          READY     STATUS    RESTARTS   AGE
edgemicro-sidecar-injector-78bffbd44b-bct2r   1/1       Running   0          14m
```

#### Deploy helloworld app

```
kubectl apply -f samples/helloworld/helloworld.yaml --namespace=default
kubectl get pods --namespace=default

NAME                          READY     STATUS    RESTARTS   AGE
helloworld-569d6565f9-lwrrv   1/1       Running   0          17m

```
As you can see that helloworld pod came up with only 1 container. The injection is not yet enabled. 

Delete this deployment

```
kubectl delete -f samples/helloworld/helloworld.yaml --namespace=default
```

#### Edgemicro Configuration Profile 

Creae a edgemicro configuration and associate it with a kubernetes namespace. You can create different configuration profiles based on your apigee edge settings or edge micro configuration settings.

```
./install/kubernetes/webhook-edgemicro-patch.sh
```

You can also pass parameters for non interactive usage. Refer usage instructions.

```
./install/kubernetes/webhook-edgemicro-patch.sh -h
Usage: ./install/kubernetes/webhook-edgemicro-patch.sh [option...]

   -o, --apigee_org           * Apigee Organization.
   -e, --apigee_env           * Apigee Environment.
   -v, --virtual_host         * Virtual Hosts with comma seperated values.The values are like default,secure.
   -i, --private              y,if you are configuring Private Cloud. Default is n.
   -m, --mgmt_url             Management API URL needed if its Private Cloud
   -r, --api_base_path        API Base path needed if its Private Cloud
   -u, --user                 * Apigee Admin Email
   -p, --password             * Apigee Admin Password
   -t, --token                * Apigee Oauth Token File (Absolute Path)
   -n, --namespace            Namespace where your application is deployed. Default is default
   -k, --key                  * Edgemicro Key. If not specified it will generate.
   -s, --secret               * Edgemicro Secret. If not specified it will generate.
   -c, --config_file          * Specify the path of org-env-config.yaml. If not specified it will generate in ./install/kubernetes/config directory

```
For ex:
```
./install/kubernetes/webhook-edgemicro-patch.sh -i n -o gaccelerate5 -e test -v default -u <apigee email> -p <apigee-password>  -k <edgemicro key> -s <edgemicro secret> -c "/Users/rajeshmi/.edgemicro/gaccelerate5-test-config.yaml" -n default

```

if you use OAuth2 to access Management API, get a OAuth2 Apigee token. Please refer [here](https://docs.apigee.com/api-platform/system-administration/using-oauth2) for learning about Oauth2 Authentication for Management API. You can use acurl or get_token to obtain a token that silently stores the token in 
"~/.sso-cli folder".
You can pass the -t parameter with the absolute path of the token file. 
For ex:
```
./install/kubernetes/webhook-edgemicro-patch.sh -i n -o gaccelerate5 -e test -v default -t /Users/joed/.sso-cli/valid_token.dat  -k <edgemicro key> -s <edgemicro secret> -c "/Users/rajeshmi/.edgemicro/gaccelerate5-test-config.yaml" -n default

```


Run command below to inject the edgemicro config profile in kubernetes.

```
kubectl apply -f install/kubernetes/edgemicro-config-namespace-bundle.yaml
```

#### Enable Injection

NamespaceSelector decides whether to run the webhook on an object based on whether the namespace for that object matches the selector (see https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#label-selectors). The default webhook configuration uses edgemicro-injection=enabled.

```
kubectl get namespace -L edgemicro-injection

AME               STATUS    AGE       EDGEMICRO-INJECTION
default            Active    1d        
edgemicro-system   Active    1d
kube-public        Active    1d
kube-system        Active    1d
```

Label the default namespace with edgemicro-injection=enabled. In case you configured edgemicro with different namespace, specify your namespace.

```
kubectl label namespace default edgemicro-injection=enabled
kubectl get namespace -L edgemicro-injection

AME               STATUS    AGE       EDGEMICRO-INJECTION
default            Active    1d        enabled
edgemicro-system   Active    1d
kube-public        Active    1d
kube-system        Active    1d

```

#### Deploy sample app with Injection

- Container Port and Service Port

In case the container port of your app is not the same as service port defined in your service spec, add a label **containerPort** in deployment spec. In helloworld samples, they are same.

Please refer the httpbin samples:
```
---
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

```
- Deploy app with kubectl.

```
kubectl apply -f samples/helloworld/helloworld.yaml --namespace=default
kubectl get pods --namespace=default

NAME                          READY     STATUS    RESTARTS   AGE
helloworld-569d6565f9-lwrrv   2/2       Running   0          17m

```
As you can see that helloworld pod came up with 2 containers.


#### Accessing Service

kubectl get services -n default

```
NAME         TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)          AGE
helloworld   NodePort    10.19.251.15   <none>        8081:30723/TCP   1m
kubernetes   ClusterIP   10.19.240.1    <none>        443/TCP          9m
```

Get the ingress ip address

```
kubectl get ing -o wide
NAME      HOSTS     ADDRESS        PORTS     AGE
gateway   *         35.226.55.56   80        1m
```

```
export GATEWAY_IP=$(kubectl describe ing gateway --namespace default | grep "Address" | cut -d ':' -f2 | tr -d "[:space:]")

echo $GATEWAY_IP

echo "Call with no API Key:"
curl $GATEWAY_IP:80;
```
Edgemicro in sidecar starts as a Local Proxy so api proxy with edgemicro_ is not required. 

Go to Edge UI and add a API Product.

- Select Publish > API Products in the side navigation menu.
- Click + API Product. The Product Page Appears.
- Fill out the Product page with name, description, name.
- In the Path section, click + Custom Resources and add the custom Resource Path. In this case add / and /** as Custom Path
- In the API Proxies section, click  + API Proxy and add edgemicro-auth. 
- Save the API Product
- Create a Developer App for the API Product.
- Get the consumer key of the app created.

```
echo "Call with API Key:"
curl -H 'x-api-key:your-edge-api-key' $GATEWAY_IP:80;echo
```

### Disable injection

```
kubectl label namespace default edgemicro-injection-
```

## Uninstall Edgemicrok8 setup with Sidecar injection
```
kubectl delete -f samples/helloworld/helloworld.yaml --namespace=default
kubectl delete -f install/kubernetes/edgemicro-sidecar-injector-with-ca-bundle.yaml
kubectl -n edgemicro-system delete secret sidecar-injector-certs
kubectl delete csr edgemicro-sidecar-injector.edgemicro-system
kubectl label namespace default edgemicro-injection-
kubectl delete -f install/kubernetes/edgemicro-config-namespace-bundle.yaml
kubectl delete -f install/kubernetes/edgemicro-sidecar-injector-configmap-release.yaml

rm -fr  install/kubernetes/edgemicro-sidecar-injector-with-ca-bundle.yaml
rm -fr  install/kubernetes/config/*config.yaml
rm -fr  install/kubernetes/edgemicro-config-namespace-bundle.yaml

kubectl delete -f install/kubernetes/edgemicro-nginx-gke.yaml
kubectl delete -f install/kubernetes/edgemicro.yaml

```