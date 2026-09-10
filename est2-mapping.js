/* EST2 tiled vector drawing. Port of the supplied signature_mapping.py reader. */
(function (global) {
  'use strict';
  const WIDTH=612, HEIGHT=792;
  const DEVICE=/º(\d+)ºº(\d+)ººSIGA-([A-Z0-9]+)º«(\d+)»«(\d+)»«([^»]*)»/;
  const point=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
  const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
  const round=value=>Math.round(value*10)/10;
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  function segmentDistance(p,[a,b]) {
    const dx=b[0]-a[0],dy=b[1]-a[1],t=dx||dy?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy))):0;
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
  }
  function tileOf(page,content) {
    const viewport=page.getViewport({scale:1,rotation:0});
    const markers=content.items.filter(it=>typeof it.str==='string').map(it=>({match:/^(\d+)\s*,\s*(\d+)$/.exec(it.str.trim()),p:point(viewport.transform,it.transform[4],it.transform[5])}))
      .filter(it=>it.match&&it.p[0]>viewport.width-80&&it.p[1]>viewport.height-40);
    if(markers.length!==1)return null;
    const tile=[Number(markers[0].match[1]),Number(markers[0].match[2])];
    if(tile.some(n=>!Number.isSafeInteger(n)||n<1||n>200))throw new Error('Coordenada de página EST2 no válida.');
    return tile;
  }

  function drawing(page,operators,OPS) {
    const view=page.getViewport({scale:1,rotation:0});
    let matrix=[1,0,0,1,0,0],path=[],cursor=null,start=null;
    const stack=[],segments=[],icons=[];
    const at=(x,y)=>point(multiply(view.transform,matrix),x,y);
    function line(p){if(cursor&&distance(cursor,p)>0.01)path.push([cursor,p]);cursor=p;}
    function reset(){path=[];cursor=null;start=null;}
    for(let i=0;i<operators.fnArray.length;i++){
      const op=operators.fnArray[i],args=operators.argsArray[i];
      if(op===OPS.save)stack.push(matrix.slice());
      else if(op===OPS.restore)matrix=stack.pop()||[1,0,0,1,0,0];
      else if(op===OPS.transform)matrix=multiply(matrix,args);
      else if(op===OPS.paintFormXObjectBegin){stack.push(matrix.slice());if(args[0])matrix=multiply(matrix,args[0]);}
      else if(op===OPS.paintFormXObjectEnd)matrix=stack.pop()||[1,0,0,1,0,0];
      else if(op===OPS.paintImageXObject||op===OPS.paintInlineImageXObject){
        const corners=[at(0,0),at(0,1),at(1,0),at(1,1)],xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);
        const box=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
        if(Math.abs(box[2]-box[0]-18)<=1&&Math.abs(box[3]-box[1]-18)<=1)icons.push(box);
      } else if(op===OPS.constructPath){
        let j=0;
        for(const command of args[0]){
          if(command===OPS.moveTo){cursor=at(args[1][j++],args[1][j++]);start=cursor;}
          else if(command===OPS.lineTo)line(at(args[1][j++],args[1][j++]));
          else if(command===OPS.closePath){if(start)line(start);}
          else if(command===OPS.rectangle){j+=4;cursor=null;start=null;}
          else if(command===OPS.curveTo){j+=4;cursor=at(args[1][j++],args[1][j++]);}
          else if(command===OPS.curveTo2||command===OPS.curveTo3){j+=2;cursor=at(args[1][j++],args[1][j++]);}
          else throw new Error('Trazo EST2 no compatible.');
        }
      } else if(op===OPS.stroke||op===OPS.closeStroke){if(op===OPS.closeStroke&&start)line(start);segments.push(...path);reset();}
      else if([OPS.fill,OPS.eoFill,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke,OPS.endPath].includes(op))reset();
    }
    return {segments,icons};
  }

  function collectDevices(pages) {
    const rows=[],icons=[];
    for(const page of pages){
      const [row,col]=page.tile,view=page.viewport;
      icons.push(...page.icons.map(box=>({row,col,box})));
      for(const it of page.content.items){
        if(typeof it.str!=='string'||!it.str.trim()||/^\d+\s*,\s*\d+$/.test(it.str.trim()))continue;
        const p=point(view.transform,it.transform[4],it.transform[5]);
        const y=p[1]-it.height*.8;
        let group=rows.find(g=>g.row===row&&Math.abs(g.y-y)<.15);
        if(!group){group={row,y,items:[]};rows.push(group);}
        group.items.push({col,x:p[0],right:p[0]+it.width,text:it.str,page:page.number});
      }
    }
    const devices=[];
    for(const group of rows.sort((a,b)=>a.row-b.row||a.y-b.y)){
      const chunks=[];
      for(const item of group.items.sort((a,b)=>a.col-b.col||a.x-b.x)){
        const last=chunks[chunks.length-1],prev=last&&last[last.length-1];
        if(prev&&((item.col===prev.col&&item.x-prev.right<3)||(item.col===prev.col+1&&prev.right>=WIDTH-12&&item.x<=2)))last.push(item);
        else chunks.push([item]);
      }
      for(const chunk of chunks){
        const text=chunk.map(c=>c.text).join(''),match=DEVICE.exec(text);
        if(!match){if(/[º«»]|SIGA-/.test(text))throw new Error('Texto EST2 cortado o incompleto en página '+chunk[0].page+'. Revisa que estén todas las páginas del Mapping.');continue;}
        const first=chunk[0],x=first.x+WIDTH*(first.col-1);
        const candidates=icons.filter(i=>i.row===group.row&&Math.abs(i.box[1]-group.y)<=6&&i.box[2]+WIDTH*(i.col-1)<=x+1);
        candidates.sort((a,b)=>(b.box[2]+WIDTH*(b.col-1))-(a.box[2]+WIDTH*(a.col-1)));
        if(!candidates.length)throw new Error('No se pudo identificar el icono del equipo '+match[4]+'.');
        const icon=candidates[0],box=icon.box.map((n,i)=>n+(i%2?HEIGHT*(group.row-1):WIDTH*(icon.col-1)));
        const review=[];if(match[1]!==match[4])review.push('dirección');if(match[2]!==match[5])review.push('serial');
        if(!Number(match[4])||!/^\d{10}$/.test(match[5]))throw new Error('Dirección o serial incompleto en EST2.');
        devices.push({id:'x'+box[0].toFixed(1).padStart(7,'0')+'-y'+box[1].toFixed(1).padStart(7,'0'),bbox:box,pages:[...new Set(chunk.map(c=>c.page))],address:match[4],serial:match[5],model:'SIGA-'+match[3],label:match[6],review,rawAddress:match[1],rawSerial:match[2]});
      }
    }
    if(new Set(devices.map(d=>d.id)).size!==devices.length)throw new Error('Dos equipos EST2 ocupan el mismo icono.');
    return devices;
  }

  function collectSegments(pages) {
    const segments=[],exits=[],entries=[];
    for(const page of pages){
      const [row,col]=page.tile;
      for(const local of page.segments){
        const segment=local.map(p=>[p[0]+WIDTH*(col-1),p[1]+HEIGHT*(row-1)]);segments.push(segment);
        local.forEach((p,i)=>{const port={row,col,y:p[1],point:segment[i]};if(p[0]>=WIDTH-1)exits.push(port);if(p[0]<=40)entries.push(port);});
      }
    }
    for(const exit of exits){
      const neighbors=entries.filter(e=>e.row===exit.row&&e.col===exit.col+1&&Math.abs(e.y-exit.y)<=3).sort((a,b)=>a.point[0]-b.point[0]);
      if(neighbors.length)segments.push([exit.point,neighbors[0].point]);
    }
    return segments;
  }

  function ports(device){const [x0,y0,x1,y1]=device.bbox,cx=(x0+x1)/2,cy=(y0+y1)/2;return {entries:[[x0,cy],[cx,y0]],exit:[cx,y1]};}
  function edgesFromSegments(devices,segments) {
    if(devices.length>1500||segments.length>6000)throw new Error('El Mapping EST2 excede el tamaño admitido.');
    const allPorts=devices.flatMap(d=>{const p=ports(d);return [...p.entries,p.exit];}),split=[];
    for(const [start,end] of segments){
      const cuts=allPorts.filter(p=>segmentDistance(p,[start,end])<=2&&distance(p,start)>1&&distance(p,end)>1).sort((a,b)=>distance(a,start)-distance(b,start));
      const chain=[start,...cuts,end];for(let i=1;i<chain.length;i++)split.push([chain[i-1],chain[i]]);
    }
    if(split.length>15000)throw new Error('El trazado EST2 es demasiado complejo.');
    const adjacency=new Map(),points=new Map();
    const key=p=>round(p[0])+','+round(p[1]);
    function add(a,b){if(a===b)return;if(!adjacency.has(a))adjacency.set(a,new Set());adjacency.get(a).add(b);}
    for(const [start,end] of split){const a=key(start),b=key(end);if(a===b)continue;points.set(a,start.map(round));points.set(b,end.map(round));add(a,b);add(b,a);}
    const nodes=[...points.keys()];
    for(const n of nodes)for(const [start,end] of split){const a=key(start),b=key(end);if(n===a||n===b||a===b)continue;if(segmentDistance(points.get(n),[start,end])<=2.5){add(n,a);add(n,b);add(a,n);add(b,n);}}
    function nearest(p){let best=null,limit=4;for(const n of nodes){const d=distance(p,points.get(n));if(d<=limit){limit=d;best=n;}}return best;}
    const entryOf=new Map(),owner=new Map(),exits=new Map();
    for(const d of devices){const p=ports(d);for(const port of p.entries){const n=nearest(port);if(n!==null){if(!entryOf.has(n))entryOf.set(n,d.id);if(!owner.has(n))owner.set(n,d.id);}}
      const n=nearest(p.exit);if(n!==null){exits.set(d.id,n);if(!owner.has(n))owner.set(n,d.id);}}
    const edges=[],seenEdges=new Set();
    for(const d of devices){const start=exits.get(d.id);if(!start)continue;const seen=new Set([start]),queue=[start];
      for(let i=0;i<queue.length;i++)for(const next of adjacency.get(queue[i])||[]){if(seen.has(next))continue;seen.add(next);
        if(owner.has(next)){const target=entryOf.get(next);if(target&&target!==d.id&&!seenEdges.has(d.id+'>'+target)){seenEdges.add(d.id+'>'+target);edges.push({source:d.id,target});}continue;}queue.push(next);}}
    return edges;
  }

  async function read(document,lib,id,filename,onProgress) {
    if(document.numPages>200)throw new Error('El Mapping EST2 supera 200 páginas.');
    const pages=[],tiles=new Set();
    for(let n=1;n<=document.numPages;n++){
      if(onProgress)onProgress(n,document.numPages);
      const page=await document.getPage(n),viewport=page.getViewport({scale:1,rotation:0});
      if(page.rotate||Math.abs(viewport.width-WIDTH)>1||Math.abs(viewport.height-HEIGHT)>1)throw new Error('Página '+n+': EST2 requiere el tamaño y orientación originales.');
      const content=await page.getTextContent(),tile=tileOf(page,content);
      if(!tile)throw new Error('Página '+n+': falta el marcador fila,columna de EST2.');
      const tileKey=tile.join(',');if(tiles.has(tileKey))throw new Error('Página EST2 duplicada: '+tileKey+'.');tiles.add(tileKey);
      pages.push({number:n,tile,viewport,content,...drawing(page,await page.getOperatorList(),lib.OPS)});
      if(n%8===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    const devices=collectDevices(pages),segments=collectSegments(pages),edges=edgesFromSegments(devices,segments);
    if(!devices.length)throw new Error('No se encontraron dispositivos en el Mapping EST2.');
    const parents=new Map(),byId=new Map(devices.map(d=>[d.id,d]));
    edges.forEach(e=>{if(parents.has(e.target)&&parents.get(e.target)!==e.source)throw new Error('El dibujo EST2 asigna más de un padre a un dispositivo.');parents.set(e.target,e.source);});
    const sorted=devices.slice().sort((a,b)=>a.pages[0]-b.pages[0]||round(a.bbox[0])-round(b.bbox[0])||round(a.bbox[1])-round(b.bbox[1])||a.address.localeCompare(b.address));
    const rank=new Map(sorted.map((d,i)=>[d.id,i]));
    const warnings=devices.filter(d=>d.review.length).map(d=>'Dirección '+d.address+': bloque º'+d.rawAddress+'º / serial '+d.rawSerial+' distinto del bloque «'+d.address+'» / serial '+d.serial+'. Se conserva el valor de «…».');
    const loop={title:'Loop Controller',scopeId:1,panel:1,loopnum:1,mapped:true,identityKnown:false,devices:devices.map(d=>({addr:Number(d.address),serial:d.serial,model:d.model,label:d.label,location:'',kind:'est2',next:parents.has(d.id)?Number(byId.get(parents.get(d.id)).address):0,level:rank.get(d.id),page:d.pages[0],pages:d.pages,cellId:d.id,review:d.review,rawAddress:d.rawAddress,rawSerial:d.rawSerial}))};
    SasMapping.buildTree(loop.devices,loop.title,[]);
    return {id,family:'est2',version:'est2-vector',obra:filename.replace(/\.pdf$/i,''),filename,loops:[loop],warnings};
  }
  global.Est2Mapping={read,tileOf,drawing,collectDevices,collectSegments,edgesFromSegments};
})(window);
