/* BRS tabular serial reports paired with an EST2 Mapping by device evidence. */
(function(global){
  'use strict';
  const HEADERS=['Address','Serial Number','Model','Device Type','Label','EST4 Label','Message','Floor','Ch'];
  const norm=s=>String(s||'').replace(/[_\s]+/g,' ').trim().toUpperCase();
  function isReport(content){const names=new Set(content.items.map(i=>i.str&&i.str.trim()));return HEADERS.every(h=>names.has(h));}
  function readPage(content,pageNumber){
    const items=content.items.filter(i=>typeof i.str==='string'&&i.str.trim());
    const headers=HEADERS.map(name=>items.find(i=>i.str.trim()===name));
    if(headers.some(h=>!h))throw new Error('Página '+pageNumber+': faltan columnas del reporte.');
    if(headers.some(h=>Math.abs(h.transform[5]-headers[0].transform[5])>2))throw new Error('Encabezado del reporte no compatible.');
    const body=items.filter(i=>i.transform[5]<headers[0].transform[5]-3);
    const anchors=body.filter(i=>i.transform[4]<headers[1].transform[4]-2&&/^\d{2}\s+\d{2}\s+\d{2}$/.test(i.str.trim())).sort((a,b)=>b.transform[5]-a.transform[5]);
    if(!anchors.length)throw new Error('Página '+pageNumber+': no se encontraron filas completas.');
    const rows=anchors.map(()=>HEADERS.map(()=>[]));
    for(const item of body){
      // Cells are vertically centered: wrapped text can start above its address.
      const y=item.transform[5],row=anchors.findIndex((a,i)=>i===anchors.length-1||y>(a.transform[5]+anchors[i+1].transform[5])/2);
      if(row<0)throw new Error('Texto fuera de las filas del reporte en página '+pageNumber+'.');
      let col=0;headers.forEach((h,i)=>{if(item.transform[4]>=h.transform[4]-1)col=i;});rows[row][col].push(item);
    }
    return rows.map(cells=>{
      const values=cells.map(cell=>cell.sort((a,b)=>b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4]).map(i=>i.str.trim()).join(' ').trim());
      const address=/^(\d{2})\s+(\d{2})\s+(\d{2})$/.exec(values[0]);
      if(!address||!values[2]||!values[4]||values[1]&&!/^\d{10}$/.test(values[1]))throw new Error('Fila incompleta o serial no válido en página '+pageNumber+'.');
      const panel=Number(address[1]),group=Number(address[2]),number=Number(address[3]);
      if(!panel||![1,2].includes(group)||!number)throw new Error('El reporte no usa las direcciones EST2 comprobadas.');
      return {address:[address[1],address[2],address[3]].join(' '),panel,group,number,mapAddress:group*100+number,serial:values[1],model:values[2],type:values[3],label:values[4],est4Label:values[5],location:values[6],floor:values[7],channel:values[8],page:pageNumber};
    });
  }
  function validate(reports){
    if(!Array.isArray(reports)||reports.length>100)throw new Error('Lista de reportes EST2 no válida.');
    for(const r of reports){
      if(!r||!/^[a-f0-9]{64}$/.test(r.id)||typeof r.filename!=='string'||!Array.isArray(r.rows)||!r.rows.length||r.rows.length>10000)throw new Error('Reporte EST2 no válido.');
      const addresses=new Set();
      for(const row of r.rows){
        if(!row||!Number.isInteger(row.panel)||row.panel<1||row.panel>99||![1,2].includes(row.group)||!Number.isInteger(row.number)||row.number<1||row.number>99||row.mapAddress!==row.group*100+row.number||['serial','model','type','label','est4Label','location','floor','channel','address'].some(k=>typeof row[k]!=='string')||row.serial&&!/^\d{10}$/.test(row.serial))throw new Error('Fila de sesión EST2 no válida.');
        const key=row.panel+':'+row.mapAddress;if(addresses.has(key))throw new Error('Dirección repetida en un mismo reporte EST2.');addresses.add(key);
      }
    }
  }
  function chooseScope(rows,state){
    const candidates=[];
    for(const source of state.sasSources||[]){if(source.family!=='est2')continue;
      for(const loop of source.loops){
        if(loop.identityKnown===true&&rows.some(r=>r.panel!==loop.panel||Math.ceil(r.group/2)!==loop.loopnum))continue;
        let serials=0,labels=0;
        for(const row of rows){const d=loop.devices.find(d=>d.addr===row.mapAddress);if(!d)continue;
          if(row.serial&&row.serial===d.serial)serials++;
          if(norm(row.label)===norm(d.label)&&norm(row.model)===norm(d.model))labels++;
        }
        if(serials>=2||labels>=3)candidates.push({source,loop});
      }
    }
    return candidates.length===1?candidates[0]:null;
  }
  function enrich(state){
    const reports=state.est2Reports||[];
    Object.keys(state.dev).forEach(k=>{if(state.dev[k].est2ReportOnly)delete state.dev[k];});
    Object.values(state.dev).filter(d=>d.sourceFamily==='est2').forEach(d=>{
      d.serial=d.mserial;d.serialSource='mapping';d.reportSerial='';d.reportAddress='';d.reportMissing=false;d.reportSerialMissing=false;d.serialConflict='';d.reportLocation='';d.location=d.sourceLocation||'';
      d.reportLabel='';d.rtype='';d.reportFloor='';d.reportChannel='';
    });
    const current=new Map();let pending=0;
    for(const report of reports){
      const panels=new Map();for(const row of report.rows){if(!panels.has(row.panel))panels.set(row.panel,[]);panels.get(row.panel).push(row);}
      for(const [panel,rows] of panels){
        const target=chooseScope(rows,state);if(!target){pending+=rows.length;continue;}
        const scope=SasMapping.scope(target.source,target.loop);
        const groups=new Set(rows.map(r=>r.group));
        for(const group of groups)current.set(scope+':p'+panel+':group'+group,{...target,scope,panel,group,rows:rows.filter(r=>r.group===group)});
      }
    }
    // A Mapping with no panel number must not absorb two physical panels.
    const panelsByScope=new Map();for(const g of current.values()){if(!panelsByScope.has(g.scope))panelsByScope.set(g.scope,new Set());panelsByScope.get(g.scope).add(g.panel);}
    for(const group of current.values()){
      if(panelsByScope.get(group.scope).size!==1){pending+=group.rows.length;continue;}
      const seen=new Set();
      for(const row of group.rows){
        const key=SasMapping.key(group.source,group.loop,row.mapAddress);seen.add(key);let d=state.dev[key];
        if(!d){d=state.dev[key]={key,sasId:group.source.id,sourceFamily:'est2',scope:group.scope,scopeLabel:group.source.obra+' · '+group.loop.title,panel:group.loop.panel,loopnum:group.loop.loopnum,address:String(row.mapAddress),label:row.label,location:'',model:row.model,mtype:row.model,mserial:'',parent:null,children:0,depth:0,pos:0,mapOrder:100000+row.mapAddress,inMap:false,est2ReportOnly:true};}
        d.serial=row.serial;d.reportSerial=row.serial;d.serialSource='report';d.serialPartial=false;d.reportSerialMissing=!row.serial;
        d.reportAddress=row.address;d.reportLocation=row.location;d.location=row.location;d.reportLabel=row.label;d.rtype=row.type;d.type=d.type||row.type;d.reportFloor=row.floor;d.reportChannel=row.channel;
        d.serialConflict=d.inMap&&row.serial&&row.serial!==d.mserial?'Serial actualizado con el reporte. Se conserva el serial del Mapping como referencia.':'';
      }
      Object.values(state.dev).filter(d=>d.sourceFamily==='est2'&&d.scope===group.scope&&d.inMap&&Math.floor(Number(d.address)/100)===group.group&&!seen.has(d.key)).forEach(d=>{d.reportMissing=true;});
    }
    state.est2PendingCount=pending;
  }
  function noticeFor(state,scope){
    if(!(state.est2Reports||[]).length)return '';
    const records=Object.values(state.dev).filter(d=>d.sourceFamily==='est2'&&(!scope||d.scope===scope)),linked=records.filter(d=>d.inMap&&d.serialSource==='report').length,extra=records.filter(d=>d.est2ReportOnly).length,blank=records.filter(d=>d.reportSerialMissing).length;
    return 'Reporte EST2: '+linked+' equipos del Mapping enlazados · '+extra+' solo en reporte. Para los equipos enlazados se usa el serial del reporte.'+(blank?' '+blank+' filas sin serial declarado.':'')+(!scope&&state.est2PendingCount?' '+state.est2PendingCount+' filas pendientes: falta un Mapping con coincidencia única.':'');
  }
  global.Est2Report={isReport,readPage,validate,enrich,noticeFor,chooseScope};
})(window);
