var testing_oracle = 
{'name':'testingoracle',
	'IP':'127.0.0.1',
	'port':'10011',
	'modulus':['will be read from file']
}
var verdictport;
var portdelta;

//Toggle these to false if you want to skip certain time-consuming tests
var will_test_reliable_site_pubkey = true;
var will_test_socket = true;

var portManagerTest = null; //communication between testing.js and manager_test.js
var portViewerTest = null; //communication between testing.js and viewer_test.js
var portFilePickerTest = null; //communication between testing.js and file_picker_test.js


function wait_for_browser_init(){
	if (! browser_init_finished){
		setTimeout(function(){wait_for_browser_init();}, 500);
	}
	else {
		//sometimes Firefox consumes our tab with its own, so we wait longer
		setTimeout(function(){init_testing();}, 2000);
	}
}
wait_for_browser_init();


function openURL(url){
	chrome.tabs.create({url:url}, function(t){
		//resolve();
	});
}


function wait_until_url_loaded(args){
	var url = args.url;
	var match_ending = (typeof args.match_ending !== 'undefined');
	var notarizing = (typeof args.notarizing !== 'undefined');
	var timerStarted = new Date().getTime()/1000;
	var timeout = 60;
	
	return new Promise(function(resolve, reject) {

	var check_if_loaded = function(url){
		var now = new Date().getTime()/1000;
		if ((now - timerStarted) > timeout){
			reject('operation timed out');
			return;
		}
		chrome.tabs.query({active: true}, function(t){
			var is_url_matched = false;
			if (match_ending){
				is_url_matched = t[0].url.endsWith(url);
			}
			else {
				is_url_matched = (t[0].url === url); 
			}
			if (is_url_matched){
				resolve();
				return;
			}
			else {
				console.log('url ' + url + ' not yet loaded, waiting');
				setTimeout(function(){check_if_loaded(url);}, 100);
			}
		});
	};
	check_if_loaded(url);
	
	});
}


function test_verifychain(){
	var rootCAder;
	var badsignormalder;
	return import_resource('testing/unknown_rootCA.certder')
	.then(function(dercert){
		if (verifyCertChain([dercert])){
			Promise.reject('unknown CA verified');
		}
		console.log('unknown CA test passed');
		return import_resource('testing/rootCA.certder')
	})
	.then(function(der){
		rootCAder = der;
		return import_resource('testing/normal_badsig.certder')
	})
	.then(function(der){
		badsignormalder = der;
		if (verifyCertChain([badsignormalder, rootCAder])){
			Promise.reject('bad signature verified');
		}
		console.log('bad signature test passed');
	})
	.catch(function(err){
		console.log('caught error', err);
		test_failed();
	})
}


function test_reliable_site_pubkey(){
	return new Promise(function(resolve, reject) {

	//corrupt one byte of reliable site modulus and make sure preparing PMS fails
	var correct_modulus = reliable_sites[0]['modulus'];
	var bad_byte_pos = Math.random()*(correct_modulus.length) << 0;
	var bad_byte = (correct_modulus[bad_byte_pos] + 1) % 255;
	var corrupted_modulus = [].concat(
		correct_modulus.slice(0, bad_byte_pos), bad_byte, correct_modulus.slice(bad_byte_pos+1));
	reliable_sites[0]['modulus'] = corrupted_modulus;
	var random_site_modulus = []; //this is not used in prepare_pms, any random value will do
	for (var i=0; i < 256; i++) {
		random_site_modulus.push(Math.round(Math.random() * 255));
	}
	//just one or two failures may also mean incorrect padding
	//we need to be sure that it is not padding but the flipped byte, hence 10 tries
	//copied from main.js with tweaks
	random_uid = Math.random().toString(36).slice(-10);
	var tries = 0;
	var loop = function(){
		tries += 1;
		prepare_pms(random_site_modulus)
		.then(function(args){
			//we get here when there was no error and prepare_pms didnt throw
			reject('Testing incorrect reliable site pubkey FAILED');
		})
		.catch(function(error){
			if (error != 'PMS trial failed'){
				reject('in prepare_pms: caught error ' + error);
				return;
			}
			if (tries == 10){
				reliable_sites[0]['modulus'] = correct_modulus;
				resolve('Could not prepare PMS after 10 tries');
				console.log('Incorrect reliable site pubkey test PASSED');
				return;
			}
			//else PMS trial failed
			loop();
		});
	};
	loop(resolve, reject);
		
	});
}


//TODO test timeout when connect() 
function test_socket(){
	return new Promise(function(globalresolve, globalreject) {
		var sckt1 = new Socket('127.0.0.1', 16441+portdelta);
		var sckt2 = new Socket('127.0.0.1', 16442+portdelta);
		var sckt3 = new Socket('127.0.0.1', 16443+portdelta);
		var sckt4 = new Socket('127.0.0.1', 16444+portdelta);
		
		console.log('socket test: connect to a closed port')
		return sckt1.connect()
		.then(function resolved(){
			console.log('shouldnt get here');
			globalreject();
		}, function rejected(){
			//reject()ed as expected
			console.log('testing connect() passed');
			return Promise.resolve();
		})
		.then(function(){
			return new Promise(function(resolve, reject) {
				console.log('socket test: should timeout while receiving data');
				sckt2.recv_timeout = 2*1000;
				var timeout = setTimeout(function(){
					globalreject('recv didnt timeout after 2 seconds as expected');
				}, 3*1000);
				sckt2.connect()
				.then(function() {
					return sckt2.recv();
				})
				.then(function resolved(){
					globalreject('recv wasnt supposed to resolve');
				}, function rejected(what){
					console.log('rejected', what);
					if (what !== 'recv: socket timed out'){
						globalreject('recv rejected with wrong message');
					}
					else {
						clearTimeout(timeout);
						console.log('recv timeout test passed');
						resolve();
					}
				});
			});
		})
		.then(function(){
			return new Promise(function(resolve, reject) {
				console.log('socket test: should timeout while waiting for complete record');
				var timeout;
				sckt3.connect()
				.then(function(){
					timeout = setTimeout(function(){
						reject('received complete records didnt timeout after 4 second as expected');
					}, 4*1000);
					return sckt3.recv();
				})
				.then(function resolved(){
					clearTimeout(timeout);
					console.log('complete record timeout test passed');
					resolve();
				}, function rejected(what){
					globalreject('complete record timeout test failed ', what);
				});
			});
		})
		.then(function(){
			//we dont want to timeout because we are testing the 
			//complete/incomplete records logic
			sckt4.recv_timeout = 999999*1000;
			return sckt4.connect();
		})
		.then(function(){
			console.log('random test');
			sckt4.send(str2ba('hello world'));
			return sckt4.recv();
		})
		.then(function(data_with_md5){
			//the last TLS record of 21 bytes contains a 16-byte md5 hash of all records
			var data = data_with_md5.slice(0, -21);
			var md5sum = data_with_md5.slice(-16);
			var check_md5sum = md5(data);
			if (check_md5sum.toString() === md5sum.toString()){
				console.log('socket test passed');
				globalresolve();
			}
			else {
				console.log('socket test failed');
				globalreject();
			}
		});
	});
}



//return the most recent PageSigner session's dir name
function getMostRecentDirName(){
	return new Promise(function(resolve, reject) {

	chrome.storage.local.get(null, function(items){
		var keys = Object.keys(items);
		var sessions = [];
		for (var i=0; i < keys.length; i++){
			if (! keys[i].startsWith('session')) continue;
			sessions.push(keys[i]);
		}
		var sessions_before = sessions;
		//create sort order based on creation time
		sessions.sort(function (a,b){
			var as = a.creationTime, bs = b.creationTime;
			return as == bs ? 0: (as > bs ? 1 : -1);
		});
		resolve(sessions[sessions.length - 1]);	
	});
	
	});
}


function checkDirContent(dirname){
	return new Promise(function(resolve, reject) {
	getFileContent(dirname, 'raw.txt')
	.then(function(raw){
		rawstr = raw;
		//the first 6 lines are Python's non-deterministic headers, cutting'em out
		var x = rawstr.split('\r\n\r\n');
		var headers = x[0];
		var body = x[1];
		headers = headers.split('\r\n').slice(6).join('\r\n') + '\r\n\r\n';
		rawstr = headers + body;
		return import_resource('testing/testpage.html');
	})
	.then(function(testpage_ba){
		testpage_html = ba2str(testpage_ba);
		testpage_raw = 'Header1: one\r\nHeader2: two\r\n\r\n'+testpage_html;
		if (testpage_raw !== rawstr){
			console.log('testpage_raw was', testpage_raw);
			console.log('rawstr was', rawstr);
			reject('rawstr mismatch');
		}
		return getFileContent(dirname, 'metaDomainName');
	})
	.then(function(str){
		if (str !== '127.0.0.1'){
			reject('metaDomainName mismatch');
		};
		return getFileContent(dirname, 'metaDataFilename');
	})
	.then(function(str){
		if (str !== 'data.html'){
			reject('metaDataFilename mismatch');
		};
		return getFileContent(dirname, 'meta');
	})
	.then(function(str){
		if (str !== '127.0.0.1'){
			reject('meta mismatch');
		};
		return getFileContent(dirname, 'data.html');
	})
	.then(function(str){
		//ignore the first 3 bytes - unicode marker
		if (str !== testpage_html){
			reject('data.html mismatch');
		}
		else {
			resolve();
		}
	});
	});
}


function findAndCloseRawTab(){
	return new Promise(function(resolve, reject) {
	
	function check(){
		console.log('in findAndCloseRawTab check');			
		findAndCloseRawTab.count++;
		if (findAndCloseRawTab.count > 10){
			console.log('raw tab didnt appear')
			reject('raw tab didnt appear');
			return;
		}
		
		chrome.tabs.query({active:true}, function(t){
			if (t[0].title !== 'PageSigner raw viewer') {
				setTimeout(check, 100);
				return;
			}
			//else
			chrome.tabs.remove(t[0].id, function(){
				//set to 0 for the next test's invocation
				findAndCloseRawTab.count = 0;
				resolve();
			});
		});
	};
	check();
	
	});
}
findAndCloseRawTab.count = 0;


/*
 * List of tests:

corrupt reliable site pubkey and make sure preparing PMS fails
notarize a sample page and make sure the correct files are created in file system
open manager and find the new session entry in the table
rename the entry
export the entry
view the entry
click 'view raw with http headers' button inside the view tab
click raw from the manager tab
delete entry
import the pgsg that we exported earlier
make sure correct files are created in file system
make sure the imported entry is correctly reflected in manager table

 */


function init_testing(){
	
	console.log('in init_testing');
	var test_url = 'https://127.0.0.1:4443/testpage.html';
	var rawstr;
	var dirname;
	var imported_dirname;
	var testpage_html;
	var new_random_name = Math.random().toString(36).slice(-7);
	var pgsg;
	var creationTime;
	var timerStarted;
	

	return new Promise(function(resolve, reject) {
		var url_suffix = is_chrome ? 'chrome' : 'firefox';
		var signal_url = 'http://127.0.0.1:0/pagesigner_testing_on_' + url_suffix;
		console.log('signal url is', signal_url);
		//firefox has issues is signal_url is passed as a filter
		chrome.tabs.query({url: ['<all_urls>']}, function(tabs){
			console.log('got tabs', tabs)
			if (tabs.length != 1){
				reject('couldnt find open tab with signal url');
			}
			else if (tabs[0].url != signal_url){
				reject('couldnt find signal url in open tab');
			}
			else {
				setup();
			}
		});
		
		function setup(){
			if (is_chrome){
				verdictport = '11557';
				portdelta = 0
				chrome.management.get(appId, function(a){
					if (typeof(a) === 'undefined'){
						reject('app not installed');
					}
					else {
						resolve();
					}
				});
			}
			else { //on firefox
				verdictport = '12557';
				portdelta = 1000;
				resolve();
				return;
				
				Services.prefs.getBranch("toolkit.startup.").setIntPref('max_resumed_crashes',-1);
				//'Well this is embarassing' tab closes our first tab, disable it
				Services.prefs.getBranch("browser.sessionstore.").setBoolPref('resume_from_crash', false);
				//enable verbose mode (but verbosity will have effect only on next start)
				Services.prefs.getBranch("extensions.pagesigner.").setBoolPref('verbose',true);
			}
		}
	})
	.then(function(){
		testing = true;
		return setPref('testing', true);
	})
	.then(function(){
		setTimeout(test_verifychain, 0);
		return import_resource('testing/reliable_site_pubkey.txt');
	})
	.then(function(text_ba){
		reliable_sites = [];
		parse_reliable_sites(ba2str(text_ba));
		reliable_sites[0]['port'] = 5443;
		return import_resource('testing/signing_server_pubkey.txt');
	})
	.then(function(text_ba){
		var numbers_str = ba2str(text_ba).split(',');
		var modulus = [];
		for(var i=0; i<numbers_str.length; i++){
			modulus.push(parseInt(numbers_str[i]));
		}
		testing_oracle.modulus = modulus;
		return import_resource('testing/rootCA.cert');
	})
	.then(function(text_ba){
		certs['CN=TLSNOTARY/'] = ba2str(text_ba);
		//add a notary+signing server pubkey
		oracles_intact = true;
		chosen_notary = testing_oracle;
		return will_test_reliable_site_pubkey ? test_reliable_site_pubkey() :
			Promise.resolve();
	})
	.then(function(){
		if (will_test_socket){
			return test_socket;
		}
		else {
			return Promise.resolve();
		}
	})
	.then(function(){
		//automatically opentab and notarize it
		openURL(test_url);
		return wait_until_url_loaded({url:test_url, notarizing:true});
	})
	.then(function(){
		notarizeNowSelected();
		var prefix = is_chrome ? 'webextension/' : '';
		var viewer_url = chrome.extension.getURL(prefix+'content/viewer.html'); 
		return wait_until_url_loaded({url:viewer_url, notarizing:true});

	})
	//make sure the correct files were created in the filesystem
	.then(getMostRecentDirName)
	.then(function(name){
		console.log('most recent dir is', name);
		dirname = name;	
		return checkDirContent(dirname);
	})
	.then(() => getFileContent(dirname, 'creationTime'))
	.then(function(ct){
		creationTime = ct;
		return getFileContent(dirname, 'pgsg.pgsg');
	})
	.then(function(ba){
		pgsg = ba; //we're gonna need pgsg later on when importing on Chrome

		return new Promise(function(resolve, reject) {

		chrome.runtime.onConnect.addListener(function(p){
			console.log('in testing got port', p);
			if (p.name == 'manager_test.js-to-testing.js'){
				if (portManagerTest){
					console.log('portManager already activated');
					return;
				}
				portManagerTest = p;
				portManagerTest.onMessage.addListener(messageListener);
				portManagerTest.postMessage({cmd: 'check that table has been populated1'});
			}
			else if ((p.name == 'viewer_test.js-to-testing.js') && !portViewerTest){
				portViewerTest = p;
				portViewerTest.onMessage.addListener(messageListener);
			}
			else if ((p.name == 'file_picker_test.js-to-testing.js') && !portFilePickerTest){
				portFilePickerTest = p;
				portFilePickerTest.onMessage.addListener(messageListener);
			}
			else {
				console.log('unknown port name or duplicate port', p.name);
			}
		});
		
		console.log('opening manager');
		var prefix = is_chrome ? 'webextension/' : '';
		var url = chrome.extension.getURL(prefix+'content/popup.html');
		openURL(url);

		function messageListener(m){
			console.log('messageListener got msg', m);
			if (m.rv == false) {
				reject(m.cmd);
				return;
			}
			if (m.cmd == 'check that table has been populated1'){
			    portManagerTest.postMessage({cmd: 'find entry in table', entry: creationTime});
		    }
		    else if (m.cmd == 'find entry in table'){
				portManagerTest.postMessage({cmd: 'rename entry', entry: new_random_name});
			}
			else if (m.cmd == 'rename entry'){
				portManagerTest.postMessage({cmd: 'check that table has been populated2'});
			}
			else if (m.cmd == 'check that table has been populated2'){
				portManagerTest.postMessage({cmd: 'find new entry', entry: new_random_name});
			}
			else if (m.cmd == 'find new entry'){
				
				//check that the changed name is also correctly reflected in file system
				getFileContent(dirname, 'meta')	
				.then(function(str){
					if (str !== new_random_name){
						reject('new meta mismatch');
					}
					else {
						portManagerTest.postMessage({cmd: 'export file', entry: new_random_name});
					}
				});
			}
			else if (m.cmd == 'export file'){
				portManagerTest.postMessage({cmd: 'dismiss export warning'});
			}
			else if (m.cmd == 'dismiss export warning'){
				portManagerTest.postMessage({cmd: 'click view', entry: new_random_name});
			}
			else if (m.cmd == 'click view'){
			
				//portViewer becomes available when viewer_test.js is loaded
				function checkPortViewerTest(){
					console.log('in checkPortViewerTest');
					checkPortViewerTest.count++;
					if (checkPortViewerTest.count > 10) { reject('checkPortViewerTest'); return; }
					if (portViewerTest == null) { setTimeout(checkPortViewerTest, 100); }
					else { portViewerTest.postMessage({cmd: 'view raw'}); }
				}
				checkPortViewerTest.count = 0;
				checkPortViewerTest();
			}
			else if (m.cmd == 'view raw'){
				findAndCloseRawTab()
				.then(function(){
					console.log('sending click raw');
					portManagerTest.postMessage({cmd: 'click raw', entry: new_random_name});
				});
			}
			else if (m.cmd == 'click raw'){
				findAndCloseRawTab()
				.then(function(){
					portManagerTest.postMessage({cmd: 'click delete', entry: new_random_name});
				});
			}
			else if (m.cmd == 'click delete'){
				portManagerTest.postMessage({cmd: 'check that table has been populated3'});
			}
			else if (m.cmd == 'check that table has been populated3'){
				portManagerTest.postMessage({cmd: 'check that entry is gone', entry:new_random_name});
			}
			else if (m.cmd == 'check that entry is gone'){
				console.log('opening file picker');
				var prefix = is_chrome ? 'webextension/' : '';
				var url = chrome.extension.getURL(prefix+'content/file_picker.html');
				openURL(url);
				
				//portFilePicker becomes available when file_picker_test.js is loaded
				function checkPortFilePickerTest(){
					console.log('in checkPortFilePickerTest');
					checkPortFilePickerTest.count++;
					if (checkPortFilePickerTest.count > 10) { reject('checkPortFilePickerTest'); return; }
					if (portFilePickerTest == null) { setTimeout(checkPortFilePickerTest, 100); }
					else {			 
						portFilePickerTest.postMessage({cmd: 'import pgsg', data: pgsg}); 
					}
				}
				checkPortFilePickerTest.count = 0;
				checkPortFilePickerTest();				
			}
			else if (m.cmd == 'import pgsg'){
				portManagerTest.postMessage({cmd: 'check that table has been populated4'});
			}
			else if (m.cmd == 'check that table has been populated4'){
				getMostRecentDirName()
				.then(function(imported_name){
					return getFileContent(imported_name, 'creationTime');
				})
				.then(function(creationTime){
					setTimeout(function(){
					portManagerTest.postMessage({cmd: 'check if imported', ct:creationTime});
					}, 5000);
				});
			}
			else if (m.cmd == 'check if imported'){
				console.log('resolving after check if imported');
				resolve();
				return;
			}
			else {
				reject();
			}
		};
		
		});
	})
	.then(function(){
		console.log('session must not be in storage', dirname);
		//the deleted session must not be in storage
		return new Promise(function(resolve, reject) {

		chrome.storage.local.get(dirname, function(obj){
			console.log('objects in storage', obj);
			if (Object.keys(obj).length == 0) {resolve();}
			else { reject('session still in storage'); }
		});
		
		});
	})	
	.then(function(){
		console.log('getting most recent dirname');
		return getMostRecentDirName();
	})
	.then(function(name){
		imported_dirname = name;
		if (dirname === imported_dirname){
			return Promise.reject('could not find imported dirname');
		}
		return checkDirContent(imported_dirname);
	})
	.then(() => getFileContent(imported_dirname, 'pgsg.pgsg'))
	.then(function(imported_pgsg){
		if (imported_pgsg.toString() !== pgsg.toString()){
			return Promise.reject('imported file does not match');
		}
		return Promise.resolve();
	})
	.then(function(){
		test_passed();
	})
	.catch(function(what){
		console.log('testing caught rejection', what);
		if (what === 'not testing'){
			return;
		}
		test_failed();
		alert(what);
	});
}


function test_passed(){
	var xhr = get_xhr();
	xhr.open('HEAD', 'http://127.0.0.1:'+ verdictport +'/TEST_PASSED', true);
	xhr.send();		
}

function test_failed(){
	var xhr = get_xhr();
	xhr.open('HEAD', 'http://127.0.0.1:'+ verdictport +'/TEST_FAILED', true);
	xhr.send();	
}


function findDiff(str1, str2){
	for(var i=0; i < str1.length; i++){
		if (str1[i] !== str2[i]){
			console.log('diff at ', i);
			return;
		}	
	}
}
