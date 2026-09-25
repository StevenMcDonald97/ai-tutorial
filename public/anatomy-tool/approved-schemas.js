const sheets=await fetch('./approved-schemas.json?v=9').then(r=>{if(!r.ok)throw Error('Drawing collection unavailable');return r.json()});
const groups={head:['head'],eye:['eye'],nose:['nose'],mouth:['mouth'],ear:['ear'],neck:['head','chest','back'],chest:['chest','torso'],back:['back','torso'],pelvis:['torso','chest','back'],shoulder:['arm','chest','back'],upperarm:['arm'],elbow:['arm'],forearm:['arm'],hand:['hand-structure','hand-form','fingers'],thigh:['leg'],calf:['leg'],knee:['knee-structure','knee-form'],foot:['foot-structure','foot-form']};
const names={head:'Head',eye:'Eye',nose:'Nose',mouth:'Mouth & chin',ear:'Ear',neck:'Neck in context',chest:'Front torso',back:'Back torso',pelvis:'Pelvis in context',shoulder:'Shoulder in context',upperarm:'Upper arm',elbow:'Elbow in context',forearm:'Forearm',hand:'Hand & fingers',thigh:'Leg',calf:'Lower leg',knee:'Knee',foot:'Foot'};
const dialog=document.createElement('dialog');dialog.className='schema-dialog';dialog.setAttribute('aria-label','Drawing schema viewer');
dialog.innerHTML='<div class="schema-tools"><label>DRAWING SCHEMA <select aria-label="Choose drawing sheet"></select></label><button type="button" class="schema-zoom">Actual size</button><a class="schema-original" target="_blank" rel="noopener">Open original ↗</a><button type="button" class="schema-close" aria-label="Close drawing">×</button></div><div class="schema-scroll"><img alt=""></div>';
document.body.append(dialog);
const select=dialog.querySelector('select'),large=dialog.querySelector('img'),scroll=dialog.querySelector('.schema-scroll'),zoom=dialog.querySelector('.schema-zoom');
for(const s of sheets)select.add(new Option(s.title,s.id));
function showSheet(id){const s=sheets.find(x=>x.id===id);if(!s)return;select.value=id;large.src=s.src;large.alt=s.title+' — approved drawing sheet';dialog.querySelector('a').href=s.src;scroll.classList.remove('actual');zoom.textContent='Actual size';zoom.setAttribute('aria-pressed','false');scroll.scrollTo(0,0);}
function openSheet(id){showSheet(id);if(!dialog.open)dialog.showModal();}
select.onchange=()=>showSheet(select.value);dialog.querySelector('.schema-close').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});zoom.onclick=()=>{const on=scroll.classList.toggle('actual');zoom.textContent=on?'Fit sheet':'Actual size';zoom.setAttribute('aria-pressed',String(on));};
large.onerror=()=>{large.alt='This sheet could not load. Close and reopen to retry.'};
const collection=document.querySelector('.headernote');collection.onclick=e=>{e.preventDefault();openSheet(sheets[0].id)};
if(new URLSearchParams(location.search).get('schemas')==='all')openSheet(sheets[0].id);
export function renderApprovedSchemas(region){
 const ids=groups[region];if(!ids)return false;
 document.querySelector('#angles').hidden=true;
 document.querySelector('#regionTitle').textContent=names[region];
 document.querySelector('#intro').textContent='Study the approved graphite drawings. Open a sheet to compare its views and enlarge the construction lines.';
 document.querySelector('#exercise').textContent='Block in the largest masses first. Match the directions and proportions before adding smaller planes and shading.';
 document.querySelector('.lessonfoot').textContent='Fixed drawing references. Orbiting or posing the figure does not alter these sheets.';
 const cards=document.querySelector('#cards');cards.replaceChildren();
 for(const id of ids){const s=sheets.find(x=>x.id===id);const card=document.createElement('article');card.className='card schema-card';const h=document.createElement('h3');h.textContent=s.title;const b=document.createElement('button');b.type='button';b.className='schema-thumbnail';b.setAttribute('aria-label','Enlarge '+s.title);const img=document.createElement('img');img.src=s.src;img.alt=s.title;img.loading='lazy';img.width=1536;img.height=1024;const caption=document.createElement('span');caption.textContent='Open full sheet ↗';b.append(img,caption);b.onclick=()=>openSheet(id);card.append(h,b);cards.append(card)}
 return true;
}
