const fs = require('fs');
const axios = require('axios');
const path = require('path');
const express = require('express');
const fileUpload = require('express-fileupload');
const bodyParser = require('body-parser');
const propParser = require('minecraft-server-properties');
const config = require('./config');
const { spawn, spawnSync } = require('child_process');

const prefix = '/minecraft';
var mcserver;

const app = express();
app.set('trust proxy', true);

if (!fs.existsSync(config.serverDir))
  fs.mkdirSync(config.serverDir);

var servers = [];

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
  var result = spawnSync('rm', ['-rf', path.join(config.serverDir, version, 'world*')]);
  if (result.status == 0) {
    spawnSync('cp', ['-r', newMapDir, worldDir]);
  }
}

function downloadServerJar(version, callback) {
  const downloadPath = path.join(config.serverDir, version, 'server.jar');
  
  axios.request({
    responseType: 'stream',
    url: `https://papermc.io/api/v1/paper/${version}/latest/download`,
    method: 'get'
  })
  .then(async response => {
    for await (const chunk of response.data) {
      fs.appendFileSync(downloadPath, chunk);
    }

    return callback();
  })
  .catch(error => {
    console.log(error);
  });
}

function confirmEULA(eulaPath) {
  fs.writeFileSync(eulaPath, 'eula=true\n');
}

function createServerFolder(version) {
  const versionFolderPath = path.join(config.serverDir, version);
  const jarPath = path.join(versionFolderPath, 'server.jar');

  if (fs.existsSync(versionFolderPath))
    return;

  fs.mkdirSync(versionFolderPath);

  console.log('About to download JAR');

  downloadServerJar(version, () => {
    console.log("Successfully downloaded JAR");

    spawnSync('java', ['-jar', jarPath], { encoding: 'utf-8', cwd: versionFolderPath });

    if (!fs.existsSync(path.join(versionFolderPath, 'eula.txt')))
      return;

    confirmEULA(path.join(versionFolderPath, 'eula.txt'));
    console.log("Confirmed EULA!");
  });
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
  var versionDir = config.serverDir + version + '/';
  var serverPath = versionDir + 'server.jar';

  var args = config.serverArgs.map(x => x);
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
  res.render('index', { message: isServerUp() ? "up!" : "down!", servers: servers });
}

// Add capabilities to app
app.use(fileUpload());
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());
app.use(prefix, express.static('public'));
app.use(prefix, express.static(__dirname + '/node_modules'));
app.set('view engine', 'pug');

app.post(path.join(prefix, 'upload'), (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.json(createBadResponse('No files were uploaded.'));
  }
  else if (isServerUp())
    return res.json(createBadResponse("Server currently running."));

  // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
  let mapFile = req.files.mapUpload;
  let version = req.body.version;
  let zipPath = path.join(config.tempDir, mapFile.name);

  // Verify version is valid
  if (!servers.includes(version)) {
    return res.json(createBadResponse("Version not valid"));
  }

  // move mapFile to temp directory
  mapFile.mv(zipPath, function(err) {
    if (err)
      return res.json(createBadResponse(err));

    var extractedFolderPath = config.tempDir + mapFile.name.substring(0, mapFile.name.length - 4);
    var unzipResult = spawnSync('unzip', ['-o', '-d', extractedFolderPath, zipPath]);
    if (unzipResult.status == 0) {
      var mapDirectories = spawnSync('find', [extractedFolderPath, '-iname', 'level.dat'], {encoding: 'utf-8'}).stdout.trimRight().split('\n');
      var mapDirectory = mapDirectories[0];

      if (mapDirectory.length > 0) {
        // Remove 'level.dat' from end of path
        mapDirectory = mapDirectory.substring(0, mapDirectory.length - 9);

        // Remove old world dir from given version's directory
        replaceMapForVersion(version, mapDirectory);

        // Set properties for version
        var propertiesPath = path.join(config.serverDir, version, 'server.properties');
        fs.writeFileSync(propertiesPath, propParser.stringify(JSON.parse(req.body.properties)));

        // Launch server for version
        startServer(version);
      } else {
        console.log("Map dir length not greater than 0");
      }

      // Clean up extracted folder
      spawnSync('rm', ['-rf', extractedFolderPath]);
    } else {
      console.log("Failed to unzip");
    }

    // Clean up zip file
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

app.post(path.join(prefix, 'stop'), (req, res) => {
  if (isServerUp()) {
    stopServer(function() {
      res.json(createGoodResponse());
    });
  }
  else
    res.json(createBadResponse("Server is not up"));
});

app.post(path.join(prefix, 'command'), (req, res) => {
  if (isServerUp()) {
    mcserver.stdin.write(req.body.command + '\n');
    res.json(createGoodResponse());
  }
  else
    res.json(createBadResponse("Server not up."));
});

app.get(path.join(prefix, 'status'), (req, res) => {
  if (isServerUp())
    res.json(createGoodResponse({isUp: true, version: mcserver.version, currentMap: mcserver.currentMap}));
  else
    res.json(createGoodResponse({isUp: false}));
});

app.get(path.join(prefix, 'properties'), (req, res) => {
  if (servers.includes(req.query.version)) {
    if (!fs.existsSync(path.join(config.serverDir, req.query.version)))
      createServerFolder(req.query.version);

    var propertiesPath = path.join(config.serverDir, req.query.version, 'server.properties');
    fs.readFile(propertiesPath, {encoding: 'utf-8'}, function(err, data) {
      if (!err) {
        res.json(createGoodResponse({properties: propParser.parse(data)}));
      } else
        res.json(createBadResponse(err));
    })
  } else {
    res.json(createBadResponse('Bad version.'));
  }
});

app.get(prefix, async (req, res) => {
  await renderWebpage(res);
});

var server = app.listen(config.port, function () {
  console.log(`mcwebsite listening on port ${config.port}`);
});

// Initialize socket.io
var io = require('socket.io')(server, { path: path.join(prefix, 'socket.io') });

io.on('connection', function(client) {
  console.log('Client connected...');
});