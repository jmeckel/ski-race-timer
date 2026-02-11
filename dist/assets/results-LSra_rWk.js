var fe=Object.defineProperty;var be=(d,e,i)=>e in d?fe(d,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):d[e]=i;var v=(d,e,i)=>be(d,typeof e!="symbol"?e+"":e,i);import{u as W,w as ve,s as w,x as Y,y as _,z as j,t as g,A as ge,e as I,B as J,C as re,l as X,D as ee,E as U,F as le,G as O,H as K,I as we,J as z,K as N,S as q,b as ae,M as ce,$ as ye,N as ke,O as Ee,P as xe,Q as ue,a as F,R as Ce,L as Le,p as x,T as Ie,q as he,U as De,V as $e}from"./chief-judge-DzOMKuKA.js";import{m as Se}from"./vendor-signals-BA-R9xnX.js";import{o as Te,c as Be,a as Re,b as Ae}from"./gate-judge-KS1_pNnj.js";const A=72,M=56,P=72,de=5,pe=16,Me=33,Pe=50,He=100;function Oe(d){switch(d){case"critical":return Pe;case"low":return Me;default:return pe}}class ze{constructor(e){v(this,"container");v(this,"scrollContainer");v(this,"contentContainer");v(this,"entries",[]);v(this,"groups",[]);v(this,"expandedGroups",new Set);v(this,"visibleItems",new Map);v(this,"itemListeners",new Map);v(this,"swipeActions",new Map);v(this,"scrollTop",0);v(this,"containerHeight",0);v(this,"options");v(this,"unsubscribe",null);v(this,"resizeObserver",null);v(this,"scrollHandler",null);v(this,"scrollDebounceTimeout",null);v(this,"resizeDebounceTimeout",null);v(this,"isPaused",!1);v(this,"needsRefreshOnResume",!1);v(this,"isDestroyed",!1);v(this,"domRemovalObserver",null);v(this,"scrollDebounceDelay",pe);v(this,"unsubscribeBattery",null);this.options=e,this.container=e.container,this.scrollContainer=document.createElement("div"),this.scrollContainer.className="virtual-scroll-container",this.scrollContainer.style.cssText=`
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
    `,this.contentContainer=document.createElement("div"),this.contentContainer.className="virtual-scroll-content",this.contentContainer.style.position="relative",this.scrollContainer.appendChild(this.contentContainer),this.container.appendChild(this.scrollContainer),this.scrollHandler=()=>{this.scrollDebounceTimeout!==null&&clearTimeout(this.scrollDebounceTimeout),this.scrollDebounceTimeout=setTimeout(()=>{this.scrollDebounceTimeout=null;try{this.onScroll()}catch(t){W.error("VirtualList scroll error:",t)}},this.scrollDebounceDelay)},this.scrollContainer.addEventListener("scroll",this.scrollHandler,{passive:!0}),this.unsubscribeBattery=ve.subscribe(t=>{this.scrollDebounceDelay=Oe(t.batteryLevel)}),this.resizeObserver=new ResizeObserver(()=>{this.resizeDebounceTimeout!==null&&clearTimeout(this.resizeDebounceTimeout),this.resizeDebounceTimeout=setTimeout(()=>{this.resizeDebounceTimeout=null;try{this.containerHeight=this.scrollContainer.clientHeight,this.isPaused?this.needsRefreshOnResume=!0:this.render()}catch(t){W.error("VirtualList resize error:",t)}},He)}),this.resizeObserver.observe(this.scrollContainer),this.unsubscribe=Se(()=>{const t=ye.value;ke.value,Ee.value,this.setEntries(t)}),this.domRemovalObserver=new MutationObserver(t=>{var s;for(const n of t)for(const l of n.removedNodes)if(l===this.container||(s=l.contains)!=null&&s.call(l,this.container)){this.destroy();return}});const i=this.container.parentElement||document.body;this.domRemovalObserver.observe(i,{childList:!0,subtree:!0}),this.containerHeight=this.scrollContainer.clientHeight}setEntries(e){this.entries=e,this.applyFilters()}applyFilters(e,i,t){var c;this.scrollDebounceTimeout!==null&&(clearTimeout(this.scrollDebounceTimeout),this.scrollDebounceTimeout=null);const s=w.getState();let n=[...this.entries];if(e){const o=e.toLowerCase();n=n.filter(a=>{var r;return a.bib.toLowerCase().includes(o)||((r=a.deviceName)==null?void 0:r.toLowerCase().includes(o))})}i&&i!=="all"&&(n=n.filter(o=>o.point===i)),t&&t!=="all"&&(n=n.filter(o=>o.status===t));const l=new Map;for(const o of n){const a=o.run??1,r=`${o.bib}-${a}`;l.has(r)||l.set(r,{id:r,bib:o.bib,run:a,entries:[],faults:[],isMultiItem:!1,latestTimestamp:o.timestamp,crossDeviceDuplicateCount:0});const b=l.get(r);b.entries.push(o),new Date(o.timestamp)>new Date(b.latestTimestamp)&&(b.latestTimestamp=o.timestamp)}for(const o of s.faultEntries){const a=`${o.bib}-${o.run}`;if(e){const b=e.toLowerCase();if(!o.bib.toLowerCase().includes(b)&&!((c=o.deviceName)!=null&&c.toLowerCase().includes(b)))continue}if(i&&i!=="all"||t&&t!=="all"&&t!=="dsq"&&t!=="flt")continue;l.has(a)||l.set(a,{id:a,bib:o.bib,run:o.run,entries:[],faults:[],isMultiItem:!1,latestTimestamp:o.timestamp,crossDeviceDuplicateCount:0});const r=l.get(a);r.faults.push(o),new Date(o.timestamp)>new Date(r.latestTimestamp)&&(r.latestTimestamp=o.timestamp)}for(const o of l.values()){const a=o.entries.length+o.faults.length;o.isMultiItem=a>1;const r=new Map;for(const h of o.entries){const u=h.point;r.has(u)||r.set(u,new Set),r.get(u).add(h.deviceId)}let b=0;for(const h of r.values())h.size>1&&b++;o.crossDeviceDuplicateCount=b}this.groups=Array.from(l.values()).sort((o,a)=>{const r=parseInt(o.bib,10)||0;return(parseInt(a.bib,10)||0)-r});for(const[o,a]of this.visibleItems)this.cleanupItemListeners(o,a),a.remove();this.visibleItems.clear(),this.updateContentHeight(),this.isPaused?this.needsRefreshOnResume=!0:this.render()}toggleGroup(e){this.expandedGroups.has(e)?this.expandedGroups.delete(e):this.expandedGroups.add(e);const i=this.groups.find(t=>t.id===e);if(i){const t=new Set;t.add(`header-${e}`),i.isMultiItem||t.add(`single-${e}`);for(const s of i.entries)t.add(`sub-entry-${s.id}`);for(const s of i.faults)t.add(`sub-fault-${s.id}`);for(const s of t){const n=this.visibleItems.get(s);n&&(this.cleanupItemListeners(s,n),n.remove(),this.visibleItems.delete(s))}}this.updateContentHeight(),this.isPaused?this.needsRefreshOnResume=!0:this.render()}updateContentHeight(){let e=0;for(const i of this.groups)if(!i.isMultiItem)e+=A;else if(this.expandedGroups.has(i.id)){const t=i.entries.length+i.faults.length;e+=P+t*M}else e+=P;this.contentContainer.style.height=`${e}px`}getGroupHeight(e){if(!e.isMultiItem)return A;if(this.expandedGroups.has(e.id)){const i=e.entries.length+e.faults.length;return P+i*M}return P}onScroll(){this.scrollTop=this.scrollContainer.scrollTop,this.isPaused?this.needsRefreshOnResume=!0:this.render()}render(){if(this.groups.length===0){this.renderEmpty();return}const e=this.contentContainer.querySelector(".empty-state");e&&e.remove();const i=new Set,t=this.scrollTop,s=this.scrollTop+this.containerHeight;let n=0;for(let l=0;l<this.groups.length;l++){const c=this.groups[l],o=this.getGroupHeight(c);n+o>=t-de*A&&n<=s+de*A&&(c.isMultiItem?this.expandedGroups.has(c.id)?this.renderExpandedGroup(c,n,i):this.renderCollapsedGroup(c,n,i):this.renderSingleItem(c,n,i)),n+=o}for(const[l,c]of this.visibleItems)i.has(l)||(this.cleanupItemListeners(l,c),c.remove(),this.visibleItems.delete(l))}renderSingleItem(e,i,t){const s=`single-${e.id}`;t.add(s);let n=this.visibleItems.get(s);if(!n){if(e.entries.length>0)n=this.createEntryItem(e.entries[0],e.faults,s,e.crossDeviceDuplicateCount);else if(e.faults.length>0)n=this.createFaultOnlyItem(e,s);else return;this.visibleItems.set(s,n),this.contentContainer.appendChild(n)}n.style.transform=`translateY(${i}px)`}renderCollapsedGroup(e,i,t){const s=`header-${e.id}`;t.add(s);let n=this.visibleItems.get(s);n||(n=this.createGroupHeader(e,!1),this.visibleItems.set(s,n),this.contentContainer.appendChild(n)),n.style.transform=`translateY(${i}px)`}renderExpandedGroup(e,i,t){const s=`header-${e.id}`;t.add(s);let n=this.visibleItems.get(s);n||(n=this.createGroupHeader(e,!0),this.visibleItems.set(s,n),this.contentContainer.appendChild(n)),n.style.transform=`translateY(${i}px)`;let l=i+P;for(let c=0;c<e.entries.length;c++){const o=e.entries[c],a=`sub-entry-${o.id}`;t.add(a);let r=this.visibleItems.get(a);r||(r=this.createSubEntryItem(o,a),this.visibleItems.set(a,r),this.contentContainer.appendChild(r)),r.style.transform=`translateY(${l}px)`,l+=M}for(let c=0;c<e.faults.length;c++){const o=e.faults[c],a=`sub-fault-${o.id}`;t.add(a);let r=this.visibleItems.get(a);r||(r=this.createSubFaultItem(o,a),this.visibleItems.set(a,r),this.contentContainer.appendChild(r)),r.style.transform=`translateY(${l}px)`,l+=M}}createGroupHeader(e,i){const t=document.createElement("div");t.className=`result-group-header ${i?"expanded":""}`,t.setAttribute("data-group-id",e.id),t.setAttribute("role","button"),t.setAttribute("tabindex","0"),t.setAttribute("aria-expanded",String(i)),t.style.cssText=`
      position: absolute;
      left: 0;
      right: 0;
      height: ${P}px;
      display: flex;
      align-items: center;
      padding: 0 8px 0 4px;
      gap: 8px;
      background: var(--surface);
      border-bottom: 1px solid var(--surface-elevated);
      cursor: pointer;
      transition: background 0.2s;
    `;const s=Y(e.bib||"---"),l=w.getState().currentLang,c=_(e.run),o=j(e.run,l),a=e.entries.length,r=e.faults.length,b=r>0,h=[];a>0&&h.push(`${a} ${g(a===1?"timeEntry":"timeEntries",l)}`),r>0&&h.push(`${r} ${g(r===1?"faultEntry":"faultEntries",l)}`);const u=h.join(", ");t.innerHTML=`
      ${ge(16,i)}
      <div class="result-bib" style="font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 600; min-width: 44px; text-align: right;">
        ${I(s)}
      </div>
      <div style="min-width: 48px;"></div>
      ${J(o,c)}
      <div class="result-info" style="flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;">
        <div class="result-summary" style="font-size: 0.875rem; color: var(--text-secondary);">
          ${I(u)}
        </div>
      </div>
      ${e.crossDeviceDuplicateCount>0?re(l):""}
      ${b?`<span class="result-fault-badge" style="padding: 2px 6px; border-radius: var(--radius); font-size: 0.7rem; font-weight: 600; background: var(--warning); color: #000;">
          ${r}× ${g("flt",l)}
        </span>`:""}
    `;const p=`header-${e.id}`,y={};return y.click=()=>{this.toggleGroup(e.id)},t.addEventListener("click",y.click),y.keydown=(D=>{switch(D.key){case"Enter":case" ":D.preventDefault(),this.toggleGroup(e.id);break;case"ArrowDown":D.preventDefault(),this.focusNextItem(t);break;case"ArrowUp":D.preventDefault(),this.focusPreviousItem(t);break}}),t.addEventListener("keydown",y.keydown),this.itemListeners.set(p,y),t}createEntryItem(e,i,t,s=0){const n=document.createElement("div");n.className="result-item",n.setAttribute("role","listitem"),n.setAttribute("tabindex","0"),n.setAttribute("data-entry-id",e.id),n.style.cssText=`
      position: absolute;
      left: 0;
      right: 0;
      height: ${A}px;
      display: flex;
      align-items: center;
      padding: 0 8px 0 4px;
      gap: 8px;
      background: var(--surface);
      border-bottom: 1px solid var(--surface-elevated);
      cursor: pointer;
      transition: background 0.2s;
    `;const l=new Date(e.timestamp),c=X(l),o=Y(e.bib||"---"),r=w.getState().currentLang,b=ee(e.point),h=U(e.point,r),u=e.run??1,p=_(u),y=j(u,r),D=i.length>0?le({faults:i,lang:r}):"",C=s>0?re(r):"";n.innerHTML=`
      <div style="width: 16px; flex-shrink: 0;"></div>
      <div class="result-bib" style="font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 600; min-width: 44px; text-align: right;">
        ${I(o)}
      </div>
      ${O(h,b)}
      ${J(y,p)}
      <div class="result-info" style="flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;">
        <div class="result-time" style="font-family: 'JetBrains Mono', monospace; color: var(--text-secondary); font-size: 0.875rem;">
          ${I(c)}
        </div>
        ${e.deviceName?`
          <div class="result-device" style="font-size: 0.7rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${I(e.deviceName)}
          </div>
        `:""}
      </div>
      ${C}
      ${D}
      ${e.status!=="ok"?K(g(e.status,r)):""}
      ${e.photo?we(g("viewPhotoLabel",r)):""}
      ${z({ariaLabel:g("editEntryLabel",r)})}
      ${N({ariaLabel:g("deleteEntryLabel",r)})}
    `;const k={},R=n.querySelector(".result-edit-btn");k.editBtn=R,k.editClick=(m=>{var f,L;m.stopPropagation(),(L=(f=this.options).onItemClick)==null||L.call(f,e,m)}),R.addEventListener("click",k.editClick);const H=n.querySelector(".result-delete");k.deleteBtn=H,k.deleteClick=(m=>{var f,L;m.stopPropagation(),(L=(f=this.options).onItemDelete)==null||L.call(f,e)}),H.addEventListener("click",k.deleteClick);const E=n.querySelector(".result-photo-btn");return E&&(k.photoBtn=E,k.photoClick=(m=>{var f,L;m.stopPropagation(),(L=(f=this.options).onViewPhoto)==null||L.call(f,e)}),E.addEventListener("click",k.photoClick)),k.click=(m=>{var f,L;(L=(f=this.options).onItemClick)==null||L.call(f,e,m)}),n.addEventListener("click",k.click),k.keydown=(m=>{var L,te,se,ie,ne,oe;const f=m;switch(f.key){case"Enter":case" ":f.preventDefault(),(te=(L=this.options).onItemClick)==null||te.call(L,e,new MouseEvent("click"));break;case"e":case"E":f.preventDefault(),(ie=(se=this.options).onItemClick)==null||ie.call(se,e,new MouseEvent("click"));break;case"Delete":case"d":case"D":f.preventDefault(),(oe=(ne=this.options).onItemDelete)==null||oe.call(ne,e);break;case"ArrowDown":f.preventDefault(),this.focusNextItem(n);break;case"ArrowUp":f.preventDefault(),this.focusPreviousItem(n);break}}),n.addEventListener("keydown",k.keydown),this.itemListeners.set(t,k),this.swipeActions.set(t,new q({element:n,onSwipeRight:()=>{var m,f;return(f=(m=this.options).onItemClick)==null?void 0:f.call(m,e,new MouseEvent("click"))},onSwipeLeft:()=>{var m,f;return(f=(m=this.options).onItemDelete)==null?void 0:f.call(m,e)}})),n}createFaultOnlyItem(e,i){var H;const t=document.createElement("div"),s=e.faults,n=s.some(E=>E.markedForDeletion);t.className=`result-item fault-only-item${n?" marked-for-deletion":""}`,t.setAttribute("role","listitem"),t.setAttribute("tabindex","0"),t.setAttribute("data-fault-id",e.id),t.style.cssText=`
      position: absolute;
      left: 0;
      right: 0;
      height: ${A}px;
      display: flex;
      align-items: center;
      padding: 0 8px 0 4px;
      gap: 8px;
      background: var(--surface);
      border-bottom: 1px solid var(--surface-elevated);
      border-left: 3px solid ${n?"var(--error)":"var(--warning)"};
      ${n?"opacity: 0.6;":""}
      cursor: pointer;
    `;const l=Y(e.bib||"---"),c=w.getState(),o=c.currentLang,a=_(e.run),r=j(e.run,o),b=s.sort((E,m)=>E.gateNumber-m.gateNumber).map(E=>`T${E.gateNumber} (${ae(E.faultType,o)})${E.markedForDeletion?" ⚠":""}`).join(", "),h=le({faults:s,lang:o}),u=c.usePenaltyMode?g("flt",o):g("dsq",o),p=c.usePenaltyMode?"var(--warning)":"var(--error)",y=p==="var(--warning)"?"#000":"white",D=n?ce():"";t.innerHTML=`
      <div style="width: 16px; flex-shrink: 0;"></div>
      <div class="result-bib" style="font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 600; min-width: 44px; text-align: right; ${n?"text-decoration: line-through; opacity: 0.6;":""}">
        ${I(l)}
      </div>
      ${O(g("gate",o),"var(--warning)")}
      ${J(r,a)}
      <div class="result-info" style="flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;">
        <div class="result-fault-details" style="font-size: 0.8rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ${n?"text-decoration: line-through; opacity: 0.6;":""}">
          ${I(b)}
        </div>
        ${(H=s[0])!=null&&H.deviceName?`
          <div class="result-device" style="font-size: 0.7rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${I(s[0].deviceName)}
          </div>
        `:""}
      </div>
      ${D}
      ${n?"":h}
      ${n?"":K(u,p,y)}
      ${z({ariaLabel:g("editFaultLabel",o)})}
      ${N({ariaLabel:g("deleteFaultLabel",o),className:"result-delete fault-delete-btn"})}
    `;const C={},k=t.querySelector(".result-edit-btn");k&&s.length>0&&(C.editBtn=k,C.editClick=(E=>{E.stopPropagation();const m=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:s[0]}});t.dispatchEvent(m)}),k.addEventListener("click",C.editClick));const R=t.querySelector(".fault-delete-btn");return R&&s.length>0&&(C.deleteBtn=R,C.deleteClick=(E=>{E.stopPropagation();const m=new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:s[0]}});t.dispatchEvent(m)}),R.addEventListener("click",C.deleteClick)),C.click=(E=>{const m=E.target;if(!(m.closest(".fault-delete-btn")||m.closest(".result-edit-btn"))&&s.length>0){const f=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:s[0]}});t.dispatchEvent(f)}}),t.addEventListener("click",C.click),C.keydown=(E=>{const m=E;switch(m.key){case"Enter":case" ":case"e":case"E":if(m.preventDefault(),s.length>0){const f=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:s[0]}});t.dispatchEvent(f)}break;case"Delete":case"d":case"D":if(m.preventDefault(),s.length>0){const f=new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:s[0]}});t.dispatchEvent(f)}break;case"ArrowDown":m.preventDefault(),this.focusNextItem(t);break;case"ArrowUp":m.preventDefault(),this.focusPreviousItem(t);break}}),t.addEventListener("keydown",C.keydown),this.itemListeners.set(i,C),s.length>0&&this.swipeActions.set(i,new q({element:t,onSwipeRight:()=>{t.dispatchEvent(new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:s[0]}}))},onSwipeLeft:()=>{t.dispatchEvent(new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:s[0]}}))}})),t}createSubEntryItem(e,i){const t=document.createElement("div");t.className="result-sub-item entry-sub-item",t.setAttribute("role","listitem"),t.setAttribute("tabindex","0"),t.setAttribute("data-entry-id",e.id),t.style.cssText=`
      position: absolute;
      left: 0;
      right: 0;
      height: ${M}px;
      display: flex;
      align-items: center;
      padding: 0 8px 0 24px;
      gap: 8px;
      background: var(--surface-elevated);
      border-bottom: 1px solid var(--background);
      cursor: pointer;
      transition: background 0.2s;
    `;const s=new Date(e.timestamp),n=X(s),c=w.getState().currentLang,o=ee(e.point),a=U(e.point,c);t.innerHTML=`
      <div style="width: 16px; flex-shrink: 0;"></div>
      <div style="min-width: 44px;"></div>
      ${O(a,o,"48px","0.7rem")}
      <div style="min-width: 36px;"></div>
      <div class="result-info" style="flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0;">
        <div class="result-time" style="font-family: 'JetBrains Mono', monospace; color: var(--text-secondary); font-size: 0.85rem;">
          ${I(n)}
        </div>
        ${e.deviceName?`
          <div class="result-device" style="font-size: 0.65rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${I(e.deviceName)}
          </div>
        `:""}
      </div>
      ${e.status!=="ok"?K(g(e.status,c),"var(--error)","white","0.65rem"):""}
      ${z({ariaLabel:g("editEntryLabel",c),size:16})}
      ${N({ariaLabel:g("deleteEntryLabel",c),size:16})}
    `;const r={},b=t.querySelector(".result-edit-btn");r.editBtn=b,r.editClick=(u=>{var p,y;u.stopPropagation(),(y=(p=this.options).onItemClick)==null||y.call(p,e,u)}),b.addEventListener("click",r.editClick);const h=t.querySelector(".result-delete");return r.deleteBtn=h,r.deleteClick=(u=>{var p,y;u.stopPropagation(),(y=(p=this.options).onItemDelete)==null||y.call(p,e)}),h.addEventListener("click",r.deleteClick),r.click=(u=>{var p,y;(y=(p=this.options).onItemClick)==null||y.call(p,e,u)}),t.addEventListener("click",r.click),r.keydown=(u=>{var y,D,C,k;const p=u;switch(p.key){case"Enter":case" ":case"e":case"E":p.preventDefault(),(D=(y=this.options).onItemClick)==null||D.call(y,e,new MouseEvent("click"));break;case"Delete":case"d":case"D":p.preventDefault(),(k=(C=this.options).onItemDelete)==null||k.call(C,e);break;case"ArrowDown":p.preventDefault(),this.focusNextItem(t);break;case"ArrowUp":p.preventDefault(),this.focusPreviousItem(t);break}}),t.addEventListener("keydown",r.keydown),this.itemListeners.set(i,r),this.swipeActions.set(i,new q({element:t,onSwipeRight:()=>{var u,p;return(p=(u=this.options).onItemClick)==null?void 0:p.call(u,e,new MouseEvent("click"))},onSwipeLeft:()=>{var u,p;return(p=(u=this.options).onItemDelete)==null?void 0:p.call(u,e)}})),t}createSubFaultItem(e,i){const t=document.createElement("div"),s=e.markedForDeletion;t.className=`result-sub-item fault-sub-item${s?" marked-for-deletion":""}`,t.setAttribute("role","listitem"),t.setAttribute("tabindex","0"),t.setAttribute("data-fault-id",e.id),t.style.cssText=`
      position: absolute;
      left: 0;
      right: 0;
      height: ${M}px;
      display: flex;
      align-items: center;
      padding: 0 8px 0 24px;
      gap: 8px;
      background: var(--surface-elevated);
      border-bottom: 1px solid var(--background);
      border-left: 3px solid ${s?"var(--error)":"var(--warning)"};
      ${s?"opacity: 0.6;":""}
      cursor: pointer;
      transition: background 0.2s;
    `;const l=w.getState().currentLang,c=w.getGateColor(e.gateNumber),o=c==="red"?"#ef4444":"#3b82f6";t.innerHTML=`
      <div style="width: 16px; flex-shrink: 0;"></div>
      <div style="min-width: 44px;"></div>
      ${O(`T${e.gateNumber}`,"var(--warning)","48px","0.7rem")}
      <div style="min-width: 36px; display: flex; align-items: center; justify-content: center;">
        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${o};" title="${c}"></div>
      </div>
      <div class="result-info" style="flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0;">
        <span style="font-size: 0.85rem; color: var(--text-secondary); ${s?"text-decoration: line-through;":""}">
          ${I(ae(e.faultType,l))}
        </span>
        ${e.deviceName?`
          <span style="font-size: 0.65rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${I(e.deviceName)}
          </span>
        `:""}
      </div>
      ${s?ce("0.65rem"):""}
      ${z({ariaLabel:g("editFaultLabel",l),size:16})}
      ${N({ariaLabel:g("deleteFaultLabel",l),size:16,className:"result-delete fault-delete-btn"})}
    `;const a={},r=t.querySelector(".result-edit-btn");a.editBtn=r,a.editClick=(h=>{h.stopPropagation();const u=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(u)}),r.addEventListener("click",a.editClick);const b=t.querySelector(".fault-delete-btn");return a.deleteBtn=b,a.deleteClick=(h=>{h.stopPropagation();const u=new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(u)}),b.addEventListener("click",a.deleteClick),a.click=(()=>{const h=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(h)}),t.addEventListener("click",a.click),a.keydown=(h=>{const u=h;switch(u.key){case"Enter":case" ":case"e":case"E":u.preventDefault();{const p=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(p)}break;case"Delete":case"d":case"D":u.preventDefault();{const p=new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(p)}break;case"ArrowDown":u.preventDefault(),this.focusNextItem(t);break;case"ArrowUp":u.preventDefault(),this.focusPreviousItem(t);break}}),t.addEventListener("keydown",a.keydown),this.itemListeners.set(i,a),this.swipeActions.set(i,new q({element:t,onSwipeRight:()=>{t.dispatchEvent(new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:e}}))},onSwipeLeft:()=>{t.dispatchEvent(new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:e}}))}})),t}renderEmpty(){for(const i of this.visibleItems.values())i.remove();this.visibleItems.clear();const e=w.getState();this.contentContainer.innerHTML=`
      <div class="empty-state">
        <span class="empty-icon">⏱️</span>
        <span>${g("noEntries",e.currentLang)}</span>
        <span class="empty-subtitle">${g("noEntriesHint",e.currentLang)}</span>
      </div>
    `}pause(){this.isPaused=!0}resume(){this.isPaused=!1,this.needsRefreshOnResume&&(this.needsRefreshOnResume=!1,this.render())}scrollToTop(){this.scrollContainer.scrollTo({top:0,behavior:"smooth"})}scrollToEntry(e){const i=String(e),t=this.groups.find(n=>n.entries.some(l=>l.id===i));if(!t)return;let s=0;for(const n of this.groups){if(n.id===t.id)break;s+=this.getGroupHeight(n)}t.isMultiItem&&(this.expandedGroups.add(t.id),this.isPaused?this.needsRefreshOnResume=!0:this.render()),this.isPaused||this.scrollContainer.scrollTo({top:s,behavior:"smooth"})}getVisibleCount(){return this.groups.reduce((e,i)=>e+i.entries.length,0)}getSortedFocusableItems(){const e=Array.from(this.visibleItems.values());return e.sort((i,t)=>{const s=this.getItemYPosition(i),n=this.getItemYPosition(t);return s-n}),e}focusNextItem(e){const i=this.getSortedFocusableItems(),t=i.indexOf(e);t>=0&&t<i.length-1&&i[t+1].focus()}focusPreviousItem(e){const i=this.getSortedFocusableItems(),t=i.indexOf(e);t>0&&i[t-1].focus()}getItemYPosition(e){const t=e.style.transform.match(/translateY\((\d+)px\)/);return t?parseInt(t[1],10):0}cleanupItemListeners(e,i){const t=this.swipeActions.get(e);t&&(t.destroy(),this.swipeActions.delete(e));const s=this.itemListeners.get(e);s&&(s.click&&i.removeEventListener("click",s.click),s.keydown&&i.removeEventListener("keydown",s.keydown),s.editBtn&&s.editClick&&s.editBtn.removeEventListener("click",s.editClick),s.deleteBtn&&s.deleteClick&&s.deleteBtn.removeEventListener("click",s.deleteClick),s.photoBtn&&s.photoClick&&s.photoBtn.removeEventListener("click",s.photoClick),this.itemListeners.delete(e))}destroy(){if(!this.isDestroyed){this.isDestroyed=!0,this.domRemovalObserver&&(this.domRemovalObserver.disconnect(),this.domRemovalObserver=null),this.scrollHandler&&(this.scrollContainer.removeEventListener("scroll",this.scrollHandler),this.scrollHandler=null),this.scrollDebounceTimeout!==null&&(clearTimeout(this.scrollDebounceTimeout),this.scrollDebounceTimeout=null),this.resizeDebounceTimeout!==null&&(clearTimeout(this.resizeDebounceTimeout),this.resizeDebounceTimeout=null),this.resizeObserver&&(this.resizeObserver.disconnect(),this.resizeObserver=null),this.unsubscribe&&(this.unsubscribe(),this.unsubscribe=null),this.unsubscribeBattery&&(this.unsubscribeBattery(),this.unsubscribeBattery=null);for(const[e,i]of this.visibleItems)this.cleanupItemListeners(e,i);this.visibleItems.clear(),this.itemListeners.clear(),this.swipeActions.clear(),this.scrollContainer.remove()}}}let V=null,B=null;async function Ne(d){const e=document.getElementById("photo-viewer-modal");if(!e||!d.photo)return;V=d.id;const i=document.getElementById("photo-viewer-image"),t=document.getElementById("photo-viewer-bib"),s=document.getElementById("photo-viewer-point"),n=document.getElementById("photo-viewer-time"),c=w.getState().currentLang;if(B&&(URL.revokeObjectURL(B),B=null),i){const o=U(d.point,c);if(i.alt=`${g("photoForBib",c)} ${d.bib||"---"} - ${o}`,xe(d.photo)){i.src="";const a=await ue.getPhoto(d.id);if(a){const r=atob(a),b=new Uint8Array(r.length);for(let u=0;u<r.length;u++)b[u]=r.charCodeAt(u);const h=new Blob([b],{type:"image/jpeg"});B=URL.createObjectURL(h),i.src=B}else{W.warn("Photo not found in IndexedDB for entry:",d.id);return}}else i.src=`data:image/jpeg;base64,${d.photo}`}if(t&&(t.textContent=d.bib||"---"),s){s.textContent=U(d.point,c);const o=ee(d.point);s.style.background=o,s.style.color="var(--background)"}if(n){const o=new Date(d.timestamp);n.textContent=X(o)}Te(e)}function qe(){B&&(URL.revokeObjectURL(B),B=null);const d=document.getElementById("photo-viewer-modal");Be(d),V=null}async function Ke(){if(!V)return;const d=w.getState(),e=V;await ue.deletePhoto(e),w.updateEntry(e,{photo:void 0}),qe(),F(g("photoDeleted",d.currentLang),"success"),Ce()}let S=null,G=null,T=null;const $=new Le;function Ge(d){window.dispatchEvent(new CustomEvent("open-edit-modal",{detail:{entry:d}}))}function Ue(d){window.dispatchEvent(new CustomEvent("prompt-delete",{detail:{entry:d}}))}function Z(d){window.dispatchEvent(new CustomEvent("open-confirm-modal",{detail:{action:d}}))}function Ze(){return S}function Qe(){$.removeAll(),T&&(clearTimeout(T),T=null);const d=x("results-list");if(!d)return;S=new ze({container:d,onItemClick:l=>Ge(l),onItemDelete:l=>Ue(l),onItemSelect:l=>{w.toggleEntrySelection(l.id)},onViewPhoto:l=>Ne(l)}),$.add(d,"fault-edit-request",(l=>{var o;const c=(o=l.detail)==null?void 0:o.fault;c&&Re(c)})),$.add(d,"fault-delete-request",(l=>{var o;const c=(o=l.detail)==null?void 0:o.fault;c&&Ae(c)}));const e=w.getState();S.setEntries(e.entries),me();const i=document.querySelector(".results-view");i&&(G=new Ie({container:i,onRefresh:async()=>{await he.forceRefresh(),F(g("syncReceived",w.getState().currentLang),"success")}}));const t=x("search-input");t&&$.add(t,"input",()=>{T&&clearTimeout(T),T=setTimeout(()=>{Q()},300)});const s=x("filter-point"),n=x("filter-status");s&&$.add(s,"change",Q),n&&$.add(n,"change",Q),Fe(),e.currentView!=="results"&&S&&S.pause()}function Fe(){const d=x("clear-all-btn");d&&$.add(d,"click",()=>{const s=w.getState();if(s.entries.length===0){F(g("noEntries",s.currentLang),"info");return}Z("clearAll")});const e=x("undo-btn");e&&$.add(e,"click",()=>{if(w.canUndo()){const s=w.peekUndo();if(s&&s.type==="ADD_ENTRY")Z("undoAdd");else{const n=w.undo();De(),F(g("undone",w.getState().currentLang),"success");const l=w.getState();if(n&&n.type==="ADD_ENTRY"&&l.settings.sync&&l.raceId){const c=n.data;he.deleteEntryFromCloud(c.id,c.deviceId)}}}});const i=x("export-btn");i&&$.add(i,"click",$e);const t=x("delete-selected-btn");t&&$.add(t,"click",()=>{w.getState().selectedEntries.size>0&&Z("deleteSelected")})}function Q(){if(!S)return;const d=x("search-input"),e=x("filter-point"),i=x("filter-status");S.applyFilters((d==null?void 0:d.value)||"",(e==null?void 0:e.value)||"all",(i==null?void 0:i.value)||"all"),me()}function me(){const e=w.getState().entries,i=e.length,t=new Set(e.map(h=>h.bib)).size,s=new Set(e.filter(h=>h.point==="F"&&h.status==="ok").map(h=>h.bib)).size,n=new Map;for(const h of e){const u=`${h.bib}-${h.point}-${h.run??1}`;n.has(u)||n.set(u,new Set),n.get(u).add(h.deviceId)}let l=0;for(const h of n.values())h.size>1&&l++;const c=x("stat-total"),o=x("stat-racers"),a=x("stat-finished"),r=x("stat-duplicates"),b=x("stat-duplicates-item");c&&(c.textContent=String(i)),o&&(o.textContent=String(t)),a&&(a.textContent=String(s)),r&&(r.textContent=String(l)),b&&(b.style.display=l>0?"":"none")}function We(){const d=x("entry-count-badge");if(d){const e=w.getState().entries.length;d.textContent=String(e),d.style.display=e>0?"inline":"none"}}function Ve(){T&&(clearTimeout(T),T=null),$.removeAll(),G&&(G.destroy(),G=null),S&&(S.destroy(),S=null)}function Xe(){Ve()}export{We as a,Xe as b,qe as c,Ke as d,Ze as g,Qe as i,me as u};
