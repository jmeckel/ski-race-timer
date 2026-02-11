var pe=Object.defineProperty;var me=(d,e,s)=>e in d?pe(d,e,{enumerable:!0,configurable:!0,writable:!0,value:s}):d[e]=s;var w=(d,e,s)=>me(d,typeof e!="symbol"?e+"":e,s);import{r as Q,u as fe,s as g,w as U,x as Y,y as _,t as v,z as be,e as L,A as V,B as ne,k as W,C as K,D as G,E as oe,F as A,G as J,H as ve,I as z,J as O,g as re,K as ae,M as ge,N as ce,a as q,O as we,L as ye,o as E,P as ke,p as de,Q as xe,R as Ee}from"./chief-judge-DtBsPpo-.js";import{o as Ce,c as Ie,a as Le,b as De}from"./gate-judge-BoK1XIvH.js";const P=72,M=56,R=72,le=5,ue=16,$e=33,Te=50,Se=100;function Be(d){switch(d){case"critical":return Te;case"low":return $e;default:return ue}}class Pe{constructor(e){w(this,"container");w(this,"scrollContainer");w(this,"contentContainer");w(this,"entries",[]);w(this,"groups",[]);w(this,"expandedGroups",new Set);w(this,"visibleItems",new Map);w(this,"itemListeners",new Map);w(this,"scrollTop",0);w(this,"containerHeight",0);w(this,"options");w(this,"unsubscribe",null);w(this,"resizeObserver",null);w(this,"scrollHandler",null);w(this,"scrollDebounceTimeout",null);w(this,"resizeDebounceTimeout",null);w(this,"isPaused",!1);w(this,"needsRefreshOnResume",!1);w(this,"isDestroyed",!1);w(this,"domRemovalObserver",null);w(this,"scrollDebounceDelay",ue);w(this,"unsubscribeBattery",null);this.options=e,this.container=e.container,this.scrollContainer=document.createElement("div"),this.scrollContainer.className="virtual-scroll-container",this.scrollContainer.style.cssText=`
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
    `,this.contentContainer=document.createElement("div"),this.contentContainer.className="virtual-scroll-content",this.contentContainer.style.position="relative",this.scrollContainer.appendChild(this.contentContainer),this.container.appendChild(this.scrollContainer),this.scrollHandler=()=>{this.scrollDebounceTimeout!==null&&clearTimeout(this.scrollDebounceTimeout),this.scrollDebounceTimeout=setTimeout(()=>{this.scrollDebounceTimeout=null;try{this.onScroll()}catch(t){Q.error("VirtualList scroll error:",t)}},this.scrollDebounceDelay)},this.scrollContainer.addEventListener("scroll",this.scrollHandler,{passive:!0}),this.unsubscribeBattery=fe.subscribe(t=>{this.scrollDebounceDelay=Be(t.batteryLevel)}),this.resizeObserver=new ResizeObserver(()=>{this.resizeDebounceTimeout!==null&&clearTimeout(this.resizeDebounceTimeout),this.resizeDebounceTimeout=setTimeout(()=>{this.resizeDebounceTimeout=null;try{this.containerHeight=this.scrollContainer.clientHeight,this.isPaused?this.needsRefreshOnResume=!0:this.render()}catch(t){Q.error("VirtualList resize error:",t)}},Se)}),this.resizeObserver.observe(this.scrollContainer),this.unsubscribe=g.subscribe((t,o)=>{(o.includes("entries")||o.includes("selectedEntries")||o.includes("faultEntries"))&&this.setEntries(t.entries)}),this.domRemovalObserver=new MutationObserver(t=>{var o;for(const i of t)for(const a of i.removedNodes)if(a===this.container||(o=a.contains)!=null&&o.call(a,this.container)){this.destroy();return}});const s=this.container.parentElement||document.body;this.domRemovalObserver.observe(s,{childList:!0,subtree:!0}),this.containerHeight=this.scrollContainer.clientHeight}setEntries(e){this.entries=e,this.applyFilters()}applyFilters(e,s,t){var c;this.scrollDebounceTimeout!==null&&(clearTimeout(this.scrollDebounceTimeout),this.scrollDebounceTimeout=null);const o=g.getState();let i=[...this.entries];if(e){const n=e.toLowerCase();i=i.filter(l=>{var r;return l.bib.toLowerCase().includes(n)||((r=l.deviceName)==null?void 0:r.toLowerCase().includes(n))})}s&&s!=="all"&&(i=i.filter(n=>n.point===s)),t&&t!=="all"&&(i=i.filter(n=>n.status===t));const a=new Map;for(const n of i){const l=n.run??1,r=`${n.bib}-${l}`;a.has(r)||a.set(r,{id:r,bib:n.bib,run:l,entries:[],faults:[],isMultiItem:!1,latestTimestamp:n.timestamp,crossDeviceDuplicateCount:0});const p=a.get(r);p.entries.push(n),new Date(n.timestamp)>new Date(p.latestTimestamp)&&(p.latestTimestamp=n.timestamp)}for(const n of o.faultEntries){const l=`${n.bib}-${n.run}`;if(e){const p=e.toLowerCase();if(!n.bib.toLowerCase().includes(p)&&!((c=n.deviceName)!=null&&c.toLowerCase().includes(p)))continue}if(s&&s!=="all"||t&&t!=="all"&&t!=="dsq"&&t!=="flt")continue;a.has(l)||a.set(l,{id:l,bib:n.bib,run:n.run,entries:[],faults:[],isMultiItem:!1,latestTimestamp:n.timestamp,crossDeviceDuplicateCount:0});const r=a.get(l);r.faults.push(n),new Date(n.timestamp)>new Date(r.latestTimestamp)&&(r.latestTimestamp=n.timestamp)}for(const n of a.values()){const l=n.entries.length+n.faults.length;n.isMultiItem=l>1;const r=new Map;for(const u of n.entries){const h=u.point;r.has(h)||r.set(h,new Set),r.get(h).add(u.deviceId)}let p=0;for(const u of r.values())u.size>1&&p++;n.crossDeviceDuplicateCount=p}this.groups=Array.from(a.values()).sort((n,l)=>{const r=parseInt(n.bib,10)||0;return(parseInt(l.bib,10)||0)-r});for(const[n,l]of this.visibleItems)this.cleanupItemListeners(n,l),l.remove();this.visibleItems.clear(),this.updateContentHeight(),this.isPaused?this.needsRefreshOnResume=!0:this.render()}toggleGroup(e){this.expandedGroups.has(e)?this.expandedGroups.delete(e):this.expandedGroups.add(e);for(const[s,t]of this.visibleItems)this.cleanupItemListeners(s,t),t.remove();this.visibleItems.clear(),this.updateContentHeight(),this.isPaused?this.needsRefreshOnResume=!0:this.render()}updateContentHeight(){let e=0;for(const s of this.groups)if(!s.isMultiItem)e+=P;else if(this.expandedGroups.has(s.id)){const t=s.entries.length+s.faults.length;e+=R+t*M}else e+=R;this.contentContainer.style.height=`${e}px`}getGroupHeight(e){if(!e.isMultiItem)return P;if(this.expandedGroups.has(e.id)){const s=e.entries.length+e.faults.length;return R+s*M}return R}onScroll(){this.scrollTop=this.scrollContainer.scrollTop,this.isPaused?this.needsRefreshOnResume=!0:this.render()}render(){if(this.groups.length===0){this.renderEmpty();return}const e=this.contentContainer.querySelector(".empty-state");e&&e.remove();const s=new Set,t=this.scrollTop,o=this.scrollTop+this.containerHeight;let i=0;for(let a=0;a<this.groups.length;a++){const c=this.groups[a],n=this.getGroupHeight(c);i+n>=t-le*P&&i<=o+le*P&&(c.isMultiItem?this.expandedGroups.has(c.id)?this.renderExpandedGroup(c,i,s):this.renderCollapsedGroup(c,i,s):this.renderSingleItem(c,i,s)),i+=n}for(const[a,c]of this.visibleItems)s.has(a)||(this.cleanupItemListeners(a,c),c.remove(),this.visibleItems.delete(a))}renderSingleItem(e,s,t){const o=`single-${e.id}`;t.add(o);let i=this.visibleItems.get(o);if(!i){if(e.entries.length>0)i=this.createEntryItem(e.entries[0],e.faults,o,e.crossDeviceDuplicateCount);else if(e.faults.length>0)i=this.createFaultOnlyItem(e,o);else return;this.visibleItems.set(o,i),this.contentContainer.appendChild(i)}i.style.transform=`translateY(${s}px)`}renderCollapsedGroup(e,s,t){const o=`header-${e.id}`;t.add(o);let i=this.visibleItems.get(o);i||(i=this.createGroupHeader(e,!1),this.visibleItems.set(o,i),this.contentContainer.appendChild(i)),i.style.transform=`translateY(${s}px)`}renderExpandedGroup(e,s,t){const o=`header-${e.id}`;t.add(o);let i=this.visibleItems.get(o);i||(i=this.createGroupHeader(e,!0),this.visibleItems.set(o,i),this.contentContainer.appendChild(i)),i.style.transform=`translateY(${s}px)`;let a=s+R;for(let c=0;c<e.entries.length;c++){const n=e.entries[c],l=`sub-entry-${n.id}`;t.add(l);let r=this.visibleItems.get(l);r||(r=this.createSubEntryItem(n,l),this.visibleItems.set(l,r),this.contentContainer.appendChild(r)),r.style.transform=`translateY(${a}px)`,a+=M}for(let c=0;c<e.faults.length;c++){const n=e.faults[c],l=`sub-fault-${n.id}`;t.add(l);let r=this.visibleItems.get(l);r||(r=this.createSubFaultItem(n,l),this.visibleItems.set(l,r),this.contentContainer.appendChild(r)),r.style.transform=`translateY(${a}px)`,a+=M}}createGroupHeader(e,s){const t=document.createElement("div");t.className=`result-group-header ${s?"expanded":""}`,t.setAttribute("data-group-id",e.id),t.setAttribute("role","button"),t.setAttribute("tabindex","0"),t.setAttribute("aria-expanded",String(s)),t.style.cssText=`
      position: absolute;
      left: 0;
      right: 0;
      height: ${R}px;
      display: flex;
      align-items: center;
      padding: 0 8px 0 4px;
      gap: 8px;
      background: var(--surface);
      border-bottom: 1px solid var(--surface-elevated);
      cursor: pointer;
      transition: background 0.2s;
    `;const o=U(e.bib||"---"),a=g.getState().currentLang,c=Y(e.run),n=_(e.run,a),l=e.entries.length,r=e.faults.length,p=r>0,u=[];l>0&&u.push(`${l} ${v(l===1?"timeEntry":"timeEntries",a)}`),r>0&&u.push(`${r} ${v(r===1?"faultEntry":"faultEntries",a)}`);const h=u.join(", ");t.innerHTML=`
      ${be(16,s)}
      <div class="result-bib" style="font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 600; min-width: 44px; text-align: right;">
        ${L(o)}
      </div>
      <div style="min-width: 48px;"></div>
      ${V(n,c)}
      <div class="result-info" style="flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;">
        <div class="result-summary" style="font-size: 0.875rem; color: var(--text-secondary);">
          ${L(h)}
        </div>
      </div>
      ${e.crossDeviceDuplicateCount>0?ne(a):""}
      ${p?`<span class="result-fault-badge" style="padding: 2px 6px; border-radius: var(--radius); font-size: 0.7rem; font-weight: 600; background: var(--warning); color: #000;">
          ${r}× ${v("flt",a)}
        </span>`:""}
    `;const m=`header-${e.id}`,y={};return y.click=()=>{this.toggleGroup(e.id)},t.addEventListener("click",y.click),y.keydown=(D=>{switch(D.key){case"Enter":case" ":D.preventDefault(),this.toggleGroup(e.id);break;case"ArrowDown":D.preventDefault(),this.focusNextItem(t);break;case"ArrowUp":D.preventDefault(),this.focusPreviousItem(t);break}}),t.addEventListener("keydown",y.keydown),this.itemListeners.set(m,y),t}createEntryItem(e,s,t,o=0){const i=document.createElement("div");i.className="result-item",i.setAttribute("role","listitem"),i.setAttribute("tabindex","0"),i.setAttribute("data-entry-id",e.id),i.style.cssText=`
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
    `;const a=new Date(e.timestamp),c=W(a),n=U(e.bib||"---"),r=g.getState().currentLang,p=K(e.point),u=G(e.point,r),h=e.run??1,m=Y(h),y=_(h,r),D=s.length>0?oe({faults:s,lang:r}):"",C=o>0?ne(r):"";i.innerHTML=`
      <div style="width: 16px; flex-shrink: 0;"></div>
      <div class="result-bib" style="font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 600; min-width: 44px; text-align: right;">
        ${L(n)}
      </div>
      ${A(u,p)}
      ${V(y,m)}
      <div class="result-info" style="flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;">
        <div class="result-time" style="font-family: 'JetBrains Mono', monospace; color: var(--text-secondary); font-size: 0.875rem;">
          ${L(c)}
        </div>
        ${e.deviceName?`
          <div class="result-device" style="font-size: 0.7rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${L(e.deviceName)}
          </div>
        `:""}
      </div>
      ${C}
      ${D}
      ${e.status!=="ok"?J(v(e.status,r)):""}
      ${e.photo?ve(v("viewPhotoLabel",r)):""}
      ${z({ariaLabel:v("editEntryLabel",r)})}
      ${O({ariaLabel:v("deleteEntryLabel",r)})}
    `;const k={},B=i.querySelector(".result-edit-btn");k.editBtn=B,k.editClick=(f=>{var b,I;f.stopPropagation(),(I=(b=this.options).onItemClick)==null||I.call(b,e,f)}),B.addEventListener("click",k.editClick);const H=i.querySelector(".result-delete");k.deleteBtn=H,k.deleteClick=(f=>{var b,I;f.stopPropagation(),(I=(b=this.options).onItemDelete)==null||I.call(b,e)}),H.addEventListener("click",k.deleteClick);const x=i.querySelector(".result-photo-btn");return x&&(k.photoBtn=x,k.photoClick=(f=>{var b,I;f.stopPropagation(),(I=(b=this.options).onViewPhoto)==null||I.call(b,e)}),x.addEventListener("click",k.photoClick)),k.click=(f=>{var b,I;(I=(b=this.options).onItemClick)==null||I.call(b,e,f)}),i.addEventListener("click",k.click),k.keydown=(f=>{var I,X,ee,te,se,ie;const b=f;switch(b.key){case"Enter":case" ":b.preventDefault(),(X=(I=this.options).onItemClick)==null||X.call(I,e,new MouseEvent("click"));break;case"e":case"E":b.preventDefault(),(te=(ee=this.options).onItemClick)==null||te.call(ee,e,new MouseEvent("click"));break;case"Delete":case"d":case"D":b.preventDefault(),(ie=(se=this.options).onItemDelete)==null||ie.call(se,e);break;case"ArrowDown":b.preventDefault(),this.focusNextItem(i);break;case"ArrowUp":b.preventDefault(),this.focusPreviousItem(i);break}}),i.addEventListener("keydown",k.keydown),this.itemListeners.set(t,k),i}createFaultOnlyItem(e,s){var H;const t=document.createElement("div"),o=e.faults,i=o.some(x=>x.markedForDeletion);t.className=`result-item fault-only-item${i?" marked-for-deletion":""}`,t.setAttribute("role","listitem"),t.setAttribute("tabindex","0"),t.setAttribute("data-fault-id",e.id),t.style.cssText=`
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
      border-left: 3px solid ${i?"var(--error)":"var(--warning)"};
      ${i?"opacity: 0.6;":""}
      cursor: pointer;
    `;const a=U(e.bib||"---"),c=g.getState(),n=c.currentLang,l=Y(e.run),r=_(e.run,n),p=o.sort((x,f)=>x.gateNumber-f.gateNumber).map(x=>`T${x.gateNumber} (${re(x.faultType,n)})${x.markedForDeletion?" ⚠":""}`).join(", "),u=oe({faults:o,lang:n}),h=c.usePenaltyMode?v("flt",n):v("dsq",n),m=c.usePenaltyMode?"var(--warning)":"var(--error)",y=m==="var(--warning)"?"#000":"white",D=i?ae():"";t.innerHTML=`
      <div style="width: 16px; flex-shrink: 0;"></div>
      <div class="result-bib" style="font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 600; min-width: 44px; text-align: right; ${i?"text-decoration: line-through; opacity: 0.6;":""}">
        ${L(a)}
      </div>
      ${A(v("gate",n),"var(--warning)")}
      ${V(r,l)}
      <div class="result-info" style="flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;">
        <div class="result-fault-details" style="font-size: 0.8rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ${i?"text-decoration: line-through; opacity: 0.6;":""}">
          ${L(p)}
        </div>
        ${(H=o[0])!=null&&H.deviceName?`
          <div class="result-device" style="font-size: 0.7rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${L(o[0].deviceName)}
          </div>
        `:""}
      </div>
      ${D}
      ${i?"":u}
      ${i?"":J(h,m,y)}
      ${z({ariaLabel:v("editFaultLabel",n)})}
      ${O({ariaLabel:v("deleteFaultLabel",n),className:"result-delete fault-delete-btn"})}
    `;const C={},k=t.querySelector(".result-edit-btn");k&&o.length>0&&(C.editBtn=k,C.editClick=(x=>{x.stopPropagation();const f=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:o[0]}});t.dispatchEvent(f)}),k.addEventListener("click",C.editClick));const B=t.querySelector(".fault-delete-btn");return B&&o.length>0&&(C.deleteBtn=B,C.deleteClick=(x=>{x.stopPropagation();const f=new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:o[0]}});t.dispatchEvent(f)}),B.addEventListener("click",C.deleteClick)),C.click=(x=>{const f=x.target;if(!(f.closest(".fault-delete-btn")||f.closest(".result-edit-btn"))&&o.length>0){const b=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:o[0]}});t.dispatchEvent(b)}}),t.addEventListener("click",C.click),C.keydown=(x=>{const f=x;switch(f.key){case"Enter":case" ":case"e":case"E":if(f.preventDefault(),o.length>0){const b=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:o[0]}});t.dispatchEvent(b)}break;case"Delete":case"d":case"D":if(f.preventDefault(),o.length>0){const b=new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:o[0]}});t.dispatchEvent(b)}break;case"ArrowDown":f.preventDefault(),this.focusNextItem(t);break;case"ArrowUp":f.preventDefault(),this.focusPreviousItem(t);break}}),t.addEventListener("keydown",C.keydown),this.itemListeners.set(s,C),t}createSubEntryItem(e,s){const t=document.createElement("div");t.className="result-sub-item entry-sub-item",t.setAttribute("role","listitem"),t.setAttribute("tabindex","0"),t.setAttribute("data-entry-id",e.id),t.style.cssText=`
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
    `;const o=new Date(e.timestamp),i=W(o),c=g.getState().currentLang,n=K(e.point),l=G(e.point,c);t.innerHTML=`
      <div style="width: 16px; flex-shrink: 0;"></div>
      <div style="min-width: 44px;"></div>
      ${A(l,n,"48px","0.7rem")}
      <div style="min-width: 36px;"></div>
      <div class="result-info" style="flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0;">
        <div class="result-time" style="font-family: 'JetBrains Mono', monospace; color: var(--text-secondary); font-size: 0.85rem;">
          ${L(i)}
        </div>
        ${e.deviceName?`
          <div class="result-device" style="font-size: 0.65rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${L(e.deviceName)}
          </div>
        `:""}
      </div>
      ${e.status!=="ok"?J(v(e.status,c),"var(--error)","white","0.65rem"):""}
      ${z({ariaLabel:v("editEntryLabel",c),size:16})}
      ${O({ariaLabel:v("deleteEntryLabel",c),size:16})}
    `;const r={},p=t.querySelector(".result-edit-btn");r.editBtn=p,r.editClick=(h=>{var m,y;h.stopPropagation(),(y=(m=this.options).onItemClick)==null||y.call(m,e,h)}),p.addEventListener("click",r.editClick);const u=t.querySelector(".result-delete");return r.deleteBtn=u,r.deleteClick=(h=>{var m,y;h.stopPropagation(),(y=(m=this.options).onItemDelete)==null||y.call(m,e)}),u.addEventListener("click",r.deleteClick),r.click=(h=>{var m,y;(y=(m=this.options).onItemClick)==null||y.call(m,e,h)}),t.addEventListener("click",r.click),r.keydown=(h=>{var y,D,C,k;const m=h;switch(m.key){case"Enter":case" ":case"e":case"E":m.preventDefault(),(D=(y=this.options).onItemClick)==null||D.call(y,e,new MouseEvent("click"));break;case"Delete":case"d":case"D":m.preventDefault(),(k=(C=this.options).onItemDelete)==null||k.call(C,e);break;case"ArrowDown":m.preventDefault(),this.focusNextItem(t);break;case"ArrowUp":m.preventDefault(),this.focusPreviousItem(t);break}}),t.addEventListener("keydown",r.keydown),this.itemListeners.set(s,r),t}createSubFaultItem(e,s){const t=document.createElement("div"),o=e.markedForDeletion;t.className=`result-sub-item fault-sub-item${o?" marked-for-deletion":""}`,t.setAttribute("role","listitem"),t.setAttribute("tabindex","0"),t.setAttribute("data-fault-id",e.id),t.style.cssText=`
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
      border-left: 3px solid ${o?"var(--error)":"var(--warning)"};
      ${o?"opacity: 0.6;":""}
      cursor: pointer;
      transition: background 0.2s;
    `;const a=g.getState().currentLang,c=g.getGateColor(e.gateNumber),n=c==="red"?"#ef4444":"#3b82f6";t.innerHTML=`
      <div style="width: 16px; flex-shrink: 0;"></div>
      <div style="min-width: 44px;"></div>
      ${A(`T${e.gateNumber}`,"var(--warning)","48px","0.7rem")}
      <div style="min-width: 36px; display: flex; align-items: center; justify-content: center;">
        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${n};" title="${c}"></div>
      </div>
      <div class="result-info" style="flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0;">
        <span style="font-size: 0.85rem; color: var(--text-secondary); ${o?"text-decoration: line-through;":""}">
          ${L(re(e.faultType,a))}
        </span>
        ${e.deviceName?`
          <span style="font-size: 0.65rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${L(e.deviceName)}
          </span>
        `:""}
      </div>
      ${o?ae("0.65rem"):""}
      ${z({ariaLabel:v("editFaultLabel",a),size:16})}
      ${O({ariaLabel:v("deleteFaultLabel",a),size:16,className:"result-delete fault-delete-btn"})}
    `;const l={},r=t.querySelector(".result-edit-btn");l.editBtn=r,l.editClick=(u=>{u.stopPropagation();const h=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(h)}),r.addEventListener("click",l.editClick);const p=t.querySelector(".fault-delete-btn");return l.deleteBtn=p,l.deleteClick=(u=>{u.stopPropagation();const h=new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(h)}),p.addEventListener("click",l.deleteClick),l.click=(()=>{const u=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(u)}),t.addEventListener("click",l.click),l.keydown=(u=>{const h=u;switch(h.key){case"Enter":case" ":case"e":case"E":h.preventDefault();{const m=new CustomEvent("fault-edit-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(m)}break;case"Delete":case"d":case"D":h.preventDefault();{const m=new CustomEvent("fault-delete-request",{bubbles:!0,detail:{fault:e}});t.dispatchEvent(m)}break;case"ArrowDown":h.preventDefault(),this.focusNextItem(t);break;case"ArrowUp":h.preventDefault(),this.focusPreviousItem(t);break}}),t.addEventListener("keydown",l.keydown),this.itemListeners.set(s,l),t}renderEmpty(){for(const s of this.visibleItems.values())s.remove();this.visibleItems.clear();const e=g.getState();this.contentContainer.innerHTML=`
      <div class="empty-state">
        <span class="empty-icon">⏱️</span>
        <span>${v("noEntries",e.currentLang)}</span>
        <span class="empty-subtitle">${v("noEntriesHint",e.currentLang)}</span>
      </div>
    `}pause(){this.isPaused=!0}resume(){this.isPaused=!1,this.needsRefreshOnResume&&(this.needsRefreshOnResume=!1,this.render())}scrollToTop(){this.scrollContainer.scrollTo({top:0,behavior:"smooth"})}scrollToEntry(e){const s=String(e),t=this.groups.find(i=>i.entries.some(a=>a.id===s));if(!t)return;let o=0;for(const i of this.groups){if(i.id===t.id)break;o+=this.getGroupHeight(i)}t.isMultiItem&&(this.expandedGroups.add(t.id),this.isPaused?this.needsRefreshOnResume=!0:this.render()),this.isPaused||this.scrollContainer.scrollTo({top:o,behavior:"smooth"})}getVisibleCount(){return this.groups.reduce((e,s)=>e+s.entries.length,0)}getSortedFocusableItems(){const e=Array.from(this.visibleItems.values());return e.sort((s,t)=>{const o=this.getItemYPosition(s),i=this.getItemYPosition(t);return o-i}),e}focusNextItem(e){const s=this.getSortedFocusableItems(),t=s.indexOf(e);t>=0&&t<s.length-1&&s[t+1].focus()}focusPreviousItem(e){const s=this.getSortedFocusableItems(),t=s.indexOf(e);t>0&&s[t-1].focus()}getItemYPosition(e){const t=e.style.transform.match(/translateY\((\d+)px\)/);return t?parseInt(t[1],10):0}cleanupItemListeners(e,s){const t=this.itemListeners.get(e);t&&(t.click&&s.removeEventListener("click",t.click),t.keydown&&s.removeEventListener("keydown",t.keydown),t.editBtn&&t.editClick&&t.editBtn.removeEventListener("click",t.editClick),t.deleteBtn&&t.deleteClick&&t.deleteBtn.removeEventListener("click",t.deleteClick),t.photoBtn&&t.photoClick&&t.photoBtn.removeEventListener("click",t.photoClick),this.itemListeners.delete(e))}destroy(){if(!this.isDestroyed){this.isDestroyed=!0,this.domRemovalObserver&&(this.domRemovalObserver.disconnect(),this.domRemovalObserver=null),this.scrollHandler&&(this.scrollContainer.removeEventListener("scroll",this.scrollHandler),this.scrollHandler=null),this.scrollDebounceTimeout!==null&&(clearTimeout(this.scrollDebounceTimeout),this.scrollDebounceTimeout=null),this.resizeDebounceTimeout!==null&&(clearTimeout(this.resizeDebounceTimeout),this.resizeDebounceTimeout=null),this.resizeObserver&&(this.resizeObserver.disconnect(),this.resizeObserver=null),this.unsubscribe&&(this.unsubscribe(),this.unsubscribe=null),this.unsubscribeBattery&&(this.unsubscribeBattery(),this.unsubscribeBattery=null);for(const[e,s]of this.visibleItems)this.cleanupItemListeners(e,s);this.visibleItems.clear(),this.itemListeners.clear(),this.scrollContainer.remove()}}}let F=null;async function Me(d){const e=document.getElementById("photo-viewer-modal");if(!e||!d.photo)return;F=d.id;const s=document.getElementById("photo-viewer-image"),t=document.getElementById("photo-viewer-bib"),o=document.getElementById("photo-viewer-point"),i=document.getElementById("photo-viewer-time"),c=g.getState().currentLang;if(s){const n=G(d.point,c);if(s.alt=`${v("photoForBib",c)} ${d.bib||"---"} - ${n}`,ge(d.photo)){s.src="";const l=await ce.getPhoto(d.id);if(l)s.src=`data:image/jpeg;base64,${l}`;else{Q.warn("Photo not found in IndexedDB for entry:",d.id);return}}else s.src=`data:image/jpeg;base64,${d.photo}`}if(t&&(t.textContent=d.bib||"---"),o){o.textContent=G(d.point,c);const n=K(d.point);o.style.background=n,o.style.color="var(--background)"}if(i){const n=new Date(d.timestamp);i.textContent=W(n)}Ce(e)}function Re(){const d=document.getElementById("photo-viewer-modal");Ie(d),F=null}async function Fe(){if(!F)return;const d=g.getState(),e=F;await ce.deletePhoto(e),g.updateEntry(e,{photo:void 0}),Re(),q(v("photoDeleted",d.currentLang),"success"),we()}let T=null,N=null,S=null;const $=new ye;function He(d){window.dispatchEvent(new CustomEvent("open-edit-modal",{detail:{entry:d}}))}function Ae(d){window.dispatchEvent(new CustomEvent("prompt-delete",{detail:{entry:d}}))}function j(d){window.dispatchEvent(new CustomEvent("open-confirm-modal",{detail:{action:d}}))}function Ue(){return T}function Ye(){$.removeAll(),S&&(clearTimeout(S),S=null);const d=E("results-list");if(!d)return;T=new Pe({container:d,onItemClick:a=>He(a),onItemDelete:a=>Ae(a),onItemSelect:a=>{g.toggleEntrySelection(a.id)},onViewPhoto:a=>Me(a)}),$.add(d,"fault-edit-request",(a=>{var n;const c=(n=a.detail)==null?void 0:n.fault;c&&Le(c)})),$.add(d,"fault-delete-request",(a=>{var n;const c=(n=a.detail)==null?void 0:n.fault;c&&De(c)}));const e=g.getState();T.setEntries(e.entries),he();const s=document.querySelector(".results-view");s&&(N=new ke({container:s,onRefresh:async()=>{await de.forceRefresh(),q(v("syncReceived",g.getState().currentLang),"success")}}));const t=E("search-input");t&&$.add(t,"input",()=>{S&&clearTimeout(S),S=setTimeout(()=>{Z()},300)});const o=E("filter-point"),i=E("filter-status");o&&$.add(o,"change",Z),i&&$.add(i,"change",Z),ze(),e.currentView!=="results"&&T&&T.pause()}function ze(){const d=E("clear-all-btn");d&&$.add(d,"click",()=>{const o=g.getState();if(o.entries.length===0){q(v("noEntries",o.currentLang),"info");return}j("clearAll")});const e=E("undo-btn");e&&$.add(e,"click",()=>{if(g.canUndo()){const o=g.peekUndo();if(o&&o.type==="ADD_ENTRY")j("undoAdd");else{const i=g.undo();xe(),q(v("undone",g.getState().currentLang),"success");const a=g.getState();if(i&&i.type==="ADD_ENTRY"&&a.settings.sync&&a.raceId){const c=i.data;de.deleteEntryFromCloud(c.id,c.deviceId)}}}});const s=E("export-btn");s&&$.add(s,"click",Ee);const t=E("delete-selected-btn");t&&$.add(t,"click",()=>{g.getState().selectedEntries.size>0&&j("deleteSelected")})}function Z(){if(!T)return;const d=E("search-input"),e=E("filter-point"),s=E("filter-status");T.applyFilters((d==null?void 0:d.value)||"",(e==null?void 0:e.value)||"all",(s==null?void 0:s.value)||"all"),he()}function he(){const e=g.getState().entries,s=e.length,t=new Set(e.map(u=>u.bib)).size,o=new Set(e.filter(u=>u.point==="F"&&u.status==="ok").map(u=>u.bib)).size,i=new Map;for(const u of e){const h=`${u.bib}-${u.point}-${u.run??1}`;i.has(h)||i.set(h,new Set),i.get(h).add(u.deviceId)}let a=0;for(const u of i.values())u.size>1&&a++;const c=E("stat-total"),n=E("stat-racers"),l=E("stat-finished"),r=E("stat-duplicates"),p=E("stat-duplicates-item");c&&(c.textContent=String(s)),n&&(n.textContent=String(t)),l&&(l.textContent=String(o)),r&&(r.textContent=String(a)),p&&(p.style.display=a>0?"":"none")}function _e(){const d=E("entry-count-badge");if(d){const e=g.getState().entries.length;d.textContent=String(e),d.style.display=e>0?"inline":"none"}}function Oe(){S&&(clearTimeout(S),S=null),$.removeAll(),N&&(N.destroy(),N=null),T&&(T.destroy(),T=null)}function Ve(){Oe()}export{_e as a,Ve as b,Re as c,Fe as d,Ue as g,Ye as i,he as u};
