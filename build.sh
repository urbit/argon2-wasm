#!/usr/bin/env bash
rm -rf generated && mkdir generated &&
./clean-cmake.sh && ./build-wasm.sh &&
./clean-cmake.sh
echo Done
