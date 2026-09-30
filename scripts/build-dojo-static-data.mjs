import { writeFile } from "node:fs/promises";

const RAW="https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/";
async function get(name){
  const r=await fetch(RAW+name);
  if(!r.ok)throw new Error(name+" -> HTTP "+r.status);
  return r.json();
}
const [musics,vocals,difficulties]=await Promise.all([
  get("musics.json"),
  get("musicVocals.json"),
  get("musicDifficulties.json")
]);
await writeFile("dojo-musics.json",JSON.stringify(musics),"utf8");
await writeFile("dojo-vocals.json",JSON.stringify(vocals),"utf8");
await writeFile("dojo-difficulties.json",JSON.stringify(difficulties),"utf8");
console.log("Generated Dojo data:",Array.isArray(musics)?musics.length:0,"songs,",Array.isArray(vocals)?vocals.length:0,"vocals,",Array.isArray(difficulties)?difficulties.length:0,"difficulty rows.");
