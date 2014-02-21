var express = require('express');
var fs = require('fs');
var path = require('path');

function servePathAtPort(path, port) {
  var app = express();
  app.use(express.bodyParser());
  app.use(express.static(path));   // before directory to allow index.html to work
  app.use(express.directory(path));
  app.all(/\/extension\/output\//, function(req, res) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    res.header("Access-Control-Allow-Methods", "PUT, OPTIONS, GET")
  	var path = __dirname + '/../..' + req.path;
      console.log(req.route.method + ' to ' + path + '...');
      var overwrite = true;
  	req.on('data', function(raw) {
        if (overwrite) {
          fs.writeFileSync(path, raw);
          overwrite = false;
        } else {
          fs.appendFileSync(path, raw);
        }
  	});
  	req.on('end', function() {
  		console.log('end');
  		res.send(200);
  	});
  });
  app.listen(port);
  console.log('serving ' + path + ' at ' + port);
}

servePathAtPort(__dirname + '/../..', 7679);
