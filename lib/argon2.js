!function(globalRoot, factory) {
  if ('function' === typeof define && define.amd)
    define('mymodule', [], function() { return (globalRoot.mymodule = factory()) })
  else if ('object' === typeof module && module.exports)
    module.exports = factory()
  else
    globalRoot.mymodule = factory()
}(this, function() {
  'use strict'

  var isBrowser = typeof window !== 'undefined';
  var g = isBrowser ? window : global;
  var root = isBrowser ? '' : '../';
  // var fs = require('fs');
  var base64js = require('./base64.js');

  /**
   * Argon2 hash
   * @param {string} params.pass - password string
   * @param {string} params.salt - salt string
   * @param {float}  [params.time=1] - the number of iterations
   * @param {float}  [params.mem=1024] - used memory, in KiB
   * @param {float}  [params.hashLen=24] - desired hash length
   * @param {float}  [params.parallelism=1] - desired parallelism (will be computed in parallel only for PNaCl)
   * @param {number} [params.type=argon2.ArgonType.Argon2d] - hash type: argon2.ArgonType.Argon2d, .Argon2i, .Argon2id or .Argon2u
   * @param {number} [params.distPath=.] - asm.js script location, without trailing slash
   *
   * @return Promise
   *
   * @example
   *  argon2.hash({ pass: 'password', salt: 'somesalt' })
   *      .then(h => console.log(h.hash, h.hashHex, h.encoded))
   *      .catch(e => console.error(e.message, e.code))
   */
  function argon2(args) {
      if (!WebAssembly) {
          return new Promise((resolve, reject) => {
              reject({message: 'WebAssembly not supported here.', code:-4040});
          });
      }

      if (g.Module && g.Module._argon2_hash) {
          return new Promise((resolve, reject) => {
              try {
                  resolve(calcHash(args));
              } catch(e) {
                  reject(e);
              }
          });
      }

      const runDist = (Module) => {
        var moduleOverrides = {};
        var key;
        for (key in Module) {
            if (Module.hasOwnProperty(key)) {
                moduleOverrides[key] = Module[key]
            }
        }
        Module["arguments"] = [];
        Module["thisProgram"] = "./this.program";
        Module["quit"] = (function(status, toThrow) {
            throw toThrow
        });
        Module["preRun"] = [];
        Module["postRun"] = [];
        var ENVIRONMENT_IS_WEB = false;
        var ENVIRONMENT_IS_WORKER = false;
        var ENVIRONMENT_IS_NODE = false;
        var ENVIRONMENT_IS_SHELL = false;
        ENVIRONMENT_IS_WEB = typeof window === "object";
        ENVIRONMENT_IS_WORKER = typeof importScripts === "function";
        ENVIRONMENT_IS_NODE = typeof process === "object" && typeof require === "function" && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
        ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
        if (Module["ENVIRONMENT"]) {
            throw new Error("Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -s ENVIRONMENT=web or -s ENVIRONMENT=node)")
        }
        if (ENVIRONMENT_IS_NODE) {
            var nodeFS;
            var nodePath;
            Module["read"] = function shell_read(filename, binary) {
                var ret;
                if (!nodeFS) nodeFS = require("fs");
                if (!nodePath) nodePath = require("path");
                filename = nodePath["normalize"](filename);
                ret = nodeFS["readFileSync"](filename);
                return binary ? ret : ret.toString()
            };
            Module["readBinary"] = function readBinary(filename) {
                var ret = Module["read"](filename, true);
                if (!ret.buffer) {
                    ret = new Uint8Array(ret)
                }
                assert(ret.buffer);
                return ret
            };
            if (process["argv"].length > 1) {
                Module["thisProgram"] = process["argv"][1].replace(/\\/g, "/")
            }
            Module["arguments"] = process["argv"].slice(2);
            if (typeof module !== "undefined") {
                module["exports"] = Module
            }
            process["on"]("uncaughtException", (function(ex) {
                if (!(ex instanceof ExitStatus)) {
                    throw ex
                }
            }));
            process["on"]("unhandledRejection", (function(reason, p) {
                err("node.js exiting due to unhandled promise rejection");
                process["exit"](1)
            }));
            Module["quit"] = (function(status) {
                process["exit"](status)
            });
            Module["inspect"] = (function() {
                return "[Emscripten Module object]"
            })
        } else if (ENVIRONMENT_IS_SHELL) {
            if (typeof read != "undefined") {
                Module["read"] = function shell_read(f) {
                    return read(f)
                }
            }
            Module["readBinary"] = function readBinary(f) {
                var data;
                if (typeof readbuffer === "function") {
                    return new Uint8Array(readbuffer(f))
                }
                data = read(f, "binary");
                assert(typeof data === "object");
                return data
            };
            if (typeof scriptArgs != "undefined") {
                Module["arguments"] = scriptArgs
            } else if (typeof arguments != "undefined") {
                Module["arguments"] = arguments
            }
            if (typeof quit === "function") {
                Module["quit"] = (function(status) {
                    quit(status)
                })
            }
        } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
            Module["read"] = function shell_read(url) {
                var xhr = new XMLHttpRequest;
                xhr.open("GET", url, false);
                xhr.send(null);
                return xhr.responseText
            };
            if (ENVIRONMENT_IS_WORKER) {
                Module["readBinary"] = function readBinary(url) {
                    var xhr = new XMLHttpRequest;
                    xhr.open("GET", url, false);
                    xhr.responseType = "arraybuffer";
                    xhr.send(null);
                    return new Uint8Array(xhr.response)
                }
            }
            Module["readAsync"] = function readAsync(url, onload, onerror) {
                var xhr = new XMLHttpRequest;
                xhr.open("GET", url, true);
                xhr.responseType = "arraybuffer";
                xhr.onload = function xhr_onload() {
                    if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                        onload(xhr.response);
                        return
                    }
                    onerror()
                };
                xhr.onerror = onerror;
                xhr.send(null)
            };
            Module["setWindowTitle"] = (function(title) {
                document.title = title
            })
        } else {
            throw new Error("environment detection error")
        }
        var out = Module["print"] || (typeof console !== "undefined" ? console.log.bind(console) : typeof print !== "undefined" ? print : null);
        var err = Module["printErr"] || (typeof printErr !== "undefined" ? printErr : typeof console !== "undefined" && console.warn.bind(console) || out);
        for (key in moduleOverrides) {
            if (moduleOverrides.hasOwnProperty(key)) {
                Module[key] = moduleOverrides[key]
            }
        }
        moduleOverrides = undefined;
        var STACK_ALIGN = 16;
        stackSave = stackRestore = stackAlloc = setTempRet0 = getTempRet0 = (function() {
            abort("cannot use the stack before compiled code is ready to run, and has provided stack access")
        });

        function staticAlloc(size) {
            assert(!staticSealed);
            var ret = STATICTOP;
            STATICTOP = STATICTOP + size + 15 & -16;
            assert(STATICTOP < TOTAL_MEMORY, "not enough memory for static allocation - increase TOTAL_MEMORY");
            return ret
        }

        function dynamicAlloc(size) {
            assert(DYNAMICTOP_PTR);
            var ret = HEAP32[DYNAMICTOP_PTR >> 2];
            var end = ret + size + 15 & -16;
            HEAP32[DYNAMICTOP_PTR >> 2] = end;
            if (end >= TOTAL_MEMORY) {
                var success = enlargeMemory();
                if (!success) {
                    HEAP32[DYNAMICTOP_PTR >> 2] = ret;
                    return 0
                }
            }
            return ret
        }

        function alignMemory(size, factor) {
            if (!factor) factor = STACK_ALIGN;
            var ret = size = Math.ceil(size / factor) * factor;
            return ret
        }

        function getNativeTypeSize(type) {
            switch (type) {
                case "i1":
                case "i8":
                    return 1;
                case "i16":
                    return 2;
                case "i32":
                    return 4;
                case "i64":
                    return 8;
                case "float":
                    return 4;
                case "double":
                    return 8;
                default:
                    {
                        if (type[type.length - 1] === "*") {
                            return 4
                        } else if (type[0] === "i") {
                            var bits = parseInt(type.substr(1));
                            assert(bits % 8 === 0);
                            return bits / 8
                        } else {
                            return 0
                        }
                    }
            }
        }

        function warnOnce(text) {
            if (!warnOnce.shown) warnOnce.shown = {};
            if (!warnOnce.shown[text]) {
                warnOnce.shown[text] = 1;
                err(text)
            }
        }
        var asm2wasmImports = {
            "f64-rem": (function(x, y) {
                return x % y
            }),
            "debugger": (function() {
                debugger
            })
        };
        var functionPointers = new Array(0);
        var GLOBAL_BASE = 1024;
        var ABORT = 0;
        var EXITSTATUS = 0;

        function assert(condition, text) {
            if (!condition) {
                abort("Assertion failed: " + text)
            }
        }

        function setValue(ptr, value, type, noSafe) {
            type = type || "i8";
            if (type.charAt(type.length - 1) === "*") type = "i32";
            switch (type) {
                case "i1":
                    HEAP8[ptr >> 0] = value;
                    break;
                case "i8":
                    HEAP8[ptr >> 0] = value;
                    break;
                case "i16":
                    HEAP16[ptr >> 1] = value;
                    break;
                case "i32":
                    HEAP32[ptr >> 2] = value;
                    break;
                case "i64":
                    tempI64 = [value >>> 0, (tempDouble = value, +Math_abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math_min(+Math_floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[ptr >> 2] = tempI64[0], HEAP32[ptr + 4 >> 2] = tempI64[1];
                    break;
                case "float":
                    HEAPF32[ptr >> 2] = value;
                    break;
                case "double":
                    HEAPF64[ptr >> 3] = value;
                    break;
                default:
                    abort("invalid type for setValue: " + type)
            }
        }
        var ALLOC_NORMAL = 0;
        var ALLOC_STATIC = 2;
        var ALLOC_NONE = 4;

        function allocate(slab, types, allocator, ptr) {
            var zeroinit, size;
            if (typeof slab === "number") {
                zeroinit = true;
                size = slab
            } else {
                zeroinit = false;
                size = slab.length
            }
            var singleType = typeof types === "string" ? types : null;
            var ret;
            if (allocator == ALLOC_NONE) {
                ret = ptr
            } else {
                ret = [typeof _malloc === "function" ? _malloc : staticAlloc, stackAlloc, staticAlloc, dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length))
            }
            if (zeroinit) {
                var stop;
                ptr = ret;
                assert((ret & 3) == 0);
                stop = ret + (size & ~3);
                for (; ptr < stop; ptr += 4) {
                    HEAP32[ptr >> 2] = 0
                }
                stop = ret + size;
                while (ptr < stop) {
                    HEAP8[ptr++ >> 0] = 0
                }
                return ret
            }
            if (singleType === "i8") {
                if (slab.subarray || slab.slice) {
                    HEAPU8.set(slab, ret)
                } else {
                    HEAPU8.set(new Uint8Array(slab), ret)
                }
                return ret
            }
            var i = 0,
                type, typeSize, previousType;
            while (i < size) {
                var curr = slab[i];
                type = singleType || types[i];
                if (type === 0) {
                    i++;
                    continue
                }
                assert(type, "Must know what type to store in allocate!");
                if (type == "i64") type = "i32";
                setValue(ret + i, curr, type);
                if (previousType !== type) {
                    typeSize = getNativeTypeSize(type);
                    previousType = type
                }
                i += typeSize
            }
            return ret
        }

        function Pointer_stringify(ptr, length) {
            if (length === 0 || !ptr) return "";
            var hasUtf = 0;
            var t;
            var i = 0;
            while (1) {
                assert(ptr + i < TOTAL_MEMORY);
                t = HEAPU8[ptr + i >> 0];
                hasUtf |= t;
                if (t == 0 && !length) break;
                i++;
                if (length && i == length) break
            }
            if (!length) length = i;
            var ret = "";
            if (hasUtf < 128) {
                var MAX_CHUNK = 1024;
                var curr;
                while (length > 0) {
                    curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
                    ret = ret ? ret + curr : curr;
                    ptr += MAX_CHUNK;
                    length -= MAX_CHUNK
                }
                return ret
            }
            return UTF8ToString(ptr)
        }
        var UTF8Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf8") : undefined;

        function UTF8ArrayToString(u8Array, idx) {
            var endPtr = idx;
            while (u8Array[endPtr]) ++endPtr;
            if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
                return UTF8Decoder.decode(u8Array.subarray(idx, endPtr))
            } else {
                var u0, u1, u2, u3, u4, u5;
                var str = "";
                while (1) {
                    u0 = u8Array[idx++];
                    if (!u0) return str;
                    if (!(u0 & 128)) {
                        str += String.fromCharCode(u0);
                        continue
                    }
                    u1 = u8Array[idx++] & 63;
                    if ((u0 & 224) == 192) {
                        str += String.fromCharCode((u0 & 31) << 6 | u1);
                        continue
                    }
                    u2 = u8Array[idx++] & 63;
                    if ((u0 & 240) == 224) {
                        u0 = (u0 & 15) << 12 | u1 << 6 | u2
                    } else {
                        u3 = u8Array[idx++] & 63;
                        if ((u0 & 248) == 240) {
                            u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | u3
                        } else {
                            u4 = u8Array[idx++] & 63;
                            if ((u0 & 252) == 248) {
                                u0 = (u0 & 3) << 24 | u1 << 18 | u2 << 12 | u3 << 6 | u4
                            } else {
                                u5 = u8Array[idx++] & 63;
                                u0 = (u0 & 1) << 30 | u1 << 24 | u2 << 18 | u3 << 12 | u4 << 6 | u5
                            }
                        }
                    }
                    if (u0 < 65536) {
                        str += String.fromCharCode(u0)
                    } else {
                        var ch = u0 - 65536;
                        str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023)
                    }
                }
            }
        }

        function UTF8ToString(ptr) {
            return UTF8ArrayToString(HEAPU8, ptr)
        }

        function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
            if (!(maxBytesToWrite > 0)) return 0;
            var startIdx = outIdx;
            var endIdx = outIdx + maxBytesToWrite - 1;
            for (var i = 0; i < str.length; ++i) {
                var u = str.charCodeAt(i);
                if (u >= 55296 && u <= 57343) u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
                if (u <= 127) {
                    if (outIdx >= endIdx) break;
                    outU8Array[outIdx++] = u
                } else if (u <= 2047) {
                    if (outIdx + 1 >= endIdx) break;
                    outU8Array[outIdx++] = 192 | u >> 6;
                    outU8Array[outIdx++] = 128 | u & 63
                } else if (u <= 65535) {
                    if (outIdx + 2 >= endIdx) break;
                    outU8Array[outIdx++] = 224 | u >> 12;
                    outU8Array[outIdx++] = 128 | u >> 6 & 63;
                    outU8Array[outIdx++] = 128 | u & 63
                } else if (u <= 2097151) {
                    if (outIdx + 3 >= endIdx) break;
                    outU8Array[outIdx++] = 240 | u >> 18;
                    outU8Array[outIdx++] = 128 | u >> 12 & 63;
                    outU8Array[outIdx++] = 128 | u >> 6 & 63;
                    outU8Array[outIdx++] = 128 | u & 63
                } else if (u <= 67108863) {
                    if (outIdx + 4 >= endIdx) break;
                    outU8Array[outIdx++] = 248 | u >> 24;
                    outU8Array[outIdx++] = 128 | u >> 18 & 63;
                    outU8Array[outIdx++] = 128 | u >> 12 & 63;
                    outU8Array[outIdx++] = 128 | u >> 6 & 63;
                    outU8Array[outIdx++] = 128 | u & 63
                } else {
                    if (outIdx + 5 >= endIdx) break;
                    outU8Array[outIdx++] = 252 | u >> 30;
                    outU8Array[outIdx++] = 128 | u >> 24 & 63;
                    outU8Array[outIdx++] = 128 | u >> 18 & 63;
                    outU8Array[outIdx++] = 128 | u >> 12 & 63;
                    outU8Array[outIdx++] = 128 | u >> 6 & 63;
                    outU8Array[outIdx++] = 128 | u & 63
                }
            }
            outU8Array[outIdx] = 0;
            return outIdx - startIdx
        }

        function lengthBytesUTF8(str) {
            var len = 0;
            for (var i = 0; i < str.length; ++i) {
                var u = str.charCodeAt(i);
                if (u >= 55296 && u <= 57343) u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
                if (u <= 127) {
                    ++len
                } else if (u <= 2047) {
                    len += 2
                } else if (u <= 65535) {
                    len += 3
                } else if (u <= 2097151) {
                    len += 4
                } else if (u <= 67108863) {
                    len += 5
                } else {
                    len += 6
                }
            }
            return len
        }
        var UTF16Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-16le") : undefined;

        function demangle(func) {
            warnOnce("warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling");
            return func
        }

        function demangleAll(text) {
            var regex = /__Z[\w\d_]+/g;
            return text.replace(regex, (function(x) {
                var y = demangle(x);
                return x === y ? x : x + " [" + y + "]"
            }))
        }

        function jsStackTrace() {
            var err = new Error;
            if (!err.stack) {
                try {
                    throw new Error(0)
                } catch (e) {
                    err = e
                }
                if (!err.stack) {
                    return "(no stack trace available)"
                }
            }
            return err.stack.toString()
        }

        function stackTrace() {
            var js = jsStackTrace();
            if (Module["extraStackTrace"]) js += "\n" + Module["extraStackTrace"]();
            return demangleAll(js)
        }
        var WASM_PAGE_SIZE = 65536;
        var ASMJS_PAGE_SIZE = 16777216;

        function alignUp(x, multiple) {
            if (x % multiple > 0) {
                x += multiple - x % multiple
            }
            return x
        }
        var buffer, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;

        function updateGlobalBuffer(buf) {
            Module["buffer"] = buffer = buf
        }

        function updateGlobalBufferViews() {
            Module["HEAP8"] = HEAP8 = new Int8Array(buffer);
            Module["HEAP16"] = HEAP16 = new Int16Array(buffer);
            Module["HEAP32"] = HEAP32 = new Int32Array(buffer);
            Module["HEAPU8"] = HEAPU8 = new Uint8Array(buffer);
            Module["HEAPU16"] = HEAPU16 = new Uint16Array(buffer);
            Module["HEAPU32"] = HEAPU32 = new Uint32Array(buffer);
            Module["HEAPF32"] = HEAPF32 = new Float32Array(buffer);
            Module["HEAPF64"] = HEAPF64 = new Float64Array(buffer)
        }
        var STATIC_BASE, STATICTOP, staticSealed;
        var STACK_BASE, STACKTOP, STACK_MAX;
        var DYNAMIC_BASE, DYNAMICTOP_PTR;
        STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
        staticSealed = false;

        function writeStackCookie() {
            assert((STACK_MAX & 3) == 0);
            HEAPU32[(STACK_MAX >> 2) - 1] = 34821223;
            HEAPU32[(STACK_MAX >> 2) - 2] = 2310721022
        }

        function checkStackCookie() {
            if (HEAPU32[(STACK_MAX >> 2) - 1] != 34821223 || HEAPU32[(STACK_MAX >> 2) - 2] != 2310721022) {
                abort("Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x" + HEAPU32[(STACK_MAX >> 2) - 2].toString(16) + " " + HEAPU32[(STACK_MAX >> 2) - 1].toString(16))
            }
            if (HEAP32[0] !== 1668509029) throw "Runtime error: The application has corrupted its heap memory area (address zero)!"
        }

        function abortStackOverflow(allocSize) {
            abort("Stack overflow! Attempted to allocate " + allocSize + " bytes on the stack, but stack has only " + (STACK_MAX - stackSave() + allocSize) + " bytes available!")
        }

        function abortOnCannotGrowMemory() {
            abort("Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value " + TOTAL_MEMORY + ", (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime, or (3) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ")
        }

        function enlargeMemory() {
            abortOnCannotGrowMemory()
        }
        var TOTAL_STACK = Module["TOTAL_STACK"] || 5242880;
        var TOTAL_MEMORY = Module["TOTAL_MEMORY"] || 16777216;
        if (TOTAL_MEMORY < TOTAL_STACK) err("TOTAL_MEMORY should be larger than TOTAL_STACK, was " + TOTAL_MEMORY + "! (TOTAL_STACK=" + TOTAL_STACK + ")");
        assert(typeof Int32Array !== "undefined" && typeof Float64Array !== "undefined" && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined, "JS engine does not provide full typed array support");
        if (Module["buffer"]) {
            buffer = Module["buffer"];
            assert(buffer.byteLength === TOTAL_MEMORY, "provided buffer should be " + TOTAL_MEMORY + " bytes, but it is " + buffer.byteLength)
        } else {
            if (typeof WebAssembly === "object" && typeof WebAssembly.Memory === "function") {
                assert(TOTAL_MEMORY % WASM_PAGE_SIZE === 0);
                Module["wasmMemory"] = new WebAssembly.Memory({
                    "initial": TOTAL_MEMORY / WASM_PAGE_SIZE,
                    "maximum": TOTAL_MEMORY / WASM_PAGE_SIZE
                });
                buffer = Module["wasmMemory"].buffer
            } else {
                buffer = new ArrayBuffer(TOTAL_MEMORY)
            }
            assert(buffer.byteLength === TOTAL_MEMORY);
            Module["buffer"] = buffer
        }
        updateGlobalBufferViews();

        function getTotalMemory() {
            return TOTAL_MEMORY
        }
        HEAP32[0] = 1668509029;
        HEAP16[1] = 25459;
        if (HEAPU8[2] !== 115 || HEAPU8[3] !== 99) throw "Runtime error: expected the system to be little-endian!";

        function callRuntimeCallbacks(callbacks) {
            while (callbacks.length > 0) {
                var callback = callbacks.shift();
                if (typeof callback == "function") {
                    callback();
                    continue
                }
                var func = callback.func;
                if (typeof func === "number") {
                    if (callback.arg === undefined) {
                        Module["dynCall_v"](func)
                    } else {
                        Module["dynCall_vi"](func, callback.arg)
                    }
                } else {
                    func(callback.arg === undefined ? null : callback.arg)
                }
            }
        }
        var __ATPRERUN__ = [];
        var __ATINIT__ = [];
        var __ATMAIN__ = [];
        var __ATPOSTRUN__ = [];
        var runtimeInitialized = false;
        var runtimeExited = false;

        function preRun() {
            if (Module["preRun"]) {
                if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
                while (Module["preRun"].length) {
                    addOnPreRun(Module["preRun"].shift())
                }
            }
            callRuntimeCallbacks(__ATPRERUN__)
        }

        function ensureInitRuntime() {
            checkStackCookie();
            if (runtimeInitialized) return;
            runtimeInitialized = true;
            callRuntimeCallbacks(__ATINIT__)
        }

        function preMain() {
            checkStackCookie();
            callRuntimeCallbacks(__ATMAIN__)
        }

        function postRun() {
            checkStackCookie();
            if (Module["postRun"]) {
                if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
                while (Module["postRun"].length) {
                    addOnPostRun(Module["postRun"].shift())
                }
            }
            callRuntimeCallbacks(__ATPOSTRUN__)
        }

        function addOnPreRun(cb) {
            __ATPRERUN__.unshift(cb)
        }

        function addOnPostRun(cb) {
            __ATPOSTRUN__.unshift(cb)
        }
        assert(Math["imul"] && Math["fround"] && Math["clz32"] && Math["trunc"], "this is a legacy browser, build with LEGACY_VM_SUPPORT");
        var Math_abs = Math.abs;
        var Math_ceil = Math.ceil;
        var Math_floor = Math.floor;
        var Math_min = Math.min;
        var runDependencies = 0;
        var runDependencyWatcher = null;
        var dependenciesFulfilled = null;
        var runDependencyTracking = {};

        function addRunDependency(id) {
            runDependencies++;
            if (Module["monitorRunDependencies"]) {
                Module["monitorRunDependencies"](runDependencies)
            }
            if (id) {
                assert(!runDependencyTracking[id]);
                runDependencyTracking[id] = 1;
                if (runDependencyWatcher === null && typeof setInterval !== "undefined") {
                    runDependencyWatcher = setInterval((function() {
                        if (ABORT) {
                            clearInterval(runDependencyWatcher);
                            runDependencyWatcher = null;
                            return
                        }
                        var shown = false;
                        for (var dep in runDependencyTracking) {
                            if (!shown) {
                                shown = true;
                                err("still waiting on run dependencies:")
                            }
                            err("dependency: " + dep)
                        }
                        if (shown) {
                            err("(end of list)")
                        }
                    }), 1e4)
                }
            } else {
                err("warning: run dependency added without ID")
            }
        }

        function removeRunDependency(id) {
            runDependencies--;
            if (Module["monitorRunDependencies"]) {
                Module["monitorRunDependencies"](runDependencies)
            }
            if (id) {
                assert(runDependencyTracking[id]);
                delete runDependencyTracking[id]
            } else {
                err("warning: run dependency removed without ID")
            }
            if (runDependencies == 0) {
                if (runDependencyWatcher !== null) {
                    clearInterval(runDependencyWatcher);
                    runDependencyWatcher = null
                }
                if (dependenciesFulfilled) {
                    var callback = dependenciesFulfilled;
                    dependenciesFulfilled = null;
                    callback()
                }
            }
        }
        Module["preloadedImages"] = {};
        Module["preloadedAudios"] = {};
        var FS = {
            error: (function() {
                abort("Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1")
            }),
            init: (function() {
                FS.error()
            }),
            createDataFile: (function() {
                FS.error()
            }),
            createPreloadedFile: (function() {
                FS.error()
            }),
            createLazyFile: (function() {
                FS.error()
            }),
            open: (function() {
                FS.error()
            }),
            mkdev: (function() {
                FS.error()
            }),
            registerDevice: (function() {
                FS.error()
            }),
            analyzePath: (function() {
                FS.error()
            }),
            loadFilesFromDB: (function() {
                FS.error()
            }),
            ErrnoError: function ErrnoError() {
                FS.error()
            }
        };
        Module["FS_createDataFile"] = FS.createDataFile;
        Module["FS_createPreloadedFile"] = FS.createPreloadedFile;
        var dataURIPrefix = "data:application/octet-stream;base64,";

        function isDataURI(filename) {
            return String.prototype.startsWith ? filename.startsWith(dataURIPrefix) : filename.indexOf(dataURIPrefix) === 0
        }

        function integrateWasmJS() {
            var wasmTextFile = "argon2.wast";
            var wasmBinaryFile = "argon2.wasm";
            var asmjsCodeFile = "argon2.temp.asm.js";
            if (typeof Module["locateFile"] === "function") {
                if (!isDataURI(wasmTextFile)) {
                    wasmTextFile = Module["locateFile"](wasmTextFile)
                }
                if (!isDataURI(wasmBinaryFile)) {
                    wasmBinaryFile = Module["locateFile"](wasmBinaryFile)
                }
                if (!isDataURI(asmjsCodeFile)) {
                    asmjsCodeFile = Module["locateFile"](asmjsCodeFile)
                }
            }
            var wasmPageSize = 64 * 1024;
            var info = {
                "global": null,
                "env": null,
                "asm2wasm": asm2wasmImports,
                "parent": Module
            };
            var exports = null;

            function mergeMemory(newBuffer) {
                var oldBuffer = Module["buffer"];
                if (newBuffer.byteLength < oldBuffer.byteLength) {
                    err("the new buffer in mergeMemory is smaller than the previous one. in native wasm, we should grow memory here")
                }
                var oldView = new Int8Array(oldBuffer);
                var newView = new Int8Array(newBuffer);
                newView.set(oldView);
                updateGlobalBuffer(newBuffer);
                updateGlobalBufferViews()
            }

            function fixImports(imports) {
                return imports
            }

            function getBinary() {
                try {
                    if (Module["wasmBinary"]) {
                        // return new Uint8Array(Module["wasmBinary"])
                        console.log('wasmBinary = ', Module["wasmBinary"]);
                        let byteArray = base64js.toByteArray(Module["wasmBinary"]);
                        console.log('wasmByteArray = ', byteArray);
                        return base64js.toByteArray(Module["wasmBinary"]);

                        // return new Uint8Array(Module["wasmBinary"])
                        // base64js
                    }
                    if (Module["readBinary"]) {
                        return Module["readBinary"](wasmBinaryFile)
                    } else {
                        throw "on the web, we need the wasm binary to be preloaded and set on Module['wasmBinary']. emcc.py will do that for you when generating HTML (but not JS)"
                    }
                } catch (err) {
                    abort(err)
                }
            }

            function getBinaryPromise() {
                if (!Module["wasmBinary"] && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && typeof fetch === "function") {
                    return fetch(wasmBinaryFile, {
                        credentials: "same-origin"
                    }).then((function(response) {
                        if (!response["ok"]) {
                            throw "failed to load wasm binary file at '" + wasmBinaryFile + "'"
                        }
                        return response["arrayBuffer"]()
                    })).catch((function() {
                        return getBinary()
                    }))
                }
                return new Promise((function(resolve, reject) {
                    resolve(getBinary())
                }))
            }

            function doNativeWasm(global, env, providedBuffer) {
                if (typeof WebAssembly !== "object") {
                    abort("No WebAssembly support found. Build with -s WASM=0 to target JavaScript instead.");
                    err("no native wasm support detected");
                    return false
                }
                if (!(Module["wasmMemory"] instanceof WebAssembly.Memory)) {
                    err("no native wasm Memory in use");
                    return false
                }
                env["memory"] = Module["wasmMemory"];
                info["global"] = {
                    "NaN": NaN,
                    "Infinity": Infinity
                };
                info["global.Math"] = Math;
                info["env"] = env;

                function receiveInstance(instance, module) {
                    exports = instance.exports;
                    if (exports.memory) mergeMemory(exports.memory);
                    Module["asm"] = exports;
                    Module["usingWasm"] = true;
                    removeRunDependency("wasm-instantiate")
                }
                addRunDependency("wasm-instantiate");
                if (Module["instantiateWasm"]) {
                    try {
                        return Module["instantiateWasm"](info, receiveInstance)
                    } catch (e) {
                        err("Module.instantiateWasm callback failed with error: " + e);
                        return false
                    }
                }
                var trueModule = Module;

                function receiveInstantiatedSource(output) {
                    assert(Module === trueModule, "the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?");
                    trueModule = null;
                    receiveInstance(output["instance"], output["module"])
                }

                function instantiateArrayBuffer(receiver) {
                    getBinaryPromise().then((function(binary) {
                        return WebAssembly.instantiate(binary, info)
                    })).then(receiver).catch((function(reason) {
                        err("failed to asynchronously prepare wasm: " + reason);
                        abort(reason)
                    }))
                }
                if (!Module["wasmBinary"] && typeof WebAssembly.instantiateStreaming === "function" && !isDataURI(wasmBinaryFile) && typeof fetch === "function") {
                    WebAssembly.instantiateStreaming(fetch(wasmBinaryFile, {
                        credentials: "same-origin"
                    }), info).then(receiveInstantiatedSource).catch((function(reason) {
                        err("wasm streaming compile failed: " + reason);
                        err("falling back to ArrayBuffer instantiation");
                        instantiateArrayBuffer(receiveInstantiatedSource)
                    }))
                } else {
                    instantiateArrayBuffer(receiveInstantiatedSource)
                }
                return {}
            }
            Module["asmPreload"] = Module["asm"];
            var asmjsReallocBuffer = Module["reallocBuffer"];
            var wasmReallocBuffer = (function(size) {
                var PAGE_MULTIPLE = Module["usingWasm"] ? WASM_PAGE_SIZE : ASMJS_PAGE_SIZE;
                size = alignUp(size, PAGE_MULTIPLE);
                var old = Module["buffer"];
                var oldSize = old.byteLength;
                if (Module["usingWasm"]) {
                    try {
                        var result = Module["wasmMemory"].grow((size - oldSize) / wasmPageSize);
                        if (result !== (-1 | 0)) {
                            return Module["buffer"] = Module["wasmMemory"].buffer
                        } else {
                            return null
                        }
                    } catch (e) {
                        console.error("Module.reallocBuffer: Attempted to grow from " + oldSize + " bytes to " + size + " bytes, but got error: " + e);
                        return null
                    }
                }
            });
            Module["reallocBuffer"] = (function(size) {
                if (finalMethod === "asmjs") {
                    return asmjsReallocBuffer(size)
                } else {
                    return wasmReallocBuffer(size)
                }
            });
            var finalMethod = "";
            Module["asm"] = (function(global, env, providedBuffer) {
                env = fixImports(env);
                if (!env["table"]) {
                    var TABLE_SIZE = Module["wasmTableSize"];
                    if (TABLE_SIZE === undefined) TABLE_SIZE = 1024;
                    var MAX_TABLE_SIZE = Module["wasmMaxTableSize"];
                    if (typeof WebAssembly === "object" && typeof WebAssembly.Table === "function") {
                        if (MAX_TABLE_SIZE !== undefined) {
                            env["table"] = new WebAssembly.Table({
                                "initial": TABLE_SIZE,
                                "maximum": MAX_TABLE_SIZE,
                                "element": "anyfunc"
                            })
                        } else {
                            env["table"] = new WebAssembly.Table({
                                "initial": TABLE_SIZE,
                                element: "anyfunc"
                            })
                        }
                    } else {
                        env["table"] = new Array(TABLE_SIZE)
                    }
                    Module["wasmTable"] = env["table"]
                }
                if (!env["memoryBase"]) {
                    env["memoryBase"] = Module["STATIC_BASE"]
                }
                if (!env["tableBase"]) {
                    env["tableBase"] = 0
                }
                var exports;
                exports = doNativeWasm(global, env, providedBuffer);
                assert(exports, "no binaryen method succeeded. consider enabling more options, like interpreting, if you want that: https://github.com/kripken/emscripten/wiki/WebAssembly#binaryen-methods");
                return exports
            })
        }
        integrateWasmJS();
        STATIC_BASE = GLOBAL_BASE;
        STATICTOP = STATIC_BASE + 3424;
        __ATINIT__.push();
        var STATIC_BUMP = 3424;
        Module["STATIC_BASE"] = STATIC_BASE;
        Module["STATIC_BUMP"] = STATIC_BUMP;
        var tempDoublePtr = STATICTOP;
        STATICTOP += 16;
        assert(tempDoublePtr % 8 == 0);

        function _emscripten_memcpy_big(dest, src, num) {
            HEAPU8.set(HEAPU8.subarray(src, src + num), dest);
            return dest
        }

        function _pthread_join() {}

        function ___setErrNo(value) {
            if (Module["___errno_location"]) HEAP32[Module["___errno_location"]() >> 2] = value;
            else err("failed to set errno from JS");
            return value
        }
        DYNAMICTOP_PTR = staticAlloc(4);
        STACK_BASE = STACKTOP = alignMemory(STATICTOP);
        STACK_MAX = STACK_BASE + TOTAL_STACK;
        DYNAMIC_BASE = alignMemory(STACK_MAX);
        HEAP32[DYNAMICTOP_PTR >> 2] = DYNAMIC_BASE;
        staticSealed = true;
        assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");

        function intArrayFromString(stringy, dontAddNull, length) {
            var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
            var u8array = new Array(len);
            var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
            if (dontAddNull) u8array.length = numBytesWritten;
            return u8array
        }
        Module["wasmTableSize"] = 0;
        Module["wasmMaxTableSize"] = 0;
        Module.asmGlobalArg = {};
        Module.asmLibraryArg = {
            "enlargeMemory": enlargeMemory,
            "getTotalMemory": getTotalMemory,
            "abortOnCannotGrowMemory": abortOnCannotGrowMemory,
            "abortStackOverflow": abortStackOverflow,
            "___setErrNo": ___setErrNo,
            "_emscripten_memcpy_big": _emscripten_memcpy_big,
            "_pthread_join": _pthread_join,
            "DYNAMICTOP_PTR": DYNAMICTOP_PTR,
            "STACKTOP": STACKTOP,
            "STACK_MAX": STACK_MAX
        };
        var asm = Module["asm"](Module.asmGlobalArg, Module.asmLibraryArg, buffer);
        var real__argon2_error_message = asm["_argon2_error_message"];
        asm["_argon2_error_message"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return real__argon2_error_message.apply(null, arguments)
        });
        var real__argon2_hash = asm["_argon2_hash"];
        asm["_argon2_hash"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return real__argon2_hash.apply(null, arguments)
        });
        var real__free = asm["_free"];
        asm["_free"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return real__free.apply(null, arguments)
        });
        var real__malloc = asm["_malloc"];
        asm["_malloc"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return real__malloc.apply(null, arguments)
        });
        var real__sbrk = asm["_sbrk"];
        asm["_sbrk"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return real__sbrk.apply(null, arguments)
        });
        var real_establishStackSpace = asm["establishStackSpace"];
        asm["establishStackSpace"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return real_establishStackSpace.apply(null, arguments)
        });
        var real_getTempRet0 = asm["getTempRet0"];
        asm["getTempRet0"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return real_getTempRet0.apply(null, arguments)
        });
        var real_setTempRet0 = asm["setTempRet0"];
        asm["setTempRet0"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return real_setTempRet0.apply(null, arguments)
        });
        var real_setThrew = asm["setThrew"];
        asm["setThrew"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return real_setThrew.apply(null, arguments)
        });
        var real_stackAlloc = asm["stackAlloc"];
        asm["stackAlloc"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return real_stackAlloc.apply(null, arguments)
        });
        var real_stackRestore = asm["stackRestore"];
        asm["stackRestore"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return real_stackRestore.apply(null, arguments)
        });
        var real_stackSave = asm["stackSave"];
        asm["stackSave"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return real_stackSave.apply(null, arguments)
        });
        Module["asm"] = asm;
        var _argon2_error_message = Module["_argon2_error_message"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return Module["asm"]["_argon2_error_message"].apply(null, arguments)
        });
        var _argon2_hash = Module["_argon2_hash"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return Module["asm"]["_argon2_hash"].apply(null, arguments)
        });
        var _free = Module["_free"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return Module["asm"]["_free"].apply(null, arguments)
        });
        var _malloc = Module["_malloc"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return Module["asm"]["_malloc"].apply(null, arguments)
        });
        var _sbrk = Module["_sbrk"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return Module["asm"]["_sbrk"].apply(null, arguments)
        });
        var establishStackSpace = Module["establishStackSpace"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return Module["asm"]["establishStackSpace"].apply(null, arguments)
        });
        var getTempRet0 = Module["getTempRet0"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return Module["asm"]["getTempRet0"].apply(null, arguments)
        });
        var setTempRet0 = Module["setTempRet0"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return Module["asm"]["setTempRet0"].apply(null, arguments)
        });
        var setThrew = Module["setThrew"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return Module["asm"]["setThrew"].apply(null, arguments)
        });
        var stackAlloc = Module["stackAlloc"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return Module["asm"]["stackAlloc"].apply(null, arguments)
        });
        var stackRestore = Module["stackRestore"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return Module["asm"]["stackRestore"].apply(null, arguments)
        });
        var stackSave = Module["stackSave"] = (function() {
            assert(runtimeInitialized, "you need to wait for the runtime to be ready (e.g. wait for main() to be called)");
            assert(!runtimeExited, "the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)");
            return Module["asm"]["stackSave"].apply(null, arguments)
        });
        Module["asm"] = asm;
        Module["intArrayFromString"] = intArrayFromString;
        if (!Module["intArrayToString"]) Module["intArrayToString"] = (function() {
            abort("'intArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["ccall"]) Module["ccall"] = (function() {
            abort("'ccall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["cwrap"]) Module["cwrap"] = (function() {
            abort("'cwrap' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["setValue"]) Module["setValue"] = (function() {
            abort("'setValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["getValue"]) Module["getValue"] = (function() {
            abort("'getValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        Module["allocate"] = allocate;
        if (!Module["getMemory"]) Module["getMemory"] = (function() {
            abort("'getMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you")
        });
        Module["Pointer_stringify"] = Pointer_stringify;
        if (!Module["AsciiToString"]) Module["AsciiToString"] = (function() {
            abort("'AsciiToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["stringToAscii"]) Module["stringToAscii"] = (function() {
            abort("'stringToAscii' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["UTF8ArrayToString"]) Module["UTF8ArrayToString"] = (function() {
            abort("'UTF8ArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["UTF8ToString"]) Module["UTF8ToString"] = (function() {
            abort("'UTF8ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["stringToUTF8Array"]) Module["stringToUTF8Array"] = (function() {
            abort("'stringToUTF8Array' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["stringToUTF8"]) Module["stringToUTF8"] = (function() {
            abort("'stringToUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["lengthBytesUTF8"]) Module["lengthBytesUTF8"] = (function() {
            abort("'lengthBytesUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["UTF16ToString"]) Module["UTF16ToString"] = (function() {
            abort("'UTF16ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["stringToUTF16"]) Module["stringToUTF16"] = (function() {
            abort("'stringToUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["lengthBytesUTF16"]) Module["lengthBytesUTF16"] = (function() {
            abort("'lengthBytesUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["UTF32ToString"]) Module["UTF32ToString"] = (function() {
            abort("'UTF32ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["stringToUTF32"]) Module["stringToUTF32"] = (function() {
            abort("'stringToUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["lengthBytesUTF32"]) Module["lengthBytesUTF32"] = (function() {
            abort("'lengthBytesUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["allocateUTF8"]) Module["allocateUTF8"] = (function() {
            abort("'allocateUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["stackTrace"]) Module["stackTrace"] = (function() {
            abort("'stackTrace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["addOnPreRun"]) Module["addOnPreRun"] = (function() {
            abort("'addOnPreRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["addOnInit"]) Module["addOnInit"] = (function() {
            abort("'addOnInit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["addOnPreMain"]) Module["addOnPreMain"] = (function() {
            abort("'addOnPreMain' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["addOnExit"]) Module["addOnExit"] = (function() {
            abort("'addOnExit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["addOnPostRun"]) Module["addOnPostRun"] = (function() {
            abort("'addOnPostRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["writeStringToMemory"]) Module["writeStringToMemory"] = (function() {
            abort("'writeStringToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["writeArrayToMemory"]) Module["writeArrayToMemory"] = (function() {
            abort("'writeArrayToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["writeAsciiToMemory"]) Module["writeAsciiToMemory"] = (function() {
            abort("'writeAsciiToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["addRunDependency"]) Module["addRunDependency"] = (function() {
            abort("'addRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you")
        });
        if (!Module["removeRunDependency"]) Module["removeRunDependency"] = (function() {
            abort("'removeRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you")
        });
        if (!Module["FS"]) Module["FS"] = (function() {
            abort("'FS' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["FS_createFolder"]) Module["FS_createFolder"] = (function() {
            abort("'FS_createFolder' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you")
        });
        if (!Module["FS_createPath"]) Module["FS_createPath"] = (function() {
            abort("'FS_createPath' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you")
        });
        if (!Module["FS_createDataFile"]) Module["FS_createDataFile"] = (function() {
            abort("'FS_createDataFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you")
        });
        if (!Module["FS_createPreloadedFile"]) Module["FS_createPreloadedFile"] = (function() {
            abort("'FS_createPreloadedFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you")
        });
        if (!Module["FS_createLazyFile"]) Module["FS_createLazyFile"] = (function() {
            abort("'FS_createLazyFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you")
        });
        if (!Module["FS_createLink"]) Module["FS_createLink"] = (function() {
            abort("'FS_createLink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you")
        });
        if (!Module["FS_createDevice"]) Module["FS_createDevice"] = (function() {
            abort("'FS_createDevice' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you")
        });
        if (!Module["FS_unlink"]) Module["FS_unlink"] = (function() {
            abort("'FS_unlink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you")
        });
        if (!Module["GL"]) Module["GL"] = (function() {
            abort("'GL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["staticAlloc"]) Module["staticAlloc"] = (function() {
            abort("'staticAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["dynamicAlloc"]) Module["dynamicAlloc"] = (function() {
            abort("'dynamicAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["warnOnce"]) Module["warnOnce"] = (function() {
            abort("'warnOnce' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["loadDynamicLibrary"]) Module["loadDynamicLibrary"] = (function() {
            abort("'loadDynamicLibrary' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["loadWebAssemblyModule"]) Module["loadWebAssemblyModule"] = (function() {
            abort("'loadWebAssemblyModule' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["getLEB"]) Module["getLEB"] = (function() {
            abort("'getLEB' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["getFunctionTables"]) Module["getFunctionTables"] = (function() {
            abort("'getFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["alignFunctionTables"]) Module["alignFunctionTables"] = (function() {
            abort("'alignFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["registerFunctions"]) Module["registerFunctions"] = (function() {
            abort("'registerFunctions' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["addFunction"]) Module["addFunction"] = (function() {
            abort("'addFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["removeFunction"]) Module["removeFunction"] = (function() {
            abort("'removeFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["getFuncWrapper"]) Module["getFuncWrapper"] = (function() {
            abort("'getFuncWrapper' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["prettyPrint"]) Module["prettyPrint"] = (function() {
            abort("'prettyPrint' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["makeBigInt"]) Module["makeBigInt"] = (function() {
            abort("'makeBigInt' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["dynCall"]) Module["dynCall"] = (function() {
            abort("'dynCall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["getCompilerSetting"]) Module["getCompilerSetting"] = (function() {
            abort("'getCompilerSetting' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["stackSave"]) Module["stackSave"] = (function() {
            abort("'stackSave' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["stackRestore"]) Module["stackRestore"] = (function() {
            abort("'stackRestore' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["stackAlloc"]) Module["stackAlloc"] = (function() {
            abort("'stackAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["establishStackSpace"]) Module["establishStackSpace"] = (function() {
            abort("'establishStackSpace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["print"]) Module["print"] = (function() {
            abort("'print' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        if (!Module["printErr"]) Module["printErr"] = (function() {
            abort("'printErr' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
        });
        Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
        if (!Module["ALLOC_STACK"]) Object.defineProperty(Module, "ALLOC_STACK", {
            get: (function() {
                abort("'ALLOC_STACK' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
            })
        });
        if (!Module["ALLOC_STATIC"]) Object.defineProperty(Module, "ALLOC_STATIC", {
            get: (function() {
                abort("'ALLOC_STATIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
            })
        });
        if (!Module["ALLOC_DYNAMIC"]) Object.defineProperty(Module, "ALLOC_DYNAMIC", {
            get: (function() {
                abort("'ALLOC_DYNAMIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
            })
        });
        if (!Module["ALLOC_NONE"]) Object.defineProperty(Module, "ALLOC_NONE", {
            get: (function() {
                abort("'ALLOC_NONE' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)")
            })
        });

        function ExitStatus(status) {
            this.name = "ExitStatus";
            this.message = "Program terminated with exit(" + status + ")";
            this.status = status
        }
        ExitStatus.prototype = new Error;
        ExitStatus.prototype.constructor = ExitStatus;
        dependenciesFulfilled = function runCaller() {
            if (!Module["calledRun"]) run();
            if (!Module["calledRun"]) dependenciesFulfilled = runCaller
        };

        function run(args) {
            args = args || Module["arguments"];
            if (runDependencies > 0) {
                return
            }
            writeStackCookie();
            preRun();
            if (runDependencies > 0) return;
            if (Module["calledRun"]) return;

            function doRun() {
                if (Module["calledRun"]) return;
                Module["calledRun"] = true;
                if (ABORT) return;
                ensureInitRuntime();
                preMain();
                if (Module["onRuntimeInitialized"]) Module["onRuntimeInitialized"]();
                assert(!Module["_main"], 'compiled without a main, but one is present. if you added it from JS, use Module["onRuntimeInitialized"]');
                postRun()
            }
            if (Module["setStatus"]) {
                Module["setStatus"]("Running...");
                setTimeout((function() {
                    setTimeout((function() {
                        Module["setStatus"]("")
                    }), 1);
                    doRun()
                }), 1)
            } else {
                doRun()
            }
            checkStackCookie()
        }
        Module["run"] = run;
        var abortDecorators = [];

        function abort(what) {
            if (Module["onAbort"]) {
                Module["onAbort"](what)
            }
            if (what !== undefined) {
                out(what);
                err(what);
                what = JSON.stringify(what)
            } else {
                what = ""
            }
            ABORT = true;
            EXITSTATUS = 1;
            var extra = "";
            var output = "abort(" + what + ") at " + stackTrace() + extra;
            if (abortDecorators) {
                abortDecorators.forEach((function(decorator) {
                    output = decorator(output, what)
                }))
            }
            throw output
        }
        Module["abort"] = abort;
        if (Module["preInit"]) {
            if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
            while (Module["preInit"].length > 0) {
                Module["preInit"].pop()()
            }
        }
        Module["noExitRuntime"] = true;
        run()
      }

      const KB = 1024 * 1024;
      const MB = 1024 * KB;
      const GB = 1024 * MB;
      const WASM_PAGE_SIZE = 64 * 1024;

      const totalMemory = (2*GB - 64*KB) / 1024 / WASM_PAGE_SIZE;
      const mem = args.mem || +(1024);
      const initialMemory = Math.min(Math.max(Math.ceil(mem * 1024 / WASM_PAGE_SIZE), 256) + 256, totalMemory);
      const wasmMemory = new WebAssembly.Memory({
          initial: initialMemory,
          maximum: totalMemory
      });

      g.Module = {
          print: console.log,
          printErr: console.error,
          setStatus: console.log,
          wasmBinary: null,
          // wasmBinaryFile: root + 'dist/argon2.wasm',
          locateFile: function(file) { return (args.distPath || '') + '/' + file; }
      };

      return new Promise((resolve, reject) => {
          g.Module.onRuntimeInitialized = function() {
              try {
                  resolve(calcHash(args));
              } catch(e) {
                  reject(e);
              }
          };

          // Module = require(root + '../dist/argon2.js');
          // g.Module.wasmBinary = require(root + 'dist/argon2.wasm');
          // require(root + 'dist/argon2.js');

          if (isBrowser) {
            // window.Module = window.Module || {};
            let wasmBinaryBase64 = "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AAAACAAAAAkAAAAKAAAACwAAAAwAAAAKAAAADgAAAA8AAAAOAAAACgAAAAQAAAAIAAAACQAAAA8AAAAKAAAABgAAAAEAAAAMAAAAAAAAAAIAAAALAAAABwAAAAUAAAADAAAAYXJnb24yZABBcmdvbjJkAGFyZ29uMmkAQXJnb24yaQBhcmdvbjJpZABBcmdvbjJpZABhcmdvbjJ1AEFyZ29uMnUAVW5rbm93biBlcnJvciBjb2RlAFRoZSBwYXNzd29yZCBkb2VzIG5vdCBtYXRjaCB0aGUgc3VwcGxpZWQgaGFzaABTb21lIG9mIGVuY29kZWQgcGFyYW1ldGVycyBhcmUgdG9vIGxvbmcgb3IgdG9vIHNob3J0AFRocmVhZGluZyBmYWlsdXJlAERlY29kaW5nIGZhaWxlZABFbmNvZGluZyBmYWlsZWQATWlzc2luZyBhcmd1bWVudHMAVG9vIG1hbnkgdGhyZWFkcwBOb3QgZW5vdWdoIHRocmVhZHMAT3V0cHV0IHBvaW50ZXIgbWlzbWF0Y2gAVGhlcmUgaXMgbm8gc3VjaCB2ZXJzaW9uIG9mIEFyZ29uMgBBcmdvbjJfQ29udGV4dCBjb250ZXh0IGlzIE5VTEwAVGhlIGFsbG9jYXRlIG1lbW9yeSBjYWxsYmFjayBpcyBOVUxMAFRoZSBmcmVlIG1lbW9yeSBjYWxsYmFjayBpcyBOVUxMAE1lbW9yeSBhbGxvY2F0aW9uIGVycm9yAEFzc29jaWF0ZWQgZGF0YSBwb2ludGVyIGlzIE5VTEwsIGJ1dCBhZCBsZW5ndGggaXMgbm90IDAAU2VjcmV0IHBvaW50ZXIgaXMgTlVMTCwgYnV0IHNlY3JldCBsZW5ndGggaXMgbm90IDAAU2FsdCBwb2ludGVyIGlzIE5VTEwsIGJ1dCBzYWx0IGxlbmd0aCBpcyBub3QgMABQYXNzd29yZCBwb2ludGVyIGlzIE5VTEwsIGJ1dCBwYXNzd29yZCBsZW5ndGggaXMgbm90IDAAVG9vIG1hbnkgbGFuZXMAVG9vIGZldyBsYW5lcwBNZW1vcnkgY29zdCBpcyB0b28gbGFyZ2UATWVtb3J5IGNvc3QgaXMgdG9vIHNtYWxsAFRpbWUgY29zdCBpcyB0b28gbGFyZ2UAVGltZSBjb3N0IGlzIHRvbyBzbWFsbABTZWNyZXQgaXMgdG9vIGxvbmcAU2VjcmV0IGlzIHRvbyBzaG9ydABBc3NvY2lhdGVkIGRhdGEgaXMgdG9vIGxvbmcAQXNzb2NpYXRlZCBkYXRhIGlzIHRvbyBzaG9ydABTYWx0IGlzIHRvbyBsb25nAFNhbHQgaXMgdG9vIHNob3J0AFBhc3N3b3JkIGlzIHRvbyBsb25nAFBhc3N3b3JkIGlzIHRvbyBzaG9ydABPdXRwdXQgaXMgdG9vIGxvbmcAT3V0cHV0IGlzIHRvbyBzaG9ydABPdXRwdXQgcG9pbnRlciBpcyBOVUxMAE9LADAxMjM0NTY3ODkK";
            g.Module['wasmBinary'] = wasmBinaryBase64;
            // Module['wasmBinary'] = atob(wasmBinaryBase64);
            //
            // g.console.log('g.Module = ', g.Module['wasmBinary']);
            // g.console.log('Module = ', Module['wasmBinary']);

            // var fs = require('fs');
            // g.Module.wasmBinary = fs.readFileSync('../dist/argon2.wasm');
            // console.log('g.Module wasmBinary = ', g.Module.wasmBinary);
            // Module = require('../dist/argon2.js');
            // var wasmBin = require(root + 'dist/argon2.wasm');

            // g.Module.wasmBinary = require('../dist/argon2.wasm')
            // g.Module.wasmBinary = wasm;
            // Module = require('../dist/argon2.js');
          } else {
            // Module = require('dist/argon2.js');
          }

          runDist(g.Module);

          // Module = require(root + 'dist/argon2.js');

          // if (typeof document === 'undefined') {

          // } else {
          //     var xhr = new XMLHttpRequest();
          //     xhr.open('GET', root + 'dist/argon2.wasm', true);
          //     xhr.responseType = 'arraybuffer';
          //     xhr.onload = function() {
          //         g.Module.wasmBinary = xhr.response;
          //         loadScript(root + 'dist/argon2.js', function() {
          //         }, function() {
          //             console.error('Error loading script');
          //             reject({message:'Error loading script', code:-4042});
          //         });
          //     };
          //     xhr.onerror = function () {
          //         reject({message:'Error loading wasm', code:-4041});
          //     };
          //     xhr.send(null);
          // }
      }).catch(err => {
        console.log(err)
      });
  }

  function calcHash(arg) {
      if (!Module._argon2_hash) {
          return console.error('Error: _argon2_hash not available');
      }
      var t_cost = arg && arg.time || 10;
      var m_cost = arg && arg.mem || 1024;
      var parallelism = arg && arg.parallelism || 1;
      var pwd = allocateArray(arg && arg.pass || 'password');
      var pwdlen = arg && arg.pass ? arg.pass.length : 8;
      var salt = allocateArray(arg && arg.salt || 'somesalt');
      var saltlen = arg && arg.salt ? arg.salt.length : 8;
      var hash = Module.allocate(new Array(arg && arg.hashLen || 32), 'i8', Module.ALLOC_NORMAL);
      var hashlen = arg && arg.hashLen || 32;
      var encoded = Module.allocate(new Array(512), 'i8', Module.ALLOC_NORMAL);
      var encodedlen = 512;
      var argon2_type = arg && arg.type || 0;
      var version = 0x13;
      var err;
      var out = false;
      try {
          var res = Module._argon2_hash(t_cost, m_cost, parallelism, pwd, pwdlen, salt, saltlen,
              hash, hashlen, encoded, encodedlen,
              argon2_type, version);
      } catch (e) {
          err = e;
      }
      var result;
      if (res === 0 && !err) {
          var hashStr = '';
          var hashArr = new Uint8Array(hashlen);
          for (var i = 0; i < hashlen; i++) {
              var byte = Module.HEAP8[hash + i];
              hashArr[i] = byte;
              hashStr += ('0' + (0xFF & byte).toString(16)).slice(-2);
          }
          var encodedStr = Module.Pointer_stringify(encoded);
          result = { hash: hashArr, hashHex: hashStr, encoded: encodedStr };
      } else {
          try {
              if (!err) {
                  err = Module.Pointer_stringify(Module._argon2_error_message(res))
              }
          } catch (e) {
          }
          result = { message: err, code: res };
      }
      try {
          Module._free(pwd);
          Module._free(salt);
          Module._free(hash);
          Module._free(encoded);
      } catch (e) { }
      if (err) {
          throw result;
      } else {
          return result;
      }
  }

  // function loadScript(src, onload, onerror) {
  //     var el = document.createElement("script");
  //     el.src = src;
  //     el.onload = onload;
  //     el.onerror = onerror;
  //     document.body.appendChild(el);
  // }

  function allocateArray(strOrArr) {
      var arr = strOrArr instanceof Uint8Array || strOrArr instanceof Array ? strOrArr
          : Module.intArrayFromString(strOrArr);
      return Module.allocate(arr, 'i8', Module.ALLOC_NORMAL);
  }

  return {argon2: argon2};
})
