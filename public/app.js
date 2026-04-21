var APIBASE='https://kanellakis-search-6bgfmfn6b-webo2grs-projects.vercel.app/api/proxy';
var basket=JSON.parse(localStorage.getItem('b')||'[]');
var timer=null;

function apiGet(ep,params){
  var u=new URL(APIBASE);
  u.searchParams.set('endpoint',ep);
  if(params){Object.keys(params).forEach(function(k){u.searchParams.set(k,params[k]);});}
  return fetch(u.toString()).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});
}

function ss(c,t){document.getElementById('sd').className='d '+c;document.getElementById('st').textContent=t;}

function load(q){
  ss('spin','Φορτωση...');
  var sv=document.getElementById('sv');
  sv.innerHTML='<div class="sv"><div class="sp"></div><div>Φορτωση...</div></div>';
  document.getElementById('pg').innerHTML='';
  if(q&&q.trim()){
    Promise.allSettled([
      apiGet('products',{'searchCriteria[filterGroups][0][filters][0][field]':'name','searchCriteria[filterGroups][0][filters][0][value]':'%'+q+'%','searchCriteria[filterGroups][0][filters][0][conditionType]':'like','searchCriteria[pageSize]':'30'}),
      apiGet('products',{'searchCriteria[filterGroups][0][filters][0][field]':'sku','searchCriteria[filterGroups][0][filters][0][value]':'%'+q+'%','searchCriteria[filterGroups][0][filters][0][conditionType]':'like','searchCriteria[pageSize]':'10'})
    ]).then(function(res){
      var seen=new Set(),prods=[];
      res.forEach(function(r){if(r.status==='fulfilled'&&r.value.items){r.value.items.forEach(function(p){if(!seen.has(p.id)){seen.add(p.id);prods.push(p);}});}});
      loadStock(prods,function(){
        render(prods);
        ss('ok',prods.length+' apot.');
        var ri=document.getElementById('ri');ri.style.display=prods.length?'block':'none';ri.textContent=prods.length+' apotelesm. gia: '+q;
        sv.innerHTML=prods.length?'':'<div class="sv"><div style="font-size:36px">404</div><div>Den vrethikan</div></div>';
      });
    });
  } else {
    apiGet('products',{'searchCriteria[pageSize]':'40','searchCriteria[sortOrders][0][field]':'updated_at','searchCriteria[sortOrders][0][direction]':'DESC'}).then(function(data){
      var prods=data.items||[];
      loadStock(prods,function(){
        render(prods);
        ss('ok','Syndedemeno - '+(data.total_count||0)+' proionta');
        document.getElementById('ri').style.display='none';
        sv.innerHTML='';
      });
    }).catch(function(e){ss('err','Sfalma: '+e.message);sv.innerHTML='<div class="sv"><div style="font-size:36px">Error</div><br><button class="abtn" onclick="load()">Retry</button></div>';});
  }
}

function loadStock(prods,cb){
  var done=0,total=Math.min(prods.length,30);
  if(total===0){cb();return;}
  prods.slice(0,30).forEach(function(p){
    apiGet('stockItems/'+encodeURIComponent(p.sku)).then(function(s){p._q=s.qty;p._s=s.is_in_stock;}).catch(function(){p._q=null;p._s=null;}).finally(function(){done++;if(done>=total)cb();});
  });
}

function si(p){
  if(p._q==null)return p._s===false?{c:'out',l:'Ektos'}:{c:'in',l:'Diath.'};
  if(p._q<=0)return{c:'out',l:'Ektos'};
  if(p._q<5)return{c:'low',l:p._q+' tem.'};
  return{c:'in',l:Math.floor(p._q)+' tem.'};
}

function render(prods){
  var g=document.getElementById('pg');g.innerHTML='';
  prods.forEach(function(p){
    var inB=basket.find(function(b){return b.sku===p.sku;}),s=si(p),c=document.createElement('div');
    c.className='card'+(inB?' added':'');c.dataset.sku=p.sku;
    c.innerHTML='<div class="sku">'+p.sku+'</div><div class="name">'+p.name+'</div><div class="cf"><span class="badge '+s.c+'">'+s.l+'</span><button class="abtn'+(inB?' added':'')+'" data-sku="'+p.sku+'">'+(inB?'OK':'+ Lista')+'</button></div>';
    c.querySelector('.abtn').addEventListener('click',function(e){e.stopPropagation();tog(p.sku,p.name);});
    g.appendChild(c);
  });
}

function tog(sku,name){
  var i=basket.findIndex(function(b){return b.sku===sku;});
  if(i>=0){basket.splice(i,1);}else{basket.push({sku:sku,name:name,qty:1});}
  saveBs();updateFab();
  var c=document.querySelector('.card[data-sku="'+sku+'"]');
  if(c){var inB=basket.find(function(b){return b.sku===sku;});c.classList.toggle('added',!!inB);var btn=c.querySelector('.abtn');btn.className='abtn'+(inB?' added':'');btn.textContent=inB?'OK':'+ Lista';}
}

function saveBs(){localStorage.setItem('b',JSON.stringify(basket));}
function updateFab(){var f=document.getElementById('fab');f.classList.toggle('hidden',basket.length===0);document.getElementById('bcount').textContent=basket.length;}
function openB(){rBask();document.getElementById('panel').classList.add('open');}
function closeB(){document.getElementById('panel').classList.remove('open');}
function rBask(){
  var e=document.getElementById('pi');
  if(!basket.length){e.innerHTML='<div class="sv" style="padding:30px">Adeia lista</div>';return;}
  e.innerHTML=basket.map(function(item,i){return '<div class="pitem"><div class="pn"><div>'+item.name+'</div><div class="ps">'+item.sku+'</div></div><div class="qc"><button class="qb" onclick="cq('+i+',-1)">-</button><span class="qn">'+item.qty+'</span><button class="qb" onclick="cq('+i+',1)">+</button></div><button class="rb" onclick="ritem('+i+')">x</button></div>';}).join('');
}
function cq(i,d){basket[i].qty=Math.max(1,basket[i].qty+d);saveBs();rBask();}
function ritem(i){var sku=basket[i].sku;basket.splice(i,1);saveBs();updateFab();rBask();var c=document.querySelector('.card[data-sku="'+sku+'"]');if(c){c.classList.remove('added');c.querySelector('.abtn').textContent='+ Lista';}}
function copyL(){navigator.clipboard.writeText(basket.map(function(i){return i.qty+'x '+i.sku+' - '+i.name;}).join('\n')).then(function(){alert('Copied!');});}
function sendWA(){window.open('https://wa.me/?text='+encodeURIComponent('Paragelia Kanellakis\n'+basket.map(function(i){return i.qty+'x '+i.sku+' - '+i.name;}).join('\n')));}

document.addEventListener('DOMContentLoaded',function(){
  document.getElementById('si').addEventListener('input',function(e){clearTimeout(timer);timer=setTimeout(function(){load(e.target.value);},500);});
  updateFab();
  load();
});
