var BASE=location.origin+'/api/proxy';
var basket=JSON.parse(localStorage.getItem('b')||'[]');
var timer=null;
var cachedProducts=[];

// Greeklish -> Greek map (digraphs first)
var GR_MAP=[
  ['mp','\u03bc\u03c0'],['nt','\u03bd\u03c4'],['gk','\u03b3\u03ba'],
  ['ts','\u03c4\u03c3'],['tz','\u03c4\u03b6'],['th','\u03b8'],
  ['ps','\u03c8'],['ks','\u03be'],['ch','\u03c7'],['ou','\u03bf\u03c5'],
  ['oi','\u03bf\u03b9'],['ei','\u03b5\u03b9'],['ai','\u03b1\u03b9'],
  ['au','\u03b1\u03c5'],['eu','\u03b5\u03c5'],
  ['a','\u03b1'],['b','\u03b2'],['g','\u03b3'],['d','\u03b4'],
  ['e','\u03b5'],['z','\u03b6'],['h','\u03b7'],['u','\u03c5'],
  ['i','\u03b9'],['k','\u03ba'],['l','\u03bb'],['m','\u03bc'],
  ['n','\u03bd'],['x','\u03be'],['o','\u03bf'],['p','\u03c0'],
  ['r','\u03c1'],['s','\u03c3'],['t','\u03c4'],['w','\u03c9'],
  ['f','\u03c6'],['v','\u03b2'],['c','\u03c7'],['y','\u03c5'],
  ['q','\u03b8'],['j','\u03b6']
];

function toGreek(str){
  var s=str.toLowerCase();
  var res='';
  var i=0;
  while(i<s.length){
    var found=false;
    for(var g=0;g<GR_MAP.length;g++){
      var gl=GR_MAP[g][0];
      if(s.substr(i,gl.length)===gl){
        res+=GR_MAP[g][1];
        i+=gl.length;
        found=true;
        break;
      }
    }
    if(!found){res+=s[i];i++;}
  }
  return res;
}

function removeAccents(s){
  if(!s)return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

// Score how well a product matches the query (higher = better)
function scoreMatch(p, q){
  if(!q||!q.trim())return 1;
  var name=removeAccents(p.name||'');
  var sku=(p.sku||'').toLowerCase();
  var qClean=removeAccents(q.trim());
  var qGreek=removeAccents(toGreek(q.trim()));
  
  var score=0;
  var words=qClean.split(/\s+/).filter(function(w){return w.length>0;});
  var gwords=qGreek.split(/\s+/).filter(function(w){return w.length>0;});
  
  // SKU exact match = highest priority
  if(sku===qClean||sku===q.trim().toLowerCase())return 1000;
  if(sku.indexOf(qClean)===0||sku.indexOf(q.trim().toLowerCase())===0)return 900;
  
  // All words must be present (AND logic - not fuzzy)
  var allInName=words.every(function(w){return name.indexOf(w)>=0;});
  var allInNameG=gwords.every(function(w){return name.indexOf(w)>=0;});
  var allInSku=words.every(function(w){return sku.indexOf(w)>=0;});
  
  if(!allInName&&!allInNameG&&!allInSku)return 0; // NO MATCH
  
  // Count matching words for score
  words.forEach(function(w){
    if(name.indexOf(w)>=0)score+=10;
    if(sku.indexOf(w)>=0)score+=15;
    // Bonus for word at start
    if(name.indexOf(' '+w)>=0||name.indexOf(w)===0)score+=5;
  });
  gwords.forEach(function(w){
    if(name.indexOf(w)>=0)score+=10;
  });
  
  // Bonus: query appears as continuous phrase
  if(name.indexOf(qClean)>=0)score+=50;
  if(name.indexOf(qGreek)>=0)score+=50;
  if(sku.indexOf(qClean)>=0)score+=30;
  
  return score;
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
  document.getElementById('ri').style.display='none';

  if(q&&q.trim()){
    // Search from cache (instant, with strict AND scoring)
    if(cachedProducts.length>0){
      var q2=q.trim();
      var scored=[];
      for(var i=0;i<cachedProducts.length;i++){
        var s=scoreMatch(cachedProducts[i],q2);
        if(s>0)scored.push({p:cachedProducts[i],s:s});
      }
      scored.sort(function(a,b){return b.s-a.s;});
      var results=scored.map(function(x){return x.p;});
      
      getStock(results.slice(0,30),function(){
        renderCards(results);
        setStatus('ok',results.length+' results');
        document.getElementById('ri').style.display=results.length?'block':'none';
        document.getElementById('ri').textContent=results.length+' results for: '+q2;
        if(!results.length)document.getElementById('sv').innerHTML='<div class="sv">No results for: '+q2+'</div>';
        else document.getElementById('sv').innerHTML='';
      });
      return;
    }
    // No cache yet - fetch from API
    var qGreek=toGreek(q.trim());
    var searches=[
      apiFetch('products',{'searchCriteria[filterGroups][0][filters][0][field]':'name','searchCriteria[filterGroups][0][filters][0][value]':'%'+q+'%','searchCriteria[filterGroups][0][filters][0][conditionType]':'like','searchCriteria[pageSize]':'50'}),
      apiFetch('products',{'searchCriteria[filterGroups][0][filters][0][field]':'sku','searchCriteria[filterGroups][0][filters][0][value]':'%'+q+'%','searchCriteria[filterGroups][0][filters][0][conditionType]':'like','searchCriteria[pageSize]':'20'})
    ];
    if(qGreek!==q.toLowerCase()){
      searches.push(apiFetch('products',{'searchCriteria[filterGroups][0][filters][0][field]':'name','searchCriteria[filterGroups][0][filters][0][value]':'%'+qGreek+'%','searchCriteria[filterGroups][0][filters][0][conditionType]':'like','searchCriteria[pageSize]':'30'}));
    }
    Promise.allSettled(searches).then(function(res){
      var seen=new Set(),prods=[];
      res.forEach(function(r){if(r.status==='fulfilled'&&r.value.items){r.value.items.forEach(function(p){if(!seen.has(p.id)){seen.add(p.id);prods.push(p);}});}});
      getStock(prods.slice(0,30),function(){
        renderCards(prods);
        setStatus('ok',prods.length+' results');
        document.getElementById('ri').style.display=prods.length?'block':'none';
        document.getElementById('ri').textContent=prods.length+' results for: '+q;
        if(!prods.length)document.getElementById('sv').innerHTML='<div class="sv">No results</div>';
        else document.getElementById('sv').innerHTML='';
      });
    });
  } else {
    // Load all and cache
    apiFetch('products',{'searchCriteria[pageSize]':'200','searchCriteria[sortOrders][0][field]':'name','searchCriteria[sortOrders][0][direction]':'ASC'}).then(function(data){
      var prods=data.items||[];
      cachedProducts=prods;
      var total=data.total_count||0;
      // Load more pages if needed
      if(total>200){
        var pages=Math.ceil(total/200);
        var fetches=[];
        for(var pg=2;pg<=Math.min(pages,15);pg++){
          fetches.push(apiFetch('products',{'searchCriteria[pageSize]':'200','searchCriteria[currentPage]':pg,'searchCriteria[sortOrders][0][field]':'name','searchCriteria[sortOrders][0][direction]':'ASC'}));
        }
        Promise.allSettled(fetches).then(function(res){
          res.forEach(function(r){if(r.status==='fulfilled'&&r.value.items){cachedProducts=cachedProducts.concat(r.value.items);}});
          setStatus('ok','Ready - '+cachedProducts.length+' products cached');
        });
      }
      getStock(prods.slice(0,40),function(){
        renderCards(prods.slice(0,40));
        setStatus('ok','Ready - '+total+' products');
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
    if(p._q!==undefined){done++;if(done>=total)cb();return;}
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
  timer=setTimeout(function(){load(q);},350);
});

updateFab();
load();
