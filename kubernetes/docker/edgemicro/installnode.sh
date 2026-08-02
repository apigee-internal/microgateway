#!/bin/bash
set -e

# Allow installing dependencies directly from Git repositories (npm v12+)
npm config set allow-git all --global || true

# 1. Install globally (this line is targeted by betabuild.sh's sed replacement)
npm install --omit=dev --omit=optional -g edgemicro

# 2. Navigate to the globally installed package and run install to apply committed overrides
cd "$(npm root -g)/edgemicro"
npm install --omit=dev --omit=optional
