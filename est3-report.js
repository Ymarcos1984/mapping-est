/* EST3 worksheet context and conservative enrichment of the drawn Mapping. */
(function (global) {
  'use strict';
  const norm = value => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();

  function pageText(content, columns) {
    const items=content.items.filter(it => typeof it.str==='string' && it.str.trim());
    for (const name of ['Location','Model','Device Address','Serial Number']) {
      const header=items.find(it=>it.str.trim()===name);
      if(header)columns[name]=header.transform[4];
    }
    if(Object.keys(columns).length!==4)throw new Error('El reporte EST3 no identifica todas las columnas.');
    const boundaries=Object.values(columns).sort((a,b)=>a-b),rows=[];
    for(const item of items){
      const y=Math.round(item.transform[5]);let row=rows.find(r=>Math.abs(r.y-y)<=3);
      if(!row){row={y,items:[]};rows.push(row);}row.items.push(item);
    }
    return rows.sort((a,b)=>b.y-a.y).map(row=>{
      let text='',previous=null;
      for(const item of row.items.sort((a,b)=>a.transform[4]-b.transform[4])){
        const x=item.transform[4],column=boundaries.filter(b=>x>=b-2).length;
        if(previous){const gap=x-previous.right;text+=column!==previous.column||gap>18?'\t':gap>1?' ':'';}
        text+=item.str;previous={right:x+item.width,column};
      }
      return text;
    }).join('\n');
  }

  function worksheetRows(text) {
    const rows = []; let block = [];
    for (const line of text.split('\n')) {
      if (!line.trim() || isReportSkip(line)) continue;
      const cells = line.split('\t').map(s => s.trim()).filter(Boolean);
      block.push(cells);
      const address = /\b(\d{8})\b/.exec(line), serial = /\b(\d{10})\b/.exec(line);
      if (!address || !serial) continue;
      const first = block[0], typeIndex = block.findIndex((c, i) => i > 0 && (isTypeLine(c) || /\bBase\b/i.test(c[1] || '')));
      if (first.length < 3 || typeIndex < 0) throw new Error('Fila EST3 sin etiqueta, modelo o tipo verificable.');
      const location = [first[1]].concat(block.slice(1, typeIndex).map(c => c.join(' '))).join(' ').trim();
      rows.push({ label: first[0], location, model: first[2], type: block[typeIndex][0], pers: cleanPers(block[typeIndex][1]), address: address[1], serial: serial[1], key: addrKey(address[1]) });
      block = [];
    }
    if (block.length) throw new Error('Fila incompleta al final de una página del reporte EST3.');
    return rows;
  }

  function read(pages, id, filename) {
    let context = null, loop = null;
    const rows = [];
    for (const text of pages) {
      const header = text.match(/Project:\s*(.*?)\s+Version:.*?Cabinet:\s*(.*?)\s+3-[\w-]+:\s*(.*?)\s+EST3 System/);
      if (!header) throw new Error('El reporte EST3 tiene una página sin proyecto y controlador. No se incorporó parcialmente.');
      const next = { project: header[1].trim(), cabinet: header[2].trim(), controller: header[3].trim() };
      if (!context || JSON.stringify(context) !== JSON.stringify(next)) loop = null;
      context = next;
      const parts = text.split(/((?:Detectors|Modules) \(Loop \d+\))/);
      for (const part of parts) {
        const section = /^(?:Detectors|Modules) \(Loop (\d+)\)$/.exec(part);
        if (section) { loop = Number(section[1]); continue; }
        const parsed = worksheetRows(part);
        const addresses = [...part.matchAll(/\b\d{8}\b/g)].length;
        if (parsed.length !== addresses || parsed.some(r => !/^\d{8}$/.test(r.address) || !/^\d{10}$/.test(r.serial))) {
          throw new Error('Hay filas del reporte EST3 que no se pudieron leer completas. Conserva el PDF para revisarlo.');
        }
        if (parsed.length && !loop) throw new Error('El reporte no identifica el loop de sus primeras filas.');
        rows.push(...parsed.map(row => Object.assign(row, context, { reportLoop: loop })));
      }
    }
    if (!rows.length || rows.length > 10000) throw new Error('Cantidad de filas del reporte EST3 no admitida.');
    return { id, filename, rows };
  }

  function validate(reports) {
    if (!Array.isArray(reports) || reports.length > 100) throw new Error('Lista de reportes EST3 no válida.');
    for (const report of reports) {
      if (!report || !/^[a-f0-9]{64}$/.test(report.id) || typeof report.filename !== 'string' || !Array.isArray(report.rows) || report.rows.length > 10000) throw new Error('Reporte EST3 de sesión no válido.');
      for (const row of report.rows) {
        if (!row || !Number.isSafeInteger(row.reportLoop) || row.reportLoop < 1 || !/^\d{8}$/.test(row.address) || !/^\d{10}$/.test(row.serial) || ['project','cabinet','controller','label','location','model','type','pers'].some(k => typeof row[k] !== 'string')) throw new Error('Fila EST3 de sesión no válida.');
      }
    }
  }

  function enrich(state) {
    const reports = state.est3Reports || [], sources = (state.sasSources || []).filter(s => s.family === 'est3');
    // Each newly loaded report replaces the previous snapshot for the loops it contains.
    const currentLoops = new Map();
    for (const report of reports) {
      const groups = new Map();
      for (const row of report.rows) {
        const key = JSON.stringify([norm(row.project), norm(row.cabinet), norm(row.controller), row.reportLoop]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }
      groups.forEach((rows, key) => currentLoops.set(key, rows));
    }
    const currentRows = [...currentLoops.values()].flat();
    sources.filter(s => s.projectUnspecified).forEach(s => {
      const projects = new Set(currentRows.filter(row => s.loops.some(lp => norm(lp.cabinet) === norm(row.cabinet) && norm(lp.controller) === norm(row.controller))).map(row => norm(row.project)));
      s.reportProject = projects.size === 1 ? [...projects][0] : '';
    });
    Object.keys(state.dev).forEach(k => { if (state.dev[k].est3ReportOnly) delete state.dev[k]; });
    Object.values(state.dev).filter(d => d.sourceFamily === 'est3').forEach(d => {
      d.serial = d.importedReportSerial || ''; d.serialPartial = !d.serial; d.serialConflict = '';
      d.serialSource = d.serial ? 'report' : 'mapping';
      d.reportMissing = false;
      d.location = ''; d.reportLocation = ''; d.reportAddress = ''; d.reportSerial = '';
    });
    const assignments = new Map(), pending = [], coveredScopes = new Set();
    for (const row of currentRows) {
      const possible = sources.filter(s => norm(s.projectUnspecified ? s.reportProject : s.obra) === norm(row.project) && s.loops.some(lp => norm(lp.cabinet) === norm(row.cabinet) && norm(lp.controller) === norm(row.controller)));
      if (possible.length !== 1) { pending.push(row); continue; }
      const source = possible[0];
      const loops = source.loops.filter(lp => norm(lp.cabinet) === norm(row.cabinet) && norm(lp.controller) === norm(row.controller) && lp.loopnum === row.reportLoop);
      if (loops.length > 1) { pending.push(row); continue; }
      const lp = loops[0], address = Number(row.address.slice(-4));
      const scope = lp ? SasMapping.scope(source, lp) : 'est3:' + source.id + ':report:' + encodeURIComponent(row.cabinet + '/' + row.controller + '/' + row.reportLoop);
      if(lp)coveredScopes.add(scope);
      const key = scope + ':a' + address;
      if (!assignments.has(key)) assignments.set(key, []);
      assignments.get(key).push({ row, source, scope, lp });
    }
    for (const [key, matches] of assignments) {
      // Conflicting duplicate rows inside the same current report remain ambiguous.
      if (new Set(matches.map(m => m.row.serial)).size !== 1) {
        if (state.dev[key]) state.dev[key].serialConflict = 'Los reportes contienen seriales diferentes para esta dirección. Verifica el serial físico y usa el reporte de la revisión correcta.';
        continue;
      }
      const { row, source, scope, lp } = matches[matches.length - 1];
      let device = state.dev[key];
      if (device && device.serialConflict) continue;
      if (!device) {
        device = state.dev[key] = { key, sasId: source.id, sourceFamily: 'est3', scope, scopeLabel: source.obra + ' · ' + row.cabinet + ' / ' + row.controller + ' / Loop Number ' + row.reportLoop,
          panel: lp ? lp.panel : 0, loopnum: row.reportLoop, address: String(Number(row.address.slice(-4))), label: row.label, location: '', model: row.model, mtype: '', mserial: '',
          parent: null, children: 0, depth: 0, pos: 0, mapOrder: 100000 + Number(row.address.slice(-4)), inMap: false, est3ReportOnly: true };
      }
      device.serial = row.serial; device.serialPartial = false;
      device.serialSource = 'report';
      if (device.inMap && !row.serial.endsWith(device.mserial)) {
        device.serialConflict = 'Serial actualizado con el reporte. El serial anterior del Mapping se conserva como referencia.';
      }
      device.type = device.type || row.type; device.rtype = row.type; device.pers = row.pers;
      device.reportLocation = row.location; device.location = row.location || device.location;
      device.reportAddress = row.address;
      device.reportSerial = row.serial;
    }
    state.est3PendingCount = pending.length;
    Object.values(state.dev).filter(d=>d.inMap && coveredScopes.has(d.scope) && !d.reportSerial && !d.serialConflict).forEach(d=>{d.reportMissing=true;d.serial='';d.serialPartial=true;d.serialSource='mapping';});
    state.est3ReportNotice = noticeFor(state, 0);
  }
  function noticeFor(state, scope) {
    if (!(state.est3Reports || []).length) return '';
    const records = Object.values(state.dev).filter(d => d.sourceFamily === 'est3' && (!scope || d.scope === scope));
    const linked = records.filter(d => d.inMap && d.serial).length, extra = records.filter(d => d.est3ReportOnly).length;
    const conflicts = records.filter(d => d.serialConflict).length;
    const missing = records.filter(d => d.reportMissing).length;
    return 'Reporte EST3: ' + linked + ' seriales completados · ' + extra + ' dispositivos solo en reporte.' +
      (conflicts ? ' ' + conflicts + ' seriales distintos del Mapping; se usa el reporte.' : '') +
      (missing ? ' ' + missing + ' del mapa no aparecen en el reporte cargado.' : '') +
      (!scope && state.est3PendingCount ? ' ' + state.est3PendingCount + ' filas pendientes de un Mapping único del mismo proyecto y controlador.' : '');
  }
  global.Est3Report = { read, validate, enrich, noticeFor, pageText };
})(window);
