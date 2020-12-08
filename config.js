var config = {};

config.hostname = process.env.MCWEB_HOSTNAME || 'http://localhost'; // Needed for socket.io
config.prefix = process.env.MCWEB_PREFIX || '';
config.serverArgs = process.env.MCWEB_SERVER_ARGS || '-Xms1G -Xmx4G';
config.serverDir = process.env.MCWEB_SERVER_DIR || '/var/minecraft';
config.tempDir = process.env.MCWEB_TEMP_DIR || '/tmp';
config.port = process.env.MCWEB_PORT || '80';

module.exports = config;