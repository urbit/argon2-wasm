// let argon2 = require('./lib/argon2.js');
//
// argon2({password:'password',salt:'somesalt',distPath:'dist'}).then(console.log);

var fs = require('fs');

fs.open('dist/argon2.wasm', 'r', function(status, fd) {
    if (status) {
        console.log(status.message);
        return;
    }
    var buffer = Buffer.alloc(100000);
    fs.read(fd, buffer, 0, 100000, 0, function(err, num) {
        console.log(buffer.toString('base64'));
    });
});
