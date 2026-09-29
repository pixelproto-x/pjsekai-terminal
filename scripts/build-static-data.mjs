import { writeFile } from "node:fs/promises";

const RAW="https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/";
const GACHA_URL=RAW+"gachas.json";
const CARD_URL=RAW+"cards.json";

function arr(x){
  if(Array.isArray(x)) return x;
  if(x && Array.isArray(x.data)) return x.data;
  if(x && Array.isArray(x.items)) return x.items;
  if(x && typeof x==="object") return Object.values(x);
  return [];
}
async function get(url){
  const r=await fetch(url);
  if(!r.ok) throw new Error(url+" -> HTTP "+r.status);
  return r.json();
}
function id(x){ return String(x?.id ?? x?.cardId ?? ""); }
function slimRate(x){
  return {
    cardRarityType:x?.cardRarityType ?? x?.rarityType ?? "",
    rate:Number(x?.rate ?? x?.probability ?? 0)
  };
}
function slimRef(x){
  return {
    id:x?.id ?? null,
    cardId:x?.cardId ?? null,
    weight:Number(x?.weight ?? 1)
  };
}
function slimGacha(g){
  return {
    id:g?.id ?? null,
    name:g?.name ?? g?.title ?? "",
    summary:g?.summary ?? "",
    startAt:g?.startAt ?? g?.start_at ?? null,
    endAt:g?.endAt ?? g?.end_at ?? null,
    gachaType:g?.gachaType ?? "",
    costCount:Number(g?.costCount ?? g?.cost_count ?? 300),
    gachaCardRarityRates:Array.isArray(g?.gachaCardRarityRates)?g.gachaCardRarityRates.map(slimRate):[],
    gachaPickups:Array.isArray(g?.gachaPickups)?g.gachaPickups.map(slimRef).filter(x=>x.id||x.cardId):[],
    gachaDetails:Array.isArray(g?.gachaDetails)?g.gachaDetails.map(slimRef).filter(x=>x.id||x.cardId):[]
  };
}
function slimCard(c){
  return {
    id:c?.id ?? c?.cardId ?? null,
    prefix:c?.prefix ?? c?.name ?? c?.title ?? "",
    name:c?.name ?? "",
    title:c?.title ?? "",
    assetbundleName:c?.assetbundleName ?? c?.assetBundleName ?? "",
    cardRarityType:c?.cardRarityType ?? c?.rarityType ?? "",
    attr:c?.attr ?? c?.attribute ?? "",
    characterId:c?.characterId ?? c?.gameCharacterId ?? c?.character?.id ?? null
  };
}

const [gRaw,cRaw]=await Promise.all([get(GACHA_URL),get(CARD_URL)]);
const gachas=arr(gRaw).map(slimGacha).filter(g=>g.id!=null);
gachas.sort((a,b)=>Date.parse(b.startAt||"")-Date.parse(a.startAt||""));
const recent=gachas.slice(0,1800);
const cards=arr(cRaw).map(slimCard).filter(c=>c.id!=null&&c.assetbundleName);

await writeFile("gacha-data.json",JSON.stringify({
  version:1,
  generatedAt:new Date().toISOString(),
  source:GACHA_URL,
  gachas:recent
}),"utf8");
await writeFile("gacha-cards.json",JSON.stringify({
  version:1,
  generatedAt:new Date().toISOString(),
  source:CARD_URL,
  cards
}),"utf8");

console.log("Generated",recent.length,"gachas and",cards.length,"cards.");
