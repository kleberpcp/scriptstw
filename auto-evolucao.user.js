// ==UserScript==
// @name         Auto Evolução PP (com Auto Farm por População)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Script TribalWars
// @author       edited by phxy
// @include      **screen=main*
// @downloadURL    https://github.com/kleberpcp/scriptstw/raw/refs/heads/master/auto-evolucao.user.js
// @updateURL      https://github.com/kleberpcp/scriptstw/raw/refs/heads/master/auto-evolucao.user.js
// @grant        none
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==
'use strict';

var buildings = [
    ["main_buildrow_main",0],
    ["main_buildrow_barracks",0],
    ["main_buildrow_church_f",0],
    ["main_buildrow_smith",0],
    ["main_buildrow_place",0],
    ["main_buildrow_statue",0],
    ["main_buildrow_market",0],
    ["main_buildrow_wood",0],
    ["main_buildrow_stone",0],
    ["main_buildrow_iron",0],
    ["main_buildrow_farm",0],
    ["main_buildrow_storage",0],
    ["main_buildrow_hide",0],
    ["main_buildrow_wall",0],
    ["main_buildrow_garage",0],
    ["main_buildrow_stable",0],
    ["main_buildrow_snob",0]
];

var autoBuild = [
    ["main_buildrow_wood",1],
    ["main_buildrow_stone",1],
    ["main_buildrow_iron",1],
    ["main_buildrow_wood",2],
    ["main_buildrow_stone",2],
    ["main_buildrow_main",3],
    ["main_buildrow_barracks",2],
    ["main_buildrow_farm",3],
    ["main_buildrow_wood",3],
    ["main_buildrow_stone",3],
    ["main_buildrow_barracks",2],
    ["main_buildrow_storage",3],
    ["main_buildrow_iron",2],
    ["main_buildrow_barracks",3],
    ["main_buildrow_iron",3],
    ["main_buildrow_farm",5],
    ["main_buildrow_market",2],
    ["main_buildrow_main",5],
    ["main_buildrow_statue",1],
    ["main_buildrow_smith",1],
    ["main_buildrow_wood",4],
    ["main_buildrow_stone",4],
    ["main_buildrow_wall",2],
    ["main_buildrow_hide",2],
    ["main_buildrow_wood",5],
    ["main_buildrow_stone",5],
    ["main_buildrow_wood",6],
    ["main_buildrow_iron",4],
    ["main_buildrow_stone",5],
    ["main_buildrow_smith",2],
    ["main_buildrow_wood",8],
    ["main_buildrow_stone",7],
    ["main_buildrow_storage",7],
    ["main_buildrow_stone",8],
    ["main_buildrow_farm",8],
    ["main_buildrow_stone",9],
    ["main_buildrow_iron",7],
    ["main_buildrow_farm",10],
    ["main_buildrow_wood",12],
    ["main_buildrow_stone",10],
    ["main_buildrow_market",5],
    ["main_buildrow_barracks",5],
    ["main_buildrow_iron",10],
    ["main_buildrow_storage",10],
    ["main_buildrow_wood",14],
    ["main_buildrow_stone",12],
    ["main_buildrow_iron",12],
    ["main_buildrow_farm",13],
    ["main_buildrow_storage",13],
    ["main_buildrow_market",10],
    ["main_buildrow_wood",15],
    ["main_buildrow_stone",13],
    ["main_buildrow_iron",13],
    ["main_buildrow_main",10],
    ["main_buildrow_smith",5],
    ["main_buildrow_stable",3],
    ["main_buildrow_wood",16],
    ["main_buildrow_storage",15],
    ["main_buildrow_hide",10],
    ["main_buildrow_wood",18],
    ["main_buildrow_stone",17],
    ["main_buildrow_market",15],
    ["main_buildrow_wood",20],
    ["main_buildrow_farm",15],
    ["main_buildrow_stone",19],
    ["main_buildrow_stone",20],
    ["main_buildrow_market",20],
    ["main_buildrow_farm",16],
    ["main_buildrow_main",15],
    ["main_buildrow_storage",20],
//    ["main_buildrow_farm",17],
    ["main_buildrow_barracks",12],
    ["main_buildrow_stable",8],
//    ["main_buildrow_farm",20],
    ["main_buildrow_wood",21],
    ["main_buildrow_stone",21],
    ["main_buildrow_iron",20],
//    ["main_buildrow_market",17],
    ["main_buildrow_wood",22],
    ["main_buildrow_stone",22],
    ["main_buildrow_barracks",15],
    ["main_buildrow_wood",23],
    ["main_buildrow_stone",23],
    ["main_buildrow_smith",10],
    ["main_buildrow_garage",5],
//    ["main_buildrow_market",20],
//    ["main_buildrow_farm",22],
    ["main_buildrow_wood",24],
    ["main_buildrow_stone",24],
    ["main_buildrow_storage",25],
    ["main_buildrow_main",20],
    ["main_buildrow_smith",15],
    ["main_buildrow_stable",10],
    ["main_buildrow_wood",25],
    ["main_buildrow_stone",25],
    ["main_buildrow_iron",25],
//    ["main_buildrow_farm",23],
    ["main_buildrow_wood",27],
    ["main_buildrow_stone",27],
    ["main_buildrow_iron",26],
    ["main_buildrow_smith",20],
    ["main_buildrow_snob",1],
    ["main_buildrow_storage",30],
    ["main_buildrow_wood",28],
    ["main_buildrow_stone",28],
    ["main_buildrow_iron",27],
    ["main_buildrow_market",22],
    ["main_buildrow_stone",30],
    ["main_buildrow_wood",30],
    ["main_buildrow_iron",30],
    ["main_buildrow_market",25],
    ["main_buildrow_farm",30],
    ["main_buildrow_barracks",25],
    ["main_buildrow_stable",20],
];

console.log("starting");

// LOOP PRINCIPAL
setInterval(function () {

    for (var i = 0; i < buildings.length; i++) {
        var aux = getBuldingLevel(buildings[i][0]);
        if (aux != undefined && !isNaN(aux * 1)) {
            buildings[i][1] = aux * 1;
        }
    }

    // PRIORIDADE: FARM SE POPULAÇÃO ESTIVER ALTA
    if (!autoFarmByPopulation()) {
        autoBuilding();
    }

}, 3000);

// === NOVA FUNÇÃO ===
function autoFarmByPopulation() {
    const popCurrentEl = document.getElementById('pop_current_label');
    const popMaxEl = document.getElementById('pop_max_label');

    if (!popCurrentEl || !popMaxEl) return false;

    const popCurrent = parseInt(popCurrentEl.textContent.replace(/\D/g, ''), 10);
    const popMax = parseInt(popMaxEl.textContent.replace(/\D/g, ''), 10);

    if (!popCurrent || !popMax) return false;
    if ((popCurrent / popMax) < 0.9) return false;

    if ($('[id="buildqueue"]').find('tr').length !== 0) return false;

    console.log("[AutoFarm] População >= 90%, upando Fazenda");
    build("main_buildrow_farm");

    return true;
}

// === AUTO BUILD ORIGINAL ===
function autoBuilding() {
    if ($(location).attr('href').indexOf('screen=main') != -1) {
        var done = false;
        if ($('[id="buildqueue"]').find('tr').length == 0) {
            for (var i = 0; i < autoBuild.length; i++) {
                if (done) break;
                for (var c = 0; c < buildings.length; c++) {
                    if (done) break;
                    if (autoBuild[i][0] == buildings[c][0]) {
                        if (autoBuild[i][1] > buildings[c][1]) {
                            done = true;
                            build(buildings[c][0]);
                        }
                    }
                }
            }
        }
    }
}

function getBuldingLevel(building) {
    return $('[id="' + building + '"]').find('td').eq(0).find('span').text().split(" ")[1];
}

function build(building) {
    var haveWood = $('[id="' + building + '"]').find('td').eq(1).text() * 1 < $('[id="wood"]').text() * 1;
    var haveStone = $('[id="' + building + '"]').find('td').eq(2).text() * 1 < $('[id="stone"]').text() * 1;
    var haveIron = $('[id="' + building + '"]').find('td').eq(3).text() * 1 < $('[id="iron"]').text() * 1;

    if (haveWood && haveStone && haveIron) {
        console.log("building =======> " + building);
        $('[id="' + building + '"]').find('td').eq(6).find('a').eq(1).click();
    }
}

// SPEED UP
setInterval(function () {
    var tr = $('[id="buildqueue"]').find('tr').eq(1);
    if (!tr.length) return;

    var text = tr.find('td').eq(1).find('span').eq(0).text().replace(/\s/g, '');
    var timeSplit = text.split(':');

    if ((timeSplit[0] * 3600 + timeSplit[1] * 60 + timeSplit[2] * 1) < 180) {
        console.log("Speeding building for free");
        tr.find('td').eq(2).find('a').eq(2).click();
    }

    $('[class="btn btn-confirm-yes"]').click();
}, 2000);

// RELOAD
setInterval(function () {
    if ($(location).attr('href').indexOf('screen=main') != -1) {
        location.reload();
    }
}, 1000 * 60 * 30);
