#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../go"
# Pin gomobile and gobind to the same reviewed upstream commit.
MOBILE_VERSION=8b95e45f8d3e224183cc3d760609cef9896e498c
go get "golang.org/x/mobile@$MOBILE_VERSION"
go install "golang.org/x/mobile/cmd/gomobile@$MOBILE_VERSION"
go install "golang.org/x/mobile/cmd/gobind@$MOBILE_VERSION"
export PATH="$(go env GOPATH)/bin:$PATH"
gomobile init
mkdir -p ../app/libs
gomobile bind -target=android/arm64,android/amd64 -androidapi=26 -o ../app/libs/bridge.aar ./bridge
