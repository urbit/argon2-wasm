# Argon2 WebAssembly

Argon2 (with Argon2u support) run as WebAssembly.

## Usage

```
> let argon2 = require('.');
> argon2.hash({pass: 'password', salt: 'somesalt', distPath: 'dist'}).then(console.log);
{ hash:
   Uint8Array [ ... ],
  hashHex:
   'f38afe1266d247cf1f6f836ffdbb0ab946c0a7edbcb4ba6e7324b32b9050441e',
  encoded:
   '$argon2d$v=19$m=1024,t=10,p=1$c29tZXNhbHQ$84r+EmbSR88fb4Nv/bsKuUbAp+28tLpucySzK5BQRB4' }
```

The input object has the following parameters and defaults:

```
{string}  pass                password string
{string}  salt                salt string
{float}   time        (1)     the number of iterations
{float}   mem         (1024)  used memory, in KiB
{float}   hashLen     (24)    desired hash length
{float}   parallelism (1)     desired parallelism (will be computed in parallel only for PNaCl)
{number}  type        (argon2.types.Argon2d)   hash type: argon2.ArgonType.Argon2d, .Argon2i, .Argon2id or .Argon2u
{string}  distPath    ('.')   asm.js script location, without trailing slash
```

## Building

Prerequisites:

- emscripten with WebAssembly support ([howto](http://webassembly.org/getting-started/developers-guide/))
- CMake

Use the provided build script:

```bash
./build.sh
```

You can also use `npm run-script build`, which will call that directly.

## License

[MIT](https://opensource.org/licenses/MIT)
