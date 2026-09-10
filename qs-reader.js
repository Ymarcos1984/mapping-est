/* QuickStart: qualified panel/card addresses, complete reports and explicit Mapping.
 * XDU supplies inventory only: its stored topology can differ from the field PDF. */
(function (global) {
  'use strict';
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
  const projectKey = value => norm(value).toUpperCase();
  const key = row => 'qs:p' + row.panel + ':c' + row.card + ':a' + row.addr;
  const scope = row => 'qs:p' + row.panel + ':c' + row.card;
  const fail = message => { throw new Error('QS: ' + message); };
  function validateRows(rows, mapping) {
    if (!Array.isArray(rows) || !rows.length || rows.length > 10000) fail('cantidad de filas no válida.');
    const keys = new Set();
    rows.forEach(row => {
      if (!row || ![row.panel, row.card, row.addr].every(n => Number.isSafeInteger(n) && n > 0 && n <= 999) || row.addr > 250 ||
          ['serial', 'label', 'location', 'model', 'type'].some(field => typeof row[field] !== 'string') ||
          (row.serial && !/^\d{10}$/.test(row.serial))) fail('fila incompleta o dirección/serial no válido.');
      if (keys.has(key(row))) fail('dirección repetida en el mismo panel y tarjeta: ' + key(row) + '. No se han omitido filas.');
      keys.add(key(row));
    });
    if (mapping) {
      rows.forEach((row, index) => {
        if (!row.serial || !row.model || /no determinado/i.test(row.model) || row.order !== index || !(row.parent === null || typeof row.parent === 'string')) fail('Mapping incompleto.');
        if (row.parent && (!keys.has(row.parent) || row.parent === key(row) || !row.parent.startsWith(scope(row) + ':a'))) fail('conexión sin dirección única en su tarjeta.');
      });
      const positions = new Map(rows.map(row => [key(row), row.order]));
      if(rows.some(row=>row.parent&&positions.get(row.parent)>=row.order))fail('el orden del MD coloca un equipo antes de su conexión de origen.');
      const parents = new Map(rows.map(row => [key(row), row.parent]));
      rows.forEach(row => { const seen = new Set(); let at = key(row); while (at) { if (seen.has(at)) fail('Mapping con un ciclo.'); seen.add(at); at = parents.get(at); } });
    }
  }
  function validateSource(source, mapping) {
    if (!source || typeof source.project !== 'string' || !norm(source.project) || typeof source.filename !== 'string' || typeof source.version !== 'string') fail('falta identificar el proyecto.');
    validateRows(source.rows, mapping);
  }
  function validate(saved) {
    if (!saved.qs) return;
    const q = saved.qs;
    if (typeof q.project !== 'string' || !norm(q.project) || !Array.isArray(q.reports) || q.reports.length > 100) fail('sesión no válida.');
    for (const source of [q.mapping, q.inventory, ...q.reports].filter(Boolean)) {
      validateSource(source, source === q.mapping);
      if (projectKey(source.project) !== projectKey(q.project)) fail('la sesión mezcla proyectos.');
    }
    if (q.mapping) for (const row of q.mapping.rows) {
      const d = saved.dev && saved.dev[key(row)];
      if (!d || d.parent !== row.parent || d.mapOrder !== row.order || d.mserial !== row.serial || !d.inMap) fail('la sesión no conserva el Mapping original.');
    }
  }
  function rebuild(next) {
    const q = next.qs;
    if (!q) return;
    Object.keys(next.dev).forEach(k => { if (next.dev[k].sourceFamily === 'qs') delete next.dev[k]; });
    const add = row => {
      const k = key(row);
      return next.dev[k] || (next.dev[k] = {key:k, sourceFamily:'qs', scope:scope(row), scopeLabel:q.project + ' · Panel ' + row.panel + ' Card ' + row.card,
        panel:row.panel, loopnum:row.card, address:String(row.addr), label:'', location:'', model:'', mtype:'', serial:'', mserial:'', type:'',
        parent:null, children:0, depth:0, inMap:false, mapOrder:100000 + row.addr, pos:0});
    };
    if (q.inventory) q.inventory.rows.forEach(row => {
      const d = add(row); Object.assign(d, {label:row.label, location:row.location, model:row.model, type:row.type, serial:row.serial, serialSource:'project',
        qsInventorySerial:row.serial, mappingReview:'Inventario del XDU: sin conexión de Mapping confirmada.'});
    });
    if (q.mapping) q.mapping.rows.forEach(row => {
      const d = add(row); Object.assign(d, {label:row.label || d.label, mtype:row.model, model:row.model, serial:row.serial, mserial:row.serial,
        serialSource:'mapping', parent:row.parent, inMap:true, mapOrder:row.order, pos:row.order + 1, mappingReview:'', qsMapping:true});
    });
    const current = new Map();
    q.reports.forEach(report => {
      const groups = new Map(); report.rows.forEach(row => { const s=scope(row); if(!groups.has(s)) groups.set(s,[]); groups.get(s).push(row); });
      groups.forEach((rows, s) => current.set(s, {rows, filename:report.filename}));
    });
    current.forEach(({rows, filename}, s) => {
      const seen = new Set(); rows.forEach(row => {
        const d=add(row); seen.add(d.key);
        Object.assign(d,{label:row.label, location:row.location, type:row.type, rtype:row.type, serial:row.serial, reportSerial:row.serial,
          serialSource:'report', reportAddress:'P'+row.panel+'C'+row.card+':'+row.addr, reportLocation:row.location, reportLabel:row.label,
          qsReportFile:filename, reportMissing:false, qsReportOnly:!d.inMap});
        d.serialConflict=d.mserial && d.mserial!==row.serial ? 'Serial actualizado con el reporte; se conserva el original del Mapping.' : '';
        if(!d.inMap) d.mappingReview='Presente en el reporte, sin conexión confirmada en el Mapping.';
      });
      Object.values(next.dev).filter(d=>d.sourceFamily==='qs' && d.scope===s && !seen.has(d.key)).forEach(d=>{
        d.reportMissing=true; d.mappingReview='Ausente del reporte seleccionado; serial anterior solo como referencia.';
      });
    });
    Object.values(next.dev).filter(d=>d.sourceFamily==='qs').forEach(d=>{if(d.parent){next.dev[d.parent].children++;let at=d.parent;while(at){d.depth++;at=next.dev[at].parent;}}});
    next.hasMapping=Object.values(next.dev).some(d=>d.inMap); next.hasTtap=Object.values(next.dev).some(d=>d.children>1);
  }
  function commit(kind, source) {
    validateSource(source, kind === 'mapping');
    const previous=state, next=JSON.parse(JSON.stringify(state));
    if(next.qs && projectKey(next.qs.project)!==projectKey(source.project)) fail('este archivo pertenece a otro proyecto. Guarda la sesión y abre una nueva.');
    if(!next.qs && Object.values(next.dev).some(d=>d.inMap&&!d.sourceFamily&&!d.sasId)) fail('hay un Mapping antiguo sin identidad de panel/tarjeta. Guarda esa sesión y abre una nueva para QS.');
    const q=next.qs||(next.qs={project:source.project, mapping:null, inventory:null, reports:[]});
    if(kind==='report') q.reports=q.reports.filter(r=>r.filename!==source.filename).concat([source]);
    else q[kind]=source;
    rebuild(next); next.meta.project=next.meta.project||source.project;
    next.sources=[...new Set(next.sources.concat(['QS '+(kind==='mapping'?'Mapping':kind==='inventory'?'XDU inventario':'reporte')+' · '+source.filename]))];
    state=next;
    try { rebuildOrder(); localStorage.setItem(STORE_KEY,JSON.stringify(state)); } catch(error) {state=previous;throw error;}
    afterLoad(source.filename,'QS',source.rows.length+' direcciones leídas');
  }
  function notice(saved) {
    if(!saved.qs)return '';
    const all=Object.values(saved.dev).filter(d=>d.sourceFamily==='qs'), mapped=all.filter(d=>d.inMap);
    return 'QS: '+all.length+' direcciones · '+mapped.length+' en Mapping · '+all.filter(d=>d.serialSource==='report').length+' con serial del reporte · '+mapped.filter(d=>d.children>1).length+' T-taps.'+
      (all.some(d=>!d.inMap)?' Los equipos sin Mapping no tienen conexiones asignadas.':'')+
      (all.some(d=>d.reportMissing)?' Hay equipos ausentes del reporte; sus seriales anteriores son solo referencia.':'');
  }
  function readMd(text, filename) {
    if(/mapping-unverified|mapping_(?:campos|conexiones)_dudosas:\s*[1-9]/i.test(text)) fail('el MD contiene campos o conexiones pendientes de revisión. No se cargó para evitar perder o confundir equipos. Revisa el Mapping contra el PDF original.');
    const project=/^proyecto:\s*(.+)$/mi.exec(text), card=/^##\s+Card\s+(\d+):(\d+)\s*$/mi.exec(text);
    if(!project||!card||(text.match(/^##\s+Card\b/gmi)||[]).length!==1)fail('el MD necesita proyecto y una única sección Card panel:tarjeta.');
    let projectName=project[1].trim(); if(projectName.startsWith('"')){try{projectName=JSON.parse(projectName);}catch(e){fail('nombre de proyecto no válido.');}}
    const rows=[];
    for(const line of text.split(/\r?\n/)){
      if(!/^\s*\|\s*Ramal\s+\d+/i.test(line))continue;
      const cells=line.split('|').map(s=>s.trim()), addr=Number(cells[4]), parent=/^direcci[oó]n\s+(\d+)$/i.exec(cells[3]);
      if(cells.length<11 || !/^\d+$/.test(cells[4]) || (!parent&&!/^Card\s+\d+:\d+$/i.test(cells[3])))fail('fila o conexión de MD incompleta.');
      const row={panel:Number(card[1]),card:Number(card[2]),addr,serial:cells[8],model:cells[6],label:/^no determinado$/i.test(cells[5])?'':cells[5],location:'',type:'',order:rows.length,parent:null};
      if(parent)row.parent=key({...row,addr:Number(parent[1])});
      else if(cells[3].replace(/\s/g,'').toLowerCase()!==('Card'+card[1]+':'+card[2]).toLowerCase())fail('raíz de otra tarjeta en el MD.');
      rows.push(row);
    }
    const declared=/^mapping_dispositivos:\s*(\d+)\s*$/mi.exec(text);
    if(!declared||Number(declared[1])!==rows.length)fail('el recuento del MD no coincide con sus filas.');
    const source={project:projectName,filename,version:'qs-md',rows};validateSource(source,true);return source;
  }
  function points(page, content, lib) {
    const viewport=page.getViewport({scale:1,rotation:0});
    return content.items.filter(i=>i.str&&i.str.trim()).map(i=>{const t=lib.Util.transform(viewport.transform,i.transform);return {text:norm(i.str),x:t[4],y:t[5],font:i.fontName};});
  }
  function readTextReport(text, filename) {
    const title=text.split(/\r?\n/).map(line=>/^(.+?)\s+Version\s+([\d.]+)\s*$/.exec(line.trim())).find(Boolean);
    if(!title)fail('el reporte de texto no identifica el proyecto. Carga el PDF original.');
    const rows=[];let section=null;
    for(const line of text.split(/\r?\n/)){
      const heading=/^(Detectors|Modules) for Panel\s+(\d+)\s+Card\s+(\d+)/i.exec(line.trim());
      if(heading){section=heading;continue;}
      if(!/^\s*\d+\s+\d+\s+\d+\b/.test(line))continue;
      const cells=line.split('\t').map(s=>s.trim());
      if(cells.length<6||!section||!cells.slice(0,3).every(s=>/^\d+$/.test(s)))fail('columnas de texto ambiguas. Carga el reporte PDF original.');
      const serial=/^(\d{10})(?:\s|a|$)/.exec(cells[5]);
      if(!serial||Number(cells[0])!==Number(section[2])||Number(cells[1])!==Number(section[3]))fail('fila de texto incompleta o de otra tarjeta.');
      rows.push({panel:Number(cells[0]),card:Number(cells[1]),addr:Number(cells[2]),serial:serial[1],label:cells[3],location:cells[4],model:'',type:/^Detectors$/i.test(section[1])?'Detector':'Module'});
    }
    if(rows.length!==(text.match(/\b\d{10}(?=\s|a|$)/g)||[]).length)fail('el texto contiene seriales sin una fila completa. Carga el PDF original.');
    const source={project:title[1],version:title[2],filename,rows};validateSource(source,false);return source;
  }
  function lines(items) {
    const out=[];for(const item of [...items].sort((a,b)=>a.y-b.y||a.x-b.x)){let row=out.find(r=>Math.abs(r.y-item.y)<2);if(!row){row={y:item.y,items:[]};out.push(row);}row.items.push(item);}
    return out.map(r=>({y:r.y,text:r.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' ')}));
  }
  async function readReport(doc, lib, filename) {
    if(doc.numPages>200)fail('el reporte supera 200 páginas.');
    const rows=[];let columns=null, project='',version='',section='';
    for(let n=1;n<=doc.numPages;n++){
      const page=await doc.getPage(n),items=points(page,await page.getTextContent(),lib), textLines=lines(items);
      if(!textLines.some(l=>/Signature Series Barcode Report/i.test(l.text)))fail('página '+n+' de otro tipo de reporte.');
      const title=textLines.map(l=>/^(.+?)\s+Version\s+([\d.]+)$/.exec(l.text)).find(Boolean);
      if(!title || project&&projectKey(title[1])!==projectKey(project) || version&&version!==title[2])fail('proyecto o versión cambia entre páginas.');
      project=title[1];version=title[2];
      const headerNames=['Panel','Card','Address','Text 1','Text 2','Serial Number'];
      const header=headerNames.map(h=>items.find(i=>i.text===h));
      if(header.every(Boolean)){
        if(header.some(h=>Math.abs(h.y-header[0].y)>2))fail('encabezado de columnas no compatible.');
        columns=header.map(h=>h.x);
      }
      if(!columns)fail('faltan las columnas del reporte.');
      const anchors=items.filter(i=>Math.abs(i.x-columns[0])<8&&/^\d{1,3}$/.test(i.text)).sort((a,b)=>a.y-b.y);
      const numericSerials=items.filter(i=>i.x>=columns[5]-3&&/^\d{10}$/.test(i.text));
      if(!anchors.length || anchors.length!==numericSerials.length)fail('página '+n+': hay filas sin serial o seriales sin fila.');
      for(const [anchorIndex,anchor] of anchors.entries()){
        const sections=textLines.filter(l=>l.y<anchor.y&&/^(Detectors|Modules) for Panel\s+\d+\s+Card\s+\d+/i.test(l.text));
        if(sections.length)section=sections[sections.length-1].text;
        const identity=/^(Detectors|Modules) for Panel\s+(\d+)\s+Card\s+(\d+)/i.exec(section);
        if(!identity)fail('falta la sección de detector/módulo.');
        const near=items.filter(i=>Math.abs(i.y-anchor.y)<3);
        const top=anchorIndex?(anchors[anchorIndex-1].y+anchor.y)/2:anchor.y-12;
        const bottom=anchorIndex+1<anchors.length?(anchor.y+anchors[anchorIndex+1].y)/2:anchor.y+12;
        const textBand=items.filter(i=>i.y>top&&i.y<bottom&&!header.some(h=>h&&Math.abs(h.y-i.y)<2));
        const cell=(idx)=>(idx===3||idx===4?textBand:near).filter(i=>i.x>=columns[idx]-8&&i.x<(columns[idx+1]||Infinity)-8).sort((a,b)=>Math.abs(a.y-b.y)<2?a.x-b.x:a.y-b.y).map(i=>i.text).join(' ');
        const panel=cell(0),card=cell(1),addr=cell(2),serial=near.filter(i=>i.x>=columns[5]-3&&/^\d{10}$/.test(i.text));
        if(![panel,card,addr].every(v=>/^\d+$/.test(v))||serial.length!==1||Number(panel)!==Number(identity[2])||Number(card)!==Number(identity[3]))fail('fila incompleta o fuera de su panel/tarjeta en página '+n+'.');
        if(!cell(3)&&!cell(4))fail('faltan los textos de una fila en página '+n+'.');
        rows.push({panel:Number(panel),card:Number(card),addr:Number(addr),serial:serial[0].text,label:cell(3),location:cell(4),model:'',type:/^Detectors/i.test(section)?'Detector':'Module'});
      }
    }
    const source={project,version,filename,rows};validateSource(source,false);return source;
  }
  const schemas={
    'project.db':{count:24,fields:{0:[1,20]}},
    'sensor.db':{count:26,fields:{0:[3,2],1:[3,2],2:[3,2],3:[1,10],4:[3,2],5:[1,16],6:[1,16]}},
    'module.db':{count:23,fields:{0:[3,2],1:[3,2],2:[3,2],3:[1,10],5:[3,2],6:[1,16],7:[1,16]}},
    'actualsensor.db':{count:25,fields:{0:[3,2],1:[3,2],2:[3,2],6:[3,2]}},
    'actualmodule.db':{count:22,fields:{0:[3,2],1:[3,2],2:[3,2],6:[3,2]}}
  };
  function records(bytes,name){
    const schema=schemas[name];if(!schema||bytes.length<120)fail('tabla XDU incompleta.');
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),size=v.getUint16(0,true),header=v.getUint16(2,true),block=bytes[5]*1024,count=v.getUint32(6,true),nf=v.getUint16(33,true);
    if(nf!==schema.count||header<120+2*nf||header>bytes.length||!block||!size||(bytes.length-header)%block||count>10000)fail('esquema XDU no comprobado: '+name+'.');
    const fields=Array.from({length:nf},(_,i)=>[bytes[120+2*i],bytes[121+2*i]]);
    if(fields.reduce((n,f)=>n+f[1],0)!==size||size>block-6||Object.entries(schema.fields).some(([i,f])=>fields[i][0]!==f[0]||fields[i][1]!==f[1]))fail('columnas XDU distintas de las verificadas.');
    const out=[];for(let b=header;b<bytes.length;b+=block){const used=v.getInt16(b+4,true);if(used<0)continue;if(used%size||6+used+size>block)fail('bloque Paradox truncado.');
      for(let r=0;r<=used/size;r++){let p=b+6+r*size;out.push(fields.map(([type,len])=>{const d=bytes.subarray(p,p+len);p+=len;if(type===3){const n=d[0]*256+d[1];return n?n-32768:null;}if(type===1)return String.fromCharCode(...d).replace(/\0+$/,'').trim();return null;}));}
    }if(out.length!==count)fail('recuento de registros XDU incorrecto.');return out;
  }
  async function readXdu(buffer,filename){
    SasMapping.checkZip(buffer);const zip=await JSZip.loadAsync(buffer,{checkCRC32:true}),names=new Map();
    for(const name of Object.keys(zip.files)){const lower=name.toLowerCase();if(names.has(lower))fail('tabla repetida en el XDU.');names.set(lower,name);}
    const table=async name=>{if(!names.has(name))fail('falta '+name+' en el XDU.');return records(await zip.file(names.get(name)).async('uint8array'),name);};
    const project=await table('project.db');if(project.length!==1||!project[0][0])fail('proyecto XDU no identificado.');
    const rows=[];
    for(const kind of ['sensor','module']){
      const data=await table(kind+'.db'),actual=names.has('actual'+kind+'.db')?await table('actual'+kind+'.db'):[],byKey=new Map();
      actual.forEach(r=>{const k=r.slice(0,3).join(':');if(byKey.has(k))fail('dirección repetida en la capa leída del XDU.');byKey.set(k,r);});
      const models=kind==='sensor'?{2:'SIGA-PS',4:'SIGA-HFS',5:'SIGA-HRS',12:'SIGA-IM'}:{6:'SIGA-CT1',7:'SIGA-CT2',8:'SIGA-CC1S',10:'SIGA-CR',17:'SIGA-278',21:'SIGA-278',23:'SIGA-WTM',27:'SIGA-CC1S'};
      data.forEach(r=>{const act=byKey.get(r.slice(0,3).join(':'));rows.push({panel:r[0],card:r[1],addr:r[2],serial:/^0+$/.test(r[3])?'':r[3],label:r[kind==='sensor'?5:6],location:r[kind==='sensor'?6:7],model:act?models[act[6]]||'':'',type:kind==='sensor'?'Detector':'Module'});});
    }
    const source={project:project[0][0],version:'qs-xdu-inventory',filename,rows};validateSource(source,false);return source;
  }
  global.QsReader={key,scope,validate,validateRows,validateSource,rebuild,commit,notice,readMd,readReport,readTextReport,readXdu,records};
})(window);
