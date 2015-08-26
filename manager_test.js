//This is a content script used only in testing 

function check_table_populated(){
	var retval = document.getElementById('table_populated').textContent;
	if (retval === 'true'){
		return true;
	}
	else {
		return false;
	}
}



function wait_for_repopulate(){
	if (document.getElementById('table_populated').textContent === 'false'){
		console.log('the table hasnt yet repopulated, returning false');
		return false;
	}
	else {
		return true;
	}
}

function findDirnameInTable(dirname){
	var rows = document.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[4].textContent === dirname){
			//make sure sweetalert is not available yet
			if (document.getElementsByClassName('sweet-alert').length !== 0){
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
	var rows = document.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[0].textContent === dirname){
			rows[i].children[2].children[0].click();
			return true;
		}
	}
	return false;
}


function dismissExportWarning(){
	var sa = document.getElementsByClassName('sweet-alert')[0];
	if (sa.getAttribute('class').search('visible') === -1){
		console.log('sweetalert is not yet visible, retrying');
		return false;
	}
	if (sa.getElementsByTagName('h2')[0].textContent !== 'You MUST LOG OUT before exporting'){
		console.log('we were expecting an export warning dialog');
		return false;
	}
	document.getElementsByClassName('sa-button-container')[0].children[1].click();
	return true;
}


function clickView(entryName){
	var rows = document.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[0].textContent === entryName){
			rows[i].children[8].children[0].click();
			return true;
		}
	}
	return false;
}


function clickRaw(entryName){
	var rows = document.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[0].textContent === entryName){
			rows[i].children[8].children[2].click();
			return true;
		}
	}
	return false;	
}


function clickDelete(entryName){
	var rows = document.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[0].textContent === entryName){
			rows[i].children[3].children[0].click();
			return true;
		}
	}
	return false;	
}


function confirmDelete(){
	var sa = document.getElementsByClassName('sweet-alert')[0];
	if (sa.getAttribute('class').search('visible') === -1){
		console.log('sweetalert is not yet visible, retrying');
		return false;
	}
	if (sa.getElementsByTagName('h2')[0].textContent !== 'Removing notarization data'){
		console.log('we were expecting a delete confirmation dialog');
		return false;
	}
	document.getElementById('table_populated').textContent = 'false';
	document.getElementsByClassName('sa-button-container')[0].children[1].click();
	return true;	
}


function checkThatEntryIsGone(entryName){
	var rows = document.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[0].textContent === entryName){
			return false;
		}
	}
	return true;	
}


function renameEntry(newname){
	var sa = document.getElementsByClassName('sweet-alert')[0];
	if (sa.getAttribute('class').search('visible') === -1){
		console.log('sweetalert is not yet visible, retrying');
		return false;
	}
	if (sa.getElementsByTagName('h2')[0].textContent !== 'Enter a new name for the notarization file'){
		console.log('we were expecting a rename dialog');
		return false;
	}
	sa.getElementsByTagName('fieldset')[0].children[0].value = newname;
	document.getElementById('table_populated').textContent = 'false';
	document.getElementsByClassName('sa-button-container')[0].children[1].click();
	return true;
}


function findNewName(newname){
	if (document.getElementById('table_populated').textContent !== 'true'){
		console.log('table has not yet repopulated, retrying');
		return false;
	}
	var rows = document.getElementById('myTableBody').children;
	for (var i=0; i<rows.length; i++){
		if (rows[i].children[0].textContent === newname){
			return true;
		}
	}
	console.log('new name has not been found');
	return false;
}
