var ve=Object.defineProperty;var ge=(u,e,n)=>e in u?ve(u,e,{enumerable:!0,configurable:!0,writable:!0,value:n}):u[e]=n;var h=(u,e,n)=>ge(u,typeof e!="symbol"?e+"":e,n);import{u as X,w as we,s as w,x as _,y as j,z as K,t as b,A as ye,e as D,B as le,C as W,l as ee,D as te,E as V,F as ae,G as Z,H as xe,I as N,J as q,K as G,S as U,b as ce,M as de,N as A,i as ke,$ as Ee,O as Ce,P as Le,Q as Ie,R as me,a as Y,T as De,L as $e,p as y,U as Se,q as pe,V as he,W as Te}from"./chief-judge-riJEdY3M.js";import{m as Be}from"./vendor-signals-BA-R9xnX.js";import{o as Re,c as Ae,a as Pe,b as Me}from"./gate-judge-BcJMKlnh.js";const P=78,M=64,H=72,ue=5,fe=16,He=33,Oe=50,ze=100;function Ne(u){switch(u){case"critical":return Oe;case"low":return He;default:return fe}}class qe{constructor(e){h(this,"container");h(this,"scrollContainer");h(this,"contentContainer");h(this,"entries",[]);h(this,"groups",[]);h(this,"expandedGroups",new Set);h(this,"visibleItems",new Map);h(this,"itemListeners",new Map);h(this,"swipeActions",new Map);h(this,"scrollTop",0);h(this,"containerHeight",0);h(this,"options");h(this,"unsubscribe",null);h(this,"resizeObserver",null);h(this,"scrollHandler",null);h(this,"scrollDebounceTimeout",null);h(this,"resizeDebounceTimeout",null);h(this,"isPaused",!1);h(this,"needsRefreshOnResume",!1);h(this,"isDestroyed",!1);h(this,"cachedLang","de");h(this,"domRemovalObserver",null);h(this,"scrollDebounceDelay",fe);h(this,"unsubscribeBattery",null);this.options=e,this.container=e.container,this.scrollContainer=document.createElement("div"),this.scrollContainer.className="virtual-scroll-container",this.scrollContainer.style.cssText=`
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
    `,this.contentContainer=document.createElement("div"),this.contentContainer.className="virtual-scroll-content",this.contentContainer.style.position="relative",this.scrollContainer.appendChild(this.contentContainer),this.container.appendChild(this.scrollContainer),this.scrollHandler=()=>{this.scrollDebounceTimeout!==null&&clearTimeout(this.scrollDebounceTimeout),this.scrollDebounceTimeout=setTimeout(()=>{this.scrollDebounceTimeout=null;try{this.onScroll()}catch(t){X.error("VirtualList scroll error:",t)}},this.scrollDebounceDelay)},this.scrollContainer.addEventListener("scroll",this.scrollHandler,{passive:!0}),this.unsubscribeBattery=we.subscribe(t=>{this.scrollDebounceDelay=Ne(t.batteryLevel)}),this.resizeObserver=new ResizeObserver(()=>{this.resizeDebounceTimeout!==null&&clearTimeout(this.resizeDebounceTimeout),this.resizeDebounceTimeout=setTimeout(()=>{this.resizeDebounceTimeout=null;try{this.containerHeight=this.scrollContainer.clientHeight,this.isPaused?this.needsRefreshOnResume=!0:this.render()}catch(t){X.error("VirtualList resize error:",t)}},ze)}),this.resizeObserver.observe(this.scrollContainer),this.unsubscribe=Be(()=>{const t=Ee.value;Ce.value,Le.value,this.setEntries(t)}),this.domRemovalObserver=new MutationObserver(t=>{var s;for(const i of t)for(const l of i.removedNodes)if(l===this.container||(s=l.contains)!=null&&s.call(l,this.container)){this.destroy();return}});const n=this.container.parentElement||document.body;this.domRemovalObserver.observe(n,{childList:!0}),this.containerHeight=this.scrollContainer.clientHeight}setEntries(e){this.entries=e,this.applyFilters()}applyFilters(e,n,t){var d;this.scrollDebounceTimeout!==null&&(clearTimeout(this.scrollDebounceTimeout),this.scrollDebounceTimeout=null);const s=w.getState();let i=[...this.entries];if(e){const r=e.toLowerCase();i=i.filter(o=>{var a;return o.bib.toLowerCase().includes(r)||((a=o.deviceName)==null?void 0:a.toLowerCase().includes(r))})}n&&n!=="all"&&(i=i.filter(r=>r.point===n)),t&&t!=="all"&&(i=i.filter(r=>r.status===t));const l=new Map;for(const r of i){const o=r.run??1,a=`${r.bib}-${o}`;l.has(a)||l.set(a,{id:a,bib:r.bib,run:o,entries:[],faults:[],isMultiItem:!1,latestTimestamp:r.timestamp,crossDeviceDuplicateCount:0});const p=l.get(a);p.entries.push(r),r.timestamp>p.latestTimestamp&&(p.latestTimestamp=r.timestamp)}for(const r of s.faultEntries){const o=`${r.bib}-${r.run}`;if(e){const p=e.toLowerCase();if(!r.bib.toLowerCase().includes(p)&&!((d=r.deviceName)!=null&&d.toLowerCase().includes(p)))continue}if(n&&n!=="all"||t&&t!=="all"&&t!=="dsq"&&t!=="flt")continue;l.has(o)||l.set(o,{id:o,bib:r.bib,run:r.run,entries:[],faults:[],isMultiItem:!1,latestTimestamp:r.timestamp,crossDeviceDuplicateCount:0});const a=l.get(o);a.faults.push(r),r.timestamp>a.latestTimestamp&&(a.latestTimestamp=r.timestamp)}for(const r of l.values()){const o=r.entries.length+r.faults.length;r.isMultiItem=o>1;const a=new Map;for(const c of r.entries){const m=c.point;a.has(m)||a.set(m,new Set),a.get(m).add(c.deviceId)}let p=0;for(const c of a.values())c.size>1&&p++;r.crossDeviceDuplicateCount=p}this.groups=Array.from(l.values()).sort((r,o)=>{const a=parseInt(r.bib,10)||0;return(parseInt(o.bib,10)||0)-a});for(const[r,o]of this.visibleItems)this.cleanupItemListeners(r,o),o.remove();this.visibleItems.clear(),this.updateContentHeight(),this.isPaused?this.needsRefreshOnResume=!0:this.render()}toggleGroup(e){this.expandedGroups.has(e)?this.expandedGroups.delete(e):this.expandedGroups.add(e);const n=this.groups.find(t=>t.id===e);if(n){const t=new Set;t.add(`header-${e}`),t.add(`single-${e}`);for(const s of n.entries)t.add(`sub-entry-${s.id}`);for(const s of n.faults)t.add(`sub-fault-${s.id}`);for(const s of t){const i=this.visibleItems.get(s);i&&(this.cleanupItemListeners(s,i),i.remove(),this.visibleItems.delete(s))}}this.updateContentHeight(),this.isPaused?this.needsRefreshOnResume=!0:this.render()}updateContentHeight(){let e=0;for(const n of this.groups)if(!n.isMultiItem)e+=P;else if(this.expandedGroups.has(n.id)){const t=n.entries.length+n.faults.length;e+=H+t*M}else e+=H;this.contentContainer.style.height=`${e}px`}getGroupHeight(e){if(!e.isMultiItem)return P;if(this.expandedGroups.has(e.id)){const n=e.entries.length+e.faults.length;return H+n*M}return H}onScroll(){this.scrollTop=this.scrollContainer.scrollTop,this.isPaused?this.needsRefreshOnResume=!0:this.render()}render(){if(this.cachedLang=w.getState().currentLang,this.groups.length===0){this.renderEmpty();return}const e=this.contentContainer.querySelector(".empty-state");e&&e.remove();const n=new Set,t=this.scrollTop,s=this.scrollTop+this.containerHeight;let i=0;for(let l=0;l<this.groups.length;l++){const d=this.groups[l],r=this.getGroupHeight(d);i+r>=t-ue*P&&i<=s+ue*P&&(d.isMultiItem?this.expandedGroups.has(d.id)?this.renderExpandedGroup(d,i,n):this.renderCollapsedGroup(d,i,n):this.renderSingleItem(d,i,n)),i+=r}for(const[l,d]of this.visibleItems)n.has(l)||(this.cleanupItemListeners(l,d),d.remove(),this.visibleItems.delete(l))}renderSingleItem(e,n,t){const s=`single-${e.id}`;t.add(s);let i=this.visibleItems.get(s);if(!i){if(e.entries.length>0)i=this.createEntryItem(e.entries[0],e.faults,s,e.crossDeviceDuplicateCount);else if(e.faults.length>0)i=this.createFaultOnlyItem(e,s);else return;this.visibleItems.set(s,i),this.contentContainer.appendChild(i)}i.style.transform=`translateY(${n}px)`}renderCollapsedGroup(e,n,t){const s=`header-${e.id}`;t.add(s);let i=this.visibleItems.get(s);i||(i=this.createGroupHeader(e,!1),this.visibleItems.set(s,i),this.contentContainer.appendChild(i)),i.style.transform=`translateY(${n}px)`}renderExpandedGroup(e,n,t){const s=`header-${e.id}`;t.add(s);let i=this.visibleItems.get(s);i||(i=this.createGroupHeader(e,!0),this.visibleItems.set(s,i),this.contentContainer.appendChild(i)),i.style.transform=`translateY(${n}px)`;let l=n+H;for(let d=0;d<e.entries.length;d++){const r=e.entries[d],o=`sub-entry-${r.id}`;t.add(o);let a=this.visibleItems.get(o);a||(a=this.createSubEntryItem(r,o),this.visibleItems.set(o,a),this.contentContainer.appendChild(a)),a.style.transform=`translateY(${l}px)`,l+=M}for(let d=0;d<e.faults.length;d++){const r=e.faults[d],o=`sub-fault-${r.id}`;t.add(o);let a=this.visibleItems.get(o);a||(a=this.createSubFaultItem(r,o),this.visibleItems.set(o,a),this.contentContainer.appendChild(a)),a.style.transform=`translateY(${l}px)`,l+=M}}createGroupHeader(e,n){const t=document.createElement("div");t.className=`result-group-header ${n?"expanded":""}`,t.setAttribute("data-group-id",e.id),t.setAttribute("role","button"),t.setAttribute("tabindex","0"),t.setAttribute("aria-expanded",String(n)),t.style.cssText=`
      position: absolute;
      left: 0;
      right: 0;
      height: ${H}px;
      display: grid;
      grid-template-columns: 28px 64px minmax(0, 1fr) auto;
      align-items: center;
      padding: 0 16px;
      column-gap: 12px;
      background: var(--surface);
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      cursor: pointer;
      transition: background 0.2s;
    `;const s=_(e.bib||"---"),i=this.cachedLang,l=j(e.run),d=K(e.run,i),r=e.entries.length,o=e.faults.length,a=o>0,p=[];r>0&&p.push(`${r} ${b(r===1?"timeEntry":"timeEntries",i)}`),o>0&&p.push(`${o} ${b(o===1?"faultEntry":"faultEntries",i)}`);const c=p.join(", ");t.innerHTML=`
      ${ye(16,n)}
      <div class="result-bib" style="font-family: var(--font-mono); font-size: 1.4rem; font-weight: 700; text-align: center; color: var(--text-primary); letter-spacing: 0.02em;">
        ${D(s)}
      </div>
      <div class="result-info" style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
        <div class="result-summary" style="font-size: 0.875rem; color: var(--text-secondary);">
          ${D(c)}
        </div>
      </div>
      <div class="result-tags" style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: max-content;">
        ${e.crossDeviceDuplicateCount>0?le(i):""}
        ${a?`<span class="result-fault-badge" style="padding: 2px 6px; border-radius: var(--radius); font-size: 0.7rem; font-weight: 600; background: var(--warning); color: #000;">
            ${o}× ${b("flt",i)}
          </span>`:""}
        ${W(d,l)}
      </div>
    `;const m=`header-${e.id}`,g={};return g.click=()=>{this.toggleGroup(e.id)},t.addEventListener("click",g.click),g.keydown=($=>{switch($.key){case"Enter":case" ":$.preventDefault(),this.toggleGroup(e.id);break;case"ArrowDown":$.preventDefault(),this.focusNextItem(t);break;case"ArrowUp":$.preventDefault(),this.focusPreviousItem(t);break}}),t.addEventListener("keydown",g.keydown),this.itemListeners.set(m,g),t}createEntryItem(e,n,t,s=0){const i=document.createElement("div");i.className="result-item",i.setAttribute("role","listitem"),i.setAttribute("tabindex","0"),i.setAttribute("data-entry-id",e.id),i.style.cssText=`
      position: absolute;
      left: 0;
      right: 0;
      height: ${P}px;
      display: grid;
      grid-template-columns: 28px 64px minmax(0, 1fr) auto;
      align-items: center;
      padding: 0 16px;
      column-gap: 12px;
      background: var(--surface);
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      cursor: pointer;
      transition: background 0.2s;
    `;const l=new Date(e.timestamp),d=ee(l),r=_(e.bib||"---"),o=this.cachedLang,a=te(e.point),p=V(e.point,o),c=e.run??1,m=K(c,o),g=n.length>0?ae({faults:n,lang:o}):"",$=s>0?le(o):"",C=`${String(l.getDate()).padStart(2,"0")}.${String(l.getMonth()+1).padStart(2,"0")}.${l.getFullYear()}`,B=e.deviceName?`${D(e.deviceName)}  ·  ${C}`:C;i.innerHTML=`
      <div></div>
      <div class="result-bib" style="font-family: var(--font-mono); font-size: 1.4rem; font-weight: 700; text-align: center; color: var(--text-primary); letter-spacing: 0.02em;">
        ${D(r)}
      </div>
      <div class="result-info" style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
        <div class="result-time" style="font-family: var(--font-mono); color: var(--text-primary); font-size: 1rem; font-weight: 600; letter-spacing: 0.03em;">
          ${D(d)}
        </div>
        <div class="result-device" style="font-size: 0.68rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); letter-spacing: 0.04em;">
          ${B}
        </div>
      </div>
      <div class="result-tags" style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: max-content;">
        ${$}
        ${g}
        ${e.status!=="ok"?Z(b(e.status,o)):""}
        ${e.photo?xe(b("viewPhotoLabel",o)):""}
        ${N(p,a)}
        ${W(m,j(c))}
        ${q({ariaLabel:b("editEntryLabel",o)})}
        ${G({ariaLabel:b("deleteEntryLabel",o)})}
      </div>
    `;const x={},O=i.querySelector(".result-edit-btn");x.editBtn=O,x.editClick=(v=>{var f,L;v.stopPropagation(),(L=(f=this.options).onItemClick)==null||L.call(f,e,v)}),O.addEventListener("click",x.editClick);const k=i.querySelector(".result-delete");x.deleteBtn=k,x.deleteClick=(v=>{var f,L;v.stopPropagation(),(L=(f=this.options).onItemDelete)==null||L.call(f,e)}),k.addEventListener("click",x.deleteClick);const E=i.querySelector(".result-photo-btn");return E&&(x.photoBtn=E,x.photoClick=(v=>{var f,L;v.stopPropagation(),(L=(f=this.options).onViewPhoto)==null||L.call(f,e)}),E.addEventListener("click",x.photoClick)),x.click=(v=>{var f,L;(L=(f=this.options).onItemClick)==null||L.call(f,e,v)}),i.addEventListener("click",x.click),x.keydown=(v=>{var L,se,ie,ne,oe,re;const f=v;switch(f.key){case"Enter":case" ":f.preventDefault(),(se=(L=this.options).onItemClick)==null||se.call(L,e,new MouseEvent("click"));break;case"e":case"E":f.preventDefault(),(ne=(ie=this.options).onItemClick)==null||ne.call(ie,e,new MouseEvent("click"));break;case"Delete":case"d":case"D":f.preventDefault(),(re=(oe=this.options).onItemDelete)==null||re.call(oe,e);break;case"ArrowDown":f.preventDefault(),this.focusNextItem(i);break;case"ArrowUp":f.preventDefault(),this.focusPreviousItem(i);break}}),i.addEventListener("keydown",x.keydown),this.itemListeners.set(t,x),this.swipeActions.set(t,new U({element:i,onSwipeRight:()=>{var v,f;return(f=(v=this.options).onItemClick)==null?void 0:f.call(v,e,new MouseEvent("click"))},onSwipeLeft:()=>{var v,f;return(f=(v=this.options).onItemDelete)==null?void 0:f.call(v,e)}})),i}createFaultOnlyItem(e,n){var O;const t=document.createElement("div"),s=e.faults,i=s.some(k=>k.markedForDeletion);t.className=`result-item fault-only-item${i?" marked-for-deletion":""}`,t.setAttribute("role","listitem"),t.setAttribute("tabindex","0"),t.setAttribute("data-fault-id",e.id),t.style.cssText=`
      position: absolute;
      left: 0;
      right: 0;
      height: ${P}px;
      display: grid;
      grid-template-columns: 28px 64px minmax(0, 1fr) auto;
      align-items: center;
      padding: 0 16px;
      column-gap: 12px;
      background: var(--surface);
      border-bottom: 1px solid var(--surface-elevated);
      border-left: 3px solid ${i?"var(--error)":"var(--warning)"};
      ${i?"opacity: 0.6;":""}
      cursor: pointer;
    `;const l=_(e.bib||"---"),d=this.cachedLang,r=j(e.run),o=K(e.run,d),a=s.sort((k,E)=>k.gateNumber-E.gateNumber).map(k=>`T${k.gateNumber} (${ce(k.faultType,d)})${k.markedForDeletion?" ⚠":""}`).join(", "),p=ae({faults:s,lang:d}),c=w.getState().usePenaltyMode,m=c?b("flt",d):b("dsq",d),g=c?"#f59e0b":"#ef4444",$=i?de():"";t.innerHTML=`
      <div></div>
      <div class="result-bib" style="font-family: var(--font-mono); font-size: 1.4rem; font-weight: 700; text-align: center; ${i?"text-decoration: line-through; opacity: 0.6;":""}">
        ${D(l)}
      </div>
      <div class="result-info" style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
        <div class="result-fault-details" style="font-size: 0.8rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ${i?"text-decoration: line-through; opacity: 0.6;":""}">
          ${D(a)}
        </div>
        ${(O=s[0])!=null&&O.deviceName?`
          <div class="result-device" style="font-size: 0.7rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${D(s[0].deviceName)}
          </div>
        `:""}
      </div>
      <div class="result-tags" style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: max-content;">
        ${$}
        ${i?"":p}
        ${i?"":Z(m,g)}
        ${N(b("gate",d),"var(--warning)")}
        ${W(o,r)}
        ${q({ariaLabel:b("editFaultLabel",d)})}
        ${G({ariaLabel:b("deleteFaultLabel",d),className:"result-delete fault-delete-btn"})}
      </div>
    `;const C={},B=t.querySelector(".result-edit-btn");B&&s.length>0&&(C.editBtn=B,C.editClick=(k=>{k.stopPropagation();const E=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:s[0]}});t.dispatchEvent(E)}),B.addEventListener("click",C.editClick));const x=t.querySelector(".fault-delete-btn");return x&&s.length>0&&(C.deleteBtn=x,C.deleteClick=(k=>{k.stopPropagation();const E=new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:s[0]}});t.dispatchEvent(E)}),x.addEventListener("click",C.deleteClick)),C.click=(k=>{const E=k.target;if(!(E.closest(".fault-delete-btn")||E.closest(".result-edit-btn"))&&s.length>0){const v=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:s[0]}});t.dispatchEvent(v)}}),t.addEventListener("click",C.click),C.keydown=(k=>{const E=k;switch(E.key){case"Enter":case" ":case"e":case"E":if(E.preventDefault(),s.length>0){const v=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:s[0]}});t.dispatchEvent(v)}break;case"Delete":case"d":case"D":if(E.preventDefault(),s.length>0){const v=new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:s[0]}});t.dispatchEvent(v)}break;case"ArrowDown":E.preventDefault(),this.focusNextItem(t);break;case"ArrowUp":E.preventDefault(),this.focusPreviousItem(t);break}}),t.addEventListener("keydown",C.keydown),this.itemListeners.set(n,C),s.length>0&&this.swipeActions.set(n,new U({element:t,onSwipeRight:()=>{t.dispatchEvent(new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:s[0]}}))},onSwipeLeft:()=>{t.dispatchEvent(new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:s[0]}}))}})),t}createSubEntryItem(e,n){const t=document.createElement("div");t.className="result-sub-item entry-sub-item",t.setAttribute("role","listitem"),t.setAttribute("tabindex","0"),t.setAttribute("data-entry-id",e.id),t.style.cssText=`
      position: absolute;
      left: 0;
      right: 0;
      height: ${M}px;
      display: grid;
      grid-template-columns: 28px 64px minmax(0, 1fr) auto;
      align-items: center;
      padding: 0 16px;
      column-gap: 12px;
      background: var(--surface-elevated);
      border-bottom: 1px solid var(--background);
      cursor: pointer;
      transition: background 0.2s;
    `;const s=new Date(e.timestamp),i=ee(s),l=this.cachedLang,d=te(e.point),r=V(e.point,l);t.innerHTML=`
      <div></div>
      ${N(r,d)}
      <div class="result-info" style="display: flex; align-items: center; gap: 8px; min-width: 0;">
        <div class="result-time" style="font-family: var(--font-mono); color: var(--text-secondary); font-size: 0.85rem;">
          ${D(i)}
        </div>
        ${e.deviceName?`
          <div class="result-device" style="font-size: 0.65rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${D(e.deviceName)}
          </div>
        `:""}
      </div>
      <div class="result-tags" style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: max-content;">
        ${e.status!=="ok"?Z(b(e.status,l),"var(--error)","0.65rem"):""}
        ${q({ariaLabel:b("editEntryLabel",l),size:16})}
        ${G({ariaLabel:b("deleteEntryLabel",l),size:16})}
      </div>
    `;const o={},a=t.querySelector(".result-edit-btn");o.editBtn=a,o.editClick=(c=>{var m,g;c.stopPropagation(),!A.wasRecentlyExited()&&((g=(m=this.options).onItemClick)==null||g.call(m,e,c))}),a.addEventListener("click",o.editClick);const p=t.querySelector(".result-delete");return o.deleteBtn=p,o.deleteClick=(c=>{var m,g;c.stopPropagation(),!A.wasRecentlyExited()&&((g=(m=this.options).onItemDelete)==null||g.call(m,e))}),p.addEventListener("click",o.deleteClick),o.click=(c=>{var m,g;A.wasRecentlyExited()||(g=(m=this.options).onItemClick)==null||g.call(m,e,c)}),t.addEventListener("click",o.click),o.keydown=(c=>{var g,$,C,B;const m=c;if(!A.wasRecentlyExited())switch(m.key){case"Enter":case" ":case"e":case"E":m.preventDefault(),($=(g=this.options).onItemClick)==null||$.call(g,e,new MouseEvent("click"));break;case"Delete":case"d":case"D":m.preventDefault(),(B=(C=this.options).onItemDelete)==null||B.call(C,e);break;case"ArrowDown":m.preventDefault(),this.focusNextItem(t);break;case"ArrowUp":m.preventDefault(),this.focusPreviousItem(t);break}}),t.addEventListener("keydown",o.keydown),this.itemListeners.set(n,o),this.swipeActions.set(n,new U({element:t,onSwipeRight:()=>{var c,m;A.wasRecentlyExited()||(m=(c=this.options).onItemClick)==null||m.call(c,e,new MouseEvent("click"))},onSwipeLeft:()=>{var c,m;A.wasRecentlyExited()||(m=(c=this.options).onItemDelete)==null||m.call(c,e)}})),t}createSubFaultItem(e,n){const t=document.createElement("div"),s=e.markedForDeletion;t.className=`result-sub-item fault-sub-item${s?" marked-for-deletion":""}`,t.setAttribute("role","listitem"),t.setAttribute("tabindex","0"),t.setAttribute("data-fault-id",e.id),t.style.cssText=`
      position: absolute;
      left: 0;
      right: 0;
      height: ${M}px;
      display: grid;
      grid-template-columns: 28px 64px minmax(0, 1fr) auto;
      align-items: center;
      padding: 0 16px;
      column-gap: 12px;
      background: var(--surface-elevated);
      border-bottom: 1px solid var(--background);
      border-left: 3px solid ${s?"var(--error)":"var(--warning)"};
      ${s?"opacity: 0.6;":""}
      cursor: pointer;
      transition: background 0.2s;
    `;const i=this.cachedLang,l=w.getGateColor(e.gateNumber),d=l==="red"?"#ef4444":"#3b82f6";t.innerHTML=`
      <div></div>
      <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
        ${N(`T${e.gateNumber}`,"var(--warning)")}
        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${d}; flex-shrink: 0;" title="${ke(l)}"></div>
      </div>
      <div class="result-info" style="display: flex; align-items: center; gap: 8px; min-width: 0;">
        <span style="font-size: 0.85rem; color: var(--text-secondary); ${s?"text-decoration: line-through;":""}">
          ${D(ce(e.faultType,i))}
        </span>
        ${e.deviceName?`
          <span style="font-size: 0.65rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${D(e.deviceName)}
          </span>
        `:""}
      </div>
      <div class="result-tags" style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: max-content;">
        ${s?de("0.65rem"):""}
        ${q({ariaLabel:b("editFaultLabel",i),size:16})}
        ${G({ariaLabel:b("deleteFaultLabel",i),size:16,className:"result-delete fault-delete-btn"})}
      </div>
    `;const r={},o=t.querySelector(".result-edit-btn");r.editBtn=o,r.editClick=(p=>{p.stopPropagation();const c=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(c)}),o.addEventListener("click",r.editClick);const a=t.querySelector(".fault-delete-btn");return r.deleteBtn=a,r.deleteClick=(p=>{p.stopPropagation();const c=new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(c)}),a.addEventListener("click",r.deleteClick),r.click=(()=>{const p=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(p)}),t.addEventListener("click",r.click),r.keydown=(p=>{const c=p;switch(c.key){case"Enter":case" ":case"e":case"E":c.preventDefault();{const m=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(m)}break;case"Delete":case"d":case"D":c.preventDefault();{const m=new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(m)}break;case"ArrowDown":c.preventDefault(),this.focusNextItem(t);break;case"ArrowUp":c.preventDefault(),this.focusPreviousItem(t);break}}),t.addEventListener("keydown",r.keydown),this.itemListeners.set(n,r),this.swipeActions.set(n,new U({element:t,onSwipeRight:()=>{t.dispatchEvent(new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:e}}))},onSwipeLeft:()=>{t.dispatchEvent(new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:e}}))}})),t}renderEmpty(){for(const[e,n]of this.visibleItems.entries())this.cleanupItemListeners(e,n),n.remove();this.visibleItems.clear(),this.contentContainer.innerHTML=`
      <div class="empty-state">
        <span class="empty-icon">⏱️</span>
        <span>${b("noEntries",this.cachedLang)}</span>
        <span class="empty-subtitle">${b("noEntriesHint",this.cachedLang)}</span>
      </div>
    `}pause(){this.isPaused=!0}resume(){this.isPaused=!1,this.needsRefreshOnResume&&(this.needsRefreshOnResume=!1,this.render())}scrollToTop(){this.scrollContainer.scrollTo({top:0,behavior:"smooth"})}scrollToEntry(e){const n=String(e),t=this.groups.find(i=>i.entries.some(l=>l.id===n));if(!t)return;let s=0;for(const i of this.groups){if(i.id===t.id)break;s+=this.getGroupHeight(i)}t.isMultiItem&&(this.expandedGroups.add(t.id),this.isPaused?this.needsRefreshOnResume=!0:this.render()),this.isPaused||this.scrollContainer.scrollTo({top:s,behavior:"smooth"})}getVisibleCount(){return this.groups.reduce((e,n)=>e+n.entries.length,0)}getSortedFocusableItems(){const e=Array.from(this.visibleItems.values());return e.sort((n,t)=>{const s=this.getItemYPosition(n),i=this.getItemYPosition(t);return s-i}),e}focusNextItem(e){const n=this.getSortedFocusableItems(),t=n.indexOf(e);t>=0&&t<n.length-1&&n[t+1].focus()}focusPreviousItem(e){const n=this.getSortedFocusableItems(),t=n.indexOf(e);t>0&&n[t-1].focus()}getItemYPosition(e){const t=e.style.transform.match(/translateY\((-?\d+)px\)/);return t?parseInt(t[1],10):0}cleanupItemListeners(e,n){const t=this.swipeActions.get(e);t&&(t.destroy(),this.swipeActions.delete(e));const s=this.itemListeners.get(e);s&&(s.click&&n.removeEventListener("click",s.click),s.keydown&&n.removeEventListener("keydown",s.keydown),s.editBtn&&s.editClick&&s.editBtn.removeEventListener("click",s.editClick),s.deleteBtn&&s.deleteClick&&s.deleteBtn.removeEventListener("click",s.deleteClick),s.photoBtn&&s.photoClick&&s.photoBtn.removeEventListener("click",s.photoClick),this.itemListeners.delete(e))}destroy(){if(!this.isDestroyed){this.isDestroyed=!0,this.domRemovalObserver&&(this.domRemovalObserver.disconnect(),this.domRemovalObserver=null),this.scrollHandler&&(this.scrollContainer.removeEventListener("scroll",this.scrollHandler),this.scrollHandler=null),this.scrollDebounceTimeout!==null&&(clearTimeout(this.scrollDebounceTimeout),this.scrollDebounceTimeout=null),this.resizeDebounceTimeout!==null&&(clearTimeout(this.resizeDebounceTimeout),this.resizeDebounceTimeout=null),this.resizeObserver&&(this.resizeObserver.disconnect(),this.resizeObserver=null),this.unsubscribe&&(this.unsubscribe(),this.unsubscribe=null),this.unsubscribeBattery&&(this.unsubscribeBattery(),this.unsubscribeBattery=null);for(const[e,n]of this.visibleItems)this.cleanupItemListeners(e,n);this.visibleItems.clear(),this.itemListeners.clear(),this.swipeActions.clear(),this.scrollContainer.remove()}}}let z=null,R=null;async function Ge(u){const e=document.getElementById("photo-viewer-modal");if(!e||!u.photo)return;z=u.id;const n=document.getElementById("photo-viewer-image"),t=document.getElementById("photo-viewer-bib"),s=document.getElementById("photo-viewer-point"),i=document.getElementById("photo-viewer-time"),d=w.getState().currentLang;if(R&&(URL.revokeObjectURL(R),R=null),n){const r=V(u.point,d);if(n.alt=`${b("photoForBib",d)} ${u.bib||"---"} - ${r}`,Ie(u.photo)){n.src="";const o=await me.getPhoto(u.id);if(o){const a=atob(o),p=new Uint8Array(a.length);for(let m=0;m<a.length;m++)p[m]=a.charCodeAt(m);const c=new Blob([p],{type:"image/jpeg"});R=URL.createObjectURL(c),n.src=R}else{X.warn("Photo not found in IndexedDB for entry:",u.id),z=null;return}}else n.src=`data:image/jpeg;base64,${u.photo}`}if(t&&(t.textContent=u.bib||"---"),s){s.textContent=V(u.point,d);const r=te(u.point);s.style.background=r,s.style.color="var(--background)"}if(i){const r=new Date(u.timestamp);i.textContent=ee(r)}Re(e)}function Ue(){R&&(URL.revokeObjectURL(R),R=null);const u=document.getElementById("photo-viewer-modal");Ae(u),z=null}async function Je(){if(!z)return;const u=w.getState(),e=z;await me.deletePhoto(e),w.updateEntry(e,{photo:void 0}),Ue(),Y(b("photoDeleted",u.currentLang),"success"),De()}let S=null,F=null,T=null;const I=new $e;function Fe(u){window.dispatchEvent(new CustomEvent("open-edit-modal",{detail:{entry:u}}))}function Ve(u){window.dispatchEvent(new CustomEvent("prompt-delete",{detail:{entry:u}}))}function J(u){window.dispatchEvent(new CustomEvent("open-confirm-modal",{detail:{action:u}}))}function Qe(){return S}function Xe(){I.removeAll(),T&&(clearTimeout(T),T=null);const u=y("results-list");if(!u)return;S=new qe({container:u,onItemClick:o=>Fe(o),onItemDelete:o=>Ve(o),onItemSelect:o=>{w.toggleEntrySelection(o.id)},onViewPhoto:o=>Ge(o)}),I.add(u,"fault-edit-request",(o=>{var p;const a=(p=o.detail)==null?void 0:p.fault;a&&Pe(a)})),I.add(u,"fault-delete-request",(o=>{var p;const a=(p=o.detail)==null?void 0:p.fault;a&&Me(a)}));const e=w.getState();S.setEntries(e.entries),be();const n=document.querySelector(".results-view");n&&(F=new Se({container:n,onRefresh:async()=>{await pe.forceRefresh(),Y(b("syncReceived",w.getState().currentLang),"success")}}));const t=y("search-input");t&&I.add(t,"input",()=>{T&&clearTimeout(T),T=setTimeout(()=>{Q()},300)});const s=y("filter-point"),i=y("filter-status");s&&I.add(s,"change",Q),i&&I.add(i,"change",Q);const l=y("toggle-filters-btn"),d=document.querySelector(".search-filter-bar");l&&d&&I.add(l,"click",()=>{const o=d.classList.toggle("visible");l.setAttribute("aria-expanded",String(o)),l.classList.toggle("active",o)});const r=y("quick-export-btn");r&&I.add(r,"click",()=>{he()}),Ye(),e.currentView!=="results"&&S&&S.pause()}function Ye(){const u=y("clear-all-btn");u&&I.add(u,"click",()=>{const s=w.getState();if(s.entries.length===0){Y(b("noEntries",s.currentLang),"info");return}J("clearAll")});const e=y("undo-btn");e&&I.add(e,"click",()=>{if(w.canUndo()){const s=w.peekUndo();if(s&&s.type==="ADD_ENTRY")J("undoAdd");else{const i=w.undo();Te(),Y(b("undone",w.getState().currentLang),"success");const l=w.getState();if(i&&i.type==="ADD_ENTRY"&&l.settings.sync&&l.raceId){const d=i.data;pe.deleteEntryFromCloud(d.id,d.deviceId).catch(()=>{})}}}});const n=y("export-btn");n&&I.add(n,"click",he);const t=y("delete-selected-btn");t&&I.add(t,"click",()=>{w.getState().selectedEntries.size>0&&J("deleteSelected")})}function Q(){if(!S)return;const u=y("search-input"),e=y("filter-point"),n=y("filter-status");S.applyFilters((u==null?void 0:u.value)||"",(e==null?void 0:e.value)||"all",(n==null?void 0:n.value)||"all"),be()}function be(){const e=w.getState().entries,n=e.length,t=new Set(e.map(c=>c.bib)).size,s=new Set(e.filter(c=>c.point==="F"&&c.status==="ok").map(c=>c.bib)).size,i=new Map;for(const c of e){const m=`${c.bib}-${c.point}-${c.run??1}`;i.has(m)||i.set(m,new Set),i.get(m).add(c.deviceId)}let l=0;for(const c of i.values())c.size>1&&l++;const d=y("stat-total"),r=y("stat-racers"),o=y("stat-finished"),a=y("stat-duplicates"),p=y("stat-duplicates-item");d&&(d.textContent=String(n)),r&&(r.textContent=String(t)),o&&(o.textContent=String(s)),a&&(a.textContent=String(l)),p&&(p.style.display=l>0?"":"none")}function et(){const u=y("entry-count-badge");if(u){const e=w.getState().entries.length;u.textContent=String(e),u.style.display=e>0?"inline":"none"}}function _e(){T&&(clearTimeout(T),T=null),I.removeAll(),F&&(F.destroy(),F=null),S&&(S.destroy(),S=null)}function tt(){_e()}export{et as a,tt as b,Ue as c,Je as d,Qe as g,Xe as i,be as u};
