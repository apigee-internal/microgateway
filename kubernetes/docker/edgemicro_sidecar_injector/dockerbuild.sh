
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ $# -ne 2 ]; then 
	echo "Please provide edgemicro_sidecar version and GCP project id"
fi

version=$1
project_id=$2

docker pull docker.io/istio/sidecar_injector:0.6.0

if [ $# -eq 2 ]; then
  docker tag docker.io/istio/sidecar_injector:0.6.0 gcr.io/$project_id/sidecar_injector:$version
  docker tag docker.io/istio/sidecar_injector:0.6.0 gcr.io/$project_id/sidecar_injector:latest
  docker push gcr.io/$project_id/sidecar_injector:$version
  docker push gcr.io/$project_id/sidecar_injector:latest
fi
