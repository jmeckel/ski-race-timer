var ge=Object.defineProperty;var we=(d,e,i)=>e in d?ge(d,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):d[e]=i;var b=(d,e,i)=>we(d,typeof e!="symbol"?e+"":e,i);import{u as X,w as ye,s as g,x as j,y as J,z as K,t as v,A as ke,e as $,B as le,C as ae,l as ee,D as te,E as V,F as ce,G as W,H as xe,I as N,J as Ee,K as q,M as G,S as U,b as de,N as ue,O as P,$ as Ce,P as Le,Q as Ie,R as De,T as he,a as Y,U as $e,L as Se,p as k,V as Te,q as me,W as fe,X as Be}from"./chief-judge-uEHOwmjD.js";import{m as Re}from"./vendor-signals-BA-R9xnX.js";import{o as Ae,c as Me,a as Pe,b as He}from"./gate-judge-g1xWkyV9.js";const H=78,O=64,z=72,pe=5,be=16,Oe=33,ze=50,Ne=100;function qe(d){switch(d){case"critical":return ze;case"low":return Oe;default:return be}}class Ge{constructor(e){b(this,"container");b(this,"scrollContainer");b(this,"contentContainer");b(this,"entries",[]);b(this,"groups",[]);b(this,"expandedGroups",new Set);b(this,"visibleItems",new Map);b(this,"itemListeners",new Map);b(this,"swipeActions",new Map);b(this,"scrollTop",0);b(this,"containerHeight",0);b(this,"options");b(this,"unsubscribe",null);b(this,"resizeObserver",null);b(this,"scrollHandler",null);b(this,"scrollDebounceTimeout",null);b(this,"resizeDebounceTimeout",null);b(this,"isPaused",!1);b(this,"needsRefreshOnResume",!1);b(this,"isDestroyed",!1);b(this,"domRemovalObserver",null);b(this,"scrollDebounceDelay",be);b(this,"unsubscribeBattery",null);this.options=e,this.container=e.container,this.scrollContainer=document.createElement("div"),this.scrollContainer.className="virtual-scroll-container",this.scrollContainer.style.cssText=`
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
    `,this.contentContainer=document.createElement("div"),this.contentContainer.className="virtual-scroll-content",this.contentContainer.style.position="relative",this.scrollContainer.appendChild(this.contentContainer),this.container.appendChild(this.scrollContainer),this.scrollHandler=()=>{this.scrollDebounceTimeout!==null&&clearTimeout(this.scrollDebounceTimeout),this.scrollDebounceTimeout=setTimeout(()=>{this.scrollDebounceTimeout=null;try{this.onScroll()}catch(t){X.error("VirtualList scroll error:",t)}},this.scrollDebounceDelay)},this.scrollContainer.addEventListener("scroll",this.scrollHandler,{passive:!0}),this.unsubscribeBattery=ye.subscribe(t=>{this.scrollDebounceDelay=qe(t.batteryLevel)}),this.resizeObserver=new ResizeObserver(()=>{this.resizeDebounceTimeout!==null&&clearTimeout(this.resizeDebounceTimeout),this.resizeDebounceTimeout=setTimeout(()=>{this.resizeDebounceTimeout=null;try{this.containerHeight=this.scrollContainer.clientHeight,this.isPaused?this.needsRefreshOnResume=!0:this.render()}catch(t){X.error("VirtualList resize error:",t)}},Ne)}),this.resizeObserver.observe(this.scrollContainer),this.unsubscribe=Re(()=>{const t=Ce.value;Le.value,Ie.value,this.setEntries(t)}),this.domRemovalObserver=new MutationObserver(t=>{var s;for(const n of t)for(const a of n.removedNodes)if(a===this.container||(s=a.contains)!=null&&s.call(a,this.container)){this.destroy();return}});const i=this.container.parentElement||document.body;this.domRemovalObserver.observe(i,{childList:!0,subtree:!0}),this.containerHeight=this.scrollContainer.clientHeight}setEntries(e){this.entries=e,this.applyFilters()}applyFilters(e,i,t){var c;this.scrollDebounceTimeout!==null&&(clearTimeout(this.scrollDebounceTimeout),this.scrollDebounceTimeout=null);const s=g.getState();let n=[...this.entries];if(e){const r=e.toLowerCase();n=n.filter(l=>{var o;return l.bib.toLowerCase().includes(r)||((o=l.deviceName)==null?void 0:o.toLowerCase().includes(r))})}i&&i!=="all"&&(n=n.filter(r=>r.point===i)),t&&t!=="all"&&(n=n.filter(r=>r.status===t));const a=new Map;for(const r of n){const l=r.run??1,o=`${r.bib}-${l}`;a.has(o)||a.set(o,{id:o,bib:r.bib,run:l,entries:[],faults:[],isMultiItem:!1,latestTimestamp:r.timestamp,crossDeviceDuplicateCount:0});const h=a.get(o);h.entries.push(r),new Date(r.timestamp)>new Date(h.latestTimestamp)&&(h.latestTimestamp=r.timestamp)}for(const r of s.faultEntries){const l=`${r.bib}-${r.run}`;if(e){const h=e.toLowerCase();if(!r.bib.toLowerCase().includes(h)&&!((c=r.deviceName)!=null&&c.toLowerCase().includes(h)))continue}if(i&&i!=="all"||t&&t!=="all"&&t!=="dsq"&&t!=="flt")continue;a.has(l)||a.set(l,{id:l,bib:r.bib,run:r.run,entries:[],faults:[],isMultiItem:!1,latestTimestamp:r.timestamp,crossDeviceDuplicateCount:0});const o=a.get(l);o.faults.push(r),new Date(r.timestamp)>new Date(o.latestTimestamp)&&(o.latestTimestamp=r.timestamp)}for(const r of a.values()){const l=r.entries.length+r.faults.length;r.isMultiItem=l>1;const o=new Map;for(const p of r.entries){const u=p.point;o.has(u)||o.set(u,new Set),o.get(u).add(p.deviceId)}let h=0;for(const p of o.values())p.size>1&&h++;r.crossDeviceDuplicateCount=h}this.groups=Array.from(a.values()).sort((r,l)=>{const o=parseInt(r.bib,10)||0;return(parseInt(l.bib,10)||0)-o});for(const[r,l]of this.visibleItems)this.cleanupItemListeners(r,l),l.remove();this.visibleItems.clear(),this.updateContentHeight(),this.isPaused?this.needsRefreshOnResume=!0:this.render()}toggleGroup(e){this.expandedGroups.has(e)?this.expandedGroups.delete(e):this.expandedGroups.add(e);const i=this.groups.find(t=>t.id===e);if(i){const t=new Set;t.add(`header-${e}`),i.isMultiItem||t.add(`single-${e}`);for(const s of i.entries)t.add(`sub-entry-${s.id}`);for(const s of i.faults)t.add(`sub-fault-${s.id}`);for(const s of t){const n=this.visibleItems.get(s);n&&(this.cleanupItemListeners(s,n),n.remove(),this.visibleItems.delete(s))}}this.updateContentHeight(),this.isPaused?this.needsRefreshOnResume=!0:this.render()}updateContentHeight(){let e=0;for(const i of this.groups)if(!i.isMultiItem)e+=H;else if(this.expandedGroups.has(i.id)){const t=i.entries.length+i.faults.length;e+=z+t*O}else e+=z;this.contentContainer.style.height=`${e}px`}getGroupHeight(e){if(!e.isMultiItem)return H;if(this.expandedGroups.has(e.id)){const i=e.entries.length+e.faults.length;return z+i*O}return z}onScroll(){this.scrollTop=this.scrollContainer.scrollTop,this.isPaused?this.needsRefreshOnResume=!0:this.render()}render(){if(this.groups.length===0){this.renderEmpty();return}const e=this.contentContainer.querySelector(".empty-state");e&&e.remove();const i=new Set,t=this.scrollTop,s=this.scrollTop+this.containerHeight;let n=0;for(let a=0;a<this.groups.length;a++){const c=this.groups[a],r=this.getGroupHeight(c);n+r>=t-pe*H&&n<=s+pe*H&&(c.isMultiItem?this.expandedGroups.has(c.id)?this.renderExpandedGroup(c,n,i):this.renderCollapsedGroup(c,n,i):this.renderSingleItem(c,n,i)),n+=r}for(const[a,c]of this.visibleItems)i.has(a)||(this.cleanupItemListeners(a,c),c.remove(),this.visibleItems.delete(a))}renderSingleItem(e,i,t){const s=`single-${e.id}`;t.add(s);let n=this.visibleItems.get(s);if(!n){if(e.entries.length>0)n=this.createEntryItem(e.entries[0],e.faults,s,e.crossDeviceDuplicateCount);else if(e.faults.length>0)n=this.createFaultOnlyItem(e,s);else return;this.visibleItems.set(s,n),this.contentContainer.appendChild(n)}n.style.transform=`translateY(${i}px)`}renderCollapsedGroup(e,i,t){const s=`header-${e.id}`;t.add(s);let n=this.visibleItems.get(s);n||(n=this.createGroupHeader(e,!1),this.visibleItems.set(s,n),this.contentContainer.appendChild(n)),n.style.transform=`translateY(${i}px)`}renderExpandedGroup(e,i,t){const s=`header-${e.id}`;t.add(s);let n=this.visibleItems.get(s);n||(n=this.createGroupHeader(e,!0),this.visibleItems.set(s,n),this.contentContainer.appendChild(n)),n.style.transform=`translateY(${i}px)`;let a=i+z;for(let c=0;c<e.entries.length;c++){const r=e.entries[c],l=`sub-entry-${r.id}`;t.add(l);let o=this.visibleItems.get(l);o||(o=this.createSubEntryItem(r,l),this.visibleItems.set(l,o),this.contentContainer.appendChild(o)),o.style.transform=`translateY(${a}px)`,a+=O}for(let c=0;c<e.faults.length;c++){const r=e.faults[c],l=`sub-fault-${r.id}`;t.add(l);let o=this.visibleItems.get(l);o||(o=this.createSubFaultItem(r,l),this.visibleItems.set(l,o),this.contentContainer.appendChild(o)),o.style.transform=`translateY(${a}px)`,a+=O}}createGroupHeader(e,i){const t=document.createElement("div");t.className=`result-group-header ${i?"expanded":""}`,t.setAttribute("data-group-id",e.id),t.setAttribute("role","button"),t.setAttribute("tabindex","0"),t.setAttribute("aria-expanded",String(i)),t.style.cssText=`
      position: absolute;
      left: 0;
      right: 0;
      height: ${z}px;
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 12px;
      background: var(--surface);
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      cursor: pointer;
      transition: background 0.2s;
    `;const s=j(e.bib||"---"),a=g.getState().currentLang,c=J(e.run),r=K(e.run,a),l=e.entries.length,o=e.faults.length,h=o>0,p=[];l>0&&p.push(`${l} ${v(l===1?"timeEntry":"timeEntries",a)}`),o>0&&p.push(`${o} ${v(o===1?"faultEntry":"faultEntries",a)}`);const u=p.join(", ");t.innerHTML=`
      ${ke(16,i)}
      <div class="result-bib" style="font-family: var(--font-mono); font-size: 1.4rem; font-weight: 700; min-width: 64px; text-align: center; color: var(--text-primary); letter-spacing: 0.02em;">
        ${$(s)}
      </div>
      <div class="result-info" style="flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; padding-inline-start: 4px;">
        <div class="result-summary" style="font-size: 0.875rem; color: var(--text-secondary);">
          ${$(u)}
        </div>
      </div>
      ${e.crossDeviceDuplicateCount>0?le(a):""}
      ${h?`<span class="result-fault-badge" style="padding: 2px 6px; border-radius: var(--radius); font-size: 0.7rem; font-weight: 600; background: var(--warning); color: #000;">
          ${o}× ${v("flt",a)}
        </span>`:""}
      ${ae(r,c)}
    `;const m=`header-${e.id}`,w={};return w.click=()=>{this.toggleGroup(e.id)},t.addEventListener("click",w.click),w.keydown=(y=>{switch(y.key){case"Enter":case" ":y.preventDefault(),this.toggleGroup(e.id);break;case"ArrowDown":y.preventDefault(),this.focusNextItem(t);break;case"ArrowUp":y.preventDefault(),this.focusPreviousItem(t);break}}),t.addEventListener("keydown",w.keydown),this.itemListeners.set(m,w),t}createEntryItem(e,i,t,s=0){const n=document.createElement("div");n.className="result-item",n.setAttribute("role","listitem"),n.setAttribute("tabindex","0"),n.setAttribute("data-entry-id",e.id),n.style.cssText=`
      position: absolute;
      left: 0;
      right: 0;
      height: ${H}px;
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr) auto;
      align-items: center;
      padding: 0 16px;
      column-gap: 20px;
      background: var(--surface);
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      cursor: pointer;
      transition: background 0.2s;
    `;const a=new Date(e.timestamp),c=ee(a),r=j(e.bib||"---"),o=g.getState().currentLang,h=te(e.point),p=V(e.point,o),u=e.run??1,m=K(u,o),w=i.length>0?ce({faults:i,lang:o}):"",y=s>0?le(o):"",T=`${String(a.getDate()).padStart(2,"0")}.${String(a.getMonth()+1).padStart(2,"0")}.${a.getFullYear()}`,A=e.deviceName?`${$(e.deviceName)}  ·  ${T}`:T;n.innerHTML=`
      <div class="result-bib" style="font-family: var(--font-mono); font-size: 1.4rem; font-weight: 700; min-width: 64px; text-align: center; color: var(--text-primary); letter-spacing: 0.02em;">
        ${$(r)}
      </div>
      <div class="result-info" style="display: flex; flex-direction: column; gap: 2px; min-width: 0; padding-inline-start: 2px;">
        <div class="result-time" style="font-family: var(--font-mono); color: var(--text-primary); font-size: 1rem; font-weight: 600; letter-spacing: 0.03em;">
          ${$(c)}
        </div>
        <div class="result-device" style="font-size: 0.68rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); letter-spacing: 0.04em;">
          ${A}
        </div>
      </div>
      <div class="result-tags" style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: max-content;">
        ${y}
        ${w}
        ${e.status!=="ok"?W(v(e.status,o)):""}
        ${e.photo?xe(v("viewPhotoLabel",o)):""}
        ${N(p,h)}
        ${Ee(m,J(u))}
        ${q({ariaLabel:v("editEntryLabel",o)})}
        ${G({ariaLabel:v("deleteEntryLabel",o)})}
      </div>
    `;const E={},x=n.querySelector(".result-edit-btn");E.editBtn=x,E.editClick=(L=>{var f,I;L.stopPropagation(),(I=(f=this.options).onItemClick)==null||I.call(f,e,L)}),x.addEventListener("click",E.editClick);const C=n.querySelector(".result-delete");E.deleteBtn=C,E.deleteClick=(L=>{var f,I;L.stopPropagation(),(I=(f=this.options).onItemDelete)==null||I.call(f,e)}),C.addEventListener("click",E.deleteClick);const B=n.querySelector(".result-photo-btn");return B&&(E.photoBtn=B,E.photoClick=(L=>{var f,I;L.stopPropagation(),(I=(f=this.options).onViewPhoto)==null||I.call(f,e)}),B.addEventListener("click",E.photoClick)),E.click=(L=>{var f,I;(I=(f=this.options).onItemClick)==null||I.call(f,e,L)}),n.addEventListener("click",E.click),E.keydown=(L=>{var I,se,ie,ne,oe,re;const f=L;switch(f.key){case"Enter":case" ":f.preventDefault(),(se=(I=this.options).onItemClick)==null||se.call(I,e,new MouseEvent("click"));break;case"e":case"E":f.preventDefault(),(ne=(ie=this.options).onItemClick)==null||ne.call(ie,e,new MouseEvent("click"));break;case"Delete":case"d":case"D":f.preventDefault(),(re=(oe=this.options).onItemDelete)==null||re.call(oe,e);break;case"ArrowDown":f.preventDefault(),this.focusNextItem(n);break;case"ArrowUp":f.preventDefault(),this.focusPreviousItem(n);break}}),n.addEventListener("keydown",E.keydown),this.itemListeners.set(t,E),this.swipeActions.set(t,new U({element:n,onSwipeRight:()=>{var L,f;return(f=(L=this.options).onItemClick)==null?void 0:f.call(L,e,new MouseEvent("click"))},onSwipeLeft:()=>{var L,f;return(f=(L=this.options).onItemDelete)==null?void 0:f.call(L,e)}})),n}createFaultOnlyItem(e,i){var E;const t=document.createElement("div"),s=e.faults,n=s.some(x=>x.markedForDeletion);t.className=`result-item fault-only-item${n?" marked-for-deletion":""}`,t.setAttribute("role","listitem"),t.setAttribute("tabindex","0"),t.setAttribute("data-fault-id",e.id),t.style.cssText=`
      position: absolute;
      left: 0;
      right: 0;
      height: ${H}px;
      display: flex;
      align-items: center;
      padding: 0 8px 0 4px;
      gap: 8px;
      background: var(--surface);
      border-bottom: 1px solid var(--surface-elevated);
      border-left: 3px solid ${n?"var(--error)":"var(--warning)"};
      ${n?"opacity: 0.6;":""}
      cursor: pointer;
    `;const a=j(e.bib||"---"),c=g.getState(),r=c.currentLang,l=J(e.run),o=K(e.run,r),h=s.sort((x,C)=>x.gateNumber-C.gateNumber).map(x=>`T${x.gateNumber} (${de(x.faultType,r)})${x.markedForDeletion?" ⚠":""}`).join(", "),p=ce({faults:s,lang:r}),u=c.usePenaltyMode?v("flt",r):v("dsq",r),m=c.usePenaltyMode?"#f59e0b":"#ef4444",w=n?ue():"";t.innerHTML=`
      <div style="width: 16px; flex-shrink: 0;"></div>
      <div class="result-bib" style="font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 600; min-width: 44px; text-align: right; ${n?"text-decoration: line-through; opacity: 0.6;":""}">
        ${$(a)}
      </div>
      ${N(v("gate",r),"var(--warning)")}
      ${ae(o,l)}
      <div class="result-info" style="flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;">
        <div class="result-fault-details" style="font-size: 0.8rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ${n?"text-decoration: line-through; opacity: 0.6;":""}">
          ${$(h)}
        </div>
        ${(E=s[0])!=null&&E.deviceName?`
          <div class="result-device" style="font-size: 0.7rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${$(s[0].deviceName)}
          </div>
        `:""}
      </div>
      ${w}
      ${n?"":p}
      ${n?"":W(u,m)}
      ${q({ariaLabel:v("editFaultLabel",r)})}
      ${G({ariaLabel:v("deleteFaultLabel",r),className:"result-delete fault-delete-btn"})}
    `;const y={},T=t.querySelector(".result-edit-btn");T&&s.length>0&&(y.editBtn=T,y.editClick=(x=>{x.stopPropagation();const C=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:s[0]}});t.dispatchEvent(C)}),T.addEventListener("click",y.editClick));const A=t.querySelector(".fault-delete-btn");return A&&s.length>0&&(y.deleteBtn=A,y.deleteClick=(x=>{x.stopPropagation();const C=new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:s[0]}});t.dispatchEvent(C)}),A.addEventListener("click",y.deleteClick)),y.click=(x=>{const C=x.target;if(!(C.closest(".fault-delete-btn")||C.closest(".result-edit-btn"))&&s.length>0){const B=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:s[0]}});t.dispatchEvent(B)}}),t.addEventListener("click",y.click),y.keydown=(x=>{const C=x;switch(C.key){case"Enter":case" ":case"e":case"E":if(C.preventDefault(),s.length>0){const B=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:s[0]}});t.dispatchEvent(B)}break;case"Delete":case"d":case"D":if(C.preventDefault(),s.length>0){const B=new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:s[0]}});t.dispatchEvent(B)}break;case"ArrowDown":C.preventDefault(),this.focusNextItem(t);break;case"ArrowUp":C.preventDefault(),this.focusPreviousItem(t);break}}),t.addEventListener("keydown",y.keydown),this.itemListeners.set(i,y),s.length>0&&this.swipeActions.set(i,new U({element:t,onSwipeRight:()=>{t.dispatchEvent(new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:s[0]}}))},onSwipeLeft:()=>{t.dispatchEvent(new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:s[0]}}))}})),t}createSubEntryItem(e,i){const t=document.createElement("div");t.className="result-sub-item entry-sub-item",t.setAttribute("role","listitem"),t.setAttribute("tabindex","0"),t.setAttribute("data-entry-id",e.id),t.style.cssText=`
      position: absolute;
      left: 0;
      right: 0;
      height: ${O}px;
      display: flex;
      align-items: center;
      padding: 0 8px 0 24px;
      gap: 8px;
      background: var(--surface-elevated);
      border-bottom: 1px solid var(--background);
      cursor: pointer;
      transition: background 0.2s;
    `;const s=new Date(e.timestamp),n=ee(s),c=g.getState().currentLang,r=te(e.point),l=V(e.point,c);t.innerHTML=`
      <div style="width: 16px; flex-shrink: 0;"></div>
      <div style="min-width: 44px;"></div>
      ${N(l,r,"48px","0.7rem")}
      <div style="min-width: 36px;"></div>
      <div class="result-info" style="flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0;">
        <div class="result-time" style="font-family: 'JetBrains Mono', monospace; color: var(--text-secondary); font-size: 0.85rem;">
          ${$(n)}
        </div>
        ${e.deviceName?`
          <div class="result-device" style="font-size: 0.65rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${$(e.deviceName)}
          </div>
        `:""}
      </div>
      ${e.status!=="ok"?W(v(e.status,c),"var(--error)","0.65rem"):""}
      ${q({ariaLabel:v("editEntryLabel",c),size:16})}
      ${G({ariaLabel:v("deleteEntryLabel",c),size:16})}
    `;const o={},h=t.querySelector(".result-edit-btn");o.editBtn=h,o.editClick=(u=>{var m,w;u.stopPropagation(),!P.wasRecentlyExited()&&((w=(m=this.options).onItemClick)==null||w.call(m,e,u))}),h.addEventListener("click",o.editClick);const p=t.querySelector(".result-delete");return o.deleteBtn=p,o.deleteClick=(u=>{var m,w;u.stopPropagation(),!P.wasRecentlyExited()&&((w=(m=this.options).onItemDelete)==null||w.call(m,e))}),p.addEventListener("click",o.deleteClick),o.click=(u=>{var m,w;P.wasRecentlyExited()||(w=(m=this.options).onItemClick)==null||w.call(m,e,u)}),t.addEventListener("click",o.click),o.keydown=(u=>{var w,y,T,A;const m=u;if(!P.wasRecentlyExited())switch(m.key){case"Enter":case" ":case"e":case"E":m.preventDefault(),(y=(w=this.options).onItemClick)==null||y.call(w,e,new MouseEvent("click"));break;case"Delete":case"d":case"D":m.preventDefault(),(A=(T=this.options).onItemDelete)==null||A.call(T,e);break;case"ArrowDown":m.preventDefault(),this.focusNextItem(t);break;case"ArrowUp":m.preventDefault(),this.focusPreviousItem(t);break}}),t.addEventListener("keydown",o.keydown),this.itemListeners.set(i,o),this.swipeActions.set(i,new U({element:t,onSwipeRight:()=>{var u,m;P.wasRecentlyExited()||(m=(u=this.options).onItemClick)==null||m.call(u,e,new MouseEvent("click"))},onSwipeLeft:()=>{var u,m;P.wasRecentlyExited()||(m=(u=this.options).onItemDelete)==null||m.call(u,e)}})),t}createSubFaultItem(e,i){const t=document.createElement("div"),s=e.markedForDeletion;t.className=`result-sub-item fault-sub-item${s?" marked-for-deletion":""}`,t.setAttribute("role","listitem"),t.setAttribute("tabindex","0"),t.setAttribute("data-fault-id",e.id),t.style.cssText=`
      position: absolute;
      left: 0;
      right: 0;
      height: ${O}px;
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
    `;const a=g.getState().currentLang,c=g.getGateColor(e.gateNumber),r=c==="red"?"#ef4444":"#3b82f6";t.innerHTML=`
      <div style="width: 16px; flex-shrink: 0;"></div>
      <div style="min-width: 44px;"></div>
      ${N(`T${e.gateNumber}`,"var(--warning)","48px","0.7rem")}
      <div style="min-width: 36px; display: flex; align-items: center; justify-content: center;">
        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${r};" title="${c}"></div>
      </div>
      <div class="result-info" style="flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0;">
        <span style="font-size: 0.85rem; color: var(--text-secondary); ${s?"text-decoration: line-through;":""}">
          ${$(de(e.faultType,a))}
        </span>
        ${e.deviceName?`
          <span style="font-size: 0.65rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${$(e.deviceName)}
          </span>
        `:""}
      </div>
      ${s?ue("0.65rem"):""}
      ${q({ariaLabel:v("editFaultLabel",a),size:16})}
      ${G({ariaLabel:v("deleteFaultLabel",a),size:16,className:"result-delete fault-delete-btn"})}
    `;const l={},o=t.querySelector(".result-edit-btn");l.editBtn=o,l.editClick=(p=>{p.stopPropagation();const u=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(u)}),o.addEventListener("click",l.editClick);const h=t.querySelector(".fault-delete-btn");return l.deleteBtn=h,l.deleteClick=(p=>{p.stopPropagation();const u=new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(u)}),h.addEventListener("click",l.deleteClick),l.click=(()=>{const p=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(p)}),t.addEventListener("click",l.click),l.keydown=(p=>{const u=p;switch(u.key){case"Enter":case" ":case"e":case"E":u.preventDefault();{const m=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(m)}break;case"Delete":case"d":case"D":u.preventDefault();{const m=new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(m)}break;case"ArrowDown":u.preventDefault(),this.focusNextItem(t);break;case"ArrowUp":u.preventDefault(),this.focusPreviousItem(t);break}}),t.addEventListener("keydown",l.keydown),this.itemListeners.set(i,l),this.swipeActions.set(i,new U({element:t,onSwipeRight:()=>{t.dispatchEvent(new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:e}}))},onSwipeLeft:()=>{t.dispatchEvent(new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:e}}))}})),t}renderEmpty(){for(const i of this.visibleItems.values())i.remove();this.visibleItems.clear();const e=g.getState();this.contentContainer.innerHTML=`
      <div class="empty-state">
        <span class="empty-icon">⏱️</span>
        <span>${v("noEntries",e.currentLang)}</span>
        <span class="empty-subtitle">${v("noEntriesHint",e.currentLang)}</span>
      </div>
    `}pause(){this.isPaused=!0}resume(){this.isPaused=!1,this.needsRefreshOnResume&&(this.needsRefreshOnResume=!1,this.render())}scrollToTop(){this.scrollContainer.scrollTo({top:0,behavior:"smooth"})}scrollToEntry(e){const i=String(e),t=this.groups.find(n=>n.entries.some(a=>a.id===i));if(!t)return;let s=0;for(const n of this.groups){if(n.id===t.id)break;s+=this.getGroupHeight(n)}t.isMultiItem&&(this.expandedGroups.add(t.id),this.isPaused?this.needsRefreshOnResume=!0:this.render()),this.isPaused||this.scrollContainer.scrollTo({top:s,behavior:"smooth"})}getVisibleCount(){return this.groups.reduce((e,i)=>e+i.entries.length,0)}getSortedFocusableItems(){const e=Array.from(this.visibleItems.values());return e.sort((i,t)=>{const s=this.getItemYPosition(i),n=this.getItemYPosition(t);return s-n}),e}focusNextItem(e){const i=this.getSortedFocusableItems(),t=i.indexOf(e);t>=0&&t<i.length-1&&i[t+1].focus()}focusPreviousItem(e){const i=this.getSortedFocusableItems(),t=i.indexOf(e);t>0&&i[t-1].focus()}getItemYPosition(e){const t=e.style.transform.match(/translateY\((\d+)px\)/);return t?parseInt(t[1],10):0}cleanupItemListeners(e,i){const t=this.swipeActions.get(e);t&&(t.destroy(),this.swipeActions.delete(e));const s=this.itemListeners.get(e);s&&(s.click&&i.removeEventListener("click",s.click),s.keydown&&i.removeEventListener("keydown",s.keydown),s.editBtn&&s.editClick&&s.editBtn.removeEventListener("click",s.editClick),s.deleteBtn&&s.deleteClick&&s.deleteBtn.removeEventListener("click",s.deleteClick),s.photoBtn&&s.photoClick&&s.photoBtn.removeEventListener("click",s.photoClick),this.itemListeners.delete(e))}destroy(){if(!this.isDestroyed){this.isDestroyed=!0,this.domRemovalObserver&&(this.domRemovalObserver.disconnect(),this.domRemovalObserver=null),this.scrollHandler&&(this.scrollContainer.removeEventListener("scroll",this.scrollHandler),this.scrollHandler=null),this.scrollDebounceTimeout!==null&&(clearTimeout(this.scrollDebounceTimeout),this.scrollDebounceTimeout=null),this.resizeDebounceTimeout!==null&&(clearTimeout(this.resizeDebounceTimeout),this.resizeDebounceTimeout=null),this.resizeObserver&&(this.resizeObserver.disconnect(),this.resizeObserver=null),this.unsubscribe&&(this.unsubscribe(),this.unsubscribe=null),this.unsubscribeBattery&&(this.unsubscribeBattery(),this.unsubscribeBattery=null);for(const[e,i]of this.visibleItems)this.cleanupItemListeners(e,i);this.visibleItems.clear(),this.itemListeners.clear(),this.swipeActions.clear(),this.scrollContainer.remove()}}}let _=null,M=null;async function Ue(d){const e=document.getElementById("photo-viewer-modal");if(!e||!d.photo)return;_=d.id;const i=document.getElementById("photo-viewer-image"),t=document.getElementById("photo-viewer-bib"),s=document.getElementById("photo-viewer-point"),n=document.getElementById("photo-viewer-time"),c=g.getState().currentLang;if(M&&(URL.revokeObjectURL(M),M=null),i){const r=V(d.point,c);if(i.alt=`${v("photoForBib",c)} ${d.bib||"---"} - ${r}`,De(d.photo)){i.src="";const l=await he.getPhoto(d.id);if(l){const o=atob(l),h=new Uint8Array(o.length);for(let u=0;u<o.length;u++)h[u]=o.charCodeAt(u);const p=new Blob([h],{type:"image/jpeg"});M=URL.createObjectURL(p),i.src=M}else{X.warn("Photo not found in IndexedDB for entry:",d.id);return}}else i.src=`data:image/jpeg;base64,${d.photo}`}if(t&&(t.textContent=d.bib||"---"),s){s.textContent=V(d.point,c);const r=te(d.point);s.style.background=r,s.style.color="var(--background)"}if(n){const r=new Date(d.timestamp);n.textContent=ee(r)}Ae(e)}function Fe(){M&&(URL.revokeObjectURL(M),M=null);const d=document.getElementById("photo-viewer-modal");Me(d),_=null}async function Qe(){if(!_)return;const d=g.getState(),e=_;await he.deletePhoto(e),g.updateEntry(e,{photo:void 0}),Fe(),Y(v("photoDeleted",d.currentLang),"success"),$e()}let S=null,F=null,R=null;const D=new Se;function Ve(d){window.dispatchEvent(new CustomEvent("open-edit-modal",{detail:{entry:d}}))}function Ye(d){window.dispatchEvent(new CustomEvent("prompt-delete",{detail:{entry:d}}))}function Z(d){window.dispatchEvent(new CustomEvent("open-confirm-modal",{detail:{action:d}}))}function Xe(){return S}function et(){D.removeAll(),R&&(clearTimeout(R),R=null);const d=k("results-list");if(!d)return;S=new Ge({container:d,onItemClick:l=>Ve(l),onItemDelete:l=>Ye(l),onItemSelect:l=>{g.toggleEntrySelection(l.id)},onViewPhoto:l=>Ue(l)}),D.add(d,"fault-edit-request",(l=>{var h;const o=(h=l.detail)==null?void 0:h.fault;o&&Pe(o)})),D.add(d,"fault-delete-request",(l=>{var h;const o=(h=l.detail)==null?void 0:h.fault;o&&He(o)}));const e=g.getState();S.setEntries(e.entries),ve();const i=document.querySelector(".results-view");i&&(F=new Te({container:i,onRefresh:async()=>{await me.forceRefresh(),Y(v("syncReceived",g.getState().currentLang),"success")}}));const t=k("search-input");t&&D.add(t,"input",()=>{R&&clearTimeout(R),R=setTimeout(()=>{Q()},300)});const s=k("filter-point"),n=k("filter-status");s&&D.add(s,"change",Q),n&&D.add(n,"change",Q);const a=k("toggle-filters-btn"),c=document.querySelector(".search-filter-bar");a&&c&&D.add(a,"click",()=>{const l=c.classList.toggle("visible");a.setAttribute("aria-expanded",String(l)),a.classList.toggle("active",l)});const r=k("quick-export-btn");r&&D.add(r,"click",()=>{fe()}),_e(),e.currentView!=="results"&&S&&S.pause()}function _e(){const d=k("clear-all-btn");d&&D.add(d,"click",()=>{const s=g.getState();if(s.entries.length===0){Y(v("noEntries",s.currentLang),"info");return}Z("clearAll")});const e=k("undo-btn");e&&D.add(e,"click",()=>{if(g.canUndo()){const s=g.peekUndo();if(s&&s.type==="ADD_ENTRY")Z("undoAdd");else{const n=g.undo();Be(),Y(v("undone",g.getState().currentLang),"success");const a=g.getState();if(n&&n.type==="ADD_ENTRY"&&a.settings.sync&&a.raceId){const c=n.data;me.deleteEntryFromCloud(c.id,c.deviceId)}}}});const i=k("export-btn");i&&D.add(i,"click",fe);const t=k("delete-selected-btn");t&&D.add(t,"click",()=>{g.getState().selectedEntries.size>0&&Z("deleteSelected")})}function Q(){if(!S)return;const d=k("search-input"),e=k("filter-point"),i=k("filter-status");S.applyFilters((d==null?void 0:d.value)||"",(e==null?void 0:e.value)||"all",(i==null?void 0:i.value)||"all"),ve()}function ve(){const e=g.getState().entries,i=e.length,t=new Set(e.map(p=>p.bib)).size,s=new Set(e.filter(p=>p.point==="F"&&p.status==="ok").map(p=>p.bib)).size,n=new Map;for(const p of e){const u=`${p.bib}-${p.point}-${p.run??1}`;n.has(u)||n.set(u,new Set),n.get(u).add(p.deviceId)}let a=0;for(const p of n.values())p.size>1&&a++;const c=k("stat-total"),r=k("stat-racers"),l=k("stat-finished"),o=k("stat-duplicates"),h=k("stat-duplicates-item");c&&(c.textContent=String(i)),r&&(r.textContent=String(t)),l&&(l.textContent=String(s)),o&&(o.textContent=String(a)),h&&(h.style.display=a>0?"":"none")}function tt(){const d=k("entry-count-badge");if(d){const e=g.getState().entries.length;d.textContent=String(e),d.style.display=e>0?"inline":"none"}}function je(){R&&(clearTimeout(R),R=null),D.removeAll(),F&&(F.destroy(),F=null),S&&(S.destroy(),S=null)}function st(){je()}export{tt as a,st as b,Fe as c,Qe as d,Xe as g,et as i,ve as u};
