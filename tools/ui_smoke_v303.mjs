import { chromium } from 'playwright';
import fs from 'node:fs';

const url=process.env.MLV_UI_URL||'http://127.0.0.1:4173';
const out=process.env.MLV_UI_SCREENSHOTS||'artifacts/ui-smoke';
fs.mkdirSync(out,{recursive:true});

function ok(value,message){if(!value)throw new Error(message)}

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
await page.addInitScript(()=>{
  try{localStorage.setItem('michelsLife.onboarding.v30200','done')}catch(_){}
});
try{
  const languageUrl=url+(url.includes('?')?'&':'?')+'installerLang=es';
  await page.goto(languageUrl,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.LeftNavV30171&&window.MLVI18nV308&&document.querySelector('#v30171Sidebar'),null,{timeout:60000});

  await page.evaluate(()=>window.LeftNavV30171.route('settings'));
  await page.waitForSelector('[data-v30171-setting="general"]',{timeout:10000});
  await page.click('[data-v30171-setting="general"]');
  await page.waitForTimeout(300);
  const i18nSettingsDebug=await page.evaluate(()=>({
    buttons:[...document.querySelectorAll('[data-v30171-setting]')].map(x=>({setting:x.dataset.v30171Setting,cls:x.className,text:(x.textContent||'').trim().slice(0,80)})),
    panes:[...document.querySelectorAll('[data-v30171-pane]')].map(x=>({pane:x.dataset.v30171Pane,cls:x.className,text:(x.textContent||'').trim().slice(0,120)})),
    activeSettingsPanes:[...document.querySelectorAll('.v30171-settings-pane')].filter(x=>x.offsetParent!==null).map(x=>({pane:x.dataset.v30171Pane||'',cls:x.className})),
    cards:document.querySelectorAll('[data-mlv-i18n-card]').length
  }));
  console.log('I18N_SETTINGS_DEBUG '+JSON.stringify(i18nSettingsDebug));
  await page.waitForSelector('.v30171-settings-pane.active [data-mlv-i18n-card]',{timeout:10000});
  await page.waitForTimeout(250);

  const i18nTextCatalog=await page.evaluate(()=>{
    const roots=[document.querySelector('#v30171Sidebar'),...document.querySelectorAll('[data-v30171-pane]')].filter(Boolean);
    const values=new Set();
    for(const root of roots){
      const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      let n;
      while((n=w.nextNode())){
        if(n.parentElement?.closest('script,style,textarea,pre,code'))continue;
        const s=(n.nodeValue||'').replace(/\s+/g,' ').trim();
        if(s&&s.length<=180)values.add(s);
      }
    }
    return [...values].sort((a,b)=>a.localeCompare(b));
  });
  console.log('I18N_TEXT_CATALOG '+JSON.stringify(i18nTextCatalog));

  const installerLanguage=await page.evaluate(()=>({
    language:window.MLVI18nV308?.language||'',
    htmlLang:document.documentElement.lang,
    stored:localStorage.getItem('michelsLife.language.v308')||'',
    cardTitle:(document.querySelector('[data-mlv-i18n-card] h2')?.textContent||'').trim(),
    hasSpanishTypography:[...document.querySelectorAll('.v30171-settings-btn')].some(x=>(x.textContent||'').includes('Tipografía')),
    hasSpanishChoice:!!document.querySelector('[data-mlv-lang="es"].active')
  }));
  ok(installerLanguage.language==='es'&&installerLanguage.htmlLang==='es'&&installerLanguage.stored==='es','Installer Spanish choice was not persisted: '+JSON.stringify(installerLanguage));
  ok(installerLanguage.cardTitle==='Idioma'&&installerLanguage.hasSpanishTypography&&installerLanguage.hasSpanishChoice,'Spanish UI did not render in Settings: '+JSON.stringify(installerLanguage));

  await page.evaluate(()=>window.MLVI18nV308.set('en',true));
  await page.waitForFunction(()=>window.MLVI18nV308?.language==='en'&&localStorage.getItem('michelsLife.language.v308')==='en');
  await page.waitForTimeout(150);
  const switchedEnglish=await page.evaluate(()=>({
    htmlLang:document.documentElement.lang,
    cardTitle:(document.querySelector('[data-mlv-i18n-card] h2')?.textContent||'').trim(),
    hasEnglishTypography:[...document.querySelectorAll('.v30171-settings-btn')].some(x=>(x.textContent||'').includes('Typography')),
    hasEnglishChoice:!!document.querySelector('[data-mlv-lang="en"].active')
  }));
  ok(switchedEnglish.htmlLang==='en'&&switchedEnglish.cardTitle==='Language'&&switchedEnglish.hasEnglishTypography&&switchedEnglish.hasEnglishChoice,'In-app English override failed: '+JSON.stringify(switchedEnglish));

  await page.evaluate(()=>{
    try{
      if(window.state?.settings)window.state.settings.onboardingRequired=false;
      if(window.state)window.state.activeTab='dashboard';
      window.save?.();
      window.renderAll?.();
    }catch(_){}
  });
  await page.waitForTimeout(900);

  const logo=await page.evaluate(()=>{
    const img=document.querySelector('#v30171Sidebar .v30171-brand-mark img');
    const title=document.querySelector('#v30171Sidebar .v30171-brand-title');
    const sub=document.querySelector('#v30171Sidebar .v30171-brand-sub');
    const brand=document.querySelector('#v30171Sidebar .v30171-brand');
    const ir=img.getBoundingClientRect(),tr=title.getBoundingClientRect(),sr=sub.getBoundingClientRect(),br=brand.getBoundingClientRect();
    return {
      src:img.getAttribute('src'),w:img.naturalWidth,h:img.naturalHeight,cw:ir.width,ch:ir.height,
      display:getComputedStyle(img).display,visibility:getComputedStyle(img).visibility,opacity:getComputedStyle(img).opacity,
      direction:getComputedStyle(brand).flexDirection,
      imgBottom:ir.bottom,titleTop:tr.top,titleBottom:tr.bottom,subTop:sr.top,
      imgCenter:ir.left+ir.width/2,titleCenter:tr.left+tr.width/2,subCenter:sr.left+sr.width/2,brandCenter:br.left+br.width/2
    };
  });
  ok(logo.src==='assets/michels_life_logo.svg','sidebar is not using the canonical logo asset');
  ok(logo.w>20&&logo.h>20&&logo.cw>=80&&logo.ch>=80&&logo.display!=='none'&&logo.visibility!=='hidden'&&logo.opacity!=='0','canonical sidebar logo is not visibly rendered');
  console.log('BRAND_GEOMETRY '+JSON.stringify(logo));
  ok(logo.direction==='column','Michel’s Life brand is not stacked vertically: '+JSON.stringify(logo));
  ok(logo.imgBottom<=logo.titleTop+2&&logo.titleBottom<=logo.subTop+2,'Michel’s Life mark/title/subtitle are not in the approved vertical order: '+JSON.stringify(logo));
  ok(Math.abs(logo.imgCenter-logo.brandCenter)<4&&Math.abs(logo.titleCenter-logo.brandCenter)<4&&Math.abs(logo.subCenter-logo.brandCenter)<4,'Michel’s Life brand is not centered: '+JSON.stringify(logo));

  const defaultType=await page.evaluate(()=>document.documentElement.dataset.mlvTypography);
  ok(defaultType==='midnights','Midnights is not the default typography');

  await page.evaluate(()=>window.LeftNavV30171.route('settings'));
  await page.waitForSelector('[data-v30171-setting="typography"]',{timeout:10000});
  await page.click('[data-v30171-setting="typography"]');
  await page.waitForSelector('[data-v30171-pane="typography"].active [data-mlv-typography-core]',{timeout:10000});
  await page.waitForTimeout(1200);
  const typographyRoute=await page.evaluate(()=>({
    activePane:document.querySelector('.v30171-settings-pane.active')?.dataset?.v30171Pane||'',
    activeButton:document.querySelector('.v30171-settings-btn.active')?.dataset?.v30171Setting||'',
    saved:localStorage.getItem('michelsLife.settingsSection.v30171')||''
  }));
  ok(typographyRoute.activePane==='typography'&&typographyRoute.activeButton==='typography'&&typographyRoute.saved==='typography','Typography route fell back to General after delayed rerenders');

  const headingFonts=await page.evaluate(()=>{
    const a=document.querySelector('[data-v30171-pane="typography"] .v30171-pane-title');
    const b=document.querySelector('[data-v30171-pane="typography"] .section-title h2');
    return {pane:getComputedStyle(a).fontFamily,section:getComputedStyle(b).fontFamily};
  });
  ok(headingFonts.pane===headingFonts.section,'Settings pane title font does not match the Background Themes-style section heading font');
  const eraCatalog=await page.evaluate(()=>({
    ids:[...document.querySelectorAll('[data-mlv-font-preset]')].map(x=>x.dataset.mlvFontPreset),
    labels:[...document.querySelectorAll('.mlv303-font-copy b')].map(x=>(x.textContent||'').trim()),
    artists:[...document.querySelectorAll('.mlv303-artist-head b')].map(x=>(x.textContent||'').trim())
  }));
  for(const id of ['red','aka','born_to_die','paradise','ultraviolence','folklore','evermore','ocean_blvd'])ok(eraCatalog.ids.includes(id),'Missing independent typography era: '+id);
  ok(!eraCatalog.labels.some(x=>/Red\s*\/\s*Lana|folklore\s*\/\s*evermore|Chemtrails\s*\/\s*Blue Banisters/i.test(x)),'Typography still contains merged eras: '+JSON.stringify(eraCatalog.labels));
  ok(eraCatalog.artists.length===0,'Typography must use one unified era grid without artist group headings: '+JSON.stringify(eraCatalog.artists));

  const typographyPaletteCheck=await page.evaluate(()=>{
    const capture=()=>{
      const root=getComputedStyle(document.documentElement),body=getComputedStyle(document.body);
      return {
        text:root.getPropertyValue('--text'),bg:root.getPropertyValue('--bg'),
        accent:root.getPropertyValue('--accent'),gold:root.getPropertyValue('--gold'),
        bodyColor:body.color,bodyBackground:body.backgroundImage
      };
    };
    const mid=document.querySelector('[data-mlv-font-preset="midnights"]');
    const folk=document.querySelector('[data-mlv-font-preset="folklore"]');
    const before={
      palette:capture(),
      midPreview:getComputedStyle(mid.querySelector('.mlv303-font-word')).fontFamily,
      folkPreview:getComputedStyle(folk.querySelector('.mlv303-font-word')).fontFamily,
      midState:mid.querySelector('.mlv303-font-state')?.textContent||'',
      folkState:folk.querySelector('.mlv303-font-state')?.textContent||''
    };
    window.MLVTypographyV303.apply('folklore',true);
    const selectedCard=document.querySelector('[data-mlv-font-preset="folklore"]');
    const after={
      palette:capture(),
      selected:document.documentElement.dataset.mlvTypography,
      midPreview:getComputedStyle(mid.querySelector('.mlv303-font-word')).fontFamily,
      folkPreview:getComputedStyle(folk.querySelector('.mlv303-font-word')).fontFamily,
      midState:mid.querySelector('.mlv303-font-state')?.textContent||'',
      folkState:folk.querySelector('.mlv303-font-state')?.textContent||'',
      selectedText:getComputedStyle(selectedCard.querySelector('.mlv303-font-copy b')).color,
      bodyText:getComputedStyle(document.body).color,
      selectedBg:getComputedStyle(selectedCard).backgroundImage
    };
    return {before,after};
  });
  ok(typographyPaletteCheck.after.selected==='folklore','Typography API did not apply Folklore');
  ok(JSON.stringify(typographyPaletteCheck.before.palette)===JSON.stringify(typographyPaletteCheck.after.palette),'Typography API changed app colors/backgrounds: '+JSON.stringify(typographyPaletteCheck));
  ok(typographyPaletteCheck.before.midPreview!==typographyPaletteCheck.before.folkPreview,'Typography cards are not previewing distinct font stacks');
  ok(typographyPaletteCheck.before.midPreview===typographyPaletteCheck.after.midPreview&&typographyPaletteCheck.before.folkPreview===typographyPaletteCheck.after.folkPreview,'Changing the active font altered the other cards’ previews');
  ok(/SELECTED/.test(typographyPaletteCheck.after.folkState)&&/PREVIEW/.test(typographyPaletteCheck.after.midState),'Typography selected/preview labels did not update correctly');
  ok(typographyPaletteCheck.after.selectedText===typographyPaletteCheck.after.bodyText,'Selected typography card text is not readable in the normal interface text color');
  await page.evaluate(()=>window.MLVTypographyV303.apply('midnights',true));
  await page.waitForFunction(()=>document.documentElement.dataset.mlvTypography==='midnights');

  await page.screenshot({path:`${out}/01-typography.png`,fullPage:true});
  await page.evaluate(()=>window.MLVTypographyV303.apply('midnights',true));

  await page.click('[data-v30171-setting="themes"]');
  await page.waitForSelector('[data-v30171-pane="themes"].active',{timeout:10000});
  await page.screenshot({path:`${out}/02-themes.png`,fullPage:true});

  await page.click('[data-v30171-setting="about"]');
  await page.waitForSelector('[data-v30171-pane="about"].active .mlvdev-avatar',{timeout:10000});
  const avatar=await page.$eval('.mlvdev-avatar',img=>({w:img.naturalWidth,h:img.naturalHeight,cw:img.getBoundingClientRect().width,ch:img.getBoundingClientRect().height,src:img.getAttribute('src')}));
  ok(avatar.src==='assets/michel_duarte_avatar.jpg','About is not using the canonical developer portrait');
  ok(avatar.w>100&&avatar.h>100&&avatar.cw>=180&&avatar.ch>=220,'About portrait is missing or still rendered as a thumbnail');
  await page.screenshot({path:`${out}/03-about.png`,fullPage:true});

  await page.evaluate(()=>{
    if(!window.FocusStoryV30162?.activeChapter?.()){
      window.FocusStoryV30162?.createChapter?.('UI Test Chapter','',new Date().toISOString().slice(0,10));
    }
  });
  await page.click('[data-v30171-setting="chapters"]');
  await page.waitForSelector('[data-v30171-pane="chapters"].active [data-mlv184-chapter]',{timeout:10000});
  const chapterData=await page.evaluate(()=>({
    current:window.FocusStoryV30162?.activeChapter?.()?.scenePack||'dark_kingdom',
    options:[...document.querySelectorAll('[data-v30171-pane="chapters"].active [data-mlv184-chapter]')].map(x=>x.dataset.mlv184Chapter)
  }));
  const target=chapterData.options.find(x=>x&&x!==chapterData.current);
  ok(!!target,'No alternate Chapter Scene option available for interaction test');
  await page.click(`[data-v30171-pane="chapters"].active [data-mlv184-chapter="${target}"]`);
  await page.waitForFunction(t=>window.FocusStoryV30162?.activeChapter?.()?.scenePack===t,target,{timeout:10000});
  await page.waitForSelector(`[data-v30171-pane="chapters"].active [data-mlv184-chapter="${target}"].active`,{timeout:10000});
  await page.screenshot({path:`${out}/04-chapters.png`,fullPage:true});

  const cloudCount=await page.evaluate(()=>{
    try{window.toast?.('Cloud overview','Google token refresh failed: test','error',{persistent:true})}catch(_){}
    try{window.notification?.('Cloud overview','Google token refresh failed: test',{kind:'error',persistent:true})}catch(_){}
    return [...document.querySelectorAll('.toast')].filter(x=>/cloud overview/i.test(x.textContent||'')).length;
  });
  ok(cloudCount===0,'Cloud overview popup is still visible');

  await page.evaluate(()=>window.LeftNavV30171.route('dashboard'));
  await page.waitForTimeout(600);
  await page.screenshot({path:`${out}/05-dashboard.png`,fullPage:true});

  console.log(JSON.stringify({installerLanguage,switchedEnglish,logo,typographyRoute,typographyPaletteCheck,headingFonts,avatar,chapterTarget:target,typography:'midnights',cloudPopups:cloudCount},null,2));
} finally {
  await browser.close();
}
