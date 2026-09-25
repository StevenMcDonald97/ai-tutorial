import * as T from './three.module.js';
import {CONSTRUCTION_PARTS} from './construction-data.js?v=13';
import {createFigure} from './model.js?v=13';
let manifest, buffers={}, loading;
export async function loadAnatomy(progress=()=>{}){
 if(loading)return loading;
 loading=(async()=>{const r=await fetch('./anatomy/manifest.json');if(!r.ok)throw Error('Anatomy manifest unavailable');manifest=await r.json();let done=0;await Promise.all(manifest.files.map(async f=>{const r=await fetch('./anatomy/'+f.file);if(!r.ok)throw Error('Anatomy mesh unavailable');const data=await r.arrayBuffer();const raw=new Uint8Array(data);buffers[f.file]=raw[0]===31&&raw[1]===139?await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():data;if(buffers[f.file].byteLength!==f.bytes)throw Error('Incomplete anatomy mesh');progress(++done,manifest.files.length)}));return manifest;})();
 try{return await loading}catch(e){loading=null;throw e}
}
export function setAnatomyData(m,b){manifest=m;buffers=b;} // Offline validation uses the same importer.
const center=p=>new T.Vector3().fromArray(p.min).add(new T.Vector3().fromArray(p.max)).multiplyScalar(.5);
function regionOf(p){if(p.region)return p.region;const n=p.name.toLowerCase(),c=center(p);
 if(/(?:flexor|extensor)_hallucis_longus|digitorum_longus|calcaneal_tendon|fibularis|septum_of_leg/.test(n))return 'calf';
 if(/(?:flexor|extensor|abductor)_pollicis_longus|extensor_pollicis_brevis|extensor_indicis|extensor_digiti_minimi|palmaris_longus|anconeus/.test(n))return 'forearm';
 if(/iliotibial|femoral_intermuscular|adductor_minimus/.test(n))return 'thigh';
 if(/septum_of_arm/.test(n))return 'upperarm';
 if(/teres_major/.test(n))return 'shoulder';
 if(/phalanx|metacarp|carpal|pollic|of_hand|lumbrical.*hand|interosse.*hand/.test(n))return /foot|metatars/.test(n)?'foot':'hand';
 if(/halluci|digitorum_brevis|of_foot|metatars|tarsal|talus|calcane|cuneiform|cuboid|navicular/.test(n))return 'foot';
 if(/patella|menisc/.test(n))return 'knee';
 if(/nasal|nasalis/.test(n))return 'nose';if(/oculi|palpebr|rectus.*eye/.test(n))return 'eye';if(/(?:^|_)oris|labii|mentalis/.test(n))return 'mouth';if(/auricul/.test(n))return 'ear';
 if(c.y>4.9)return 'head';
 if(/sternocleido|scalen|hyoid|longus_colli|platysma|capitis|vertebra_c|atlas_|axis_/.test(n))return 'neck';
 if(/deltoid|clavicle|supraspinat|infraspinat|subscapular|teres_minor/.test(n))return 'shoulder';
 if(/humerus|brachii|brachialis|coracobrachialis/.test(n))return 'upperarm';
 if(/radius[lr]$|ulna[lr]$|carpi|pronator|supinator|brachioradialis|extensor_digitorum|flexor_digitorum_(superficialis|profundus)/.test(n))return 'forearm';
 if(/femur|femoris|vastus|sartorius|gracilis|adductor_(longus|magnus|brevis)|semitend|semimembran/.test(n))return 'thigh';
 if(/tibia|fibula|gastrocnem|soleus|plantaris|popliteus|digitorum_longus/.test(n))return 'calf';
 if(/glute|hip_bone|sacrum|coccyx|iliacus|obturator|piriform|pectineus|perine|pubococcy|iliococcy/.test(n))return 'pelvis';
 if(/latissimus|trapezius|rhomboid|scapula|spinal|vertebra|serratus_posterior|longissimus|iliocostalis/.test(n))return 'back';
 if(/pector|rib[lr]$|sternum|costal|abdom|oblique|serratus_anterior|diaphragm/.test(n))return 'chest';
 if(c.y<.8)return 'foot';if(c.y<1.8)return 'calf';if(c.y<3.05&&Math.abs(c.x)<.55)return 'thigh';if(Math.abs(c.x)>.62&&c.y<3.05)return 'hand';if(Math.abs(c.x)>.52&&c.y<3.8)return 'forearm';if(c.y<3.5)return 'pelvis';if(c.y>4.6)return 'neck';return c.z<0?'back':'chest';
}
function sideOf(p){return center(p).x>=0?'left':'right'}
function digitJoint(p){const n=p.name.toLowerCase();if(!n.includes('of_hand'))return null;const digit=['first','second','third','fourth','fifth'].findIndex(x=>n.includes(x+'_finger'));if(digit<0)return null;const segment=n.startsWith('proximal')?'MCP':n.startsWith('middle')?'PIP':'DIP';return sideOf(p)+['Thumb','Index','Middle','Ring','Little'][digit]+(digit===0?(segment==='DIP'?'IP':'MCP'):segment);}
function rigidJoint(p){const n=p.name.toLowerCase(),side=sideOf(p),region=regionOf(p);if(p.type==='muscle')return null;
 const finger=digitJoint(p);if(finger)return finger;
 if(/first_metacarpal/.test(n))return side+'ThumbCMC';
 if(/scapula|clavicle/.test(n))return side+'Girdle';
 if(region==='head'||['eye','nose','mouth','ear','neck'].includes(region))return 'neck';
 if(region==='hand')return side+'Wrist';if(region==='foot')return side+'Ankle';if(region==='calf'||region==='knee')return side+'Knee';if(region==='thigh')return side+'Hip';if(region==='forearm'||region==='elbow')return side+'Elbow';if(region==='upperarm'||region==='shoulder')return side+'Shoulder';if(region==='pelvis')return 'root';return 'torso';
}
export function createDetailedFigure(sex,layer){
 if(sex!=='male')throw Error('The Z-Anatomy atlas is male. Female-derived anatomy must use its own source.');
 if(!manifest)throw Error('Anatomy data not loaded');
 const base=createFigure(sex,'skeleton'),{root,joints}=base;for(const m of base.meshes){m.removeFromParent();m.geometry.dispose();m.material.dispose()}
 base.setPose({});
 const female=sex==='female';
 function adapt(v){if(!female)return v;const y=v.y;const hip=Math.exp(-Math.pow((y-3.1)/.55,2)),shoulder=Math.exp(-Math.pow((y-4.5)/.45,2));v.x*=1+.12*hip-.09*shoulder;v.z*=1+.03*hip;return v;}
 function geometry(p){if(p.construction){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p.vertices,3));g.setIndex(p.triangles);g.computeVertexNormals();return g;}const b=buffers[p.file],g=new T.BufferGeometry();const pos=new Float32Array(b,p.positions,p.vertexCount*3).slice();if(female)for(let i=0;i<pos.length;i+=3){const v=adapt(new T.Vector3(pos[i],pos[i+1],pos[i+2]));pos.set(v.toArray(),i)}g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('normal',new T.Int16BufferAttribute(new Int16Array(b,p.normals,p.vertexCount*3).slice(),3,true));g.setIndex(new T.BufferAttribute(new Uint32Array(b,p.indices,p.indexCount).slice(),1));if(female)g.computeVertexNormals();return g;}
 const bones=manifest.parts.filter(p=>p.type==='bone'),lookup=new Map(bones.map(p=>[p.name,p]));
 function anchor(name,level=.5){const p=lookup.get(name);if(!p)throw Error('Missing anatomical anchor: '+name);const pos=new Float32Array(buffers[p.file],p.positions,p.vertexCount*3),threshold=p.min[1]+(p.max[1]-p.min[1])*level,band=(p.max[1]-p.min[1])*.07+.001;let v=new T.Vector3(),count=0;for(let i=0;i<pos.length;i+=3)if(Math.abs(pos[i+1]-threshold)<band){v.add(new T.Vector3(pos[i],pos[i+1],pos[i+2]));count++}return adapt(count?v.divideScalar(count):center(p));}
 function place(j,v){root.updateMatrixWorld(true);j.position.copy(j.parent.worldToLocal(v.clone()));root.updateMatrixWorld(true)}
 place(joints.torso,adapt(new T.Vector3(0,3.3,-.1)));place(joints.neck,anchor('Vertebra_C7'));
 for(const side of ['left','right']){const s=side==='left'?1:-1,end=side==='left'?'l':'r',girdle=joints[side+'Shoulder'].parent;
 place(girdle,adapt(new T.Vector3(s*.10,4.54,.02)));
 place(joints[side+'Shoulder'],anchor('Humerus'+end,.95));place(joints[side+'Elbow'],anchor('Humerus'+end,.035));place(joints[side+'Wrist'],anchor('Radius'+end,.035));
 place(joints[side+'Hip'],anchor('Femur'+end,.96));place(joints[side+'Knee'],anchor('Femur'+end,.025));place(joints[side+'Ankle'],anchor('Tibia'+end,.025));
 for(const [i,digit] of ['Index','Middle','Ring','Little'].entries())for(const [segment,word] of [['MCP','Proximal'],['PIP','Middle'],['DIP','Distal']])place(joints[side+digit+segment],anchor(word+'_phalanx_of_'+['second','third','fourth','fifth'][i]+'_finger_of_hand'+end,.94));
 const thumbMount=joints[side+'ThumbCMC'].parent;thumbMount.rotation.set(0,0,0);place(joints[side+'ThumbCMC'],anchor('First_metacarpal_bone'+end,.93));place(joints[side+'ThumbMCP'],anchor('Proximal_phalanx_of_first_finger_of_hand'+end,.93));place(joints[side+'ThumbIP'],anchor('Distal_phalanx_of_first_finger_of_hand'+end,.93));
 }
 root.updateMatrixWorld(true);const boneObjects=[root,...Object.values(joints),joints.leftShoulder.parent,joints.rightShoulder.parent];const boneNames=['root',...Object.keys(joints),'leftGirdle','rightGirdle'];const boneIndex=Object.fromEntries(boneNames.map((n,i)=>[n,i]));const skeleton=new T.Skeleton(boneObjects);skeleton.calculateInverses();
 const world=Object.fromEntries(boneNames.map((n,i)=>[n,boneObjects[i].getWorldPosition(new T.Vector3())]));
 // Bind tendon slips to the same segment axes as their source phalanges.
 const digitChains={};
 for(const side of ['left','right'])for(const [digit,word] of [['Thumb','first'],['Index','second'],['Middle','third'],['Ring','fourth'],['Little','fifth']]){
  const ids=(digit==='Thumb'?['CMC','MCP','IP']:['MCP','PIP','DIP']).map(k=>side+digit+k);
  const end=anchor('Distal_phalanx_of_'+word+'_finger_of_hand'+(side==='left'?'l':'r'),.06);
  digitChains[side+digit]={ids,points:[...ids.map(id=>world[id]),end]};
 }
 function handWeights(p,v){
  const side=sideOf(p),name=p.name.toLowerCase(),wrist=side+'Wrist';
  const digits=/pollic/.test(name)?['Thumb']:/indicis/.test(name)?['Index']:/digiti_minimi/.test(name)?['Little']:['Index','Middle','Ring','Little'];
  let chain,nearest=Infinity;const closest=new T.Vector3();
  for(const digit of digits){const c=digitChains[side+digit];for(let k=0;k<3;k++){
   const distance=new T.Line3(c.points[k],c.points[k+1]).closestPointToPoint(v,true,closest).distanceToSquared(v);
   if(distance<nearest){nearest=distance;chain=c}
  }}
  const weights=[];let remaining=1;
  for(let k=0;k<3;k++){
   const a=chain.points[k],b=chain.points[k+1],axis=b.clone().sub(a).normalize();
   const t=v.clone().sub(a).dot(axis),band=k===0?.035:.014;
   const influence=smooth(-band,band,t);
   weights.push([k===0?wrist:chain.ids[k-1],remaining*(1-influence)]);remaining*=influence;
  }
  weights.push([chain.ids[2],remaining]);return weights.filter(([,w])=>w>1e-7);
 }
 // Use joint-local transition bands, shared by adjacent soft tissues. Nearest-bone
 // weighting alone assigns long tendons to distal joints and tears broad muscles.
 const smooth=(a,b,x)=>{const t=T.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
 function softWeights(p,v){
  const side=sideOf(p),r=regionOf(p),n=p.name.toLowerCase();
  const j=k=>world[side+k], id=k=>side+k;
  const blend=(a,b,t)=>[[a,1-t],[b,t]];
  const torso=()=>blend('root','torso',smooth(3.12,3.65,v.y));
  const arm=()=>{
   const elbow=j('Elbow'),wrist=j('Wrist');
   if(v.y<elbow.y+.12){
    if(v.y<wrist.y-.015)return handWeights(p,v);
    if(v.y<wrist.y+.12)return blend(id('Elbow'),id('Wrist'),1-smooth(wrist.y-.015,wrist.y+.12,v.y));
    return blend(id('Shoulder'),id('Elbow'),1-smooth(elbow.y-.12,elbow.y+.12,v.y));
   }
   return [[id('Shoulder'),1]];
  };
  const leg=()=>{
   const hip=j('Hip'),knee=j('Knee'),ankle=j('Ankle');
   if(v.y>hip.y-.25)return blend('root',id('Hip'),1-smooth(hip.y-.25,hip.y+.1,v.y));
   if(v.y>knee.y+.16)return [[id('Hip'),1]];
   if(v.y>ankle.y+.12)return blend(id('Hip'),id('Knee'),1-smooth(knee.y-.16,knee.y+.16,v.y));
   return blend(id('Knee'),id('Ankle'),1-smooth(ankle.y-.10,ankle.y+.12,v.y));
  };
  if(['head','nose','eye','ear','mouth'].includes(r))return [['neck',1]];
  if(r==='neck')return blend('torso','neck',smooth(world.neck.y-.1,world.neck.y+.14,v.y));
  if(r==='upperarm'||r==='forearm'||r==='elbow')return arm();
  if(['thigh','calf','knee'].includes(r))return leg();
  if(r==='foot')return [[id('Ankle'),1]];
  if(r==='pelvis'){
   if(/glute|obturator|piriform|gemell|pectine|iliacus/.test(n))return leg();
   return torso();
  }
  if(r==='hand')return handWeights(p,v);
  const lateral=smooth(Math.abs(j('Shoulder').x)-.18,Math.abs(j('Shoulder').x)+.12,Math.abs(v.x));
  if(p.construction&&r==='shoulder')return arm();
  if(r==='shoulder')return blend(id('Girdle'),id('Shoulder'),lateral);
  if(/pectoralis_major/.test(n))return blend('torso',id('Shoulder'),lateral);
  if(/latissimus/.test(n))return blend('torso',id('Shoulder'),lateral*smooth(j('Shoulder').y-.75,j('Shoulder').y-.25,v.y));
  if(/trapezius|rhomboid|pectoralis_minor|subclavius|levator_scapula/.test(n))return blend('torso',id('Girdle'),smooth(.10,Math.abs(j('Shoulder').x),Math.abs(v.x)));
  return torso();
 }
 const meshes=[],outlines=[];const construction=layer==='construction';let totalTriangles=0;
 for(const p of (construction?CONSTRUCTION_PARTS:manifest.parts)){if(layer==='skeleton'&&p.type==='muscle')continue;const g=geometry(p),count=g.attributes.position.count,indices=new Uint16Array(count*4),weights=new Float32Array(count*4),rigid=p.construction?p.rigid:rigidJoint(p);const v=new T.Vector3();
 for(let i=0;i<count;i++){if(rigid){indices[i*4]=boneIndex[rigid];weights[i*4]=1;continue;}v.fromBufferAttribute(g.attributes.position,i);softWeights(p,v).forEach(([id,w],k)=>{indices[i*4+k]=boneIndex[id];weights[i*4+k]=w})}
 g.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));const connective=/tendon|aponeurosis|tract|raphe|linea_alba/.test(p.name.toLowerCase());const color=construction?'#c9cec3':p.type==='muscle'?(connective?'#dacbb0':'#a65140'):p.type==='cartilage'?'#a8b8b3':'#e0cda6';const material=new T.MeshStandardMaterial({color,roughness:construction?.86:.72,flatShading:construction,side:T.DoubleSide});const mesh=new T.SkinnedMesh(g,material);mesh.name=p.name;mesh.userData={region:regionOf(p),anatomyName:p.name.replace(/([a-z])[lr]$/,'$1').replaceAll('_',' '),side:sideOf(p),type:p.type};mesh.frustumCulled=false;mesh.castShadow=construction||p.indexCount>1500;mesh.receiveShadow=true;root.add(mesh);mesh.bind(skeleton);meshes.push(mesh);totalTriangles+=g.index.count/3;
 if(construction){
  const edgeGeometry=new T.EdgesGeometry(g,24),a=edgeGeometry.attributes.position,source=g.attributes.position,lookup=new Map();
  const key=(x,y,z)=>[x,y,z].map(x=>x.toFixed(5)).join(',');
  for(let i=0;i<source.count;i++)lookup.set(key(source.getX(i),source.getY(i),source.getZ(i)),i);
  const vertexIds=Array.from({length:a.count},(_,i)=>lookup.get(key(a.getX(i),a.getY(i),a.getZ(i))));
  const line=new T.LineSegments(edgeGeometry,new T.LineBasicMaterial({color:'#44524e',transparent:true,opacity:.28,depthWrite:false}));line.frustumCulled=false;root.add(line);outlines.push({mesh,line,vertexIds});
 }
 }
 function updateOutlines(){const v=new T.Vector3();for(const {mesh,line,vertexIds} of outlines){const a=line.geometry.attributes.position;vertexIds.forEach((id,i)=>{v.fromBufferAttribute(mesh.geometry.attributes.position,id);mesh.applyBoneTransform(id,v);a.setXYZ(i,v.x,v.y,v.z)});a.needsUpdate=true;}}
 updateOutlines();
 return{root,joints,meshes,detailed:true,construction,totalTriangles,source:manifest.source,setPose(pose){base.setPose(pose);skeleton.update();updateOutlines();for(const m of meshes){m.boundingBox=null;m.boundingSphere=null}},dispose(){for(const {line} of outlines){line.geometry.dispose();line.material.dispose()}for(const m of meshes){m.geometry.dispose();m.material.dispose()}skeleton.dispose()},getBounds(list){const b=new T.Box3();skeleton.update();for(const m of list){m.computeBoundingBox();b.union(m.boundingBox.clone().applyMatrix4(m.matrixWorld))}return b}};
}
