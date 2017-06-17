//This script is loaded by viewer.js only during testing 

var portViewerTest = chrome.runtime.connect({name:"viewer_test.js-to-testing.js"});

portViewerTest.onMessage.addListener(function(m) {
	console.log('got message from port', m);
	var retval;
	if (m.cmd == 'view raw'){
		retval = view_raw();
		portViewerTest.postMessage({cmd: m.cmd, rv: retval});	
	}
	
});


function view_raw(){
	document.getElementById("viewRaw").click();
	return true;
}
