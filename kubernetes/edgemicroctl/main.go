// Copyright 2018 Google
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package main

import (
	b64 "encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	yml "github.com/ghodss/yaml"
	"io"
	"io/ioutil"
	appsv1beta1 "k8s.io/api/apps/v1beta1"
	"k8s.io/api/core/v1"
	res "k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/client-go/kubernetes/scheme"
	"log"
	"os"
	"path/filepath"
	"strings"
)

var (
	org string
	env string
	configFile string
	key string
	scrt string
	mgVer string
	img string
	namespace string
)

var configFileData []byte
var containerRegURL = "gcr.io/apigee-microgateway/"
var fileerr error

const version string = "1.0.0"

var infoLogger bool
var sideCar = false
var mgDebug = false

//log levels, default is error
var (
	Info    *log.Logger
	Warning *log.Logger
	Error   *log.Logger
)

//Init function initializes the logger objects
func Init(
	infoHandle io.Writer,
	warningHandle io.Writer,
	errorHandle io.Writer) {

	Info = log.New(infoHandle,
		"INFO: ",
		log.Ldate|log.Ltime|log.Lshortfile)

	Warning = log.New(warningHandle,
		"WARNING: ",
		log.Ldate|log.Ltime|log.Lshortfile)

	Error = log.New(errorHandle,
		"ERROR: ",
		log.Ldate|log.Ltime|log.Lshortfile)
}

func createSecret() v1.Secret {
	secret := v1.Secret{}
	secret.APIVersion = "v1"
	secret.Kind = "Secret"
	datamap := make(map[string][]byte)
	datamap["mgorg"] = ([]byte(org))
	datamap["mgenv"] = ([]byte(env))
	datamap["mgkey"] = ([]byte(key))
	datamap["mgsecret"] = ([]byte(scrt))
	datamap["mgconfig"] = []byte(b64.StdEncoding.EncodeToString(configFileData))

	secret.Name = "mgwsecret"
	if namespace != "default" {
		secret.Namespace = namespace
	}
	secret.Type = "Opaque"
	secret.Data = datamap
	return secret
}

func printSecret(secret v1.Secret) {
	jsonsecret, _ := json.Marshal(&secret)
	yamlout, _ := yml.JSONToYAML(jsonsecret)
	fmt.Printf(string(yamlout))
	fmt.Println("---")
}

func getResources() v1.ResourceRequirements {
	resources := v1.ResourceRequirements{}
	limits := v1.ResourceList{}
	requests := v1.ResourceList{}

	limits["cpu"] = getQuantity(1, true)
	limits["memory"] = getQuantity(2*1024*1024*1024, false) //"2048Mi"

	requests["cpu"] = getQuantity(1, true)
	requests["memory"] = getQuantity(1*1024*1024*1024, false) //"1024Mi"

	resources.Limits = limits
	resources.Requests = requests
	return resources
}

func getQuantity(unit int64, decimal bool) res.Quantity {
	var quantity *res.Quantity
	if decimal == true {
		quantity = res.NewQuantity(unit, res.DecimalSI)
	} else {
		quantity = res.NewQuantity(unit, res.BinarySI)
	}
	return *quantity
}

func createContainer(img string) v1.Container {
	container := v1.Container{}
	port := v1.ContainerPort{}
	port.ContainerPort = 8000
	container.Name = "edge-microgateway"
	if img == "" {
		container.Image = containerRegURL + "edgemicro:" + mgVer
	} else {
		container.Image = img
	}
	container.Ports = append(container.Ports, port)
	container.Env = append(container.Env, createEnv("EDGEMICRO_ORG", "mgwsecret", "mgorg"))
	container.Env = append(container.Env, createEnv("EDGEMICRO_ENV", "mgwsecret", "mgenv"))
	container.Env = append(container.Env, createEnv("EDGEMICRO_KEY", "mgwsecret", "mgkey"))
	container.Env = append(container.Env, createEnv("EDGEMICRO_SECRET", "mgwsecret", "mgsecret"))
	container.Env = append(container.Env, createEnv("EDGEMICRO_CONFIG", "mgwsecret", "mgconfig"))
	if mgDebug {
		container.Env = append(container.Env, createEnvVal("DEBUG", "*"))
	}
	if sideCar {
		container.Env = append(container.Env, createEnvVal("EDGEMICRO_DECORATOR", "1"))
		container.Env = append(container.Env, createEnvVal("EDGEMICRO_LOCAL_PROXY", "1"))
		container.Env = append(container.Env, createEnvValField("CONTAINER_PORT", "metadata.labels['containerPort']"))
	}
	container.Env = append(container.Env, createEnvVal("EDGEMICRO_CONFIG_DIR", "/opt/apigee/.edgemicro"))
	container.Env = append(container.Env, createEnvValField("POD_NAME", "metadata.name"))
	container.Env = append(container.Env, createEnvValField("POD_NAMESPACE", "metadata.namespace"))
	container.Env = append(container.Env, createEnvValField("INSTANCE_IP", "status.podIP"))
	container.ImagePullPolicy = "Always"
	container.Resources = getResources()
	return container
}

func createInitContainer1() v1.Container {
	container := v1.Container{}
	var args = []string{"-p", "8000", "-u", "1001"}
	container.Name = "edgemicro-init"
	container.Image = containerRegURL + "edgemicro_proxy_init:latest"
	container.Args = args
	container.ImagePullPolicy = "Always"
	container.SecurityContext = createSecContext()
	return container
}

func getInitContainers() []v1.Container {
	var containers []v1.Container
	containers = append(containers, createInitContainer1())
	return containers
}

func createSecContext() *v1.SecurityContext {
	secContext := v1.SecurityContext{}
	secContext.Capabilities = createCapabilities()
	return &secContext
}

func createPodSecContext(user int64, group int64) *v1.PodSecurityContext {
	podSecContext := v1.PodSecurityContext{}
	var nonRoot bool = true

	//podSecContext.RunAsGroup = &group
	podSecContext.RunAsUser = &user
	podSecContext.RunAsNonRoot = &nonRoot
	return &podSecContext;
}

func createCapabilities() *v1.Capabilities {
	capabilities := v1.Capabilities{}
	capabilities.Add = append(capabilities.Add, "NET_ADMIN")
	return &capabilities
}

func createEnv(name string, refname string, refkey string) v1.EnvVar {
	env := v1.EnvVar{}
	env.Name = name
	env.ValueFrom = createEnvVarSource(refname, refkey)
	return env
}

func createEnvVal(name string, value string) v1.EnvVar {
	env := v1.EnvVar{}
	env.Name = name
	env.Value = value
	return env
}

func createEnvValField(name string, fieldpath string) v1.EnvVar {
	env := v1.EnvVar{}
	env.Name = name
	env.ValueFrom = createEnvVarSource2(fieldpath)
	return env
}

func createEnvVarSource(refname string, refkey string) *v1.EnvVarSource {
	envvar := v1.EnvVarSource{}
	envvar.SecretKeyRef = createSecretKeyRef(refname, refkey)
	return &envvar
}

func createEnvVarSource2(fieldpath string) *v1.EnvVarSource {
	envvar := v1.EnvVarSource{}
	envvar.FieldRef = createFieldRef(fieldpath)
	return &envvar
}

func createFieldRef(fieldpath string) *v1.ObjectFieldSelector {
	fieldsel := v1.ObjectFieldSelector{}
	fieldsel.FieldPath = fieldpath
	return &fieldsel
}

func createSecretKeyRef(refname string, refkey string) *v1.SecretKeySelector {
	secretkey := v1.SecretKeySelector{}
	secretkey.Name = refname
	secretkey.Key = refkey
	return &secretkey
}

func recurse(yamlDecoder io.ReadCloser, reader *os.File, yamlData []byte) {

	// Create decoding function used for YAML to JSON decoding
	decode := scheme.Codecs.UniversalDeserializer().Decode

	// Read first resource - expecting deployment with size < 2048
	yamlData = make([]byte, 1024)
	_, err := yamlDecoder.Read(yamlData)
	if err != nil {
		return
	}

	// Trim unnecessary trailing 0x0 signs which are not accepted
	trimmedYaml := strings.TrimRight(string(yamlData), string(byte(0)))
	t := strings.TrimSpace(trimmedYaml)

	if t != "" {
	} else {
		return
	}

	// Decode deployment resource from YAML to JSON
	jsonData, _, err := decode([]byte(trimmedYaml), nil, nil)
	if err != nil {
		panic(err)
	}

	// Check "kind: deployment"
	if jsonData.GetObjectKind().GroupVersionKind().Kind != "Deployment" {
		out, _ := json.Marshal(jsonData)
		yamlout, _ := yml.JSONToYAML(out)
		fmt.Println(string(yamlout))
		fmt.Println("---")

	} else {
		// Marshall JSON deployment
		d, err := json.Marshal(&jsonData)
		if err != nil {
			panic(err)
		}

		// Unmarshall JSON into deployment struct
		var deployment appsv1beta1.Deployment
		err = json.Unmarshal(d, &deployment)
		if err != nil {
			panic(err)
		}
		//set security context
		deployment.Spec.Template.Spec.SecurityContext = createPodSecContext(100, 101)
		deployment.Spec.Template.Spec.Containers = append(deployment.Spec.Template.Spec.Containers, createContainer(img))
		deployment.Spec.Template.Spec.InitContainers = getInitContainers()
		newDeployment, _ := json.Marshal(&deployment)
		yamlout, _ := yml.JSONToYAML(newDeployment)
		fmt.Printf(string(yamlout))
		fmt.Printf("\n---\n")

	}
	recurse(yamlDecoder, reader, yamlData)

}

func createService() (v1.Service, error) {
	targetPort := intstr.IntOrString{IntVal: 8000}
	labels := make(map[string]string)
	labels["app"] = "edge-microgateway"

	service := v1.Service{}
	metadata := metav1.ObjectMeta{}
	metadata.Name = "edge-microgateway"
	metadata.Namespace = namespace
	metadata.Labels = labels

	servicePort := v1.ServicePort{}
	servicePort.Port = 8000
	servicePort.Name = "http"
	servicePort.Protocol = "TCP"
	servicePort.TargetPort = targetPort

	service.APIVersion = "v1"
	service.Kind = "Service"
	service.Spec.Type = "NodePort"
	service.Spec.Ports = append(service.Spec.Ports, servicePort)
	service.ObjectMeta = metadata
	service.Spec.Selector = labels
	return service, nil
}

func createDeployment() (appsv1beta1.Deployment, error) {
	var replica int32 = 1

	labels := make(map[string]string)
	labels["app"] = "edge-microgateway"

	deployment := appsv1beta1.Deployment{}
	metadata := metav1.ObjectMeta{}
	metadata.Name = "edge-microgateway"
	metadata.Namespace = namespace
	deploymentSpec := appsv1beta1.DeploymentSpec{}
	podSpec := v1.PodSpec{}

	//set pod security 
	podSpec.SecurityContext = createPodSecContext(100,101)

	podSpec.Containers = append(podSpec.Containers, createContainer(img))
	template := v1.PodTemplateSpec{}
	tmetadata := metav1.ObjectMeta{}
	tmetadata.Labels = labels

	template.Spec = podSpec
	template.ObjectMeta = tmetadata

	deploymentSpec.Replicas = &replica
	deploymentSpec.Template = template

	deployment.APIVersion = "extensions/v1beta1"
	deployment.Kind = "Deployment"
	deployment.ObjectMeta = metadata
	deployment.Spec = deploymentSpec

	return deployment, nil
}

func printSpecification() {
	service, _ := createService()
	tmp, _ := json.Marshal(&service)
	yamlout, _ := yml.JSONToYAML(tmp)
	fmt.Printf(string(yamlout))
	fmt.Printf("---\n")
	deployment, _ := createDeployment()
	tmp, _ = json.Marshal(&deployment)
	yamlout, _ = yml.JSONToYAML(tmp)
	fmt.Printf(string(yamlout))
	fmt.Printf("---\n")
	secret := createSecret()
	tmp, _ = json.Marshal(&secret)
	yamlout, _ = yml.JSONToYAML(tmp)
	fmt.Printf(string(yamlout))
}

func usage(message string) {
	fmt.Println("")
	if message != "" {
		fmt.Println("Incorrect or incomplete parameters, ", message)
	}
	fmt.Println("edgemicroctl version ", version)
	fmt.Println("")
	fmt.Println("Usage: edgemicroctl -org=<orgname> -env=<envname> -conf=<conf file>")
	fmt.Println("")
	fmt.Println("Options:")
	fmt.Println("org  = Apigee Edge Organization name (mandatory)")
	fmt.Println("env  = Apigee Edge Environment name (mandatory)")
	fmt.Println("key  = Apigee Edge Microgateway Key (mandatory)")
	fmt.Println("sec  = Apigee Edge Microgateway Secret (mandatory)")
	fmt.Println("conf = Apigee Edge Microgateway configuration file (mandatory)")
	fmt.Println("")
	fmt.Println("For Sidecar deployment")
	fmt.Println("svc  = Kubernetes Service configuration file (mandatory)")
	fmt.Println("")
	fmt.Println("Other options:")
	fmt.Println("nam    = Kubernetes namespace; default is default")
	fmt.Println("mgVer  = Microgateway version; default is latest")
	fmt.Println("img  = Apigee Edge Microgateway docker image (optional)")
	fmt.Println("debug  = Enable debug mode (default: false)")
	fmt.Println("mgdebug = Enable MG debug (default: false)")
	fmt.Println("")
	fmt.Println("")
	fmt.Println("Example for Sidecar: edgemicroctl -org=trial -env=test -conf=trial-test-config.yaml -svc=myservice.yaml -key=xxxx -sec=xxxx")
	fmt.Println("Example for Pod: edgemicroctl -org=trial -env=test -conf=trial-test-config.yaml -key=xxxx -sec=xxxx")
	os.Exit(1)
}

func checkMandParams(org, env, username, password, configFile string) {
	if org == "" {
		usage("orgname cannot be empty")
	} else if env == "" {
		usage("envname cannot be empty")
	} else if configFile == "" {
		usage("configFile cannot be empty")
	} else if key == "" {
		usage("key cannot be empty")
	} else if scrt == "" {
		usage("secret cannot be empty")
	}
	if mgVer == "" {
		mgVer = "latest"
	}
}

func main() {

	var svcFile string
	flag.StringVar(&org, "org", "", "Apigee Organization Name")
	flag.StringVar(&env, "env", "", "Apigee Environment Name")
	flag.StringVar(&key, "key", "", "Microgateway Key")
	flag.StringVar(&scrt, "sec", "", "Microgateway Secret")
	flag.StringVar(&configFile, "conf", "", "Apigee Microgateway Config File")
	flag.StringVar(&svcFile, "svc", "", "k8s service yaml")
	flag.StringVar(&mgVer, "mgver", "", "Micrgoateway version")
	flag.StringVar(&img, "img", "", "Apigee Edge Microgateway docker image")
	flag.BoolVar(&infoLogger, "debug", false, "Enable debug mode")
	flag.StringVar(&namespace, "nam", "default", "Kubernetes namespace")
	flag.BoolVar(&mgDebug,"mgdebug", false, "Enable debug on the MG container")

	// Parse commandline parameters
	flag.Parse()

	//check mandatory params
	checkMandParams(org, env, key, scrt, configFile)

	if infoLogger {
		Init(os.Stdout, os.Stdout, os.Stderr)
	} else {
		Init(ioutil.Discard, os.Stdout, os.Stderr)
	}

	Info.Println("Reading Microgateway configuration file ", configFile)
	configFileData, fileerr = ioutil.ReadFile(configFile)

	if fileerr != nil {
		Error.Fatalln("Error opening config file:\n%#v\n", fileerr)
		return
	}

	if svcFile != "" {
		sideCar = true
		// Get filename
		yamlFilepath, err := filepath.Abs(svcFile)

		// Get reader from file opening
		reader, err := os.Open(yamlFilepath)
		if err != nil {
			panic(err)
		}

		// Split YAML into chunks or k8s resources, respectively
		yamlDecoder := yaml.NewDocumentDecoder(ioutil.NopCloser(reader))

		printSecret(createSecret())
		recurse(yamlDecoder, reader, nil)
	} else {
		printSpecification()
	}
}
