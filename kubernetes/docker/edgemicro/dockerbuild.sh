#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <edgemicro-version> [gcp-project-id] [--dry-run]"
  echo "Example: $0 3.3.11"
  echo "Example: $0 3.3.11 --dry-run"
  exit 1
fi

version=$1
project_id="apigee-microgateway"
dry_run=false

for arg in "$@"; do
  [ "$arg" == "--dry-run" ] && dry_run=true
  [[ "$arg" != "--dry-run" && "$arg" != "$version" ]] && project_id="$arg"
done

echo "Checking existing tags in Artifact Registry for $version..."
all_tags=$(gcloud artifacts docker tags list "us-docker.pkg.dev/$project_id/gcr.io/edgemicro" --format="value(tag)" 2>/dev/null || true)

has_base=false
max=0
for tag in $all_tags; do
  [ "$tag" == "$version" ] && has_base=true
  if [[ "$tag" =~ ^${version}-sec\.([0-9]+)$ ]]; then
    (( BASH_REMATCH[1] > max )) && max="${BASH_REMATCH[1]}"
  fi
done

if [ "$has_base" = false ]; then
  image_tag="$version"
  echo "Base tag '$version' not found. Publishing initial release: $image_tag"
else
  image_tag="$version-sec.$((max + 1))"
  echo "Base tag '$version' exists. Auto-publishing security rebuild: $image_tag"
fi

tags_to_push=("$image_tag" "latest")
echo "NPM package: edgemicro@$version"
echo "Image tags:  ${tags_to_push[*]}"

if [ "$dry_run" = true ]; then
  echo "[DRY RUN] Finished check. No images built or pushed."
  exit 0
fi

# Configure Docker for gcr.io if not already configured
if [ ! -f ~/.docker/config.json ] || ! grep -q "gcr.io" ~/.docker/config.json; then
  echo "Configuring Docker for gcr.io..."
  gcloud auth configure-docker gcr.io --quiet
fi

# Always restore installnode.sh on exit
trap 'mv -f installnode.sh.bak installnode.sh 2>/dev/null || true' EXIT
sed -i.bak "s|npm install.*-g edgemicro.*|npm install --omit=dev --omit=optional -g edgemicro@$version|g" installnode.sh

docker build --provenance=false --pull --no-cache -t edgemicro:$image_tag "$DIR"

for t in "${tags_to_push[@]}"; do
  echo "Pushing: gcr.io/$project_id/edgemicro:$t"
  docker tag edgemicro:$image_tag "gcr.io/$project_id/edgemicro:$t"
  docker push "gcr.io/$project_id/edgemicro:$t"
done

echo "Successfully published: ${tags_to_push[*]}"
