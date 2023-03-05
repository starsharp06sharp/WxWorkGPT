const { name } = require('./package.json');

module.exports = {
  apps: [{
    name: name,
    script: "./dist/app.js",
    instances: 1,
    autorestart: true,
    env_production: {
      NODE_ENV: 'production'
    },
  }]
}
