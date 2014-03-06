/* Copyright 2013 Google. All rights reserved.
 *
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file or at
 * https://developers.google.com/open-source/licenses/bsd
*/

(function(){

var tests = {};
var json = {};

// Each test must take care to match calls on proxy with calls on replay

var objWithPrimitive = {foo: 1};

tests['testPrimitive'] = function testPrimitive() {
  var fakeMaker = new FakeMaker();
  var objWithPrimitiveProxy = fakeMaker.makeFake(objWithPrimitive, 'objWithPrimitive');
  // This test both verifies the proxy and records an entry for the playback test.
  console.assert(objWithPrimitive.foo === objWithPrimitiveProxy.foo);
  json.testPrimitive = fakeMaker.toJSON();
  console.log('objWithPrimitive: ', JSON.parse(json.testPrimitive));
  var fakePlayer = new FakePlayer(json.testPrimitive);
  var obj = fakePlayer.startingObject();
  return isSame(objWithPrimitive.foo, obj.foo) && json;
};

tests['testObject'] = function() {
  var fakeMaker = new FakeMaker();
  var objWithObj = {bar: objWithPrimitive};
  var objWithObjProxy = fakeMaker.makeFake(objWithObj, 'objWithObj');
  console.assert(objWithObjProxy.bar.foo === objWithObj.bar.foo);

  json.testObject = fakeMaker.toJSON();
  console.log('objWithObj:', JSON.parse(json.testObject));
  var fakePlayer = new FakePlayer(json.testObject);
  console.log('fakePlayer');
  var obj = fakePlayer.startingObject();
  console.log('objWithObj startingObject', obj);
  return isSame(objWithObj.bar.foo, obj.bar.foo) && json;
};

tests['testFunction'] = function() {
  var fakeMaker = new FakeMaker();
  var objWithFunction = {baz: function() {return 2;}};
  var objWithFunctionProxy = fakeMaker.makeFake(objWithFunction, 'objWithFunction');
  console.assert(objWithFunctionProxy.baz() === objWithFunction.baz());

  json.testFunction = fakeMaker.toJSON();
  console.log('objWithFunction:', JSON.parse(json.testFunction));
  var fakePlayer = new FakePlayer(json.testFunction);
  var obj = fakePlayer.startingObject();
  return isSame(objWithFunction.baz(), obj.baz()) && json;
};

tests['testFunctionWithProperties'] = function() {
  var fakeMaker = new FakeMaker();
  var functionWithProps = function() {return 16;}
  functionWithProps.foz = function() {return 17;}
  var obj = {functionWithProps: functionWithProps};
  var objProxy = fakeMaker.makeFake(obj, 'functionWithProps');
  console.assert(objProxy.functionWithProps.foz() === obj.functionWithProps.foz());

  json.testFunctionWithProperties = fakeMaker.toJSON();
  console.log('functionWithProps:', JSON.parse(json.testFunctionWithProperties));
  var fakePlayer = new FakePlayer(json.testFunctionWithProperties);
  var start = fakePlayer.startingObject();
  return isSame(obj.functionWithProps.foz(), start.functionWithProps.foz()) && json;
};


tests['testGetter'] = function() {
  var fakeMaker = new FakeMaker();
  var objWithGetter = {
    get bax() {return this._bax;},
    _bax: 7
  };
  var objWithGetterProxy = fakeMaker.makeFake(objWithGetter, 'objWithGetter');
  console.assert(objWithGetterProxy.bax === objWithGetter.bax);
  objWithGetter._bax = 8;
  console.assert(objWithGetterProxy.bax === objWithGetter.bax);
  json.testGetter = fakeMaker.toJSON();
  // The objWithGetter, _bax, bax, _bax, bax => 5 items
  console.log('objWithGetter:', JSON.parse(json.testGetter));
  var fakePlayer = new FakePlayer(json.testGetter);
  var obj = fakePlayer.startingObject();
  objWithGetter._bax = 7;  // reset to starting value
  console.assert(objWithGetter.bax === obj.bax);
  objWithGetter._bax = 8;
  return isSame(objWithGetter.bax, obj.bax) && json;
};


tests['testGetterSetter'] = function() {
  var fakeMaker = new FakeMaker();
  var objWithGetter = {
    get baz() {return this._baz;},
    set baz(value) { this._baz = value;},
    _baz: 9,
  };
  var objWithGetterProxy = fakeMaker.makeFake(objWithGetter, objWithGetter);
  objWithGetter.baz = 10;
  objWithGetterProxy.baz = 10;
  console.assert(objWithGetterProxy.baz === objWithGetter.baz);

  json.testGetterSetter = fakeMaker.toJSON();
  console.log('objWithGetter:', JSON.parse(json.testGetterSetter));
  var fakePlayer = new FakePlayer(json.testGetterSetter);
  var obj = fakePlayer.startingObject();
  return isSame(objWithGetter.baz, obj.baz) && json;
};


tests['testSetGet'] = function() {
  var fakeMaker = new FakeMaker();
  var objWithNothing = {
  };
  var objWithNothingProxy = fakeMaker.makeFake(objWithNothing, objWithNothing);
  var something = {bal: true};
  objWithNothingProxy['baz'] = something;
  console.assert(objWithNothingProxy['baz'].bal === something.bal);

  json.testSetGet = fakeMaker.toJSON();
  console.log('objWithNothing:', JSON.parse(json.testSetGet));
  var fakePlayer = new FakePlayer(json.testSetGet);
  var obj = fakePlayer.startingObject();
  // get on an object defined by set is not traced:
  // the value is not part of the DOM.
  return isSame(undefined, obj['baz']) && json;
};

tests['testArray'] = function() {
  var fakeMaker = new FakeMaker();
  var objWithArrayOfObj = {ary:[{baz: function() {return 3;}}, {bax: function() {return 4}}]};
  var objWithArrayOfObjProxy = fakeMaker.makeFake(objWithArrayOfObj, 'objWithArrayOfObj');
  console.assert(objWithArrayOfObj.ary[0].baz() === objWithArrayOfObjProxy.ary[0].baz());
  json.testArray = fakeMaker.toJSON();
  console.log('objWithArrayOfObj', JSON.parse(json.testArray));
  var fakePlayer = new FakePlayer(json.testArray);
  return isSame(fakePlayer.startingObject().ary[0].baz(), objWithArrayOfObj.ary[0].baz()) && json;
};

tests['testMethodOnSubObject'] = function() {
  var fakeMaker = new FakeMaker();
  var objWithMethodOnSubObject = {foo: {baz: function() {return 3;}}};
  var objWithMethodOnSubObjectProxy = fakeMaker.makeFake(objWithMethodOnSubObject, 'objWithMethodOnSubObject');
  console.assert(objWithMethodOnSubObjectProxy.foo.baz() === objWithMethodOnSubObject.foo.baz());

  json.testMethodOnSubObject = fakeMaker.toJSON();
  console.log('objWithMethodOnSubObject:', JSON.parse(json.testMethodOnSubObject));
  var fakePlayer = new FakePlayer(json.testMethodOnSubObject);
  return isSame(objWithMethodOnSubObject.foo.baz(), fakePlayer.startingObject().foo.baz()) && json;
};

tests['testProto'] = function() {
  var fakeMaker = new FakeMaker();
  function Foo() {};
  Foo.prototype = {
    baz: function() {
      return 4;
    }
  };
  var objWithPrototype = new Foo();
  var objWithPrototypeProxy = fakeMaker.makeFake(objWithPrototype, 'objWithPrototype');
  console.assert(objWithPrototypeProxy.baz() === objWithPrototype.baz());

  json.testProto = fakeMaker.toJSON();
  console.log('objWithPrototype:', JSON.parse(json.testProto));
  var fakePlayer = new FakePlayer(json.testProto);
  return isSame(objWithPrototype.baz(), fakePlayer.startingObject().baz()) && json;
};

tests['testDOMObjectProperty'] = function() {
  var fakeMaker = new FakeMaker();

  var obj = {
    getBytesPerElement: function() {
      return Uint16Array.BYTES_PER_ELEMENT;
    }
  };
  var DOMObjectPropertyProxy = fakeMaker.makeFake(obj, 'obj');
  console.assert(Uint16Array.BYTES_PER_ELEMENT === DOMObjectPropertyProxy.getBytesPerElement());

  json.testDOMObjectProperty = fakeMaker.toJSON();
  console.log('testDOMObjectProperty:', JSON.parse(json.testDOMObjectProperty));
  var fakePlayer = new FakePlayer(json.testDOMObjectProperty);
  var start = fakePlayer.startingObject();
  return isSame(Uint16Array.BYTES_PER_ELEMENT, (start.getBytesPerElement())) && json;
};

tests['testNewDOMObject'] = function() {
  var fakeMaker = new FakeMaker();

  var objWithCtor = {
    UIEvent: window.UIEvent
  }

  var objWithCtorProxy = fakeMaker.makeFake(objWithCtor, 'UIEvent');
  var UIEventFromObjWithCtor = new objWithCtor.UIEvent('testEvent');
  var UIEventFromObjWithCtorProxy = new objWithCtorProxy.UIEvent('testEvent');
  console.assert(UIEventFromObjWithCtor.pageX === UIEventFromObjWithCtorProxy.pageX);

  json.testNewDOMObject = fakeMaker.toJSON();
  console.log('testNewDOMObject: ',JSON.parse(json.testNewDOMObject));
  var fakePlayer = new FakePlayer(json.testNewDOMObject);
  var start = fakePlayer.startingObject();
  var UIEventFromStart = new start.UIEvent('testEvent');
  return isSame((new objWithCtor.UIEvent('testEvent')).pageX, UIEventFromStart.pageX) && json;
};

tests['testWindowProperty'] = function() {
  var tagNameTrue = window.document.body.tagName;
  var fakeMaker = new FakeMaker();
  var windowProxy = fakeMaker.makeFake(window, 'window');
  var windowProxyDocument = windowProxy.document;
  console.log("windowProxyDocument");
  var windowProxyDocumentBody = windowProxyDocument.body;
  console.log("windowProxyDocumentBody");
  var tagName = windowProxyDocumentBody.tagName;
  console.log("windowProxyDocumentBody.tagName");
  console.assert(tagNameTrue === tagName);

  json.testWindowProperty = fakeMaker.toJSON();
  console.log('window', JSON.parse(json.testWindowProperty));
  var fakePlayer = new FakePlayer(json.testWindowProperty);
  return isSame(tagNameTrue, fakePlayer.startingObject().document.body.tagName) && json;
};


tests['testWindow'] = function() {
  var fakeMaker = new FakeMaker();
  var windowProxy = fakeMaker.makeFake(window, 'window');

  console.assert(window.screenLeft === windowProxy.screenLeft);

  json.testWindow = fakeMaker.toJSON();
  console.log('window', JSON.parse(json.testWindow));
  var fakePlayer = new FakePlayer(json.testWindow);
  return isSame(window.screenLeft, fakePlayer.startingObject().screenLeft) && json;
};

tests['testSetGlobal'] = function() {
  var src = 'e = 5;var f = e;'
  var transcoded = transcode(src, 'fakeSrc.js');
  console.log('transcoded: ' + transcoded);

  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval(transcoded);

  json.testSetGlobal = fakeMaker.toJSON();

  console.log('testSetGlobal', JSON.parse(json.testSetGlobal));
  var fakePlayer = new FakePlayer(json.testSetGlobal);
  // We created two new window properties, 'e' and 'f', but
  // new window properties do not need to be recorded: the JS
  // code will write and read it whether window has DOM or not.
  return isSame(undefined, fakePlayer.startingObject().e) && json;
}

tests['testArgumentsScoped'] = function() {
  var src = 'var foo = function (name) {\n';
  src += '  var timer = this.timers[name];\n';
  src += '  if (timer) {\n';
  src += '    timer.time += performance.now() - timer.start;\n';
  src += '    timer.iterations++;\n';
  src += '    timer.timing = false;\n';
  src += '  }\n';
  src += '}\n';
  var transcoded = transcode(src, 'fakeSrc.js');
  console.log('transcoded: ' + transcoded);

  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval(transcoded);

  json.testArgumentsScoped = fakeMaker.toJSON();
  console.log('window', JSON.parse(json.testArgumentsScoped));
  var fakePlayer = new FakePlayer(json.testArgumentsScoped);
  // foo is added to window, so we don't record anything about it.
  return isSame(undefined, fakePlayer.startingObject().e) && json;
}

var GlobalsProxiedsrc = 'var proxiedTagName =  document.body.tagName;';

tests['testGlobalsProxied'] = function() {
  var tagNameTrue = window.document.body.tagName;
  var ourConsole = console;
  // Transcode before creating the proxy
  var transcoded = transcode(GlobalsProxiedsrc, 'fakeSrc.js');
  console.log('transcoded: ' + transcoded);

  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval(transcoded);

  json.testGlobalsProxied = fakeMaker.toJSON();

  ourConsole.log('testGlobalsProxied', JSON.parse(json.testGlobalsProxied));
  saveJsonData('testGlobalsProxied', json);
  return true;
};

tests['checkGlobalsProxied'] = function() {
  var tagNameTrue = window.document.body.tagName;
  var transcoded = transcode(GlobalsProxiedsrc, 'checkGlobalsProxied.js');
  console.log('transcoded: ' + transcoded);
  restoreJsonData('testGlobalsProxied', function(json) {
    console.log('checkGlobalsProxied playback data: ', json)
    var fakePlayer = new FakePlayer(json);
    window.windowProxy = fakePlayer.startingObject();
    fakePlayer.initialize();
    eval(transcoded);
    if (isSame(tagNameTrue, windowProxy.proxiedTagName))
          pass();
  });
};

tests['testNewCustomEvent'] = function() {
  // Transcode before creating the proxy
  var src = "var ce = (new CustomEvent('TestNewCustomEvent'));";
  var transcoded = transcode(src, 'fakeSrc.js');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();

  window.addEventListener('TestNewCustomEvent', function(event){
    if (event.timeStamp)
      pass();
  });

  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  var theCE = eval(transcoded);
  window.dispatchEvent(fakeMaker.deproxyArgs([windowProxy.ce])[0]);

  json.testNewCustomEvent = fakeMaker.toJSON();

  console.log('testNewCustomEvent', JSON.parse(json.testNewCustomEvent));
  var fakePlayer = new FakePlayer(json.testNewCustomEvent);
  return json;
}

tests['testWindowDispatchEvent'] = function() {
  var tagNameTrue = window.document.body.tagName;
  var ourConsole = console;
  // Transcode before creating the proxy
  var src = "window.dispatchEvent(new CustomEvent('TestWebComponentsReady'));";
  var transcoded = transcode(src, 'fakeSrc.js');
  console.log('transcoded: ' + transcoded);

  window.addEventListener('TestWebComponentsReady', pass);

  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval(transcoded);

  json.testWindowDispatchEvent = fakeMaker.toJSON();

  ourConsole.log('windowDispatchEvent', JSON.parse(json.testWindowDispatchEvent));
  var fakePlayer = new FakePlayer(json.testWindowDispatchEvent);
  return json;
};

tests['testPrototype'] = function() {
  var ourConsole = console;
  var src = 'var s = HTMLElement.prototype.createShadowRoot';
  var transcoded = transcode(src, 'testPrototype');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);

  json.testPrototype = fakeMaker.toJSON();

  ourConsole.log('testPrototype', JSON.parse(json.testPrototype));
  var fakePlayer = new FakePlayer(json.testPrototype);
  ourConsole.log('__F_', __F_);
  return json;
}

tests['testPlatformFlags'] = function() {
  var ourConsole = console;
  // Transcode before creating the proxy
  var src = document.querySelector('script[name="testPlatformFlags"]').textContent;
  var transcoded = transcode(src, 'testPlatformFlags.js');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);

  json.testPlatformFlags = fakeMaker.toJSON();

  ourConsole.log('testPlatformFlags', JSON.parse(json.testPlatformFlags));
  var fakePlayer = new FakePlayer(json.testPlatformFlags);
  ourConsole.log('__F_', __F_);
  return json;
};

tests['testForIn'] = function() {
  var ourConsole = console;
  // Transcode before creating the proxy
  var src = document.querySelector('script[name="testForIn"]').textContent;
  var transcoded = transcode(src, 'testForIn.js');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);

  json.testForIn = fakeMaker.toJSON();

  ourConsole.log('testForIn', JSON.parse(json.testForIn));
  var fakePlayer = new FakePlayer(json.testForIn);
  ourConsole.log('__F_', __F_);
  pass();
  return json;
};

tests['testIIFE'] = function() {
  var ourConsole = console;
  // Transcode before creating the proxy
  var src = document.querySelector('script[name="testIIFE"]').textContent;
  var transcoded = transcode(src, 'testIIFE.js');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);

  json.testIIFE = fakeMaker.toJSON();

  ourConsole.log('testIIFE', JSON.parse(json.testIIFE));
  var fakePlayer = new FakePlayer(json.testIIFE);
  pass();
  return json;
};

tests['testIIFEGlobal'] = function() {
  var ourConsole = console;
  // Transcode before creating the proxy
  var src = document.querySelector('script[name="testIIFEGlobal"]').textContent;
  var transcoded = transcode(src, 'testIIFEGlobal.js');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);

  json.testIIFEGlobal = fakeMaker.toJSON();

  ourConsole.log('testIIFEGlobal', JSON.parse(json.testIIFEGlobal));
  var fakePlayer = new FakePlayer(json.testIIFEGlobal);
  var win = fakePlayer.startingObject();
  console.assert(win.performance.now);
  pass();
  return json;
};

tests['testIIFEGlobalProperty'] = function() {
  var ourConsole = console;
  // Transcode before creating the proxy
  var src = document.querySelector('script[name="testIIFEGlobalProperty"]').textContent;
  var transcoded = transcode(src, 'testIIFEGlobalProperty.js');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);

  json.testIIFEGlobalProperty = fakeMaker.toJSON();

  ourConsole.log('testIIFEGlobalProperty', JSON.parse(json.testIIFEGlobalProperty));
  var fakePlayer = new FakePlayer(json.testIIFEGlobalProperty);
  windowProxy = fakePlayer.startingObject();
  eval.call(null, transcoded);
  return isSame(true, fakePlayer.endOfRecording()) && json;
 };

tests['testGlobalPrototype'] = function() {
  var ourConsole = console;
  // Transcode before creating the proxy
  var src = document.querySelector('script[name="testGlobalPrototype"]').textContent;
  var transcoded = transcode(src, 'testGlobalPrototype.js');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);

  json.testGlobalPrototype = fakeMaker.toJSON();

  ourConsole.log('testGlobalPrototype', JSON.parse(json.testGlobalPrototype));
  var fakePlayer = new FakePlayer(json.testGlobalPrototype);
  windowProxy = fakePlayer.startingObject();
  eval.call(null, transcoded);
  return isSame(true, fakePlayer.endOfRecording()) && json;
};

tests['testTypeofGlobalPerformance'] = function() {
  var ourConsole = console;
  // Transcode before creating the proxy
  var src = document.querySelector('script[name="testTypeofGlobalPerformance"]').textContent;
  var transcoded = transcode(src, 'testTypeofGlobalPerformance.js');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);

  json.testTypeofGlobalPerformance = fakeMaker.toJSON();

  ourConsole.log('testTypeofGlobalPerformance', JSON.parse(json.testTypeofGlobalPerformance));
  var fakePlayer = new FakePlayer(json.testTypeofGlobalPerformance);
  windowProxy = fakePlayer.startingObject();
  eval.call(null, transcoded);
  return isSame(true, fakePlayer.endOfRecording()) && json;
 };

tests['testVarSet'] = function() {
  var ourConsole = console;
  var src = 'var b = 15;';
  var transcoded = transcode(src, 'testVarSet.js');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);

  json.testVarSet = fakeMaker.toJSON();

  ourConsole.log('testVarSet', JSON.parse(json.testVarSet));
  var fakePlayer = new FakePlayer(json.testVarSet);
  pass();
  return json;
}

tests['testScope'] = function() {
  var ourConsole = console;
  // No DOM is involved here.
  var src = 'var b = 15;\nfunction foo(){var a = 40; return a;}\nfoo();\n';
  var transcoded = transcode(src, 'testScope.js');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);

  json.testScope = fakeMaker.toJSON();

  ourConsole.log('testScope', JSON.parse(json.testScope));
  var fakePlayer = new FakePlayer(json.testScope);

  return isSame(true, (fakePlayer.startingObject(), fakePlayer.endOfRecording())) && json;
}

tests['getElementById'] = function() {
  var ourConsole = console;
  var  src = '';
  src += 'var oneTimeBindings = document.getElementById("oneTimeBindings");\n';
  src += 'oneTimeBindings.addEventListener("click", function(){window.pass();});\n';
  src += 'oneTimeBindings.dispatchEvent(new MouseEvent("click"));\n';

  var transcoded = transcode(src, 'getElementById');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval(transcoded);

  json.getElementById = fakeMaker.toJSON();

  ourConsole.log('getElementById', JSON.parse(json.getElementById));
  var fakePlayer = new FakePlayer(json.getElementById);
  return json;
}

tests['console'] = function() {
  var ourConsole = console;
  var  src = '';
  src += 'console.log(\'logging works\')\n';
  var transcoded = transcode(src, 'console');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval(transcoded);

  json.console = fakeMaker.toJSON();

  ourConsole.log('console', JSON.parse(json.console));
  var fakePlayer = new FakePlayer(json.console);
  return json;
}


tests['innerHTML'] = function() {
  var ourConsole = console;
  var  src = '';
  src += 'var oneTime = document.querySelector(".one-time");\n';
  src += 'oneTime.innerHTML = "The Foo is With You"\n';
  src += 'console.log("innerHTML: " + oneTime.innerHTML);\n';
  var transcoded = transcode(src, 'innerHTML');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval(transcoded);

  json.innerHTML = fakeMaker.toJSON();

  ourConsole.log('innerHTML', JSON.parse(json.innerHTML));
  var fakePlayer = new FakePlayer(json.innerHTML);
  return json;
}

tests['attributes'] = function() {
  var ourConsole = console;
  var  src = '';
  src += 'var oneTime = document.querySelector(".one-time");\n';
  src += 'var ats = oneTime.attributes.length;\n';
  src += 'if (ats !== 1) throw new Error("fail");\n';
  var transcoded = transcode(src, 'attributes');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval(transcoded);

  json.attributes = fakeMaker.toJSON();

  ourConsole.log('attributes', JSON.parse(json.attributes));
  var fakePlayer = new FakePlayer(json.attributes);
  return json;
}

tests['documentInIIFE'] = function() {
  var ourConsole = console;
  var  src = '';
  src += '(function(global) {\n';
  src += 'var div = document.createElement("div");\n';
  src += '})(this);'
  var transcoded = transcode(src, 'documentInIIFE');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval(transcoded);

  json.documentInIIFE = fakeMaker.toJSON();

  ourConsole.log('documentInIIFE', JSON.parse(json.documentInIIFE));
  var fakePlayer = new FakePlayer(json.documentInIIFE);
  return json;
}

tests['observe'] = function() {
  var ourConsole = console;
  var  src = '';
  src += 'var callbackFn = function() {};\n';
  src += 'var observer = new MutationObserver(callbackFn);\n';
  src += 'var div = document.createElement("div");\n'
  src += 'observer.observe(div, { attributes: true });\n';

  var transcoded = transcode(src, 'observe');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval(transcoded);

  json.observe = fakeMaker.toJSON();

  ourConsole.log('observe', JSON.parse(json.observe));
  var fakePlayer = new FakePlayer(json.observe);
  return json;
}

tests['documentAddEventListener'] = function() {
  var ourConsole = console;
  var  src = '';
  src += '(function() {\n';
  src += 'document.addEventListener(\'xDOMContentLoaded\', function() {window.pass()});\n';
  src += 'document.dispatchEvent(new CustomEvent(\'xDOMContentLoaded\'));\n';
  src += '})();\n';

  var transcoded = transcode(src, 'documentAddEventListener');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval(transcoded);

  json.documentAddEventListener = fakeMaker.toJSON();

  ourConsole.log('documentAddEventListener', JSON.parse(json.documentAddEventListener));
  var fakePlayer = new FakePlayer(json.documentAddEventListener);
  return json;
}


var  checkedSrc = '';
checkedSrc += 'var box = document.querySelector(".one-time input");\n';
checkedSrc += 'window.run = function() {return box.checked;}\n';
checkedSrc += 'window.checkedResult = window.run();\n';

tests['checked'] = function() {
  var ourConsole = console;
  var transcoded = transcode(checkedSrc, 'checked');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval(transcoded);

  console.log('Recording complete---------------------------------')

  json.checked = fakeMaker.toJSON();

  ourConsole.log('checked', JSON.parse(json.checked));
  saveJsonData('checked', json);

  // continues below
  return true;
}

tests['checkedPlayer'] = function() {
  var transcoded = transcode(checkedSrc, 'checked');
  console.log('transcoded: ' + transcoded);

  restoreJsonData('checked', function(json) {
    var fakePlayer = new FakePlayer(json);
    window.windowProxy = fakePlayer.startingObject();
    fakePlayer.initialize();
    if (isSame(windowProxy.checkedResult, eval(transcoded)))
      pass();
  });
}

tests['testImplicitGlobalPrototype'] = function() {
  var ourConsole = console;
  // Transcode before creating the proxy
  var src = document.querySelector('script[name="testImplicitGlobalPrototype"]').textContent;
  var transcoded = transcode(src, 'testImplicitGlobalPrototype.js');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);

  json.testImplicitGlobalPrototype = fakeMaker.toJSON();

  ourConsole.log('testImplicitGlobalPrototype', JSON.parse(json.testImplicitGlobalPrototype));
  saveJsonData('testImplicitGlobalPrototype', json);
  return true;
}

tests['checkedImplicitGlobalPrototype'] = function() {
  var src = document.querySelector('script[name="testImplicitGlobalPrototype"]').textContent;
  var transcoded = transcode(src, 'checkImplicitGlobalPrototype.js');
  console.log('transcoded: ' + transcoded);

  restoreJsonData('testImplicitGlobalPrototype', function(json) {
    var fakePlayer = new FakePlayer(json);
    window.windowProxy = fakePlayer.startingObject();
    fakePlayer.initialize();
    eval(transcoded);
    if (isSame(101, windowProxy.testImplicitGlobalPrototypeResult))
      pass();
  });
};

var documentWriteSrc = 'document.write("<script>window.theDocumentWrite=true</script>");'

tests['testDocumentWrite'] = function() {
  var ourConsole = console;
  var transcoded = transcode(documentWriteSrc, 'testDocumentWrite');
  console.log('transcoded: ', transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);
  // The FakeMaker should not prevent the document.write
  console.assert(window.theDocumentWrite);
  json.testDocumentWrite = fakeMaker.toJSON();

  ourConsole.log('testDocumentWrite', JSON.parse(json.testDocumentWrite));
  saveJsonData('testDocumentWrite', json);
  return true;
}

tests['checkDocumentWrite'] = function() {
  var transcoded = transcode(documentWriteSrc, 'checkImplicitGlobalPrototype.js');
  console.log('transcoded: ' + transcoded);
  console.assert(typeof window.theDocumentWrite === 'undefined');
  restoreJsonData('testDocumentWrite', function(json) {
    console.log('checkDocumentWrite playback data: ', JSON.parse(json));
    var fakePlayer = new FakePlayer(json);
    window.windowProxy = fakePlayer.startingObject();
    fakePlayer.initialize();
    eval(transcoded);
    // The FakePlayer does not prevent the document.write(<script>)
    if (isSame(true, window.theDocumentWrite))
      pass();
  });
};

var builtInPrototypeSrc = 'Node.prototype.bind = function() {};';

tests['testbuiltInPrototype'] = function() {
  var ourConsole = console;
  var transcoded = transcode(builtInPrototypeSrc, 'testbuiltInPrototype');
  console.log('transcoded: ', transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);

  json.testbuiltInPrototype = fakeMaker.toJSON();

  ourConsole.log('testbuiltInPrototype', JSON.parse(json.testbuiltInPrototype));
  saveJsonData('testbuiltInPrototype', json);
  return true;
}

tests['checkbuiltInPrototype'] = function() {
  var transcoded = transcode(builtInPrototypeSrc, 'checkbuiltInPrototype.js');
  console.log('transcoded: ' + transcoded);
  console.assert(typeof window.thebuiltInPrototype === 'undefined');
  restoreJsonData('testbuiltInPrototype', function(json) {
    console.log('checkbuiltInPrototype playback data: ', json)
    var fakePlayer = new FakePlayer(json);
    window.windowProxy = fakePlayer.startingObject();
    fakePlayer.initialize();
    eval(transcoded);
    if (isSame('function', typeof windowProxy.Node.prototype.bind))
      pass();
  });
};

var globalFunctionDeclSrc = 'function runBench() { return 66; };\n(function (f){window.testGlobalFunctionDecl = f();}(runBench))';

tests['testglobalFunctionDecl'] = function() {
  var ourConsole = console;
  var transcoded = transcode(globalFunctionDeclSrc, 'testglobalFunctionDecl');
  console.log('transcoded: ', transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);

  json.testglobalFunctionDecl = fakeMaker.toJSON();

  ourConsole.log('testglobalFunctionDecl', JSON.parse(json.testglobalFunctionDecl));
  saveJsonData('testglobalFunctionDecl', json);
  return true;
}

tests['checkglobalFunctionDecl'] = function() {
  var transcoded = transcode(globalFunctionDeclSrc, 'checkglobalFunctionDecl.js');
  console.log('transcoded: ' + transcoded);
  restoreJsonData('testglobalFunctionDecl', function(json) {
    console.log('checkglobalFunctionDecl playback data: ', json)
    var fakePlayer = new FakePlayer(json);
    window.windowProxy = fakePlayer.startingObject();
    fakePlayer.initialize();
    eval(transcoded);
    if (isSame(66, windowProxy.testGlobalFunctionDecl))
      pass();
  });
};

var ElementAddEventListenersrc =  'var b = document.querySelector("body");\n';
    ElementAddEventListenersrc += 'b.addEventListener("click", function(){window.testElementAddEventListener=93; window.pass();});\n';
    ElementAddEventListenersrc += 'b.dispatchEvent(new MouseEvent("click"));\n';

tests['testElementAddEventListener'] = function() {
  var ourConsole = console;

  var transcoded = transcode(ElementAddEventListenersrc, 'testElementAddEventListener.js');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);

  json.testElementAddEventListener = fakeMaker.toJSON();

  ourConsole.log('testElementAddEventListener', JSON.parse(json.testElementAddEventListener));
  saveJsonData('testElementAddEventListener', json);
  return true;
}

tests['checkElementAddEventListener'] = function() {
  var transcoded = transcode(ElementAddEventListenersrc, 'checkElementAddEventListener.js');
  console.log('transcoded: ' + transcoded);
  restoreJsonData('testElementAddEventListener', function(json) {
    console.log('checkElementAddEventListener playback data: ', json)
    var fakePlayer = new FakePlayer(json);
    window.windowProxy = fakePlayer.startingObject();
    fakePlayer.initialize();
    eval(transcoded);
    if (isSame(93, windowProxy.testElementAddEventListener))
      pass();
  });
};


var LoadAddEventListenersrc =  'function fakeLoadHandler(){window.testLoadAddEventListener=39; console.log("set XXXXXXXX");window.pass();}\n';
LoadAddEventListenersrc +=  'window.addEventListener("fakeLoad", fakeLoadHandler);\n';

function unproxiedDispatch() {
  // Bind the unproxied function.
  var fakeLoad = new CustomEvent('fakeLoad');
  var dispatchEvent = window.dispatchEvent.bind(window);
  var removeEventListener = window.removeEventListener.bind(window);
  // Close over this bound unproxied functions
  return function() {
    dispatchEvent(fakeLoad);
    return removeEventListener;
  }
}

tests['testLoadAddEventListener'] = function() {
  var ourConsole = console;
  var unproxiedDispatcher = unproxiedDispatch();

  var transcoded = transcode(LoadAddEventListenersrc, 'testLoadAddEventListener.js');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);
  var remover = unproxiedDispatcher();
  remover('fakeLoad', fakeLoadHandler);
  json.testLoadAddEventListener = fakeMaker.toJSON();

  ourConsole.log('testLoadAddEventListener', JSON.parse(json.testLoadAddEventListener));
  saveJsonData('testLoadAddEventListener', json);
  return true;
}

tests['checkLoadAddEventListener'] = function() {
  var transcoded = transcode(LoadAddEventListenersrc, 'checkLoadAddEventListener.js');
  console.log('transcoded: ' + transcoded);
  restoreJsonData('testLoadAddEventListener', function(json) {
    console.log('checkLoadAddEventListener playback data: ', json)
    var fakePlayer = new FakePlayer(json);
    window.windowProxy = fakePlayer.startingObject();
    fakePlayer.initialize();
    windowProxy.testLoadAddEventListener = 16;

    console.log('before eval ' + windowProxy.testLoadAddEventListener);
    eval(transcoded);

    setTimeout(function() {
      console.log('after all');
        if (isSame(39, windowProxy.testLoadAddEventListener))
          pass();
    }, 10);
  });
};

var  ElementIdsrc = '';
ElementIdsrc += 'function elementId(element) { return element.id };\n';
ElementIdsrc += 'window.testElementId = elementId(oneTimeBindings);\n';

tests['testElementId'] = function() {
  var ourConsole = console;
  var transcoded = transcode(ElementIdsrc, 'testElementId');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval(transcoded);

  json.testElementId = fakeMaker.toJSON();

  ourConsole.log('testElementId', JSON.parse(json.testElementId));
  saveJsonData('testElementId', json);
  return true;
}

tests['checkElementId'] = function() {
  var transcoded = transcode(ElementIdsrc, 'checkElementId.js');
  console.log('transcoded: ' + transcoded);
  restoreJsonData('testElementId', function(json) {
    console.log('checkElementId playback data: ', json)
    var fakePlayer = new FakePlayer(json);
    window.windowProxy = fakePlayer.startingObject();
    fakePlayer.initialize();
    eval(transcoded);
    if (isSame('oneTimeBindings', windowProxy.testElementId))
          pass();
  });
};

var  BuiltInFunctionPropertysrc = '';
BuiltInFunctionPropertysrc += '(function(global) {var hasIt = typeof HTMLTemplateElement !== "undefined";\n';
BuiltInFunctionPropertysrc += 'HTMLTemplateElement.decorate = function(el, opt_instanceRef) {\n';
BuiltInFunctionPropertysrc += '  return true;\n';
BuiltInFunctionPropertysrc += '};window.testBuiltInFunctionProperty = HTMLTemplateElement.decorate();\n})(window);\n';

tests['testBuiltInFunctionProperty'] = function() {
  var ourConsole = console;
  var transcoded = transcode(BuiltInFunctionPropertysrc, 'testBuiltInFunctionProperty');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval(transcoded);

  json.testBuiltInFunctionProperty = fakeMaker.toJSON();

  ourConsole.log('testBuiltInFunctionProperty', JSON.parse(json.testBuiltInFunctionProperty));
  saveJsonData('testBuiltInFunctionProperty', json);
  return true;
}

tests['checkBuiltInFunctionProperty'] = function() {
  var transcoded = transcode(BuiltInFunctionPropertysrc, 'checkBuiltInFunctionProperty.js');
  console.log('transcoded: ' + transcoded);
  restoreJsonData('testBuiltInFunctionProperty', function(json) {
    console.log('checkBuiltInFunctionProperty playback data: ', json)
    var fakePlayer = new FakePlayer(json);
    window.windowProxy = fakePlayer.startingObject();
    fakePlayer.initialize();
    eval(transcoded);
    if (isSame(true, windowProxy.testBuiltInFunctionProperty))
          pass();
  });
};

var CreatedCallbackSrc = "var XBooPrototype = Object.create(HTMLElement.prototype);\n";
CreatedCallbackSrc +=   "XBooPrototype.createdCallback = function() {\n";
CreatedCallbackSrc +=   "  this.style.fontStyle = 'italic';\n";
CreatedCallbackSrc +=   "}\n";
CreatedCallbackSrc +=   "var XBoo = document.registerElement('x-boo', {\n";
CreatedCallbackSrc +=   "  prototype: XBooPrototype\n";
CreatedCallbackSrc +=   "});\n";
CreatedCallbackSrc +=   "var xboo = new XBoo();\n";
CreatedCallbackSrc +=   "window.testCreatedCallback = xboo.style.fontStyle";

tests['testCreatedCallback'] = function() {
  var ourConsole = console;
  var transcoded = transcode(CreatedCallbackSrc, 'testCreatedCallback');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval(transcoded);

  json.testCreatedCallback = fakeMaker.toJSON();

  ourConsole.log('testCreatedCallback', JSON.parse(json.testCreatedCallback));
  saveJsonData('testCreatedCallback', json);
  return true;
}

tests['checkCreatedCallback'] = function() {
  var transcoded = transcode(CreatedCallbackSrc, 'checkCreatedCallback.js');
  console.log('transcoded: ' + transcoded);
  restoreJsonData('testCreatedCallback', function(json) {
    console.log('checkCreatedCallback playback data: ', json)
    var fakePlayer = new FakePlayer(json);
    window.windowProxy = fakePlayer.startingObject();
    fakePlayer.initialize();
    var result = eval(transcoded);
    if (isSame('italic', windowProxy.testCreatedCallback))
          pass();
  });
};


var UpgradeCallbackSrc = "var UpgradePrototype = Object.create(HTMLElement.prototype);\n";
UpgradeCallbackSrc +=   "UpgradePrototype.createdCallback = function() {\n";
UpgradeCallbackSrc +=   "    window.testUpgradeCallback = this.getAttribute('name');\n";
UpgradeCallbackSrc +=   "}\n";
UpgradeCallbackSrc +=   "document.registerElement('polymer-element', {\n";
UpgradeCallbackSrc +=   "  prototype: UpgradePrototype\n";
UpgradeCallbackSrc +=   "});\n";

tests['testUpgradeCallback'] = function() {
  var ourConsole = console;
  var transcoded = transcode(UpgradeCallbackSrc, 'testUpgradeCallback.js');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval(transcoded);

  json.testUpgradeCallback = fakeMaker.toJSON();

  ourConsole.log('testUpgradeCallback', JSON.parse(json.testUpgradeCallback));
  saveJsonData('testUpgradeCallback', json);
  return true;
}

tests['checkUpgradeCallback'] = function() {
  var transcoded = transcode(UpgradeCallbackSrc, 'checkUpgradeCallback.js');
  console.log('transcoded: ' + transcoded);
  restoreJsonData('testUpgradeCallback', function(json) {
    console.log('checkUpgradeCallback playback data: ', json)
    var fakePlayer = new FakePlayer(json);
    window.windowProxy = fakePlayer.startingObject();
    fakePlayer.initialize();
    var result = eval(transcoded);
    if (isSame('code-mirror', windowProxy.testUpgradeCallback))
          pass();
  });
};

tests['testDetectEval'] = function() {
  var ourConsole = console;
  // Transcode before creating the proxy
  var src = document.querySelector('script[name="testDetectEval"]').textContent;
  var transcoded = transcode(src, 'testDetectEval.js');
  console.log('transcoded: ' + transcoded);
  var fakeMaker = new FakeMaker();
  windowProxy = fakeMaker.makeFakeWindow();
  eval.call(window, transcoded);

  json.testDetectEval = fakeMaker.toJSON();

  ourConsole.log('testDetectEval', JSON.parse(json.testDetectEval));
  var fakePlayer = new FakePlayer(json.testDetectEval);
  windowProxy = fakePlayer.startingObject();
  eval.call(null, transcoded);
  return isSame(true, fakePlayer.endOfRecording()) && json;
 };

window.tests = tests;

}());
