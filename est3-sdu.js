/* Native EST3 inventory and Mapping. Each 256-cell bank belongs to a physical
 * loop; SATODA stores a big-endian device address and parent cells are bank-local.
 * Verified against Offizzina's original loop-2 PDF, not converter output alone. */
(function(global){
  'use strict';
  const schemas={
    'project.db':{count:10,fields:{0:[1,8]}},
    'cabinet.db':{count:56,fields:{0:[3,2],1:[1,21]}},
    'lrm.db':{count:11,fields:{0:[3,2],1:[3,2],3:[3,2],4:[1,15],5:[1,21],8:[3,2]}},
    'object.db':{count:16,fields:{0:[3,2],1:[3,2],2:[3,2],3:[1,1],7:[1,40],9:[13,50]}},
    'sensor.db':{count:35,fields:{0:[3,2],1:[3,2],2:[3,2],3:[3,2],5:[1,10],6:[1,20],7:[3,2],15:[3,2]}},
    'module.db':{count:25,fields:{0:[3,2],1:[3,2],2:[3,2],3:[3,2],5:[1,10],6:[1,20],7:[3,2],11:[3,2]}}
  };
  const latin=b=>Array.from(b,x=>String.fromCharCode(x)).join('');
  function records(bytes,name){
    const fail=message=>{throw new Error(name+': '+message);},schema=schemas[name];
    if(!schema||bytes.length<120)fail('tabla no compatible o incompleta.');
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),size=v.getUint16(0,true),header=v.getUint16(2,true),block=bytes[5]*1024,count=v.getUint32(6,true),nf=v.getUint16(33,true);
    if(nf!==schema.count||120+2*nf>bytes.length||header<120+2*nf||header>bytes.length||!block||!size||(bytes.length-header)%block||count>100000)fail('cabecera o esquema EST3 no compatible.');
    const fields=Array.from({length:nf},(_,i)=>[bytes[120+2*i],bytes[121+2*i]]);
    if(fields.reduce((n,f)=>n+f[1],0)!==size||size>block-6||fields.some(([t,s])=>!s||![1,2,3,4,9,13,20].includes(t)||(t===3&&s!==2)||(t===9&&s!==1)))fail('tipos o longitud de registro no compatibles.');
    if(Object.entries(schema.fields).some(([i,f])=>fields[i][0]!==f[0]||fields[i][1]!==f[1]))fail('las columnas no corresponden al esquema comprobado.');
    const rows=[];
    for(let b=header;b<bytes.length;b+=block){
      const used=v.getInt16(b+4,true);if(used<0)continue;
      if(used%size||6+used+size>block)fail('bloque de registros truncado.');
      for(let r=0;r<=used/size;r++){
        let p=b+6+r*size;
        rows.push(fields.map(([type,len])=>{
          const data=bytes.subarray(p,p+len);p+=len;
          if(type===3){const n=data[0]*256+data[1];return n?n-32768:null;}
          if(type===1)return latin(data).replace(/\0+$/,'').trim();
          if(type===9)return !!(data[0]&127);
          if(type===13){
            if(data[0]===0x90){if(data[1]>len-12)return {external:true};return latin(data.subarray(2,2+data[1]));}
            return latin(data).replace(/\0+$/,'');
          }
          return null; // Unused numeric/version fields are never guessed.
        }));
      }
    }
    if(rows.length!==count)fail('el recuento no coincide con la cabecera.');
    return rows;
  }
  function message(raw){
    let text=typeof raw==='string'?raw:'';
    if(text.startsWith('\x10')){const size=text.charCodeAt(1);if(size>text.length-2)throw new Error('Mensaje LCD truncado.');text=text.slice(2,2+size);}
    return text.replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim();
  }
  function nativeOrder(devices,title){
    const tree=SasMapping.buildTree(devices,title,[]),sizes=new Map();
    for(const a of tree.order.slice().reverse())sizes.set(a,1+tree.children.get(a).reduce((n,c)=>n+sizes.get(c),0));
    const tie=(a,b)=>tree.byAddress.get(a).level-tree.byAddress.get(b).level||a-b;
    const roots=tree.roots.slice().sort((a,b)=>Number(!!tree.byAddress.get(a).projectOnly)-Number(!!tree.byAddress.get(b).projectOnly)||sizes.get(b)-sizes.get(a)||tie(a,b));
    const stack=roots.reverse(),order=[];
    while(stack.length){
      const a=stack.pop();order.push(a);
      const children=tree.children.get(a).slice().sort((a,b)=>Number(!!tree.byAddress.get(a).punta)-Number(!!tree.byAddress.get(b).punta)||sizes.get(b)-sizes.get(a)||tie(a,b));
      stack.push(...children.reverse());
    }
    return order;
  }
  async function read(buffer,filename){
    SasMapping.checkZip(buffer);
    const zip=await JSZip.loadAsync(buffer),names=new Map(Object.keys(zip.files).map(n=>[n.toLowerCase(),n]));
    const bytes=async name=>{if(!names.has(name))throw new Error('Falta '+name+' en el SDU EST3.');return zip.file(names.get(name)).async('uint8array');};
    const table=async name=>records(await bytes(name),name);
    const project=await table('project.db'),cabinets=await table('cabinet.db'),cards=await table('lrm.db'),objects=await table('object.db'),sensors=await table('sensor.db'),modules=await table('module.db');
    if(project.length!==1||!project[0][0])throw new Error('El SDU no identifica un proyecto único.');
    const cabinetNames=new Map(),controllers=new Map(),labels=new Map(),groups=new Map(),warnings=[];
    for(const r of cabinets){if(r[0]==null)continue;if(cabinetNames.has(r[0])||!r[1])throw new Error('Gabinete repetido o sin nombre.');cabinetNames.set(r[0],r[1]);}
    for(const r of cards){
      if(!/^3-S[SD]DC\d*$/.test(r[4])||!r[3])continue;
      const key=r[0]+':'+r[1];if(controllers.has(key)||!cabinetNames.has(r[0])||!r[5]||!Number.isInteger(r[8])||r[8]<1)throw new Error('Controlador EST3 sin identidad única.');
      controllers.set(key,{panel:r[0],slot:r[1],cabinet:cabinetNames.get(r[0]),controller:r[5],controllerAddress:r[8],cardModel:r[4]});
    }
    for(const r of objects){if(r[3]!=='L')continue;const key=[r[0],r[1],r[2]].join(':');if(labels.has(key))throw new Error('Dirección repetida en Object.db.');labels.set(key,r);}
    for(const [kind,rows] of [['det',sensors],['mod',modules]])for(const r of rows){
      let model=String(r[6]||'').toUpperCase();if(!model||model==='NONE')continue;
      const controller=controllers.get(r[0]+':'+r[1]);if(!controller)throw new Error('Un grupo de equipos no pertenece a un controlador Signature compatible.');
      const addr=r[2],loopnum=r[3],key=[r[0],r[1],loopnum].join(':');
      if(![1,2].includes(loopnum)||!Number.isInteger(addr)||addr<1+250*(loopnum-1)||addr>250*loopnum||r[5]&&!/^\d{10}$/.test(r[5]))throw new Error('Dirección, loop o serial EST3 no válido.');
      if(loopnum===2&&!controller.cardModel.startsWith('3-SDDC'))throw new Error('La tarjeta no declara un segundo loop.');
      if(!groups.has(key))groups.set(key,{...controller,loopnum,devices:new Map()});
      const group=groups.get(key);if(group.devices.has(addr))throw new Error('Dirección repetida en sensor/module.');
      const o=labels.get([r[0],r[1],addr].join(':')),review=[];
      if(!o||!o[7])review.push('sin etiqueta en Object.db');
      if(o&&o[9]&&o[9].external)review.push('mensaje externo del SDU; completar ubicación con el reporte');
      if(!r[5])review.push('sin serial declarado en el SDU');
      if(!model.startsWith('SIGA-'))model='SIGA-'+model;
      group.devices.set(addr,{addr,kind,model,serial:r[5],label:o?o[7]:'Sin etiqueta',location:o?message(o[9]):'',nativeAddress:String(r[0]).padStart(2,'0')+String(controller.controllerAddress).padStart(2,'0')+String(addr).padStart(4,'0'),next:0,level:0,projectOnly:true,punta:false,review});
    }
    // Inventory also includes Mapping-only loops, even when the program has no rows.
    const maps=new Map();
    for(const [name] of names){
      const match=/^l(\d\d)(\d\d)(\d)\/curmap\.rcv$/.exec(name);if(!match)continue;
      if(match[3]!=='1')throw new Error('Organización de carpetas de Mapping EST3 no comprobada.');
      const panel=Number(match[1]),slot=Number(match[2]),controller=controllers.get(panel+':'+slot);
      const data=await bytes(name);if(data.length!==2048)throw new Error('Tamaño CURMAP EST3 no compatible.');
      if(!data.some(Boolean))continue;
      if(!controller)throw new Error('Mapping sin controlador compatible en Lrm.db.');
      const sat=await bytes(name.replace('curmap.rcv','satoda.rcv'));if(sat.length!==1024)throw new Error('Tamaño SATODA EST3 no compatible.');
      for(let bank=0;bank<2;bank++){
        const entries=new Map(),addresses=new Set(),loopnum=bank+1,key=[panel,slot,loopnum].join(':');
        for(let i=bank*256;i<(bank+1)*256;i++){
          const flag=data[i*4];if(!flag)continue;
          if(![0xd0,0xe0,0xf0,0xf8].includes(flag))throw new Error('Bandera de Mapping EST3 no compatible.');
          const addr=sat[i*2]*256+sat[i*2+1];
          if(!addr){warnings.push(controller.controller+' / Loop '+loopnum+': celda '+i+' sin dirección SATODA; no se inventa.');continue;}
          if(addr<=250*bank||addr>250*(bank+1)||addresses.has(addr))throw new Error('Dirección de mapa repetida o incompatible con su loop.');addresses.add(addr);
          entries.set(i,{addr,flag,parentCell:data[i*4+1]?bank*256+data[i*4+1]:null,level:data[i*4+2],cellId:String(i)});
        }
        if(!entries.size)continue;
        if(bank===1&&!controller.cardModel.startsWith('3-SDDC'))throw new Error('Mapping del segundo loop en una tarjeta de un solo loop.');
        if(!groups.has(key))groups.set(key,{...controller,loopnum,devices:new Map()});
        maps.set(key,entries);
      }
    }
    const loops=[];
    for(const [key,group] of [...groups].sort((a,b)=>a[1].panel-b[1].panel||a[1].slot-b[1].slot||a[1].loopnum-b[1].loopnum)){
      const entries=maps.get(key)||new Map(),devices=new Map(group.devices),title=group.cabinet+' / '+group.controller+' / Loop Number '+group.loopnum;
      for(const entry of entries.values()){
        const old=devices.get(entry.addr),review=old?old.review.slice():['presente en el mapa, ausente del programa'];
        const parent=entry.parentCell==null?null:entries.get(entry.parentCell);
        if(entry.parentCell!=null&&!parent)review.push('padre ausente del mapa');
        if(parent&&parent.addr===entry.addr)throw new Error(title+': conexión de un equipo consigo mismo.');
        devices.set(entry.addr,{...old,addr:entry.addr,kind:old?old.kind:'',model:old?old.model:'',serial:old?old.serial:'',label:old?old.label:'Sin registro en el programa',location:old?old.location:'',next:parent?parent.addr:0,level:entry.level,punta:[0xf0,0xf8].includes(entry.flag),projectOnly:false,review,cellId:entry.cellId});
      }
      const list=[...devices.values()];
      const unchained=list.filter(d=>d.projectOnly);if(unchained.length)warnings.push(title+': '+unchained.length+' equipos del programa sin Mapping; se conservan sin encadenar.');
      const missing=list.filter(d=>d.review.length&&!d.projectOnly);if(missing.length)warnings.push(title+': '+missing.length+' equipos del mapa requieren revisión; consulta el detalle.');
      const order=nativeOrder(list,title);
      const {devices:unused,...identity}=group;
      loops.push({...identity,title,scopeId:loops.length+1,mapped:entries.size>0,identityKnown:true,devices:list,order});
    }
    if(!loops.length||loops.reduce((n,l)=>n+l.devices.length,0)>10000)throw new Error('Cantidad de dispositivos EST3 no admitida.');
    const id=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(b=>b.toString(16).padStart(2,'0')).join('');
    return {id,family:'est3',version:'est3-sdu',obra:project[0][0],filename,loops,warnings};
  }
  async function readAny(buffer,filename){
    SasMapping.checkZip(buffer);const zip=await JSZip.loadAsync(buffer);
    return Object.keys(zip.files).some(n=>n.toLowerCase()==='lrm.db')?read(buffer,filename):Est2Sdu.read(buffer,filename);
  }
  global.Est3Sdu={read,readAny,records};
})(window);
