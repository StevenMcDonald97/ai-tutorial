import * as T from './three.module.js';
// Shared teaching geometry: deliberately simplified volumes, not segmented organs.
export function torsoGuides(sex){
 const z=sex==='female'?-.085:.015,w=sex==='female'?.17:.165,lines=[];
 const add=(points,kind='volume',closed=false)=>lines.push({points,kind,closed});
 const ellipse=(cx,y,cz,rx,rz,kind='volume')=>add(Array.from({length:65},(_,i)=>{const t=i/64*Math.PI*2;return[cx+rx*Math.cos(t),y,cz+rz*Math.sin(t)]}),kind);
 // Barrel cross-sections and meridians encode the rib cage's depth.
 for(const [y,rx,rz] of [[.58,.07,.055],[.48,.145,.11],[.37,.157,.12],[.26,.115,.09]])ellipse(0,y,z,rx,rz);
 for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])add([[.58,.07,.055],[.48,.145,.11],[.37,.157,.12],[.26,.115,.09]].map(([y,rx,rz])=>[Math.cos(angle)*rx,y,z+Math.sin(angle)*rz]));
 const top=[[-w,.13,z-.10],[w,.13,z-.10],[w,.13,z+.10],[-w,.13,z+.10]],bottom=[[-w*.65,-.055,z-.065],[w*.65,-.055,z-.065],[w*.65,-.055,z+.065],[-w*.65,-.055,z+.065]];
 add([...top,top[0]]);add([...bottom,bottom[0]]);for(let i=0;i<4;i++)add([top[i],bottom[i]]);
 add([[0,.60,z],[0,.49,z+.108],[0,.37,z+.12],[0,.26,z+.09],[0,.13,z+.10],[0,-.055,z+.065]],'axis');
 // Plane and landmark guides: place the surface around these, not every muscle edge.
 add([[-.20,.56,z],[-.125,.59,z+.03],[0,.57,z+.055],[.125,.59,z+.03],[.20,.56,z]],'landmark');
 add([[-.13,.29,z+.067],[-.09,.35,z+.103],[0,.39,z+.123],[.09,.35,z+.103],[.13,.29,z+.067]],'landmark');
 add([[-w,.13,z+.10],[-.10,.08,z+.12],[0,-.055,z+.065],[.10,.08,z+.12],[w,.13,z+.10]],'landmark');
 add([[-.12,.30,z+.1],[-.115,.20,z+.09],[-w,.13,z+.10]],'landmark');add([[.12,.30,z+.1],[.115,.20,z+.09],[w,.13,z+.10]],'landmark');
 return {lines,z,w};
}
export function createTorsoConstruction(sex){const root=new T.Group(),{lines,z,w}=torsoGuides(sex);const egg=new T.Mesh(new T.SphereGeometry(1,16,12),new T.MeshStandardMaterial({color:'#bdc9c7',transparent:true,opacity:.24,roughness:1,depthWrite:false}));egg.position.set(0,.405,z);egg.scale.set(.155,.18,.12);root.add(egg);const pelvis=new T.Mesh(new T.BoxGeometry(w*2,.185,.20),new T.MeshStandardMaterial({color:'#d3ad82',transparent:true,opacity:.15,depthWrite:false}));pelvis.position.set(0,.0375,z);root.add(pelvis);for(const l of lines){const geo=new T.BufferGeometry().setFromPoints(l.points.map(p=>new T.Vector3(...p)));const line=new T.Line(geo,new T.LineBasicMaterial({color:l.kind==='axis'?'#eda579':l.kind==='landmark'?'#d7a077':'#e1e4d8'}));root.add(line)}return root;}
export function constructionSVG(sex,angle,stage){const {lines}=torsoGuides(sex),a=angle*Math.PI/180;const project=([x,y,z])=>[(x*Math.cos(a)-z*Math.sin(a))*600+260,450-y*600];const paths=lines.filter(l=>stage===2||l.kind!=='landmark').map(l=>`<polyline points="${l.points.map(p=>project(p).map(n=>n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${l.kind==='axis'?'#ae5934':l.kind==='landmark'?'#9c5537':'#344951'}" stroke-width="${l.kind==='volume'?1.5:2.2}" ${l.kind==='axis'?'stroke-dasharray="7 5"':''} stroke-linejoin="round"/>`).join('');return `<svg class="drawing" viewBox="0 0 520 540" role="img" aria-label="${sex} torso: ${stage===1?'rib-cage volume and pelvic block':'construction guides over the source silhouette'}, ${angle} degree view" xmlns="http://www.w3.org/2000/svg">${stage===2?`<image href="torso/${sex}-skin-${angle}-outline.png" width="520" height="540"/>`:''}${paths}</svg>`;}
