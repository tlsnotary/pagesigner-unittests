//This is a content script used only in testing 

function assertEntryImported(dirname){
	var rows = managerDocument.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[4].textContent === dirname){
			if (rows[i].children[5].textContent !== 'imported'){
				return false;
			}
			return true;
		}
	}
	return false;
}

function check_table_populated(){
	if (typeof(managerDocument) === 'undefined'){
		//This happened sometimes on Windows, a very weird error 
		//TODO: find out what causes this
		console.log('document undefined in check_table_populated');
		return false;
	}
	var tp = managerDocument.getElementById('table_populated');
	if (tp === null){
		return false;
	}
	
	if (tp.textContent === 'true'){
		return true;
	}
	else {
		return false;
	}
}


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
	var sa = managerDocument.getElementsByClassName('sweet-alert')[0];
	if (sa.getAttribute('class').search('visible') === -1){
		console.log('sweetalert is not yet visible, retrying');
		return false;
	}
	if (sa.getElementsByTagName('h2')[0].textContent !== 'You MUST LOG OUT before exporting'){
		console.log('we were expecting an export warning dialog');
		return false;
	}
	managerDocument.getElementsByClassName('sa-button-container')[0].children[1].click();
	return true;
}


function clickView(entryName){
	var rows = managerDocument.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[0].textContent === entryName){
			rows[i].children[8].children[0].click();
			return true;
		}
	}
	return false;
}


function clickRaw(entryName){
	var rows = managerDocument.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[0].textContent === entryName){
			rows[i].children[8].children[2].click();
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
			return true;
		}
	}
	return false;	
}


function confirmDelete(){
	var sa = managerDocument.getElementsByClassName('sweet-alert')[0];
	if (sa.getAttribute('class').search('visible') === -1){
		console.log('sweetalert is not yet visible, retrying');
		return false;
	}
	if (sa.getElementsByTagName('h2')[0].textContent !== 'Removing notarization data'){
		console.log('we were expecting a delete confirmation dialog');
		return false;
	}
	managerDocument.getElementById('table_populated').textContent = 'false';
	managerDocument.getElementsByClassName('sa-button-container')[0].children[1].click();
	return true;	
}


function checkThatEntryIsGone(entryName){
	var rows = managerDocument.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[0].textContent === entryName){
			return false;
		}
	}
	return true;	
}


function renameEntry(newname){
	var sa = managerDocument.getElementsByClassName('sweet-alert')[0];
	if (sa.getAttribute('class').search('visible') === -1){
		console.log('sweetalert is not yet visible, retrying');
		return false;
	}
	if (sa.getElementsByTagName('h2')[0].textContent !== 'Enter a new name for the notarization file'){
		console.log('we were expecting a rename dialog');
		return false;
	}
	sa.getElementsByTagName('fieldset')[0].children[0].value = newname;
	managerDocument.getElementById('table_populated').textContent = 'false';
	managerDocument.getElementsByClassName('sa-button-container')[0].children[1].click();
	return true;
}


function findNewName(newname){
	if (managerDocument.getElementById('table_populated').textContent !== 'true'){
		console.log('table has not yet repopulated, retrying');
		return false;
	}
	var rows = managerDocument.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[0].textContent === newname){
			return true;
		}
	}
	console.log('new name has not been found');
	return false;
}
