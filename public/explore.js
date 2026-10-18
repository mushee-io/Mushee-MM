const byId=id=>document.getElementById(id);
const state={categories:[],category:"all",status:"all",sort:"name",q:"",offset:0,limit:15,
  feeds:[],quotes:new Map(),total:0,request:0,detail:null,searchTimer:null};
const icons={all:"▦",indices:"⌁",metals:"◆",crypto:"₿",equities:"▥",
  fx:"⇄",commodities:"◈",rates:"%"};
const set=(id,text)=>{byId(id).textContent=text;};
const clear=node=>node.replaceChildren();
async function request(url){
  const response=await fetch(url,{headers:{Accept:"application/json"},cache:"no-store"});
  let data;
  try{data=await response.json();}
  catch{throw Error("The server returned an unexpected response");}
  if(!response.ok)throw Error(data.error||data.message||"Request failed");
  return data;
}
function elem(tag,text,className){
  const result=document.createElement(tag);
  if(text!==undefined&&text!==null)result.textContent=String(text);
  if(className)result.className=className;
  return result;
}
function labelStatus(feed){
  if(feed.status!=="connected")return {label:"Coming soon",style:"planned"};
  const quote=state.quotes.get(feed.symbol);
  if(!quote)return {label:"Connector ready",style:"connected"};
  if(quote.status==="unavailable")return {label:"Source unavailable",style:"unavailable"};
  if(quote.status==="disputed")return {label:"Prices disputed",style:"unavailable"};
  if(quote.status==="degraded")return {label:"Degraded",style:"unavailable"};
  return {label:"Reporting",style:"connected"};
}
function priceText(feed){
  if(feed.status!=="connected")return "—";
  const quote=state.quotes.get(feed.symbol);
  if(!quote||!Number.isFinite(quote.price)||quote.price<=0)return "—";
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",
    minimumFractionDigits:2,maximumFractionDigits:quote.price<1?6:2}).format(quote.price);
}
function categoryName(slug){
  return state.categories.find(c=>c.slug===slug)?.name||slug;
}
function categoryFromURL(){
  const slug=new URLSearchParams(window.location.search).get("category")||"all";
  return state.categories.some(c=>c.slug===slug)?slug:"all";
}
function syncURL(){
  const url=new URL(window.location.href);
  url.searchParams.set("category",state.category);
  if(state.q)url.searchParams.set("q",state.q);else url.searchParams.delete("q");
  if(state.status!=="all")url.searchParams.set("status",state.status);else url.searchParams.delete("status");
  if(state.sort!=="name")url.searchParams.set("sort",state.sort);else url.searchParams.delete("sort");
  history.replaceState({category:state.category},"",url);
}
function navTo(slug){
  state.category=slug;state.offset=0;
  syncURL();updateNav();loadFeeds();
  document.getElementById("feed-browser").scrollIntoView({behavior:"smooth",block:"start"});
}
function updateNav(){
  document.querySelectorAll("#category-nav a[data-category]").forEach(a=>{
    const active=a.dataset.category===state.category;
    a.classList.toggle("active",active);
    if(active)a.setAttribute("aria-current","page");
    else a.removeAttribute("aria-current");
  });
  const category=state.categories.find(c=>c.slug===state.category);
  set("section-title",category?.name||"All feeds");
  set("section-desc",category?.description||"Search and filter the directory");
  set("directory-badge",String(category?.count??"—")+" directory entries");
}
function renderNav(){
  const nav=byId("category-nav");
  clear(nav);
  for(const category of state.categories){
    const a=elem("a",null,"navbtn");
    a.href="/explore?category="+encodeURIComponent(category.slug);
    a.dataset.category=category.slug;
    a.append(elem("span",icons[category.slug]||"·","ico"),
      elem("span",category.name,"label"),elem("span",category.count,"count"));
    a.addEventListener("click",e=>{e.preventDefault();navTo(category.slug);});
    nav.append(a);
  }
  updateNav();
}
function row(feed){
  const tr=document.createElement("tr");
  const nameCell=document.createElement("td");
  const icon=elem("span",feed.symbol.slice(0,2).replace(/[^A-Z0-9]/g,""),"token");
  const words=document.createElement("div");
  words.append(elem("div",feed.name,"name"),elem("div",feed.symbol,"sub mono"));
  const asset=elem("div",null,"asset");
  asset.append(icon,words);nameCell.append(asset);
  const categoryCell=elem("td",categoryName(feed.category));
  const typeCell=elem("td",feed.instrument);
  const quoteCell=elem("td",feed.quoteCurrency,"mono");
  const statusCell=document.createElement("td");
  const badge=labelStatus(feed);
  const status=elem("span",badge.label,"tag "+badge.style);
  statusCell.append(status);
  const priceCell=elem("td",priceText(feed),feed.status==="connected"?"price":"muted");
  const act=document.createElement("td");
  const btn=elem("button","Details →","more");
  btn.type="button";btn.setAttribute("aria-label","View details for "+feed.name);
  btn.addEventListener("click",()=>openDetails(feed.id));
  act.append(btn);
  tr.append(nameCell,categoryCell,typeCell,quoteCell,statusCell,priceCell,act);
  return tr;
}
function renderTable(){
  const tbody=byId("feed-table");
  clear(tbody);
  if(!state.feeds.length){
    const tr=document.createElement("tr"),td=elem("td",null,"empty");
    td.colSpan=7;
    td.append(elem("strong","No instruments found"),
      elem("span","Try another search, asset class or connection status."));
    tr.append(td);tbody.append(tr);
  } else {
    for(const feed of state.feeds)tbody.append(row(feed));
  }
  const first=state.total?state.offset+1:0;
  const last=Math.min(state.offset+state.feeds.length,state.total);
  set("result-label","Showing "+first+"–"+last+" of "+state.total+" matching instruments");
  set("page-label",String(Math.floor(state.offset/state.limit)+1));
  byId("previous").disabled=state.offset===0;
  byId("next").disabled=state.offset+state.limit>=state.total;
}
async function loadFeeds(){
  const requestToken=++state.request;
  const url=new URL("/api/v1/explore/feeds",window.location.origin);
  for(const [key,value] of Object.entries({
    category:state.category,status:state.status,sort:state.sort,
    q:state.q,offset:state.offset,limit:state.limit
  }))url.searchParams.set(key,String(value));
  set("result-label","Loading instrument directory…");
  try{
    const result=await request(url);
    if(requestToken!==state.request)return;
    state.feeds=result.feeds;state.total=result.total;
    renderTable();
  }catch(error){
    if(requestToken!==state.request)return;
    clear(byId("feed-table"));
    const tr=elem("tr");const td=elem("td","Couldn't load directory: "+error.message,"empty");
    td.colSpan=7;tr.append(td);byId("feed-table").append(tr);
    set("result-label","Directory temporarily unavailable");
    byId("previous").disabled=true;byId("next").disabled=true;
  }
}
async function refreshQuotes(){
  try{
    const result=await request("/api/v1/explore/quotes");
    state.quotes=new Map(result.quotes.map(quote=>[quote.symbol,quote]));
    renderTable();
    if(state.detail?.status==="connected")updateDetail(state.detail);
    const reporting=result.quotes.filter(q=>Number.isFinite(q.price)).length;
    set("coverage-note",reporting+" of 3 integrated crypto pairs currently reporting. "+
      "All other catalog instruments require a licensed source. These are indicative spot prices, not executable orders.");
  }catch{
    state.quotes=new Map();
    renderTable();
    set("coverage-note","Live public source check unavailable. Directory definitions remain browsable; no prices are simulated.");
  }
}
function updateDetail(feed){
  state.detail=feed;
  set("detail-section",categoryName(feed.category)+" / "+feed.instrument);
  set("detail-name",feed.name);
  set("detail-symbol",feed.symbol);
  set("detail-asset",categoryName(feed.category));
  set("detail-quote",feed.quoteCurrency);
  set("detail-session",feed.session);
  set("detail-price",priceText(feed));
  set("detail-sources",feed.sources.length?feed.sources.join(", "):"Not connected");
  set("detail-id",feed.id);
  const badge=labelStatus(feed);
  const status=byId("detail-status");
  status.className="tag "+badge.style;
  status.textContent=badge.label;
  const quote=state.quotes.get(feed.symbol);
  const notice=feed.status==="connected"?
    quote && Number.isFinite(quote.price)?
      "Observed public exchange price. "+quote.sourceCount+
      " source(s); snapshot at "+quote.observedAt+
      ". Indicative only; not a guaranteed order price or decentralised oracle.":
      "Connector exists, but no verified live quote is currently available. No fallback values are fabricated.":
    "Discovery-only listing. Mushee does not currently publish a price for this instrument. A licensed market-data supplier and appropriate entitlements must be configured before release.";
  set("detail-notice",notice);
}
async function openDetails(id){
  try{
    const data=await request("/api/v1/explore/feed?id="+encodeURIComponent(id));
    updateDetail(data.feed);
    byId("feed-detail").showModal();
  }catch(error){
    set("coverage-note","Unable to open instrument details: "+error.message);
  }
}
async function boot(){
  try{
    const catalog=await request("/api/v1/explore/categories");
    state.categories=catalog.categories;
    const url=new URLSearchParams(window.location.search);
    state.category=categoryFromURL();
    state.q=(url.get("q")||"").slice(0,120);
    state.status=["all","connected","planned"].includes(url.get("status"))?url.get("status"):"all";
    state.sort=["name","symbol","category"].includes(url.get("sort"))?url.get("sort"):"name";
    byId("search").value=state.q;
    byId("status").value=state.status;
    byId("sort").value=state.sort;
    set("feed-count",catalog.feedCount);
    set("category-count",catalog.categories.length-1);
    set("connected-count",catalog.categories.find(x=>x.slug==="all")?.connectedCount||0);
    renderNav();
    await loadFeeds();
    refreshQuotes();
  }catch(error){
    set("section-desc","Unable to load directory metadata: "+error.message);
    set("result-label","Service unavailable");
  }
}
byId("search").addEventListener("input",e=>{
  clearTimeout(state.searchTimer);
  state.q=e.target.value.slice(0,120);
  state.offset=0;
  state.searchTimer=setTimeout(()=>{syncURL();loadFeeds();},180);
});
byId("status").addEventListener("change",e=>{
  state.status=e.target.value;state.offset=0;syncURL();loadFeeds();
});
byId("sort").addEventListener("change",e=>{
  state.sort=e.target.value;state.offset=0;syncURL();loadFeeds();
});
byId("reset").addEventListener("click",()=>{
  state.q="";state.status="all";state.sort="name";state.offset=0;
  byId("search").value="";byId("status").value="all";byId("sort").value="name";
  syncURL();loadFeeds();
});
byId("previous").addEventListener("click",()=>{
  state.offset=Math.max(0,state.offset-state.limit);loadFeeds();
});
byId("next").addEventListener("click",()=>{
  if(state.offset+state.limit<state.total){state.offset+=state.limit;loadFeeds();}
});
byId("close-detail").addEventListener("click",()=>byId("feed-detail").close());
byId("close-detail-bottom").addEventListener("click",()=>byId("feed-detail").close());
byId("copy-id").addEventListener("click",async()=>{
  if(!state.detail)return;
  try{
    await navigator.clipboard.writeText(state.detail.id);
    set("copy-id","Copied ✓");
    setTimeout(()=>set("copy-id","Copy feed ID"),1500);
  }catch{set("copy-id","Copy unavailable");}
});
window.addEventListener("popstate",()=>{
  state.category=categoryFromURL();state.offset=0;updateNav();loadFeeds();
});
boot();
setInterval(()=>{if(!document.hidden)refreshQuotes();},30000);
