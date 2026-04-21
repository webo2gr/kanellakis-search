var BASE=location.origin+'/api/proxy';
var basket=JSON.parse(localStorage.getItem('b')||'[]');
var timer=null;

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
  if(q&&q.trim()){
    Promise.allSettled([
      apiFetch('products',{'searchCriteria[filterGroups][0][filters][0][field]':'name','searchCriteria[filterGroups][0][filters][0][value]':'%'+q+'%','searchCriteria[filterGroups][0][filters][0][conditionType]':'like','searchCriteria[pageSize]':'30'}),
      apiFetch('products',{'searchCriteria[filterGroups][0][filters][0][field]':'sku','searchCriteria[filterGroups][0][filters][0][value]':'%'+q+'%','searchCriteria[filterGroups][0][filters][0][conditionType]':'like','searchCriteria[pageSize]':'10'})
    ]).then(function(res){
      var seen=new Set(),prods=[];
      res.forEach(function(r){if(r.status==='fulfilled'&&r.value.items){r.value.items.forEach(function(p){if(!seen.has(p.id)){seen.add(p.id);prods.push(p);}});}});
      getStock(prods,function(){
        renderCards(prods);
        setStatus('ok',prods.length+' results');
        document.getElementById('ri').style.display=prods.length?'block':'none';
        document.getElementById('ri').textContent=prods.length+' results for: '+q;
        if(!prods.length)document.getElementById('sv').innerHTML='<div class="sv">No results</div>';
        else document.getElementById('sv').innerHTML='';
      });
    });
  } else {
    apiFetch('products',{'searchCriteria[pageSize]':'40','searchCriteria[sortOrders][0][field]':'updated_at','searchCriteria[sortOrders][0][direction]':'DESC'}).then(function(data){
      var prods=data.items||[];
      getStock(prods,function(){
        renderCards(prods);
        setStatus('ok','Connected - '+(data.total_count||0)+' products');
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
  timer=setTimeout(function(){load(e.target.value);},500);
});

updateFab();
load();
