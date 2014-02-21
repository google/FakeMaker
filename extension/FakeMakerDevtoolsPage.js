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
    DevtoolsExtended.RuntimeStatus.call(this, name, injectTracer, tracerCompiler);
  }

  TraceFunctionsStatus.prototype = {
    __proto__: DevtoolsExtended.RuntimeStatus.prototype,

    get pageURL() {
      return "TraceSideBarPane.html";
    },

    get pageHeight() {
      return "26px";
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
  }

  FakePlayerStatus.prototype = {
     __proto__: TraceFunctionsStatus.prototype,

    obeyActivationRequest: function(shouldBeActive) {
      this.getRecord(shouldBeActive,
          DevtoolsExtended.RuntimeStatus.prototype.obeyActivationRequest.bind(this, shouldBeActive));
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
        this.runtimeModifier.injectedScript = record + this._fakePlayerSrc;
        callback(activating);

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

  function wrapCompiler(compilerName, src) {
      var wrap = 'function preprocessor(src, url) {\n';
      // Workaround preprocessing of iframes bug
      // (function(){// .noTranscode
      wrap += 'if (src && (src.lastIndexOf("(function(){// .noTranscode", 0) === 0)) return;\n';
      wrap += 'if (window.transcode) return window.trancode;\n';
      wrap += src;
      wrap += '\nreturn window.transcode;\n}()';
      return wrap;
  }

  loadByXHR(includes.concat(['lib/FakeMaker.js']), function(srcs) {
    var fakeMakerSrc = srcs.join('\n');
    var injectFakeMaker = fakeMakerSrc + "\n(" + applyFakeMaker + ")();";
    console.log('loading fakeMakerCompiler');
    loadByXHR(['compiled/fakeMakerCompiler.js'], function(fakeMakerCompiler) {
      var wrap = wrapCompiler('fakeMakerCompiler', fakeMakerCompiler);
      var fakeMakerStatus = new FakeMakerStatus(injectFakeMaker, wrap);
    });
  });

  loadByXHR(['lib/traceFunctionsRuntime.js'], function (tracerInjectionSrcs) {
    var tracerInjectionSrc = tracerInjectionSrcs.join('\n');
    loadByXHR(['out/traceFunctionsPreprocessor.js'], function(tracerCompilerSrcs) {
      var tracerCompilerSrc = tracerCompilerSrcs.join('\n');
      var wrap = wrapCompiler('tracerCompiler', tracerCompilerSrc);
      var TraceFunctionsStatus = new window.TraceFunctionsStatus('Tracer', tracerInjectionSrc, wrap);
    });
  });

  loadByXHR(['lib/traceFunctionsRuntime.js', 'lib/FakeCommon.js', 'lib/FakePlayer.js'], function(srcs) {
      var fakePlayerSrc = srcs.join('\n');
      var injectFakePlayer = fakePlayerSrc + "\n(" + applyFakePlayer + ")();";
      loadByXHR(['compiled/fakeMakerCompiler.js'], function(fakeMakerCompiler) {
        var wrap = wrapCompiler('fakeMakerCompiler', fakeMakerCompiler);
        var fakeMakerStatus = new FakePlayerStatus(injectFakePlayer, wrap);
      });
  });

})();

