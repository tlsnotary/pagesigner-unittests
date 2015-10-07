var testing_oracle = 
{'name':'testingoracle',
'main': {
	'IP':'127.0.0.1',
	'port':'10011'
},
'sig': {
	'modulus':['will be read from file']
}
}
var verdictport;
var manager_tabID;
var view_tabID;
var viewRawDocument;
var dldir; //Download dir where pgsg is exported to
//Toggle these to false if you want to skip certain time-consuming tests
var will_test_reliable_site_pubkey = false;

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
	//return new Promise(function(resolve, reject) {
		if (is_chrome){
			chrome.tabs.create({url:url}, function(t){
				//resolve();
			});
		}
		else {
			gBrowser.selectedTab = gBrowser.addTab(url);
			//resolve();
		}
	//});
}


function wait_until_url_loaded(args){
	var url = args.url;
	var match_ending = (typeof args.match_ending !== 'undefined');
	var notarizing = (typeof args.notarizing !== 'undefined');
	var timerStarted = new Date().getTime()/1000;
	var timeout = 60;
	
	return new Promise(function(resolve, reject) {
		if (is_chrome){	
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
					//urls that we will notarize must be "loaded"
					//ie placed by a listener into the var tabs
					if (is_url_matched && (notarizing ? tabs.hasOwnProperty(t[0].id) : true)){
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
		}
		else {
			var check_if_loaded = function(url){
				var now = new Date().getTime()/1000;
				if ((now - timerStarted) > timeout){
					reject('operation timed out');
					return;
				}
				var href = gBrowser.selectedBrowser.contentWindow.location.href;
				var is_url_matched = false;
				if (match_ending){
					is_url_matched = href.endsWith(url);
				}
				else {
					is_url_matched = (href === url); 
				}
					
				if (is_url_matched && !notarizing){
					console.log('url matched, resolving');
					resolve();
					return;
				}
				else if (is_url_matched && notarizing){
					if (dict_of_status.hasOwnProperty(url)){
						console.log('notarized url matched, resolving');
						resolve();
						return;
					}
					else {
						console.log('notarized url ' +url+ ' matched but it is not in dict yet');
						setTimeout(function(){check_if_loaded(url);}, 500);
					}
				}
				else {
					console.log('url '+	url +' not yet loaded, waiting');
					setTimeout(function(){check_if_loaded(url);}, 500);
				}
			};
			check_if_loaded(url);
		}
	});
}


function test_verifychain(){
	var rootCAder;
	var badsignormalder;
	return import_resource(['testing', 'unknown_rootCA.certder'])
	.then(function(dercert){
		if (verifyCertChain([dercert])){
			Promise.reject('unknown CA verified');
		}
		console.log('unknown CA test passed');
		return import_resource(['testing', 'rootCA.certder'])
	})
	.then(function(der){
		rootCAder = der;
		return import_resource(['testing', 'normal_badsig.certder'])
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
	random_uid = Math.random().toString(36).slice(-7);
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
		var sckt1 = new Socket('127.0.0.1', 16441);
		var sckt2 = new Socket('127.0.0.1', 16442);
		var sckt3 = new Socket('127.0.0.1', 16443);
		var sckt4 = new Socket('127.0.0.1', 16444);
		
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
				var timeout;
				sckt3.connect()
				.then(function(){
					timeout = setTimeout(function(){
						reject('received complete records didnt timeout after 1 second as expected');
					}, 2*1000);
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

function executeScript(code, argTabID){
	return new Promise(function(resolve, reject) {
		if (! is_chrome){
			var retval = eval(code);
			resolve(retval);
		}
		else {
			var tabID = manager_tabID;
			if (typeof(argTabID) !== 'undefined'){
				tabID = argTabID;
			}
			chrome.tabs.executeScript(tabID, {code:code},
			function(result){
				resolve(result[0]);
			});
			
		}
	});
	
}


//return the most recent PageSigner session's dir name
function getMostRecentDirName(){
	return new Promise(function(resolve, reject) {
		var modTimes = {};
		getDirContents('/')
		.then(function(entries){
			var promises = [];
			
			var gmt = function(entry){
				return new Promise(function(resolve, reject) {
					getModTime(entry)
					.then(function(mt){
						modTimes[mt] = getName(entry);
						resolve();
					});
				});
			};
			
			for (var i=0; i < entries.length; i++){
				if (isDirectory(entries[i])){
					promises.push(gmt(entries[i]));
				}
			}
			return Promise.all(promises);
		})
		.then(function(){
			var keys = Object.keys(modTimes);
			var latest = keys[0];
			for (var i=1; i < keys.length; i++){
				if (keys[i] > latest){
					latest = keys[i];
				}
			}
			var dirname = modTimes[latest]; 
			console.log(dirname);
			resolve(dirname);
		});
	});
}


function checkDirContent(dirname){
	return new Promise(function(resolve, reject) {
	getFileContent(dirname, 'raw.txt')
	.then(function(raw){
		rawstr = ba2str(raw);
		//the first 6 lines are Python's non-deterministic headers, cutting'em out
		var x = rawstr.split('\r\n\r\n');
		var headers = x[0];
		var body = x[1];
		headers = headers.split('\r\n').slice(6).join('\r\n') + '\r\n\r\n';
		rawstr = headers + body;
		return import_resource(['testing', 'testpage.html']);
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
	.then(function(ba){
		if (ba2str(ba) !== '127.0.0.1'){
			reject('metaDomainName mismatch');
		};
		return getFileContent(dirname, 'metaDataFilename');
	})
	.then(function(ba){
		if (ba2str(ba) !== 'data.html'){
			reject('metaDataFilename mismatch');
		};
		return getFileContent(dirname, 'meta');
	})
	.then(function(ba){
		if (ba2str(ba) !== '127.0.0.1'){
			reject('meta mismatch');
		};
		return getFileContent(dirname, 'data.html');
	})
	.then(function(ba){
		//ignore the first 3 bytes - unicode marker
		if (ba2str(ba.slice(3)) !== testpage_html){
			reject('data.html mismatch');
		}
		else {
			resolve();
		}
	});
	});
}

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
	var timerStarted;
	
	return new Promise(function(resolve, reject) {
		if (is_chrome){
			verdictport = '11557';
			chrome.tabs.query({url:'http://127.0.0.1:0/pagesigner_testing_on_chrome'}, function(tabs){
				if (tabs.length == 1){
					chrome.management.get(appId, function(a){
						if (typeof(a) === 'undefined'){
							reject('app not installed');
						}
						else {
							resolve();
						}
					});
				}
				else {
					reject('not testing');
				}
			});
		}
		else { //on firefox
			verdictport = '11558';
			var env = Cc["@mozilla.org/process/environment;1"].getService(Ci.nsIEnvironment);
			if (env.get("PAGESIGNER_TESTING_ON_FIREFOX") === 'true'){
				console.log('PAGESIGNER TESTING')
				//prevent Safe Mode dialog from appearing
				Services.prefs.getBranch("toolkit.startup.").setIntPref('max_resumed_crashes',-1);
				//'Well this is embarassing' tab closes our first tab, disable it
				Services.prefs.getBranch("browser.sessionstore.").setBoolPref('resume_from_crash', false);
				//enable verbose mode (but verbosity will have effect only on next start)
				Services.prefs.getBranch("extensions.pagesigner.").setBoolPref('verbose',true);
				//Create tmpdir if doesnt exist
				dldir = OS.Path.join(Cc["@mozilla.org/file/directory_service;1"].
				   getService(Ci.nsIProperties).get("DfltDwnld", Ci.nsIFile).path, 'pagesigner.tmp.dir');
				OS.File.makeDir(dldir)
				.then(function(){
					resolve();
				})
			}
			else {
				reject('not testing');
			}
		}
	})
	.then(function(){
		testing = true; //makes startNotarizing call a callback when done
		setTimeout(test_verifychain, 0);
		return import_resource(['testing', 'reliable_site_pubkey.txt']);
	})
	.then(function(text_ba){
		reliable_sites = [];
		parse_reliable_sites(ba2str(text_ba));
		reliable_sites[0]['port'] = 5443;
	})
	.then(function(){
		return import_resource(['testing', 'signing_server_pubkey.txt']);
	})
	.then(function(text_ba){
		var numbers_str = ba2str(text_ba).split(',');
		var modulus = [];
		for(var i=0; i<numbers_str.length; i++){
			modulus.push(parseInt(numbers_str[i]));
		}
		testing_oracle.sig.modulus = modulus;
		return import_resource(['testing', 'rootCA.cert']);
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
		return test_socket();
	})
	.then(function(){
		//automatically opentab and notarize it
		//return openURL(test_url)
		openURL(test_url);
		//.then(function(){
			return wait_until_url_loaded({url:test_url, notarizing:true});
		//});
	})
	.then(function(){
		return new Promise(function(resolve, reject) {
				startNotarizing( function(){ resolve(); } );
			});
	})
	//make sure the correct files were created in the filesystem
	.then(function(){
		return getMostRecentDirName();
	})
	.then(function(name){
		dirname = name;	
		return checkDirContent(dirname);
	})
	.then(function(){
		return getFileContent(dirname, 'pgsg.pgsg');
	})
	.then(function(ba){
		pgsg = ba; //we're gonna need pgsg later on when importing on Chrome
		
		//wait for the notarized page to pop up before we proceed
		//otherwise the delayed opened tab may steal focus from manager tab
		return wait_until_url_loaded({url:'data.html', match_ending:true});
	})
	.then(function(){
		console.log('opening manager and waiting for it to load');
		if (is_chrome){
			//Chrome doesnt allow programmaticaly trigerring the popup
			//so we open it as html and pass a hash, so that the popup triggers its own menu
			openURL(chrome.runtime.getURL('content/chrome/popup.html#manage'));
		}
		else {
			main.manage();
		}
		return wait_until_url_loaded({url:manager_path});						
	})
	.then(function(){
		console.log('chrome: getting manager tab ID');
		if (is_chrome){
			//get the manager tab ID
			chrome.tabs.query({active:true}, function(tabs){
				manager_tabID = tabs[0].id;
				return Promise.resolve();
			});
		}
		else {
			manager_tabID = gBrowser.selectedTab;
			return Promise.resolve();
		}
	})
	.then(function(){
		return new Promise(function(resolve, reject) {
			if (is_chrome){
				//wait for content script to be injected
				var wait_for_content_script = function(){
					executeScript('var managerDocument = document;' +
								'document.getElementById("content_script_injected_into_page").textContent')
					.then(function(result){
						if (result !== 'true'){
							console.log('content script not yet loaded, retrying');
							setTimeout(function(){wait_for_content_script();}, 100);
						}
						else {
							resolve();
						}
					});
				};
				wait_for_content_script();
			}
			else {
				resolve();
			}
		});
	})
	.then(function(){
		return new Promise(function(resolve, reject) {	
			if (is_chrome){
				chrome.tabs.executeScript(manager_tabID, 
					{file:'content/testing/manager_test.js'},
					function(){
						resolve();
					});
			}
			else {
				resolve();
			}
		});
	})
	.then(function(){
		console.log('wait for table_populated to be set to true');
		return new Promise(function(resolve, reject) {
			var wait_for_variable = function(){
				executeScript('check_table_populated()')
				.then(function(result){
					if (result !== true){
						console.log('table is not yet populated, retrying');
						setTimeout(function(){wait_for_variable();}, 100);
					}
					else {
						resolve();
					}
				});
			};
			wait_for_variable();
		});
	})
	.then(function(){
		console.log('finding entry in table');
		return new Promise(function(resolve, reject) {
			var parts = dirname.split('-');
			var partbefore = parts.slice(0, -1);
			var partafter = parts.slice(-1);
			var text_to_find = [partbefore.join('-'), partafter].join(' , ');
		
			executeScript('findDirnameInTable("' + text_to_find + '");')
			.then(function(result){
				if (result === true){
					resolve();
				}
				else {
					reject('could not find entry in the table');
				}
			});
		});
	})
	.then(function(){
		console.log('renaming table entry');
		return new Promise(function(resolve, reject) {
			var rename = function(newname){
				executeScript('renameEntry("' + newname + '");')
				.then(function(result){
					if (result !== true){
						console.log('rename dialog is not yet ready, retrying');
						setTimeout(function(){rename(newname);}, 100);
					}
					else {
						resolve();
					}
				});
			};
			rename(new_random_name);
		});		
	})
	.then(function(){
		console.log('waiting for the table to repopulate');
		return new Promise(function(resolve, reject) {
			var wait_for_repopulate = function(){
				executeScript('check_table_populated();')
				.then(function(result){
					if (result !== true){
						console.log('the table hasnt yet repopulated, retrying');
						setTimeout(function(){wait_for_repopulate();}, 1000);
					}
					else {
						resolve();
					}
				});
			};
			wait_for_repopulate();
		});			
	})
	.then(function(){
		
		return new Promise(function(resolve, reject) {
			var findNewName = function(newname){
				executeScript('findNewName("' + newname + '");')
				.then(function(result){
					if (result !== true){
						console.log('findNewName returned false, retrying');
						setTimeout(function(){findNewName(newname);}, 100);
					}
					else {
						resolve();
					}
				});
			};
			findNewName(new_random_name);
		});		
	})
	.then(function(){
		//check that the changed name is also correctly reflected in file system
		return getFileContent(dirname, 'meta');
	})
	.then(function(ba){
		if (ba2str(ba) !== new_random_name){
			return Promise.reject('new meta mismatch');
		};
		//export the file
		return new Promise(function(resolve, reject) {
			executeScript('exportFile("' + new_random_name + '");')
				.then(function(result){	
					if (result === true){
						resolve();
					}
					else {
						reject('error while exporting');
					}
				}
			);
		});	
	})
	.then(function(){
		//wait for the export warning and press OK
		//export the file
		return new Promise(function(resolve, reject) {
			var dismissExportWarning = function(){
				executeScript('dismissExportWarning();')
					.then(function(result){	
						if (result === true){
							resolve();
						}
						else {
							console.log('export warning hasnt shown yet, retrying');
							setTimeout(function(){dismissExportWarning();}, 100);
						}
					}
				);
			};
			dismissExportWarning();
		});	
	})
	.then(function(){
		console.log('check that the file was exported (also save download dir location)');
		return new Promise(function(resolve, reject) {
			if (is_chrome){
				var check_downloads = function(){
					chrome.downloads.search({filenameRegex:'.*'+new_random_name+'.*'}, function(results){
						if (results.length !== 1){
							console.log('file not yet exported, retrying');
							setTimeout(function(){check_downloads()}, 100);
						}
						else{
							console.log(results);
							var fullpath = results[0].filename;
							var slash = os_win ? '\\' : '/';
							dldir = fullpath.slice(0, fullpath.lastIndexOf(slash)+1);
							resolve();
						}
					});
				};
				check_downloads();
			}  	
			else {				
				var dst = OS.Path.join(dldir, new_random_name); 
				function check_if_exists(path){
					if (OS.File.exists(path)){
						resolve();
					}
					else {
						console.log('export file does not exists yet, retrying');
						setTimeout(function(){check_if_exists(path)}, 100);
					}
				};
				check_if_exists(dst);
			}
		});
	})
	.then(function(){	
		console.log('clicking view');	
		return new Promise(function(resolve, reject) {
			executeScript('clickView("' + new_random_name + '");')
			.then(function(result){	
				if (result === true){
					resolve();
				}
				else {
					reject('error while clicking view');
				}
			});
		});	
	})
	.then(function(){
		console.log('wait for the view tab to become active');
		return wait_until_url_loaded({url:'data.html', match_ending:true});
		//TODO match URL against *pagesigner.tmp.dir*data.html regex
	})
	.then(function(){
		console.log('get the id of viewTab so we can inject scripts on Chrome');
		return new Promise(function(resolve, reject) {
			if (is_chrome){
				chrome.tabs.query({active: true}, function(t){
					view_tabID = t[0].id;
					resolve();
				});
			}
			else {
				resolve();
			}
		});
	})
	.then(function(){
		console.log('sanity check that the page is ours');
		return new Promise(function(resolve, reject) {
			var wait_for_title = function(){
				//in Chrome viewTabDocument may not be available yet because notification_bar wasnt injected
				executeScript('if(typeof(viewTabDocument) === "undefined"){false;}' +
							  'else{ var elements = viewTabDocument.getElementsByTagName("title");'+
							  'elements.length === 0 ? false : elements[0].textContent;}',
								 view_tabID)
				.then(function(result){
					if (result === false){
						setTimeout(function(){wait_for_title();}, 100);
					}
					else if (result === 'PageSigner test page'){
						resolve();
					}
					else {
						reject('wrong page opened in View');
					}
				});
			};
			wait_for_title();
		});
	})
	.then(function(){
		console.log('wait for the notification tab to be injected');
		return new Promise(function(resolve, reject) {
			var script = 'viewTabDocument.getElementById("viewRaw")';
			var wait_for_view_raw = function(){
				executeScript(script, view_tabID)
				.then(function(result){
					if (result === null){
						console.log('notification not yet injected, retrying');
						setTimeout(function(){wait_for_view_raw();}, 100);
					}
					else {
						resolve()
					}
				});
			};
			wait_for_view_raw();
		});
	})
	.then(function(){
		console.log('pressing view raw button');
		return new Promise(function(resolve, reject) {
			var script = 'viewTabDocument.getElementById("viewRaw").click()';
			executeScript(script, view_tabID)
			.then(function(result){
				resolve();
			});
		});
	})
	.then(function(){
		console.log('waiting view raw tab to appear');
		var url = is_chrome ? 
			'filesystem:chrome-extension://' + chrome.runtime.id + '/persistent/' + dirname + '/raw.txt' :
			OS.Path.toFileURI(OS.Path.join(fsRootPath, dirname, 'raw.txt'));
		return wait_until_url_loaded({url:url});
	})
	.then(function(){
		console.log('closing view raw tab');
		//close this tab just in case to prevent confusion
		//because in the next test we'll open a tab with the same URL
		return new Promise(function(resolve, reject) {
			if (is_chrome){
				chrome.tabs.query({active:true}, function(t){
					chrome.tabs.remove(t[0].id, function(){
						resolve();
					});
				});
			}
			else {
				gBrowser.removeCurrentTab();
				resolve();
			}
		});
	})
	.then(function(){
		console.log('clicking raw from the manager');
		return new Promise(function(resolve, reject) {
			executeScript('clickRaw("' + new_random_name + '");')
			.then(function(result){	
				if (result === true){
					resolve();
				}
				else {
					reject('error while clicking raw');
				}
			});
		});	
	})
	.then(function(){
		console.log('waiting for raw tab to open');
		var url = is_chrome ? 
			'filesystem:chrome-extension://' + chrome.runtime.id + '/persistent/' + dirname + '/raw.txt' :
			OS.Path.toFileURI(OS.Path.join(fsRootPath, dirname, 'raw.txt'));
		return wait_until_url_loaded({url:url});
	})
	.then(function(){
		console.log('clicking delete from the manager');
		return new Promise(function(resolve, reject) {
			executeScript('clickDelete("' + new_random_name + '");')
			.then(function(result){	
				if (result === true){
					resolve();
				}
				else {
					reject('error while clicking delete');
				}
			});
		});	
	})
	.then(function(){
	console.log('waiting for delete confirmation dialog and pressing OK');
		return new Promise(function(resolve, reject) {
			var confirmDelete = function(){
				executeScript('confirmDelete();')
				.then(function(result){	
					if (result === true){
						resolve();
					}
					else {
						console.log('delete confirmation hasnt shown yet, retrying');
						setTimeout(function(){confirmDelete();}, 100);
					}
				});
			};
			confirmDelete();
		});	
	})
	.then(function(){
		console.log('waiting for table to repopulate');
		return new Promise(function(resolve, reject) {
			var wait_for_repopulate = function(){
				executeScript('check_table_populated();')
				.then(function(result){
					if (result !== true){
						console.log('the table hasnt yet repopulated, retrying');
						setTimeout(function(){wait_for_repopulate();}, 100);
					}
					else {
						resolve();
					}
				});
			};
			wait_for_repopulate();
		});			
	})
	.then(function(){
		console.log('making sure the entry is not in the table anymore');
		return new Promise(function(resolve, reject) {
			executeScript('checkThatEntryIsGone("' + new_random_name + '");')
			.then(function(result){	
				if (result === true){
					resolve();
				}
				else {
					reject('error: the entry was still present in the table');
				}
			});
		});	
	})
	.then(function(){
		//check that the dir is no more on disk
		return getDirEntry(dirname)
		.then(function(){
			//no error
			return Promise.reject('dir still exists');
		})
		.catch(function(what){
			return Promise.resolve()
		});
	})	
	.then(function(data){
		return new Promise(function(resolve, reject) {
			executeScript("managerDocument.getElementById('table_populated').textContent = 'false';")
			.then(function(){
				//switch to manager tab so that we are not confused when the next tab opens
				if (is_chrome){
					var extraslash = os_win ? '\\' : '';
					var path  = 'file://' + extraslash + dldir + new_random_name + '.pgsg';
					import_resource(path, true)
					.then(function(data){
						chrome.tabs.update(manager_tabID, {active:true}, function(){
							chrome.runtime.sendMessage({'destination':'extension',
												'message':'import',
												'args':{'data':data}});
							resolve(wait_until_url_loaded({url:'data.html', match_ending:true}));
						});
					});
				}
				else {
					gBrowser.selectedTab = manager_tabID;
					testing_import_path = OS.Path.join(dldir, new_random_name + '.pgsg');
					main.verify();
					resolve(wait_until_url_loaded({url:'data.html', match_ending:true}));
				}
			});
		});
	})
	.then(function(){
		console.log('waiting for table to repopulate');
		return new Promise(function(resolve, reject) {
			var wait_for_repopulate = function(){
				executeScript('check_table_populated();')
				.then(function(result){
					if (result !== true){
						console.log('the table hasnt yet repopulated, retrying');
						setTimeout(function(){wait_for_repopulate();}, 100);
					}
					else {
						resolve();
					}
				});
			};
			wait_for_repopulate();
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
	.then(function(name){
		return getFileContent(imported_dirname, 'pgsg.pgsg');
	})
	.then(function(imported_pgsg){
		if (imported_pgsg.toString() !== pgsg.toString()){
			return Promise.reject('imported file does not match');
		}
		return Promise.resolve();
	})
	.then(function(){
		console.log('making sure imported entry is in table');
		return new Promise(function(resolve, reject) {
			//imported dirs have -IMPORTED at the tail of the name
			var parts = imported_dirname.split('-');
			var partbefore = parts.slice(0, -2);
			var partafter = parts.slice(-2, -1);
			var text_to_find = [partbefore.join('-'), partafter].join(' , ');
			
			executeScript('assertEntryImported("' + text_to_find + '");')
			.then(function(result){	
				if (result === true){
					resolve();
				}
				else {
					reject('error: the imported entry is not in the table');
				}
			});
		});	
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
