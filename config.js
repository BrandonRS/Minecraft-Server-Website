var config = {};

config.serverArgs = process.env.SERVER_ARGS || '-Xms1G -Xmx4G';
config.serverDir = process.env.SERVER_DIR || '/var/minecraft';
config.tempDir = process.env.TEMP_DIR || '/tmp';
config.port = process.env.WEB_PORT || '5002';

module.exports = config;