#!/usr/bin/env bash
cmake \
    -DOUTPUT_NAME="argon2" \
    -DCMAKE_TOOLCHAIN_FILE=$EMSCRIPTEN/cmake/Modules/Platform/Emscripten.cmake \
    -DCMAKE_VERBOSE_MAKEFILE=OFF \
    -DCMAKE_BUILD_TYPE=MinSizeRel \
    -DCMAKE_C_FLAGS="-O3" \
    -DCMAKE_EXE_LINKER_FLAGS="-O0 -g0 --memory-init-file 0 -s NO_FILESYSTEM=1 -s 'EXPORTED_FUNCTIONS=[\"_argon2_hash\",\"_argon2_error_message\"]' -s 'EXTRA_EXPORTED_RUNTIME_METHODS=[\"intArrayFromString\",\"ALLOC_NORMAL\",\"allocate\",\"Pointer_stringify\"]' -s DEMANGLE_SUPPORT=0 -s ASSERTIONS=1 -s NO_EXIT_RUNTIME=1 -s TOTAL_MEMORY=520MB -s BINARYEN_MEM_MAX=2147418112 -s MODULARIZE=1 -s WASM=1" && cmake --build .
mv generated/argon2.js generated/emscripten-runner.js
echo -en "var base64js = require('../lib/base64.js');\n\nlet wasmBinaryBase64 = \"" > ./generated/argon2.wasm.js
base64 generated/argon2.wasm | tr -d "\n" >> ./generated/argon2.wasm.js
echo -en "\";\n\nmodule.exports = base64js.toByteArray(wasmBinaryBase64);\n" >> ./generated/argon2.wasm.js
