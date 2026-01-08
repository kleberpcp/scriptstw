// ==UserScript==
// @name         Auto Recrutamento
// @version      1.0
// @description  Recrutamento automático PHX bot com reservas + reserva de fazenda e metas por aldeia + limite TOTAL de fila 2 + limite 2 por unidade + UI compacta recolher/expandir
// @author       Phoenix
// @include      https://*.tribalwars.com.br/game.php?*screen=train*
// @exclude      https://*.tribalwars.com.br/game.php?*screen=train&mode=mass*
// @exclude      https://*.tribalwars.com.br/game.php?*screen=train&mode=mass_decommission*
// @downloadURL    https://github.com/kleberpcp/scriptstw/blob/master/auto_rec.user.js
// @updateURL      https://github.com/kleberpcp/scriptstw/blob/master/auto_rec.user.js
// @require      https://code.jquery.com/jquery-2.2.4.min.js
// @run-at       document-end
// ==/UserScript==
(function () {
  'use strict';

  // =======================
  // CONFIG
  // =======================
  const MAX_FILAS_POR_PREDIO = 2;   // ✅ 2 filas no Quartel + 2 no Estábulo + 2 na Oficina
  const LOOP_MS = 3500;

  const villageId = new URLSearchParams(location.search).get('village') || '0';

  const UNITS = [
    // Quartel
    { key: "spear",    label: "Lança",        icon: "/graphic/unit/unit_spear.png",    group: "barracks" },
    { key: "sword",    label: "Espada",       icon: "/graphic/unit/unit_sword.png",    group: "barracks" },
    { key: "axe",      label: "Bárbaro",      icon: "/graphic/unit/unit_axe.png",      group: "barracks" },

    // Estábulo
    { key: "spy",      label: "Explorador",   icon: "/graphic/unit/unit_spy.png",      group: "stable" },
    { key: "light",    label: "Cav. Leve",    icon: "/graphic/unit/unit_light.png",    group: "stable" },
    { key: "heavy",    label: "Cav. Pesada",  icon: "/graphic/unit/unit_heavy.png",    group: "stable" },

    // Oficina
    { key: "ram",      label: "Ariete",       icon: "/graphic/unit/unit_ram.png",      group: "garage" },
    { key: "catapult", label: "Catapulta",    icon: "/graphic/unit/unit_catapult.png", group: "garage" },
  ];

  const UNIT_BY_KEY = Object.fromEntries(UNITS.map(u => [u.key, u]));
  const popPerUnit = { spear:1, sword:1, axe:1, spy:2, light:4, heavy:6, ram:5, catapult:8 };

  // ✅ Mapeamento robusto por texto (PT-BR)
  const QUEUE_TEXT_MATCH = [
    { key: "spear",    re: /\blanceiro\b/i },
    { key: "sword",    re: /\bespadach/i },
    { key: "axe",      re: /\b(bárbaro|barbaro)\b/i },
    { key: "spy",      re: /\bexplorador\b/i },
    { key: "light",    re: /\bcavalaria\s+leve\b/i },
    { key: "heavy",    re: /\bcavalaria\s+pesada\b/i },
    { key: "ram",      re: /\b(ariete|aríete)\b/i },
    { key: "catapult", re: /\bcatapulta\b/i },
  ];

  // =======================
  // STATE (por aldeia)
  // =======================
  let quantidadePorCiclo = 1;
  let tempoReloadMin = 10;

  let reservaMadeira = 0;
  let reservaArgila = 0;
  let reservaFerro = 0;
  let reservaFazenda = 0;

  let metas = { spear:0, sword:0, axe:0, spy:0, light:0, heavy:0, ram:0, catapult:0 };

  let lastSuccess = null;
  let reloadInterval = null;

  // =======================
  // HELPERS
  // =======================
  function nowStr() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  }

  function parseIntTW(t) {
    return parseInt(String(t || "0").replace(/\./g,'').replace(/\s/g,''), 10) || 0;
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

  function getBudget() {
    const res = getResources();
    const pop = getPopInfo();
    return {
      wood:  Math.max(0, res.wood  - reservaMadeira),
      stone: Math.max(0, res.stone - reservaArgila),
      iron:  Math.max(0, res.iron  - reservaFerro),
      pop:   Math.max(0, pop.free  - reservaFazenda),
    };
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

    const txt = $row.text();
    const m = txt.match(/(\d+)\s*\/\s*(\d+)/);
    return m ? (parseInt(m[1], 10) || 0) : 0;
  }

  function clearAllInputs() {
    for (const u of UNITS) {
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

    const el = $form.get(0);
    if (!el) return false;

    if (typeof el.requestSubmit === 'function') { el.requestSubmit(); return true; }
    try { el.submit(); return true; } catch { return false; }
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
  // ✅ FILA: pega linhas e identifica unidade PELO TEXTO
  // =======================
  function getQueueRows() {
    // cada linha da fila tem um botão/link "Cancelar"
    const $cancels = $(`a, button, input[type="submit"], input[type="button"]`).filter(function () {
      const t = ($(this).text() || $(this).val() || '').trim().toLowerCase();
      return t === 'cancelar';
    });

    const rows = [];
    $cancels.each(function () {
      const $tr = $(this).closest('tr');
      if ($tr.length) rows.push($tr.get(0));
    });

    return $([...new Set(rows)]);
  }

  function detectUnitKeyFromQueueRow($tr) {
    // texto costuma ser tipo: "1 Lanceiro" / "1 Cavalaria leve"
    const txt = ($tr.text() || '').toLowerCase();

    for (const m of QUEUE_TEXT_MATCH) {
      if (m.re.test(txt)) return m.key;
    }
    return null;
  }

  function getQueueCountByGroup() {
    const counts = { barracks: 0, stable: 0, garage: 0 };

    const $rows = getQueueRows();
    $rows.each(function () {
      const key = detectUnitKeyFromQueueRow($(this));
      if (!key) return;
      const g = (UNIT_BY_KEY[key] || {}).group;
      if (!g) return;
      counts[g] += 1;
    });

    return counts;
  }

  // =======================
  // ✅ CORE: respeita 2 filas por prédio
  // (na tela combinada, pode preencher quartel + estábulo + oficina no mesmo submit)
  // =======================
  function tentativaDeRecrutamento() {
    if (!/screen=train/.test(location.href)) return;

    const queueByGroup = getQueueCountByGroup();

    const freeSlots = {
      barracks: Math.max(0, MAX_FILAS_POR_PREDIO - queueByGroup.barracks),
      stable:   Math.max(0, MAX_FILAS_POR_PREDIO - queueByGroup.stable),
      garage:   Math.max(0, MAX_FILAS_POR_PREDIO - queueByGroup.garage),
    };

    if ((freeSlots.barracks + freeSlots.stable + freeSlots.garage) <= 0) return;

    const budget = getBudget();
    clearAllInputs();

    let algo = false;
    const desc = [];

    for (const u of UNITS) {
      const meta = parseInt(metas[u.key] || 0, 10);
      if (!meta || meta <= 0) continue;

      const $in = getUnitInput(u.key);
      if (!$in.length) continue; // não disponível na tela

      const g = u.group;
      if (freeSlots[g] <= 0) continue; // ✅ prédio cheio (2 filas)

      const atual = getCurrentUnitCount(u.key);
      if (atual >= meta) continue;

      const falta = meta - atual;
      let qtd = Math.min(Math.max(1, quantidadePorCiclo), falta);

      while (qtd > 0 && !canAddUnit(u.key, qtd, budget)) qtd--;
      if (qtd <= 0) continue;

      const applied = applyUnit(u.key, qtd);
      if (applied <= 0) continue;

      const cost = getUnitCost(u.key);
      budget.wood  -= cost.wood  * applied;
      budget.stone -= cost.stone * applied;
      budget.iron  -= cost.iron  * applied;
      budget.pop   -= (popPerUnit[u.key] || 0) * applied;

      freeSlots[g] -= 1; // ✅ 1 unidade preenchida = 1 fila adicionada naquele prédio
      algo = true;
      desc.push(`${u.label} x${applied}`);

      if ((freeSlots.barracks + freeSlots.stable + freeSlots.garage) <= 0) break;
    }

    if (!algo) return;

    const ok = submitRecruitForm();
    if (ok) {
      lastSuccess = { time: nowStr(), text: desc.join(' + ') };
      renderStatus(queueByGroup);
    }
  }

  // =======================
  // UI
  // =======================
  function renderTargets() {
    const $wrap = $('#unitTargets');
    $wrap.empty();
    for (const u of UNITS) {
      $wrap.append(`
        <div class="unit-option">
          <img src="${u.icon}">
          <span>${u.label}</span>
          <input type="number" id="meta_${u.key}" value="0" min="0">
        </div>
      `);
    }
  }

  function renderStatus(queueOverride) {
    const $box = $('#recruitStatusBox');
    if (!$box.length) return;

    const pop = getPopInfo();
    const res = getResources();
    const q = queueOverride || getQueueCountByGroup();

    let html = `
      <div style="font-weight:bold; margin-bottom:6px;">📌 Status</div>
      <div style="font-size:12px; line-height:1.35;">
        <div>🏚️ <b>${villageId}</b></div>
        <div>👥 <b>${pop.cur}</b>/<b>${pop.max}</b> (Livre: <b>${pop.free}</b>, Res.: <b>${reservaFazenda}</b>)</div>
        <div>🪵 ${res.wood} | 🧱 ${res.stone} | ⛓️ ${res.iron}</div>
        <div style="margin-top:6px;">
          🏰 Quartel: <b>${q.barracks}</b>/<b>${MAX_FILAS_POR_PREDIO}</b>
          • 🐎 Estábulo: <b>${q.stable}</b>/<b>${MAX_FILAS_POR_PREDIO}</b>
          • 🛠️ Oficina: <b>${q.garage}</b>/<b>${MAX_FILAS_POR_PREDIO}</b>
        </div>
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

    for (const u of UNITS) metas[u.key] = parseInt($(`#meta_${u.key}`).val(), 10) || 0;

    localStorage.setItem(
      `configuracoesRecrutamento_${villageId}`,
      JSON.stringify({ quantidadePorCiclo, tempoReloadMin, reservaMadeira, reservaArgila, reservaFerro, reservaFazenda, metas })
    );

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

      for (const u of UNITS) $(`#meta_${u.key}`).val(parseInt(metas[u.key] || 0, 10));

      const collapsed = localStorage.getItem(`recruit_ui_collapsed_${villageId}`) === '1';
      setCollapsed(collapsed, false);
    } catch (e) {
      console.warn('Erro ao carregar configurações:', e);
    }
  }

  // =======================
  // UI INJECT (mesma estética)
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

  #recruitPanel{ position:fixed; top:60px; left:10px; width:var(--phx-panel-w); z-index:9999; font-family:Verdana,sans-serif; color:var(--phx-text); }
  #recruitToggleHeader{
    background:linear-gradient(180deg,#e6cfa1,#d7bc8c);
    border:2px solid var(--phx-border);
    border-radius:12px;
    padding:7px 10px;
    font-weight:bold;
    cursor:pointer;
    box-shadow:var(--phx-shadow);
    display:flex; align-items:center; justify-content:space-between;
    user-select:none;
  }
  #recruitToggleHeader .chev{ font-size:11px; padding:2px 7px; border-radius:999px; border:1px solid rgba(139,92,47,.4); background:rgba(255,255,255,.18); }
  #recruitBody{
    margin-top:8px;
    background:linear-gradient(180deg,var(--phx-bg),var(--phx-bg2));
    padding:10px;
    border:2px solid var(--phx-border);
    border-radius:12px;
    box-shadow:var(--phx-shadow);
    cursor:move;
  }

  .divider{ height:1px; background:rgba(139,92,47,.35); margin:10px 0; }
  .hint{ font-size:11px; opacity:.85; margin-top:4px; }
  .sectionTitle{ font-weight:bold; font-size:12px; margin:0 0 8px; }

  .unit-option{
    display:grid;
    grid-template-columns:var(--phx-icon-w) 1fr var(--phx-input-w);
    column-gap:var(--phx-gap);
    align-items:center;
    margin-bottom:6px;
  }
  .unit-option img{ width:var(--phx-icon-w); height:var(--phx-icon-w); }
  .unit-option span{ font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  .row2{
    display:grid;
    grid-template-columns:1fr var(--phx-input-w);
    column-gap:var(--phx-gap);
    align-items:center;
    margin:6px 0;
    font-size:12px;
  }

  #recruitPanel input[type="number"]{
    width:var(--phx-input-w);
    justify-self:end;
    padding:4px 6px;
    font-size:12px;
    border-radius:8px;
    border:1px solid var(--phx-input-border);
    background:var(--phx-input-bg);
    color:var(--phx-text);
    text-align:right;
    box-shadow:inset 0 1px 1px rgba(0,0,0,.06);
    outline:none;
    transition:background .15s ease, box-shadow .15s ease, border-color .15s ease;
  }
  #recruitPanel input[type="number"]:focus{
    background:rgba(255,255,255,0.30);
    border-color:rgba(139,92,47,.70);
    box-shadow:inset 0 1px 2px rgba(0,0,0,.08), 0 0 0 2px var(--phx-input-focus-ring);
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
    background:linear-gradient(180deg,#e2c89b,#d6b888);
    font-weight:bold;
    cursor:pointer;
    box-shadow:0 2px 0 rgba(139,92,47,.35), 0 5px 10px rgba(0,0,0,.12);
  }
  #savedToast{ display:none; margin-top:8px; font-size:12px; font-weight:bold; color:#0a7a20; }

  #recruitStatusBox{
    margin-top:10px;
    padding:8px;
    border:1px dashed rgba(139,92,47,.6);
    border-radius:10px;
    background:rgba(255,255,255,.28);
    font-size:12px;
  }

  #recruitPanel.collapsed #recruitBody{ display:none; }
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

    <div class="sectionTitle" style="font-size:12px;">Reserva Recursos</div>
    <div class="row2"><label>Madeira</label><input type="number" id="reservaMadeira" value="0" min="0"></div>
    <div class="row2"><label>Argila</label><input type="number" id="reservaArgila" value="0" min="0"></div>
    <div class="row2"><label>Ferro</label><input type="number" id="reservaFerro" value="0" min="0"></div>

    <div class="divider"></div>

    <div class="sectionTitle" style="font-size:12px;">Reserva Fazenda</div>
    <div class="row2"><label>Pop livre:</label><input type="number" id="reservaFazenda" value="0" min="0"></div>

    <div class="hint">Limite: <b>${MAX_FILAS_POR_PREDIO}</b> filas por prédio (Quartel/Estábulo/Oficina).</div>

    <button id="saveSettings">💾 Salvar Configurações</button>
    <div id="savedToast">Configurações salvas!</div>

    <div id="recruitStatusBox"></div>
  </div>
</div>
  `);

  // UI events
  $('#recruitToggleHeader').on('click', function () {
    const collapsed = $('#recruitPanel').hasClass('collapsed');
    setCollapsed(!collapsed, true);
  });
  $('#saveSettings').on('click', salvarConfiguracoes);

  // drag
  const MARGIN = 6;
  let isDragging = false, offsetX = 0, offsetY = 0;

  $('#recruitBody').on('mousedown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'LABEL') return;
    isDragging = true;
    const $panel = $('#recruitPanel');
    const off = $panel.offset();
    offsetX = e.clientX - off.left;
    offsetY = e.clientY - off.top;
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
  }).on('mouseup', function () { isDragging = false; });

  // start
  $(document).ready(function () {
    renderTargets();
    carregarConfiguracoes();
    renderStatus();
    restartReloadTimer();

    setInterval(tentativaDeRecrutamento, LOOP_MS);
    setInterval(renderStatus, 3500);
  });

})();
