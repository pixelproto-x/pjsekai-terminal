import { writeFile } from "node:fs/promises";

const RAW="https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/";
const BPM_RAW="https://raw.githubusercontent.com/StarMoe-org/MoeSekai-Hub/main/data/music_bpm/music_bpms.json";
async function get(name,url=RAW+name){
  const r=await fetch(url);
  if(!r.ok)throw new Error(name+" -> HTTP "+r.status);
  return r.json();
}
const [musics,vocals,difficulties,bpmPayload]=await Promise.all([
  get("musics.json"),
  get("musicVocals.json"),
  get("musicDifficulties.json"),
  get("music_bpms.json",BPM_RAW).catch(()=>({songs:[]}))
]);
const bpmById=new Map((Array.isArray(bpmPayload?.songs)?bpmPayload.songs:[]).map(x=>[Number(x?.music_id),x]));
const enrichedMusics=(Array.isArray(musics)?musics:[]).map(m=>{
  const meta=bpmById.get(Number(m?.id));
  if(!meta)return m;
  const bpms=Array.isArray(meta.bpms)?meta.bpms.map(Number).filter(Number.isFinite):[];
  const duration=Array.isArray(meta.bpm_segments)
    ? meta.bpm_segments.reduce((sum,row)=>sum+(Number(row?.duration_sec)||0),0)
    : 0;
  return {
    ...m,
    bpm:Number(meta.bpm)||0,
    bpmMax:bpms.length?Math.max(...bpms):Number(meta.bpm)||0,
    bpms,
    chartDuration:duration
  };
});
await writeFile("dojo-musics.json",JSON.stringify(enrichedMusics),"utf8");
await writeFile("dojo-vocals.json",JSON.stringify(vocals),"utf8");
await writeFile("dojo-difficulties.json",JSON.stringify(difficulties),"utf8");
console.log("Generated Dojo data:",Array.isArray(musics)?musics.length:0,"songs,",Array.isArray(vocals)?vocals.length:0,"vocals,",Array.isArray(difficulties)?difficulties.length:0,"difficulty rows.");
