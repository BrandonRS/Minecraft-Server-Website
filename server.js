const express = require('express');
const fileUpload = require('express-fileupload');
const bodyParser = require('body-parser');
const conf = require('./config');
const { readdirSync } = require('fs');
const { spawn, spawnSync } = require('child_process');

var mcserver;

const getDirectories = source =>
  readdirSync(source, { withFileTypes: true }).filter(
    dirent => dirent.isDirectory()).map(dirent => dirent.name);

const app = express();

// Get list of servers
var servers = getDirectories(conf.serverDir);

function replaceMapForVersion(version, newMapDir) {
  var worldDir = conf.serverDir + version + '/' + 'world/';
  var result = spawnSync('rm', ['-rf', worldDir]);
  if (result.status == 0) {
    spawnSync('cp', ['-r', newMapDir, worldDir]);
  }
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

function startServer() {
  
}

function startServer(version) {
  var versionDir = conf.serverDir + version + '/';
  var serverPath = versionDir + 'server.jar';

  var args = conf.serverArgs.map(x => x);
  args.push('-jar', serverPath, 'nogui');

  mcserver = spawn('java', args, { cwd: versionDir, stdio: ['pipe', 'ignore', 'ignore'] });
}

function stopServer(callback) {
  if (isServerUp()) {
    if (callback != null)
      mcserver.on('close', callback);
    mcserver.kill();
  }
}

function renderWebpage(res) {
  res.render('index', { message: isServerUp() ? "up!" : "down!", servers: servers });
}

// Add capabilities to app
app.use(fileUpload());
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(express.static(__dirname + '/node_modules'));
app.set('view engine', 'pug');

app.post('/upload', function(req, res) {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.json(createBadResponse('No files were uploaded.'));
  }
  else if (isServerUp())
    return res.json(createBadResponse("Server currently running."));

  // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
  let mapFile = req.files.mapUpload;
  let version = req.body.version;
  let zipPath = conf.tempDir + mapFile.name;

  // Verify version is valid
  if (!servers.includes(version))
    res.json(createBadResponse(`Version ${version} is not valid.`));

  // move mapFile to temp directory
  mapFile.mv(zipPath, function(err) {
    if (err)
      return res.json(createBadResponse(err));

    var extractedFolderPath = conf.tempDir + mapFile.name.substring(0, mapFile.name.length - 4);
    var unzipResult = spawnSync('unzip', ['-o', '-d', extractedFolderPath, zipPath]);
    if (unzipResult.status == 0) {
      var mapDirectory = spawnSync('find', [extractedFolderPath, '-iname', 'level.dat'], {encoding: 'utf-8'}).stdout.trimRight();
      if (mapDirectory.length > 0) {
        // Remove 'level.dat' from end of path
        mapDirectory = mapDirectory.substring(0, mapDirectory.length - 9);

        // Remove old world dir from given version's directory
        replaceMapForVersion(version, mapDirectory);

        // Launch server for version
        startServer(version);
      }

      // Clean up extracted folder
      spawnSync('rm', ['-rf', extractedFolderPath]);
    }

    // Clean up files/folders
    spawnSync('rm', ['-rf', zipPath]);

    if (isServerUp()) {
      console.log(`Server launched!\tVersion: ${version}\tMap name: ${mapFile.name}`)
      res.json(createGoodResponse());
    } else {
      res.json(createBadResponse("Server failed to start. Check the log."));
    }
  });
});

app.post('/stop', function(req, res) {
  if (isServerUp()) {
    stopServer(function() {
      res.json(createGoodResponse());
    });
  }
  else
    res.json(createBadResponse("Server is not up"));
});

app.post('/start', function(req, res) {
  if (!isServerUp()) {
    startServer();
    res.json(createGoodResponse());
  }
  else
    res.json(createBadResponse("Server is already up"));
});

app.get('/status', function(req, res) {
    res.json(createGoodResponse({result: isServerUp() ? "up" : "down"}));
});

app.get('', function(req, res) {
  renderWebpage(res);
});

app.listen(25000, function () {
  console.log('mcwebsite listening on port 25000!');
});