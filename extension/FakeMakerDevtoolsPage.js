// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2013 Google Inc. johnjbarton@google.com

(function() {

  chrome.devtools.panels.create("Doors", null, "Panel/doors.html", function(panel) {
    panel.onShown.addListener(function(window) {
      getTrace(window.updateTrace, function(ex) {
        console.error(ex);
      })
    });
  });

  function TraceFunctionsStatus(name, injectTracer, tracerCompiler) {
    this.rawTranscoderSource = tracerCompiler;
    this._transcodeOptions = {
      noTracing: false,
      noEncodeSource: false,
      noSourceURL: false,
    }
    DevtoolsExtended.RuntimeStatus.call(this, name, injectTracer, this.wrapCompiler(tracerCompiler));
  }

  TraceFunctionsStatus.prototype = {
    __proto__: DevtoolsExtended.RuntimeStatus.prototype,

    get pageURL() {
      return "TraceSideBarPane.html";
    },

    get pageHeight() {
      return "26px";
    },

    set transcodeOptions(options) {
      this._transcodeOptions = options;
      this.runtimeModifier.preprocessingScript = this.wrapCompiler(this.rawTranscoderSource, options);
    },

    get transcodeOptions() {
      return this._transcodeOptions;
    },

    _onExtensionPaneShown: function(win) {
      // Our base class will deal with the install-runtime button.
      DevtoolsExtended.RuntimeStatus.prototype._onExtensionPaneShown.call(this, win);

      // 'click' events on the save button
      window.addEventListener('message', this._receiveSaveRequest.bind(this, win));

      // Update status on the save button.
      this._sendSavedStatus = function(saved) {
        var messageObject = {
          traceSaved: !!saved,
          featureName: this.featureName
        };
        win.postMessage(JSON.stringify(messageObject), '*');
      };
      this._runtimeModifier.onActivationChanged.addListener(this._clearSaveOnModify.bind(this, win));

      this._sendSavedStatus(false);
    },

    _receiveSaveRequest: function(win, event) {
      var messageObject = JSON.parse(event.data);
      if (messageObject.saveTrace && messageObject.featureName === this.featureName) {
       // gather the data from the window.
        this._gatherTraceDataFromDebuggee(function(text) {
          // put the result to the server
          var filename = 'http://localhost:7679/extension/output/' + this.featureName + '.txt';
          this._putTraceDataToServer(filename, text, function() {
            // update the save status
            this._sendSavedStatus(true);
          }.bind(this));
        }.bind(this));
      }
    },

    _gatherTraceDataFromDebuggee: function(callback) {
      getTrace(function(lines){
        callback(lines);
      }, function() {
        console.error('getTrace fails', arguments);
      });
    },

    _putTraceDataToServer: function(filename, text, callback) {
        putOneByXHR(filename, text, function(){
          console.log('DONE, writing ' + text.length + ' bytes to ' + filename);
          callback();
        }, function(msg) {
          console.error('FAILED, writing json to ' + filename + ': ' + msg);
        });
    },

    _clearSaveOnModify: function(win, runtimeActive) {
      if (runtimeActive) {
        var messageObject = {
          traceSaved: false,
          featureName: this.featureName
        };
        win.postMessage(JSON.stringify(messageObject), '*');
      }
    },

    wrapCompiler: function(src, options) {
      var optionsSrc = '';
      if (options) {
        Object.getOwnPropertyNames(options).forEach(function(name) {
          optionsSrc += 'window.transcode.' + name + ' = ' + String(options[name]) + ';\n';
        });
      }

      var wrap = 'function preprocessor(src, url) {\n';
      // Workaround preprocessing of iframes bug
      // (function(){// .noTranscode
      wrap += 'if (src && (src.lastIndexOf("(function(){// .noTranscode", 0) === 0)) return;\n';
      wrap += 'if (window.transcode) return window.trancode;\n';
      wrap += src;
      wrap += optionsSrc;
      wrap += '\nreturn window.transcode;\n}()';
      return wrap;
    }

  };

  function FakeMakerStatus(injectFakeMaker, fakeMakerCompiler) {
    TraceFunctionsStatus.call(this, "FakeMaker", injectFakeMaker, fakeMakerCompiler);
  }

  FakeMakerStatus.prototype = {
    __proto__: TraceFunctionsStatus.prototype,
  };

  function FakePlayerStatus(fakePlayerSrc, windowProxySubstPreprocessor) {
    this._fakePlayerSrc = fakePlayerSrc;
    TraceFunctionsStatus.call(this, "FakePlayer", this._fakePlayerSrc, windowProxySubstPreprocessor);
    this.transcodeOptions = {
      noEncodeSource: true,
      noSourceURL: true,
    };
  }

  FakePlayerStatus.prototype = {
     __proto__: TraceFunctionsStatus.prototype,

    obeyActivationRequest: function(shouldBeActive) {
      this.getRecord(shouldBeActive,
          DevtoolsExtended.RuntimeStatus.prototype.obeyActivationRequest.bind(this, shouldBeActive));
    },

    getSources: function(activating, callback) {
      function addSourcesToInjection(result, isException) {
        if (!result) {
          console.log('No sources recorded, options: ', this.transcodeOptions);
          return;
        }
        // result should be an array of {url, src} from fakeMakerCompiler.
        var decodedSrcs = [this._runtimeModifier.injectedScript];
        Object.getOwnPropertyNames(this.transcodeOptions).forEach(function(name) {
          window.transcode[name] = this.transcodeOptions[name];
        }.bind(this));
        result.forEach(function(entry) {
          var url = entry.url;
          var src = window.atob(entry.src);
          console.log('ready to transcode  ' + url, src);
          decodedSrcs.push(transcode(src, url));
        });
        var sum = 0;
        decodedSrcs.forEach(function(src, index) {
          var length = src.length;
          sum += length;
          console.log(index + ' ' + length + ' ' + sum);
        });
        var playerFilename = 'http://localhost:7679/extension/output/readyToPlay.js';
        putOneByXHR(playerFilename, decodedSrcs.join('\n'),
          function() {
            console.log('DONE, writing player to ' + playerFilename);
          }, function(msg) {
            console.error('FAILED, writing json to ' + playerFilename + ': ' + msg);
          }
        );
        callback(activating);
      }
      chrome.devtools.inspectedWindow.eval('window.__F_srcs',
          addSourcesToInjection.bind(this));
    },

    getRecord: function(activating, callback) {
      function addRecordToInjection(result, isException) {
        if (isException) {
          console.error('FakePlayer failed: ', isException.value);
          return;
        }
        console.log('FakePlayer __fakeMaker:', JSON.parse(result));
        // Use double quotes here since our strings inside json have single
        // quotes so they can live inside of JSON's doubles.
        var record = 'window.__fakeMakerRecord = ' + result + ';\n';
        this._runtimeModifier.injectedScript = record + this._fakePlayerSrc;

        this.getSources(activating, callback);

        var jsonFilename = 'http://localhost:7679/extension/output/fakeMakerOutput.json';
        putOneByXHR(jsonFilename, result,
          function() {
            console.log('DONE, writing json to ' + jsonFilename);
          }, function(msg) {
            console.error('FAILED, writing json to ' + jsonFilename + ': ' + msg);
          }
        );
      }
      chrome.devtools.inspectedWindow.eval('__fakeMaker.toJSON()',
          addRecordToInjection.bind(this));
      }
  };

  var includes = [
    'lib/FakeCommon.js',
    'third_party/harmony-reflect/reflect.js',
    'lib/traceFunctionsRuntime.js'
  ];

  window.TraceFunctionsStatus = TraceFunctionsStatus;

  loadByXHR(includes.concat(['lib/FakeMaker.js']), function(srcs) {
    var fakeMakerSrc = srcs.join('\n');
    var injectFakeMaker = fakeMakerSrc + "\n(" + applyFakeMaker + ")();";
    console.log('loading fakeMakerCompiler');
    loadByXHR(['compiled/fakeMakerCompiler.js'], function(fakeMakerCompiler) {
      var fakeMakerStatus = new FakeMakerStatus(injectFakeMaker, fakeMakerCompiler);
    });
  });

  loadByXHR(['lib/traceFunctionsRuntime.js'], function (tracerInjectionSrcs) {
    var tracerInjectionSrc = tracerInjectionSrcs.join('\n');
    loadByXHR(['compiled/traceFunctionsPreprocessor.js'], function(tracerCompilerSrcs) {
      var tracerCompilerSrc = tracerCompilerSrcs.join('\n');
      var TraceFunctionsStatus = new window.TraceFunctionsStatus('Tracer', tracerInjectionSrc, tracerCompilerSrc);
    });
  });

  loadByXHR(['lib/traceFunctionsRuntime.js', 'lib/FakeCommon.js', 'lib/FakePlayer.js'], function(srcs) {
      var fakePlayerSrc = srcs.join('\n');
      var injectFakePlayer = fakePlayerSrc + "\n(" + applyFakePlayer + ")();";
      loadByXHR(['compiled/fakeMakerCompiler.js'], function(fakeMakerCompiler) {
        var fakeMakerStatus = new FakePlayerStatus(injectFakePlayer, fakeMakerCompiler);
      });
  });

})();

