FakeMaker - A Chrome Devtools extension to create a DOM 'fake' for JS programs.

Status: under development.

This tool creates a pure-JavaScript Web app from a Web app designed to run JavaScript code against the Document Object Model (DOM) API. The result can be used to benchmark the JS part of a Web app without variations due to the 
performance of the DOM calls.

BEWARE: this is a complex tool designed to create one or a few benchmark apps. It will be much more fun to read about how it works than to use it ;-).

Install:
  1. Clone this repo,
  2. cd `extension/`, npm install
  3. cd `extension/third_party`, git clone https://github.com/tvcutsem/harmony-reflect.git
  2. Open the Chrome browser, `chrome://extensions`
  3. Set developer mode, open unpacked extension>  this repo/extension

Basic Use:
  1. Open your web app,
  2. Open Chrome devtools on the web app.
  3. `Devtools` > `Source` > `SidePanel` > `FakeMaker` > `Install`
  4. Wait for the web app to load and perform any operations needed for 
the benchmark.
  5. `Devtools` > `Source` > `SidePanel` > `FakeMaker` > `Save`
  6. `Devtools` > `Source` > `SidePanel` > `FakePlayer` > `Install`
  7. Wait for the player to issue "Playback Complete" in the Devtools Console.
  8. `Devtools` > `Source` > `SidePanel` > `FakeMaker` > `Save`.
  9. Add the files <TBD> to a copy of your Web app: this is your benchmark.

How does it work:

When you press Install on FakeMaker:
  1. A JS transcoder is installed in the devtools preprocessor,
  2. An ES6 Proxy is created for `window`,
  3. The web app is reloaded so all of its JS is preprocessed then run in the presences of the Proxy.

  The transcoder re-writes `window` -> `windowProxy` and every global variable `x` to `windowProxy.x`.  JavaScript built-ins are not re-written; neither are global properties created by the JavaScript. This way the JS code will go through the proxy for every DOM-related action. 

  The Proxy for `window` calls the underlying DOM functions and records the replies. Simple values are just stored in the record. Objects and functions are proxied and a JSON-able representation of these objects are recorded.  The values or proxies are then returned to the JS code. The JS code continues to run and it may operate again on the proxies returned. This causes further recording and maybe more proxies to be created.
 
When you press `Save` on FakeMaker:
  The recorded values and objects are converted to a JSON string and written to a file.

When you press `Install` on FakePlayer:
  1. A JS transcoder is installed in the devtools preprocessor,
  2. A FakePlayer instance called `windowProxy` is created.
  3. The web app runs against the FakePlayer.

The transcoder works as in the FakeMaker: `window` becomes `windowProxy`.

The FakePlayer instance has properties named like the global objects used by the Web app, but these properties are backed by the recording. As the web app accesses properties, calls functions, or constructs new Objects, the record is played back. Thus the JS code thinks it is talking to the DOM.

When you press `Save` on the FakePlayer:
  The FakePlayer, the recording, and transcoded sources are written to `output/Played`.  This is the benchmark.

Verification:

To verify the playback we use a second, much simpler kind of recording. As above we transcode the web app, but this time we store a list of file names, and one pair of filename-number and source-text character offset for each function entry, function call, and function exit. Thus all of the non-DOM functions called in the program are recorded. We create this trace using the Trace side panel pane. Then we repeat the trace with FakeMaker and with FakePlayer. All three traces are written to a text file and diff-ed to verify that all of the functions are called.
