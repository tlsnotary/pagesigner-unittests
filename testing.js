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

function init_testing(){
	
	console.log('in init_testing');
	var test_url = 'https://127.0.0.1:4443/testpage.html';
	var modTimes = {}; //{modtime: dirname} object
	var rawstr;
	var dirname;
	var testpage_html;
	
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
				resolve();
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
		return test_reliable_site_pubkey();
	})
	.then(function(){
		//automatically opentab and notarize it
		return new Promise(function(resolve, reject) {
			if (is_chrome){
				chrome.tabs.create({url:test_url}, function(t){
					
					var interval;
					var check_if_loaded = function(){
						chrome.tabs.query({active: true}, function(t){
							if (t[0].url === test_url && tabs.hasOwnProperty(t[0].id)){
								clearInterval(interval);
								resolve();
							}
						});
					};
					interval = setInterval(check_if_loaded, 1000);
					
				});
			}
			else {
				gBrowser.selectedTab = gBrowser.addTab(test_url);
				var interval;
				var check_if_loaded = function(){
					if (gBrowser.selectedBrowser.contentWindow.location.href === test_url){
						clearInterval(interval);
						resolve();
					}
				};
				interval = setInterval(check_if_loaded, 1000);
			}
		});
	})
	.then(function(){
		return new Promise(function(resolve, reject) {
			startNotarizing( function(){ resolve(); } );
		});
	})
	//make sure the correct files were created in the filesystem
	.then(function(){
		//get the most recent dir
		return getDirContents('/');
	})
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
		dirname = modTimes[latest]; 
		console.log(dirname);
		return getFileContent(dirname, 'raw.txt');
	})
	.then(function(raw){
		rawstr = ba2str(raw);
		//the first 6 lines are Python's non-deterministic headers, cutting'em out
		var x = rawstr.split('\r\n\r\n');
		var headers = x[0];
		var body = x [1];
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
			Promise.reject('rawstr mismatch');
			return;
		}
		return getFileContent(dirname, 'metaDomainName');
	})
	.then(function(ba){
		if (ba2str(ba) !== '127.0.0.1'){
			Promise.reject('metaDomainName mismatch');
			return;
		};
		return getFileContent(dirname, 'metaDataFilename');
	})
	.then(function(ba){
		if (ba2str(ba) !== 'data.html'){
			Promise.reject('metaDataFilename mismatch');
			return;
		};
		return getFileContent(dirname, 'meta');
	})
	.then(function(ba){
		if (ba2str(ba) !== '127.0.0.1'){
			Promise.reject('meta mismatch');
			return;
		};
		return getFileContent(dirname, 'data.html');
	})
	.then(function(ba){
		//ignore the first 3 bytes - unicode marker
		if (ba2str(ba.slice(3)) !== testpage_html){
			Promise.reject('data.html mismatch');
			return;
		};
		var xhr = get_xhr();
		xhr.open('HEAD', 'http://127.0.0.1:'+ verdictport +'/TEST_PASSED', true);
		xhr.send();		
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

function test_failed(){
	var xhr = get_xhr();
	xhr.open('HEAD', 'http://127.0.0.1:'+ verdictport +'/TEST_FAILED', true);
	xhr.send();	
}

setTimeout(init_testing, 5000);

function findDiff(str1, str2){
	for(var i=0; i < str1.length; i++){
		if (str1[i] !== str2[i]){
			console.log('diff at ', i);
			return;
		}	
	}
}
