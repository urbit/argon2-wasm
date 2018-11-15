#!/usr/bin/env bash
git submodule init
git submodule update
rm -rf generated && mkdir generated &&
./clean-cmake.sh && ./build-wasm.sh &&
./clean-cmake.sh
echo Done
