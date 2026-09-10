/* EST4 diagrams: physical rectangles, overlapping printed pages and vector wires.
   No device order or connection is inferred from serial numbers or report rows. */
(function () {
  'use strict';
  const point = (m,x,y) => [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
  const multiply = (a,b) => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
  const boxOf = points => [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
  const area = b => Math.max(0,b[2]-b[0])*Math.max(0,b[3]-b[1]);
  const overlap = (a,b) => Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]))/Math.max(1,Math.min(area(a),area(b)));
  const union = (a,b) => [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];
  const clean = s => s.replace(/\s+/g,' ').trim();

  function drawing(page,ops,OPS) {
    const view=page.getViewport({scale:1});
    let matrix=[1,0,0,1,0,0],path=[],points=[],current=null,start=null,closed=false;
    const stack=[],segments=[],rectangles=[],images=[];
    const at=(x,y)=>point(multiply(view.transform,matrix),x,y);
    function reset(){path=[];points=[];current=null;start=null;closed=false;}
    function line(p){if(current)path.push([current,p]);points.push(p);current=p;if(start&&path.length>=3&&Math.hypot(p[0]-start[0],p[1]-start[1])<2)closed=true;}
    function finish(stroke,close){
      if(close&&start){line(start);closed=true;}
      if(stroke){
        segments.push(...path.filter(([a,b])=>(Math.abs(a[0]-b[0])<1.5||Math.abs(a[1]-b[1])<1.5)&&Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])>=5));
        if(points.length>=4&&(closed||current&&start&&Math.hypot(current[0]-start[0],current[1]-start[1])<1)){
          const b=boxOf(points),w=b[2]-b[0],h=b[3]-b[1];
          if(w>70&&w<300&&h>40&&h<180)rectangles.push(b);
        }
      }
      reset();
    }
    for(let i=0;i<ops.fnArray.length;i++){
      const op=ops.fnArray[i],args=ops.argsArray[i];
      if(op===OPS.save)stack.push(matrix.slice());
      else if(op===OPS.restore)matrix=stack.pop()||[1,0,0,1,0,0];
      else if(op===OPS.transform)matrix=multiply(matrix,args);
      else if(op===OPS.paintFormXObjectBegin){stack.push(matrix.slice());if(args[0])matrix=multiply(matrix,args[0]);}
      else if(op===OPS.paintFormXObjectEnd)matrix=stack.pop()||[1,0,0,1,0,0];
      else if(op===OPS.paintImageXObject||op===OPS.paintInlineImageXObject){
        const b=boxOf([at(0,0),at(1,0),at(1,1),at(0,1)]);
        if(b[2]-b[0]>70&&b[2]-b[0]<300)images.push(b);
      }else if(op===OPS.paintImageXObjectRepeat||op===OPS.paintInlineImageXObjectGroup){
        throw new Error('El Mapping usa imágenes agrupadas no compatibles. Exporta el PDF vectorial de 4-CU.');
      }else if(op===OPS.constructPath){
        let j=0;
        for(const cmd of args[0]){
          if(cmd===OPS.moveTo){current=at(args[1][j++],args[1][j++]);start=current;points.push(current);}
          else if(cmd===OPS.lineTo)line(at(args[1][j++],args[1][j++]));
          else if(cmd===OPS.closePath){if(start)line(start);closed=true;}
          else if(cmd===OPS.rectangle){
            const x=args[1][j++],y=args[1][j++],w=args[1][j++],h=args[1][j++];
            current=at(x,y);start=current;points.push(current);line(at(x+w,y));line(at(x+w,y+h));line(at(x,y+h));line(start);closed=true;
          }else if(cmd===OPS.curveTo){points.push(at(args[1][j++],args[1][j++]),at(args[1][j++],args[1][j++]));current=at(args[1][j++],args[1][j++]);points.push(current);}
          else if(cmd===OPS.curveTo2||cmd===OPS.curveTo3){points.push(at(args[1][j++],args[1][j++]));current=at(args[1][j++],args[1][j++]);points.push(current);}
          else throw new Error('Trazo PDF no compatible con el lector EST4.');
        }
      }else if([OPS.stroke,OPS.closeStroke,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke].includes(op))finish(true,[OPS.closeStroke,OPS.closeFillStroke,OPS.closeEOFillStroke].includes(op));
      else if([OPS.fill,OPS.eoFill,OPS.endPath].includes(op))finish(false,false);
    }
    // Some print drivers rasterize each rectangle into horizontal strips.
    images.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    let changed=true;
    while(changed){
      changed=false;
      outer:for(let i=0;i<images.length;i++)for(let j=i+1;j<images.length;j++){
        const a=images[i],b=images[j];
        if(Math.abs(a[0]-b[0])<1&&Math.abs(a[2]-b[2])<1&&b[1]<=a[3]+1&&b[3]>=a[1]-1){images[i]=union(a,b);images.splice(j,1);changed=true;break outer;}
      }
    }
    const boxes=[];
    rectangles.concat(images).sort((a,b)=>area(b)-area(a)).forEach(b=>{
      if(b[3]-b[1]<=25&&!(b[1]<2||b[3]>view.height-2))return;
      if(!boxes.some(old=>overlap(old,b)>.9))boxes.push(b);
    });
    if(boxes.length>1000||segments.length>5000)throw new Error('Página EST4 demasiado compleja para el teléfono.');
    return {boxes,segments:segments.filter(s=>!border(s,boxes)),width:view.width,height:view.height};
  }
  function border([a,b],boxes){
    return boxes.some(([x0,y0,x1,y1])=>Math.abs(a[1]-b[1])<=2&&
      (Math.abs(a[1]-y0)<=2||Math.abs(a[1]-y1)<=2)&&Math.min(a[0],b[0])>=x0-2&&Math.max(a[0],b[0])<=x1+2||
      Math.abs(a[0]-b[0])<=2&&(Math.abs(a[0]-x0)<=2||Math.abs(a[0]-x1)<=2)&&Math.min(a[1],b[1])>=y0-2&&Math.max(a[1],b[1])<=y1+2);
  }
  function stepBetween(a,b){
    const votes=[];
    for(const x of a.text)for(const y of b.text){
      const d=x.y-y.y;
      if(x.s.length>5&&x.s===y.s&&Math.abs(x.x-y.x)<1&&d>a.height*.85&&d<a.height+3)votes.push(d);
    }
    for(const first of a.segments)for(const second of b.segments){
      const x=first.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]),y=second.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
      const d=x[0][1]-y[0][1],e=x[1][1]-y[1][1];
      if(Math.abs(x[0][0]-y[0][0])<.3&&Math.abs(x[1][0]-y[1][0])<.3&&Math.abs(d-e)<.3&&d>a.height*.85&&d<a.height+3)votes.push((d+e)/2);
    }
    const counts=new Map();votes.forEach(v=>{const k=Math.round(v*10)/10;counts.set(k,(counts.get(k)||0)+1);});
    const ranked=[...counts].sort((a,b)=>b[1]-a[1]);
    if(!ranked.length||ranked[1]&&ranked[0][1]<2*ranked[1][1])throw new Error('No se puede unir con seguridad la página '+b.number+' del Mapping. No se ha incorporado.');
    return {step:ranked[0][0],votes:ranked[0][1]};
  }
  function distance(p,[a,b]){
    const dx=b[0]-a[0],dy=b[1]-a[1],t=dx||dy?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy))):0;
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
  }
  const touches=(a,b,t)=>distance(a[0],b)<=t||distance(a[1],b)<=t||distance(b[0],a)<=t||distance(b[1],a)<=t;
  function edgesOf(nodes,segments){
    if(segments.length>6000||nodes.length>2000)throw new Error('El Mapping excede el límite de análisis del teléfono.');
    const parents=segments.map((_,i)=>i);
    function find(i){while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;}
    for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++)if(touches(segments[i],segments[j],2.5))parents[find(j)]=find(i);
    const groups=new Map();segments.forEach((s,i)=>{const k=find(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(s);});
    const edges=new Map();
    groups.forEach(group=>{
      const source=[],target=[];
      nodes.forEach(n=>{const [x0,y0,x1,y1]=n.box;if(group.some(s=>touches([[x0,y1],[x1,y1]],s,6)))source.push(n);if(group.some(s=>touches([[x0,y0],[x1,y0]],s,6)))target.push(n);});
      source.forEach(a=>target.forEach(b=>{if(a.address!==b.address&&b.box[1]>=a.box[3]-3)edges.set(a.address+'>'+b.address,[a.address,b.address]);}));
    });
    return [...edges.values()];
  }
  function assemble(pages){
    const boxes=[],text=[],segments=[];
    for(const page of pages){
      const offset=page.offset;
      for(const b of page.boxes){
        const r=[b[0],b[1]+offset,b[2],b[3]+offset];
        const matches=boxes.filter(old=>overlap(old.box,r)>.9||Math.abs(r[0]-old.box[0])<3&&Math.abs(r[2]-old.box[2])<3&&Math.min(r[3],old.box[3])-Math.max(r[1],old.box[1])>2);
        if(matches.length>1)throw new Error('Hay recuadros superpuestos ambiguos en el Mapping.');
        if(matches.length){matches[0].box=union(matches[0].box,r);matches[0].pages=[...new Set(matches[0].pages.concat(page.number))];}
        else boxes.push({box:r,pages:[page.number]});
      }
      text.push(...page.text.map(t=>({...t,y:t.y+offset})));
      segments.push(...page.segments.map(([a,b])=>[[a[0],a[1]+offset],[b[0],b[1]+offset]]));
    }
    const nodes=[];
    boxes.sort((a,b)=>a.box[1]-b.box[1]||a.box[0]-b.box[0]).forEach(item=>{
      const [x0,y0,x1,y1]=item.box,unique=[];
      text.filter(t=>t.x>=x0-1&&t.x<=x1+1&&t.y>=y0-1&&t.y<=y1+1).sort((a,b)=>a.y-b.y||a.x-b.x).forEach(t=>{
        const old=unique.find(u=>Math.abs(u.x-t.x)<1&&Math.abs(u.y-t.y)<1);
        if(old){if(t.s.length>old.s.length)old.s=t.s;}else unique.push({...t});
      });
      const raw=unique.sort((a,b)=>a.y-b.y||a.x-b.x).map(t=>t.s).join(' ');
      const parts=raw.split(/(Label|Model|Base Type|Device Address|Serial Number)\s*-?\s*>\s*/g),fields={};
      for(let i=1;i<parts.length-1;i+=2){const value=clean(parts[i+1]);if(fields[parts[i]]&&fields[parts[i]]!==value)throw new Error('Campos contradictorios dentro de un recuadro EST4.');fields[parts[i]]=value;}
      if(!Object.keys(fields).length)return;
      const addresses=[...new Set((fields['Device Address']||'').match(/\b\d{1,4}\b/g)||[])],serials=[...new Set((fields['Serial Number']||'').match(/\b\d{10}\b/g)||[])];
      if(addresses.length!==1||serials.length!==1||!fields.Model||!fields.Label)throw new Error('Dispositivo incompleto en páginas '+item.pages.join(', ')+'. Revisa la exportación del Mapping. '+(fields['Device Address']||fields.Label||''));
      nodes.push({address:addresses[0],serial:serials[0],label:fields.Label,model:fields.Model.replace(/SIGA\s*-\s*/g,'SIGA-'),base:fields['Base Type']||'',box:item.box,pages:item.pages});
    });
    if(!nodes.length||new Set(nodes.map(n=>n.address)).size!==nodes.length)throw new Error('Mapping vacío o con direcciones repetidas.');
    // Count every printed address independently of rectangle detection. A lost
    // rectangle must fail the import, rather than silently dropping a device.
    const lines=[];
    text.slice().sort((a,b)=>a.y-b.y||a.x-b.x).forEach(t=>{
      let row=lines.find(r=>Math.abs(r.y-t.y)<1);
      if(!row){row={y:t.y,items:[]};lines.push(row);}row.items.push(t);
    });
    const printed=new Set();
    lines.forEach(row=>{
      const items=[];
      row.items.sort((a,b)=>a.x-b.x).forEach(t=>{
        const old=items.find(p=>Math.abs(p.x-t.x)<1);
        if(old){if(t.s.length>old.s.length)old.s=t.s;}else items.push({...t});
      });
      for(const match of items.map(t=>t.s).join(' ').matchAll(/Device Address\s*-?\s*>\s*(\d{1,4})\b/g))printed.add(match[1]);
    });
    if(printed.size!==nodes.length||nodes.some(n=>!printed.has(n.address)))throw new Error('No se recuperaron todos los recuadros del Mapping. La sesión anterior se conserva.');
    const edges=edgesOf(nodes,segments),parents=new Map(),children=new Map(nodes.map(n=>[n.address,[]])),byAddress=new Map(nodes.map(n=>[n.address,n]));
    edges.forEach(([a,b])=>{if(parents.has(b)&&parents.get(b)!==a)throw new Error('La dirección '+b+' tiene más de un padre dibujado.');parents.set(b,a);children.get(a).push(b);});
    const roots=nodes.filter(n=>!parents.has(n.address)),order=[],visited=new Set(),depth=new Map();
    function visit(address,d){
      if(visited.has(address))throw new Error('El Mapping contiene un ciclo de conexiones.');
      visited.add(address);order.push(address);depth.set(address,d);
      children.get(address).sort((a,b)=>byAddress.get(a).box[0]-byAddress.get(b).box[0]||byAddress.get(a).box[1]-byAddress.get(b).box[1]).forEach(k=>visit(k,d+1));
    }
    roots.forEach(n=>visit(n.address,0));if(order.length!==nodes.length)throw new Error('El Mapping contiene un ciclo sin raíz.');
    const key=a=>a.padStart(4,'0');
    return {nodes,edges,order,roots:roots.map(n=>n.address),devices:order.map((address,i)=>{
      const n=byAddress.get(address),parent=parents.get(address);
      return {key:key(address),addrNum:address,label:n.label,mtype:n.model,mserial:n.serial,order:i,depth:depth.get(address),parent:parent?key(parent):null,children:children.get(address).length};
    }),taps:nodes.filter(n=>children.get(n.address).length>1).length};
  }
  async function read(doc,lib,id,filename,onProgress){
    if(doc.numPages>200)throw new Error('El Mapping EST4 supera 200 páginas.');
    const pages=[];let offset=0,controllerCount=0;
    for(let number=1;number<=doc.numPages;number++){
      if(onProgress)onProgress(number,doc.numPages);
      const page=await doc.getPage(number),content=await page.getTextContent(),viewport=page.getViewport({scale:1});
      const text=content.items.filter(it=>typeof it.str==='string'&&it.str.trim()).map(it=>{const p=point(viewport.transform,it.transform[4],it.transform[5]);return {x:p[0],y:p[1],s:clean(it.str)};});
      controllerCount+=text.filter(t=>t.s==='Loop Controller').length;
      if(controllerCount>1)throw new Error('El PDF contiene varios diagramas EST4. Exporta cada Mapping por separado.');
      const data={...drawing(page,await page.getOperatorList(),lib.OPS),text,number,offset};
      if(pages.length){
        const previous=pages[pages.length-1];
        if(Math.abs(previous.width-data.width)>1||Math.abs(previous.height-data.height)>1)throw new Error('Las páginas del Mapping tienen tamaños diferentes.');
        const alignment=stepBetween(previous,data);offset+=alignment.step;data.offset=offset;data.alignmentVotes=alignment.votes;
      }
      pages.push(data);
    }
    if(controllerCount!==1)throw new Error('Falta el inicio del diagrama EST4 (Loop Controller).');
    const result=assemble(pages);
    const fingerprint=JSON.stringify(result.devices.map(d=>[d.key,d.parent,d.mserial,d.mtype,d.label]));
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprint));
    return {...result,id,filename,fingerprint:[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join(''),pageOffsets:pages.map(p=>p.offset)};
  }
  window.Est4Mapping={read};
})();
