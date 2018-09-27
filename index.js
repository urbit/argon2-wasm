'use strict'

if (!WebAssembly) {
    throw new Error('WebAssembly not supported here.');
}

var loadModule = require('./generated/emscripten-runner.js');
var wasmBinary = require('./generated/argon2.wasm.js');

var Module = {
    printErr: console.error,
    setStatus: console.log,
    wasmBinary: wasmBinary
    // TODO: set these to avoid using base64 everywhere?
    // wasmBinaryFile: root + 'dist/argon2.wasm',
    // locateFile: function(file) { return (args.distPath || '') + '/' + file; }
};

/**
* Argon2 hash
* @param {string} params.pass - password string
* @param {string} params.salt - salt string
* @param {float}  [params.time=1] - the number of iterations
* @param {float}  [params.mem=1024] - used memory, in KiB
* @param {float}  [params.hashLen=24] - desired hash length
* @param {float}  [params.parallelism=1] - desired parallelism (will be computed in parallel only for PNaCl)
* @param {number} [params.type=argon2.types.Argon2d] - hash type: argon2.ArgonType.Argon2d, .Argon2i, .Argon2id or .Argon2u
* @param {string} [params.distPath=.] - asm.js script location, without trailing slash
*
* @return Promise
*
* @example
*  argon2.hash({ pass: 'password', salt: 'somesalt' })
*      .then(h => console.log(h.hash, h.hashHex, h.encoded))
*      .catch(e => console.error(e.message, e.code))
*/
function argon2(args) {
  if (Module._argon2_hash) {
      return new Promise((resolve, reject) => {
          try {
              resolve(calcHash(args));
          } catch(e) {
              reject(e);
          }
      });
  }

  return new Promise((resolve, reject) => {
      Module.onRuntimeInitialized = function() {
          try {
              resolve(calcHash(args));
          } catch(e) {
              reject(e);
          }
      };

      loadModule(Module);
  }).catch(err => {
    console.log(err)
  });
}

function calcHash(arg) {
  if (!Module._argon2_hash) {
      throw new Error('Error: _argon2_hash not available');
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

function allocateArray(strOrArr) {
  var arr = strOrArr instanceof Uint8Array || strOrArr instanceof Array ? strOrArr
      : Module.intArrayFromString(strOrArr);
  return Module.allocate(arr, 'i8', Module.ALLOC_NORMAL);
}

module.exports = {
  hash: argon2,
  types: {
    Argon2d: 0,
    Argon2i: 1,
    Argon2id: 2,
    Argon2u: 10
  }
}
