// ==UserScript==
// @name         Auto Recrutamento
// @version      0.9.6
// @description  Recrutamento automático PHX bot com reservas + reserva de fazenda e metas por aldeia + limite TOTAL de fila 2 + limite 2 por unidade + UI compacta recolher/expandir
// @author       Phoenix
// @include      https://*.*.*.*&screen=train**
// @include      https://*.*.*.*&screen=stable**
// @include      https://*.*.*.*&screen=barracks**
// @exclude      https://*.*.*.*&screen=train&mode=mass**
// @exclude      https://*.*.*.*&screen=train&mode=mass_decommission**
// @include      https://*.tribalwars.com.br/game.php?screen=train&t=*&village=*
// @downloadURL    https://github.com/kleberpcp/scriptstw/raw/refs/heads/master/auto_rec.user.js
// @updateURL      https://github.com/kleberpcp/scriptstw/raw/refs/heads/master/auto_rec.user.js
// @require      https://code.jquery.com/jquery-2.2.4.min.js
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // =======================
  // CONFIG GERAL
  // =======================
  const LIMITE_FILA_TOTAL = 2;
  const LOOP_MS = 4000;

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

  const popPerUnit = { spear:1, sword:1, axe:1, spy:2, light:4, heavy:6, ram:5, catapult:8 };

  // =======================
  // CONFIG POR ALDEIA (localStorage)
  // =======================
  let quantidadePorCiclo = 1;
  let tempoReloadMin = 10;

  let reservaMadeira = 0;
  let reservaArgila = 0;
  let reservaFerro = 0;
  let reservaFazenda = 0;

  let metas = { spear:0, sword:0, axe:0, spy:0, light:0, heavy:0, ram:0, catapult:0 };

  let lastSuccess = null; // {time, text}
  let reloadInterval = null;

  // =======================
  // HELPERS
  // =======================
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
    return {
      wood:  parseIntTW($(`#${unitKey}_0_cost_wood`).text()),
      stone: parseIntTW($(`#${unitKey}_0_cost_stone`).text()),
      iron:  parseIntTW($(`#${unitKey}_0_cost_iron`).text()),
    };
  }

  function getCurrentUnitCount(unitKey) {
    const direct = $(`#unit_count_${unitKey}`);
    if (direct.length) return parseIntTW(direct.text());

    const $input = getUnitInput(unitKey);
    if (!$input.length) return 0;

    const $row = $input.closest('tr');
    if (!$row.length) return 0;

    const textRow = $row.text();
    const m = textRow.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) return parseInt(m[1], 10) || 0;

    return 0;
  }

  // =======================
  // FILA (contagem + por unidade)
  // =======================
  function getQueueRows() {
    const $cancels = $(`a, button, input[type="submit"], input[type="button"]`).filter(function () {
      const t = ($(this).text() || $(this).val() || '').trim().toLowerCase();
      return t === 'cancelar';
    });

    const rows = [];
    $cancels.each(function () {
      const $tr = $(this).closest('tr');
      if ($tr.length) rows.push($tr.get(0));
    });

    const unique = [...new Set(rows)];
    return $(unique);
  }

  function getQueueTotalCount() {
    return getQueueRows().length || 0;
  }

  function getQueuedCountByUnit(unitKey) {
    const $rows = getQueueRows();
    if (!$rows.length) return 0;

    let count = 0;
    $rows.each(function () {
      const $tr = $(this);
      const $img = $tr.find('img').first();
      const src = ($img.attr('src') || '').toLowerCase();
      const alt = ($img.attr('alt') || '').toLowerCase();
      const title = ($img.attr('title') || '').toLowerCase();
      const txt = $tr.text().toLowerCase();

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

  function clearAllInputs() {
    for (const u of unitOrder) {
      const $in = getUnitInput(u.key);
      if ($in.length) $in.val('').trigger('input').trigger('change');
    }
  }

  function submitRecruitForm() {
    const $form = $('#train_form, form[name="train_form"], form[action*="train"]').first();
    if (!$form.length) return false;

    const $btn = $form.find('button, input[type=submit], input[type=button], a').filter(function () {
      const t = ($(this).text() || $(this).val() || '').trim().toLowerCase();
      return t === 'recrutar';
    }).first();

    if ($btn.length) {
      $btn.trigger('mousedown').trigger('mouseup').trigger('click');
      return true;
    }

    const formEl = $form.get(0);
    if (!formEl) return false;

    if (typeof formEl.requestSubmit === 'function') {
      formEl.requestSubmit();
      return true;
    }
    try { formEl.submit(); return true; } catch (e) { return false; }
  }

  function canAddUnit(unitKey, qtd, budget) {
    if (qtd <= 0) return false;

    const cost = getUnitCost(unitKey);
    if ((cost.wood + cost.stone + cost.iron) === 0) return false;

    const popNeed = (popPerUnit[unitKey] || 0) * qtd;

    if (budget.wood  < cost.wood  * qtd) return false;
    if (budget.stone < cost.stone * qtd) return false;
    if (budget.iron  < cost.iron  * qtd) return false;
    if (budget.pop   < popNeed)          return false;

    return true;
  }

  function applyUnit(unitKey, qtd) {
    const $in = getUnitInput(unitKey);
    if (!$in.length) return 0;

    const maxAttr = parseInt($in.attr('max'), 10);
    if (!isNaN(maxAttr) && maxAttr > 0) qtd = Math.min(qtd, maxAttr);
    if (qtd <= 0) return 0;

    $in.val(qtd).trigger('input').trigger('change').trigger('blur');
    return qtd;
  }

  // =======================
  // CORE: preenche até 2 na fila em 1 submit
  // =======================
  function tentativaDeRecrutamento() {
    if (!/screen=train/.test(location.href)) return;

    const filaAtual = getQueueTotalCount();
    if (filaAtual >= LIMITE_FILA_TOTAL) return;

    const slotsLivresNaFila = LIMITE_FILA_TOTAL - filaAtual;
    if (slotsLivresNaFila <= 0) return;

    const res = getResources();
    const pop = getPopInfo();

    const budget = {
      wood:  Math.max(0, res.wood  - reservaMadeira),
      stone: Math.max(0, res.stone - reservaArgila),
      iron:  Math.max(0, res.iron  - reservaFerro),
      pop:   Math.max(0, pop.free  - reservaFazenda),
    };

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

      let qtd = Math.min(
        faltaParaMeta,
        slotsRestantes,
        Math.max(1, quantidadePorCiclo)
      );

      while (qtd > 0 && !canAddUnit(u.key, qtd, budget)) qtd--;
      if (qtd <= 0) continue;

      const applied = applyUnit(u.key, qtd);
      if (applied <= 0) continue;

      const cost = getUnitCost(u.key);
      budget.wood  -= cost.wood  * applied;
      budget.stone -= cost.stone * applied;
      budget.iron  -= cost.iron  * applied;
      budget.pop   -= (popPerUnit[u.key] || 0) * applied;

      slotsRestantes -= applied;
      algoPreenchido = true;
      filledDesc.push(`${u.label} x${applied}`);
    }

    if (!algoPreenchido) return;

    const ok = submitRecruitForm();
    if (ok) {
      lastSuccess = { time: nowStr(), text: filledDesc.join(' + ') };
      renderStatus();
    }
  }

  // =======================
  // UI (pixel perfect + foco suave + snap bordas + toast salvo)
  // =======================
  function renderTargets() {
    const $wrap = $('#unitTargets');
    $wrap.empty();
    for (const u of unitOrder) {
      $wrap.append(`
        <div class="unit-option">
          <img src="${u.icon}">
          <span>${u.label}</span>
          <input type="number" id="meta_${u.key}" value="0" min="0">
        </div>
      `);
    }
  }

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

  // ✅ Toast que você gostava: "Configurações salvas!"
  function showSavedToast() {
    const $t = $('#savedToast');
    if (!$t.length) return;
    $t.stop(true, true).fadeIn(120);
    setTimeout(() => $t.fadeOut(250), 1300);
  }

  function restartReloadTimer() {
    if (reloadInterval) clearInterval(reloadInterval);
    reloadInterval = setInterval(() => location.reload(), (tempoReloadMin * 60 * 1000));
  }

  function setCollapsed(collapsed, persist = true) {
    const $panel = $('#recruitPanel');
    const $chev = $('#recruitChev');
    if (collapsed) { $panel.addClass('collapsed'); $chev.text('▸'); }
    else { $panel.removeClass('collapsed'); $chev.text('▾'); }
    if (persist) localStorage.setItem(`recruit_ui_collapsed_${villageId}`, collapsed ? '1' : '0');
  }

  function salvarConfiguracoes() {
    quantidadePorCiclo = parseInt($('#quantidadeRecrutar').val(), 10) || 1;
    tempoReloadMin = parseInt($('#tempoReloadMin').val(), 10) || 10;

    reservaMadeira = parseInt($('#reservaMadeira').val(), 10) || 0;
    reservaArgila  = parseInt($('#reservaArgila').val(), 10) || 0;
    reservaFerro   = parseInt($('#reservaFerro').val(), 10) || 0;
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

    // ✅ REVERTE APENAS ESTA FUNCIONALIDADE (toast)
    showSavedToast();

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
      reservaArgila  = parseInt(c.reservaArgila || 0, 10);
      reservaFerro   = parseInt(c.reservaFerro || 0, 10);
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

  // =======================
  // INJETAR UI
  // =======================
  $('body').append(`
<style>
  :root{
    --phx-bg: rgba(242,230,198,0.96);
    --phx-bg2: rgba(232,215,180,0.92);
    --phx-border: #8b5c2f;
    --phx-text: #3b1f0e;
    --phx-shadow: 2px 2px 5px rgba(0,0,0,.18);

    --phx-input-bg: rgba(255,255,255,0.22);
    --phx-input-border: rgba(139,92,47,0.40);
    --phx-input-focus-ring: rgba(139,92,47,0.14);

    --phx-panel-w: 270px;
    --phx-input-w: 64px;
    --phx-gap: 8px;
    --phx-icon-w: 18px;
  }

  #recruitPanel{
    position: fixed;
    top: 60px;
    left: 10px;
    width: var(--phx-panel-w);
    z-index: 9999;
    font-family: Verdana, sans-serif;
    color: var(--phx-text);
  }

  #recruitToggleHeader{
    background: linear-gradient(180deg,#e6cfa1,#d7bc8c);
    border: 2px solid var(--phx-border);
    border-radius: 12px;
    padding: 7px 10px;
    font-weight: bold;
    cursor: pointer;
    box-shadow: var(--phx-shadow);
    display:flex;
    align-items:center;
    justify-content:space-between;
    user-select:none;
  }

  #recruitToggleHeader .chev{
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid rgba(139,92,47,.4);
    background: rgba(255,255,255,.18);
  }

  #recruitBody{
    margin-top: 8px;
    background: linear-gradient(180deg,var(--phx-bg),var(--phx-bg2));
    padding: 10px;
    border: 2px solid var(--phx-border);
    border-radius: 12px;
    box-shadow: var(--phx-shadow);
    cursor: move;
  }

  .sectionTitle{ font-weight:bold; font-size:12px; margin:2px 0 8px; }
  .divider{ height:1px; background:rgba(139,92,47,.35); margin:10px 0; }
  .hint{ font-size:11px; opacity:.85; margin-top:4px; }

  .unit-option{
    display:grid;
    grid-template-columns: var(--phx-icon-w) 1fr var(--phx-input-w);
    column-gap: var(--phx-gap);
    align-items:center;
    margin-bottom:6px;
  }
  .unit-option img{ width:var(--phx-icon-w); height:var(--phx-icon-w); }
  .unit-option span{
    font-size:12px;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }

  .row2{
    display:grid;
    grid-template-columns: 1fr var(--phx-input-w);
    column-gap: var(--phx-gap);
    align-items:center;
    margin:6px 0;
    font-size:12px;
  }

  #recruitPanel input[type="number"]{
    width: var(--phx-input-w);
    justify-self: end;
    padding:4px 6px;
    font-size:12px;
    border-radius:8px;
    border:1px solid var(--phx-input-border);
    background: var(--phx-input-bg);
    color: var(--phx-text);
    text-align:right;
    box-shadow: inset 0 1px 1px rgba(0,0,0,.06);
    outline:none;
    transition: background .15s ease, box-shadow .15s ease, border-color .15s ease;
  }

  #recruitPanel input[type="number"]:focus{
    background: rgba(255,255,255,0.30);
    border-color: rgba(139,92,47,.70);
    box-shadow:
      inset 0 1px 2px rgba(0,0,0,.08),
      0 0 0 2px var(--phx-input-focus-ring);
  }

  input[type="number"]::-webkit-inner-spin-button,
  input[type="number"]::-webkit-outer-spin-button{ -webkit-appearance:none; margin:0; }
  input[type="number"]{ -moz-appearance:textfield; }

  #saveSettings{
    margin-top:10px;
    width:100%;
    padding:8px 10px;
    border-radius:12px;
    border:1px solid var(--phx-border);
    background: linear-gradient(180deg,#e2c89b,#d6b888);
    font-weight:bold;
    cursor:pointer;
    box-shadow: 0 2px 0 rgba(139,92,47,.35), 0 5px 10px rgba(0,0,0,.12);
  }

  #savedToast{
    display:none;
    margin-top:8px;
    font-size:12px;
    font-weight:bold;
    color:#0a7a20;
  }

  #recruitStatusBox{
    margin-top:10px;
    padding:8px;
    border:1px dashed rgba(139,92,47,.6);
    border-radius:10px;
    background: rgba(255,255,255,.28);
    font-size:12px;
  }

  #recruitPanel.collapsed #recruitBody{ display:none; }

  #recruitPanel.snapping{ transition: left 120ms ease, top 120ms ease; }
</style>

<div id="recruitPanel">
  <div id="recruitToggleHeader" title="Clique para recolher/expandir">
    <div>⚙️ Recrutamento</div>
    <div class="chev" id="recruitChev">▾</div>
  </div>

  <div id="recruitBody">
    <div class="sectionTitle">⚔️ Metas (recrutar até)</div>
    <div id="unitTargets"></div>

    <div class="hint">Meta 0 desativa a unidade.</div>

    <div class="divider"></div>

    <div class="row2">
      <label>Qtd por ciclo:</label>
      <input type="number" id="quantidadeRecrutar" value="1" min="1">
    </div>

    <div class="row2">
      <label>Reload (min):</label>
      <input type="number" id="tempoReloadMin" value="10" min="1">
    </div>

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

  // =======================
  // DRAG + SNAP NAS BORDAS
  // =======================
  const SNAP_PX = 18;
  const MARGIN = 6;

  let isDragging = false, offsetX = 0, offsetY = 0;

  $('#recruitBody').on('mousedown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'LABEL') return;
    isDragging = true;

    const $panel = $('#recruitPanel');
    const off = $panel.offset();
    offsetX = e.clientX - off.left;
    offsetY = e.clientY - off.top;

    $panel.removeClass('snapping');
  });

  $(document).on('mousemove', function (e) {
    if (!isDragging) return;

    const $panel = $('#recruitPanel');
    const w = $panel.outerWidth();
    const h = $panel.outerHeight();

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = e.clientX - offsetX;
    let top  = e.clientY - offsetY;

    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
    top  = Math.max(MARGIN, Math.min(top,  vh - h - MARGIN));

    $panel.css({ left, top, position: 'fixed' });
  }).on('mouseup', function () {
    if (!isDragging) return;
    isDragging = false;

    const $panel = $('#recruitPanel');
    const w = $panel.outerWidth();
    const h = $panel.outerHeight();

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const leftNow = parseFloat($panel.css('left')) || 0;
    const topNow  = parseFloat($panel.css('top')) || 0;

    const distL = leftNow;
    const distT = topNow;
    const distR = (vw - w) - leftNow;
    const distB = (vh - h) - topNow;

    let left = leftNow;
    let top  = topNow;

    if (distL <= SNAP_PX) left = MARGIN;
    else if (distR <= SNAP_PX) left = (vw - w - MARGIN);

    if (distT <= SNAP_PX) top = MARGIN;
    else if (distB <= SNAP_PX) top = (vh - h - MARGIN);

    $panel.addClass('snapping');
    $panel.css({ left, top });

    setTimeout(() => $panel.removeClass('snapping'), 160);
  });

  $(window).on('resize', function () {
    const $panel = $('#recruitPanel');
    const w = $panel.outerWidth();
    const h = $panel.outerHeight();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = parseFloat($panel.css('left')) || 10;
    let top  = parseFloat($panel.css('top')) || 60;

    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
    top  = Math.max(MARGIN, Math.min(top,  vh - h - MARGIN));

    $panel.css({ left, top });
  });

  // =======================
  // START
  // =======================
  $(document).ready(function () {
    renderTargets();
    carregarConfiguracoes();
    renderStatus();
    restartReloadTimer();

    setInterval(tentativaDeRecrutamento, LOOP_MS);
    setInterval(renderStatus, 3500);
  });

})();
