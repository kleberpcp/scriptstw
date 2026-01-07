// ==UserScript==
// @name         Auto Recrutamento
// @version      0.9.4
// @description  Recrutamento automático PHX bot com reservas + reserva de fazenda e metas por aldeia + limite TOTAL de fila 2 + limite 2 por unidade + UI compacta recolher/expandir
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

  // ======= AJUSTES PRINCIPAIS =======
  const LIMITE_FILA_TOTAL = 2;     // você pediu: só 2 na fila total
  const LOOP_MS = 4000;            // tentativa a cada 4s (seguro)
  // ==================================

  const villageId = new URLSearchParams(location.search).get('village') || '0';

  const unitOrder = [
    { key: "spear",    label: "Lança",        icon: "/graphic/unit/unit_spear.png" },
    { key: "sword",    label: "Espada",       icon: "/graphic/unit/unit_sword.png" },
    { key: "axe",      label: "Bárbaro",      icon: "/graphic/unit/unit_axe.png" },
    { key: "spy",      label: "Explorador",   icon: "/graphic/unit/unit_spy.png" },
    { key: "light",    label: "Cav. Leve",    icon: "/graphic/unit/unit_light.png" },
    { key: "heavy",    label: "Cav. Pesada",  icon: "/graphic/unit/unit_heavy.png" },
    { key: "ram",      label: "Ariete",       icon: "/graphic/unit/unit_ram.png" },
    { key: "catapult", label: "Catapulta",    icon: "/graphic/unit/unit_catapult.png" },
  ];

  const popPerUnit = {
    spear: 1, sword: 1, axe: 1, spy: 2, light: 4, heavy: 6, ram: 5, catapult: 8
  };

  // ======= CONFIG (por aldeia) =======
  let quantidadePorCiclo = 1;   // "Qtd por ciclo" (máximo por unidade que ele tenta colocar)
  let tempoReloadMin = 10;

  let reservaMadeira = 0;
  let reservaArgila = 0;
  let reservaFerro = 0;
  let reservaFazenda = 0;

  let metas = {
    spear: 0, sword: 0, axe: 0, spy: 0, light: 0, heavy: 0, ram: 0, catapult: 0
  };

  let lastSuccess = null; // {time, text}
  let reloadInterval = null;

  // ======= HELPERS =======
  function nowStr() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  }

  function parseIntTW(t) {
    return parseInt(String(t || "0").replace(/\./g, '').replace(/\s/g, ''), 10) || 0;
  }

  function getResources() {
    return {
      wood:  parseIntTW($("#wood").text()),
      stone: parseIntTW($("#stone").text()),
      iron:  parseIntTW($("#iron").text()),
    };
  }

  function getPopInfo() {
    const cur = parseIntTW($("#pop_current_label").text());
    const max = parseIntTW($("#pop_max_label").text());
    return { cur, max, free: Math.max(0, max - cur) };
  }

  function getUnitInput(unitKey) {
    return $(`input[name="${unitKey}"]`);
  }

  function getUnitCost(unitKey) {
    // custo mostrado na tabela do TW
    const w = parseIntTW($(`#${unitKey}_0_cost_wood`).text());
    const s = parseIntTW($(`#${unitKey}_0_cost_stone`).text());
    const i = parseIntTW($(`#${unitKey}_0_cost_iron`).text());
    // se a unidade não existir nessa tela, valores podem virar 0
    return { wood: w, stone: s, iron: i };
  }

  // quantidade atual (na aldeia) tentativa robusta
  function getCurrentUnitCount(unitKey) {
    const direct = $(`#unit_count_${unitKey}`);
    if (direct.length) return parseIntTW(direct.text());

    const $input = getUnitInput(unitKey);
    if (!$input.length) return 0;

    const $row = $input.closest('tr');
    if (!$row.length) return 0;

    // tenta achar algo tipo "2/31" na coluna "Na aldeia/total"
    const textRow = $row.text();
    const m = textRow.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) return parseInt(m[1], 10) || 0;

    return 0;
  }

  // ========= FILA (AQUI É O PONTO CRÍTICO) =========
  // Vamos achar as linhas de fila pelo botão/link "Cancelar" e pegar o <tr> pai.
  function getQueueRows() {
    // pega elementos de cancelar mais prováveis
    const $cancels = $(`a, button, input[type="submit"], input[type="button"]`).filter(function () {
      const t = ($(this).text() || $(this).val() || '').trim().toLowerCase();
      return t === 'cancelar';
    });

    const rows = [];
    $cancels.each(function () {
      const $tr = $(this).closest('tr');
      if ($tr.length) rows.push($tr.get(0));
    });

    // dedup
    const unique = [...new Set(rows)];
    return $(unique);
  }

  function getQueueTotalCount() {
    const $rows = getQueueRows();
    return $rows.length || 0;
  }

  function getQueuedCountByUnit(unitKey) {
    const $rows = getQueueRows();
    if (!$rows.length) return 0;

    let count = 0;
    $rows.each(function () {
      const $tr = $(this);

      // tenta achar um ícone de unidade na linha
      const $img = $tr.find('img').first();
      const src = ($img.attr('src') || '').toLowerCase();
      const alt = ($img.attr('alt') || '').toLowerCase();
      const title = ($img.attr('title') || '').toLowerCase();
      const txt = $tr.text().toLowerCase();

      // heurísticas: unit_key aparece no src, ou texto/alt/title
      const hit =
        src.includes(`unit_${unitKey}`) ||
        src.includes(`/${unitKey}.`) ||
        alt.includes(unitKey) ||
        title.includes(unitKey) ||
        txt.includes(unitKey);

      if (hit) count++;
    });

    return count;
  }
  // ================================================

  function clearAllInputs() {
    for (const u of unitOrder) {
      const $in = getUnitInput(u.key);
      if ($in.length) $in.val('').trigger('input').trigger('change');
    }
  }

  function submitRecruitForm() {
    const $form = $('#train_form, form[name="train_form"], form[action*="train"]').first();
    if (!$form.length) return false;

    // botão de recrutar dentro do form
    let $btn = $form.find('button, input[type="submit"], input[type="button"], a').filter(function () {
      const t = ($(this).text() || $(this).val() || '').trim().toLowerCase();
      return t === 'recrutar';
    }).first();

    if ($btn.length) {
      $btn.trigger('mousedown').trigger('mouseup').trigger('click');
      return true;
    }

    // fallback submit nativo
    const formEl = $form.get(0);
    if (!formEl) return false;

    if (typeof formEl.requestSubmit === 'function') {
      formEl.requestSubmit();
      return true;
    }
    try { formEl.submit(); return true; } catch (e) { return false; }
  }

  // Checa se dá pra adicionar "qtd" daquela unidade respeitando reservas e pop
  function canAddUnit(unitKey, qtd, budget) {
    if (qtd <= 0) return false;

    const cost = getUnitCost(unitKey);
    // unidade não disponível/visível -> custo pode ser 0; se input existe, custo deve existir
    // se custo for 0 e não for spear (ou custos realmente 0), evitamos recrutar errado
    if ((cost.wood + cost.stone + cost.iron) === 0) return false;

    const popNeed = (popPerUnit[unitKey] || 0) * qtd;

    // budget tem recursos disponíveis já descontando reserva
    if (budget.wood < cost.wood * qtd) return false;
    if (budget.stone < cost.stone * qtd) return false;
    if (budget.iron < cost.iron * qtd) return false;
    if (budget.pop < popNeed) return false;

    return true;
  }

  function applyUnit(unitKey, qtd) {
    const $in = getUnitInput(unitKey);
    if (!$in.length) return 0;

    // respeita max do TW (se existir)
    const maxAttr = parseInt($in.attr('max'), 10);
    if (!isNaN(maxAttr) && maxAttr > 0) qtd = Math.min(qtd, maxAttr);
    if (qtd <= 0) return 0;

    $in.val(qtd).trigger('input').trigger('change').trigger('blur');
    return qtd;
  }

  // ======= CORE: PLANEJA PREENCHER ATÉ COMPLETAR 2 NA FILA EM UM ÚNICO SUBMIT =======
  function tentativaDeRecrutamento() {
    if (!/screen=train/.test(location.href)) return;

    const filaAtual = getQueueTotalCount();
    if (filaAtual >= LIMITE_FILA_TOTAL) return;

    const slotsLivresNaFila = LIMITE_FILA_TOTAL - filaAtual;
    if (slotsLivresNaFila <= 0) return;

    // orçamento de recursos/pop respeitando reservas
    const res = getResources();
    const pop = getPopInfo();

    // recursos disponíveis = atual - reserva
    const budget = {
      wood: Math.max(0, res.wood - reservaMadeira),
      stone: Math.max(0, res.stone - reservaArgila),
      iron: Math.max(0, res.iron - reservaFerro),
      // pop disponível = pop livre - reservaFazenda
      pop: Math.max(0, pop.free - reservaFazenda)
    };

    // limpa inputs antes de planejar (evita resíduos de tentativas)
    clearAllInputs();

    let slotsRestantes = slotsLivresNaFila;
    let algoPreenchido = false;
    const filledDesc = [];

    for (const u of unitOrder) {
      if (slotsRestantes <= 0) break;

      const target = parseInt(metas[u.key] || 0, 10);
      if (!target || target <= 0) continue;

      const $in = getUnitInput(u.key);
      if (!$in.length) continue;

      const atual = getCurrentUnitCount(u.key);
      const naFilaUnid = getQueuedCountByUnit(u.key);
      const totalEstimado = atual + naFilaUnid;

      if (totalEstimado >= target) continue;

      const faltaParaMeta = target - totalEstimado;

      // quanto vamos tentar colocar desta unidade
      // - não passar do que falta pra meta
      // - não passar dos slots restantes na fila total
      // - não passar de quantidadePorCiclo (pra não encher demais por unidade)
      let qtd = Math.min(faltaParaMeta, slotsRestantes, Math.max(1, quantidadePorCiclo));

      // tenta reduzir qtd até caber em recursos/pop
      while (qtd > 0 && !canAddUnit(u.key, qtd, budget)) qtd--;

      if (qtd <= 0) continue;

      // aplica no input
      const applied = applyUnit(u.key, qtd);
      if (applied <= 0) continue;

      // desconta do orçamento
      const cost = getUnitCost(u.key);
      budget.wood -= cost.wood * applied;
      budget.stone -= cost.stone * applied;
      budget.iron -= cost.iron * applied;
      budget.pop -= (popPerUnit[u.key] || 0) * applied;

      slotsRestantes -= applied;
      algoPreenchido = true;
      filledDesc.push(`${u.label} x${applied}`);

      // continua no próximo tipo (para completar slots, se ainda tiver)
    }

    if (!algoPreenchido) return;

    // SUBMIT ÚNICO (isso é o que garante preencher 2 de uma vez)
    const ok = submitRecruitForm();
    if (ok) {
      lastSuccess = { time: nowStr(), text: filledDesc.join(' + ') };
      renderStatus();
    }
  }

  // ======= UI =======
  function renderStatus() {
    const $box = $('#recruitStatusBox');
    if (!$box.length) return;

    const pop = getPopInfo();
    const res = getResources();
    const fila = getQueueTotalCount();

    let html = `
      <div style="font-weight:bold; margin-bottom:6px;">📌 Status</div>
      <div style="font-size:12px; line-height:1.35;">
        <div>🏚️ <b>${villageId}</b></div>
        <div>👥 <b>${pop.cur}</b>/<b>${pop.max}</b> (Livre: <b>${pop.free}</b>, Res.: <b>${reservaFazenda}</b>)</div>
        <div>🪵 ${res.wood} | 🧱 ${res.stone} | ⛓️ ${res.iron}</div>
        <div>⏳ Fila: <b>${fila}</b> / <b>${LIMITE_FILA_TOTAL}</b></div>
      </div>
    `;

    if (lastSuccess) {
      html += `
        <div style="height:1px;background:rgba(139,92,47,.35);margin:8px 0;"></div>
        <div style="font-weight:bold;">✅ Último</div>
        <div style="font-size:12px; line-height:1.35; margin-top:4px;">
          <div><b>${lastSuccess.text}</b></div>
          <div>${lastSuccess.time}</div>
        </div>
      `;
    }

    $box.html(html);
  }

  function showSaved() {
    $('#savedToast').stop(true, true).fadeIn(120);
    setTimeout(() => $('#savedToast').fadeOut(250), 1200);
  }

  function setCollapsed(collapsed, persist = true) {
    const $panel = $('#recruitPanel');
    const $chev = $('#recruitChev');
    if (collapsed) { $panel.addClass('collapsed'); $chev.text('▸'); }
    else { $panel.removeClass('collapsed'); $chev.text('▾'); }
    if (persist) localStorage.setItem(`recruit_ui_collapsed_${villageId}`, collapsed ? '1' : '0');
  }

  function restartReloadTimer() {
    if (reloadInterval) clearInterval(reloadInterval);
    reloadInterval = setInterval(() => location.reload(), (tempoReloadMin * 60 * 1000));
  }

  function renderTargets() {
    const $wrap = $('#unitTargets');
    $wrap.empty();
    for (const u of unitOrder) {
      $wrap.append(`
        <div class="unit-option">
          <img src="${u.icon}">
          <span>${u.label}</span>
          <input type="number" id="meta_${u.key}" value="0" min="0" placeholder="Meta">
        </div>
      `);
    }
    $wrap.append(`<div class="hint">Meta 0 desativa a unidade.</div>`);
  }

  function salvarConfiguracoes() {
    quantidadePorCiclo = parseInt($('#quantidadeRecrutar').val(), 10) || 1;
    tempoReloadMin = parseInt($('#tempoReloadMin').val(), 10) || 10;

    reservaMadeira = parseInt($('#reservaMadeira').val(), 10) || 0;
    reservaArgila = parseInt($('#reservaArgila').val(), 10) || 0;
    reservaFerro = parseInt($('#reservaFerro').val(), 10) || 0;

    reservaFazenda = parseInt($('#reservaFazenda').val(), 10) || 0;

    for (const u of unitOrder) {
      metas[u.key] = parseInt($(`#meta_${u.key}`).val(), 10) || 0;
    }

    const conf = {
      quantidadePorCiclo,
      tempoReloadMin,
      reservaMadeira,
      reservaArgila,
      reservaFerro,
      reservaFazenda,
      metas
    };

    localStorage.setItem(`configuracoesRecrutamento_${villageId}`, JSON.stringify(conf));
    showSaved();
    restartReloadTimer();
    renderStatus();
  }

  function carregarConfiguracoes() {
    const confStr = localStorage.getItem(`configuracoesRecrutamento_${villageId}`);
    if (!confStr) return;

    try {
      const c = JSON.parse(confStr);

      quantidadePorCiclo = parseInt(c.quantidadePorCiclo || 1, 10);
      tempoReloadMin = parseInt(c.tempoReloadMin || 10, 10);

      reservaMadeira = parseInt(c.reservaMadeira || 0, 10);
      reservaArgila = parseInt(c.reservaArgila || 0, 10);
      reservaFerro = parseInt(c.reservaFerro || 0, 10);

      reservaFazenda = parseInt(c.reservaFazenda || 0, 10);

      metas = Object.assign(metas, c.metas || {});

      $('#quantidadeRecrutar').val(quantidadePorCiclo);
      $('#tempoReloadMin').val(tempoReloadMin);

      $('#reservaMadeira').val(reservaMadeira);
      $('#reservaArgila').val(reservaArgila);
      $('#reservaFerro').val(reservaFerro);
      $('#reservaFazenda').val(reservaFazenda);

      for (const u of unitOrder) {
        $(`#meta_${u.key}`).val(parseInt(metas[u.key] || 0, 10));
      }

      const collapsed = localStorage.getItem(`recruit_ui_collapsed_${villageId}`) === '1';
      setCollapsed(collapsed, false);
    } catch (e) {
      console.warn('Erro ao carregar configurações:', e);
    }
  }

  // ======= INJETAR UI =======
  $('body').append(`
    <style>
      #recruitPanel { position: fixed; top: 60px; left: 10px; width: 240px; z-index: 9999; font-family: Verdana, sans-serif; color: #3b1f0e; }
      #recruitToggleHeader {
        background: rgba(222, 193, 150, 0.98);
        border: 2px solid #8b5c2f;
        border-radius: 10px;
        padding: 6px 10px;
        cursor: pointer;
        font-weight: bold;
        box-shadow: 3px 3px 6px rgba(0,0,0,0.25);
        user-select: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      #recruitToggleHeader .left { display: flex; align-items: center; gap: 6px; }
      #recruitToggleHeader .chev { font-size: 12px; opacity: 0.9; }
      #recruitBody {
        margin-top: 6px;
        background: rgba(242, 230, 198, 0.95);
        padding: 10px;
        border: 2px solid #8b5c2f;
        border-radius: 10px;
        box-shadow: 3px 3px 6px rgba(0,0,0,0.25);
        cursor: move;
      }
      .sectionTitle { font-weight: bold; font-size: 12px; margin: 2px 0 6px 0; }
      .unit-option { display: grid; grid-template-columns: 18px 1fr 80px; align-items: center; gap: 6px; margin-bottom: 5px; }
      .unit-option img { width: 18px; height: 18px; }
      .unit-option span { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      input[type="number"] { width: 80px; padding: 2px 4px; font-size: 12px; }
      .row2 { display: grid; grid-template-columns: 1fr 80px; align-items: center; gap: 6px; margin: 6px 0; font-size: 12px; }
      .divider { height: 1px; background: rgba(139, 92, 47, 0.35); margin: 8px 0; }
      #saveSettings { background: #dec196; border: 1px solid #8b5c2f; padding: 6px 10px; cursor: pointer; border-radius: 8px; margin-top: 8px; width: 100%; font-weight: bold; }
      #savedToast { margin-top: 6px; color: #0a7a20; font-weight: bold; display: none; font-size: 12px; }
      #recruitStatusBox { margin-top: 8px; padding: 8px; border: 1px dashed rgba(139, 92, 47, .7); border-radius: 8px; background: rgba(255,255,255,.35); }
      .hint { font-size: 11px; opacity: 0.85; margin-top: 4px; line-height: 1.25; }
      #recruitPanel.collapsed #recruitBody { display: none; }
    </style>

    <div id="recruitPanel">
      <div id="recruitToggleHeader" title="Clique para recolher/expandir">
        <div class="left">⚙️ <span>Recrutamento</span></div>
        <div class="chev" id="recruitChev">▾</div>
      </div>

      <div id="recruitBody">
        <div class="sectionTitle">⚔️ Metas (recrutar até)</div>
        <div id="unitTargets"></div>

        <div class="divider"></div>

        <div class="row2"><label>Qtd por ciclo:</label><input type="number" id="quantidadeRecrutar" value="1" min="1"></div>
        <div class="row2"><label>Reload (min):</label><input type="number" id="tempoReloadMin" value="10" min="1"></div>

        <div class="divider"></div>

        <div class="sectionTitle">Reserva Recursos</div>
        <div class="row2"><label>Madeira</label><input type="number" id="reservaMadeira" value="0" min="0"></div>
        <div class="row2"><label>Argila</label><input type="number" id="reservaArgila" value="0" min="0"></div>
        <div class="row2"><label>Ferro</label><input type="number" id="reservaFerro" value="0" min="0"></div>

        <div class="divider"></div>

        <div class="sectionTitle">Reserva Fazenda</div>
        <div class="row2"><label>Pop livre:</label><input type="number" id="reservaFazenda" value="0" min="0"></div>

        <div class="hint">Fila total máx: <b>${LIMITE_FILA_TOTAL}</b></div>

        <button id="saveSettings">💾 Salvar Configurações</button>
        <div id="savedToast">Configurações salvas!</div>

        <div id="recruitStatusBox"></div>
      </div>
    </div>
  `);

  // Eventos UI
  $('#recruitToggleHeader').on('click', function () {
    const collapsed = $('#recruitPanel').hasClass('collapsed');
    setCollapsed(!collapsed, true);
  });

  $('#saveSettings').on('click', salvarConfiguracoes);

  // Drag corpo
  let isDragging = false, offsetX = 0, offsetY = 0;
  $('#recruitBody').on('mousedown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'LABEL') return;
    isDragging = true;
    const $panel = $('#recruitPanel');
    offsetX = e.clientX - $panel.offset().left;
    offsetY = e.clientY - $panel.offset().top;
  });

  $(document).on('mousemove', function (e) {
    if (!isDragging) return;
    $('#recruitPanel').css({ left: e.clientX - offsetX, top: e.clientY - offsetY, position: 'fixed' });
  }).on('mouseup', function () {
    isDragging = false;
  });

  // ======= START =======
  $(document).ready(function () {
    renderTargets();
    carregarConfiguracoes();
    renderStatus();
    restartReloadTimer();

    setInterval(tentativaDeRecrutamento, LOOP_MS);
    setInterval(renderStatus, 3500);
  });

})();
