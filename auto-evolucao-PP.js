// ==UserScript==
// @name         Auto Evolução PP 1.4.1
// @namespace    http://tampermonkey.net/
// @version      1.4.1
// @description  Script TribalWars
// @author       edited by phxy
// @include      **screen=main*
// @downloadURL  https://raw.githubusercontent.com/kleberpcp/scriptstw/master/auto-evolucao-PP.js
// @updateURL    https://github.com/kleberpcp/scriptstw/raw/refs/heads/master/auto-evolucao-PP.js
// @grant        none
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==
'use strict';

// =====================================================
// AUTO EVOLUÇÃO / AUTO BUILD
// =====================================================

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

// LOOP PRINCIPAL (build + farm por população)
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

// Auto Farm por População
function autoFarmByPopulation() {
    const popCurrentEl = document.getElementById('pop_current_label');
    const popMaxEl = document.getElementById('pop_max_label');

    if (!popCurrentEl || !popMaxEl) return false;

    const popCurrent = parseInt(popCurrentEl.textContent.replace(/\D/g, ''), 10);
    const popMax = parseInt(popMaxEl.textContent.replace(/\D/g, ''), 10);

    if (!popCurrent || !popMax) return false;
    if ((popCurrent / popMax) < 0.9) return false;

    if ($('#buildqueue').find('tr').length !== 0) return false;

    console.log("[AutoFarm] População >= 90%, upando Fazenda");
    build("main_buildrow_farm");

    return true;
}

// Auto Build
function autoBuilding() {
    if ($(location).attr('href').indexOf('screen=main') != -1) {
        var done = false;
        if ($('#buildqueue').find('tr').length == 0) {
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
    return $('#' + building).find('td').eq(0).find('span').text().split(" ")[1];
}

function build(building) {
    var $row = $('#' + building);
    var haveWood  = $row.find('td').eq(1).text() * 1 < $('#wood').text() * 1;
    var haveStone = $row.find('td').eq(2).text() * 1 < $('#stone').text() * 1;
    var haveIron  = $row.find('td').eq(3).text() * 1 < $('#iron').text() * 1;

    if (haveWood && haveStone && haveIron) {
        console.log("building =======> " + building);
        $row.find('td').eq(6).find('a').eq(1).click();
    }
}

// SPEED UP (grátis < 180s)
setInterval(function () {
    var tr = $('#buildqueue').find('tr').eq(1);
    if (!tr.length) return;

    var text = tr.find('td').eq(1).find('span').eq(0).text().replace(/\s/g, '');
    var timeSplit = text.split(':');

    var secondsLeft = (timeSplit[0] * 3600 + timeSplit[1] * 60 + timeSplit[2] * 1);

    if (secondsLeft < 180) {
        console.log("[SpeedUp] Acelerando construção grátis (< 180s)");
        tr.find('td').eq(2).find('a').eq(2).click();
    }

    $('.btn.btn-confirm-yes').click();
}, 2000);

// RELOAD MAIN (30 min)
setInterval(function () {
    if (location.href.indexOf('screen=main') != -1) {
        location.reload();
    }
}, 1000 * 60 * 30);

// =====================================================
// AUTO RECOMPENSAS (configurável + UI)
// =====================================================

var click_timeout = 2000;

var AUTO_REWARDS_SETTINGS_KEY = 'phx_auto_rewards_settings';

// Carregar configurações (padrão: ON + 0.5 min)
function loadAutoRewardsSettings() {
    var def = { enabled: true, intervalMin: 0.5 };
    try {
        var raw = localStorage.getItem(AUTO_REWARDS_SETTINGS_KEY);
        if (!raw) return def;
        var obj = JSON.parse(raw);

        if (typeof obj.enabled !== 'boolean') obj.enabled = def.enabled;
        if (typeof obj.intervalMin !== 'number' || isNaN(obj.intervalMin) || obj.intervalMin <= 0) {
            obj.intervalMin = def.intervalMin;
        }
        return obj;
    } catch (e) {
        console.log("[AutoRecompensas] Erro ao carregar settings, usando padrão", e);
        return def;
    }
}

function saveAutoRewardsSettings(s) {
    try {
        localStorage.setItem(AUTO_REWARDS_SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {
        console.log("[AutoRecompensas] Erro ao salvar settings", e);
    }
}

var autoRewardsSettings = loadAutoRewardsSettings();
var autoRewardsEnabled  = autoRewardsSettings.enabled;
var clickQuestPeriodicity = autoRewardsSettings.intervalMin * 60 * 1000;

var collecting = false;

// Rotina principal de coleta
function collectRoutine(){
    if (!autoRewardsEnabled) return;

    if ($("#popup_box_quest").filter(".show").length && !collecting) {
        collecting = true;
        console.log("CONA");
        let lenAllQuests = $(".quest-complete-btn").length;
        concludeAllQuests();

        setTimeout(()=>{
            console.log("CONA2");
            $("a.tab-link[data-tab='reward-tab']").click();
            setTimeout(()=>collectAllRewards(), click_timeout * (1 + .4*Math.random()));
        }, (1 + lenAllQuests + .4*Math.random()) * click_timeout);
    }
}

function concludeAllQuests(){
    $(".quest-complete-btn").each((key, el)=>
        setTimeout(()=>el.click(), (key + .4*Math.random()) * click_timeout)
    );
}

function collectAllRewards(){
    let lenCollectAll = $(".reward-system-claim-all-button").length;

    $(".reward-system-claim-all-button").each((key, el)=>
        setTimeout(()=>el.click(), (key + .4*Math.random()) * click_timeout)
    );

    setTimeout(()=>{
        let lenCollectOne = $(".reward-system-claim-button").length;
        if (!lenCollectOne) {
            collecting = false;
            $(".tooltip-delayed").click();
        }
        $(".reward-system-claim-button").each((key, el)=>
            setTimeout(()=> {
                el.click();
                if (key == lenCollectOne - 1) {
                    collecting = false;
                    console.log("CONA4444");
                    setTimeout(()=>$(".tooltip-delayed").click(), click_timeout * (1 + Math.random() * .4));
                }
            }, (key + .4*Math.random()) * click_timeout)
        );
    }, (lenCollectAll + .4*Math.random()) * click_timeout);
}

// Loop de clicar em "nova missão" com período configurável
function clickQuest(timeout){
    setTimeout(()=>{
        if (autoRewardsEnabled) {
            $("#new_quest").click();
        }
        clickQuest(timeout);
    }, clickQuestPeriodicity * (1 + .4*Math.random()));
}

// Inicia a rotina de coleta e o loop de quest
setInterval(collectRoutine, click_timeout);
clickQuest();

// =====================================================
// UI: Painel de Configuração do Auto Recompensas
// =====================================================

function refreshAutoRewardsPanelVisual() {
    var box = document.getElementById('phx-auto-rewards-box');
    if (!box) return;
    box.style.borderColor = autoRewardsEnabled ? 'lime' : '#999';
    box.style.opacity     = autoRewardsEnabled ? '1' : '0.8';
}

function initAutoRewardsSettingsUI() {
    if (document.getElementById('phx-auto-rewards-box')) return;

    var box = document.createElement('div');
    box.id = 'phx-auto-rewards-box';
    box.style.position = 'fixed';
    box.style.top = '120px';
    box.style.right = '10px';
    box.style.zIndex = 99999;
    box.style.background = 'rgba(0,0,0,0.8)';
    box.style.color = '#fff';
    box.style.padding = '8px 10px';
    box.style.border = '1px solid lime';
    box.style.borderRadius = '8px';
    box.style.fontSize = '11px';
    box.style.minWidth = '190px';
    box.style.boxShadow = '0 0 8px rgba(0,0,0,0.8)';

    box.innerHTML = '' +
        '<div style="font-weight:bold;margin-bottom:4px;">Auto Recompensas</div>' +
        '<label style="display:block;margin-bottom:4px;cursor:pointer;">' +
            '<input type="checkbox" id="phx_ar_enabled" style="vertical-align:middle;margin-right:3px;">' +
            '<span style="vertical-align:middle;">Ativar</span>' +
        '</label>' +
        '<label style="display:block;margin-bottom:4px;">' +
            'Intervalo (min): ' +
            '<input type="number" id="phx_ar_interval" step="0.1" min="0.1" style="width:60px;font-size:11px;padding:1px 2px;">' +
        '</label>' +
        '<button id="phx_ar_save" style="margin-top:2px;font-size:11px;padding:2px 6px;cursor:pointer;background:#444;border:1px solid #777;border-radius:4px;color:#fff;">Salvar</button>' +
        '<span id="phx_ar_status" style="margin-left:4px;font-size:10px;color:#0f0;display:none;">Configurações salvas</span>';

    document.body.appendChild(box);

    // Preenche com valores atuais
    var chk = document.getElementById('phx_ar_enabled');
    var inp = document.getElementById('phx_ar_interval');
    chk.checked = autoRewardsSettings.enabled;
    inp.value   = autoRewardsSettings.intervalMin;

    refreshAutoRewardsPanelVisual();

    document.getElementById('phx_ar_save').addEventListener('click', function () {
        var enabled = chk.checked;
        var intervalMin = parseFloat(inp.value.replace(',', '.'));
        if (isNaN(intervalMin) || intervalMin <= 0) {
            intervalMin = 0.5;
            inp.value = intervalMin;
        }

        autoRewardsSettings.enabled = enabled;
        autoRewardsSettings.intervalMin = intervalMin;

        autoRewardsEnabled = enabled;
        clickQuestPeriodicity = intervalMin * 60 * 1000;

        saveAutoRewardsSettings(autoRewardsSettings);
        refreshAutoRewardsPanelVisual();

        var status = document.getElementById('phx_ar_status');
        status.style.display = 'inline';
        status.textContent = 'Configurações salvas';
        setTimeout(function () {
            status.style.display = 'none';
        }, 1500);
    });
}

// Inicializa a UI quando o DOM estiver pronto
if (typeof $ !== 'undefined') {
    $(function () {
        initAutoRewardsSettingsUI();
    });
} else {
    // fallback
    window.addEventListener('load', initAutoRewardsSettingsUI);
}




