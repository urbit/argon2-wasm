#!/usr/bin/env bash
rm -rf dist && mkdir dist &&
./clean-cmake.sh && ./build-wasm.sh &&
./clean-cmake.sh
echo Done
