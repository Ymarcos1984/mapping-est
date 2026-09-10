/* EST2 SDU: port of the supplied BRS Paradox/CURMAP/SATODA reader.
 * Schema-checked records; no OCR, byte-pattern guesses, or network service. */
(function(global){
  'use strict';
  const SCHEMAS={
    'object.db':[[3,2],[3,2],[3,2],[3,2],[3,2],[1,40],[9,1],[1,20],[1,20],[3,2],[9,1]],
    'sensor.db':[[3,2],[3,2],[3,2],[1,10],[1,20],[3,2],[3,2],[3,2],[3,2],[3,2],[3,2],[3,2],[3,2]],
    'module.db':[[3,2],[3,2],[3,2],[1,10],[1,20],[3,2],[3,2],[3,2],[3,2],[3,2],[3,2],[9,1],[3,2],[9,1]]
  };
  const latin=bytes=>Array.from(bytes,b=>String.fromCharCode(b)).join('');
  function records(bytes,name){
    const fail=msg=>{throw new Error(name+': '+msg);};
    if(bytes.length<0x78)fail('tabla incompleta.');
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),size=v.getUint16(0,true),header=v.getUint16(2,true),block=bytes[5]*1024,count=v.getUint32(6,true),nf=v.getUint16(33,true),schema=SCHEMAS[name];
    if(!schema||nf!==schema.length||0x78+nf*2>header)fail('esquema EST2 no compatible.');
    if(schema.some(([type,len],i)=>bytes[120+i*2]!==type||bytes[121+i*2]!==len)||schema.reduce((n,f)=>n+f[1],0)!==size)fail('tipos de columnas no compatibles.');
    if(header>bytes.length||header<120+nf*2||!block||(bytes.length-header)%block||size>block-6||count>10000)fail('cabecera dañada o tabla demasiado grande.');
    const out=[];
    for(let offset=header;offset<bytes.length;offset+=block){
      const used=v.getInt16(offset+4,true);if(used<0)continue;
      if(used%size||6+used+size>block)fail('bloque de registros incompleto.');
      for(let r=0;r<=used/size;r++){
        let p=offset+6+r*size;
        out.push(schema.map(([type,len])=>{
          const data=bytes.subarray(p,p+len);p+=len;
          if(type===3){const n=data[0]*256+data[1];return n===0?null:n-32768;}
          if(type===9)return !!(data[0]&127);
          return latin(data).replace(/\0+$/,'').trim();
        }));
      }
    }
    if(out.length!==count)fail('el recuento no coincide con la cabecera.');
    return out;
  }
  // BRS section order: main chain, queued T-taps, then remaining roots.
  function ordered(devices,title){
    const t=SasMapping.buildTree(devices,title,[]),sizes=new Map();
    for(const a of t.order.slice().reverse())sizes.set(a,1+t.children.get(a).reduce((n,c)=>n+sizes.get(c),0));
    const cmp=(a,b)=>t.byAddress.get(a).level-t.byAddress.get(b).level||a-b;
    const roots=t.roots.slice().sort((a,b)=>sizes.get(b)-sizes.get(a)||cmp(a,b)),pending=[],order=[];
    while(pending.length||roots.length){
      let a=pending.length?pending.shift():roots.shift();
      while(a!=null){
        order.push(a);
        const kids=t.children.get(a).slice().sort((a,b)=>Number(t.byAddress.get(a).punta)-Number(t.byAddress.get(b).punta)||sizes.get(b)-sizes.get(a)||cmp(a,b));
        pending.push(...kids.slice(1));a=kids[0];
      }
    }
    return order;
  }
  async function read(buffer,filename){
    SasMapping.checkZip(buffer);
    const zip=await JSZip.loadAsync(buffer),names=Object.keys(zip.files),files=new Map(names.map(n=>[n.toLowerCase(),n]));
    const maps=names.filter(n=>/^L\d{4}\/CURMAP\.rcv$/i.test(n)).sort();
    if(!maps.length)throw new Error('Este SDU no contiene el formato de Mapping EST2 admitido. SDU EST3 todavía no está incorporado.');
    const table=async name=>{const n=files.get(name);if(!n)throw new Error('Falta '+name+' en el SDU EST2.');return records(await zip.file(n).async('uint8array'),name);};
    const objects=await table('object.db'),sensors=await table('sensor.db'),modules=await table('module.db'),obj=new Map(),truth=new Map();
    for(const r of objects){if(![1,2,3,4].includes(r[1]))continue;const k=[r[0]||1,r[1],r[3]].join(':');if(obj.has(k))throw new Error('Dirección repetida en Object.db.');obj.set(k,r);}
    for(const [kind,rows] of [[1,sensors],[2,modules]])for(const r of rows){
      if(kind===2&&!r[1])continue;
      const panel=r[0]||1,loop=r[1]||1,number=r[2]-(kind===2?128:0),cc=2*loop-(kind===1?1:0),key=[panel,cc,number].join(':'),o=obj.get(key);
      if(!o)throw new Error('El SDU no tiene etiqueta por dirección para '+key+'.');
      if(!Number.isInteger(number)||number<1||number>99||panel<1||panel>99||loop<1||loop>2||!r[4]||r[3]&&!/^\d{10}$/.test(r[3]))throw new Error('Registro de dispositivo EST2 no válido.');
      if(truth.has(key))throw new Error('Dirección repetida en las tablas de dispositivos.');
      truth.set(key,{panel,loop,addr:kind*100+number,kind:kind===1?'det':'mod',serial:r[3],model:r[4],label:o[5].replace(/_/g,' ').replace(/[^A-Za-z0-9 ]/g,' ').replace(/ +/g,' ').trim().slice(0,40).trim(),location:(o[7]+' '+o[8]).replace(/[^A-Za-z0-9 ]/g,' ').replace(/ +/g,' ').trim(),next:0,level:0});
    }
    const warnings=[],loops=[];
    for(const name of maps){
      const match=/^L(\d\d)(\d\d)\//i.exec(name),panel=Number(match[1]),loopnum=Number(match[2]),title='Panel '+panel+' Loop '+loopnum;
      if(!panel||![1,2].includes(loopnum))throw new Error('Identidad de loop EST2 no compatible.');
      const satName=files.get(name.toLowerCase().replace('curmap.rcv','satoda.rcv'));
      if(!satName)throw new Error(title+': falta SATODA.');
      const data=await zip.file(name).async('uint8array'),sat=await zip.file(satName).async('uint8array');
      if(data.length!==1280||sat.length!==512)throw new Error(title+': tamaño CURMAP/SATODA no compatible.');
      const ent=new Map(),addresses=new Map();
      for(let i=0;i<256;i++){
        if(sat[2*i]||sat[2*i+1])addresses.set(i,(sat[2*i+1]&128)?100+(sat[2*i+1]&127):200+sat[2*i+1]);
        const b=data.subarray(i*5,i*5+5);if(b[0]||b[1]||b[3]||b[4])ent.set(i,{level:b[0],flags:b[1],word:b[3]*256+b[4]});
      }
      if(!ent.size)throw new Error(title+': no contiene Mapping leído del panel.');
      const invalid=base=>[...ent.values()].filter(e=>e.word&&((e.word-base)%5||!ent.has((e.word-base)/5))).length;
      let base=0x4e68;
      if(invalid(base)){
        const min=Math.min(...[...ent.values()].filter(e=>e.word).map(e=>e.word));
        const candidates=[...ent.keys()].map(c=>min-5*c).filter(b=>b>0&&!invalid(b));
        if(candidates.length===1)base=candidates[0];
        else throw new Error(title+': no se puede resolver de forma única la base de punteros.');
      }
      const devices=[],seen=new Set();
      for(const [cell,e] of ent){
        const addr=addresses.get(cell);
        if(addr==null){warnings.push(title+': celda '+cell+' sin dirección en SATODA; no se inventa su conexión.');continue;}
        if(addr<101||addr>299||addr===200||seen.has(addr))throw new Error(title+': dirección inválida o repetida en el mapa.');seen.add(addr);
        const kind=Math.floor(addr/100),key=[panel,2*loopnum-(kind===1?1:0),addr%100].join(':'),d=truth.get(key);
        let parent=0;const review=[];
        if(e.word){const pc=(e.word-base)/5;if(ent.has(pc)&&addresses.has(pc))parent=addresses.get(pc);else{review.push('padre sin dirección en SATODA');warnings.push(title+': dirección '+addr+' sin padre identificable; queda sin conexión confirmada.');}}
        if(parent===addr)throw new Error(title+': conexión de un equipo consigo mismo.');
        if(!d){review.push('sin registro en el programa');warnings.push(title+': dirección '+addr+' presente solo en el mapa.');}
        devices.push({...d,addr,kind:kind===1?'det':'mod',serial:d?d.serial:'',model:d?d.model:'',label:d?d.label:'Sin registro en el programa',location:d?d.location:'',next:parent,level:e.level,punta:(e.flags&12)===12,review,cellId:String(cell)});
      }
      for(const d of truth.values())if(d.panel===panel&&d.loop===loopnum&&!seen.has(d.addr)){
        // NACs are conventional panel circuits, not missing Signature connections.
        if(/-NAC$/.test(d.model)){warnings.push(title+': circuito '+d.addr+' '+d.model+' fuera del Mapping Signature; aparece al cargar su reporte.');continue;}
        devices.push({...d,projectOnly:true,punta:false,review:['dispositivo del programa sin dato de mapa']});
        warnings.push(title+': dirección '+d.addr+' del programa sin mapear; queda sin encadenar.');
      }
      if(!devices.length)throw new Error(title+': no hay dispositivos legibles.');
      const order=ordered(devices,title);
      loops.push({title,panel,loopnum,scopeId:loops.length+1,identityKnown:true,mapped:true,devices,order});
    }
    const covered=new Set(loops.map(l=>l.panel+':'+l.loopnum));
    for(const d of truth.values())if(!covered.has(d.panel+':'+d.loop)&&!/-NAC$/.test(d.model))throw new Error('El SDU contiene otro loop sin Mapping; no se omiten sus equipos silenciosamente.');
    if(loops.reduce((n,l)=>n+l.devices.length,0)>10000)throw new Error('El proyecto supera 10.000 dispositivos.');
    const digest=await crypto.subtle.digest('SHA-256',buffer),id=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
    return {id,family:'est2',version:'est2-sdu',obra:filename.replace(/\.sdu$/i,''),filename,loops,warnings};
  }
  global.Est2Sdu={read,records,ordered};
})(window);
