//This script is loaded by file_picker.js only during testing 

var portFilePickerTest = chrome.runtime.connect({name:"file_picker_test.js-to-testing.js"});

portFilePickerTest.onMessage.addListener(function(m) {
	console.log('got message from port', m);
	var retval;
	if (m.cmd == 'import pgsg'){
		import_pgsg(m.data);
	}
	
});

function import_pgsg(data){
	var e = {target: {result: ba2ab(data)}};
	onload(e);
	portFilePickerTest.postMessage({cmd: 'import pgsg', rv: true});	
	
}

function ba2ab(ba){
	var ab = new ArrayBuffer(ba.length);
	var dv = new DataView(ab);
	for(var i=0; i < ba.length; i++){
		dv.setUint8(i, ba[i]);
	}
	return ab;
}
