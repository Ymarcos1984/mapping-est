/* EST4 Barcode Worksheet: read physical columns, including rotated PDFs. */
(function () {
  'use strict';
  function itemsOf(page, content) {
    const m = page.getViewport({scale: 1}).transform;
    return content.items.filter(it => typeof it.str === 'string' && it.str.trim()).map(it => {
      const x = it.transform[4], y = it.transform[5];
      return {s: it.str.trim(), x: m[0]*x+m[2]*y+m[4], y: m[1]*x+m[3]*y+m[5]};
    });
  }
  function readPage(page, content, columns, pageNumber) {
    const items = itemsOf(page, content);
    const names = ['Label :', 'Model', 'Location Text', 'Serial Number Barcode'];
    const headers = names.map(n => items.find(it => it.s === n));
    if (headers.every(Boolean)) {
      columns.x = headers.map(h => h.x);
      columns.headerY = Math.max(...items.filter(it => it.s === 'System Address').map(it => it.y));
    }
    if (!columns.x || !columns.x.every((x,i,a) => !i || x > a[i-1])) throw new Error('No se reconocen las columnas del reporte EST4.');
    const anchors = items.filter(it => /^\d{3}:\d{3}:\d{4}$/.test(it.s)).sort((a,b)=>a.y-b.y);
    let previous = headers.every(Boolean) ? columns.headerY + 2 : 0;
    const join = list => list.sort((a,b)=>a.y-b.y || a.x-b.x).map(it=>it.s).join(' ');
    const rows = anchors.map(anchor => {
      const block = items.filter(it=>it.y>previous && it.y<=anchor.y+1 && it!==anchor);
      previous = anchor.y+2;
      const cells = columns.x.map((x,i)=>block.filter(it=>it.x>=x-3 && (i===3 || it.x<columns.x[i+1]-3)));
      const model = cells[1].filter(it=>/^SIGA[- ]/i.test(it.s));
      const slc = cells[2].filter(it=>/^[12]$/.test(it.s) && model.length && it.y>model[0].y+5);
      if (model.length!==1 || slc.length!==1) throw new Error('Fila EST4 incompleta en página '+pageNumber+', dirección '+anchor.s+'.');
      const detailY = slc[0].y;
      const serials = cells[3].filter(it=>/^\d{10}$/.test(it.s));
      const omitted = cells[3].some(it=>/Do Not Stick Serial Number/i.test(it.s));
      if (serials.length>1 || (!serials.length && !omitted)) throw new Error('Serial EST4 no reconocido en '+anchor.s+'.');
      return {key:anchor.s.slice(-4),address:anchor.s,label:join(cells[0].filter(it=>it.y<detailY-3)),
        model:model[0].s,location:join(cells[2].filter(it=>it.y<detailY-3)),
        type:join(cells[0].filter(it=>Math.abs(it.y-detailY)<3)),
        controller:join(cells[1].filter(it=>Math.abs(it.y-detailY)<3)),slc:slc[0].s,
        serial:serials.length?serials[0].s:'',serialOmitted:omitted,sourceFamily:'est4'};
    });
    const models = items.filter(it=>/^SIGA[- ]/i.test(it.s));
    if (models.length!==rows.length || !rows.length) throw new Error('La página '+pageNumber+' del reporte EST4 no se pudo leer completa.');
    return rows;
  }
  function validate(rows) {
    if (!Array.isArray(rows) || rows.some(r => !r || ['key','address','label','model','location','type','controller','slc','serial'].some(k => typeof r[k] !== 'string') || !/^\d{3}:\d{3}:\d{4}$/.test(r.address) || r.key !== r.address.slice(-4) || !/^[12]$/.test(r.slc) || (r.serial ? !/^\d{10}$/.test(r.serial) : r.serialOmitted !== true))) throw new Error('Filas guardadas del reporte EST4 no válidas.');
    if (!rows.length || new Set(rows.map(r=>r.address)).size!==rows.length) throw new Error('El reporte EST4 está vacío o tiene direcciones repetidas.');
    if (new Set(rows.map(r=>r.address.slice(0,7)+':'+r.slc)).size!==1) throw new Error('Este reporte EST4 contiene varios controladores o SLC. Exporta el reporte del loop que estás revisando.');
  }
  window.Est4Report = {readPage, validate};
})();
