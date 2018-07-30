# Argon2 WebAssembly

Argon2 (with Argon2u support) run as WebAssembly.

Note that currently this only runs in `node`. In the near future, this should be usable in the browser too.

## Usage

```
> let argon2 = require('.');
> argon2({password:'password',salt:'somesalt',distPath:'dist'}).then(console.log);
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

Currently, the auto-generated `dist/argon2.js` won't work as-is. The references to `Module` right at the start need to be changed to `global.Module` in order to actually pull in any values that were set in `lib/argon2.js`.

## License

[MIT](https://opensource.org/licenses/MIT)
