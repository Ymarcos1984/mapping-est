/* iO SAS reader. Port of the supplied sas_mapping_min.py; no network or OCR. */
(function (global) {
  'use strict';
  const MAX_FILE = 20 * 1024 * 1024;
  const MAX_XML = 12 * 1024 * 1024;

  function checkZip(buffer) {
    if (buffer.byteLength > MAX_FILE) throw new Error('El SAS supera el límite de 20 MB.');
    const view = new DataView(buffer);
    let end = -1;
    for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === view.byteLength) { end = i; break; }
    }
    if (end < 0) throw new Error('El archivo no es un SAS/ZIP completo.');
    const count = view.getUint16(end + 10, true);
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count > 2000) throw new Error('El SAS usa un ZIP no admitido.');
    let offset = view.getUint32(end + 16, true), total = 0;
    const names = new Set();
    for (let i = 0; i < count; i++) {
      if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error('El índice del SAS está dañado.');
      const size = view.getUint32(offset + 24, true);
      total += size;
      if (size > MAX_XML || total > 80 * 1024 * 1024) throw new Error('El contenido descomprimido del SAS es demasiado grande.');
      if (view.getUint16(offset + 8, true) & 1) throw new Error('No se admiten SAS cifrados.');
      const length = view.getUint16(offset + 28, true);
      if (offset + 46 + length > end) throw new Error('Nombre de archivo incompleto en el SAS.');
      const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 46, length));
      if (name.split('/').includes('..') || name.includes('\\') || name.startsWith('/') || name.includes(':') || names.has(name.toLowerCase())) throw new Error('El SAS contiene rutas inseguras o entradas repetidas.');
      names.add(name.toLowerCase());
      offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    }
    if (offset > end) throw new Error('El índice del SAS está incompleto.');
  }

  function number(value, field) {
    const text = String(value == null ? '' : value).trim() || '0';
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error('Valor inválido en ' + field + ': ' + text);
    return Number(text);
  }

  function buildTree(devices, title, warnings) {
    const byAddress = new Map(), children = new Map(), roots = [];
    devices.forEach(function (device) {
      if (!device.addr || byAddress.has(device.addr)) throw new Error(title + ': dirección vacía o repetida ' + device.addr + '. No se incorporó el archivo.');
      byAddress.set(device.addr, device); children.set(device.addr, []);
    });
    devices.forEach(function (device) {
      if (device.next && device.next !== device.addr && byAddress.has(device.next)) children.get(device.next).push(device.addr);
      else {
        roots.push(device.addr);
        if (device.next) warnings.push(title + ': dirección ' + device.addr + ' con padre ausente o igual a sí misma (' + device.next + '); queda como raíz para revisar.');
      }
    });
    const sort = (a, b) => byAddress.get(a).level - byAddress.get(b).level || a - b;
    children.forEach(list => list.sort(sort)); roots.sort(sort);
    const order = [], depth = new Map(), visited = new Set();
    const stack = roots.slice().reverse().map(address => [address, 0]);
    while (stack.length) {
      const [address, level] = stack.pop();
      if (visited.has(address)) throw new Error(title + ': conexión cíclica. Revise el mapa antes de incorporarlo.');
      visited.add(address); order.push(address); depth.set(address, level);
      children.get(address).slice().reverse().forEach(child => stack.push([child, level + 1]));
    }
    if (visited.size !== devices.length) throw new Error(title + ': hay un ciclo sin raíz. No se incorporó el archivo.');
    return { roots, children, byAddress, order, depth, taps: devices.filter(d => children.get(d.addr).length > 1).length };
  }

  function parsePanel(xml, panel, warnings) {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('El XML del SAS contiene declaraciones no admitidas.');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror') || doc.documentElement.nodeName !== 'SASPanel') throw new Error('PANEL' + panel + '.XML no es un panel iO válido.');
    const loops = [];
    for (const element of doc.getElementsByTagName('Loop')) {
      const rows = [...element.getElementsByTagName('Detector')].map(e => ['det', e]).concat([...element.getElementsByTagName('Module')].map(e => ['mod', e]));
      if (!rows.length) continue;
      const loopnum = number(element.getAttribute('Num'), 'Loop.Num');
      const title = 'PANEL ' + panel + ' Loop ' + loopnum;
      if (!loopnum || loops.some(lp => lp.loopnum === loopnum)) throw new Error('Loop inválido o duplicado en PANEL ' + panel + '.');
      const mapped = (element.getAttribute('Mapping') || '').trim().toLowerCase() === 'yes';
      const devices = rows.map(function ([kind, e]) {
        let serial = (e.getAttribute('SerialNumber') || '').replace(/\D/g, '');
        if (/^0+$/.test(serial)) serial = '';
        return {
          addr: number(e.getAttribute('Address'), 'Address'), kind,
          model: (e.getAttribute('Model') || '').replace(/_/g, '-').trim(), serial,
          label: (e.getAttribute('MessageLine1') || '').trim(), location: (e.getAttribute('MessageLine2') || '').trim(),
          next: number(e.getAttribute('NextAddr'), 'NextAddr'), level: number(e.getAttribute('level'), 'level')
        };
      });
      if (!mapped) warnings.push('PANEL' + panel + ' Loop ' + loopnum + ': el XML no declara Mapping="Yes" — el encadenado puede estar incompleto');
      if (devices.length > 10000) throw new Error('Demasiados dispositivos en ' + title + '.');
      buildTree(devices, title, warnings);
      loops.push({ title, panel, loopnum, mapped, devices });
    }
    return { obra: (doc.documentElement.getAttribute('BannerLine1') || '').trim(), loops };
  }

  async function read(buffer, filename) {
    checkZip(buffer);
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files);
    if (names.some(n => n.includes('..') || n.includes('\\') || n.startsWith('/') || n.includes(':'))) throw new Error('El SAS contiene rutas no admitidas.');
    const versions = [...new Set(names.filter(n => /\/PANEL\d+\.XML$/i.test(n)).map(n => n.split('/')[0]))].sort();
    if (!versions.length) throw new Error('No parece un SAS iO: faltan PANELn.XML.');
    const version = versions[versions.length - 1], warnings = [], loops = [], panels = new Set();
    let obra = '';
    for (const name of names.sort()) {
      const parts = name.split('/');
      const match = parts.length === 2 && parts[0] === version && /^PANEL(\d+)\.XML$/i.exec(parts[1]);
      if (!match) continue;
      const panel = number(match[1], 'Panel');
      if (!panel || panels.has(panel)) throw new Error('Panel repetido o inválido en el SAS.');
      panels.add(panel);
      const xml = await zip.file(name).async('string');
      if (xml.length > MAX_XML) throw new Error('El XML del panel es demasiado grande.');
      const parsed = parsePanel(xml, panel, warnings);
      obra = obra || parsed.obra; loops.push(...parsed.loops);
    }
    if (!loops.length) throw new Error('El proyecto iO no contiene dispositivos.');
    if (loops.reduce((n, lp) => n + lp.devices.length, 0) > 10000) throw new Error('El proyecto supera 10.000 dispositivos.');
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const id = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
    return { id, family: 'io', obra: obra || 'PROYECTO iO', filename, version, loops, warnings };
  }

  function scope(source, loop) { return /^est[23]$/.test(source.family) ? source.family + ':' + source.id + ':g' + loop.scopeId : 'sas:' + source.id + ':p' + loop.panel + ':l' + loop.loopnum; }
  function key(source, loop, address) { return scope(source, loop) + ':a' + address; }

  function loopTree(loop) {
    const tree=buildTree(loop.devices,loop.title,[]);
    if(loop.order){
      if(!Array.isArray(loop.order)||loop.order.length!==tree.order.length||new Set(loop.order).size!==tree.order.length||loop.order.some(a=>!tree.byAddress.has(a)))throw new Error('Orden del Mapping no válido.');
      tree.order=loop.order.slice();
    }
    return tree;
  }

  function flatten(source) {
    const result = [];
    source.loops.forEach(function (loop) {
      const tree = loopTree(loop);
      tree.order.forEach(function (address, i) {
        const d = tree.byAddress.get(address);
        result.push({
          key: key(source, loop, address), sasId: source.id, scope: scope(source, loop), scopeLabel: source.obra + ' · ' + loop.title,
          panel: loop.panel, loopnum: loop.loopnum, address: String(address), label: d.label, location: d.location, sourceLocation: d.location || '', projectOnly: !!d.projectOnly,
          model: d.model, mtype: d.model, serial: source.family === 'est3' && source.version!=='est3-sdu' ? '' : d.serial, mserial: d.serial,
          sourceFamily: source.family, sourceVersion: source.version, serialPartial: source.family === 'est3' && source.version!=='est3-sdu', type: d.type || '', pers: d.base || '',
          importedReportSerial: d.reportSerial || '',
          mappingFieldReview: (d.review || []).join(', '), rawMappingAddress: d.rawAddress || '',
          parent: d.next && d.next !== address && tree.byAddress.has(d.next) ? key(source, loop, d.next) : null,
          children: tree.children.get(address).length, depth: tree.depth.get(address), pos: i + 1, mapOrder: i,
          inMap: loop.mapped && !d.projectOnly, mappingReview: !loop.mapped || !!d.projectOnly
        });
      });
    });
    return result;
  }

  function cell(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/\|/g, '&#124;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\n]+/g, ' ');
  }

  function markdown(source, loop, records) {
    const tree = loopTree(loop);
    const project=/-sdu$/.test(source.version);
    const vector = /^est[23]$/.test(source.family)&&!project;
    const lines = ['---', 'origen: ' + JSON.stringify(source.filename), 'tipo: ' + (vector ? 'MAPPING ' + source.family.toUpperCase() + ' (conexiones del dibujo vectorial)' : 'PROYECTO '+source.family.toUpperCase()+' (mapa leído de los datos, sin OCR)'),
      'mapping_variante: ' + (vector ? source.family+'-vector' : 'proyecto-'+source.family), 'mapping_dispositivos: ' + loop.devices.length, 'mapping_t_taps: ' + tree.taps,
      ...(loop.identityKnown===false ? ['identidad: controlador sin numero declarado en el Mapping'] : ['panel: '+loop.panel,'loop: '+loop.loopnum]), 'mapping_declarado: ' + loop.mapped, 'generador: Mapping EST PWA v9.3 EST2/EST3 SDU', '---', '',
      '# ' + cell(source.obra), '', '## ' + loop.title, ''];
    source.warnings.filter(w => !records || !/últimos 4 dígitos/.test(w)).forEach(w => lines.push('> REVISAR: ' + cell(w), ''));
    if (records) lines.push('El orden y las conexiones provienen del Mapping. La columna Serial usa el reporte cuando está disponible; Serial Mapping conserva la referencia original.', '');
    lines.push('| Ramal | Posición | Proviene de | Dirección | Etiqueta | Modelo | Base | Serial | Página | Mensaje | Serial Mapping |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    const branchByAddress = new Map(), posByBranch = new Map(); let branchCount = 0;
    tree.order.forEach(function (address) {
      const d = tree.byAddress.get(address);
      const isChild = d.next && d.next !== address && tree.byAddress.has(d.next);
      const branch = isChild && tree.children.get(d.next).length === 1 ? branchByAddress.get(d.next) : ++branchCount;
      branchByAddress.set(address, branch);
      const position = (posByBranch.get(branch) || 0) + 1; posByBranch.set(branch, position);
      const parent = isChild ? 'dirección ' + d.next : d.projectOnly||d.review&&d.review.some(r=>/^padre /.test(r)) ? 'sin dato de mapa' : loop.title;
      const current = records && records[key(source, loop, address)];
      const serial = current && current.serialSource==='report' ? current.serial||'no indicado en el reporte' : current&&current.serial||d.serial||'no determinado';
      lines.push('| ' + ['Ramal ' + branch, position, parent, d.addr, d.label || 'no determinado', d.model || 'no determinado', d.base || '', serial, d.page || '', current && current.location || d.location, d.serial].map(cell).join(' | ') + ' |');
    });
    lines.push('', 'Las direcciones de este documento pertenecen únicamente a ' + loop.title + '.', '');
    return lines.join('\n');
  }

  global.SasMapping = { read, checkZip, parsePanel, buildTree, flatten, markdown, scope, key };
})(window);
