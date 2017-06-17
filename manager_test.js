//This script is loaded by manager.js only during testing 

var portManagerTest = chrome.runtime.connect({name:"manager_test.js-to-testing.js"});
var managerDocument = document;

portManagerTest.onMessage.addListener(function(m) {
	console.log('got message from port', m);
	var retval;
	if (m.cmd == 'check that table has been populated1'){
		check_table_populated('1');
	}
	else if (m.cmd == 'find entry in table'){
		retval = findDirnameInTable(m.entry);
		portManagerTest.postMessage({cmd: m.cmd, rv: retval});	
	}
	else if (m.cmd == 'rename entry'){
		renameEntry(m.entry);
	}
	else if (m.cmd == 'check that table has been populated2'){
		check_table_populated('2');
	}
	else if (m.cmd == 'find new entry'){
		retval = findNewName(m.entry);
		portManagerTest.postMessage({cmd: m.cmd, rv: retval});	
	}
	else if (m.cmd == 'export file'){
		retval = exportFile(m.entry);
		portManagerTest.postMessage({cmd: m.cmd, rv: retval});	
	}
	else if (m.cmd == 'dismiss export warning'){
		dismissExportWarning();
	}
	else if (m.cmd == 'click view'){
		retval = clickView(m.entry);
		portManagerTest.postMessage({cmd: m.cmd, rv: retval});
	}
	else if (m.cmd == 'click raw'){
		retval = clickRaw(m.entry);
		portManagerTest.postMessage({cmd: m.cmd, rv: retval});
	}
	else if (m.cmd == 'click delete'){
		clickDelete(m.entry);
	}
	else if (m.cmd == 'check that table has been populated3'){
		check_table_populated('3');
	}
	else if (m.cmd == 'check that entry is gone'){
		retval = checkThatEntryIsGone(m.entry);
		portManagerTest.postMessage({cmd: m.cmd, rv: retval});
	}
	else if (m.cmd == 'check that table has been populated4'){
		check_table_populated('4');
	}
	else if (m.cmd == 'check if imported'){
		retval = assertEntryImported(m.ct);
		portManagerTest.postMessage({cmd: m.cmd, rv: retval});
	}
	
});


function assertEntryImported(creationTime){
	var rows = managerDocument.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[4].textContent === creationTime){
			//import icon must not be hidden
			if (rows[i].children[0].children[0].hidden){
				console.log('import icon was hidden')
				return false;
			}
			return true;
		}
	}
	console.log('couldnt find', creationTime);
	return false;
}

function check_table_populated(i){
	check_table_populated.count++;
	if (table_populated){
		console.log('sending back', 'check that table has been populated'+i);
		portManagerTest.postMessage({cmd: 'check that table has been populated'+i, rv: true});
		check_table_populated.count = 0;
	}
	else if (check_table_populated.count > 20){
		portManagerTest.postMessage({cmd: 'check that table has been populated'+i, rv: false});
	}
	else {
		setTimeout(function(){check_table_populated(i)}, 100);
	}
}
check_table_populated.count = 0;



function findDirnameInTable(dirname){
	var rows = managerDocument.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[4].textContent === dirname){
			//make sure sweetalert is not available yet
			if (managerDocument.getElementsByClassName('sweet-alert').length !== 0){
				console.log('sweet alert is not supposed to be loaded by now');
				return false;
			}
			rows[i].children[1].children[0].click();
			return true;
		}
	}
	return false;
}


function exportFile(dirname){
	var rows = managerDocument.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[0].textContent === dirname){
			rows[i].children[2].children[0].click();
			return true;
		}
	}
	return false;
}


function dismissExportWarning(){
	dismissExportWarning.count++;
	if (dismissExportWarning.count > 10){
		portManagerTest.postMessage({cmd: 'dismiss export warning', rv: false});
		return;
	}
	var sa = managerDocument.getElementsByClassName('sweet-alert')[0];
	if (sa.getAttribute('class').search('visible') === -1){
		console.log('sweetalert is not yet visible, retrying');
		setTimeout(dismissExportWarning, 100);
		return;
	}
	else if (sa.getElementsByTagName('h2')[0].textContent !== 'You MUST LOG OUT before exporting'){
		console.log('we were expecting an export warning dialog');
		portManagerTest.postMessage({cmd: 'dismiss export warning', rv: false});
		return;
	}
	else {
		managerDocument.getElementsByClassName('sa-button-container')[0].children[1].click();
		portManagerTest.postMessage({cmd: 'dismiss export warning', rv: true});
	}
}
dismissExportWarning.count = 0;


function clickView(entryName){
	var rows = managerDocument.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[0].textContent === entryName){
			rows[i].children[7].children[0].click();
			return true;
		}
	}
	return false;
}


function clickRaw(entryName){
	var rows = managerDocument.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[0].textContent === entryName){
			rows[i].children[7].children[2].click();
			return true;
		}
	}
	return false;	
}


function clickDelete(entryName){
	var rows = managerDocument.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[0].textContent === entryName){
			rows[i].children[3].children[0].click();
			confirmDelete();
			return;
		}
	}
	portManagerTest.postMessage({cmd: 'click delete', rv: false});	
}


function confirmDelete(){
	confirmDelete.count++;
	if (confirmDelete.count > 10){
		portManagerTest.postMessage({cmd: 'click delete', rv: false});
		return;
	}
	
	var sa = managerDocument.getElementsByClassName('sweet-alert')[0];
	if (sa.getAttribute('class').search('visible') === -1){
		console.log('sweetalert is not yet visible, retrying');
		setTimeout(confirmDelete, 100);
		return;
	}
	if (sa.getElementsByTagName('h2')[0].textContent !== 'Removing notarization data'){
		console.log('we were expecting a delete confirmation dialog');
		portManagerTest.postMessage({cmd: 'click delete', rv: false});
		return;
	}
	table_populated = false;
	managerDocument.getElementsByClassName('sa-button-container')[0].children[1].click();
	portManagerTest.postMessage({cmd: 'click delete', rv: true});	
}
confirmDelete.count = 0;


function checkThatEntryIsGone(entryName){
	var rows = managerDocument.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[0].textContent === entryName){
			return false;
		}
	}
	table_populated = false;
	return true;	
}


function renameEntry(newname){
	renameEntry.count++;
	if (renameEntry.count > 10){
		portManagerTest.postMessage({cmd: 'rename entry', rv: false});
		return;
	}
	var sa = managerDocument.getElementsByClassName('sweet-alert')[0];
	if (sa.getAttribute('class').search('visible') === -1){
		console.log('sweetalert is not yet visible, retrying');
		setTimeout(function(){renameEntry(newname)}, 100);
		return;
	}
	if (sa.getElementsByTagName('h2')[0].textContent !== 'Enter a new name for the notarization file'){
		console.log('we were expecting a rename dialog');
		portManagerTest.postMessage({cmd: 'rename entry', rv: false});
		return;
	}
	sa.getElementsByTagName('fieldset')[0].children[0].value = newname;
	table_populated = false; //next test checks if table repopulated
	managerDocument.getElementsByClassName('sa-button-container')[0].children[1].click();
	portManagerTest.postMessage({cmd: 'rename entry', rv: true});
}
renameEntry.count = 0;


function findNewName(newname){
	var rows = managerDocument.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[0].textContent === newname){
			return true;
		}
	}
	console.log('new name has not been found');
	return false;
}
