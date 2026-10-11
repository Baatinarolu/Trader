/* M87 — optional HUMAN-labelled HTF/MTF/LTF visual evidence of SAVED trades.
 * Recording time is not capture time. No automatic external image request. */
(function(global){
  'use strict';
  const Views=global.Views=global.Views||{},U=global.U;let opened=0;
  const roles=['htf','mtf','ltf'],questions={htf:'Why this initial bias / trend direction? What structure and key levels?',mtf:'Why this location? Supply/demand or flip zone; where was available liquidity?',ltf:'What actual entry trigger and confirmation?'};
  const context=()=>({account:global.Store.accountId,user:global.Store.user?.id,token:global.API.getToken()}),same=c=>c.account===global.Store.accountId&&c.user===global.Store.user?.id&&c.token===global.API.getToken();
  function imageButton(image,label){
    const box=U.h('div'),button=U.h('button',{class:'btn xs ghost',type:'button',text:label});box.appendChild(button);
    button.addEventListener('click',()=>{
      if(typeof image!=='string')return;
      if(/^https:\/\//i.test(image)){const a=U.h('a',{href:image,target:'_blank',rel:'noopener noreferrer nofollow',referrerpolicy:'no-referrer',text:'Open external reference — unverified, may have changed'});box.replaceChildren(a);return;}
      if(!/^data:image\/(png|jpeg|webp);base64,/.test(image))return;
      const img=U.h('img',{src:image,alt:label,referrerpolicy:'no-referrer',style:'max-width:100%;max-height:320px;border:1px solid var(--border);border-radius:8px'});img.addEventListener('error',()=>box.replaceChildren(U.h('span',{class:'tiny warn',text:'Image cannot be displayed. Stored metadata alone does not verify decodable chart content.'})));box.replaceChildren(img);
    });return box;
  }
  const P=Views.screenshots={
    importResult(result){return `<div class="field-note"><b>Optional visual evidence:</b> ${U.esc(result.media_imported??'unavailable')} references received with imported/unverified provenance; ${U.esc(result.media_skipped??'unavailable')} skipped. Receiving time is not original capture time; legacy stays unassigned.</div>${result.media_warnings?.length?'<ul class="tiny warn">'+result.media_warnings.map(w=>'<li>'+U.esc(w)+'</li>').join('')+'</ul>':''}`;},
    card(trade){
      const node=U.h('div',{class:'card',style:'margin-top:12px'});
      node.innerHTML='<h3>HTF / MTF / LTF visual evidence</h3><div class="field-note">Optional, independently labelled chart references. Save financial edits first; this reviews the saved record, not this form\'s unsaved changes. It does not complete core writing or change execution grades / entry permission.</div>';
      if(trade?.id)node.appendChild(U.h('button',{class:'btn sm',type:'button',dataset:{screenshotsOpen:String(trade.id)},text:'Review saved chart evidence',onclick:()=>P.open(Number(trade.id))}));
      else node.appendChild(U.h('div',{class:'tiny muted',dataset:{screenshotsNeedsSave:'true'},text:'Save the trade with its truthful financial record first, then attach optional HTF / MTF / LTF evidence. No timeframe defaults or image requirement.'}));return node;
    },
    async open(id){
      const before=context(),serial=++opened;let view;
      try{view=await global.API.get('/trades/'+id+'/screenshots');}catch(e){return global.App.toast(e.message||'Visual evidence unavailable','err');}
      if(!same(before)||serial!==opened||before.account!=null&&Number(before.account)!==view.account_id)return global.App.toast('Workspace/account changed or this saved record is outside the selected account; reopen there.','err');
      const body=U.h('div'),states=new Map();let alive=true,busy=false,stale=false,generation=0;
      const valid=()=>alive&&serial===opened&&same(before)&&body.isConnected;
      function guard(){if(!valid()){global.App.toast('Workspace/account changed or editor closed; reopen the current saved record.','err');return false;}return !busy;}
      function cancel(state){state.version++;state.pending=false;try{state.reader?.abort();}catch{}state.reader=null;}
      function disable(){for(const s of states.values()){for(const el of s.node.querySelectorAll('input,textarea,button'))el.disabled=busy; s.save.disabled=busy||stale||s.pending;s.remove.disabled=busy||stale||s.slot.state==='missing';}const reload=body.querySelector('[data-screenshots-reload]');if(reload)reload.disabled=busy;}
      function draw(){
        generation++;for(const s of states.values())cancel(s);states.clear();const t=view.saved_record||{};
        body.replaceChildren(U.h('p',{class:'small',text:`Saved trade #${view.trade_id} ${t.symbol||''} · account #${view.account_id}. Saved entry ${t.entry??'unknown'}, stop ${t.stop??'unknown'}, exit ${t.exit??'unknown'} (${t.status||'unknown'}).`}),U.h('p',{class:'field-note',text:'Save financial edits first. Three separate human-labelled views help revisit your original visual thought process. Optional images do not complete core writing/routine, change execution grades, resize risk or grant entry permission. Server recording time is not original capture time. This is not broker, chart-content or actual timeframe verification. Save one role at a time; reload/save clears other unsaved selections.'}));
        const sum=view.summary||{};body.appendChild(U.h('div',{class:'small',dataset:{screenshotsSummary:'true'},text:`${sum.tagged??'unknown'} / 3 labelled references · ${sum.current??'unknown'} match current saved context · ${sum.distinct_references??'unknown'} distinct references (not proof of independent charts) · ${sum.distinct_timeframes??'unknown'} distinct declared timeframes.${sum.reused_timeframes?.length?' Reused timeframe: equal explicit frames do not establish3 separate timeframe views.':''}${sum.distinct_references<sum.tagged?' Duplicate reference: do not pretend these establish3 independent views.':''}`}));
        body.appendChild(U.h('button',{class:'btn sm ghost',type:'button',dataset:{screenshotsReload:'true'},text:'Reload saved evidence (discard unsaved selections)',onclick:async()=>{
          if(!guard())return;busy=true;generation++;for(const s of states.values())cancel(s);disable();
          try{const out=await global.API.get('/trades/'+id+'/screenshots');if(!valid())return;view=out;stale=false;draw();}catch(e){if(valid())global.App.toast(e.message||'Evidence reload unavailable','err');}finally{busy=false;if(valid())disable();}
        }}));
        const legacy=U.h('div',{class:'card',style:'margin-top:12px'});legacy.appendChild(U.h('h4',{text:'Unassigned legacy screenshot'}));legacy.appendChild(U.h('div',{class:'tiny muted',text:view.legacy?.image?'Original reference preserved, excluded from all3 roles; no timeframe/bias/location/trigger guessed from entry TF or file.':'No legacy reference recorded.'}));if(view.legacy?.display_image)legacy.appendChild(imageButton(view.legacy.display_image,'View preserved unassigned image'));else if(view.legacy?.image)legacy.appendChild(U.h('div',{class:'tiny warn',text:'Original reference preserved but not rendered: unsupported/unsafe/over-budget media. Financial reality is unaffected.'}));body.appendChild(legacy);
        for(const r of roles){
          const slot=view.slots[r],node=U.h('section',{class:'card',style:'margin-top:14px',dataset:{screenshotRole:r}}),localGeneration=generation;
          const s={node,slot,version:0,pending:false,reader:null,image:slot.image||''};states.set(r,s);
          node.innerHTML=`<h4>${r.toUpperCase()} — ${U.esc(slot.timeframe||'timeframe not recorded')}</h4><p class="small">${U.esc(questions[r])}</p><div class="tiny muted" data-screenshot-metadata></div>
            <label class="field"><span>Your explicit timeframe (e.g.1d,4h,15m; M means months)</span><input data-screenshot-timeframe maxlength="7" value="${U.esc(slot.timeframe||'')}" placeholder="Choose — no default" /></label>
            <label class="field"><span>External HTTPS image reference (unverified, no automatic load)</span><input data-screenshot-link value="${U.esc(slot.kind==='external_link'?slot.image:'')}" placeholder="https://charts.example/your-chart.png" /></label>
            <label class="field"><span>Or upload a static PNG / JPEG / WebP (1.5 MB maximum)</span><input type="file" data-screenshot-file accept="image/png,image/jpeg,image/webp" /></label>
            <label class="field"><span>Your optional visual-context note</span><textarea data-screenshot-note maxlength="2000">${U.esc(slot.note||'')}</textarea></label><div data-screenshot-preview></div>`;
          const el=k=>node.querySelector(`[data-screenshot-${k}]`),metadata=el('metadata');
          metadata.textContent=slot.state==='stored'?`${slot.source.startsWith('imported_')?'Imported historical evidence; provenance/capture unverified. Received':'Human reference recorded'} ${slot.recorded_at}. Source: ${slot.source}. Recording time is not original capture time.${slot.original_recorded_at?' Historical timestamp declared '+slot.original_recorded_at+' (unverified).':''}${slot.matches_current_trade===true?' Current saved-record financial context (not capture verification).':slot.matches_current_trade===null?' Original historical context unavailable; not inferred from imported finance.':' Prior saved context; original image/time retained after correction, not current verification.'}${slot.kind==='external_link'?' External content unverified and may change.':''}`:slot.state==='unavailable'?'Stored metadata unavailable; no known view credited. Explicit removal/repair possible.':'Missing: no original view is invented.';
          if(slot.matches_current_trade===false&&slot.recorded_context)metadata.appendChild(U.h('div',{text:`Prior saved context: entry ${slot.recorded_context.entry??'unknown'}, stop ${slot.recorded_context.stop??'unknown'}, exit ${slot.recorded_context.exit??'unknown'}.`}));
          if(slot.image)node.appendChild(imageButton(slot.image,'View saved '+r.toUpperCase()+' reference'));
          const preview=()=>{const box=el('preview');box.replaceChildren(U.h('div',{class:'tiny muted',text:'Selection is unsaved; only Save records a labelled reference.'}));if(/^data:image\/(png|jpeg|webp);base64,/.test(s.image)){const img=U.h('img',{src:s.image,alt:'Unsaved '+r.toUpperCase()+' selection',style:'max-height:180px;max-width:100%'});box.appendChild(img);}};
          el('link').addEventListener('input',()=>{cancel(s);s.image=el('link').value.trim();el('file').value='';el('preview').replaceChildren(U.h('span',{class:'tiny muted',text:'External selection unsaved, not loaded or verified.'}));disable();});
          el('file').addEventListener('change',()=>{
            if(!guard())return;cancel(s);const f=el('file').files[0];if(!f){disable();return;}
            if(!['image/png','image/jpeg','image/webp'].includes(f.type)){global.App.toast('Use a static PNG, JPEG or WebP; no active/vector/animated upload.','err');disable();return;}
            if(f.size>1500000){global.App.toast('Image exceeds1.5 MB. Compress locally before selecting.','err');disable();return;}
            s.pending=true;const version=s.version,reader=s.reader=new global.FileReader();disable();
            reader.onload=()=>{if(!valid()||localGeneration!==generation||version!==s.version)return;s.pending=false;s.reader=null;const value=String(reader.result);if(!/^data:image\/(png|jpeg|webp);base64,/.test(value)){global.App.toast('Raster selection unavailable.','err');disable();return;}s.image=value;el('link').value='';preview();disable();};
            reader.onerror=()=>{if(!valid()||localGeneration!==generation||version!==s.version)return;s.pending=false;s.reader=null;global.App.toast('File could not be read; no screenshot recorded.','err');disable();};reader.readAsDataURL(f);
          });
          s.save=U.h('button',{class:'btn sm primary',type:'button',dataset:{screenshotSave:'true'},text:'Save '+r.toUpperCase()+' view',onclick:()=>write(false)});s.remove=U.h('button',{class:'btn sm ghost danger',type:'button',dataset:{screenshotRemove:'true'},text:'Remove saved '+r.toUpperCase()+' view',onclick:()=>write(true)});
          const clear=U.h('button',{class:'btn sm ghost',type:'button',dataset:{screenshotClear:'true'},text:'Clear unsaved selection (not saved image)',onclick:()=>{if(!guard())return;cancel(s);s.image='';el('link').value='';el('file').value='';el('preview').replaceChildren(U.h('span',{class:'tiny muted',text:'Selection cleared, saved reference unchanged. Select image before saving.'}));disable();}});node.appendChild(U.h('div',{class:'row wrap gap-8'},s.save,clear,s.remove));body.appendChild(node);
          async function write(remove){
            if(!guard()||stale||s.pending)return;
            const frame=el('timeframe').value.trim();if(!remove&&(!/^[1-9]\d{0,3}[mhdwM]$/.test(frame)||!s.image)){global.App.toast('Choose an explicit canonical timeframe and upload/image HTTPS reference first.','err');return;}
            busy=true;disable();
            try{const out=remove?await global.API.del('/trades/'+id+'/screenshots/'+r,{revision:slot.revision}):await global.API.put('/trades/'+id+'/screenshots/'+r,{timeframe:frame,image:s.image,note:el('note').value,revision:slot.revision});if(!valid())return;view=out;draw();global.App.toast(remove?'Saved role removed; other roles/legacy/financial truth unchanged.':'Labelled reference recorded; unsaved selections cleared. Recording time is not original capture time.','ok');}
            catch(e){if(valid()){if(e.status===409)stale=true;global.App.toast(e.message||'Visual evidence could not be recorded','err');}}
            finally{busy=false;if(valid())disable();}
          }
        }
        disable();
      }
      draw();return global.App.modal({title:'Saved HTF / MTF / LTF visual evidence',body,wide:true,actions:[{label:'Close — unsaved selections not recorded',ghost:true}],onClose:()=>{alive=false;generation++;for(const s of states.values())cancel(s);}});
    },
  };
})(window);
