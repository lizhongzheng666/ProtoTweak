/* Headless Edge smoke test via CDP. Uses Node built-ins only. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9334;
const PROFILE = path.resolve('.cdp-profile-hash');
const ENTRY = process.argv[2] || 'file:///C:/work/html-editer/HTML-Workbench-main/app/index.html';

let ws;
let nextId = 1;
const pending = new Map();
const exceptions = [];
const consoleErrors = [];

function cdp(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* wait */ }
    await sleep(150);
  }
  throw new Error('CDP target not found');
}

async function evalExpr(expression) {
  const res = await cdp('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.text + ' ' + JSON.stringify(res.exceptionDetails.exception || {}));
  }
  return res.result ? res.result.value : undefined;
}

async function waitFor(expression, label, timeout = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await evalExpr(expression)) return true;
    } catch (e) { /* retry */ }
    await sleep(120);
  }
  let diag = '';
  try {
    diag = JSON.stringify(await evalExpr(`(function(){
      return {
        loaded: !!(window.WB && WB.app && WB.app.isLoaded()),
        loading: !!(window.WB && WB.app && WB.app.isLoading()),
        ready: !!(window.WB && WB.stage && WB.stage.isReady()),
        toast: (document.getElementById('toast-container')||{}).textContent || '',
        stageHidden: !!(document.getElementById('stage')||{}).hidden,
        srcdocLen: ((document.getElementById('stage')||{}).srcdoc||'').length,
        bodyClass: document.body.className,
        errs: window.__wbErrors || []
      };
    })()`));
  } catch (e) { diag = 'diag failed: ' + e.message; }
  throw new Error('Timed out: ' + label + ' ' + diag);
}

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(PROFILE, { recursive: true });
  const browser = spawn(EDGE, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-extensions',
    '--window-size=1600,1000',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    const url = await connect();
    ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails || {};
        const frames = (d.stackTrace && d.stackTrace.callFrames || []).map((f) => `${f.functionName || '(anon)'} @ ${f.url}:${f.lineNumber + 1}:${f.columnNumber + 1}`).join(' <- ');
        exceptions.push((d.exception && (d.exception.description || d.exception.value)) || d.text || 'exception' + (frames ? ' :: ' + frames : ''));
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push(msg.params.args.map((a) => a.value || a.description || '').join(' '));
      }
    });
    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__wbErrors = [];
        window.addEventListener('error', function (e) {
          try { window.__wbErrors.push(String(e.message || e.error || 'error') + ' @ ' + (e.filename || '') + ':' + (e.lineno || '')); } catch (err) {}
        });
        window.addEventListener('unhandledrejection', function (e) {
          try { window.__wbErrors.push('unhandled: ' + String(e.reason && (e.reason.stack || e.reason.message) || e.reason)); } catch (err) {}
        });`
    });
    await cdp('Page.navigate', { url: ENTRY });
    await sleep(1200);
    await waitFor('!!(window.WB && WB.app && WB.stage && WB.app.isLoaded() === false)', 'app boot');
    console.log('BOOT ok');

    await evalExpr(`document.getElementById('btn-sample-2').click()`);
    await waitFor('WB.app.isLoaded() && WB.stage.isReady()', 'sample loaded');
    console.log('SAMPLE loaded');

    const h1 = await evalExpr(`(function(){var d=WB.stage.getDoc();var h=d.querySelector('h1');return h?h.textContent:''})()`);
    console.log('H1:', h1);

    async function realMouse(type, x, y, modifiers = 0, buttons = 0) {
      await cdp('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: type === 'mouseMoved' ? 'none' : 'left',
        buttons,
        clickCount: 1,
        modifiers
      });
    }
    const cellPoint = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var c=d.querySelector('tbody td')||d.querySelector('td');
      var ir=document.getElementById('stage').getBoundingClientRect(); var r=c.getBoundingClientRect();
      return {x:ir.left+r.left+r.width/2,y:ir.top+r.top+r.height/2};
    })()`);
    await realMouse('mouseMoved', cellPoint.x, cellPoint.y);
    await realMouse('mousePressed', cellPoint.x, cellPoint.y, 1, 1);
    await realMouse('mouseReleased', cellPoint.x, cellPoint.y, 1, 0);
    await sleep(250);
    const realHandles = await evalExpr(`(function(){
      var s=WB.selection.get(); var c=document.querySelector('#table-layer .col-handle'); var r=document.querySelector('#table-layer .row-handle');
      var t=WB.stage.getDoc().querySelector('table'); var cr=t.querySelector('colgroup col');
      return {kind:s.kind, colHidden:c.hidden, rowHidden:r.hidden,
        colRect:c.getBoundingClientRect().toJSON(), rowRect:r.getBoundingClientRect().toJSON(),
        colWidth:cr?parseFloat(cr.style.width):0, tableWidth:t.getBoundingClientRect().width};
    })()`);
    console.log('REAL HANDLES:', JSON.stringify(realHandles));
    if (!realHandles.colHidden && !realHandles.rowHidden) {
      const cx = realHandles.colRect.left + 3;
      const cy = realHandles.colRect.top + 25;
      await realMouse('mouseMoved', cx, cy, 0, 0);
      await realMouse('mousePressed', cx, cy, 0, 1);
      await realMouse('mouseMoved', cx + 50, cy, 0, 1);
      await realMouse('mouseReleased', cx + 50, cy, 0, 0);
      await sleep(250);
      const rx = realHandles.rowRect.left + 30;
      const ry = realHandles.rowRect.top + 3;
      const afterCol = await evalExpr(`(function(){
        var t=WB.stage.getDoc().querySelector('table'); var c=t.querySelector('colgroup col');
        return {colWidth:c?parseFloat(c.style.width):0, tableWidth:t.getBoundingClientRect().width, rowH:t.querySelector('tbody tr').style.height};
      })()`);
      await realMouse('mouseMoved', rx, ry, 0, 0);
      await realMouse('mousePressed', rx, ry, 0, 1);
      await realMouse('mouseMoved', rx, ry + 40, 0, 1);
      await realMouse('mouseReleased', rx, ry + 40, 0, 0);
      await sleep(250);
      const afterRow = await evalExpr(`(function(){
        var t=WB.stage.getDoc().querySelector('table'); var c=t.querySelector('colgroup col');
        return {colWidth:c?parseFloat(c.style.width):0, tableWidth:t.getBoundingClientRect().width, rowH:t.querySelector('tbody tr').style.height};
      })()`);
      console.log('REAL RESIZE:', JSON.stringify({afterCol, afterRow}));
      await evalExpr(`WB.history.undo();WB.history.undo();`);
    }

    await realMouse('mouseMoved', cellPoint.x, cellPoint.y);
    await realMouse('mousePressed', cellPoint.x, cellPoint.y, 0, 1);
    await realMouse('mouseReleased', cellPoint.x, cellPoint.y, 0, 0);
    await sleep(250);
    const tableModeHandles = await evalExpr(`(function(){
      var s=WB.selection.get(); var c=document.querySelector('#table-layer .col-handle'); var r=document.querySelector('#table-layer .row-handle');
      var t=WB.stage.getDoc().querySelector('table'); var cr=t.querySelector('colgroup col');
      return {kind:s.kind, colHidden:c.hidden, rowHidden:r.hidden,
        colRect:c.getBoundingClientRect().toJSON(), rowRect:r.getBoundingClientRect().toJSON(),
        colWidth:cr?parseFloat(cr.style.width):0, tableWidth:t.getBoundingClientRect().width};
    })()`);
    console.log('TABLE MODE HANDLES:', JSON.stringify(tableModeHandles));
    if (!tableModeHandles.colHidden && !tableModeHandles.rowHidden) {
      const cx = tableModeHandles.colRect.left + 4;
      const cy = tableModeHandles.colRect.top + 25;
      await realMouse('mouseMoved', cx, cy, 0, 0);
      await realMouse('mousePressed', cx, cy, 0, 1);
      await realMouse('mouseMoved', cx + 40, cy, 0, 1);
      await realMouse('mouseReleased', cx + 40, cy, 0, 0);
      await sleep(200);
      const rx = tableModeHandles.rowRect.left + 30;
      const ry = tableModeHandles.rowRect.top + 4;
      await realMouse('mouseMoved', rx, ry, 0, 0);
      await realMouse('mousePressed', rx, ry, 0, 1);
      await realMouse('mouseMoved', rx, ry + 30, 0, 1);
      await realMouse('mouseReleased', rx, ry + 30, 0, 0);
      await sleep(200);
      const tableModeAfter = await evalExpr(`(function(){
        var t=WB.stage.getDoc().querySelector('table'); var c=t.querySelector('colgroup col'); var tr=t.querySelector('tbody tr');
        return {colWidth:c?parseFloat(c.style.width):0, tableWidth:t.getBoundingClientRect().width, rowH:tr.style.height, kind:WB.selection.get().kind};
      })()`);
      console.log('TABLE MODE RESIZE:', JSON.stringify(tableModeAfter));

      const bodyRowHandle = await evalExpr(`(function(){
        var h=document.querySelector('#table-layer .row-handle[data-row="1"]');
        return h?h.getBoundingClientRect().toJSON():null;
      })()`);
      if (bodyRowHandle) {
        const bx = bodyRowHandle.left + 30;
        const by = bodyRowHandle.top + 4;
        await realMouse('mouseMoved', bx, by, 0, 0);
        await realMouse('mousePressed', bx, by, 0, 1);
        await realMouse('mouseMoved', bx, by + 30, 0, 1);
        await realMouse('mouseReleased', bx, by + 30, 0, 0);
        await sleep(200);
        const bodyRowAfter = await evalExpr(`(function(){
          var t=WB.stage.getDoc().querySelector('table');
          return {row1:t.rows[1].style.height,row2:t.rows[2].style.height};
        })()`);
        console.log('BODY ROW RESIZE:', JSON.stringify(bodyRowAfter));
      }
      await evalExpr(`WB.history.undo();WB.history.undo();WB.history.undo();`);

      await evalExpr(`(function(){var t=WB.stage.getDoc().querySelector('table');t.style.transform='scale(0.8)';WB.selection.selectTable(t,t.querySelector('td'));WB.table.refreshHandles();})()`);
      await sleep(200);
      const scaled = await evalExpr(`(function(){
        var c=document.querySelector('#table-layer .col-handle'); var r=document.querySelector('#table-layer .row-handle');
        var t=WB.stage.getDoc().querySelector('table'); var col=t.querySelector('tbody tr td');
        return {kind:WB.selection.getKind(),colHidden:c.hidden,rowHidden:r.hidden,handleMeta:!!WB.table,ops:WB.ops.get(),colRect:c.getBoundingClientRect().toJSON(),rowRect:r.getBoundingClientRect().toJSON(),start:col.getBoundingClientRect().width};
      })()`);
      const scx = scaled.colRect.left + 4;
      const scy = scaled.colRect.top + 25;
      await realMouse('mouseMoved', scx, scy, 0, 0);
      await realMouse('mousePressed', scx, scy, 0, 1);
      await realMouse('mouseMoved', scx + 40, scy, 0, 1);
      await realMouse('mouseReleased', scx + 40, scy, 0, 0);
      await sleep(200);
      const scaledAfter = await evalExpr(`(function(){
        var t=WB.stage.getDoc().querySelector('table'); var c=t.querySelector('colgroup col');
        return {colWidth:c?parseFloat(c.style.width):0,tableWidth:parseFloat(t.style.width)||0};
      })()`);
      console.log('SCALED RESIZE:', JSON.stringify({scaled,scaledAfter}));
      await evalExpr(`(function(){var t=WB.stage.getDoc().querySelector('table');t.style.transform='';WB.history.undo();})()`);
    }

    await evalExpr(`(function(){var d=WB.stage.getDoc();WB.selection.select(d.querySelector('h1'));})()`);
    await sleep(200);
    const boxes = await evalExpr(`document.querySelectorAll('#selection-layer .sel-box').length`);
    console.log('SELECT boxes:', boxes);
    try {
      const shot = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.resolve('test/_ui-style.png'), Buffer.from(shot.data, 'base64'));
    } catch (e) { /* ignore */ }

    await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var h=d.querySelector('h1');
      WB.textEdit.start(h); h.textContent='鏀硅繃鐨勬爣棰?; WB.textEdit.finish({commit:true});
      return h.textContent;
    })()`);
    const h1b = await evalExpr(`WB.stage.getDoc().querySelector('h1').textContent`);
    console.log('TEXT edited:', h1b);

    const dragBefore = await evalExpr(`WB.stage.getDoc().querySelector('h1').getAttribute('style') || ''`);
    await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var win=d.defaultView; var h=d.querySelector('h1');
      WB.selection.select(h);
      function ev(type,x,y,buttons){ return new win.PointerEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0,buttons:buttons,pointerId:7,pointerType:'mouse',isPrimary:true,view:win}); }
      h.dispatchEvent(ev('pointerdown',200,120,1));
      d.dispatchEvent(ev('pointermove',240,140,1));
      d.dispatchEvent(ev('pointerup',240,140,0));
      return h.style.translate || h.style.transform || h.style.left || '';
    })()`);
    const dragAfter = await evalExpr(`WB.stage.getDoc().querySelector('h1').getAttribute('style') || ''`);
    console.log('DRAG style changed:', dragBefore !== dragAfter, dragAfter);

    await evalExpr(`(function(){var d=WB.stage.getDoc();WB.selection.clear();WB.insert.insert('text');})()`);
    const inserted = await evalExpr(`WB.stage.getDoc().querySelectorAll('p').length`);
    console.log('INSERT p count:', inserted);

    await evalExpr(`(function(){var d=WB.stage.getDoc();var t=d.querySelector('table');WB.selection.selectTable(t,t.querySelector('td'));WB.table.applyOperation('row-add');WB.table.applyOperation('col-add');})()`);
    const tableShape = await evalExpr(`(function(){var t=WB.stage.getDoc().querySelector('table');return [t.rows.length,t.rows[0].cells.length,t.querySelectorAll('colgroup col').length].join(',')})()`);
    console.log('TABLE shape:', tableShape);

    await evalExpr(`WB.annotations.setMode(true)`);
    await evalExpr(`(function(){var d=WB.stage.getDoc();var h=d.querySelector('h1');h.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:10,clientY:10}));})()`);
    await sleep(200);
    const annCount = await evalExpr(`WB.annotations.list().length`);
    console.log('ANN count:', annCount);
    const cardOpen = await evalExpr(`!document.getElementById('ann-card').hidden`);
    console.log('ANN card open:', cardOpen);
    try {
      const shot = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.resolve('test/_ui.png'), Buffer.from(shot.data, 'base64'));
    } catch (e) { /* ignore */ }
    await evalExpr(`(function(){var t=document.getElementById('ann-card-content');t.value='寮€鍙戠‘璁わ細鎸夐挳鐘舵€?;t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await evalExpr(`document.getElementById('ann-card-save').click()`);
    await sleep(200);
    const annContent = await evalExpr(`WB.annotations.list()[0] && WB.annotations.list()[0].content`);
    console.log('ANN content:', annContent);

    const pinCount = await evalExpr(`document.querySelectorAll('#annotation-layer .ann-pin').length`);
    console.log('PINS:', pinCount);

    const clean = await evalExpr(`WB.export.cleanHtml()`);
    console.log('CLEAN leaks:', /data-wb|__wb|ann-card|ann-pin|annotation-layer/.test(clean), 'len', clean.length);
    const cleanEditing = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var h=d.querySelector('h1'); WB.textEdit.start(h);
      h.textContent='瀵煎嚭鏃舵鍦ㄧ紪杈?;
      var c=WB.export.cleanHtml();
      WB.textEdit.finish({commit:true});
      return {contenteditable:c.indexOf('contenteditable')!==-1, aid:c.indexOf('data-wb-aid')!==-1, text:c.indexOf('瀵煎嚭鏃舵鍦ㄧ紪杈?)!==-1};
    })()`);
    console.log('CLEAN while editing:', JSON.stringify(cleanEditing));
    const review = await evalExpr(`WB.export.reviewHtml()`);
    console.log('REVIEW has data:', review.includes('__wb_annotation_data'), 'viewer:', review.includes('data-wb-viewer'), 'len', review.length);

    // Blank click clears selection
    const blankClear = await evalExpr(`(function(){
      WB.annotations.setMode(false);
      var d=WB.stage.getDoc(); var h=d.querySelector('h1'); WB.selection.select(h);
      d.body.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
      return !WB.selection.getSelected() && document.querySelectorAll('#selection-layer .sel-box').length===0;
    })()`);
    console.log('BLANK clear:', blankClear);

    // Style panel + history
    const colorAfter = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var h=d.querySelector('h1'); WB.selection.select(h);
      var inp=document.getElementById('ins-color'); inp.focus(); inp.value='#ff0000';
      inp.dispatchEvent(new Event('input',{bubbles:true}));
      inp.blur(); inp.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));
      return d.defaultView.getComputedStyle(h).color;
    })()`);
    console.log('STYLE color:', colorAfter);
    const colorUndo = await evalExpr(`(function(){WB.history.undo();var h=WB.stage.getDoc().querySelector('h1');return WB.stage.getDoc().defaultView.getComputedStyle(h).color;})()`);
    console.log('STYLE undo:', colorUndo);
    const colorRedo = await evalExpr(`(function(){WB.history.redo();var h=WB.stage.getDoc().querySelector('h1');return WB.stage.getDoc().defaultView.getComputedStyle(h).color;})()`);
    console.log('STYLE redo:', colorRedo);

    // Select options editor
    const selectCount = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var s=d.querySelector('select'); WB.selection.select(s); WB.selectEditor.open(s);
      document.getElementById('select-add-row').click();
      var rows=document.querySelectorAll('#select-option-list .select-row');
      var last=rows[rows.length-1];
      last.querySelector('[data-field="label"]').value='鏃楄埌鐗?;
      last.querySelector('[data-field="value"]').value='ultimate';
      document.getElementById('select-save').click();
      return s.options.length;
    })()`);
    console.log('SELECT options after add:', selectCount);
    const selectUndo = await evalExpr(`(function(){WB.history.undo();return WB.stage.getDoc().querySelector('select').options.length;})()`);
    console.log('SELECT undo:', selectUndo);

    // Table row delete + undo
    const shapeDel = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var t=d.querySelector('table'); WB.selection.selectTable(t,t.querySelector('td'));
      WB.table.applyOperation('row-del');
      return t.rows.length;
    })()`);
    console.log('TABLE rows after delete:', shapeDel);
    const shapeUndo = await evalExpr(`(function(){WB.history.undo();return WB.stage.getDoc().querySelector('table').rows.length;})()`);
    console.log('TABLE rows undo:', shapeUndo);

    // Column / row resize handles (cell mode)
    const resizeResult = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var t=d.querySelector('table');
      WB.selection.selectCell(t.querySelector('td'));
      WB.table.refreshHandles();
      var col=document.querySelector('#table-layer .col-handle');
      if(!col || col.hidden) return 'no-col-handle';
      var r=col.getBoundingClientRect();
      col.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:r.left+2,clientY:r.top+20,button:0,buttons:1,pointerId:11,pointerType:'mouse',isPrimary:true}));
      window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,clientX:r.left+42,clientY:r.top+20,button:0,buttons:1,pointerId:11,pointerType:'mouse'}));
      window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,clientX:r.left+42,clientY:r.top+20,button:0,buttons:0,pointerId:11,pointerType:'mouse'}));
      var cols=t.querySelectorAll('colgroup col').length;
      WB.table.refreshHandles();
      var row=document.querySelector('#table-layer .row-handle');
      if(!row || row.hidden) return 'cols='+cols+',no-row-handle';
      var tr=t.querySelector('td').parentElement;
      var rr=row.getBoundingClientRect();
      row.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:rr.left+20,clientY:rr.top+2,button:0,buttons:1,pointerId:12,pointerType:'mouse',isPrimary:true}));
      window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,clientX:rr.left+20,clientY:rr.top+32,button:0,buttons:1,pointerId:12,pointerType:'mouse'}));
      window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,clientX:rr.left+20,clientY:rr.top+32,button:0,buttons:0,pointerId:12,pointerType:'mouse'}));
      return 'cols='+cols+',rowH='+tr.style.height;
    })()`);
    console.log('TABLE resize:', resizeResult);
    const colDelete = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var t=d.querySelector('table'); WB.selection.selectTable(t,t.querySelector('td'));
      WB.table.applyOperation('col-del');
      return t.rows[0].cells.length;
    })()`);
    console.log('TABLE cols after delete:', colDelete);
    await evalExpr(`WB.history.undo()`);
    const tableDrag = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var win=d.defaultView; var t=d.querySelector('table'); var cell=t.querySelector('td');
      WB.selection.selectTable(t,cell);
      function ev(type,x,y,buttons){ return new win.PointerEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0,buttons:buttons,pointerId:13,pointerType:'mouse',isPrimary:true,view:win}); }
      cell.dispatchEvent(ev('pointerdown',300,300,1));
      d.dispatchEvent(ev('pointermove',340,320,1));
      d.dispatchEvent(ev('pointerup',340,320,0));
      return t.style.translate;
    })()`);
    console.log('TABLE drag:', tableDrag);

    // Eight-way resize + table/cell handle exclusivity
    const resize8 = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var win=d.defaultView; var t=d.querySelector('table'); var h=d.querySelector('h1');
      function visibleResize(){return Array.from(document.querySelectorAll('#resize-layer .resize-handle')).filter(function(x){return !x.hidden;}).length;}
      function visibleTable(){return Array.from(document.querySelectorAll('#table-layer .table-handle')).filter(function(x){return !x.hidden;}).length;}
      WB.selection.select(h);
      var hCount=visibleResize();
      var se=document.querySelector('#resize-layer .resize-handle[data-dir="se"]');
      var r=se.getBoundingClientRect();
      var before={w:h.getBoundingClientRect().width,h:h.getBoundingClientRect().height};
      se.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:r.left+5,clientY:r.top+5,button:0,buttons:1,pointerId:21,pointerType:'mouse',isPrimary:true}));
      window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,clientX:r.left+45,clientY:r.top+35,button:0,buttons:1,pointerId:21,pointerType:'mouse'}));
      window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,clientX:r.left+45,clientY:r.top+35,button:0,buttons:0,pointerId:21,pointerType:'mouse'}));
      var after={w:h.getBoundingClientRect().width,h:h.getBoundingClientRect().height};
      WB.selection.selectTable(t);
      var table8=visibleResize();
      var tableHandles=visibleTable();
      WB.selection.selectCell(t.querySelector('td'));
      var cell8=visibleResize();
      var cellHandles=visibleTable();
      return {hCount:hCount,changed:after.w!==before.w||after.h!==before.h,table8:table8,tableHandles:tableHandles,cell8:cell8,cellHandles:cellHandles};
    })()`);
    console.log('RESIZE 8:', JSON.stringify(resize8));

    const resizeUndo2 = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var h=d.querySelector('h1');
      WB.selection.select(h);
      var before=Math.round(h.getBoundingClientRect().width);
      var se=document.querySelector('#resize-layer .resize-handle[data-dir="se"]');
      var r=se.getBoundingClientRect();
      se.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:r.left+5,clientY:r.top+5,button:0,buttons:1,pointerId:23,pointerType:'mouse',isPrimary:true}));
      window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,clientX:r.left+45,clientY:r.top+5,button:0,buttons:1,pointerId:23,pointerType:'mouse'}));
      window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,clientX:r.left+45,clientY:r.top+5,button:0,buttons:0,pointerId:23,pointerType:'mouse'}));
      var after=Math.round(d.querySelector('h1').getBoundingClientRect().width);
      WB.history.undo();
      var undone=Math.round(d.querySelector('h1').getBoundingClientRect().width);
      WB.history.redo();
      var redone=Math.round(d.querySelector('h1').getBoundingClientRect().width);
      return {before:before,after:after,undone:undone,redone:redone};
    })()`);
    console.log('RESIZE undo2:', JSON.stringify(resizeUndo2));

    const tableResize8 = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var t=d.querySelector('table');
      WB.selection.selectTable(t);
      var se=document.querySelector('#resize-layer .resize-handle[data-dir="se"]');
      if(!se || se.hidden) return 'no-table-handle';
      var before=t.getBoundingClientRect();
      var r=se.getBoundingClientRect();
      se.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:r.left+5,clientY:r.top+5,button:0,buttons:1,pointerId:22,pointerType:'mouse',isPrimary:true}));
      window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,clientX:r.left+35,clientY:r.top+25,button:0,buttons:1,pointerId:22,pointerType:'mouse'}));
      window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,clientX:r.left+35,clientY:r.top+25,button:0,buttons:0,pointerId:22,pointerType:'mouse'}));
      var after=t.getBoundingClientRect();
      return {changed:after.width!==before.width||after.height!==before.height,w:Math.round(after.width),h:Math.round(after.height)};
    })()`);
    console.log('TABLE resize 8:', JSON.stringify(tableResize8));

    const resizeUndo = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var h=d.querySelector('h1');
      var before=h.getBoundingClientRect().width;
      WB.history.undo();
      var after=h.getBoundingClientRect().width;
      WB.history.redo();
      return {before:Math.round(before),after:Math.round(after)};
    })()`);
    console.log('RESIZE undo:', JSON.stringify(resizeUndo));

    // Annotation follows a cell through row insertion
    const anchorFollow = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var t=d.querySelector('table'); var cell=t.rows[1].cells[1];
      var a=WB.annotations.add(cell); var aid=a.anchor.aid;
      var cellAid=cell.getAttribute('data-wb-aid');
      WB.selection.selectTable(t,cell); WB.table.applyOperation('row-add');
      WB.annotations.refreshAnchors('structure');
      var same=WB.annotations.get(a.id)._el===cell;
      return {same:same, orphan:WB.annotations.get(a.id)._orphan, seq:a.seq, aid:aid, connected:cell.isConnected};
    })()`);
    console.log('ANCHOR table follow:', JSON.stringify(anchorFollow));

    // Orphan + re-anchor
    const orphan = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var li=d.querySelector('li');
      var a=WB.annotations.add(li);
      li.remove(); WB.annotations.refreshAnchors('structure');
      return {orphan:WB.annotations.get(a.id)._orphan, id:a.id};
    })()`);
    console.log('ORPHAN:', JSON.stringify(orphan));
    const reanchored = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var h=d.querySelector('h1');
      WB.annotations.startReanchor(${JSON.stringify(orphan.id)});
      h.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
      var a=WB.annotations.get(${JSON.stringify(orphan.id)});
      return {orphan:a._orphan, selector:a.selector};
    })()`);
    console.log('REANCHOR:', JSON.stringify(reanchored));

    // Clipboard paste HTML
    const pasted = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var dt=new DataTransfer();
      dt.setData('text/html','<p id="clip-test">绮樿创鐨?HTML</p>');
      dt.setData('text/plain','绮樿创鐨?HTML');
      var ev=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt});
      d.dispatchEvent(ev);
      return !!d.getElementById('clip-test');
    })()`);
    console.log('PASTE html:', pasted);

    // Copy element + image paste
    const copyPaste = await evalExpr(`(async function(){
      var d=WB.stage.getDoc(); var h=d.querySelector('h1'); var win=d.defaultView;
      win.getSelection().removeAllRanges(); WB.selection.select(h);
      var dt=new DataTransfer();
      d.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:dt}));
      var copied=dt.getData('text/html');
      var dt2=new DataTransfer();
      var bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
      var file=new File([bytes],'dot.png',{type:'image/png'});
      dt2.items.add(file);
      d.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt2}));
      await new Promise(function(r){setTimeout(r,350);});
      var img=d.querySelector('img[alt="dot.png"]');
      return {copied:copied.indexOf('<h1')!==-1, image:!!img, data:!!(img&&img.src.indexOf('data:image/png')===0)};
    })()`);
    console.log('COPY/IMAGE:', JSON.stringify(copyPaste));

    // Position panel
    const movePanel = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var h=d.querySelector('h1'); WB.selection.select(h);
      var inp=document.getElementById('ins-x'); inp.focus(); inp.value='25';
      inp.dispatchEvent(new Event('input',{bubbles:true}));
      inp.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));
      return h.style.translate;
    })()`);
    console.log('MOVE panel:', movePanel);

    // Preview mode
    const preview = await evalExpr(`(function(){WB.app.setMode('preview');var a=document.body.classList.contains('preview-mode');WB.app.setMode('edit');return a;})()`);
    console.log('PREVIEW toggle:', preview);

    // Actual dblclick routing + iframe-view drag
    const dbl = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var s=d.querySelector('select');
      s.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}));
      var open=!document.getElementById('select-modal').hidden;
      if(open) WB.selectEditor.cancel();
      var h=d.querySelector('h1'); h.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}));
      var editing=WB.textEdit.isEditing();
      if(editing) WB.textEdit.finish({commit:true});
      return {selectModal:open,textEdit:editing};
    })()`);
    console.log('DBLCLICK:', JSON.stringify(dbl));
    const realDrag = await evalExpr(`(function(){
      var d=WB.stage.getDoc(); var win=d.defaultView; var h=d.querySelector('h1');
      WB.selection.select(h);
      var before=h.style.translate;
      function ev(type,x,y,buttons){ return new win.PointerEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0,buttons:buttons,pointerId:14,pointerType:'mouse',isPrimary:true,view:win}); }
      h.dispatchEvent(ev('pointerdown',300,200,1));
      d.dispatchEvent(ev('pointermove',330,215,1));
      d.dispatchEvent(ev('pointerup',330,215,0));
      return {before:before,after:h.style.translate};
    })()`);
    console.log('REAL DRAG:', JSON.stringify(realDrag));

    // Pin follows scroll
    const pinFollow = await evalExpr(`(async function(){
      WB.annotations.setShowInPreview(true);
      WB.app.setMode('preview');
      await new Promise(function(r){setTimeout(r,200);});
      var layer=document.getElementById('annotation-layer');
      var pins=document.querySelectorAll('#annotation-layer .ann-pin');
      var visible=!layer.hidden && pins.length>0;
      var h=WB.stage.getDoc().querySelector('h1');
      var pin=pins[0]; var iframe=document.getElementById('stage'); var canvas=document.getElementById('canvas');
      var ir=iframe.getBoundingClientRect(), cr=canvas.getBoundingClientRect(); var er=h.getBoundingClientRect();
      var pr=pin?pin.getBoundingClientRect():null;
      var aligned=pr?Math.abs((er.right-10+ir.left-cr.left)-(pr.left-cr.left))<4:false;
      var detail={pinId:pin?pin.dataset.id:null,seq:pin?pin.textContent:null,prLeft:pr?pr.left:null,pinRel:pr?pr.left-cr.left:null,expected:er.right-10+ir.left-cr.left,erRight:er.right,irLeft:ir.left,crLeft:cr.left,h1:WB.stage.getDoc().querySelector('h1').textContent,styleLeft:pin?pin.style.left:null,ann:pin?{selector:WB.annotations.get(pin.dataset.id).selector,orphan:WB.annotations.get(pin.dataset.id)._orphan,hasEl:!!WB.annotations.get(pin.dataset.id)._el,lastRect:WB.annotations.get(pin.dataset.id).lastRect,anchorRect:WB.annotations.get(pin.dataset.id).anchor.rect}:null};
      WB.annotations.setShowInPreview(false);
      WB.app.setMode('edit');
      return {visible:visible,count:pins.length,aligned:aligned,detail:detail};
    })()`);
    console.log('PINS preview/scroll:', JSON.stringify(pinFollow));

    // Review viewer in a sandboxed preview iframe
    const viewer = await evalExpr(`(async function(){
      var html=WB.export.reviewHtml();
      var f=document.createElement('iframe');
      f.style.cssText='position:fixed;left:-9999px;top:0;width:900px;height:700px;border:0;';
      document.body.appendChild(f);
      await new Promise(function(resolve){f.onload=resolve;f.srcdoc=html;});
      await new Promise(function(r){setTimeout(r,350);});
      var host=f.contentDocument.querySelector('[data-wb-ui="review"]');
      var pins=host&&host.shadowRoot?host.shadowRoot.querySelectorAll('.pin'):[];
      var opened=false;
      if(pins.length){pins[0].dispatchEvent(new f.contentWindow.MouseEvent('click',{bubbles:true,cancelable:true}));var card=host.shadowRoot.querySelector('.card');opened=card&&!card.hidden;}
      f.remove();
      return {host:!!host,pins:pins.length,opened:opened};
    })()`);
    console.log('REVIEW viewer:', JSON.stringify(viewer));

    // Annotation JSON round-trip
    const roundtrip = await evalExpr(`(function(){
      var before=WB.annotations.list().length;
      var data=WB.annotations.serializeFile();
      WB.annotations.list().forEach(function(a){WB.annotations.remove(a.id,{silentEvent:true});});
      var n=WB.annotations.importFile(data);
      return {before:before,after:n,fields:!!(data.annotations[0]&&data.annotations[0].selector&&data.annotations[0].content&&data.annotations[0].type&&data.annotations[0].status)};
    })()`);
    console.log('ANNOT JSON roundtrip:', JSON.stringify(roundtrip));

    // Versions + markdown
    const versionsInfo = await evalExpr(`(async function(){
      await WB.versions.saveCurrent('manual','娴嬭瘯鍩虹嚎');
      var list=await WB.storage.listVersions(WB.app.getDocId());
      var md=WB.changelog.buildMarkdown();
      return {versions:list.length, mdHasAnn:md.includes('鎵规敞娓呭崟')};
    })()`);
    console.log('VERSIONS:', JSON.stringify(versionsInfo));

    // Restore the baseline saved above after changing the document
    const versionRestore = await evalExpr(`(async function(){
      var d=WB.stage.getDoc(); var h=d.querySelector('h1'); h.textContent='鐗堟湰鍚庣殑鏍囬';
      var list=await WB.storage.listVersions(WB.app.getDocId());
      var v=list[0];
      var old=window.confirm; window.confirm=function(){return true;};
      await WB.versions.restore(v);
      window.confirm=old;
      await new Promise(function(r){setTimeout(r,300);});
      return {title:WB.stage.getDoc().querySelector('h1').textContent, anns:WB.annotations.list().length};
    })()`);
    console.log('VERSION restore:', JSON.stringify(versionRestore));

    // Load the acceptance fixture and import fixture annotations
    const fixtureHtml = fs.readFileSync(path.resolve('test/fixtures/prototype.html'), 'utf8');
    const fixtureAnns = fs.readFileSync(path.resolve('test/fixtures/annotations.json'), 'utf8');
    const fixtureLoaded = await evalExpr(`(async function(){
      await WB.app.loadDocument(${JSON.stringify(fixtureHtml)}, {fileName:'prototype.html',sourceHash:'fixture-hash'});
      await new Promise(function(r){setTimeout(r,250);});
      var n=WB.annotations.importFile(${JSON.stringify(fixtureAnns)});
      WB.annotations.refreshAnchors('import');
      await new Promise(function(r){setTimeout(r,150);});
      var d=WB.stage.getDoc();
      var clean=WB.export.cleanHtml();
      var anns=WB.annotations.list();
      return {
        title:d.querySelector('h1').textContent,
        tableRows:d.getElementById('order-table').rows.length,
        selectOptions:d.getElementById('pay-method').options.length,
        anns:n,
        orphans:anns.filter(function(a){return a._orphan;}).length,
        scriptRan:!!WB.stage.getIframe().contentWindow.__fixtureScriptRan,
        cleanKeepsScript:clean.indexOf('__fixtureScriptRan')!==-1,
        cleanHasAid:clean.indexOf('data-wb-aid')!==-1,
        cleanHasEditorUI:clean.indexOf('annotation-layer')!==-1 || clean.indexOf('ann-card')!==-1
      };
    })()`);
    console.log('FIXTURE loaded:', JSON.stringify(fixtureLoaded));

    await evalExpr(`WB.app.scheduleSessionSave()`);
    await sleep(1200);
    const saved = await evalExpr(`(async function(){var s=await WB.storage.loadLastSession();return !!(s&&s.html&&s.annotations&&s.annotations.annotations.length)})()`);
    console.log('SESSION saved:', saved);

    await cdp('Page.reload', { ignoreCache: false });
    await sleep(1500);
    await waitFor('WB.app.isLoaded()', 'reload restore');
    const restored = await evalExpr(`(function(){return {anns:WB.annotations.list().length, h1:WB.stage.getDoc().querySelector('h1').textContent, saved:document.getElementById('status-save').textContent}})()`);
    console.log('RELOAD restored:', JSON.stringify(restored));

    const multiPage = await evalExpr(`(async function(){
      var html='<!doctype html><html><head><meta charset="utf-8"><style>.page{display:none;flex-direction:column}.page.active{display:flex}</style></head><body>'+
        '<div class="page active" id="page-one" data-page="one"><h1>绗竴椤?/h1><button data-go="two" id="go-two">鍘荤浜岄〉</button><button id="toggle">鍒囨崲鏂囨</button><p id="one-text">Alpha</p></div>'+
        '<div class="page" id="page-two" data-page="two"><h1>绗簩椤?/h1><button data-go="one" id="go-one">鍘荤涓€椤?/button><p id="two-text">Beta</p></div>'+
        '<script>document.addEventListener("click",function(e){var b=e.target.closest("[data-go]");if(b){var id=b.getAttribute("data-go");document.querySelectorAll(".page").forEach(function(p){p.classList.toggle("active",p.id==="page-"+id);});return;}var t=e.target.closest("#toggle");if(t){document.getElementById("one-text").textContent="Changed";}});<\\/script>'+
        '</body></html>';
      await WB.app.loadDocument(html,{fileName:'multi.html',sourceHash:'multi-hash'});
      await new Promise(function(r){setTimeout(r,300);});
      var d=WB.stage.getDoc(); var one=d.getElementById('page-one'); var two=d.getElementById('page-two');
      var opts=Array.from(document.querySelectorAll('#page-select option')).map(function(o){return o.textContent;});
      var initial=WB.pages.getActive();
      var oneDisplayInitial=getComputedStyle(one).display;
      var oneText=d.getElementById('one-text');
      WB.selection.select(oneText);
      WB.pages.showPage(WB.pages.getPages().find(function(p){return p.dataPage==='two';}));
      var twoVisible=getComputedStyle(two).display!=='none';
      var twoDisplay=getComputedStyle(two).display;
      var cleared=!WB.selection.getSelected();
      var pageStyleAfter=!!d.getElementById('__wb_page_style');
      WB.pages.showPage(WB.pages.getPages().find(function(p){return p.dataPage==='one';}));
      var restored=WB.selection.getSelected()&&WB.selection.getSelected().id;
      var beforeEdit=WB.pages.getActive()&&WB.pages.getActive().dataPage;
      d.getElementById('go-two').dispatchEvent(new d.defaultView.MouseEvent('click',{bubbles:true,cancelable:true}));
      await new Promise(function(r){setTimeout(r,150);});
      var afterEdit=WB.pages.getActive()&&WB.pages.getActive().dataPage;
      d.getElementById('go-one').dispatchEvent(new d.defaultView.MouseEvent('click',{bubbles:true,cancelable:true}));
      await new Promise(function(r){setTimeout(r,150);});
      d.getElementById('toggle').dispatchEvent(new d.defaultView.MouseEvent('click',{bubbles:true,cancelable:true}));
      await new Promise(function(r){setTimeout(r,100);});
      var toggleWorks=d.getElementById('one-text').textContent==='Changed';
      WB.app.setMode('preview');
      await new Promise(function(r){setTimeout(r,120);});
      d.getElementById('go-two').dispatchEvent(new d.defaultView.MouseEvent('click',{bubbles:true,cancelable:true}));
      await new Promise(function(r){setTimeout(r,180);});
      var afterPreview=WB.pages.getActive()&&WB.pages.getActive().dataPage;
      var previewVisible=getComputedStyle(two).display!=='none';
      var previewDisplay=getComputedStyle(two).display;
      WB.app.setMode('edit');
      var ann=WB.annotations.add(d.getElementById('two-text'));
      WB.annotations.focus(ann.id);
      await new Promise(function(r){setTimeout(r,150);});
      var focusPage=WB.pages.getActive()&&WB.pages.getActive().dataPage;
      var defaultType=ann.type;
      if(WB.annotationUI) WB.annotationUI.closeCard({removeIfEmpty:true});
      WB.pages.showPage('id:page-one');
      var oldData={annotations:[{id:'legacy',seq:1,selector:'#one-text',textSnapshot:'Alpha',content:'鏃х被鍨?,type:'issue',status:'open',anchor:{aid:'',tag:'p',id:'one-text',classes:[],text:'Alpha',ancestorTrail:[],index:0,rect:null}}],nextSeq:2};
      WB.annotations.importFile(JSON.stringify(oldData));
      var migrated=WB.annotations.list()[0]&&WB.annotations.list()[0].type;
      var clean=WB.export.cleanHtml();
      return {options:opts,initial:initial&&initial.dataPage,oneDisplayInitial:oneDisplayInitial,twoVisible:twoVisible,twoDisplay:twoDisplay,cleared:cleared,pageStyleAfter:pageStyleAfter,restored:restored,beforeEdit:beforeEdit,afterEdit:afterEdit,toggleWorks:toggleWorks,afterPreview:afterPreview,previewVisible:previewVisible,previewDisplay:previewDisplay,migrated:migrated,focusPage:focusPage,defaultType:defaultType,cleanPageStyle:clean.indexOf('__wb_page_style')!==-1};
    })()`);
    console.log('MULTI PAGE:', JSON.stringify(multiPage));

    const hashPage = await evalExpr(`(async function(){
      var html='<!doctype html><html><head><meta charset="utf-8"><style>.page{display:none;flex-direction:column}.page.active{display:flex}</style></head><body>'+
        '<div class="page active" id="page-red" data-page="red"><h1>Red</h1><a href="#blue" id="to-blue">Blue</a></div>'+
        '<div class="page" id="page-blue" data-page="blue"><h1>Blue</h1><a href="#red" id="to-red">Red</a></div>'+
        '<script>function route(){var h=(location.hash||"#red").slice(1);document.querySelectorAll(".page").forEach(function(p){p.classList.toggle("active",p.id==="page-"+h);});}window.addEventListener("hashchange",route);route();<\\/script>'+
        '</body></html>';
      await WB.app.loadDocument(html,{fileName:'hash.html',sourceHash:'hash-hash'});
      await new Promise(function(r){setTimeout(r,250);});
      var d=WB.stage.getDoc(); var red=d.getElementById('page-red'); var blue=d.getElementById('page-blue');
      var hashBefore=d.defaultView.location.href; var hashErr='';
      try { d.defaultView.history.replaceState(null,'','#probe'); } catch(e) { hashErr=e.message; }
      var hashAfter=d.defaultView.location.href;
      var initial=WB.pages.getActive()&&WB.pages.getActive().dataPage;
      WB.pages.showPage('id:page-blue');
      await new Promise(function(r){setTimeout(r,220);});
      var afterSwitcher=WB.pages.getActive()&&WB.pages.getActive().dataPage;
      var blueDisplay=getComputedStyle(blue).display;
      var style=!!d.getElementById('__wb_page_style');
      d.getElementById('to-red').dispatchEvent(new d.defaultView.MouseEvent('click',{bubbles:true,cancelable:true}));
      await new Promise(function(r){setTimeout(r,180);});
      var afterEdit=WB.pages.getActive()&&WB.pages.getActive().dataPage;
      return {initial:initial,afterSwitcher:afterSwitcher,blueDisplay:blueDisplay,style:style,afterEdit:afterEdit,redDisplay:getComputedStyle(red).display,hashBefore:hashBefore,hashAfter:hashAfter,hashErr:hashErr};
    })()`);
    console.log('HASH PAGE:', JSON.stringify(hashPage));

    console.log('EXCEPTIONS:', exceptions.length ? exceptions.join(' | ') : 'none');
    console.log('CONSOLE ERRORS:', consoleErrors.length ? consoleErrors.join(' | ') : 'none');
  } finally {
    try { await cdp('Browser.close'); } catch (e) { /* ignore */ }
    try { browser.kill(); } catch (e) { /* ignore */ }
    try { ws && ws.close(); } catch (e) { /* ignore */ }
    await sleep(300);
    fs.rmSync(PROFILE, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err && err.stack || err);
  console.error('EXCEPTIONS:', exceptions.length ? exceptions.join(' | ') : 'none');
  console.error('CONSOLE ERRORS:', consoleErrors.length ? consoleErrors.join(' | ') : 'none');
  process.exitCode = 1;
});

