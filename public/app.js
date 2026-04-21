var APIBASE='/api/proxy';
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
