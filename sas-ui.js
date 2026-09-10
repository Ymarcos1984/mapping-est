/* Adapter to the existing PWA. Legacy readers remain active without SAS data. */
(function () {
  'use strict';
  var legacyLoopOf = loopOf, legacyRebuild = rebuildOrder, legacyApply = applyState;
  var legacyReport = upsertReport, legacyAfterLoad = afterLoad, legacyRender = render, legacyProjectLine = updateProjLine;
  var queue = Promise.resolve(), queueEpoch = 0;

  function sources() { return state.sasSources || []; }
  function visibleSources() {
    return sources().filter(s => !curLoop || s.loops.some(lp => SasMapping.scope(s, lp) === curLoop));
  }
  window.reportProjectName = function () {
    var list = visibleSources();
    return list.length > 1 ? 'Varios proyectos SAS (' + list.length + ')' : list.length ? list[0].obra : state.meta.project;
  };
  function notice(message) {
    $('sasNotice').textContent = message || '';
    $('sasNotice').classList.toggle('hidden', !message);
  }
  function warnings() {
    var list = visibleSources();
    var messages = list.flatMap(s => s.warnings.map(w => s.obra + ': ' + w));
    if (state.sasReportNotice && (!curLoop || (state.sasReportSourceIds || []).some(id => list.some(s => s.id === id)))) messages.push(state.sasReportNotice);
    notice(messages.join('\n'));
    $('btnSasMd').classList.toggle('hidden', !sources().length);
  }
  updateProjLine = function () {
    if (!sources().length) { legacyProjectLine(); return; }
    $('projLine').textContent = reportProjectName() + (state.meta.date ? ' · ' + state.meta.date : '');
  };
  render = function () {
    legacyRender(); warnings(); updateProjLine();
    var records = state.order.map(k => state.dev[k]).filter(d => d.sasId && (!curLoop || d.scope === curLoop));
    var scopes = new Set(records.map(d => d.scope));
    $('sasLoadedSummary').classList.toggle('hidden', !records.length);
    $('sasLoadedSummary').textContent = records.length + ' dispositivos SAS · ' + scopes.size + (scopes.size === 1 ? ' loop' : ' loops') + ' · ' + records.filter(d => d.children > 1).length + ' T-taps. Incluye etiquetas, mensajes y seriales del SAS.';
  };

  loopOf = function (key) { return state.dev[key] && state.dev[key].scope || legacyLoopOf(key); };
  buildLoopFilter = function () {
    var groups = new Map();
    state.order.forEach(function (key) {
      var group = loopOf(key), d = state.dev[key];
      if (!group) return;
      if (!groups.has(String(group))) groups.set(String(group), { label: d.scopeLabel || 'Loop ' + group, count: 0 });
      groups.get(String(group)).count++;
    });
    if (curLoop && !groups.has(String(curLoop))) curLoop = 0;
    var sel = $('fLoop');
    sel.innerHTML = '<option value="0">Todos los paneles / loops</option>';
    groups.forEach(function (group, key) {
      var option = document.createElement('option'); option.value = key;
      option.textContent = group.label + ' · ' + group.count; sel.appendChild(option);
    });
    sel.value = curLoop || '0';
    sel.classList.toggle('hidden', groups.size <= 1 && !sources().length);
  };
  setLoop = function () {
    var value = $('fLoop').value;
    curLoop = value.startsWith('sas:') ? value : Number(value) || 0;
    visibleLimit = 250; hitIdx = 0; render();
  };
  rebuildOrder = function () {
    legacyRebuild();
    var sourceOrder = new Map(sources().map((s, i) => [s.id, i]));
    state.order.sort(function (a, b) {
      var x = state.dev[a], y = state.dev[b];
      if (!x.sasId && !y.sasId) return 0;
      if (!x.sasId) return 1;
      if (!y.sasId) return -1;
      return sourceOrder.get(x.sasId) - sourceOrder.get(y.sasId) || x.panel - y.panel || x.loopnum - y.loopnum || x.mapOrder - y.mapOrder;
    });
    computeTtaps();
  };

  afterLoad = function (src, kind, detail) { legacyAfterLoad(src, kind, detail); warnings(); };
  persist = function () {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (error) { notice('No se pudo guardar en este dispositivo. Descarga la sesión para conservar tu trabajo.'); }
  };

  window.commitSas = function (source) {
    var devices = SasMapping.flatten(source);
    var previous = state;
    var next = JSON.parse(JSON.stringify(state));
    next.sasSources = (next.sasSources || []).filter(s => s.id !== source.id).concat([source]);
    devices.forEach(function (device) {
      next.dev[device.key] = Object.assign({}, next.dev[device.key] || {}, device);
    });
    next.meta.project = next.meta.project || source.obra;
    next.meta.date = next.meta.date || todayISO();
    next.sources = [...new Set(next.sources.concat(['SAS · ' + source.filename]))];
    next.hasMapping = Object.values(next.dev).some(d => d.inMap);
    next.hasTtap = Object.values(next.dev).some(d => d.children > 1);
    state = next;
    try {
      rebuildOrder();
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (error) { state = previous; throw new Error('No se pudo guardar el SAS. La sesión anterior se conserva: ' + error.message); }
    curLoop = 0;
    afterLoad(source.filename, 'Mapping SAS', devices.length + ' dispositivos · ' + source.loops.length + ' loops');
  };

  function validateSources(saved) {
    if (!saved || !saved.dev || !Array.isArray(saved.order) || typeof saved.dev !== 'object' || Array.isArray(saved.dev)) throw new Error('Sesión no válida.');
    if (saved.order.some(k => typeof k !== 'string' || !Object.prototype.hasOwnProperty.call(saved.dev, k))) throw new Error('Sesión con dispositivos ausentes.');
    if (new Set(saved.order).size !== saved.order.length) throw new Error('Sesión con claves duplicadas.');
    Object.values(saved.dev).forEach(function (device) {
      if (!device || typeof device !== 'object' || Array.isArray(device)) throw new Error('Dispositivo de sesión no válido.');
      ['key', 'parent', 'scope', 'scopeLabel', 'sasId', 'location', 'label', 'type', 'model', 'serial', 'mserial', 'mtype', 'rtype'].forEach(function (field) {
        if (device[field] != null && typeof device[field] !== 'string') throw new Error('Campo de sesión no válido: ' + field);
      });
    });
    Object.values(saved.ann || {}).forEach(function (annotation) {
      if (!annotation || (annotation.status && !STATUSES.some(s => s.key === annotation.status)) || (annotation.note != null && typeof annotation.note !== 'string')) throw new Error('Anotación de sesión no válida.');
    });
    var list = saved.sasSources || [];
    if (!Array.isArray(list) || list.length > 100) throw new Error('Lista de SAS no válida.');
    var sourceIds = new Set();
    list.forEach(function (source) {
      if (!/^[a-f0-9]{64}$/.test(source.id) || sourceIds.has(source.id) || !Array.isArray(source.loops) || !Array.isArray(source.warnings)) throw new Error('Origen SAS no válido.');
      if (source.warnings.some(w => typeof w !== 'string') || typeof source.obra !== 'string' || typeof source.filename !== 'string') throw new Error('Metadatos SAS no válidos.');
      sourceIds.add(source.id);
      source.loops.forEach(function (lp) {
        if (!Number.isSafeInteger(lp.panel) || lp.panel < 1 || !Number.isSafeInteger(lp.loopnum) || lp.loopnum < 1 || !Array.isArray(lp.devices)) throw new Error('Loop SAS no válido.');
      });
      SasMapping.flatten(source).forEach(function (device) {
        var stored = saved.dev[device.key];
        if (!stored || stored.sasId !== source.id || stored.scope !== device.scope || stored.parent !== device.parent || stored.address !== device.address) throw new Error('La sesión SAS no conserva la identidad o las conexiones.');
      });
    });
  }
  applyState = function (saved) {
    validateSources(saved);
    state.sasSources = saved.sasSources || [];
    state.sasReportNotice = saved.sasReportNotice || '';
    state.sasReportSourceIds = saved.sasReportSourceIds || [];
    curLoop = 0;
    legacyApply(saved); warnings();
  };

  window.importLegacySession = function () {
    try {
      var saved = localStorage.getItem('mappingTerrenoEST_v2');
      if (!saved) throw new Error('No hay una sesión v6 en esta dirección. Puedes cargar su archivo JSON.');
      applyState(JSON.parse(saved)); toast('Sesión v6 copiada; el original sigue guardado.');
    } catch (error) { alert(error.message); }
  };
  try { $('btnLegacySession').classList.toggle('hidden', !localStorage.getItem('mappingTerrenoEST_v2')); } catch (_) {}

  function download(text, filename, mime) {
    var url = URL.createObjectURL(new Blob([text], { type: mime }));
    var link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  window.downloadSasMd = function () {
    menuClose();
    var choices = [];
    sources().forEach(s => s.loops.forEach(lp => choices.push({ source: s, loop: lp })));
    if (!choices.length) return;
    function save(choice) {
      var name = choice.source.obra.replace(/[^\w-]+/g, '_') + '_P' + choice.loop.panel + '_L' + choice.loop.loopnum + '_MAPPING.md';
      download(SasMapping.markdown(choice.source, choice.loop), name, 'text/markdown;charset=utf-8');
    }
    if (choices.length === 1) { save(choices[0]); return; }
    var host = document.createElement('div'); host.id = 'sasDownloadSheet'; host.className = 'backdrop';
    host.innerHTML = '<div class="sheet"><h3>Guardar Mapping en MD</h3><p>Elige el panel y loop. Cada MD conserva su propio mapa.</p><select id="sasDownloadLoop" aria-label="Panel y loop para descargar"></select><div class="sheetfoot"><button id="sasDownloadConfirm" class="btn-primary">Descargar MD</button><button id="sasDownloadCancel">Cerrar</button></div></div>';
    document.body.appendChild(host);
    choices.forEach(function (choice, i) {
      var option = document.createElement('option'); option.value = String(i);
      option.textContent = choice.source.obra + ' · ' + choice.loop.title + ' · ' + choice.loop.devices.length + ' dispositivos';
      $('sasDownloadLoop').appendChild(option);
      if (SasMapping.scope(choice.source, choice.loop) === curLoop) $('sasDownloadLoop').value = String(i);
    });
    $('sasDownloadConfirm').onclick = () => save(choices[Number($('sasDownloadLoop').value)]);
    $('sasDownloadCancel').onclick = () => host.remove();
    host.onclick = e => { if (e.target === host) host.remove(); };
  };

  upsertReport = function (rows) {
    if (!sources().length) { legacyReport(rows); return; }
    var candidates = Object.values(state.dev).filter(d => d.sasId), matched = 0, unresolved = [], sourceIds = new Set();
    rows.forEach(function (row) {
      var serial = String(row.serial || '').replace(/\D/g, '');
      var address = row.ioAddress == null ? Number(addrKey(row.address || row.key)) : row.ioAddress;
      var matches = candidates.filter(d => serial.length >= 7 && d.mserial === serial && Number(d.address) === address && (row.ioLoop == null || row.ioLoop === d.loopnum));
      if (matches.length !== 1) { unresolved.push(String(row.address || row.key || '?')); return; }
      var device = matches[0];
      sourceIds.add(device.sasId);
      // Report data enriches the SAS snapshot; it never changes its address, serial or topology.
      device.rtype = row.type || device.rtype;
      device.type = device.type || row.type;
      device.pers = row.pers || device.pers;
      device.reportLocation = row.location || device.reportLocation;
      if (!device.location) device.location = row.location || '';
      matched++;
    });
    state.sasReportNotice = 'Reporte: ' + matched + ' filas vinculadas por serial completo y dirección.' + (unresolved.length ? ' ' + unresolved.length + ' sin coincidencia única; no se incorporaron: ' + unresolved.join(', ') + '.' : '');
    state.sasReportSourceIds = [...sourceIds];
    state.sources = [...new Set(state.sources.concat(['reporte']))];
    rebuildOrder();
  };

  function ioReportPage(content) {
    var items = content.items.filter(it => typeof it.str === 'string' && it.str.trim());
    var first = items.find(it => it.str.trim() === 'Panel Family');
    if (!first) return null;
    var headers = items.filter(it => Math.abs(it.transform[5] - first.transform[5]) < 2).sort((a, b) => a.transform[4] - b.transform[4]);
    var names = headers.map(it => it.str.trim());
    var needed = ['Loop', 'Address', 'Serial Number', 'Message', 'Model', 'Device Type'];
    if (!needed.every(n => names.includes(n))) throw new Error('El reporte iO tiene columnas distintas. No se ha incorporado.');
    var groups = [];
    items.filter(it => it.transform[5] < first.transform[5] - 3).forEach(function (it) {
      var row = groups.find(r => Math.abs(r.y - it.transform[5]) < 2);
      if (!row) { row = { y: it.transform[5], cells: headers.map(() => []) }; groups.push(row); }
      var column = 0;
      headers.forEach((h, i) => { if (it.transform[4] >= h.transform[4] - 2) column = i; });
      row.cells[column].push(it);
    });
    var records = [];
    groups.sort((a, b) => b.y - a.y).forEach(function (row) {
      var values = row.cells.map(c => c.sort((a, b) => a.transform[4] - b.transform[4]).map(it => it.str).join(' ').trim());
      var at = name => values[names.indexOf(name)] || '';
      if (values[0] !== 'IO') return;
      if (!/^\d+$/.test(at('Loop')) || !/^\d+$/.test(at('Address')) || !/^\d{7,}$/.test(at('Serial Number'))) throw new Error('Fila iO incompleta: revise el reporte antes de cargarlo.');
      records.push({ key: addrKey(at('Address')), address: at('Address'), ioAddress: Number(at('Address')), ioLoop: Number(at('Loop')), serial: at('Serial Number'), model: at('Model'), type: at('Device Type'), location: at('Message'), pers: at('Base Type') });
    });
    return records;
  }

  async function readPdf(buffer) {
    var lib = await ensurePdf();
    var doc = await lib.getDocument({ data: buffer, isEvalSupported: false }).promise;
    var text = '', ioRows = [], ioPages = 0;
    try {
      for (var i = 1; i <= doc.numPages; i++) {
        var page = await doc.getPage(i), content = await page.getTextContent();
        text += reconstructPage(content) + '\n';
        var rows = ioReportPage(content);
        if (rows) { ioRows.push(...rows); ioPages++; }
      }
      if (ioPages && ioPages !== doc.numPages) throw new Error('El reporte mezcla páginas de formatos distintos. No se ha incorporado.');
      return { text, ioRows: ioPages ? ioRows : null };
    } finally { await doc.destroy(); }
  }

  handleFile = function (file) {
    var epoch = queueEpoch;
    queue = queue.then(async function () {
      if (epoch !== queueEpoch) return;
      if (file.size > 20 * 1024 * 1024) throw new Error('El archivo supera el límite de 20 MB.');
      $('fileLoadStatus').textContent = 'Leyendo ' + file.name + '…';
      if (/\.sas$/i.test(file.name)) {
        var source = await SasMapping.read(await file.arrayBuffer(), file.name);
        if (epoch === queueEpoch) commitSas(source);
      } else if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        var result = await readPdf(await file.arrayBuffer());
        if (epoch !== queueEpoch) return;
        if (result.ioRows) {
          if (!sources().length) throw new Error('Para este reporte iO, carga primero el SAS; así se conserva el panel y loop de cada dispositivo.');
          upsertReport(result.ioRows); afterLoad(file.name, 'Reporte iO', result.ioRows.length + ' filas leídas');
        } else ingest(result.text, file.name);
      } else {
        var text = await file.text();
        if (epoch === queueEpoch) ingest(text, file.name);
      }
    }).catch(function (error) { alert('No se pudo incorporar ' + file.name + ': ' + error.message); }).finally(function () { $('fileLoadStatus').textContent = ''; });
    return queue;
  };

  window.cancelPendingLoads = function () { queueEpoch++; };
  window.sasRefresh = warnings;
  window.sasImportIdle = function () { return queue; };
  warnings();
})();
