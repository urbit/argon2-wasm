let argon2 = require('./lib/argon2.js');

argon2({password:'password',salt:'somesalt',distPath:'dist'}).then(console.log);
