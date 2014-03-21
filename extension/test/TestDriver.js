/* Copyright 2013 Google. All rights reserved.
 *
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file or at
 * https://developers.google.com/open-source/licenses/bsd
*/

// Assumes global 'tests'

(function(){

function isSame(lhs, rhs) {
  console.log('(' + (typeof lhs) + ') ' + lhs + ' === (' + typeof(rhs) + ') ' + rhs + ' ' + (lhs === rhs));
  return rhs === lhs;
}

function passed() {
  var passed = '';
  for (var i = 0; i < list.children.length; i++) {
    if (list.children[i].classList.contains('pass'))
      passed += (i+1) + ',';
  }
  return passed;
}

function markPassed(passed) {
  passed.split(',').forEach(function(numeral) {
    var i = parseInt(numeral, 10);
    if (i) list.children[i - 1].classList.add('pass');
  });
}

window.pass = function() {
  console.log('=========== PASS =========');
  var nextTestElement = list.children[nextTest -1];
  nextTestElement.classList.remove('fail');
  nextTestElement.classList.add('pass');
  if (runAll)
    loadNextTest();
}

function fail(testNumber) {
  var nextTestElement = list.children[testNumber -1];
  nextTestElement.classList.add('fail');
}

var list = document.createElement('ol');
Object.keys(tests).forEach(function(test) {
  var item = document.createElement('li');
  item.textContent = test;
  list.appendChild(item);
});
list.addEventListener('click', function(event) {
  console.log('click', event.target.textContent);
  nextTest = Array.prototype.indexOf.call(list.children, event.target);
  loadNextTest();
});
document.body.appendChild(list);

var runAll = false;

function loadNextTest() {
    var page = window.location.href.split('?')[0];
    page += '?testNumber=' + (nextTest + 1);
    page += '&passed=' + passed();
    page = page + (runAll ? '&runAll=true' : '');
    window.location = page;
}

function runNextTest() {
  var json;
  if (nextTest && nextTest <= list.children.length) {
    fail(nextTest);
    try {
      if (json = tests[list.children[nextTest - 1].textContent]()) {
        saveJsonData(list.children[nextTest - 1].textContent, json);
        pass();
      }
    } catch(e) {
      console.error(e, e.stack);
      list.children[nextTest].classList.add('fail');
    }
  } else {
    console.log("All done");
  }
}

function clearAll() {
  for (var i = 0; i < list.children.length; i++) {
    list.children[i].classList.remove('pass');
  }
}

var nextTest = 0;
document.querySelector('.all').addEventListener('click', function() {
  clearAll();
  nextTest = 1;
  runAll = true;
  runNextTest();
});
document.querySelector('.reset').addEventListener('click', function() {
  var base = window.location.href.split('?')[0];
  window.location = base;
});

window.addEventListener('load', function() {
  var search = window.location.href.split('?')[1];
  if (!search)
    return;
  runAll = false;
  var params = search.split('&');
  params.forEach(function(param) {
    var nv = param.split('=');
    if (nv[0] === 'testNumber')
      nextTest = parseInt(nv[1], 10);
    else if (nv[0] === 'passed')
      markPassed(nv[1]);
    else if (nv[0] === 'runAll')
      runAll = true;
  });
  var nv = params[0].split('=');

  runNextTest();
});

window.isSame = isSame;

}());
