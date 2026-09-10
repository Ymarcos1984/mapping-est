/* EST3 vector grid: port of signature_mapping.py's EST3 geometry.
   PDF.js supplies positioned text and drawing operators, never inferred wiring. */
(function (global) {
  'use strict';
  const W = 84, H = 117, X0 = 78, Y0 = 147, FIELD_Y = 186;
  const clean = value => value.replace(/\s+/g, ' ').trim();
  const unbracket = value => value.trim().replace(/^\[+|\]+$/g, '').trim();
  const matrixPoint = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const multiply = (a, b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];

  function textLines(page, content) {
    const viewport = page.getViewport({ scale: 1, rotation: 0 });
    const items = content.items.filter(it => typeof it.str === 'string' && it.str.trim()).map(it => {
      const point = matrixPoint(viewport.transform, it.transform[4], it.transform[5]);
      return { x: point[0], y: point[1] - it.height * 0.8, width: it.width, text: it.str };
    });
    const rows = [];
    items.sort((a,b) => a.y-b.y || a.x-b.x).forEach(it => {
      let row = rows.find(r => Math.abs(r.y-it.y) <= 1);
      if (!row) { row = { y: it.y, items: [] }; rows.push(row); }
      row.items.push(it);
    });
    const lines = [];
    rows.forEach(row => {
      let current = null;
      row.items.sort((a,b) => a.x-b.x).forEach(it => {
        // Text within one printed cell is split into several PDF.js items.
        const col = Math.round((it.x + it.width/2 - (X0+W/2))/W);
        const region = it.y > 680 || it.y < 30 ? 'footer' : it.x < 30 || it.x+it.width > viewport.width-30 ? 'ruler' + it.x : 'c'+col;
        if (current && current.region === region && it.x-current.right < 15) {
          current.text += (it.x-current.right > 1 ? ' ' : '') + it.text;
          current.right = it.x+it.width;
        } else {
          current = { x: it.x, right: it.x+it.width, y: row.y, text: it.text, region };
          lines.push(current);
        }
      });
    });
    return lines.map(line => ({ ...line, cx: (line.x+line.right)/2, text: clean(line.text) }));
  }

  function pageOrigin(lines, width) {
    const columns = [], rows = [];
    lines.forEach(line => {
      if (!/^\d+$/.test(line.text)) return;
      if (line.y < 30 || line.y > 680) columns.push(Number(line.text));
      else if (line.x < 30 || line.right > width-30) rows.push(Number(line.text));
    });
    return columns.length && rows.length ? [Math.min(...columns), Math.min(...rows)] : null;
  }

  function wrapped(lines) {
    const result = []; let buffer = '';
    lines.forEach(line => {
      buffer += line;
      if (buffer.startsWith('[') && !buffer.endsWith(']')) return;
      result.push(buffer); buffer = '';
    });
    if (buffer) result.push(buffer);
    return result;
  }

  function devicesFromLines(lines, origin, pageNumber, width) {
    const columns = new Map(), result = [];
    lines.filter(l => l.x >= 30 && l.right <= width-30 && l.y >= 30 && l.y <= 680).forEach(line => {
      const col = Math.round((line.cx-(X0+W/2))/W);
      if (!columns.has(col)) columns.set(col, []);
      columns.get(col).push(line);
    });
    function add(block) {
      if (!block.length || !/^=\s*\d+\s*=$/.test(block[0].text)) return;
      if (block.length < 4) throw new Error('Página '+pageNumber+': dispositivo con campos incompletos.');
      const col = origin[0] + Math.round((block[0].cx-(X0+W/2))/W);
      const row = origin[1] + Math.round((block[0].y-FIELD_Y)/H);
      const review = [];
      const fields = block.slice(0,4).map((l,i) => {
        const match = /^=\s*(.+?)\s*=$/.exec(l.text);
        if (!match) review.push(['dirección','serial','modelo','personalidad'][i]);
        return match ? match[1].trim() : l.text;
      });
      const values = wrapped(block.slice(4).map(l => l.text));
      const label = values.length ? unbracket(values[0]) : '';
      if (!label || values.length > 2) review.push('etiqueta');
      result.push({ id: 'c'+String(col).padStart(3,'0')+'-r'+String(row).padStart(3,'0'), page: pageNumber,
        bbox: [X0+W*col,Y0+H*row,X0+W*(col+1),Y0+H*(row+1)], address: fields[0], serial: fields[1], model: fields[2], base: fields[3], label,
        type: values.length === 2 ? unbracket(values[1]) : '', review });
    }
    columns.forEach(items => {
      let block = [];
      items.sort((a,b) => a.y-b.y).forEach(item => {
        if (block.length && item.y-block[block.length-1].y > H/3) { add(block); block = []; }
        block.push(item);
      });
      add(block);
    });
    return result;
  }

  function drawingSegments(page, operatorList, OPS) {
    const viewport = page.getViewport({ scale: 1, rotation: 0 });
    let matrix = [1,0,0,1,0,0], path = [], point = null, start = null;
    const stack = [], result = [];
    function pointAt(x,y) { return matrixPoint(multiply(viewport.transform,matrix),x,y); }
    function lineTo(p) { if (point) path.push([point,p]); point = p; }
    function reset() { path = []; point = null; start = null; }
    for (let i=0; i<operatorList.fnArray.length; i++) {
      const op = operatorList.fnArray[i], args = operatorList.argsArray[i];
      if (op === OPS.save) stack.push(matrix.slice());
      else if (op === OPS.restore) matrix = stack.pop() || [1,0,0,1,0,0];
      else if (op === OPS.transform) matrix = multiply(matrix,args);
      else if (op === OPS.paintFormXObjectBegin) { stack.push(matrix.slice()); if (args[0]) matrix=multiply(matrix,args[0]); }
      else if (op === OPS.paintFormXObjectEnd) matrix=stack.pop() || [1,0,0,1,0,0];
      else if (op === OPS.constructPath) {
        let j=0;
        for (const command of args[0]) {
          if (command === OPS.moveTo) { point=pointAt(args[1][j++],args[1][j++]);start=point; }
          else if (command === OPS.lineTo) lineTo(pointAt(args[1][j++],args[1][j++]));
          else if (command === OPS.closePath) { if (start) lineTo(start); }
          else if (command === OPS.rectangle) { j+=4; point=null;start=null; }
          else if (command === OPS.curveTo) { j+=4;point=pointAt(args[1][j++],args[1][j++]); }
          else if (command === OPS.curveTo2 || command === OPS.curveTo3) { j+=2;point=pointAt(args[1][j++],args[1][j++]); }
          else throw new Error('El PDF utiliza un trazo no compatible con el lector EST3.');
        }
      } else if (op === OPS.stroke || op === OPS.closeStroke) {
        if (op === OPS.closeStroke && start) lineTo(start);
        path.forEach(segment => {
          const [a,b]=segment, dx=Math.abs(a[0]-b[0]),dy=Math.abs(a[1]-b[1]);
          if (Math.min(a[1],b[1])>=30 && Math.max(a[1],b[1])<=680 && (dx<1.5 || dy<1.5) && dx+dy>=1) result.push(segment);
        }); reset();
      } else if ([OPS.fill,OPS.eoFill,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke,OPS.endPath].includes(op)) reset();
    }
    return result;
  }

  function distance(p, segment) {
    const [a,b]=segment, dx=b[0]-a[0],dy=b[1]-a[1];
    const t=dx||dy ? Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy))) : 0;
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
  }
  function edgesFromSegments(devices, segments) {
    if (segments.length>6000 || devices.length>1500) throw new Error('Este Mapping excede el tamaño admitido para análisis en el teléfono.');
    const parents=segments.map((_,i)=>i);
    function find(i) { while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i; }
    for(let i=0;i<segments.length;i++) for(let j=i+1;j<segments.length;j++) {
      const a=segments[i],b=segments[j];
      if(distance(a[0],b)<=2.5 || distance(a[1],b)<=2.5 || distance(b[0],a)<=2.5 || distance(b[1],a)<=2.5) parents[find(j)]=find(i);
    }
    const groups=new Map();segments.forEach((s,i)=>{const r=find(i);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(s);});
    const edges=[],seen=new Set();
    groups.forEach(group=>{
      const sources=[],targets=[];
      devices.forEach(d=>{
        const cx=(d.bbox[0]+d.bbox[2])/2;
        if(group.some(s=>distance([cx,d.bbox[3]-6],s)<=2.5))sources.push(d);
        if(group.some(s=>distance([cx,d.bbox[1]+6],s)<=2.5))targets.push(d);
      });
      sources.forEach(source=>targets.forEach(target=>{
        const key=source.id+'>'+target.id;
        if(source.id!==target.id && !seen.has(key)){seen.add(key);edges.push({source:source.id,target:target.id});}
      }));
    });
    return edges;
  }

  const sortDevice = (a,b) => a.page-b.page || a.bbox[0]-b.bbox[0] || a.bbox[1]-b.bbox[1] || a.address.localeCompare(b.address);
  function toLoop(group, index) {
    const devices=[...group.devices.values()], edges=edgesFromSegments(devices,group.segments);
    const byId=new Map(devices.map(d=>[d.id,d])), parent=new Map();
    edges.forEach(edge=>{if(parent.has(edge.target) && parent.get(edge.target)!==edge.source)throw new Error(group.title+': un dispositivo tiene varios padres. Se requiere revisión.');parent.set(edge.target,edge.source);});
    const ranks=new Map(devices.slice().sort(sortDevice).map((d,i)=>[d.id,i]));
    const loopnum=Number((/Loop Number\s+(\d+)$/i.exec(group.title)||[])[1]);
    const cabinet=group.title.split('/')[0].trim();
    const panel=Number((/^Cab(\d+)(?:_|$)/i.exec(cabinet)||[])[1]) || index+1;
    const loop={title:group.title,scopeId:index+1,cabinet,controller:group.title.split('/')[1].trim(),panel,loopnum,mapped:true,devices:devices.map(d=>({
      addr:Number(d.address),kind:'est3',model:d.model,serial:d.serial,label:d.label,location:'',next:parent.has(d.id)?Number(byId.get(parent.get(d.id)).address):0,
      level:ranks.get(d.id),base:d.base,type:d.type,page:d.page,cellId:d.id,review:d.review
    }))};
    // The shared tree validator rejects address collisions and cycles atomically.
    SasMapping.buildTree(loop.devices,loop.title,[]);
    return {loop,devices,edges};
  }

  async function read(document, lib, id, filename, onProgress) {
    if(document.numPages>200)throw new Error('El Mapping EST3 supera 200 páginas.');
    const groups=new Map(),warnings=[];let obra='';
    for(let n=1;n<=document.numPages;n++) {
      if(onProgress)onProgress(n,document.numPages);
      const page=await document.getPage(n);
      if(page.rotate!==0)throw new Error('Página '+n+': el Mapping EST3 está girado. Se necesita el PDF original sin rotar.');
      const content=await page.getTextContent();
      const lines=textLines(page,content),width=page.getViewport({scale:1}).width;
      if(!lines.length && (await page.getOperatorList()).fnArray.every(op=>[lib.OPS.transform,lib.OPS.save,lib.OPS.restore].includes(op))) continue;
      const footer=lines.filter(l=>l.y>680).sort((a,b)=>a.y-b.y||a.x-b.x).map(l=>l.text).join('\n');
      const header=footer.match(/([^\n]+\/\s*Loop Number\s+\d+)/i);
      const project=footer.match(/Project:\s*(.+?)\s+Version:/i);
      if(!header || !project)throw new Error('Página '+n+': no se reconoce el encabezado de Mapping EST3. No se incorporó un mapa parcial.');
      if(obra && obra!==clean(project[1]))throw new Error('El PDF mezcla proyectos distintos. Sepáralos antes de cargar.');
      obra=clean(project[1]);const title=clean(header[1]);
      const origin=pageOrigin(lines,width);
      if(!origin)throw new Error('Página '+n+': faltan las coordenadas del plano EST3.');
      if(!groups.has(title))groups.set(title,{title,devices:new Map(),segments:[]});
      const group=groups.get(title);
      devicesFromLines(lines,origin,n,width).forEach(d=>{
        if(group.devices.has(d.id))throw new Error('Celda repetida '+d.id+' en '+title+'. Revise las páginas duplicadas.');
        group.devices.set(d.id,d);
        if(d.review.length)warnings.push('Página '+n+', dirección '+d.address+': revisar '+d.review.join(', ')+'.');
      });
      const ops=await page.getOperatorList();
      const segments=drawingSegments(page,ops,lib.OPS).map(s=>s.map(p=>[p[0]+W*origin[0],p[1]+H*origin[1]]));
      group.segments.push(...segments);
      if(n%8===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    const results=[...groups.values()].map(toLoop);
    if(!results.some(r=>r.devices.length))throw new Error('No se encontraron dispositivos en el Mapping EST3.');
    warnings.unshift('El Mapping EST3 contiene solo los últimos 4 dígitos del serial. Carga el reporte para completar seriales y ubicaciones.');
    return {id,family:'est3',obra,filename,version:'est3-vector',warnings,loops:results.map(r=>r.loop)};
  }
  function readMd(text, id, filename) {
    const headers = [...text.matchAll(/^##\s+(.+\/\s*Loop Number\s+\d+)\s*$/gm)];
    if (headers.length !== 1) throw new Error('Este Mapping MD debe contener un solo controlador y loop. Exporta cada loop en un MD separado.');
    const title = clean(headers[0][1]), parts = title.split('/').map(clean);
    const decode = value => value.replace(/&(amp|lt|gt|#124);/g, (all, key) => ({amp:'&',lt:'<',gt:'>','#124':'|'})[key]);
    const devices = text.split('\n').filter(line => /^\s*\|\s*Ramal\s+\d+/i.test(line)).map((line, i) => {
      const c = line.split('|').slice(1,-1).map(v => decode(v.trim()));
      if (c.length < 9 || !/^\d+$/.test(c[3]) || Number(c[3]) < 1 || Number(c[3]) > 9999 || !/^\d{4}$/.test(c[10] || c[7]) || !/^(\d{4}|\d{10})$/.test(c[7])) throw new Error('El MD EST3 contiene una dirección o serial incompleto.');
      const parent = /direcci[oó]n\s+(\d+)/i.exec(c[2]);
      if (!parent && clean(c[2]) !== title) throw new Error('El MD contiene una conexión sin origen verificable: ' + c[2]);
      return { addr:Number(c[3]), kind:'est3', model:c[5],serial:c[10] || c[7],reportSerial:c[7].length===10?c[7]:'',label:c[4],location:'',next:parent?Number(parent[1]):0,level:i,base:c[6],page:Number(c[8])||0,type:'',review:[] };
    });
    const expected = /^mapping_dispositivos:\s*(\d+)/m.exec(text);
    if (!devices.length || devices.length > 1500 || expected && Number(expected[1]) !== devices.length) throw new Error('El número de dispositivos del MD no coincide con su tabla.');
    if (devices.some(d => d.next && !devices.some(p => p.addr === d.next))) throw new Error('El MD hace referencia a un padre ausente.');
    const loop={title,scopeId:1,cabinet:parts[0],controller:parts[1],panel:Number((/^Cab(\d+)/i.exec(parts[0])||[])[1])||1,loopnum:Number((/Loop Number\s+(\d+)/i.exec(title)||[])[1]),mapped:true,devices};
    const tree=SasMapping.buildTree(devices,title,[]), expectedTaps=/^mapping_t_taps:\s*(\d+)/m.exec(text);
    if (expectedTaps && tree.taps!==Number(expectedTaps[1])) throw new Error('Los T-taps declarados por el MD no coinciden con su tabla.');
    return {id,family:'est3',version:'est3-md',projectUnspecified:true,obra:filename.replace(/\.md$/i,''),filename,loops:[loop],warnings:['El MD conserva los últimos 4 dígitos del serial. El reporte se vincula solo con un proyecto y controlador únicos.']};
  }
  global.Est3Mapping={read,readMd,textLines,pageOrigin,devicesFromLines,drawingSegments,edgesFromSegments,toLoop};
})(window);
