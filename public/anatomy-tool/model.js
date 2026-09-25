import * as T from './three.module.js';
// Stable region and joint identifiers form the adapter boundary for replacement assets.
export const REGIONS={head:'Head',eye:'Eye',nose:'Nose',mouth:'Mouth',ear:'Ear',neck:'Neck',chest:'Chest',back:'Back',pelvis:'Pelvis',shoulder:'Shoulder',upperarm:'Upper arm',elbow:'Elbow',forearm:'Forearm',hand:'Hand',thigh:'Thigh',knee:'Knee',calf:'Lower leg',foot:'Foot'};
export const JOINTS={torso:{name:'Rib cage',axes:[['Bend',-25,25],['Twist',-40,40],['Tilt',-25,25]]},neck:{name:'Head & neck',axes:[['Nod',-35,35],['Turn',-65,65],['Tilt',-30,30]]},leftShoulder:{name:'Left shoulder',axes:[['Forward',-100,70],['Rotate',-70,70],['Raise',-150,20]]},rightShoulder:{name:'Right shoulder',axes:[['Forward',-100,70],['Rotate',-70,70],['Raise',-20,150]]},leftElbow:{name:'Left elbow',axes:[['Bend',-140,0],['Turn',-70,70],['Tilt',0,0]]},rightElbow:{name:'Right elbow',axes:[['Bend',-140,0],['Turn',-70,70],['Tilt',0,0]]},leftWrist:{name:'Left wrist',axes:[['Flex',-65,65],['Turn',0,0],['Deviation',-25,25]]},rightWrist:{name:'Right wrist',axes:[['Flex',-65,65],['Turn',0,0],['Deviation',-25,25]]},leftHip:{name:'Left hip',axes:[['Forward',-100,30],['Rotate',-40,40],['Out',-40,15]]},rightHip:{name:'Right hip',axes:[['Forward',-100,30],['Rotate',-40,40],['Out',-15,40]]},leftKnee:{name:'Left knee',axes:[['Bend',0,135],['Turn',0,0],['Tilt',0,0]]},rightKnee:{name:'Right knee',axes:[['Bend',0,135],['Turn',0,0],['Tilt',0,0]]},leftAnkle:{name:'Left ankle',axes:[['Flex',-35,45],['Turn',-15,15],['Tilt',-15,15]]},rightAnkle:{name:'Right ankle',axes:[['Flex',-35,45],['Turn',-15,15],['Tilt',-15,15]]}};
// Shoulder controls are elevation, plane of elevation, and humeral axial rotation.
for(const side of ['left','right']){
 JOINTS[side+'Shoulder']={name:side==='left'?'Left shoulder':'Right shoulder',kind:'shoulder',axes:[['Arm elevation',0,180],['Reach direction',-90,135],['Upper-arm rotation',-70,90]]};
 for(const digit of ['Index','Middle','Ring','Little'])for(const segment of ['MCP','PIP','DIP']){
 const id=side+digit+segment;JOINTS[id]={name:`${side} ${digit.toLowerCase()} · ${ {MCP:'base',PIP:'middle',DIP:'tip'}[segment]}`,kind:'finger',side,axes:segment==='MCP'?[['Bend',-15,90],['Unused',0,0],['Spread',-20,20]]:[['Bend',0,segment==='PIP'?110:80],['Unused',0,0],['Unused',0,0]]};
 }
 for(const segment of ['CMC','MCP','IP'])JOINTS[side+'Thumb'+segment]={name:`${side} thumb · ${{CMC:'base',MCP:'knuckle',IP:'tip'}[segment]}`,kind:'thumb',side,axes:segment==='CMC'?[['Across palm',0,55],['Opposition',0,60],['Open',0,45]]:[['Bend',0,segment==='MCP'?60:80],['Unused',0,0],['Unused',0,0]]};
}
export function jointLimits(id,values=[0,0,0]){
 const axes=JOINTS[id].axes.map(a=>[...a]);
 if(JOINTS[id].kind==='shoulder'){
 const elevation=values[0]||0,plane=values[1]||0;
 // Conservative pose envelope, not patient-specific clinical limits.
 axes[0][2]=plane<0?180+plane*4/3:plane>90?180-(plane-90)*4/3:180;
 axes[1][2]=90+45*T.MathUtils.clamp((elevation-60)/30,0,1);
 axes[2][1]=-70+Math.max(0,elevation-90)*1.1;
 }else if(id.endsWith('MCP')&&JOINTS[id].kind==='finger'){
 const spread=20*(1-Math.max(0,values[0]||0)/90);axes[2][1]=-spread;axes[2][2]=spread;
 }
 return axes;
}
export function normalizeJoint(id,values=[0,0,0]){
 let a=JOINTS[id].axes.map(([,min,max],i)=>T.MathUtils.clamp(Number.isFinite(values[i])?values[i]:0,min,max));
 for(let n=0;n<2;n++)a=jointLimits(id,a).map(([,min,max],i)=>T.MathUtils.clamp(a[i],min,max));
 return a;
}
// Reference-based écorché poses. Shoulder tuples: elevation, reach plane, axial rotation.
const relaxedHand=(side,bend=12)=>Object.fromEntries(['Index','Middle','Ring','Little'].flatMap((d,i)=>[['MCP',[bend+i*2,0,0]],['PIP',[bend*1.4,0,0]],['DIP',[bend*.6,0,0]]].map(([j,v])=>[side+d+j,v])));
const fist=side=>({...relaxedHand(side,65),[side+'ThumbCMC']:[35,45,8],[side+'ThumbMCP']:[40,0,0],[side+'ThumbIP']:[45,0,0]});
export const PRESET_LABELS={neutral:'Original standing',thrower:'Écorché · Thrower',standing:'Écorché · Extended arm',reaching:'Écorché · Upward reach',gladiator:'Écorché · Borghese gladiator'};
export const PRESETS={
 "neutral": {},
 "thrower": {
  "torso": [
   -4,
   -10,
   -4
  ],
  "neck": [
   -12,
   35,
   4
  ],
  "rightShoulder": [
   83,
   5,
   20
  ],
  "rightElbow": [
   -12,
   0,
   0
  ],
  "rightWrist": [
   18,
   0,
   -8
  ],
  "leftShoulder": [
   105,
   0,
   75
  ],
  "leftElbow": [
   -110,
   0,
   0
  ],
  "leftWrist": [
   -8,
   0,
   0
  ],
  "rightHip": [
   0.3,
   0,
   -12
  ],
  "leftHip": [
   0.29,
   0,
   12
  ],
  "rightKnee": [
   8.15,
   0,
   0
  ],
  "leftKnee": [
   8.19,
   0,
   0
  ],
  "rightAnkle": [
   -8.44344,
   -0.06237,
   11.99984
  ],
  "leftAnkle": [
   -8.47366,
   0.06029,
   -11.99985
  ],
  "rightIndexMCP": [
   8,
   0,
   0
  ],
  "rightIndexPIP": [
   11.2,
   0,
   0
  ],
  "rightIndexDIP": [
   4.8,
   0,
   0
  ],
  "rightMiddleMCP": [
   10,
   0,
   0
  ],
  "rightMiddlePIP": [
   11.2,
   0,
   0
  ],
  "rightMiddleDIP": [
   4.8,
   0,
   0
  ],
  "rightRingMCP": [
   12,
   0,
   0
  ],
  "rightRingPIP": [
   11.2,
   0,
   0
  ],
  "rightRingDIP": [
   4.8,
   0,
   0
  ],
  "rightLittleMCP": [
   14,
   0,
   0
  ],
  "rightLittlePIP": [
   11.2,
   0,
   0
  ],
  "rightLittleDIP": [
   4.8,
   0,
   0
  ],
  "leftIndexMCP": [
   65,
   0,
   0
  ],
  "leftIndexPIP": [
   91,
   0,
   0
  ],
  "leftIndexDIP": [
   39,
   0,
   0
  ],
  "leftMiddleMCP": [
   67,
   0,
   0
  ],
  "leftMiddlePIP": [
   91,
   0,
   0
  ],
  "leftMiddleDIP": [
   39,
   0,
   0
  ],
  "leftRingMCP": [
   69,
   0,
   0
  ],
  "leftRingPIP": [
   91,
   0,
   0
  ],
  "leftRingDIP": [
   39,
   0,
   0
  ],
  "leftLittleMCP": [
   71,
   0,
   0
  ],
  "leftLittlePIP": [
   91,
   0,
   0
  ],
  "leftLittleDIP": [
   39,
   0,
   0
  ],
  "leftThumbCMC": [
   35,
   45,
   8
  ],
  "leftThumbMCP": [
   40,
   0,
   0
  ],
  "leftThumbIP": [
   45,
   0,
   0
  ]
 },
 "standing": {
  "torso": [
   0,
   3,
   2
  ],
  "neck": [
   7,
   20,
   0
  ],
  "rightShoulder": [
   88,
   10,
   15
  ],
  "rightElbow": [
   -7,
   0,
   0
  ],
  "rightWrist": [
   22,
   0,
   5
  ],
  "leftShoulder": [
   5,
   0,
   0
  ],
  "leftElbow": [
   -8,
   0,
   0
  ],
  "leftWrist": [
   0,
   0,
   0
  ],
  "leftHip": [
   -1.16,
   0,
   6
  ],
  "rightHip": [
   -1.14,
   0,
   -6
  ],
  "rightKnee": [
   8.06,
   0,
   0
  ],
  "rightAnkle": [
   -6.92624,
   0.11915,
   5.99882
  ],
  "leftIndexMCP": [
   12,
   0,
   0
  ],
  "leftIndexPIP": [
   16.8,
   0,
   0
  ],
  "leftIndexDIP": [
   7.2,
   0,
   0
  ],
  "leftMiddleMCP": [
   14,
   0,
   0
  ],
  "leftMiddlePIP": [
   16.8,
   0,
   0
  ],
  "leftMiddleDIP": [
   7.2,
   0,
   0
  ],
  "leftRingMCP": [
   16,
   0,
   0
  ],
  "leftRingPIP": [
   16.8,
   0,
   0
  ],
  "leftRingDIP": [
   7.2,
   0,
   0
  ],
  "leftLittleMCP": [
   18,
   0,
   0
  ],
  "leftLittlePIP": [
   16.8,
   0,
   0
  ],
  "leftLittleDIP": [
   7.2,
   0,
   0
  ],
  "rightIndexMCP": [
   8,
   0,
   0
  ],
  "rightIndexPIP": [
   11.2,
   0,
   0
  ],
  "rightIndexDIP": [
   4.8,
   0,
   0
  ],
  "rightMiddleMCP": [
   10,
   0,
   0
  ],
  "rightMiddlePIP": [
   11.2,
   0,
   0
  ],
  "rightMiddleDIP": [
   4.8,
   0,
   0
  ],
  "rightRingMCP": [
   12,
   0,
   0
  ],
  "rightRingPIP": [
   11.2,
   0,
   0
  ],
  "rightRingDIP": [
   4.8,
   0,
   0
  ],
  "rightLittleMCP": [
   14,
   0,
   0
  ],
  "rightLittlePIP": [
   11.2,
   0,
   0
  ],
  "rightLittleDIP": [
   4.8,
   0,
   0
  ],
  "leftKnee": [
   8.11,
   0,
   0
  ],
  "leftAnkle": [
   -6.95635,
   -0.12124,
   -5.99878
  ]
 },
 "reaching": {
  "torso": [
   -8,
   -8,
   -6
  ],
  "neck": [
   -22,
   -18,
   -5
  ],
  "leftShoulder": [
   165,
   35,
   55
  ],
  "leftElbow": [
   -30,
   0,
   0
  ],
  "leftWrist": [
   -35,
   0,
   -10
  ],
  "rightShoulder": [
   22,
   -25,
   15
  ],
  "rightElbow": [
   -15,
   0,
   0
  ],
  "leftHip": [
   -20.35,
   0,
   9
  ],
  "leftKnee": [
   35.58,
   0,
   0
  ],
  "leftAnkle": [
   -15.46034,
   -3.11847,
   -8.44664
  ],
  "rightHip": [
   11.99,
   0,
   -9
  ],
  "rightKnee": [
   3.87,
   0,
   0
  ],
  "rightAnkle": [
   -15.71658,
   -1.86232,
   8.80677
  ],
  "rightIndexMCP": [
   65,
   0,
   0
  ],
  "rightIndexPIP": [
   91,
   0,
   0
  ],
  "rightIndexDIP": [
   39,
   0,
   0
  ],
  "rightMiddleMCP": [
   67,
   0,
   0
  ],
  "rightMiddlePIP": [
   91,
   0,
   0
  ],
  "rightMiddleDIP": [
   39,
   0,
   0
  ],
  "rightRingMCP": [
   69,
   0,
   0
  ],
  "rightRingPIP": [
   91,
   0,
   0
  ],
  "rightRingDIP": [
   39,
   0,
   0
  ],
  "rightLittleMCP": [
   71,
   0,
   0
  ],
  "rightLittlePIP": [
   91,
   0,
   0
  ],
  "rightLittleDIP": [
   39,
   0,
   0
  ],
  "rightThumbCMC": [
   35,
   45,
   8
  ],
  "rightThumbMCP": [
   40,
   0,
   0
  ],
  "rightThumbIP": [
   45,
   0,
   0
  ],
  "leftIndexMCP": [
   2,
   0,
   0
  ],
  "leftIndexPIP": [
   2.8,
   0,
   0
  ],
  "leftIndexDIP": [
   1.2,
   0,
   0
  ],
  "leftMiddleMCP": [
   4,
   0,
   0
  ],
  "leftMiddlePIP": [
   2.8,
   0,
   0
  ],
  "leftMiddleDIP": [
   1.2,
   0,
   0
  ],
  "leftRingMCP": [
   6,
   0,
   0
  ],
  "leftRingPIP": [
   2.8,
   0,
   0
  ],
  "leftRingDIP": [
   1.2,
   0,
   0
  ],
  "leftLittleMCP": [
   8,
   0,
   0
  ],
  "leftLittlePIP": [
   2.8,
   0,
   0
  ],
  "leftLittleDIP": [
   1.2,
   0,
   0
  ]
 },
 "gladiator": {
  "torso": [
   14,
   -12,
   -5
  ],
  "neck": [
   -14,
   -25,
   0
  ],
  "leftShoulder": [
   140,
   65,
   45
  ],
  "leftElbow": [
   -8,
   0,
   0
  ],
  "rightShoulder": [
   35,
   -40,
   10
  ],
  "rightElbow": [
   -8,
   0,
   0
  ],
  "leftHip": [
   -37.96,
   0,
   9
  ],
  "leftKnee": [
   28.1,
   0,
   0
  ],
  "leftAnkle": [
   9.5163,
   -5.52181,
   -7.11806
  ],
  "rightHip": [
   22,
   0,
   -9
  ],
  "rightKnee": [
   2.31,
   0,
   0
  ],
  "rightAnkle": [
   -24.06457,
   -3.35954,
   8.35426
  ],
  "rightIndexMCP": [
   65,
   0,
   0
  ],
  "rightIndexPIP": [
   91,
   0,
   0
  ],
  "rightIndexDIP": [
   39,
   0,
   0
  ],
  "rightMiddleMCP": [
   67,
   0,
   0
  ],
  "rightMiddlePIP": [
   91,
   0,
   0
  ],
  "rightMiddleDIP": [
   39,
   0,
   0
  ],
  "rightRingMCP": [
   69,
   0,
   0
  ],
  "rightRingPIP": [
   91,
   0,
   0
  ],
  "rightRingDIP": [
   39,
   0,
   0
  ],
  "rightLittleMCP": [
   71,
   0,
   0
  ],
  "rightLittlePIP": [
   91,
   0,
   0
  ],
  "rightLittleDIP": [
   39,
   0,
   0
  ],
  "rightThumbCMC": [
   35,
   45,
   8
  ],
  "rightThumbMCP": [
   40,
   0,
   0
  ],
  "rightThumbIP": [
   45,
   0,
   0
  ],
  "leftIndexMCP": [
   65,
   0,
   0
  ],
  "leftIndexPIP": [
   91,
   0,
   0
  ],
  "leftIndexDIP": [
   39,
   0,
   0
  ],
  "leftMiddleMCP": [
   67,
   0,
   0
  ],
  "leftMiddlePIP": [
   91,
   0,
   0
  ],
  "leftMiddleDIP": [
   39,
   0,
   0
  ],
  "leftRingMCP": [
   69,
   0,
   0
  ],
  "leftRingPIP": [
   91,
   0,
   0
  ],
  "leftRingDIP": [
   39,
   0,
   0
  ],
  "leftLittleMCP": [
   71,
   0,
   0
  ],
  "leftLittlePIP": [
   91,
   0,
   0
  ],
  "leftLittleDIP": [
   39,
   0,
   0
  ],
  "leftThumbCMC": [
   35,
   45,
   8
  ],
  "leftThumbMCP": [
   40,
   0,
   0
  ],
  "leftThumbIP": [
   45,
   0,
   0
  ]
 }
};

export function createFigure(sex='male',layer='skin',diagram=0){
 const root=new T.Group(),joints={},meshes=[],girdles={};const female=sex==='female',skin=layer==='skin',muscle=layer==='muscle',bone=layer==='skeleton',construction=layer==='construction';
 const color=diagram?'#746b5c':bone?'#e6d8bb':muscle?'#b77863':construction?'#b9c7c2':'#d7c8b2';
 function add(parent,region,pos,scale,shape='sphere',c=color){let geo;
 if(shape==='box')geo=new T.BoxGeometry(2,2,2);else if(shape==='tube')geo=new T.CylinderGeometry(.8,1,2,diagram===1?6:16);else geo=new T.SphereGeometry(1,diagram<=2&&diagram?8:24,diagram<=2&&diagram?6:16);
 const mat=new T.MeshStandardMaterial({color:diagram?'#f0eee6':c,roughness:.85,flatShading:construction||diagram===1||diagram===2,transparent:diagram===1,opacity:diagram===1?.1:1});let mesh=new T.Mesh(geo,mat);mesh.position.set(...pos);mesh.scale.set(...scale);mesh.userData.region=region;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);meshes.push(mesh);
 if(diagram>1){const outline=new T.Mesh(geo,new T.MeshBasicMaterial({color:'#554f42',side:T.BackSide}));outline.scale.setScalar(1.025);mesh.add(outline);}
 if(construction||diagram){const edge=new T.LineSegments(new T.EdgesGeometry(geo,diagram===1?25:33),new T.LineBasicMaterial({color:diagram?'#554f42':'#6c837f',transparent:true,opacity:diagram===3?.32:.72}));mesh.add(edge)}return mesh;}
 function link(p,r,a,b,width,c=color){const av=new T.Vector3(...a),bv=new T.Vector3(...b);let ob=add(p,r,av.clone().add(bv).multiplyScalar(.5).toArray(),[width,av.distanceTo(bv)/2,width],'tube',c);ob.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),bv.sub(av).normalize());return ob;}
 function joint(id,parent,pos){let g=new T.Group();g.position.set(...pos);parent.add(g);joints[id]=g;return g;}
 const pw=female?.43:.37,sw=female?.59:.68;
 if(bone){add(root,'pelvis',[-pw*.52,3.3,0],[.22,.3,.17]);add(root,'pelvis',[pw*.52,3.3,0],[.22,.3,.17]);link(root,'pelvis',[-.27,3.2,0],[.27,3.2,0],.05);add(root,'pelvis',[0,3.13,.04],[.16,.13,.13]);}else{add(root,'pelvis',[0,3.28,0],[pw,.38,.25],construction?'box':'sphere');if(skin){add(root,'pelvis',[-.19,3.22,-.15],[.23,.25,.2]);add(root,'pelvis',[.19,3.22,-.15],[.23,.25,.2]);}}
 const torso=joint('torso',root,[0,3.48,0]);
 if(bone){for(let i=0;i<10;i++)add(torso,'back',[0,.08+i*.09,-.13],[.066,.038,.065]);for(let i=0;i<8;i++){const y=.28+i*.095,w=.28+Math.sin(i/8*Math.PI)*.19;let pts=[];for(let k=0;k<=36;k++){const a=k/36*Math.PI*2;pts.push(new T.Vector3(Math.sin(a)*w,y-Math.cos(a)*.035,Math.cos(a)*.24))}const geo=new T.TubeGeometry(new T.CatmullRomCurve3(pts),40,.021,6,false),mesh=new T.Mesh(geo,new T.MeshStandardMaterial({color}));mesh.userData.region='chest';torso.add(mesh);meshes.push(mesh)}link(torso,'chest',[0,.34,.23],[0,1.01,.2],.04);for(const s of [-1,1]){}}
 else{add(torso,'chest',[0,.63,0],[female?.47:.53,.6,.28]);add(torso,'chest',[0,.12,.015],[female?.29:.35,.33,.22]);add(torso,'back',[0,.62,-.15],[female?.42:.48,.46,.16]);if(!construction){for(const s of [-1,1]){add(torso,'chest',[s*.235,.83,.2],[female?.215:.26,female?.18:.17,female?.16:.12]);if(muscle){for(let i=0;i<3;i++)add(torso,'chest',[s*.085,.39-i*.14,.208],[.083,.074,.055]);for(let i=0;i<3;i++){const m=add(torso,'chest',[s*(.32-i*.025),.58-i*.14,.12],[.12,.045,.055]);m.rotation.z=s*.5;}}}}}
 const neck=joint('neck',torso,[0,1.15,0]);add(neck,'neck',[0,.13,0],[bone?.065:.13,.2,bone?.06:.13],'tube');add(neck,'head',[0,.51,0],[.245,.32,.23]);add(neck,'head',[0,.32,.09],[.18,.17,.18],construction?'box':'sphere');
 if(!construction||diagram){for(const s of [-1,1]){add(neck,'eye',[s*.102,.52,.195],[.068,.043,.035],'sphere',bone?'#716956':color);add(neck,'ear',[s*.243,.47,0],[.044,.095,.06]);if(!bone)add(neck,'eye',[s*.103,.568,.196],[.085,.018,.02]);}add(neck,'nose',[0,.465,.245],[.048,.085,.055],diagram===1?'box':'sphere');add(neck,'mouth',[0,.365,.241],[.088,.022,.02]);}
 for(const s of [-1,1]){const side=s===1?'left':'right';const girdle=new T.Group();girdle.position.set(s*.18,.92,-.08);torso.add(girdle);girdles[side]=girdle;const shoulder=joint(side+'Shoulder',girdle,[s*(sw-.18),.05,.08]);link(girdle,'shoulder',[0,.03,.12],[s*(sw-.18),.05,.08],bone?.035:.027);if(bone)add(girdle,'back',[s*.1,-.12,-.13],[.19,.24,.04]);
 add(shoulder,'shoulder',[0,-.06,0],[bone?.105:.22,bone?.105:.26,bone?.105:.22]);if(bone)link(shoulder,'upperarm',[0,-.1,0],[0,-.91,0],.055);else{add(shoulder,'upperarm',[0,-.48,0],[female?.14:.18,.43,.16],'sphere');if(muscle){add(shoulder,'upperarm',[0,-.45,.12],[.11,.3,.09]);add(shoulder,'upperarm',[0,-.43,-.12],[.12,.34,.08]);}}
 const elbow=joint(side+'Elbow',shoulder,[0,-.93,0]);add(elbow,'elbow',[0,0,0],[.12,.13,.12]);if(bone){link(elbow,'forearm',[-.045,-.1,0],[-.06,-.79,0],.026);link(elbow,'forearm',[.045,-.1,0],[.06,-.79,0],.029)}else{add(elbow,'forearm',[0,-.36,.018],[.13,.4,.13],'tube');if(muscle)add(elbow,'forearm',[.04,-.3,.095],[.065,.31,.06]);}
 const wrist=joint(side+'Wrist',elbow,[0,-.8,0]);add(wrist,'hand',[0,-.15,.018],[.13,.19,.065],construction?'box':'sphere');for(let i=0;i<4;i++){
 const digit=['Index','Middle','Ring','Little'][i],x=s*(-.087+i*.059),lengths=[.28,.32,.30,.235],length=lengths[i],parts=[length*.46,length*.31,length*.23],baseY=-.28+Math.abs(i-1)*.013;
 if(bone)link(wrist,'hand',[x,-.04,0],[x,baseY,.018],.018);
 let parent=wrist;
 for(let n=0;n<3;n++){const seg=['MCP','PIP','DIP'][n];const g=joint(side+digit+seg,parent,n===0?[x,baseY,.018]:[0,-parts[n-1],0]);
 add(g,'hand',[0,0,0],[bone?.019:.027,bone?.019:.027,bone?.019:.027]);
 add(g,'hand',[0,-parts[n]/2,0],[bone?.014:.024,parts[n]/2,bone?.014:.025],construction?'box':'tube');parent=g;
 }
 }
 const thumbMount=new T.Group();thumbMount.position.set(-s*.1,-.12,.035);thumbMount.rotation.z=-s*.6;wrist.add(thumbMount);
 let parent=thumbMount;const lengths=[.12,.10,.085];for(let i=0;i<3;i++){const seg=['CMC','MCP','IP'][i],g=joint(side+'Thumb'+seg,parent,i===0?[0,0,0]:[0,-lengths[i-1],0]);add(g,'hand',[0,0,0],[.029,.029,.029]);add(g,'hand',[0,-lengths[i]/2,0],[bone?.019:.032,lengths[i]/2,bone?.019:.033],construction?'box':'tube');parent=g;}

 const hip=joint(side+'Hip',root,[s*(female?.255:.22),3.11,0]);if(bone){add(hip,'thigh',[0,0,0],[.11,.11,.11]);link(hip,'thigh',[0,0,0],[s*.015,-1.25,0],.069);}else{add(hip,'thigh',[s*.015,-.54,0],[female?.25:.23,.65,.24]);if(muscle){add(hip,'thigh',[s*.09,-.6,.14],[.13,.47,.13]);add(hip,'thigh',[-s*.08,-.8,.14],[.11,.32,.1]);}}
 const knee=joint(side+'Knee',hip,[s*.015,-1.24,0]);add(knee,'knee',[0,0,.045],[.14,.15,.14]);add(knee,'knee',[0,.01,.155],[.085,.105,.045]);if(bone){link(knee,'calf',[-s*.035,-.12,0],[-s*.015,-1.2,0],.057);link(knee,'calf',[s*.09,-.13,0],[s*.07,-1.19,0],.027);}else{add(knee,'calf',[0,-.52,-.04],[.15,.55,.16],'tube');add(knee,'calf',[0,-.36,-.1],[.17,.31,.15]);link(knee,'calf',[0,-.7,-.13],[0,-1.16,-.06],.045);}
 const ankle=joint(side+'Ankle',knee,[0,-1.24,0]);add(ankle,'foot',[0,-.14,.115],[.14,.13,.28],construction?'box':'sphere');if(bone){for(let i=0;i<5;i++)link(ankle,'foot',[-.1+i*.045,-.13,.04],[-.12+i*.056,-.2,.37],.019);}for(let i=0;i<5;i++)add(ankle,'foot',[-s*.105+s*i*.049,-.195,.34-i*.019],[i===0?.043:.032,.052,.078]);
 }
 root.userData={sex,layer};return{root,joints,meshes,setPose(pose){
 for(const [id,j] of Object.entries(joints)){
 const a=normalizeJoint(id,pose[id]||[0,0,0]),kind=JOINTS[id].kind,side=id.startsWith('left')?'left':'right',sign=side==='left'?1:-1;
 if(kind==='shoulder'){
 const [elevation,plane,twist]=a.map(T.MathUtils.degToRad),axis=new T.Vector3(-Math.sin(plane),0,sign*Math.cos(plane));
 const scapula=T.MathUtils.degToRad(Math.max(0,a[0]-30)*.34);
 girdles[side].quaternion.setFromAxisAngle(axis,scapula);
 const swing=new T.Quaternion().setFromAxisAngle(axis,elevation-scapula);
 const axial=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),sign*twist);
 j.quaternion.copy(swing).multiply(axial);
 }else if(kind==='finger')j.rotation.set(-T.MathUtils.degToRad(a[0]),0,sign*T.MathUtils.degToRad(a[2]));
 else if(kind==='thumb')j.rotation.set(-T.MathUtils.degToRad(a[0]),sign*T.MathUtils.degToRad(a[1]),sign*T.MathUtils.degToRad(a[2]));
 else j.rotation.set(...a.map(T.MathUtils.degToRad));
 }root.updateMatrixWorld(true);
 },dispose(){root.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose()})}};
}
