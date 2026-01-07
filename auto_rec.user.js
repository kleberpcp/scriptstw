// ==UserScript==
// @name         Auto Recrutamento
// @version      1.0
// @description  Recrutamento automático PHX bot com reservas de recursos + reserva de fazenda e metas de tropas por aldeia + log de tentativas + limite de 2 recrutamentos na fila por unidade
// @author       Phoenix
// @include      https://*.*.*.*&screen=train**
// @include      https://*.*.*.*&screen=stable**
// @include      https://*.*.*.*&screen=barracks**
// @include      https://*.tribalwars.com.br/game.php?screen=train&t=*&village=*
// @downloadURL    https://github.com/kleberpcp/scriptstw/raw/refs/heads/master/auto_rec.user.js
// @updateURL      https://github.com/kleberpcp/scriptstw/raw/refs/heads/master/auto_rec.user.js
// @require      https://code.jquery.com/jquery-2.2.4.min.js
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const url = window.location.href;

    // Redireciona barracks/stable para train
    if (url.includes("&screen=barracks") || url.includes("&screen=stable")) {
        setTimeout(() => {
            const novaUrl = url.replace(/&screen=(barracks|stable)/, "&screen=train");
            window.location.href = novaUrl;
        }, 2000);
        return;
    }

    const villageId = new URLSearchParams(window.location.search).get("village") || '0';

    // ===== Config =====
    let quantidadeRecrutar = 1;
    let tempoLimiteMinutos = 10;

    let reservaMadeira = 0;
    let reservaArgila = 0;
    let reservaFerro = 0;

    // reserva de fazenda (pop livre mínimo)
    let reservaFazenda = 0;

    // metas (recrutar até X) - 0 = desativado
    let metas = {
        spear: 0,
        sword: 0,
        axe: 0,
        spy: 0,
        light: 0,
        heavy: 0,
        ram: 0,
        catapult: 0
    };

    // NOVO: limite de recrutamentos (batches/itens) na fila por unidade
    const LIMITE_FILA_POR_UNIDADE = 2;

    const unitOrder = [
        { key: "spear",    label: "Lança",        icon: "/graphic/unit/unit_spear.png" },
        { key: "sword",    label: "Espada",       icon: "/graphic/unit/unit_sword.png" },
        { key: "axe",      label: "Bárbaro",      icon: "/graphic/unit/unit_axe.png" },
        { key: "spy",      label: "Explorador",   icon: "/graphic/unit/unit_spy.png" },
        { key: "light",    label: "Cav. Leve",    icon: "/graphic/unit/unit_light.png" },
        { key: "heavy",    label: "Cav. Pesada",  icon: "/graphic/unit/unit_heavy.png" },
        { key: "ram",      label: "Ariete",       icon: "/graphic/unit/unit_ram.png" },
        { key: "catapult", label: "Catapulta",    icon: "/graphic/unit/unit_catapult.png" }
    ];

    const populacaoPorUnidade = {
        spear: 1,
        sword: 1,
        axe: 1,
        spy: 2,
        light: 4,
        heavy: 6,
        ram: 5,
        catapult: 8
    };

    // ===== Log (UI) =====
    let lastLog = {
        time: null,
        unitKey: null,
        unitLabel: null,
        action: null, // 'SUCCESS' | 'FAIL' | 'SKIP'
        reason: null,
        details: null
    };

    function nowStr() {
        const d = new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
    }

    function setLog({ unitKey, unitLabel, action, reason, details }) {
        lastLog = {
            time: nowStr(),
            unitKey: unitKey || null,
            unitLabel: unitLabel || null,
            action: action || null,
            reason: reason || null,
            details: details || null
        };
        renderLog();
    }

    function renderLog() {
        const $log = $('#recruitLog');
        if (!$log.length) return;

        const { popAtual, popMax, popDisponivel } = getPopInfo();
        const { madeiraAtual, argilaAtual, ferroAtual } = getResources();

        const head = `
            <div style="font-weight:bold; margin-bottom:6px;">📋 Status</div>
            <div style="font-size:12px; line-height:1.35;">
                <div>🏚️ Aldeia: <b>${villageId}</b></div>
                <div>👥 Pop: <b>${popAtual}</b> / <b>${popMax}</b> (Livre: <b>${popDisponivel}</b>, Reserva: <b>${reservaFazenda}</b>)</div>
                <div>🪵 ${madeiraAtual} | 🧱 ${argilaAtual} | ⛓️ ${ferroAtual}</div>
            </div>
            <div style="height:1px;background:rgba(139,92,47,.35);margin:8px 0;"></div>
        `;

        let body = `<div style="font-weight:bold;">🧪 Última tentativa</div>`;
        if (!lastLog.time) {
            body += `<div style="font-size:12px; opacity:.9; margin-top:4px;">Ainda não houve tentativa.</div>`;
        } else {
            const badge =
                lastLog.action === 'SUCCESS' ? '✅' :
                lastLog.action === 'FAIL'    ? '❌' :
                '⏸️';

            body += `
                <div style="font-size:12px; line-height:1.35; margin-top:4px;">
                    <div>${badge} <b>${lastLog.action}</b> — ${lastLog.time}</div>
                    <div>Unidade: <b>${lastLog.unitLabel || '-'}</b></div>
                    <div>Motivo: <b>${(lastLog.reason || '-')}</b></div>
                    ${lastLog.details ? `<div style="opacity:.9;">${lastLog.details}</div>` : ``}
                </div>
            `;
        }

        $log.html(head + body);
    }

    // ===== Helpers =====
    function parseIntTW(text) {
        if (!text) return 0;
        const n = String(text).replace(/\./g, '').replace(/\s/g, '');
        const v = parseInt(n, 10);
        return isNaN(v) ? 0 : v;
    }

    function getPopInfo() {
        const popAtual = parseIntTW($("#pop_current_label").text());
        const popMax = parseIntTW($("#pop_max_label").text());
        const popDisponivel = Math.max(0, popMax - popAtual);
        return { popAtual, popMax, popDisponivel };
    }

    function getResources() {
        const madeiraAtual = parseIntTW($("#wood").text());
        const argilaAtual = parseIntTW($("#stone").text());
        const ferroAtual = parseIntTW($("#iron").text());
        return { madeiraAtual, argilaAtual, ferroAtual };
    }

    function getUnitRowInput(unitKey) {
        return $(`input[name=${unitKey}]`);
    }

    // tenta ler quantidade atual da unidade na aldeia
    function getCurrentUnitCount(unitKey) {
        const direct = $(`#unit_count_${unitKey}`);
        if (direct.length) return parseIntTW(direct.text());

        const $input = getUnitRowInput(unitKey);
        if (!$input.length) return 0;

        const $row = $input.closest('tr');
        if (!$row.length) return 0;

        const candidates = [];
        candidates.push($row.find('.unit-count').first().text());
        candidates.push($row.find('.units-entry-all').first().text());
        candidates.push($row.find('td').eq(2).text());
        candidates.push($row.find('td').eq(1).text());
        candidates.push($row.find('td').last().text());

        for (const c of candidates) {
            const v = parseIntTW(c);
            if (v > 0) return v;
        }
        return 0;
    }

    // NOVO: conta quantos "itens/batches" na fila existem para aquela unidade
    function getQueuedRecruitmentsCount(unitKey) {
        const $rows = $("#train_queue tr");
        if (!$rows.length) return 0;

        let count = 0;

        $rows.each(function () {
            const $tr = $(this);
            const $img = $tr.find("img").first();
            const src = ($img.attr("src") || "").toLowerCase();
            const cls = (($tr.find(".queue_icon").attr("class") || "") + " " + ($img.attr("class") || "")).toLowerCase();
            const title = (($tr.attr("title") || "") + " " + ($img.attr("title") || "") + " " + ($img.attr("alt") || "")).toLowerCase();

            const hit =
                src.includes(`unit_${unitKey}`) ||
                src.includes(`/${unitKey}.`) ||
                cls.includes(` ${unitKey}`) ||
                title.includes(unitKey);

            if (hit) count += 1;
        });

        // fallback se table não tiver rows
        if (!count) {
            const $icons = $("#train_queue .queue_icon");
            $icons.each(function () {
                const $el = $(this);
                const cls = ($el.attr("class") || "").toLowerCase();
                const $img = $el.find("img");
                const src = ($img.attr("src") || "").toLowerCase();
                const title = (($el.attr("title") || "") + " " + ($img.attr("title") || "") + " " + ($img.attr("alt") || "")).toLowerCase();

                if (cls.includes(unitKey) || src.includes(`unit_${unitKey}`) || title.includes(unitKey)) count += 1;
            });
        }

        return count;
    }

    function getUnitCost(unitKey, qtd) {
        const custoMadeira = parseIntTW($(`#${unitKey}_0_cost_wood`).text()) * qtd;
        const custoArgila = parseIntTW($(`#${unitKey}_0_cost_stone`).text()) * qtd;
        const custoFerro = parseIntTW($(`#${unitKey}_0_cost_iron`).text()) * qtd;
        return { custoMadeira, custoArgila, custoFerro };
    }

    function canRecruit(unitKey, qtd) {
        const { popDisponivel } = getPopInfo();
        const { madeiraAtual, argilaAtual, ferroAtual } = getResources();

        const custoPopTotal = (populacaoPorUnidade[unitKey] || 0) * qtd;
        const { custoMadeira, custoArgila, custoFerro } = getUnitCost(unitKey, qtd);

        const sobraMadeira = madeiraAtual - custoMadeira;
        const sobraArgila = argilaAtual - custoArgila;
        const sobraFerro = ferroAtual - custoFerro;

        const temRecursos =
            sobraMadeira >= reservaMadeira &&
            sobraArgila >= reservaArgila &&
            sobraFerro >= reservaFerro;

        const temFazenda = popDisponivel >= (custoPopTotal + reservaFazenda);

        return {
            ok: temRecursos && temFazenda,
            temRecursos,
            temFazenda,
            custoPopTotal,
            custoMadeira,
            custoArgila,
            custoFerro,
            sobraMadeira,
            sobraArgila,
            sobraFerro
        };
    }

    function fillRecruit(unitKey, qtd) {
        const $input = getUnitRowInput(unitKey);
        if (!$input.length) return { ok: false, reason: 'input_inexistente' };

        const maxAttr = parseInt($input.attr('max'), 10);
        if (!isNaN(maxAttr) && maxAttr > 0) {
            qtd = Math.min(qtd, maxAttr);
        }
        if (qtd <= 0) return { ok: false, reason: 'qtd_zero' };

        $input.val(qtd).trigger('blur');
        return { ok: true, qtdFinal: qtd };
    }

    // ===== Core =====
    function tentativaDeRecrutamento() {
        if (!/screen=train/.test(window.location.href)) return;

        // regra original: só tenta se a fila total estiver pequena
        const filaTotal = $("table#train_queue .queue_icon").length;
        if (filaTotal > 1) {
            setLog({
                action: 'SKIP',
                reason: 'fila_cheia',
                details: `Fila total (${filaTotal}) > 1.`
            });
            return;
        }

        // tenta recrutar 1 tipo por ciclo, seguindo a ordem
        for (const u of unitOrder) {
            const unitKey = u.key;
            const target = parseInt(metas[unitKey] || 0, 10);

            if (!target || target <= 0) {
                // não loga aqui pra não "poluir" a última tentativa
                continue;
            }

            // limite por unidade: 2 itens na fila por unidade
            const itensNaFilaDessaUnidade = getQueuedRecruitmentsCount(unitKey);
            if (itensNaFilaDessaUnidade >= LIMITE_FILA_POR_UNIDADE) {
                setLog({
                    unitKey,
                    unitLabel: u.label,
                    action: 'FAIL',
                    reason: 'limite_fila_unidade',
                    details: `Já existem ${itensNaFilaDessaUnidade} recrutamentos na fila (limite: ${LIMITE_FILA_POR_UNIDADE}).`
                });
                continue;
            }

            const atual = getCurrentUnitCount(unitKey);
            // Para meta, consideramos "atual + itens na fila" (não quantidade exata, mas impede spam)
            const totalEstimado = atual + itensNaFilaDessaUnidade;

            if (totalEstimado >= target) {
                setLog({
                    unitKey,
                    unitLabel: u.label,
                    action: 'FAIL',
                    reason: 'meta_atingida',
                    details: `Atual ${atual} + fila ${itensNaFilaDessaUnidade} ≥ meta ${target}.`
                });
                continue;
            }

            const falta = target - totalEstimado;
            let qtd = Math.max(1, Math.min(quantidadeRecrutar, falta));

            const check = canRecruit(unitKey, qtd);
            if (!check.ok) {
                const { popDisponivel } = getPopInfo();
                const { madeiraAtual, argilaAtual, ferroAtual } = getResources();

                let reason = 'desconhecido';
                if (!check.temRecursos && !check.temFazenda) reason = 'recursos_e_pop';
                else if (!check.temRecursos) reason = 'recursos';
                else if (!check.temFazenda) reason = 'pop';

                setLog({
                    unitKey,
                    unitLabel: u.label,
                    action: 'FAIL',
                    reason: reason === 'pop' ? 'pop_insuficiente' : reason === 'recursos' ? 'recursos_insuficientes' : 'recursos_e_pop_insuficientes',
                    details:
                        `Tentou recrutar ${qtd}. ` +
                        `Rec: (${madeiraAtual}/${argilaAtual}/${ferroAtual}) custo (${check.custoMadeira}/${check.custoArgila}/${check.custoFerro}) ` +
                        `reservas (${reservaMadeira}/${reservaArgila}/${reservaFerro}). ` +
                        `Pop livre ${popDisponivel}, custo pop ${check.custoPopTotal}, reserva fazenda ${reservaFazenda}.`
                });
                continue;
            }

            const filled = fillRecruit(unitKey, qtd);
            if (!filled.ok) {
                setLog({
                    unitKey,
                    unitLabel: u.label,
                    action: 'FAIL',
                    reason: 'nao_conseguiu_preencher',
                    details: `Falha ao preencher input (${filled.reason}).`
                });
                continue;
            }

            // clique pra recrutar
            $(".btn-recruit").click();

            setLog({
                unitKey,
                unitLabel: u.label,
                action: 'SUCCESS',
                reason: 'recrutado',
                details: `Recrutou ${filled.qtdFinal}. Meta ${target}. Atual ${atual}. Fila(unid) ${itensNaFilaDessaUnidade}/${LIMITE_FILA_POR_UNIDADE}.`
            });

            break;
        }
    }

    // ===== Storage =====
    function carregarConfiguracoes() {
        const confStr = localStorage.getItem(`configuracoesRecrutamento_${villageId}`);
        if (!confStr) return;

        try {
            const c = JSON.parse(confStr);

            quantidadeRecrutar = parseInt(c.quantidadeRecrutar || 1, 10);
            tempoLimiteMinutos = parseInt(c.tempoLimiteMinutos || 10, 10);

            reservaMadeira = parseInt(c.reservaMadeira || 0, 10);
            reservaArgila = parseInt(c.reservaArgila || 0, 10);
            reservaFerro = parseInt(c.reservaFerro || 0, 10);

            reservaFazenda = parseInt(c.reservaFazenda || 0, 10);

            metas = Object.assign(metas, c.metas || {});

            // UI sync
            $('#quantidadeRecrutar').val(quantidadeRecrutar);
            $('#tempoReloadMin').val(tempoLimiteMinutos);
            $('#reservaMadeira').val(reservaMadeira);
            $('#reservaArgila').val(reservaArgila);
            $('#reservaFerro').val(reservaFerro);
            $('#reservaFazenda').val(reservaFazenda);

            for (const u of unitOrder) {
                $(`#meta_${u.key}`).val(parseInt(metas[u.key] || 0, 10));
            }
        } catch (e) {
            console.warn('Erro ao carregar configurações:', e);
        }
    }

    function salvarConfiguracoes() {
        quantidadeRecrutar = parseInt($('#quantidadeRecrutar').val(), 10) || 1;
        tempoLimiteMinutos = parseInt($('#tempoReloadMin').val(), 10) || 10;

        reservaMadeira = parseInt($('#reservaMadeira').val(), 10) || 0;
        reservaArgila = parseInt($('#reservaArgila').val(), 10) || 0;
        reservaFerro = parseInt($('#reservaFerro').val(), 10) || 0;

        reservaFazenda = parseInt($('#reservaFazenda').val(), 10) || 0;

        for (const u of unitOrder) {
            metas[u.key] = parseInt($(`#meta_${u.key}`).val(), 10) || 0;
        }

        const conf = {
            quantidadeRecrutar,
            tempoLimiteMinutos,
            reservaMadeira,
            reservaArgila,
            reservaFerro,
            reservaFazenda,
            metas
        };

        localStorage.setItem(`configuracoesRecrutamento_${villageId}`, JSON.stringify(conf));

        showSaved();
        restartReloadTimer();
        renderLog();
    }

    // ===== UI =====
    $('body').append(`
        <style>
            #recruitToggle {
                position: fixed;
                top: 20px;
                left: 10px;
                background: #dec196;
                border: 2px solid #8b5c2f;
                padding: 4px 10px;
                border-radius: 5px;
                z-index: 10000;
                cursor: pointer;
                font-weight: bold;
                color: #3b1f0e;
                font-family: Verdana, sans-serif;
                box-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                user-select: none;
            }
            #recruitSettings {
                position: fixed;
                top: 60px;
                left: 10px;
                background: rgba(242, 230, 198, 0.95);
                padding: 15px 16px;
                border: 2px solid #8b5c2f;
                z-index: 9999;
                box-shadow: 3px 3px 6px rgba(0,0,0,0.3);
                border-radius: 10px;
                font-family: Verdana, sans-serif;
                color: #3b1f0e;
                font-size: 13px;
                cursor: move;
                width: 285px;
            }
            #recruitSettings h3 {
                margin: 0 0 10px 0;
                font-size: 14px;
            }
            .unit-option {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                margin-bottom: 6px;
            }
            .unit-left {
                display: flex;
                align-items: center;
                gap: 6px;
                min-width: 0;
            }
            .unit-left img {
                width: 18px;
                height: 18px;
            }
            .unit-left span {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .unit-option input[type="number"] {
                width: 95px;
                padding: 2px 4px;
            }
            .row {
                margin: 10px 0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
            }
            .row input[type="number"] {
                width: 95px;
                padding: 2px 4px;
            }
            #saveSettings {
                background: #dec196;
                border: 1px solid #8b5c2f;
                padding: 6px 10px;
                cursor: pointer;
                border-radius: 6px;
                margin-top: 10px;
                width: 100%;
                font-weight: bold;
            }
            #savedToast {
                margin-top: 8px;
                color: #0a7a20;
                font-weight: bold;
                display: none;
            }
            .divider {
                height: 1px;
                background: rgba(139, 92, 47, 0.35);
                margin: 10px 0;
            }
            .hint {
                font-size: 11px;
                opacity: 0.85;
                margin-top: 4px;
            }
            #recruitLog {
                margin-top: 10px;
                padding: 10px;
                border: 1px dashed rgba(139, 92, 47, .7);
                border-radius: 8px;
                background: rgba(255,255,255,.35);
            }
        </style>

        <div id="recruitToggle">⚙️ Recrutamento</div>

        <div id="recruitSettings">
            <h3>⚔️ Metas de tropas (recrutar até)</h3>

            <div id="unitTargets"></div>

            <div class="divider"></div>

            <div class="row">
                <label>Quantidade por ciclo:</label>
                <input type="number" id="quantidadeRecrutar" value="1" min="1">
            </div>

            <div class="row">
                <label>Recarregar a cada (min):</label>
                <input type="number" id="tempoReloadMin" value="10" min="1">
            </div>

            <div class="divider"></div>

            <div style="margin: 6px 0; font-weight: bold;">Reserva de Recursos</div>
            <div class="unit-option">
                <div class="unit-left"><img src="https://dsbr.innogamescdn.com/asset/75cb846c/graphic/holz.webp" title="Madeira"><span>Madeira</span></div>
                <input type="number" id="reservaMadeira" value="0" min="0">
            </div>
            <div class="unit-option">
                <div class="unit-left"><img src="https://dsbr.innogamescdn.com/asset/75cb846c/graphic/lehm.webp" title="Argila"><span>Argila</span></div>
                <input type="number" id="reservaArgila" value="0" min="0">
            </div>
            <div class="unit-option">
                <div class="unit-left"><img src="https://dsbr.innogamescdn.com/asset/75cb846c/graphic/eisen.webp" title="Ferro"><span>Ferro</span></div>
                <input type="number" id="reservaFerro" value="0" min="0">
            </div>

            <div class="divider"></div>

            <div style="margin: 6px 0; font-weight: bold;">Reserva de Fazenda (pop livre)</div>
            <div class="row">
                <label>Manter livre:</label>
                <input type="number" id="reservaFazenda" value="0" min="0">
            </div>
            <div class="hint">Ex.: 200 = o script só recruta se ainda sobrarem 200 de pop livre.</div>

            <div class="divider"></div>
            <div class="hint">Limite: <b>${LIMITE_FILA_POR_UNIDADE}</b> recrutamentos na fila por unidade.</div>

            <button id="saveSettings">💾 Salvar Configurações</button>
            <div id="savedToast">Configurações salvas!</div>

            <div id="recruitLog"></div>
        </div>
    `);

    // monta inputs de metas
    function renderTargets() {
        const $wrap = $('#unitTargets');
        $wrap.empty();

        for (const u of unitOrder) {
            $wrap.append(`
                <div class="unit-option">
                    <div class="unit-left">
                        <img src="${u.icon}">
                        <span>${u.label}</span>
                    </div>
                    <input type="number" id="meta_${u.key}" value="0" min="0" placeholder="Meta">
                </div>
            `);
        }
        $wrap.append(`<div class="hint">Meta 0 = desativado para a unidade.</div>`);
    }

    function showSaved() {
        $('#savedToast').stop(true, true).fadeIn(150);
        setTimeout(() => $('#savedToast').fadeOut(300), 1500);
    }

    // ===== Timers =====
    let reloadInterval = null;

    function restartReloadTimer() {
        if (reloadInterval) clearInterval(reloadInterval);
        reloadInterval = setInterval(() => location.reload(), (tempoLimiteMinutos * 60 * 1000));
    }

    // ===== Events =====
    $('#saveSettings').on('click', function () {
        salvarConfiguracoes();
    });

    $('#recruitToggle').on('click', function () {
        $('#recruitSettings').toggle();
    });

    // Drag
    let isDragging = false, offsetX = 0, offsetY = 0;

    $('#recruitSettings').on('mousedown', function (e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'LABEL') return;
        isDragging = true;
        offsetX = e.clientX - $(this).offset().left;
        offsetY = e.clientY - $(this).offset().top;
    });

    $(document).on('mousemove', function (e) {
        if (!isDragging) return;
        $('#recruitSettings').css({
            left: e.clientX - offsetX,
            top: e.clientY - offsetY
        });
    }).on('mouseup', function () {
        isDragging = false;
    });

    // ===== Init =====
    $(document).ready(function () {
        renderTargets();
        carregarConfiguracoes();
        renderLog();

        setInterval(tentativaDeRecrutamento, 5000);
        // atualiza o painel de status periodicamente (pop/recursos mudam)
        setInterval(renderLog, 4000);

        restartReloadTimer();

        setLog({
            action: 'SKIP',
            reason: 'inicializado',
            details: 'Script iniciado e aguardando ciclo de recrutamento.'
        });
    });

})();
