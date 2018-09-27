# Argon2 WebAssembly

Argon2 (with Argon2u support) run as WebAssembly.

## Usage

```
> let argon2 = require('.');
> argon2({pass: 'password', salt: 'somesalt', distPath: 'dist'}).then(console.log);
{ hash:
   Uint8Array [ ... ],
  hashHex:
   'f38afe1266d247cf1f6f836ffdbb0ab946c0a7edbcb4ba6e7324b32b9050441e',
  encoded:
   '$argon2d$v=19$m=1024,t=10,p=1$c29tZXNhbHQ$84r+EmbSR88fb4Nv/bsKuUbAp+28tLpucySzK5BQRB4' }
```

## Building

Prerequesties:
- emscripten with WebAssembly support ([howto](http://webassembly.org/getting-started/developers-guide/))
- CMake

```bash
./build.sh
```

## License

[MIT](https://opensource.org/licenses/MIT)
