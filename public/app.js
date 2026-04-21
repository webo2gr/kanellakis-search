var BASE=location.origin+'/api/proxy';
var basket=JSON.parse(localStorage.getItem('b')||'[]');
var timer=null;
var cachedProducts=[];

// Greeklish to Greek map
var GL={
  'a':'alpha','b':'beta','g':'gamma','d':'delta','e':'epsilon',
  'z':'zeta','h':'eta','th':'theta','i':'iota','k':'kappa',
  'l':'lambda','m':'mu','n':'nu','x':'xi','o':'omicron',
  'p':'pi','r':'rho','s':'sigma','t':'tau','u':'upsilon',
  'f':'phi','c':'chi','ps':'psi','w':'omega','v':'beta',
  'q':'theta','y':'upsilon','j':'xi'
};

var greeklishMap={
  'a':'\u03b1','b':'\u03b2','g':'\u03b3','d':'\u03b4','e':'\u03b5',
  'z':'\u03b6','h':'\u03b7','u':'\u03c5','i':'\u03b9','k':'\u03ba',
  'l':'\u03bb','m':'\u03bc','n':'\u03bd','x':'\u03be','o':'\u03bf',
  'p':'\u03c0','r':'\u03c1','s':'\u03c3','t':'\u03c4','w':'\u03c9',
  'f':'\u03c6','v':'\u03b2','c':'\u03c7','y':'\u03c5','q':'\u03b8',
  'j':'\u03b6','th':'\u03b8','ps':'\u03c8','ks':'\u03be','ch':'\u03c7',
  'ou':'\u03bf\u03c5','oi':'\u03bf\u03b9','ei':'\u03b5\u03b9',
  'ai':'\u03b1\u03b9','au':'\u03b1\u03c5','eu':'\u03b5\u03c5'
};

function toGreek(str){
  str=str.toLowerCase();
  var result='';
  var i=0;
  while(i<str.length){
    // Try 2-char combos first
    var two=str.substr(i,2);
    if(greeklishMap[two]){result+=greeklishMap[two];i+=2;}
    else if(greeklishMap[str[i]]){result+=greeklishMap[str[i]];i++;}
    else{result+=str[i];i++;}
  }
  return result;
}

function normalize(s){
  if(!s)return '';
  // Remove Greek accents
  return s.toLowerCase()
    .replace(/[\u0301\u0300\u0308\u0313\u0314\u0345\u0342]/g,'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .normalize('NFC');
}

function matches(product,query){
  var q=query.toLowerCase().trim();
  if(!q)return true;
  
  var name=normalize(product.name||'');
  var sku=(product.sku||'').toLowerCase();
  var qNorm=normalize(q);
  var qGreek=normalize(toGreek(q));
  
  // Direct match
  if(name.indexOf(qNorm)>=0||sku.indexOf(qNorm)>=0)return true;
  // Greeklish match
  if(qGreek&&qGreek!==qNorm&&(name.indexOf(qGreek)>=0||sku.indexOf(qGreek)>=0))return true;
  // Fuzzy: all words must appear
  var words=qNorm.split(/\s+/).filter(function(w){return w.length>1;});
  var greekWords=qGreek.split(/\s+/).filter(function(w){return w.length>1;});
  if(words.length>1){
    if(words.every(function(w){return name.indexOf(w)>=0||sku.indexOf(w)>=0;}))return true;
    if(greekWords.every(function(w){return name.indexOf(w)>=0||sku.indexOf(w)>=0;}))return true;
  }
  // Fuzzy typo tolerance: check if query chars are mostly present
  if(q.length>=4){
    var target=name+' '+sku;
    var hits=0;
    for(var ci=0;ci<qNorm.length;ci++){if(target.indexOf(qNorm[ci])>=0)hits++;}
    if(hits/qNorm.length>=0.8)return true;
  }
  return false;
}

function apiFetch(ep,params){
  var u=new URL(BASE);
  u.searchParams.set('endpoint',ep);
  if(params){Object.keys(params).forEach(function(k){u.searchParams.set(k,params[k]);});}
  return fetch(u.toString()).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});
}

function setStatus(cls,txt){
  document.getElementById('sd').className='d '+cls;
  document.getElementById('st').textContent=txt;
}

function load(q){
  setStatus('spin','Loading...');
  document.getElementById('sv').innerHTML='<div class="sv"><div class="sp"></div><div>Loading...</div></div>';
  document.getElementById('pg').innerHTML='';
  
  // If we have cached products, filter locally first (instant!)
  if(cachedProducts.length>0&&q&&q.trim()){
    var filtered=cachedProducts.filter(function(p){return matches(p,q);});
    renderCards(filtered);
    setStatus('ok',filtered.length+' results');
    document.getElementById('ri').style.display=filtered.length?'block':'none';
    document.getElementById('ri').textContent=filtered.length+' results for: '+q;
    if(!filtered.length)document.getElementById('sv').innerHTML='<div class="sv">No results for: '+q+'</div>';
    else document.getElementById('sv').innerHTML='';
    return;
  }

  if(q&&q.trim()){
    var qGreek=toGreek(q);
    var searches=[
      apiFetch('products',{'searchCriteria[filterGroups][0][filters][0][field]':'name','searchCriteria[filterGroups][0][filters][0][value]':'%'+q+'%','searchCriteria[filterGroups][0][filters][0][conditionType]':'like','searchCriteria[pageSize]':'30'}),
      apiFetch('products',{'searchCriteria[filterGroups][0][filters][0][field]':'sku','searchCriteria[filterGroups][0][filters][0][value]':'%'+q+'%','searchCriteria[filterGroups][0][filters][0][conditionType]':'like','searchCriteria[pageSize]':'10'})
    ];
    if(qGreek!==q){
      searches.push(apiFetch('products',{'searchCriteria[filterGroups][0][filters][0][field]':'name','searchCriteria[filterGroups][0][filters][0][value]':'%'+qGreek+'%','searchCriteria[filterGroups][0][filters][0][conditionType]':'like','searchCriteria[pageSize]':'20'}));
    }
    Promise.allSettled(searches).then(function(res){
      var seen=new Set(),prods=[];
      res.forEach(function(r){if(r.status==='fulfilled'&&r.value.items){r.value.items.forEach(function(p){if(!seen.has(p.id)){seen.add(p.id);prods.push(p);}});}});
      // Also filter from cache if available
      getStock(prods,function(){
        renderCards(prods);
        setStatus('ok',prods.length+' results');
        document.getElementById('ri').style.display=prods.length?'block':'none';
        document.getElementById('ri').textContent=prods.length+' results for: '+q+(qGreek!==q?' ('+qGreek+')':'');
        if(!prods.length)document.getElementById('sv').innerHTML='<div class="sv">No results</div>';
        else document.getElementById('sv').innerHTML='';
      });
    });
  } else {
    // Load all products and cache them
    apiFetch('products',{'searchCriteria[pageSize]':'200','searchCriteria[sortOrders][0][field]':'name','searchCriteria[sortOrders][0][direction]':'ASC'}).then(function(data){
      var prods=data.items||[];
      cachedProducts=prods;
      getStock(prods.slice(0,40),function(){
        renderCards(prods.slice(0,40));
        setStatus('ok','Ready - '+(data.total_count||0)+' products cached');
        document.getElementById('ri').style.display='none';
        document.getElementById('sv').innerHTML='';
      });
    }).catch(function(e){
      setStatus('err','Error: '+e.message);
      document.getElementById('sv').innerHTML='<div class="sv">Error<br><button class="abtn" onclick="load()">Retry</button></div>';
    });
  }
}

function getStock(prods,cb){
  var done=0,total=Math.min(prods.length,30);
  if(!total){cb();return;}
  prods.slice(0,30).forEach(function(p){
    apiFetch('stockItems/'+encodeURIComponent(p.sku))
      .then(function(s){p._q=s.qty;p._s=s.is_in_stock;})
      .catch(function(){p._q=null;p._s=null;})
      .then(function(){done++;if(done>=total)cb();});
  });
}

function stockBadge(p){
  if(p._q==null)return p._s===false?{c:'out',l:'Out of stock'}:{c:'in',l:'Available'};
  if(p._q<=0)return{c:'out',l:'Out of stock'};
  if(p._q<5)return{c:'low',l:p._q+' pcs'};
  return{c:'in',l:Math.floor(p._q)+' pcs'};
}

function renderCards(prods){
  var g=document.getElementById('pg');
  g.innerHTML='';
  prods.forEach(function(p){
    var inB=basket.find(function(b){return b.sku===p.sku;}),s=stockBadge(p);
    var c=document.createElement('div');
    c.className='card'+(inB?' added':'');
    c.dataset.sku=p.sku;
    c.innerHTML='<div class="sku">'+p.sku+'</div>'
      +'<div class="name">'+p.name+'</div>'
      +'<div class="cf">'
      +'<span class="badge '+s.c+'">'+s.l+'</span>'
      +'<button class="abtn'+(inB?' added':'')+'">'+(inB?'In list':'+ List')+'</button>'
      +'</div>';
    c.querySelector('.abtn').addEventListener('click',function(e){e.stopPropagation();toggleItem(p.sku,p.name);});
    g.appendChild(c);
  });
}

function toggleItem(sku,name){
  var i=basket.findIndex(function(b){return b.sku===sku;});
  if(i>=0)basket.splice(i,1);else basket.push({sku:sku,name:name,qty:1});
  saveBasket();updateFab();
  var c=document.querySelector('.card[data-sku="'+sku+'"]');
  if(c){var inB=basket.find(function(b){return b.sku===sku;});c.classList.toggle('added',!!inB);var btn=c.querySelector('.abtn');btn.className='abtn'+(inB?' added':'');btn.textContent=inB?'In list':'+ List';}
}

function saveBasket(){localStorage.setItem('b',JSON.stringify(basket));}
function updateFab(){var f=document.getElementById('fab');f.classList.toggle('hidden',basket.length===0);document.getElementById('bcount').textContent=basket.length;}
function openB(){renderBasket();document.getElementById('panel').classList.add('open');}
function closeB(){document.getElementById('panel').classList.remove('open');}

function renderBasket(){
  var e=document.getElementById('pi');
  if(!basket.length){e.innerHTML='<div class="sv" style="padding:30px">List is empty</div>';return;}
  e.innerHTML=basket.map(function(item,i){
    return '<div class="pitem">'
      +'<div class="pn"><div>'+item.name+'</div><div class="ps">'+item.sku+'</div></div>'
      +'<div class="qc"><button class="qb" onclick="changeQty('+i+',-1)">-</button>'
      +'<span class="qn">'+item.qty+'</span>'
      +'<button class="qb" onclick="changeQty('+i+',1)">+</button></div>'
      +'<button class="rb" onclick="removeItem('+i+')">x</button>'
      +'</div>';
  }).join('');
}

function changeQty(i,d){basket[i].qty=Math.max(1,basket[i].qty+d);saveBasket();renderBasket();}

function removeItem(i){
  var sku=basket[i].sku;basket.splice(i,1);saveBasket();updateFab();renderBasket();
  var c=document.querySelector('.card[data-sku="'+sku+'"]');
  if(c){c.classList.remove('added');c.querySelector('.abtn').textContent='+ List';}
}

function copyList(){
  navigator.clipboard.writeText(basket.map(function(i){return i.qty+'x '+i.sku+' - '+i.name;}).join('\n'))
    .then(function(){alert('Copied!');});
}

function sendWA(){
  window.open('https://wa.me/?text='+encodeURIComponent('Order\n'+basket.map(function(i){return i.qty+'x '+i.sku+' - '+i.name;}).join('\n')));
}

document.getElementById('si').addEventListener('input',function(e){
  clearTimeout(timer);
  var q=e.target.value;
  if(q.length===0){timer=setTimeout(function(){load('');},300);return;}
  timer=setTimeout(function(){load(q);},400);
});

updateFab();
load();
