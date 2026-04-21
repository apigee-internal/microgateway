# edgemicroctl
edgemicroctl is an open source project that generates configuration to deploy Apigee Edge Microgateway on Kubernetes

## Support
This is an open-source project of the Apigee Corporation. It is not covered by Apigee support contracts. However, we will support you as best we can. For help, please open an issue in this GitHub project. You are also always welcome to submit a pull request.

## Download
Download the binary from [here](https://github.com/apiee-internal/microgateway/releases)

## Usage 1
```
edgemicroctl -org=<orgname> -env=<envname> -user=<username> -pass=<password> -conf=<conf file> -svc=<k8s yaml> -key=<mg key> -sec=<mg sec>
```

## Usage 2
```
edgemicroctl -org=<orgname> -env=<envname> -key=<mg key> -sec=<mg sec> -conf=<conf file> -img=<mg docker url>
```


### Options
```
org  = Apigee Edge Organization name (mandatory)
env  = Apigee Edge Environment name (mandatory)
key  = Apigee Edge Microgateway Key (mandatory)
sec  = Apigee Edge Microgateway Secret (mandatory)
conf = Apigee Edge Microgateway configuration file (mandatory)
```

For Sidecar deployment:
```
user = Apigee Edge Username (mandatory)
pass = Apigee Edge Password (mandatory)
svc  = Kubernetes Service configuration file (mandatory)
```

For Pod Deployment
```
img  = Apigee Edge Microgateway docker image (mandatory)
```

#### Other Options
```
nam    = Kubernetes namespace; default is default
murl   = Apigee Edge Management API Endpoint; Default is api.enterprise.apigee.com
debug  = Enable debug mode (default: false)
```

### How does it work?
To deploy Edge Microgateway as a Sidecar, see [here](https://https://github.com/edgemicro-kubernetes/edgemicro-k8)

To deploy Edge Microgateway as a Pod, 
1. Install Edge Microgateway (locally)
2. Configure Edge Microgateway, save the configuration file, key and secret
3. Run `edgemicroctl` as Usage 2 to generate a kubernetes deployment specification


### Build & Release

In order to build the binaries locally, you need to install these two components

- go  (Version - go1.13.8 + )
- goreleaser (Version - 0.127.0 + )

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


### TODO
* Automated testing
