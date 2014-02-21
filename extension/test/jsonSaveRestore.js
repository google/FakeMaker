/* Copyright 2014 Google. All rights reserved.
 *
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file or at
 * https://developers.google.com/open-source/licenses/bsd
*/

function testNameToFileName(testName) {
  return '../output/UnitTest/' + testName + '.json';
}

function saveJsonData(testName, json) {
  var jsonFilename = testNameToFileName(testName);
  
  var text = json[testName];
  console.log('sending ', text);
  putOneByXHR(jsonFilename, text, function(){
    console.log('DONE, writing json to ' + jsonFilename, text);
  }, function(msg) {
    console.error('FAILED, writing json to ' + jsonFilename + ': ' + msg);
  });
}

function restoreJsonData(testName, callback) {
  var jsonFilename = testNameToFileName(testName);
  loadOneByXHR(jsonFilename, function(text) {
    callback(text);
  });
}
