const fs = require('fs');
const axios = require('axios');
require('dotenv').config();
const path = require('path');
const express = require('express');
const fileUpload = require('express-fileupload');
const bodyParser = require('body-parser');
const propParser = require('minecraft-server-properties');
const config = require('./config');
const { spawn, spawnSync, execSync } = require('child_process');

var mcserver;

const app = express();
app.set('trust proxy', true);

if (!fs.existsSync(config.serverDir))
  fs.mkdirSync(config.serverDir);

var servers = [];

function linesInFile(filePath) {
  var output = execSync(`wc -l < ${filePath}`, { encoding: 'utf-8' });

  if (output) {
    return parseInt(output);
  } else {
    return 0;
  }
}

async function getServers() {
  return axios.get('https://papermc.io/api/v1/paper')
  .then(resp => {
    return resp.data.versions;
  })
  .catch(reason => {
    console.error(`Failed to get servers: ${reason}`);
    return [];
  });
}

function replaceMapForVersion(version, newMapDir) {
  let versionDir = path.join(config.serverDir, version)
  var result = spawnSync('rm', ['-rf', path.join(versionDir, 'world*')]);
  if (result.status == 0) {
    spawnSync('cp', ['-r', newMapDir, path.join(versionDir, 'world')]);
  }
}

async function downloadServerJar(version) {
  const downloadPath = path.join(config.serverDir, version, 'server.jar');
  
  return axios.request({
    responseType: 'stream',
    url: `https://papermc.io/api/v1/paper/${version}/latest/download`,
    method: 'get'
  })
  .then(async response => {
    for await (const chunk of response.data) {
      fs.appendFileSync(downloadPath, chunk);
    }
    
    return true;
  })
  .catch(error => {
    console.log(`Failed to download JAR: ${error}`);
    return false;
  });
}

function confirmEULA(eulaPath) {
  fs.writeFileSync(eulaPath, 'eula=true\n');
}

async function createServerFolder(version) {
  const versionFolderPath = path.join(config.serverDir, version);
  const jarPath = path.join(versionFolderPath, 'server.jar');

  if (fs.existsSync(versionFolderPath))
    return false;

  fs.mkdirSync(versionFolderPath);

  var success = await downloadServerJar(version);

  if (success) {
    spawnSync('java', ['-jar', jarPath], { encoding: 'utf-8', cwd: versionFolderPath });

    if (!fs.existsSync(path.join(versionFolderPath, 'eula.txt')))
      return false;

    confirmEULA(path.join(versionFolderPath, 'eula.txt'));

    success = true;
  }

  return success;
}

function loadProperties(version) {
  let versionFolder = path.join(config.serverDir, version);
  let args = ['-jar', path.join(versionFolder, 'server.jar')];

  var tempServer = spawn('java', args, { cwd: versionFolder });

  if (tempServer) {
    var found = false;

    tempServer.stdout.setEncoding('utf-8');
    tempServer.stdout.on('data', data => {
      found =  data.includes("Default game");
    });

    return new Promise(async resolve => {
      while (!found && tempServer.exitCode == null) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      resolve(found);
    });
  }

  return Promise.resolve(false);
}

function createGoodResponse(extra) {
  var resp = {status: 200};

  if (extra != null) {
    Object.keys(extra).forEach(k => {
      resp[k] = extra[k];
    });
  }

  return resp;
}

function createBadResponse(message) {
  return {status: 400, message: message};
}

function isServerUp() {
  return mcserver != null && mcserver.exitCode == null;
}

function startServer(version) {
  var versionDir = path.join(config.serverDir, version);
  var serverPath = path.join(versionDir, 'server.jar');

  var args = config.serverArgs.split(' ');
  args.push('-jar', serverPath, 'nogui');

  mcserver = spawn('java', args, { cwd: versionDir });

  if (mcserver) {
    console.log("init server");
    mcserver.stdout.setEncoding('utf-8');
    mcserver.stdout.on('data', data => {
      io.emit('log', data);
    });
  }
}

function stopServer(callback) {
  if (isServerUp()) {
    if (callback != null)
      mcserver.on('close', callback);
    mcserver.kill();
  }
}

async function renderWebpage(res) {
  servers = await getServers();
  res.render('index', { hostname: config.hostname, servers: servers, prefix: config.prefix });
}

app.use(fileUpload());
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());
app.use(config.prefix, express.static('public'));
app.use(config.prefix, express.static(path.join(__dirname, '/node_modules')));
app.set('view engine', 'pug');

app.post(path.join(config.prefix, 'upload'), (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.json(createBadResponse('No files were uploaded.'));
  }
  else if (isServerUp())
    return res.json(createBadResponse("Server currently running."));

  // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
  let mapFile = req.files.mapUpload;
  let version = req.body.version;
  let zipPath = path.join(config.tempDir, mapFile.name);

  if (!servers.includes(version)) {
    return res.json(createBadResponse("Version not valid"));
  }

  mapFile.mv(zipPath, (err) => {
    if (err)
      return res.json(createBadResponse(err));

    var extractedFolderPath = path.join(config.tempDir, mapFile.name.substring(0, mapFile.name.length - 4));
    var unzipResult = spawnSync('unzip', ['-o', '-d', extractedFolderPath, zipPath]);
    if (unzipResult.status == 0) {
      var mapDirectories = spawnSync('find', [extractedFolderPath, '-iname', 'level.dat'], {encoding: 'utf-8'}).stdout.trimRight().split('\n');
      var mapDirectory = mapDirectories[0];

      if (mapDirectory.length > 0) {
        // Remove 'level.dat' from end of path
        mapDirectory = mapDirectory.substring(0, mapDirectory.length - 9);

        replaceMapForVersion(version, mapDirectory);

        var propertiesPath = path.join(config.serverDir, version, 'server.properties');
        fs.writeFileSync(propertiesPath, propParser.stringify(JSON.parse(req.body.properties)));

        startServer(version);
      } else {
        console.log("Map dir length not greater than 0");
      }

      spawnSync('rm', ['-rf', extractedFolderPath]);
    } else {
      console.log("Failed to unzip");
    }

    spawnSync('rm', ['-rf', zipPath]);

    if (isServerUp()) {
      console.log(`Server launched!\tVersion: ${version}\tMap name: ${mapFile.name}`)
      mcserver.currentMap = mapFile.name;
      mcserver.version = version;
      res.json(createGoodResponse());
    } else {
      res.json(createBadResponse("Server failed to start. Check the log."));
    }
  });
});

app.post(path.join(config.prefix, 'stop'), (req, res) => {
  if (isServerUp()) {
    stopServer(function() {
      res.json(createGoodResponse());
    });
  }
  else
    res.json(createBadResponse("Server is not up"));
});

app.post(path.join(config.prefix, 'command'), (req, res) => {
  if (isServerUp()) {
    mcserver.stdin.write(req.body.command + '\n');
    res.json(createGoodResponse());
  }
  else
    res.json(createBadResponse("Server not up."));
});

app.get(path.join(config.prefix, 'status'), (req, res) => {
  if (isServerUp())
    res.json(createGoodResponse({isUp: true, version: mcserver.version, currentMap: mcserver.currentMap}));
  else
    res.json(createGoodResponse({isUp: false}));
});

app.get(path.join(config.prefix, 'properties'), async (req, res) => {
  if (servers.includes(req.query.version)) {
    if (!fs.existsSync(path.join(config.serverDir, req.query.version)))
      await createServerFolder(req.query.version);

    var propertiesPath = path.join(config.serverDir, req.query.version, 'server.properties');

    if (!fs.existsSync(propertiesPath) || linesInFile(propertiesPath) < 5) {
      var result = await loadProperties(req.query.version);

      if (!result)
        return res.json(createBadResponse("Failed to load properties."));
    }

    fs.readFile(propertiesPath, {encoding: 'utf-8'}, function(err, data) {
      if (!err)
        res.json(createGoodResponse({properties: propParser.parse(data)}));
      else
        res.json(createBadResponse(err));
    });
  } else {
    res.json(createBadResponse('Bad version.'));
  }
});

app.get(config.prefix, async (req, res) => {
  await renderWebpage(res);
});

var server = app.listen(config.port, function () {
  console.log('mcwebsite successfully started with config:')
  Object.keys(config).map(k => console.log(`\t${k}: '${config[k]}'`));
});

var io = require('socket.io')(server, { path: path.join(config.prefix, 'socket.io') });

io.on('connection', function(client) {
  console.log('Client connected...');
});