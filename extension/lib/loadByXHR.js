// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2013 Google Inc. johnjbarton@google.com

function loadByXHR(urlOrArrayOfURL, callback) {
  var urls;
  if (typeof urlOrArrayOfURL === 'string')
    urls = [urlOrArrayOfURL];
  else
    urls = ('slice' in urlOrArrayOfURL) ? urlOrArrayOfURL.slice(0) : [urlOrArrayOfURL];

  var results = [];
  var remainingToLoad = urls.length;
  urls.forEach(function (url, index) {
    if (callback) {
      loadOneByXHR(url, function(text) {
        results[index] = text;
        console.log(remainingToLoad + ')loadOneByXHR OK ' + url);
        if (--remainingToLoad === 0)
          callback(results);
      });
    } else {
      results[index] = loadOneByXHR(url);
      callback(results);
    }
  });
}

function loadOneByXHR(url, callback)
{
    function onReadyStateChanged()
    {
        if (xhr.readyState !== XMLHttpRequest.DONE)
            return;

        if (xhr.status === 200) {
            callback(xhr.responseText);
            return;
        }

        callback(null);
   }

    var xhr = new XMLHttpRequest();
    var async = !!callback;
    xhr.open("GET", url, async);

    if (async)
        xhr.onreadystatechange = onReadyStateChanged;

    xhr.send(null);

    if (!async) {
        if (xhr.status === 200)
            return xhr.responseText;
    }
    return null;
}


function putOneByXHR(url, text, callback, errback)
{
  function onReadyStateChanged()
  {
      if (xhr.readyState !== XMLHttpRequest.DONE)
          return;

      if (xhr.status === 200) {
          callback(xhr.responseText);
          return;
      }

      errback(xhr.statusText)
 }

  var xhr = new XMLHttpRequest();
  var async = !!callback;
  xhr.open("PUT", url, async);
  xhr.setRequestHeader('Content-Type', 'text/plain');
  
  if (async)
      xhr.onreadystatechange = onReadyStateChanged;

  xhr.send(text);

  if (!async) {
      if (xhr.status === 200)
          return xhr.responseText;
  }
  return null;
}
