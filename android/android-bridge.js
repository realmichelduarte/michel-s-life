(function(){
  'use strict';
  if(window.__MICHELSLIFE_ANDROID_BRIDGE__) return;
  window.__MICHELSLIFE_ANDROID_BRIDGE__='0.2.3';
  window.__MICHELSLIFE_PLATFORM__='android';

  const listeners=new Set();
  window.chrome=window.chrome||{};
  window.chrome.webview={
    postMessage(payload){
      try{
        window.MichelsLifeAndroid.postMessage(JSON.stringify(payload));
      }catch(error){
        console.error('Michel\'s Life Android bridge postMessage failed',error);
      }
    },
    addEventListener(type,callback){
      if(type==='message'&&typeof callback==='function')listeners.add(callback);
    },
    removeEventListener(type,callback){
      if(type==='message')listeners.delete(callback);
    }
  };

  window.__mlvAndroidReceive=function(raw){
    try{
      const data=typeof raw==='string'?JSON.parse(raw):raw;
      listeners.forEach(callback=>{
        try{callback({data});}catch(error){console.error('Michel\'s Life Android bridge listener failed',error);}
      });
    }catch(error){
      console.error('Michel\'s Life Android bridge response failed',error);
    }
  };

  const MOBILE_BREAKPOINT=4096;
  const STORAGE_KEY='vida_rpg_personal_progress_v2';
  const ONBOARD_KEY='michelsLife.onboarding.v30200';
  const MAJOR_TABS=['dashboard','missions','contracts','journal','stats','achievements','calendar','settings'];
  const isMobile=()=>window.matchMedia('(max-width:'+MOBILE_BREAKPOINT+'px)').matches;
  const q=(selector,root=document)=>root.querySelector(selector);
  const qa=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  const visible=el=>!!(el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none');
  const escSelector=value=>String(value).replace(/(["\\])/g,'\\$1');

  function setDrawer(open){
    document.body.classList.toggle('mlv-android-nav-open',!!open);
    const side=q('#v30171Sidebar');
    if(side)side.style.setProperty('transform',open?'translateX(0)':'translateX(-105%)','important');
    const button=q('#mlv-android-menu-button');
    if(button)button.setAttribute('aria-expanded',open?'true':'false');
  }

  function activeTabId(){
    try{
      const id=String(window.state?.activeTab||'');
      if(id)return id==='goals'?'contracts':id;
    }catch(_){}
    const active=q('#v30171PrimaryNav [data-tab].active, #v30171PrimaryNav [data-tab][aria-current="page"], #side [data-tab].active, #side [data-tab][aria-current="page"]');
    return active?.dataset?.tab||'';
  }

  function displayLabelForTab(id){
    if(!id)return 'Today';
    const exact=q('#v30171PrimaryNav [data-tab="'+escSelector(id)+'"] .v30171-nav-label, #v30171PrimaryNav [data-tab="'+escSelector(id)+'"]');
    const text=exact?.textContent?.replace(/\s+/g,' ')?.trim();
    if(text)return text.replace(/^[^\p{L}\p{N}]+/u,'').trim()||text;
    return id.replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  }

  function updateTopbarTitle(){
    const title=q('#mlv-android-section-title');
    if(!title)return;
    const current=activeTabId()||'dashboard';
    title.textContent=displayLabelForTab(current);
    document.body.dataset.mlvAndroidTab=current;
    const tabs=availableMajorTabs();
    const index=tabs.indexOf(current);
    const prev=q('#mlv-android-prev-section');
    const next=q('#mlv-android-next-section');
    if(prev)prev.disabled=index<=0;
    if(next)next.disabled=index<0||index>=tabs.length-1;
  }

  function availableMajorTabs(){
    const nav=q('#v30171PrimaryNav')||q('#side')||document;
    const present=new Set(qa('[data-tab]',nav).filter(visible).map(el=>el.dataset.tab).filter(Boolean));
    const major=MAJOR_TABS.filter(id=>present.has(id));
    if(major.length>=2)return major;
    const seen=new Set();
    return qa('[data-tab]',nav)
      .filter(visible)
      .map(el=>el.dataset.tab)
      .filter(id=>id&&!seen.has(id)&&seen.add(id));
  }

  function finishSectionSwitch(started,id,routerName){
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      document.documentElement.removeAttribute('data-mlv-android-switching');
      updateTopbarTitle();
      window.__mlvAndroidLastSwitch={
        tab:id,
        router:routerName,
        elapsedMs:Math.round((performance.now()-started)*10)/10,
        active:activeTabId()
      };
    }));
  }

  function persistNavLater(){
    const work=()=>{try{if(typeof window.save==='function')window.save();else if(typeof save==='function')save()}catch(_){}};
    if(typeof requestIdleCallback==='function')requestIdleCallback(work,{timeout:450});
    else setTimeout(work,80);
  }

  function fastRoute(id){
    id=String(id||'');
    if(!id)return false;
    if(id==='today')id='dashboard';
    if(id==='goals')id='contracts';
    if(activeTabId()===id){setDrawer(false);updateTopbarTitle();return true;}

    const started=performance.now();
    document.documentElement.setAttribute('data-mlv-android-switching','1');
    setDrawer(false);
    try{window.v3094ExitDayPage?.()}catch(_){}

    if(id==='journal'&&window.JournalV30189?.open){
      try{
        window.JournalV30189.open();
        finishSectionSwitch(started,id,'JournalV30189.open');
        return true;
      }catch(error){
        console.warn('Michel\'s Life Android journal fast route fallback',error);
      }
    }

    // Story keeps its compatibility router because it has its own legacy/fallback renderer.
    if(id==='story'){
      try{
        const router=window.LeftNavV30171;
        if(router&&typeof router.route==='function'){
          router.route(id);
          finishSectionSwitch(started,id,'LeftNavV30171.route:story');
          return true;
        }
      }catch(_){}
    }

    try{window.state.activeTab=id}catch(_){
      try{state.activeTab=id}catch(__){
        document.documentElement.removeAttribute('data-mlv-android-switching');
        return false;
      }
    }

    try{
      if(id==='settings'){
        const main=q('#main');
        const renderSettingsFn=typeof window.renderSettings==='function'?window.renderSettings:(typeof renderSettings==='function'?renderSettings:null);
        if(!main||!renderSettingsFn)throw new Error('Settings renderer unavailable');
        main.innerHTML='<section class="tab active" id="tab-settings">'+String(renderSettingsFn()||'')+'</section>';
      }else if(typeof window.renderMain==='function'){
        window.renderMain();
      }else if(typeof renderMain==='function'){
        renderMain();
      }else{
        throw new Error('renderMain unavailable');
      }
      try{window.LeftNavV30171?.renderNav?.()}catch(_){}
    }catch(error){
      console.warn('Michel\'s Life Android active-surface render',error);
      document.documentElement.removeAttribute('data-mlv-android-switching');
      return false;
    }

    requestAnimationFrame(()=>{
      if(id==='settings'){
        // Build the canonical Settings categories once from the already-rendered Settings surface.
        try{window.LeftNavV30171?.buildSettings?.()}catch(error){console.warn('Michel\'s Life Android Settings shell',error);}
      }else{
        try{window.PlanningFocusV30106?.enhanceAll?.()}catch(_){}
      }
      enforceMobileFlowGeometry();
      updateTopbarTitle();
    });
    persistNavLater();
    finishSectionSwitch(started,id,'android-render-main');
    return true;
  }
  window.__mlvAndroidFastRoute=fastRoute;

  function clickTab(id){
    const ok=fastRoute(id);
    const debug=window.__mlvAndroidGestureDebug;
    if(debug){
      debug.router='android-fast-route';
      debug.requestedTab=id;
      debug.activeImmediately=activeTabId();
      setTimeout(()=>{debug.activeAfter120=activeTabId();},120);
      setTimeout(()=>{debug.activeAfter500=activeTabId();},500);
    }
    return ok;
  }

  function installFastNavCapture(){
    if(window.__mlvAndroidFastNavCaptureInstalled)return;
    window.__mlvAndroidFastNavCaptureInstalled=true;
    // Registered from android-bridge.js in <head>, before legacy capture handlers.
    window.addEventListener('click',event=>{
      if(!isMobile())return;

      const nav=event.target?.closest?.('#v30171PrimaryNav [data-tab]');
      if(nav){
        const id=String(nav.dataset.tab||'');
        if(!id)return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        fastRoute(id);
        return;
      }

      const today=event.target?.closest?.('[data-v30171-day="today"]');
      if(today){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        fastRoute('dashboard');
        return;
      }

      const setting=event.target?.closest?.('.v30171-settings-nav [data-v30171-setting]');
      if(setting){
        const key=String(setting.dataset.v30171Setting||'');
        if(!key)return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        try{
          window.__mlvSettingsSectionLock=key;
          localStorage.setItem('michelsLife.settingsSection.v30171',key);
          window.LeftNavV30171?.activateSetting?.(key);
          if(key==='google')requestAnimationFrame(()=>window.GoogleCalendarV30190?.mountSettings?.());
          window.__mlvAndroidLastSettingsSwitch={key,at:performance.now()};
        }catch(error){
          console.warn('Michel\'s Life Android settings section switch',error);
        }
      }
    },true);
  }

  function navigateSwipe(direction){
    const tabs=availableMajorTabs();
    if(tabs.length<2)return false;
    const current=activeTabId();
    let index=tabs.indexOf(current);
    if(index<0)index=0;
    const next=index+(direction==='next'?1:-1);
    if(next<0||next>=tabs.length)return false;
    return clickTab(tabs[next]);
  }

  function savedMichelState(){
    try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(_){return null}
  }

  function hasExistingMichelState(saved=savedMichelState()){
    if(!saved||typeof saved!=='object')return false;
    const settings=saved.settings||{};
    return !!(
      settings.onboardingCompletedAt ||
      (settings.characterName&&settings.characterName!=='Player') ||
      Number(saved.xp||0)>0 ||
      (Array.isArray(saved.missions)&&saved.missions.length) ||
      (Array.isArray(saved.goals)&&saved.goals.length) ||
      (Array.isArray(saved.history)&&saved.history.length)
    );
  }

  function stabilizeAndroidOnboarding(){
    const saved=savedMichelState();
    if(!hasExistingMichelState(saved))return false;
    try{localStorage.setItem(ONBOARD_KEY,'done')}catch(_){}
    if(saved?.settings?.onboardingRequired===true){
      saved.settings.onboardingRequired=false;
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify(saved))}catch(_){}
    }
    q('#mlv200Onboarding')?.remove();
    return true;
  }

  function setImportantOnce(el,prop,value){
    if(!el)return;
    if(el.style.getPropertyValue(prop)===value&&el.style.getPropertyPriority(prop)==='important')return;
    el.style.setProperty(prop,value,'important');
  }

  // A first-run wizard is a modal workflow, not a scrollable desktop page.
  // Keep the controls outside the content scroller so they cannot slip behind
  // the Android system navigation bar on compact/edge-to-edge phones.
  function layoutAndroidOnboarding(root){
    const card=q('.mlv200-onboard-card',root);
    const head=q('.mlv200-onboard-head',card);
    const actions=q('.mlv200-onboard-actions',card);
    if(!card||!head||!actions)return false;
    if(!q('.mlv-android-onboard-scroll',card)){
      const scroller=document.createElement('div');
      scroller.className='mlv-android-onboard-scroll';
      let node=head.nextSibling;
      while(node&&node!==actions){
        const next=node.nextSibling;
        scroller.appendChild(node);
        node=next;
      }
      card.insertBefore(scroller,actions);
    }
    return true;
  }

  function stabilizeAndroidOnboardingControls(){
    const root=q('#mlv200Onboarding');
    if(!root||!isMobile())return false;
    layoutAndroidOnboarding(root);

    qa('.mlv200-focus',root).forEach(row=>{
      setImportantOnce(row,'display','grid');
      setImportantOnce(row,'grid-template-columns','28px minmax(0,1fr)');
      setImportantOnce(row,'align-items','center');
      setImportantOnce(row,'gap','8px');
      setImportantOnce(row,'width','100%');
      setImportantOnce(row,'height','auto');
      setImportantOnce(row,'min-height','44px');
      setImportantOnce(row,'padding','6px 8px');
      setImportantOnce(row,'box-sizing','border-box');
    });

    qa('.mlv200-focus input[type="checkbox"],.mlv200-option input[type="checkbox"]',root).forEach(input=>{
      setImportantOnce(input,'-webkit-appearance','checkbox');
      setImportantOnce(input,'appearance','auto');
      setImportantOnce(input,'display','block');
      setImportantOnce(input,'position','static');
      setImportantOnce(input,'width','22px');
      setImportantOnce(input,'height','22px');
      setImportantOnce(input,'min-width','22px');
      setImportantOnce(input,'min-height','22px');
      setImportantOnce(input,'max-width','22px');
      setImportantOnce(input,'max-height','22px');
      setImportantOnce(input,'inline-size','22px');
      setImportantOnce(input,'block-size','22px');
      setImportantOnce(input,'min-inline-size','22px');
      setImportantOnce(input,'min-block-size','22px');
      setImportantOnce(input,'max-inline-size','22px');
      setImportantOnce(input,'max-block-size','22px');
      setImportantOnce(input,'margin','0');
      setImportantOnce(input,'padding','0');
      setImportantOnce(input,'transform','none');
      setImportantOnce(input,'justify-self','center');
      setImportantOnce(input,'align-self','center');
      setImportantOnce(input,'box-sizing','border-box');
    });

    qa('.mlv200-focus > span',root).forEach(copy=>{
      setImportantOnce(copy,'min-width','0');
      setImportantOnce(copy,'width','auto');
    });
    return true;
  }

  function enforceMobileFlowGeometry(){
    if(!isMobile())return;
    stabilizeAndroidOnboarding();
    stabilizeAndroidOnboardingControls();
    const app=q('.app');
    if(app){
      setImportantOnce(app,'padding','0');
      setImportantOnce(app,'margin','0');
      setImportantOnce(app,'width','100%');
      setImportantOnce(app,'max-width','none');
    }
    const side=q('#v30171Sidebar');
    if(side){
      if(side.parentElement!==document.body)document.body.appendChild(side);
      setImportantOnce(side,'position','fixed');
      setImportantOnce(side,'top','calc(var(--mlv-android-topbar-h) + env(safe-area-inset-top,0px))');
      setImportantOnce(side,'left','0');
      setImportantOnce(side,'right','auto');
      setImportantOnce(side,'bottom','0');
      setImportantOnce(side,'width','min(86vw,320px)');
      setImportantOnce(side,'max-width','320px');
      setImportantOnce(side,'height','auto');
      setImportantOnce(side,'max-height','none');
      setImportantOnce(side,'margin','0');
      setImportantOnce(side,'z-index','2147482995');
      setImportantOnce(side,'background','rgba(var(--ui-panel-rgb,7,13,25),.985)');
      setImportantOnce(side,'transform',document.body.classList.contains('mlv-android-nav-open')?'translateX(0)':'translateX(-105%)');

      let hint=q('#mlv-android-drawer-hint',side);
      if(!hint){
        hint=document.createElement('div');
        hint.id='mlv-android-drawer-hint';
        hint.textContent='Swipe ↔ or use ‹ › to change sections';
        side.appendChild(hint);
      }

      const actionDock=q('#v30175ActionDock');
      if(actionDock){
        if(actionDock.parentElement!==side)side.appendChild(actionDock);
        setImportantOnce(actionDock,'position','sticky');
        setImportantOnce(actionDock,'left','auto');
        setImportantOnce(actionDock,'right','auto');
        setImportantOnce(actionDock,'bottom','0');
        setImportantOnce(actionDock,'width','100%');
        setImportantOnce(actionDock,'display','flex');
        setImportantOnce(actionDock,'flex-direction','row');
        setImportantOnce(actionDock,'justify-content','center');
        setImportantOnce(actionDock,'gap','9px');
        setImportantOnce(actionDock,'z-index','8');
      }
    }

    const focusDock=q('#v30162FocusDock');
    if(focusDock){
      setImportantOnce(focusDock,'left','0');
      setImportantOnce(focusDock,'right','auto');
      setImportantOnce(focusDock,'bottom','0');
      setImportantOnce(focusDock,'width','0');
      setImportantOnce(focusDock,'height','0');
      setImportantOnce(focusDock,'min-width','0');
      setImportantOnce(focusDock,'min-height','0');
      setImportantOnce(focusDock,'max-width','0');
      setImportantOnce(focusDock,'max-height','0');
      setImportantOnce(focusDock,'pointer-events','none');
    }

    const status=q('#v176StatusPanel');
    if(status){
      setImportantOnce(status,'position','relative');
      setImportantOnce(status,'top','auto');
      setImportantOnce(status,'max-height','64px');
      setImportantOnce(status,'overflow','hidden');
      setImportantOnce(status,'margin','6px 8px');
    }
  }

  function installMobileChrome(){
    if(q('#mlv-android-topbar')){enforceMobileFlowGeometry();return;}
    const topbar=document.createElement('header');
    topbar.id='mlv-android-topbar';
    topbar.setAttribute('aria-label','Android navigation');
    topbar.innerHTML='<button id="mlv-android-menu-button" type="button" aria-label="Open menu" aria-expanded="false">☰</button><div class="mlv-android-topbar-copy"><strong>Michel’s Life</strong><span id="mlv-android-section-title">Today</span></div><div class="mlv-android-section-controls" aria-label="Section navigation"><button id="mlv-android-prev-section" type="button" aria-label="Previous section">‹</button><button id="mlv-android-next-section" type="button" aria-label="Next section">›</button></div>';
    const backdrop=document.createElement('button');
    backdrop.id='mlv-android-drawer-backdrop';
    backdrop.type='button';
    backdrop.tabIndex=-1;
    backdrop.setAttribute('aria-label','Close menu');
    document.body.append(topbar,backdrop);
    q('#mlv-android-menu-button')?.addEventListener('click',()=>setDrawer(!document.body.classList.contains('mlv-android-nav-open')));
    q('#mlv-android-prev-section')?.addEventListener('click',()=>navigateSwipe('previous'));
    q('#mlv-android-next-section')?.addEventListener('click',()=>navigateSwipe('next'));
    backdrop.addEventListener('click',()=>setDrawer(false));
    document.addEventListener('click',event=>{
      if(!isMobile())return;
      const navTarget=event.target.closest('#side [data-tab], #v30171PrimaryNav [data-tab]');
      if(navTarget)setDrawer(false);
      if(event.target.closest('[data-action="close-modal"], .modal-backdrop'))setTimeout(updateTopbarTitle,0);
      if(event.target.closest('[data-mlv200-onboard]')){
        setTimeout(stabilizeAndroidOnboardingControls,0);
        setTimeout(stabilizeAndroidOnboardingControls,80);
      }
    },true);
    updateTopbarTitle();
  }

  function installSwipeNavigation(){
    let startX=0,startY=0,startAt=0,tracking=false,interactive=false,horizontalScroller=false;
    document.addEventListener('touchstart',event=>{
      if(!isMobile()||event.touches.length!==1)return;
      const touch=event.touches[0];
      startX=touch.clientX;startY=touch.clientY;startAt=performance.now();tracking=true;
      const target=event.target;
      interactive=!!target.closest('button,a,input,select,textarea,label,[contenteditable="true"],.modal,.v132-actions,.actions');
      horizontalScroller=!!target.closest('.v134-ach-filter,.v140-cat-shortcuts,.v140-library-toggle,[data-horizontal-scroll],.tabs');
      window.__mlvAndroidGestureDebug={
        phase:'start',startX,startY,target:target?.tagName||'',className:String(target?.className||''),
        interactive,horizontalScroller
      };
    },{passive:true});
    document.addEventListener('touchend',event=>{
      if(!tracking||!isMobile()||event.changedTouches.length!==1){tracking=false;return;}
      tracking=false;
      const touch=event.changedTouches[0];
      const dx=touch.clientX-startX,dy=touch.clientY-startY,elapsed=Math.max(1,performance.now()-startAt);
      const debug=window.__mlvAndroidGestureDebug||{};
      Object.assign(debug,{phase:'end',dx,dy,elapsed,drawerOpen:document.body.classList.contains('mlv-android-nav-open')});
      window.__mlvAndroidGestureDebug=debug;
      if(Math.abs(dx)<96||Math.abs(dx)<Math.abs(dy)*1.65||elapsed>650){debug.result='threshold-rejected';return;}
      if(document.body.classList.contains('mlv-android-nav-open')){
        if(dx<0){setDrawer(false);debug.result='drawer-closed';}else debug.result='drawer-open-noop';
        return;
      }
      if(startX<=28&&dx>72){setDrawer(true);debug.result='drawer-opened';return;}
      if(interactive||horizontalScroller){debug.result=interactive?'interactive-rejected':'horizontal-scroller-rejected';return;}
      const direction=dx<0?'next':'previous';
      debug.direction=direction;
      debug.result=navigateSwipe(direction)?'navigated':'navigation-unavailable';
    },{passive:true});
  }

  function closeTopModal(){
    const modal=q('#modalRoot .modal-backdrop, .modal-backdrop');
    if(!visible(modal))return false;
    const close=q('[data-action="close-modal"]',modal);
    if(close){close.click();return true;}
    return false;
  }

  window.__mlvAndroidHandleBack=function(){
    if(document.body.classList.contains('mlv-android-nav-open')){setDrawer(false);return true;}
    if(closeTopModal())return true;
    return false;
  };

  function installPlatformStyles(){
    if(q('#mlv-android-platform-style'))return;
    const style=document.createElement('style');
    style.id='mlv-android-platform-style';
    style.textContent=`
      [data-mlv202-action="install-online"],[data-mlv202-action="install-local"],[data-mlv202-action="choose-local"]{display:none!important}
      html[data-mlv-platform="android"],html[data-mlv-platform="android"] body{min-width:0!important;max-width:100%!important;overflow-x:hidden!important}
      #mlv-android-topbar,#mlv-android-drawer-backdrop{display:none}
      @media(max-width:${MOBILE_BREAKPOINT}px){
        :root{--mlv-android-topbar-h:56px}
        html[data-mlv-platform="android"] body{overscroll-behavior-y:none;padding-top:calc(var(--mlv-android-topbar-h) + env(safe-area-inset-top,0px))!important;touch-action:pan-y!important}
        html[data-mlv-platform="android"] #main *,html[data-mlv-platform="android"] #v30171Sidebar *,#mlv-android-topbar{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
        #v3000SkyImg{filter:none!important;transform:none!important}
        /* The wizard owns the whole foreground. Fixed Android chrome must never
           sit on top of first-run steps or hijack taps before Continue. */
        #mlv200Onboarding{position:fixed!important;inset:0!important;z-index:2147483500!important;display:flex!important;justify-content:center!important;align-items:stretch!important;width:100vw!important;height:100dvh!important;max-height:100dvh!important;min-height:0!important;box-sizing:border-box!important;padding:max(12px,env(safe-area-inset-top,0px)) 8px max(42px,env(safe-area-inset-bottom,0px))!important;overflow:hidden!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:rgba(3,7,13,.96)!important}
        body:has(#mlv200Onboarding:not([hidden])) #mlv-android-topbar{visibility:hidden!important;pointer-events:none!important}
        #mlv200Onboarding .mlv200-onboard-card{display:flex!important;flex-direction:column!important;width:100%!important;max-width:560px!important;height:100%!important;max-height:100%!important;min-height:0!important;min-width:0!important;overflow:hidden!important;box-sizing:border-box!important;padding:14px!important;border-radius:18px!important}
        #mlv200Onboarding .mlv200-onboard-head{flex:0 0 auto!important;min-width:0!important;margin-bottom:12px!important}
        #mlv200Onboarding .mlv200-onboard-head h1{font-size:clamp(22px,6.5vw,30px)!important;overflow-wrap:anywhere!important}
        #mlv200Onboarding .mlv-android-onboard-scroll{flex:1 1 0!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:0 1px 12px!important}
        #mlv200Onboarding .mlv200-onboard-actions{flex:0 0 auto!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:7px!important;position:relative!important;bottom:auto!important;margin:0!important;padding:12px 0 2px!important;min-height:68px!important;box-sizing:border-box!important;background:rgba(var(--ui-panel-rgb,8,16,26),.98)!important;z-index:2!important}
        #mlv200Onboarding .mlv200-onboard-actions>div{display:flex!important;gap:6px!important;min-width:0!important;justify-content:flex-end!important}
        #mlv200Onboarding .mlv200-onboard-actions button{position:relative!important;min-height:48px!important;min-width:0!important;max-width:100%!important;padding:8px 11px!important;font-size:12px!important;opacity:1!important;pointer-events:auto!important;touch-action:manipulation!important;white-space:nowrap!important}
        #mlv200Onboarding .mlv200-onboard-actions [data-mlv200-onboard="next"],#mlv200Onboarding .mlv200-onboard-actions [data-mlv200-onboard="finish"]{flex:0 0 auto!important;min-width:96px!important}
        @media(max-width:360px){#mlv200Onboarding .mlv200-onboard-actions button{padding-inline:7px!important;font-size:11px!important}#mlv200Onboarding .mlv200-onboard-actions [data-mlv200-onboard="next"],#mlv200Onboarding .mlv200-onboard-actions [data-mlv200-onboard="finish"]{min-width:85px!important}}
        #mlv200Onboarding .mlv200-focus-grid{grid-template-columns:1fr!important;gap:6px!important}
        #mlv200Onboarding .mlv200-focus{display:grid!important;grid-template-columns:28px minmax(0,1fr)!important;align-items:center!important;gap:8px!important;min-height:46px!important;padding:7px 10px!important;border-radius:12px!important}
        #mlv200Onboarding .mlv200-focus input[type="checkbox"],#mlv200Onboarding .mlv200-option input[type="checkbox"]{-webkit-appearance:checkbox!important;appearance:auto!important;width:22px!important;height:22px!important;min-width:22px!important;min-height:22px!important;max-width:22px!important;max-height:22px!important;margin:0!important;padding:0!important;transform:none!important;accent-color:var(--ui-accent,var(--accent,#ff7ad9))!important}
        #mlv200Onboarding .mlv200-focus b{font-size:12px!important;line-height:1.25!important}
        html[data-mlv-platform="android"][data-mlv-android-switching="1"] *{transition-duration:0s!important}
        html[data-mlv-platform="android"][data-mlv-android-switching="1"] #mlv-android-topbar::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:currentColor;opacity:.38;animation:mlvAndroidSwitchPulse .55s ease-in-out infinite alternate}
        @keyframes mlvAndroidSwitchPulse{from{transform:scaleX(.22);opacity:.18}to{transform:scaleX(1);opacity:.52}}
        #main,.layout{touch-action:pan-y!important}
        .v134-ach-filter,.v140-cat-shortcuts,.v140-library-toggle,[data-horizontal-scroll],.tabs{touch-action:pan-x!important}
        #mlv-android-topbar{position:fixed;display:flex;align-items:center;gap:10px;top:0;left:0;right:0;height:calc(var(--mlv-android-topbar-h) + env(safe-area-inset-top,0px));padding:env(safe-area-inset-top,0px) 12px 0;z-index:2147483000;background:rgba(6,9,19,.94);backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,.1);box-sizing:border-box}
        #mlv-android-menu-button{width:42px;height:42px;min-width:42px;padding:0;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:inherit;font:inherit;font-size:22px;line-height:1;display:grid;place-items:center}
        .mlv-android-topbar-copy{min-width:0;display:flex;flex:1 1 auto;flex-direction:column;gap:1px}.mlv-android-topbar-copy strong{font-size:13px;line-height:1.1}.mlv-android-topbar-copy span{font-size:11px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:48vw}
        .mlv-android-section-controls{display:flex;gap:5px;flex:0 0 auto}.mlv-android-section-controls button{width:34px;height:34px;min-width:34px;padding:0;border-radius:10px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.045);color:inherit;font-size:22px;line-height:1;display:grid;place-items:center}.mlv-android-section-controls button:disabled{opacity:.24}
        #mlv-android-drawer-backdrop{display:block;position:fixed;inset:calc(var(--mlv-android-topbar-h) + env(safe-area-inset-top,0px)) 0 0;border:0;padding:0;background:rgba(0,0,0,.48);opacity:0;pointer-events:none;z-index:2147482990;transition:opacity .18s ease}
        body.mlv-android-nav-open #mlv-android-drawer-backdrop{opacity:1;pointer-events:auto}
        .app{max-width:none!important;width:100%!important;margin:0!important;padding:0!important}
        .topbar{display:none!important}
        .app-shell,.layout,.content,#main{min-width:0!important;max-width:100%!important;width:100%!important;box-sizing:border-box!important}
        .app-shell,.layout{grid-template-columns:minmax(0,1fr)!important;display:block!important;margin-top:6px!important}
        #fixedStatusBar,.status-strip{display:none!important;height:0!important;min-height:0!important;max-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important}
        #v176StatusPanel{position:relative!important;top:auto!important;left:auto!important;right:auto!important;bottom:auto!important;display:block!important;width:calc(100% - 16px)!important;max-width:none!important;height:auto!important;min-height:0!important;max-height:64px!important;margin:6px 8px!important;padding:5px 7px!important;border-radius:14px!important;overflow:hidden!important;contain:layout paint!important;transform:none!important}
        #v176StatusPanel .v176-card{display:none!important}
        #v176StatusPanel .v176-card:first-child{display:flex!important;align-items:center!important;gap:8px!important;width:100%!important;min-width:0!important;min-height:0!important;height:auto!important;margin:0!important;padding:5px 7px!important;border:0!important;border-radius:10px!important;background:transparent!important;box-shadow:none!important;overflow:hidden!important}
        #v176StatusPanel .v176-time{flex:0 0 auto!important;font-size:18px!important;line-height:1!important;letter-spacing:-.03em!important}
        #v176StatusPanel .v176-small{min-width:0!important;margin:0!important;font-size:9px!important;line-height:1.2!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        #v30171Sidebar{position:fixed!important;top:calc(var(--mlv-android-topbar-h) + env(safe-area-inset-top,0px))!important;left:0!important;bottom:0!important;width:min(86vw,320px)!important;max-width:320px!important;height:auto!important;max-height:none!important;overflow-y:auto!important;transform:translateX(-105%)!important;transition:transform .16s ease!important;z-index:2147482995!important;margin:0!important;padding:10px!important;border-radius:0 18px 18px 0!important;box-shadow:12px 0 35px rgba(0,0,0,.35)!important;overscroll-behavior:contain;background:rgba(var(--ui-panel-rgb,7,13,25),.985)!important}
        body.mlv-android-nav-open #v30171Sidebar{transform:translateX(0)!important}
        #v30171Sidebar .v30171-brand{flex-direction:row!important;justify-content:flex-start!important;text-align:left!important;gap:8px!important;padding:5px 4px 9px!important}
        #v30171Sidebar .v30171-brand-mark{width:38px!important;height:38px!important;min-width:38px!important;font-size:20px!important}
        #v30171Sidebar h1.v30171-brand-title{font-size:13px!important;text-align:left!important}
        #v30171PrimaryNav{display:flex!important;flex-direction:column!important;grid-template-columns:none!important;gap:4px!important;padding:2px 0 8px!important}
        #v30171PrimaryNav .v30171-nav-btn{min-height:40px!important;padding:8px 9px!important;gap:8px!important;font-size:12px!important}
        #main,.content{margin:0!important;padding:8px!important}
        .card,.v132-panel,.v131-hero{max-width:100%!important;box-sizing:border-box!important}
        .v131-stack,.dashboard-v13{gap:8px!important}
        .v132-dashboard-grid,.dash-row-v13{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:8px!important}
        .v131-hero,.dash-hero-v13{padding:12px!important;min-height:0!important}
        .v131-kpis,.kpis{gap:6px!important}
        .v131-kpi,.kpi{padding:8px!important;min-width:0!important}
        .section-title{gap:8px!important;align-items:flex-start!important}.section-title h2{font-size:clamp(17px,5vw,21px)!important;line-height:1.12!important}.section-title p{margin-top:3px!important}
        article.v132-mission,article.v137-mission,article.mission-card,article.quest-card{display:grid!important;grid-template-columns:40px minmax(0,1fr)!important;column-gap:9px!important;align-items:start!important;padding:10px!important;min-width:0!important}
        article.v132-mission>.v132-check,article.v137-mission>.v132-check,.mission-card .v132-check,.quest-card .v132-check{grid-column:1!important;width:36px!important;height:36px!important;min-width:36px!important;min-height:36px!important;margin:0!important;padding:0!important;align-self:start!important;justify-self:start!important;display:grid!important;place-items:center!important;line-height:1!important;box-sizing:border-box!important}
        article.v132-mission>div,article.v137-mission>div,article.mission-card>div,article.quest-card>div{grid-column:2!important;min-width:0!important}
        article.v132-mission h3,article.v137-mission h3,.mission-card h3,.quest-card h3{overflow-wrap:anywhere!important;margin-top:1px!important}
        .v131-pills,.pills,.chips{display:flex!important;flex-wrap:wrap!important;gap:5px!important;min-width:0!important}
        .v132-mission-actions{grid-column:2!important;display:flex!important;justify-content:flex-end!important;align-items:center!important;gap:6px!important;min-width:0!important;margin-top:6px!important}
        .v132-actions,.v131-actions,.quest-actions,article.v132-mission .actions,article.v137-mission .actions{display:flex!important;flex-wrap:wrap!important;gap:6px!important;min-width:0!important}
        .v132-actions button,.v131-actions button,.quest-actions button,article.v132-mission .actions button,article.v137-mission .actions button{min-height:38px!important;max-width:100%!important;white-space:normal!important}
        #mlv-android-drawer-hint{margin:8px 2px 5px;padding:7px 8px;border-top:1px solid rgba(255,255,255,.08);font-size:9px;line-height:1.25;text-align:center;color:var(--muted,#aeb9ce);opacity:.78}
        #v30175ActionDock{position:sticky!important;left:auto!important;right:auto!important;bottom:0!important;width:100%!important;margin:0!important;padding:6px 2px 8px!important;display:flex!important;flex-direction:row!important;justify-content:center!important;gap:9px!important;align-items:center!important;background:linear-gradient(180deg,transparent,rgba(6,9,19,.98) 30%)!important;z-index:8!important;pointer-events:none!important;box-sizing:border-box!important}
        #v30175ActionDock .v30175-action,#v30175ActionDock #v30106QuickFab{--v30175-action-size:44px!important;position:relative!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;max-width:44px!important;max-height:44px!important;border-radius:14px!important;pointer-events:auto!important}
        #v30175ActionDock .v30175-icon{width:21px!important;height:21px!important}
        #v30162FocusDock{left:0!important;right:auto!important;bottom:0!important;width:0!important;height:0!important;min-width:0!important;min-height:0!important;max-width:0!important;max-height:0!important;pointer-events:none!important}
        #v30162FocusDock .v30173-focus-wrap,#v30162FocusDock .v30173-focus-trigger{width:0!important;height:0!important;min-width:0!important;min-height:0!important;max-width:0!important;max-height:0!important}
        /* Stable Android check controls: never inherit full-width desktop input sizing. */
        #mlv200Onboarding .mlv200-focus{display:grid!important;grid-template-columns:26px minmax(0,1fr)!important;align-items:center!important;gap:10px!important;min-height:52px!important;padding:9px 11px!important}
        #mlv200Onboarding .mlv200-focus input[type="checkbox"]{width:22px!important;height:22px!important;min-width:22px!important;min-height:22px!important;max-width:22px!important;max-height:22px!important;margin:0!important;padding:0!important;transform:none!important;flex:0 0 22px!important;accent-color:var(--accent)!important}
        #mlv200Onboarding .mlv200-focus span{min-width:0!important}
        #mlv200Onboarding .mlv200-focus b{font-size:13px!important;line-height:1.25!important;overflow-wrap:anywhere!important}
        #mlv200Onboarding .mlv200-option input[type="checkbox"],.day-chip input[type="checkbox"],.mlv185-opacity-toggle input[type="checkbox"]{width:20px!important;height:20px!important;min-width:20px!important;min-height:20px!important;max-width:20px!important;max-height:20px!important;flex:0 0 20px!important;margin:1px 0 0!important}
        #main{padding-bottom:12px!important}
        #v30162FocusDock .v30173-focus-panel{pointer-events:auto!important;left:10px!important;right:10px!important;bottom:10px!important;width:auto!important;max-height:calc(100vh - var(--mlv-android-topbar-h) - 30px)!important}
                input,select,textarea,button{max-width:100%;box-sizing:border-box}
      }
      @media(min-width:900px) and (max-width:${MOBILE_BREAKPOINT}px){
        html[data-mlv-platform="android"] #main,
        html[data-mlv-platform="android"] .content{width:min(100%,1180px)!important;max-width:1180px!important;margin-left:auto!important;margin-right:auto!important}
        html[data-mlv-platform="android"] #v176StatusPanel{width:min(calc(100% - 24px),1180px)!important;max-width:1180px!important;margin-left:auto!important;margin-right:auto!important}
      }
      @media(min-width:${MOBILE_BREAKPOINT+1}px){body.mlv-android-nav-open{overflow:auto}}
    `;
    (document.body||document.head).appendChild(style);
  }

  function observeUi(){
    let navObserver=null;
    let navTarget=null;
    let lastActive='';

    const attachNavObserver=()=>{
      const next=q('#v30171PrimaryNav');
      if(next===navTarget)return;
      navObserver?.disconnect();
      navTarget=next;
      if(!next)return;
      navObserver=new MutationObserver(()=>requestAnimationFrame(updateTopbarTitle));
      navObserver.observe(next,{subtree:true,attributes:true,attributeFilter:['class','aria-current']});
    };

    const maintenance=()=>{
      if(!isMobile())return;
      stabilizeAndroidOnboarding();
      attachNavObserver();
      const active=activeTabId();
      if(active&&active!==lastActive){lastActive=active;updateTopbarTitle();}
      enforceMobileFlowGeometry();
    };

    attachNavObserver();
    maintenance();
    window.__mlvAndroidMaintenanceTimer=setInterval(maintenance,1000);
    window.addEventListener('michelslife:languagechange',()=>setTimeout(updateTopbarTitle,0));
    window.addEventListener('resize',()=>{if(!isMobile())setDrawer(false);else maintenance();});
  }

  installFastNavCapture();

  // Run in <head> before Michel's Life body scripts can sanitize an existing profile as fresh.
  stabilizeAndroidOnboarding();
  function boot(){
    document.documentElement.setAttribute('data-mlv-platform','android');
    stabilizeAndroidOnboarding();
    installPlatformStyles();
    installMobileChrome();
    enforceMobileFlowGeometry();
    installSwipeNavigation();
    observeUi();
    setTimeout(enforceMobileFlowGeometry,0);
    setTimeout(enforceMobileFlowGeometry,120);
    setTimeout(enforceMobileFlowGeometry,650);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
