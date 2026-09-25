// Undo snapshots keep the complete pose and its supporting-height preset together.
export function createPoseHistory(limit=50){
 const entries=[];
 return {get size(){return entries.length},save(state){entries.push(structuredClone({pose:state.pose,preset:state.preset,displayPreset:state.displayPreset}));if(entries.length>limit)entries.shift()},undo(){return entries.pop()??null}};
}
