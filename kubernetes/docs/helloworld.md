
## Helloworld Sample

- Configure Edgemicro:
```
npm install edgemicro -g
edgemicro init
edgemicro configure -o <org> -e <env> -u <user> -p <password>
```
- Container Port and Service Port

In case the container port of your app is not the same as service port defined in your service spec, add a label **containerPort** in deployment spec. 

Please refer the httpbin samples:
```
---
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: helloworld
spec:
  replicas: 1
  template:
    metadata:
      labels:
        app: helloworld
        containerPort: "8081"

```

- Deploy Sample Service
```
kubectl apply -f <(edgemicroctl -org=<org> -env=<env> -key=<edgemicro-key> -sec=<edgemicro-sec> -conf=<file path of org-env-config.yaml> -svc=samples/helloworld/helloworld.yaml)
```

#### Testing the Sample Service

```
kubectl get services -n default
```

```
NAME         TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)          AGE
helloworld   NodePort    10.19.251.15   <none>        8081:30723/TCP   1m
kubernetes   ClusterIP   10.19.240.1    <none>        443/TCP          9m
```

- Get the ingress gateway IP address

```
kubectl get ing -o wide
```
```
NAME      HOSTS     ADDRESS        PORTS     AGE
gateway   *         35.226.55.56   80        1m
```

```
export GATEWAY_IP=$(kubectl describe ing gateway --namespace default | grep "Address" | cut -d ':' -f2 | tr -d "[:space:]")

echo $GATEWAY_IP

echo "Call with no API Key:"
curl $GATEWAY_IP:80;
```

* Edgemicro in sidecar starts as a Local Proxy so api proxy with edgemicro_ is not required. 

* Go to Edge UI and add a API Product.

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

### Uninstall Sample Service

```
kubectl delete -f samples/helloworld/helloworld.yaml
```


