/// <reference path="./index.d.ts" />

export const Blocks = new Map<i32,Map<i32,f32>>();
// Sonolus 1.1.3 stream functions (id -> key/value entries).
let stream_keys = new Map<f32,Array<f32>>();
let stream_values = new Map<f32,Array<f32>>();
// Break関係
let is_breaking:bool = false;
let breaked_count:i16 = 0;
let break_scopes:i16 = 0;
let return_break_val:f32 = 0.;

// グローバルスコープ
let functions:StaticArray<NodeFunc> = new StaticArray(0);
let func_of_nodes:StaticArray<i16> = new StaticArray(0);
let args_of_nodes:StaticArray<StaticArray<f32>> = new StaticArray(0);
let added_node_count:i32 = 0;
// NodeCalc preprocessing is split into ordering and execution by the bundled Sonolus player.
let preprocess_queue:Array<Array<f32>> = new Array<Array<f32>>();
let preprocess_active:bool = false;
let preprocess_execution_count:i32 = 0;
let preprocess_budget_exhausted:bool = false;
const PREPROCESS_EXECUTION_LIMIT:i32 = 1000000;
const NODE_LOOP_ITERATION_LIMIT:i32 = 10000;

export function init_nodes(nodes_count:i32):void{
    added_node_count = 0;
    func_of_nodes = new StaticArray<i16>(nodes_count);
    args_of_nodes = new StaticArray<StaticArray<f32>>(nodes_count);
}
export function add_node(func_id:i16, args:Array<f32>):void{
    func_of_nodes[added_node_count] = func_id;
    args_of_nodes[added_node_count] = StaticArray.fromArray<f32>(args);
    added_node_count++;
}

// sprite
let tex_transforms:Map<i32,StaticArray<f32>> = new Map<i32,StaticArray<f32>>();
export function add_tex_transforms(id:i32,mat:f32[]):void{
    tex_transforms.set(id,StaticArray.fromArray<f32>(mat));
}

// presentation
export let draw_sprites_info:Array<StaticArray<f32>> = new Array<StaticArray<f32>>();//[entity_id,sprite_id,z_index,alpha,n(頂点数、Drawのときは0),draw_type(Draw:0,curved_LR:1,curved_TB:2)]
export let draw_sprites_uvs:Array<StaticArray<f32>> = new Array<StaticArray<f32>>();
export let spawned_entities:i32 = 0;
export function refresh_draw_queue():void{
    draw_sprites_info = new Array<StaticArray<f32>>();
    draw_sprites_uvs = new Array<StaticArray<f32>>();
}
export function request_serialized_draw_queue():StaticArray<f32>{
    let len = 0;
    for(let i:i32 = 0;i<draw_sprites_info.length;i++){
        len += 7 + draw_sprites_uvs[i].length;//draw_sprites_infoとuv_lenとdraw_sprites_uvs
    }
    let output = new StaticArray<f32>(len);
    let offset = 0;
    for(let i:i32 = 0;i<draw_sprites_info.length;i++){
        let info = draw_sprites_info[i];
        let uv = draw_sprites_uvs[i];
        for(let j:i32 = 0;j<6;j++){
            output[offset+j] = info[j];
        }
        output[offset+6] = f32(uv.length);//uv_len
        offset += 7;
        for(let j:i32 = 0;j<uv.length;j++){
            output[offset+j] = uv[j];
        }
        offset += uv.length;
    }
    return output;
}

let loop_id_generated:f32 = 1.;
// export let effect_schedule:Array<StaticArray<f32>> = new Array<StaticArray<f32>>();//[effect_id,time(s),loop_id(ループではないなら、-1)] 
// export let effect_stop_schedule:Array<StaticArray<f32>> = new Array<StaticArray<f32>>();//[time(s),loop_id] 
export let effect_queue:Array<StaticArray<f32>> = new Array<StaticArray<f32>>();//[effect_id(loop_stopの時は-1),time(s),loop_id(ループではないなら、-1)] 
// export function remove_effect_schedule(idx:i32):void{
//     effect_schedule = effect_schedule.splice(idx,1);
// }
// export function remove_effect_stop_schedule(idx:i32):void{
//     effect_stop_schedule = effect_stop_schedule.splice(idx,1);
// }
export function refresh_effect_queue():void{
    effect_queue = new Array<StaticArray<f32>>();
}

export let update_background:bool = false;

//entities
let entities:Array<Entity> = new Array<Entity>();
let active_entities:Array<i32> = new Array<i32>();
let init_entities:Array<i32> = new Array<i32>();
class Entity{
    archetype_id:i32;
    by_func:bool;
    is_entity:bool;
    constructor(archetype_id:i32,by_func:bool,is_entity:bool){
        this.archetype_id = archetype_id;
        this.by_func = by_func;
        this.is_entity = is_entity;
    }
}
export function add_entity(archetype_id:i32,by_func:bool,is_entity:bool):void{
    entities.push(new Entity(archetype_id,by_func,is_entity));
}
let spawn_Q:Array<i32> = new Array<i32>();
let archetypes:StaticArray<Archetype> = new StaticArray(0);
let added_archetype_count:i32 = 0;

class Process_Order{
    index:i32;
    order:f32;
    runnable:bool;
    constructor(index:i32,order:f32){
        this.runnable = index != -1;
        this.index = index;
        this.order = order;
    }
}

class Archetype{
    preprocess:Process_Order;
    spawnOrder:Process_Order;
    shouldSpawn:Process_Order;
    initialize:Process_Order;
    updateSequential:Process_Order;
    touch:Process_Order;
    updateParallel:Process_Order;
    terminate:Process_Order;
    hasInput:bool
    constructor(
        preprocess_idx:i32,
        preprocess_odr:f32,
        spawnOrder_idx:i32,
        spawnOrder_odr:f32,
        shouldSpawn_idx:i32,
        shouldSpawn_odr:f32,
        initialize_idx:i32,
        initialize_odr:f32,
        updateSequential_idx:i32,
        updateSequential_odr:f32,
        touch_idx:i32,
        touch_odr:f32,
        updateParallel_idx:i32,
        updateParallel_odr:f32,
        terminate_idx:i32,
        terminate_odr:f32,
        hasInput:bool
    ){
        this.preprocess = new Process_Order(preprocess_idx,preprocess_odr);
        this.spawnOrder = new Process_Order(spawnOrder_idx,spawnOrder_odr);
        this.shouldSpawn = new Process_Order(shouldSpawn_idx,shouldSpawn_odr);
        this.initialize = new Process_Order(initialize_idx,initialize_odr);
        this.updateSequential = new Process_Order(updateSequential_idx,updateSequential_odr);
        this.touch = new Process_Order(touch_idx,touch_odr);
        this.updateParallel = new Process_Order(updateParallel_idx,updateParallel_odr);
        this.terminate = new Process_Order(terminate_idx,terminate_odr);
        this.hasInput = hasInput;
    }
}
export function init_archetypes(length:i32):void{
    archetypes = new StaticArray<Archetype>(length);
    added_archetype_count = 0;
}
export function add_archetype(
    preprocess_idx:i32,
    preprocess_odr:f32,
    spawnOrder_idx:i32,
    spawnOrder_odr:f32,
    shouldSpawn_idx:i32,
    shouldSpawn_odr:f32,
    initialize_idx:i32,
    initialize_odr:f32,
    updateSequential_idx:i32,
    updateSequential_odr:f32,
    touch_idx:i32,
    touch_odr:f32,
    updateParallel_idx:i32,
    updateParallel_odr:f32,
    terminate_idx:i32,
    terminate_odr:f32,
    hasInput:bool
):void{
    archetypes[added_archetype_count] = new Archetype(
        preprocess_idx,
        preprocess_odr,
        spawnOrder_idx,
        spawnOrder_odr,
        shouldSpawn_idx,
        shouldSpawn_odr,
        initialize_idx,
        initialize_odr,
        updateSequential_idx,
        updateSequential_odr,
        touch_idx,
        touch_odr,
        updateParallel_idx,
        updateParallel_odr,
        terminate_idx,
        terminate_odr,
        hasInput
    );
    added_archetype_count++;
}

//particle
let particle_id_generated:f32 = 1.;
let ptc_unique2effect:Map<f32,i32> = new Map<f32,i32>();
//[unique_id,0.(Spawn),ptc_efc_id,x1,y1,x2,y2,x3,y3,x4,y4,duration,isLooped]
//[unique_id,1.(Move),x1,y1,x2,y2,x3,y3,x4,y4]
//[unique_id,2.(Destroy)]
export let particle_queue:Array<StaticArray<f32>> = new Array<StaticArray<f32>>();
let ptc_transforms:Map<i32,StaticArray<f32>> = new Map<i32,StaticArray<f32>>();
export function add_ptc_transforms(id:i32,mat:f32[]):void{
    ptc_transforms.set(id,StaticArray.fromArray<f32>(mat));
}
export function refresh_ptc_queue():void{
    particle_queue = new Array<StaticArray<f32>>();
}

//TIMESCALE,BPM
let init_BPM:f32 = 60.;
let changing_BPM:Array<StaticArray<f32>> = new Array<StaticArray<f32>>(); //[start_beat,end_beat,start_time,end_time,BPM,offset]
let changing_TIMESCALE:Array<StaticArray<f32>> = new Array<StaticArray<f32>>(); //[start_beat,end_beat,start_time,end_time,TIMESCALE,offset]
export function add_changing_BPM(arr:f32[]):void{
    changing_BPM.push(StaticArray.fromArray<f32>(arr));
}
export function add_changing_TIMESCALE(arr:f32[]):void{
    changing_TIMESCALE.push(StaticArray.fromArray<f32>(arr));
}

//identifiers
let texture_ids:Array<i32> = new Array<i32>();
let effect_ids:Array<i32> = new Array<i32>();
let particle_ids:Array<i32> = new Array<i32>();
export function add_tex_id(id:i32):void{ texture_ids.push(id); }
export function add_efc_id(id:i32):void{ effect_ids.push(id); }
export function add_ptc_id(id:i32):void{ particle_ids.push(id); }

//configrations
let vertices:i32 = 2;
let curv_vertices:i32 = 2;
let AspectRatio:f32 = 1;
let C_height:i32 = 500;
let C_width:i32 = 500;
let is_debug:bool = false;


export function initializeProperties(
    _vertices:i32,
    _curv_vertices:i32,
    _AspectRatio:f32,
    _C_height:i32,
    _C_width:i32,
    _init_BPM:f32,
    _is_debug:bool,
):void{
    vertices = _vertices;
    curv_vertices = _curv_vertices;
    AspectRatio = _AspectRatio;
    C_height = _C_height;
    C_width = _C_width;
    is_debug = _is_debug;
    init_BPM = _init_BPM;
}

function array2map(array:f32[]):Map<i32,f32>{
    return array.reduce<Map<i32,f32>>((map,val,index):Map<i32,f32>=>{
        map.set(index,val);
        return map;
    },new Map<i32,f32>());
}

export function get_block_vals(block_id:i32):Array<f32>{
    if(Blocks.has(block_id)){
        return Blocks.get(block_id).values();
    }else{
        return new Array<f32>();
    }
    
}
export function get_block_keys(block_id:i32):Array<i32>{
    if(Blocks.has(block_id)){
        return Blocks.get(block_id).keys();
    }else{
        return new Array<i32>();
    }
}

export function set_block_vals(block_id:i32,vals:Array<f32>):void{
    Blocks.set(block_id,array2map(vals));
    if(block_id == 1005){
        update_background = true;
    }
}

export function get_block_val(entity_id:i32,block_id:i32,index:i32):f32{
    if(4000 <= block_id && block_id <= 4005){
        const block = Blocks.get(block_id+100);

        //インデックスの変換
        if(block_id == 4000){//EntityMemory
            index = entity_id*64+index;
        }else if(block_id == 4001){//EntityData
            index = entity_id*32+index;
        }else if(block_id == 4002){//EntitySharedMemory
            index = entity_id*32+index;
        }else if(block_id == 4003){//EntityInfo
            index = entity_id*3+index;
        }else if(block_id == 4004){//EntityDespawn
            index = entity_id;//EntityDespawnの要素は1つだけ
        }else{//EntityInput
            index = entity_id*4+index;
        }

        if(block.has(index)){
            return block.get(index);
        }else{
            //console.warn(`get_block_val: block:${block_id}の指定されたindex:${index}は存在しません。`);
            return 0.;
        }
    
        
    }else if(Blocks.has(block_id)){
        const block = Blocks.get(block_id);
        if(block.has(index)){
            return block.get(index);
        }else{
            //console.warn(`get_block_val: block:${block_id}の指定されたindex:${index}は存在しません。`);
            return 0.;
        }
    }else{
        console.warn(`[node_calc] get_block_val: block_id:${block_id} does not exist.`);
        return 0.;
    }
}

export function set_block_val(entity_id:i32,block_id:i32,index:i32, value:f32):void{
    if(4000 <= block_id && block_id <= 4005){
        const block = Blocks.get(block_id+100);

        //インデックスの変換
        if(block_id == 4000){//EntityMemory
            index = entity_id*64+index;
        }else if(block_id == 4001){//EntityData
            index = entity_id*32+index;
        }else if(block_id == 4002){//EntitySharedMemory
            index = entity_id*32+index;
        }else if(block_id == 4003){//EntityInfo
            index = entity_id*3+index;
        }else if(block_id == 4004){//EntityDespawn
            index = entity_id;//EntityDespawnの要素は1つだけ
        }else{//EntityInput
            index = entity_id*4+index;
        }

        block.set(index,value);
    }else if(Blocks.has(block_id)){
        Blocks.get(block_id).set(index,value);
        
        if(block_id == 1005){
            update_background = true;
        }
    }else{
        console.warn(`[node_calc] set_block_val: block_id:${block_id} does not exist.`);
    }
}

export function init_blocks(r_env:f32[], UIconfig:f32[], level_op:f32[]):void {
    Blocks.set(1000,array2map(r_env));//RuntimeEnvironment
    Blocks.set(1001,array2map(<f32[]>[0.,0.,0.,0.]));//RuntimeUpdate
    Blocks.set(1002,new Map<i32,f32>());//RuntimeTouchArray
    Blocks.set(1003,array2map(<f32[]>[//RuntimeSkinTransform
        1., 0., 0., 0.,
        0., 1., 0., 0.,
        0., 0., 1., 0.,
        0., 0., 0., 1.,
    ]));
    Blocks.set(1004,array2map(<f32[]>[//RuntimeParticleTransform
        1., 0., 0., 0.,
        0., 1., 0., 0.,
        0., 0., 1., 0.,
        0., 0., 0., 1.,
    ]));
    Blocks.set(1005,new Map<i32,f32>());//RuntimeBackground
    Blocks.set(1006,new Map<i32,f32>());//RuntimeUI
    Blocks.set(1007,array2map(UIconfig));//RuntimeUIConfiguration
    Blocks.set(2000,new Map<i32,f32>()); //LevelMemory
    Blocks.set(2001,new Map<i32,f32>());//LevelData
    Blocks.set(2002,array2map(level_op));//LevelOption
    Blocks.set(2003,new Map<i32,f32>());//LevelBucket
    Blocks.set(2004,new Map<i32,f32>());//LevelScore
    Blocks.set(2005,new Map<i32,f32>());//LevelLife
    Blocks.set(3000,new Map<i32,f32>());//EngineRom
    //4000,EntityMemoryはエンティティごとにインデックスが変換されてEntityMemoryArrayから取得される。
    //4001,EntityDataはエンティティごとにインデックスが変換されてEntityDataArrayから取得される。
    //4002,EntitySharedMemoryはエンティティごとにインデックスが変換されてEntitySharedMemoryArrayから取得される。
    //4003,EntityInfoはエンティティごとにインデックスが変換されてEntityInfoArrayから取得される。
    //4004,EntityDespawnはエンティティごとにインデックスが変換されてEntityDespawnArrayから取得される。
    //4005,EntityInputはエンティティごとにインデックスが変換されてEntityInputArrayから取得される。
    Blocks.set(4100,new Map<i32,f32>());//EntityMemoryArray
    Blocks.set(4101,new Map<i32,f32>());//EntityDataArray
    Blocks.set(4102,new Map<i32,f32>());//EntitySharedMemoryArray
    Blocks.set(4103,new Map<i32,f32>());//EntityInfoArray
    Blocks.set(4104,new Map<i32,f32>());//EntityDespawnArray
    Blocks.set(4105,new Map<i32,f32>());//EntityInputArray
    Blocks.set(5000,new Map<i32,f32>());//ArchetypeLife
    Blocks.set(10000,new Map<i32,f32>());//TemporaryMemory
}

export function reset_vars():void{
    Blocks.clear();
    stream_keys = new Map<f32,Array<f32>>();
    stream_values = new Map<f32,Array<f32>>();
    is_breaking = false;
    breaked_count = 0;
    break_scopes = 0;
    return_break_val = 0.;
    func_of_nodes = new StaticArray(0);
    args_of_nodes = new StaticArray(0);
    added_node_count = 0;
    preprocess_queue = new Array<Array<f32>>();
    preprocess_active = false;
    preprocess_execution_count = 0;
    preprocess_budget_exhausted = false;
    tex_transforms = new Map<i32,StaticArray<f32>>();
    draw_sprites_info = new Array<StaticArray<f32>>();
    draw_sprites_uvs = new Array<StaticArray<f32>>();
    spawned_entities = 0;
    loop_id_generated = 1.;
    effect_queue = new Array<StaticArray<f32>>();
    update_background = false;
    entities = new Array<Entity>();
    active_entities = new Array<i32>();
    init_entities = new Array<i32>();
    spawn_Q = new Array<i32>();
    archetypes = new StaticArray(0);
    added_archetype_count = 0;
    particle_id_generated = 1.;
    ptc_unique2effect.clear();
    particle_queue = new Array<StaticArray<f32>>();
    ptc_transforms.clear();
    init_BPM = 60.;
    changing_BPM = new Array<StaticArray<f32>>();
    changing_TIMESCALE = new Array<StaticArray<f32>>();
    texture_ids = new Array<i32>();
    effect_ids = new Array<i32>();
    particle_ids = new Array<i32>();
    vertices = 2;
    curv_vertices = 2;
    AspectRatio = 1;
    C_height = 500;
    C_width = 500;
    is_debug = false;
}

//###########
//　関数関係
//###########
type NodeType = (entity_id:i32,args:StaticArray<f32>) => f32;

class NodeFunc{
    func:NodeType;
    should_prerun:bool;
    func_name:string;
    constructor(func_name:string,func:NodeType,should_prerun:bool = true){
        this.func = func;
        this.should_prerun = should_prerun;
        this.func_name = func_name;
    }
}

functions = StaticArray.fromArray<NodeFunc>([
    //基本
    new NodeFunc("Value",Value,false),
    //ブレーク
    new NodeFunc("Break",Break),
    new NodeFunc("Block",Block,false),
    //処理
    new NodeFunc("While",While,false),
    new NodeFunc("DoWhile",DoWhile,false),
    new NodeFunc("Execute",Execute,false),
    new NodeFunc("Execute0",Execute0,false),
    new NodeFunc("If",If,false),
    new NodeFunc("Switch",Switch,false),
    new NodeFunc("SwitchWithDefault",SwitchWithDefault,false),
    new NodeFunc("SwitchInteger",SwitchInteger,false),
    new NodeFunc("SwitchIntegerWithDefault",SwitchIntegerWithDefault,false),
    new NodeFunc("JumpLoop",JumpLoop,false),
    //時間管理
    new NodeFunc("TimeToScaledTime",TimeToScaledTime),
    new NodeFunc("TimeToStartingScaledTime",TimeToStartingScaledTime),
    new NodeFunc("TimeToStartingTime",TimeToStartingTime),
    new NodeFunc("TimeToTimeScale",TimeToTimeScale),
    new NodeFunc("BeatToBPM",BeatToBPM),
    new NodeFunc("BeatToStartingBeat",BeatToStartingBeat),
    new NodeFunc("BeatToStartingTime",BeatToStartingTime),
    new NodeFunc("BeatToTime",BeatToTime),
    //算術
    new NodeFunc("Negate",Negate),
    new NodeFunc("Add",Add),
    new NodeFunc("Subtract",Subtract),
    new NodeFunc("Multiply",Multiply),
    new NodeFunc("Divide",Divide),
    new NodeFunc("Mod",Mod),
    new NodeFunc("Rem",Rem),
    new NodeFunc("Power",Power),
    new NodeFunc("Log",Log),
    new NodeFunc("Min",Min),
    new NodeFunc("Max",Max),
    new NodeFunc("Abs",Abs),
    new NodeFunc("Sign",Sign),
    new NodeFunc("Ceil",Ceil),
    new NodeFunc("Floor",Floor),
    new NodeFunc("Round",Round),
    new NodeFunc("Frac",Frac),
    new NodeFunc("Trunc",Trunc),
    new NodeFunc("Degree",Degree),
    new NodeFunc("Radian",Radian),
    new NodeFunc("Sin",Sin),
    new NodeFunc("Cos",Cos),
    new NodeFunc("Tan",Tan),
    new NodeFunc("Sinh",Sinh),
    new NodeFunc("Cosh",Cosh),
    new NodeFunc("Tanh",Tanh),
    new NodeFunc("Arcsin",Arcsin),
    new NodeFunc("Arccos",Arccos),
    new NodeFunc("Arctan",Arctan),
    new NodeFunc("Arctan2",Arctan2),
    //論理演算
    new NodeFunc("Equal",Equal),
    new NodeFunc("NotEqual",NotEqual),
    new NodeFunc("And",And,false),
    new NodeFunc("Or",Or,false),
    new NodeFunc("Not",Not),
    //比較演算
    new NodeFunc("Greater",Greater),
    new NodeFunc("GreaterOr",GreaterOr),
    new NodeFunc("Less",Less),
    new NodeFunc("LessOr",LessOr),
    //イージング
    new NodeFunc("EaseInSine",EaseInSine),
    new NodeFunc("EaseOutSine",EaseOutSine),
    new NodeFunc("EaseInOutSine",EaseInOutSine),
    new NodeFunc("EaseOutInSine",EaseOutInSine),
    new NodeFunc("EaseInQuad",EaseInQuad),
    new NodeFunc("EaseOutQuad",EaseOutQuad),
    new NodeFunc("EaseInOutQuad",EaseInOutQuad),
    new NodeFunc("EaseOutInQuad",EaseOutInQuad),
    new NodeFunc("EaseInCubic",EaseInCubic),
    new NodeFunc("EaseOutCubic",EaseOutCubic),
    new NodeFunc("EaseInOutCubic",EaseInOutCubic),
    new NodeFunc("EaseOutInCubic",EaseOutInCubic),
    new NodeFunc("EaseInQuart",EaseInQuart),
    new NodeFunc("EaseOutQuart",EaseOutQuart),
    new NodeFunc("EaseInOutQuart",EaseInOutQuart),
    new NodeFunc("EaseOutInQuart",EaseOutInQuart),
    new NodeFunc("EaseInQuint",EaseInQuint),
    new NodeFunc("EaseOutQuint",EaseOutQuint),
    new NodeFunc("EaseInOutQuint",EaseInOutQuint),
    new NodeFunc("EaseOutInQuint",EaseOutInQuint),
    new NodeFunc("EaseInExpo",EaseInExpo),
    new NodeFunc("EaseOutExpo",EaseOutExpo),
    new NodeFunc("EaseInOutExpo",EaseInOutExpo),
    new NodeFunc("EaseOutInExpo",EaseOutInExpo),
    new NodeFunc("EaseInCirc",EaseInCirc),
    new NodeFunc("EaseOutCirc",EaseOutCirc),
    new NodeFunc("EaseInOutCirc",EaseInOutCirc),
    new NodeFunc("EaseOutInCirc",EaseOutInCirc),
    new NodeFunc("EaseInBack",EaseInBack),
    new NodeFunc("EaseOutBack",EaseOutBack),
    new NodeFunc("EaseInOutBack",EaseInOutBack),
    new NodeFunc("EaseOutInBack",EaseOutInBack),
    new NodeFunc("EaseInElastic",EaseInElastic),
    new NodeFunc("EaseOutElastic",EaseOutElastic),
    new NodeFunc("EaseInOutElastic",EaseInOutElastic),
    new NodeFunc("EaseOutInElastic",EaseOutInElastic),
    //正規化
    new NodeFunc("Clamp",Clamp),
    new NodeFunc("Lerp",Lerp),
    new NodeFunc("LerpClamped",LerpClamped),
    new NodeFunc("Unlerp",Unlerp),
    new NodeFunc("UnlerpClamped",UnlerpClamped),
    new NodeFunc("Remap",Remap),
    new NodeFunc("RemapClamped",RemapClamped),
    new NodeFunc("Smoothstep",Smoothstep),
    //乱数
    new NodeFunc("Random",Random),
    new NodeFunc("RandomInteger",RandomInteger),
    //ブロック変数
    new NodeFunc("Get",Get),
    new NodeFunc("GetPointed",GetPointed),
    new NodeFunc("GetShifted",GetShifted),
    new NodeFunc("Set",Set),
    new NodeFunc("SetPointed",SetPointed),
    new NodeFunc("SetShifted",SetShifted),
    new NodeFunc("SetAdd",SetAdd),
    new NodeFunc("SetAddPointed",SetAddPointed),
    new NodeFunc("SetAddShifted",SetAddShifted),
    new NodeFunc("SetDivide",SetDivide),
    new NodeFunc("SetDividePointed",SetDividePointed),
    new NodeFunc("SetDivideShifted",SetDivideShifted),
    new NodeFunc("SetMod",SetMod),
    new NodeFunc("SetModPointed",SetModPointed),
    new NodeFunc("SetModShifted",SetModShifted),
    new NodeFunc("SetMultiply",SetMultiply),
    new NodeFunc("SetMultiplyPointed",SetMultiplyPointed),
    new NodeFunc("SetMultiplyShifted",SetMultiplyShifted),
    new NodeFunc("SetPower",SetPower),
    new NodeFunc("SetPowerPointed",SetPowerPointed),
    new NodeFunc("SetPowerShifted",SetPowerShifted),
    new NodeFunc("SetRem",SetRem),
    new NodeFunc("SetRemPointed",SetRemPointed),
    new NodeFunc("SetRemShifted",SetRemShifted),
    new NodeFunc("SetSubtract",SetSubtract),
    new NodeFunc("SetSubtractPointed",SetSubtractPointed),
    new NodeFunc("SetSubtractShifted",SetSubtractShifted),
    new NodeFunc("DecrementPost",DecrementPost),
    new NodeFunc("DecrementPostPointed",DecrementPostPointed),
    new NodeFunc("DecrementPostShifted",DecrementPostShifted),
    new NodeFunc("DecrementPre",DecrementPre),
    new NodeFunc("DecrementPrePointed",DecrementPrePointed),
    new NodeFunc("DecrementPreShifted",DecrementPreShifted),
    new NodeFunc("IncrementPost",IncrementPost),
    new NodeFunc("IncrementPostPointed",IncrementPostPointed),
    new NodeFunc("IncrementPostShifted",IncrementPostShifted),
    new NodeFunc("IncrementPre",IncrementPre),
    new NodeFunc("IncrementPrePointed",IncrementPrePointed),
    new NodeFunc("IncrementPreShifted",IncrementPreShifted),
    new NodeFunc("Copy",Copy),
    //スプライト描写
    new NodeFunc("Draw",Draw),
    new NodeFunc("DrawCurvedL",DrawCurvedL),
    new NodeFunc("DrawCurvedR",DrawCurvedR),
    new NodeFunc("DrawCurvedLR",DrawCurvedLR),
    new NodeFunc("DrawCurvedB",DrawCurvedB),
    new NodeFunc("DrawCurvedT",DrawCurvedT),
    new NodeFunc("DrawCurvedBT",DrawCurvedBT),
    new NodeFunc("DrawCurvedBT",DrawCurvedBT),
    //効果音
    new NodeFunc("Play",Play),
    new NodeFunc("PlayScheduled",PlayScheduled),
    new NodeFunc("PlayLooped",PlayLooped),
    new NodeFunc("PlayLoopedScheduled",PlayLoopedScheduled),
    new NodeFunc("StopLooped",StopLooped),
    new NodeFunc("StopLoopedScheduled",StopLoopedScheduled),
    //エンティティ生成
    new NodeFunc("Spawn",Spawn),
    //パーティクル
    new NodeFunc("SpawnParticleEffect",SpawnParticleEffect),
    new NodeFunc("MoveParticleEffect",MoveParticleEffect),
    new NodeFunc("DestroyParticleEffect",DestroyParticleEffect),
    //存在確認
    new NodeFunc("HasSkinSprite",HasSkinSprite),
    new NodeFunc("HasEffectClip",HasEffectClip),
    new NodeFunc("HasParticleEffect",HasParticleEffect),
    // Sonolus 1.1.3 stream functions
    new NodeFunc("StreamGetNextKey",StreamGetNextKey),
    new NodeFunc("StreamGetPreviousKey",StreamGetPreviousKey),
    new NodeFunc("StreamGetValue",StreamGetValue),
    new NodeFunc("StreamHas",StreamHas),
    new NodeFunc("StreamSet",StreamSet),
    //判定
    new NodeFunc("Judge",Judge),
    new NodeFunc("JudgeSimple",JudgeSimple),
    //未実装
    new NodeFunc("ExportValue",UnimplementedFunction),
    new NodeFunc("StackEnter",UnimplementedFunction),
    new NodeFunc("StackGet",UnimplementedFunction),
    new NodeFunc("StackGetFrame",UnimplementedFunction),
    new NodeFunc("StackGetFramePointer",UnimplementedFunction),
    new NodeFunc("StackGetPointer",UnimplementedFunction),
    new NodeFunc("StackGrow",UnimplementedFunction),
    new NodeFunc("StackInit",UnimplementedFunction),
    new NodeFunc("StackLeave",UnimplementedFunction),
    new NodeFunc("StackPop",UnimplementedFunction),
    new NodeFunc("StackPush",UnimplementedFunction),
    new NodeFunc("StackSet",UnimplementedFunction),
    new NodeFunc("StackSetFrame",UnimplementedFunction),
    new NodeFunc("StackSetFramePointer",UnimplementedFunction),
    new NodeFunc("StackSetPointer",UnimplementedFunction),
    //デバッグ
    new NodeFunc("IsDebug",IsDebug),
    new NodeFunc("DebugPause",DebugPause),
    new NodeFunc("DebugLog",DebugLog),
    //エラー回避
    new NodeFunc("UnknownFunction",UnknownFunction,false),
]);

export function get_function_names():Array<string>{
    let names = new Array<string>();
    for(let i:i32 = 0; i<functions.length; i++){
        names.push(functions[i].func_name);
    }
    return names;
}

export function name2func_id(func_name:string):i16{
    for(let i:i16 = 0; i<functions.length; i++){
        if(functions[i].func_name == func_name){
            return i;
        }
    }
    return -1;
}

func_of_nodes = StaticArray.fromArray<i16>([]);
args_of_nodes = StaticArray.fromArray<StaticArray<f32>>([]);

export function execute_cycle_process():void{
    
}

class Entity_Order{
    entity_id:i32;
    process_order:Process_Order;
    constructor(entity_id:i32,process_order:Process_Order){
        this.entity_id = entity_id;
        this.process_order = process_order;
    }
}

function comparator(a:f32,b:f32):i32{
    if(a == b){
        return 0;
    }else if(a > b){
        return 1;
    }else{
        return -1;
    }
}

// Match the two-step export contract used by sonolus-web/assets/index.js.
// The player calls preprocess_ordering() before its progress animation, then
// preprocess_batch() after it. The second function must perform the actual NodeCalc work.
export function preprocess_ordering():void{
    preprocess_queue = new Array<Array<f32>>();
    for(let i = 0;i<entities.length;i++){
        if(entities[i].is_entity){
            const order:Process_Order = archetypes[entities[i].archetype_id].preprocess;
            if(order.runnable){
                const entry = new Array<f32>();
                entry.push(order.order);
                entry.push(<f32>order.index);
                entry.push(<f32>i);
                preprocess_queue.push(entry);
            }
        }
    }
    preprocess_queue.sort((a:Array<f32>,b:Array<f32>) => comparator(a[0],b[0]));
}

export function preprocess_batch():void{
    preprocess_active = true;
    preprocess_execution_count = 0;
    preprocess_budget_exhausted = false;
    for(let i=0;i<preprocess_queue.length;i++){
        const entry = preprocess_queue[i];
        run_node(i32(entry[1]),i32(entry[2]));
    }
    preprocess_active = false;
    preprocess_queue = new Array<Array<f32>>();
}

// Retain the original combined entry point for any callers that still use it.
export function preprocess():void{
    preprocess_ordering();
    preprocess_batch();
}

class Spawn_Order{
    entity_id:i32;
    value:f32;
    constructor(entity_id:i32,value:f32){
        this.entity_id = entity_id;
        this.value = value;
    }
}

export function spawnOrder():void{
    let entity_orders = new Array<Entity_Order>();
    for(let i = 0;i<entities.length;i++){
        if(entities[i].is_entity){
            entity_orders.push(new Entity_Order(i,archetypes[entities[i].archetype_id].spawnOrder));
        }
    }
    entity_orders.sort((a:Entity_Order,b:Entity_Order) => comparator(a.process_order.order,b.process_order.order));
    let spawn_orders = new Array<Spawn_Order>();
    for(let i = 0;i<entity_orders.length;i++){
        let entity_order = entity_orders[i];
        if(entity_order.process_order.runnable){
            let result:f32 = run_node(entity_order.process_order.index,entity_order.entity_id);
            spawn_orders.push(new Spawn_Order(
                entity_order.entity_id,
                result
            ));
        }else{
            spawn_orders.push(new Spawn_Order(
                entity_order.entity_id,
                0.
            ));
        }
    }
    spawn_orders = spawn_orders.reverse();
    spawn_orders.sort((a:Spawn_Order,b:Spawn_Order) => comparator(b.value,a.value));
    spawn_Q = spawn_orders.map<i32>((spawn_order:Spawn_Order) => spawn_order.entity_id);
}

export function shouldSpawn():void{
    while(spawn_Q.length > 0){
        let entity_id = spawn_Q[spawn_Q.length-1];
        let callback = archetypes[entities[entity_id].archetype_id].shouldSpawn;
        if(callback.runnable){
            let result = run_node(callback.index,entity_id);
            if(result){
                init_entities.push(entity_id);
                spawn_Q.pop();
                set_block_val(entity_id,4003,2,1.);
            }else{
                break;
            }
        }else{
            init_entities.push(entity_id);
            spawn_Q.pop();
            set_block_val(entity_id,4003,2,1.);
        }
    }
    set_block_val(0,4103,2,2.);//なんかこれないと動かん
}

export function initialize():void{
    for(let i = 0;i<init_entities.length;i++){
        let entity_id = init_entities[i];
        let callback = archetypes[entities[entity_id].archetype_id].initialize;
        if(callback.runnable){
            run_node(callback.index,entity_id);
        }
        active_entities.push(entity_id);
    }
    init_entities = new Array<i32>();
}

export function updateSequential():void{
    //アーキタイプのorder順に整列
    let entity_orders = new Array<Entity_Order>();
    for(let i = 0;i<active_entities.length;i++){
        let entity_id = active_entities[i];
        let callback:Process_Order = archetypes[entities[entity_id].archetype_id].updateSequential;
        if(callback.runnable){//updateSequential属性があるやつのみ
            entity_orders.push(new Entity_Order(entity_id,callback));
        }
    }
    entity_orders.sort((a:Entity_Order,b:Entity_Order) => comparator(a.process_order.order,b.process_order.order));
    //実行
    for(let i = 0;i<entity_orders.length;i++){
        let entity_order = entity_orders[i];
        run_node(entity_order.process_order.index,entity_order.entity_id);
    }
}

export function input_callback():void{
    //アーキタイプのorder順に整列
    let entity_orders = new Array<Entity_Order>();
    for(let i = 0;i<active_entities.length;i++){
        let entity_id = active_entities[i];
        let callback:Process_Order = archetypes[entities[entity_id].archetype_id].touch;
        if(callback.runnable){//updateSequential属性があるやつのみ
            entity_orders.push(new Entity_Order(entity_id,callback));
        }
    }
    entity_orders.sort((a:Entity_Order,b:Entity_Order) => comparator(a.process_order.order,b.process_order.order));
    //実行
    for(let i = 0;i<entity_orders.length;i++){
        let entity_order = entity_orders[i];
        run_node(entity_order.process_order.index,entity_order.entity_id);
    }
}

export function updateParallel():void{
    for(let i = 0;i<active_entities.length;i++){
        let entity_id = active_entities[i];
        let callback = archetypes[entities[entity_id].archetype_id].updateParallel;
        if(callback.runnable){
            run_node(callback.index,entity_id);
        }
    }
}

export function despawning():Array<Array<f32>>{
    let result:Array<Array<f32>> = new Array<Array<f32>>();//[判定値,体力増減値,精度,スコア増減値,バケットID,バケット値]
    for(let i = 0;i<active_entities.length;i++){
        let entity_id = active_entities[i];
        if(get_block_val(entity_id,4004,0)){
            let entity = entities[entity_id];
            let archetype = archetypes[entity.archetype_id];
            if(archetype.terminate.runnable){
                run_node(archetype.terminate.index,entity_id);
            }
            active_entities.splice(i,1);
            if(archetype.hasInput && !entity.by_func){
                set_block_val(entity_id,4003,2,2.);
                switch(u32(get_block_val(entity_id,4005,0))){
                    case 0://miss
                        result.push([
                            <f32>0.,
                            get_block_val(entity_id,5000,entity.archetype_id*4+3),
                            Mathf.max(1.-Mathf.abs(get_block_val(entity_id,4005,1)),0.),
                            <f32>0.,
                            get_block_val(entity_id,4005,2),
                            get_block_val(entity_id,4005,3),
                        ]);
                        break;
                    case 1://perfect
                        result.push([
                            <f32>1.,
                            get_block_val(entity_id,5000,entity.archetype_id*4),
                            Mathf.max(1.-Mathf.abs(get_block_val(entity_id,4005,1)),0.),
                            <f32>1.,
                            get_block_val(entity_id,4005,2),
                            get_block_val(entity_id,4005,3),
                        ]);
                        break;
                    case 2://great
                        result.push([
                            <f32>2.,
                            get_block_val(entity_id,5000,entity.archetype_id*4+1),
                            Mathf.max(1.-Mathf.abs(get_block_val(entity_id,4005,1)),0.),
                            get_block_val(entity_id,2004,1)/get_block_val(entity_id,2004,0),
                            get_block_val(entity_id,4005,2),
                            get_block_val(entity_id,4005,3),
                        ]);
                        break;
                    case 3://good
                        result.push([
                            <f32>3.,
                            get_block_val(entity_id,5000,entity.archetype_id*4+2),
                            Mathf.max(1.-Mathf.abs(get_block_val(entity_id,4005,1)),0.),
                            get_block_val(entity_id,2004,2)/get_block_val(entity_id,2004,0),
                            get_block_val(entity_id,4005,2),
                            get_block_val(entity_id,4005,3),
                        ]);
                        break;
                }
            }
        }
    }
    return result;
}

export function run_node(index:i32,entity_id:i32):f32{
    // Bound pathological/cyclic chart graphs so one corrupt node cannot freeze the whole iframe.
    if(preprocess_active){
        if(preprocess_budget_exhausted) return 0.;
        preprocess_execution_count++;
        if(preprocess_execution_count > PREPROCESS_EXECUTION_LIMIT){
            preprocess_budget_exhausted = true;
            console.error("[NodeCalc] preprocess execution budget exceeded");
            return 0.;
        }
    }
    if(0 <= index && index <= func_of_nodes.length){
        const node:NodeFunc = functions[func_of_nodes[index]];
        
        if(node.should_prerun){//事前実行必要関数
            let args = run_nodes(args_of_nodes[index],entity_id);
            if(is_breaking){
                return 0.;
            }else{
                return node.func(entity_id,args);
            }
        }else{//事前実行不要関数
            return node.func(entity_id,args_of_nodes[index]);
        }
        
    }else{
        console.error(`[node_calc] run_node: index:${index} is out of the range of nodes.`);
        return 0.;
    }
    
}

export function run_nodes(indexes:StaticArray<f32>,entity_id:i32):StaticArray<f32>{
    let values:StaticArray<f32> = new StaticArray<f32>(indexes.length);
    for(let i:i32 = 0;i<indexes.length;i++){
        values[i] = run_node(i32(indexes[i]),entity_id);
        if(is_breaking){
            break;
        }
    }
    return values;
}

//#######
//　関数
//#######

function Value(entity_id:i32,args:StaticArray<f32>):f32{
    return args[0];
}

function Break(entity_id:i32,args:StaticArray<f32>):f32{
    is_breaking = true;
    breaked_count = 0;
    break_scopes = i16(args[0]);
    return_break_val = args[1];
    return 0.;
}

function Block(entity_id:i32,args:StaticArray<f32>):f32{
    let result = run_node(i32(args[0]),entity_id);
    if(is_breaking){
        breaked_count++;
        if(breaked_count >= break_scopes){
            is_breaking = false;
            return return_break_val;
        }else{
            return result;
        }
    }else{
        return result;
    }
}

function While(entity_id:i32,args:StaticArray<f32>):f32{
    for(let iteration:i32=0;iteration<NODE_LOOP_ITERATION_LIMIT;iteration++){
        if(!run_node(i32(args[0]),entity_id)) return 0.;
        if(is_breaking) return 0.;

        run_node(i32(args[1]),entity_id);
        if(is_breaking) return 0.;
    }
    console.error("[NodeCalc] While loop iteration limit exceeded");
    return 0.;
}

function DoWhile(entity_id:i32,args:StaticArray<f32>):f32{
    for(let iteration:i32=0;iteration<NODE_LOOP_ITERATION_LIMIT;iteration++){
        run_node(i32(args[0]),entity_id);
        if(is_breaking) return 0.;

        if(!run_node(i32(args[1]),entity_id)) return 0.;
        if(is_breaking) return 0.;
    }
    console.error("[NodeCalc] DoWhile loop iteration limit exceeded");
    return 0.;
}

function Execute(entity_id:i32,args:StaticArray<f32>):f32{
    for(let i:i32 = 0;i<args.length-1;i++){
        run_node(i32(args[i]),entity_id);
        if(is_breaking) return 0.;
    }
    return run_node(i32(args[args.length-1]),entity_id);
}

function Execute0(entity_id:i32,args:StaticArray<f32>):f32{
    for(let i:i32 = 0;i<args.length;i++){
        run_node(i32(args[i]),entity_id);
        if(is_breaking) return 0.;
    }
    return 0.;
}

function If(entity_id:i32,args:StaticArray<f32>):f32{
    let test_result = run_node(i32(args[0]),entity_id);
    if(is_breaking) return 0.;

    if(test_result){
        return run_node(i32(args[1]),entity_id);
    }else{
        return run_node(i32(args[2]),entity_id);
    }
}

function Switch(entity_id:i32,args:StaticArray<f32>):f32{
    let discriminant = run_node(i32(args[0]),entity_id);
    if(is_breaking) return 0.;

    for(let i:i32 = 0;i<(args.length-1)/2;i++){
        let test = run_node(i32(args[i*2+1]),entity_id);
        if(is_breaking) return 0.;

        if(test == discriminant){
            return run_node(i32(args[i*2+2]),entity_id);
        }
    }
    return 0;
}

function SwitchWithDefault(entity_id:i32,args:StaticArray<f32>):f32{
    let discriminant = run_node(i32(args[0]),entity_id);
    if(is_breaking) return 0.;

    for(let i:i32 = 0;i<(args.length-2)/2;i++){
        let test = run_node(i32(args[i*2+1]),entity_id);
        if(is_breaking) return 0.;

        if(test == discriminant){
            return run_node(i32(args[i*2+2]),entity_id);
        }
    }
    return run_node(i32(args[args.length-1]),entity_id);
}

function SwitchInteger(entity_id:i32,args:StaticArray<f32>):f32{
    let discriminant = i32(run_node(i32(args[0]),entity_id));
    if(is_breaking) return 0.;

    for(let i:i32 = 0;i<args.length-1;i++){
        if(i == discriminant){
            return run_node(i32(args[i+1]),entity_id);
        }
    }
    return 0.;
}

function SwitchIntegerWithDefault(entity_id:i32,args:StaticArray<f32>):f32{
    let discriminant = i32(run_node(i32(args[0]),entity_id));
    if(is_breaking) return 0.;

    for(let i:i32 = 0;i<args.length-2;i++){
        if(i == discriminant){
            return run_node(i32(args[i+1]),entity_id);
        }
    }
    return run_node(i32(args[args.length-1]),entity_id);
}

function JumpLoop(entity_id:i32,args:StaticArray<f32>):f32{
    let idx:i32 = 0;
    for(let iteration:i32=0;iteration<NODE_LOOP_ITERATION_LIMIT;iteration++){
        if(idx < 0 || idx > args.length-1) return 0.;
        idx = i32(run_node(i32(args[idx]),entity_id));
        if(is_breaking) return 0.;
        if(idx > args.length-1 || idx < 0) return 0.;
        if(idx == args.length-1) return run_node(i32(args[args.length-1]),entity_id);
    }
    console.error("[NodeCalc] JumpLoop iteration limit exceeded");
    return 0.;
}

function TimeToScaledTime(entity_id:i32,args:StaticArray<f32>):f32{
    for(let i:i32 = 0;i<changing_TIMESCALE.length;i++){
        let step = changing_TIMESCALE[i];
        if(args[0] >= step[2] && args[0] <= step[3]){//time >= step.start_time && time <= step.end_time
            return step[4] * args[0] + step[5];//step.TIMESCALE * time + step.offset
        }
    }
    return args[0];
}

function TimeToStartingScaledTime(entity_id:i32,args:StaticArray<f32>):f32{
    for(let i:i32 = 0;i<changing_TIMESCALE.length;i++){
        let step = changing_TIMESCALE[i];
        if(args[0] >= step[2] && args[0] <= step[3]){//time >= step.start_time && time <= step.end_time
            return step[4] * step[2] + step[5];//step.TIMESCALE * step.start_time + step.offset
        }
    }
    return 0.;
}

function TimeToStartingTime(entity_id:i32,args:StaticArray<f32>):f32{
    for(let i:i32 = 0;i<changing_TIMESCALE.length;i++){
        let step = changing_TIMESCALE[i];
        if(args[0] >= step[2] && args[0] <= step[3]){//time >= step.start_time && time <= step.end_time
            return step[2];//step.start_time
        }
    }
    return 0.;
}

function TimeToTimeScale(entity_id:i32,args:StaticArray<f32>):f32{
    for(let i:i32 = 0;i<changing_TIMESCALE.length;i++){
        let step = changing_TIMESCALE[i];
        if(args[0] >= step[2] && args[0] <= step[3]){//time >= step.start_time && time <= step.end_time
            return step[4];//step.TIMESCALE
        }
    }
    return 1.;
}

function BeatToBPM(entity_id:i32,args:StaticArray<f32>):f32{
    for(let i:i32 = 0;i<changing_BPM.length;i++){
        let step = changing_BPM[i];
        if(args[0] >= step[0] && args[0] <= step[1]){//beat >= step.start_beat && beat <= step.end_beat
            return step[4];//step.BPM
        }
    }
    return init_BPM;
}

function BeatToStartingBeat(entity_id:i32,args:StaticArray<f32>):f32{
    for(let i:i32 = 0;i<changing_BPM.length;i++){
        let step = changing_BPM[i];
        if(args[0] >= step[0] && args[0] <= step[1]){//beat >= step.start_beat && beat <= step.end_beat
            return step[0];//step.start_beat
        }
    }
    return 0.;
}

function BeatToStartingTime(entity_id:i32,args:StaticArray<f32>):f32{
    for(let i:i32 = 0;i<changing_BPM.length;i++){
        let step = changing_BPM[i];
        if(args[0] >= step[0] && args[0] <= step[1]){//beat >= step.start_beat && beat <= step.end_beat
            return step[2];//step.start_time
        }
    }
    return 0.;
}

function BeatToTime(entity_id:i32,args:StaticArray<f32>):f32{
    for(let i:i32 = 0;i<changing_BPM.length;i++){
        let step = changing_BPM[i];
        if(args[0] >= step[0] && args[0] <= step[1]){//beat >= step.start_beat && beat <= step.end_beat
            return (args[0] - step[5]) / (step[4] / 60.);//(beat - step.offset) / (step.BPM / 60)
        }
    }
    return args[0] / (init_BPM / 60.);//(beat - 0) / (this.init_BPM / 60)
}


function Negate(entity_id:i32,args:StaticArray<f32>):f32{
    return -args[0];
}

function Add(entity_id:i32,args:StaticArray<f32>):f32{
    let output:f32 = 0.;
    for(let i:i16 = 0; i<args.length; i++){
        output += args[i];
    }
    return output;
}

function Subtract(entity_id:i32,args:StaticArray<f32>):f32{
    let output:f32 = args[0];
    for(let i:i16 = 1; i<args.length; i++){
        output -= args[i];
    }
    return output;
}

function Multiply(entity_id:i32,args:StaticArray<f32>):f32{
    let output:f32 = args[0];
    for(let i:i16 = 1; i<args.length; i++){
        output *= args[i];
    }
    return output;
}

function Divide(entity_id:i32,args:StaticArray<f32>):f32{
    let output:f32 = args[0];
    for(let i:i16 = 1; i<args.length; i++){
        output /= args[i];
    }
    return output;
}

function modulo(n:f32,d:f32):f32{
    return ((n % d) + d) % d;
}

export function Mod(entity_id:i32,args:StaticArray<f32>):f32{
    let output:f32 = args[0];
    for(let i:i16 = 1; i<args.length; i++){
        output = modulo(output,args[i]);
    }
    return output;
}

function Rem(entity_id:i32,args:StaticArray<f32>):f32{
    let output:f32 = args[0];
    for(let i:i16 = 1; i<args.length; i++){
        output %= args[i];
    }
    return output;
}

function Power(entity_id:i32,args:StaticArray<f32>):f32{
    let output:f32 = args[0];
    for(let i:i16 = 1; i<args.length; i++){
        output = Mathf.pow(output,args[i]);
    }
    return output;
}

function Log(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.log(args[0]);
}

function Equal(entity_id:i32,args:StaticArray<f32>):f32{
    return (args[0] == args[1]) ? 1. : 0.;
}

function NotEqual(entity_id:i32,args:StaticArray<f32>):f32{
    return (args[0] != args[1]) ? 1. : 0.;
}

function Greater(entity_id:i32,args:StaticArray<f32>):f32{
    return (args[0] > args[1]) ? 1. : 0.;
}

function GreaterOr(entity_id:i32,args:StaticArray<f32>):f32{
    return (args[0] >= args[1]) ? 1. : 0.;
}

function Less(entity_id:i32,args:StaticArray<f32>):f32{
    return (args[0] < args[1]) ? 1. : 0.;
}

function LessOr(entity_id:i32,args:StaticArray<f32>):f32{
    return (args[0] <= args[1]) ? 1. : 0.;
}

// BO Easing Functions

function EaseInSine(entity_id:i32,args:StaticArray<f32>):f32{
    return 1 - Mathf.cos((args[0] * Mathf.PI) / 2.);
}

function EaseOutSine(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.sin((args[0] * Mathf.PI) / 2.);
}

function EaseInOutSine(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseInSine(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseOutSine(entity_id,args) / 2. + 0.5;
    }
}

function EaseOutInSine(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseOutSine(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseInSine(entity_id,args) / 2. + 0.5;
    }
}

function EaseInQuad(entity_id:i32,args:StaticArray<f32>):f32{
    let x = args[0];
    return x * x;
}

function EaseOutQuad(entity_id:i32,args:StaticArray<f32>):f32{
    let x = args[0];
    return 1. - (1. - x) * (1. - x);
}

function EaseInOutQuad(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseInQuad(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseOutQuad(entity_id,args) / 2. + 0.5;
    }
}

function EaseOutInQuad(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseOutQuad(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseInQuad(entity_id,args) / 2. + 0.5;
    }
}

function EaseInCubic(entity_id:i32,args:StaticArray<f32>):f32{
    let x = args[0];
    return x * x * x;
}

function EaseOutCubic(entity_id:i32,args:StaticArray<f32>):f32{
    let x = args[0];
    return 1. - Mathf.pow(1. - x, 3);
}

function EaseInOutCubic(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseInCubic(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseOutCubic(entity_id,args) / 2. + 0.5;
    }
}

function EaseOutInCubic(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseOutCubic(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseInCubic(entity_id,args) / 2. + 0.5;
    }
}

function EaseInQuart(entity_id:i32,args:StaticArray<f32>):f32{
    let x = args[0];
    return x * x * x * x;
}

function EaseOutQuart(entity_id:i32,args:StaticArray<f32>):f32{
    let x = args[0];
    return 1. - Mathf.pow(1. - x, 4);
}

function EaseInOutQuart(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseInQuart(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseOutQuart(entity_id,args) / 2. + 0.5;
    }
}

function EaseOutInQuart(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseOutQuart(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseInQuart(entity_id,args) / 2. + 0.5;
    }
}

function EaseInQuint(entity_id:i32,args:StaticArray<f32>):f32{
    let x = args[0];
    return x * x * x * x * x;
}

function EaseOutQuint(entity_id:i32,args:StaticArray<f32>):f32{
    let x = args[0];
    return 1. - Mathf.pow(1. - x, 5);
}

function EaseInOutQuint(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseInQuint(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseOutQuint(entity_id,args) / 2. + 0.5;
    }
}

function EaseOutInQuint(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseOutQuint(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseInQuint(entity_id,args) / 2. + 0.5;
    }
}

function EaseInExpo(entity_id:i32,args:StaticArray<f32>):f32{
    let x = args[0];
    return x === 0. ? 0. : Mathf.pow(2., 10. * x - 10.);
}

function EaseOutExpo(entity_id:i32,args:StaticArray<f32>):f32{
    let x = args[0];
    return x === 1. ? 1. : 1. - Mathf.pow(2., -10. * x);
}

function EaseInOutExpo(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseInExpo(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseOutExpo(entity_id,args) / 2. + 0.5;
    }
}

function EaseOutInExpo(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseOutExpo(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseInExpo(entity_id,args) / 2. + 0.5;
    }
}

function EaseInCirc(entity_id:i32,args:StaticArray<f32>):f32{
    let x = args[0];
    return 1. - Mathf.sqrt(1. - Mathf.pow(x, 2));
}

function EaseOutCirc(entity_id:i32,args:StaticArray<f32>):f32{
    let x = args[0];
    return Mathf.sqrt(1. - Mathf.pow(x - 1., 2));
}

function EaseInOutCirc(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseInCirc(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseOutCirc(entity_id,args) / 2. + 0.5;
    }
}

function EaseOutInCirc(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseOutCirc(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseInCirc(entity_id,args) / 2. + 0.5;
    }
}

function EaseInBack(entity_id:i32,args:StaticArray<f32>):f32{
    let x = args[0];
    return 2.70158 * x * x * x - 1.70158 * x * x;
}

function EaseOutBack(entity_id:i32,args:StaticArray<f32>):f32{
    let x = args[0];
    return 1. + 2.70158 * Mathf.pow(x - 1, 3) + 1.70158 * Mathf.pow(x - 1, 2);
}

function EaseInOutBack(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseInBack(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseOutBack(entity_id,args) / 2. + 0.5;
    }
}

function EaseOutInBack(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseOutBack(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseInBack(entity_id,args) / 2. + 0.5;
    }
}

function EaseInElastic(entity_id:i32,args:StaticArray<f32>):f32{
    let x = args[0];

    return x === 0
      ? 0
      : x === 1
      ? 1
      : -Mathf.pow(2., 10. * x - 10.) * Mathf.sin((x * 10. - 10.75) * ((2. * Mathf.PI) / 3.));
}

function EaseOutElastic(entity_id:i32,args:StaticArray<f32>):f32{
    let x = args[0];

    return x === 0
    ? 0
    : x === 1
    ? 1
    : Mathf.pow(2., -10. * x) * Mathf.sin((x * 10. - 0.75) * ((2. * Mathf.PI) / 3.)) + 1.;
}

function EaseInOutElastic(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseInElastic(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseOutElastic(entity_id,args) / 2. + 0.5;
    }
}

function EaseOutInElastic(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < 0.5){
        args[0] /= 0.5;
        return EaseOutElastic(entity_id,args) / 2.;
    }else{
        args[0] = args[0] * 2. - 1.;
        return EaseInElastic(entity_id,args) / 2. + 0.5;
    }
}

// EO Easing Functions 

function And(entity_id:i32,args:StaticArray<f32>):f32{//事前実行不要関数
    for(let i:i32 = 0; i < args.length; i++){
        let test = run_node(i32(args[i]),entity_id);
        if(is_breaking){
            return 0.;
        }
        if(test == 0.){
            return 0.;
        }
    }
    return 1.;
}

function Or(entity_id:i32,args:StaticArray<f32>):f32{//事前実行不要関数
    for(let i:i32 = 0; i < args.length; i++){
        let test = run_node(i32(args[i]),entity_id);
        if(is_breaking){
            return 0.;
        }
        if(test != 0.){
            return 1.;
        }
    }
    return 0.;
}

function Not(entity_id:i32,args:StaticArray<f32>):f32{
    return args[0] ? 0. : 1.;
}

function Min(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.min(args[0],args[1]);
}

function Max(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.max(args[0],args[1]);
}

function Abs(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.abs(args[0]);
}

function Sign(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.sign(args[0]);
}

function Ceil(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.ceil(args[0]);
}

function Floor(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.floor(args[0]);
}

function Round(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.round(args[0]);
}

function Frac(entity_id:i32,args:StaticArray<f32>):f32{
    return args[0] % 1;
}

function Trunc(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.trunc(args[0]);
}

function Degree(entity_id:i32,args:StaticArray<f32>):f32{
    return args[0] * ( 180 / Mathf.PI );
}

function Radian(entity_id:i32,args:StaticArray<f32>):f32{
    return args[0] * ( Mathf.PI / 180 );
}

function Sin(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.sin(args[0]);
}

function Cos(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.cos(args[0]);
}

function Tan(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.tan(args[0]);
}

function Sinh(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.sinh(args[0]);
}

function Cosh(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.cosh(args[0]);
}

function Tanh(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.tanh(args[0]);
}

function Arcsin(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.asin(args[0]);
}

function Arccos(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.acos(args[0]);
}

function Arctan(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.atan(args[0]);
}

function Arctan2(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.atan2(args[0],args[1]);
}

function Clamp(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] < args[1]){
        return args[1];
    }else if(args[0] > args[2]){
        return args[2];
    }else{
        return args[0];
    }
}

function Lerp(entity_id:i32,args:StaticArray<f32>):f32{
    return args[0] + (args[1] - args[0]) * args[2];
}

function LerpClamped(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[2] < 0.){
        return args[0];
    }else if(args[2] > 1.){
        return args[1];
    }else{
        return args[0] + (args[1] - args[0]) * args[2];
    }
}

function Unlerp(entity_id:i32,args:StaticArray<f32>):f32{
    return (args[2] - args[0]) / (args[1] - args[0]);
}

function UnlerpClamped(entity_id:i32,args:StaticArray<f32>):f32{
    let y = (args[2] - args[0]) / (args[1] - args[0]);
    if(y < 0){
        return 0;
    }else if(y > 1){
        return 1;
    }else{
        return y;
    }
}

function Remap(entity_id:i32,args:StaticArray<f32>):f32{
    return args[2] + (args[3] - args[2]) * ((args[4] - args[0]) / (args[1] - args[0]));
}

function RemapClamped(entity_id:i32,args:StaticArray<f32>):f32{
    let min1 = args[0], max1 = args[1], min2 = args[2], max2 = args[3], x = args[4];
    let y = min2 + (max2 - min2) * (x - min1) / (max1 - min1);
    if(y < Mathf.min(min2,max2)){
        return Mathf.min(min2,max2);
    }else if(y > Mathf.max(min2,max2)){
        return Mathf.max(min2,max2);
    }else{
        return y;
    }
}

function Smoothstep(entity_id:i32,args:StaticArray<f32>):f32{
    var x = Mathf.max(0, Mathf.min(1, (args[2]-args[0])/(args[1]-args[0])));
    return x*x*(3 - 2*x);
}

function Random(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.random() * (args[1] - args[0]) + args[0];
}

function RandomInteger(entity_id:i32,args:StaticArray<f32>):f32{
    return Mathf.floor(Mathf.random() * (args[1] - args[0]) + args[0]);
}

function Get(entity_id:i32,args:StaticArray<f32>):f32{
    return get_block_val(entity_id, i32(args[0]), i32(args[1]));
}

function GetPointed(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let pointed_id = get_block_val(entity_id,id,index);
    let pointed_index = get_block_val(entity_id,id,index+1) + args[2];
    return get_block_val(entity_id, i32(pointed_id), i32(pointed_index));
}

function GetShifted(entity_id:i32,args:StaticArray<f32>):f32{
    return get_block_val(entity_id, i32(args[0]), i32(args[1] + args[2] * args[3]));
}

function Set(entity_id:i32,args:StaticArray<f32>):f32{
    set_block_val(entity_id, i32(args[0]), i32(args[1]), args[2]);
    return args[2];
}

function SetPointed(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]), value = args[3];
    let pointed_id = get_block_val(entity_id,id,index);
    let pointed_index = get_block_val(entity_id,id,index+1) + args[2];
    set_block_val(entity_id, i32(pointed_id), i32(pointed_index), value);
    return value;
}

function SetShifted(entity_id:i32,args:StaticArray<f32>):f32{
    set_block_val(entity_id, i32(args[0]), i32(args[1] + args[2] * args[3]), args[4]);
    return args[4];
}

function SetAdd(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val + args[2]);
    return args[2];
}

function SetAddPointed(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let pointed_id = get_block_val(entity_id,id,index);
    let pointed_index = get_block_val(entity_id,id,index+1) + args[2];
    let org_val = get_block_val(entity_id,i32(pointed_id),i32(pointed_index));
    set_block_val(entity_id, i32(pointed_id), i32(pointed_index), org_val + args[3]);
    return args[3];
}

function SetAddShifted(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1] + args[2] * args[3]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val + args[4]);
    return args[4];
}

function SetDivide(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val / args[2]);
    return args[2];
}

function SetDividePointed(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let pointed_id = get_block_val(entity_id,id,index);
    let pointed_index = get_block_val(entity_id,id,index+1) + args[2];
    let org_val = get_block_val(entity_id,i32(pointed_id),i32(pointed_index));
    set_block_val(entity_id, i32(pointed_id), i32(pointed_index), org_val / args[3]);
    return args[3];
}

function SetDivideShifted(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1] + args[2] * args[3]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val / args[4]);
    return args[4];
}

function SetMod(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, modulo(org_val, args[2]));
    return args[2];
}

function SetModPointed(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let pointed_id = get_block_val(entity_id,id,index);
    let pointed_index = get_block_val(entity_id,id,index+1) + args[2];
    let org_val = get_block_val(entity_id,i32(pointed_id),i32(pointed_index));
    set_block_val(entity_id, i32(pointed_id), i32(pointed_index), modulo(org_val, args[3]));
    return args[3];
}

function SetModShifted(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1] + args[2] * args[3]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, modulo(org_val, args[4]));
    return args[4];
}

function SetMultiply(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val * args[2]);
    return args[2];
}

function SetMultiplyPointed(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let pointed_id = get_block_val(entity_id,id,index);
    let pointed_index = get_block_val(entity_id,id,index+1) + args[2];
    let org_val = get_block_val(entity_id,i32(pointed_id),i32(pointed_index));
    set_block_val(entity_id, i32(pointed_id), i32(pointed_index), org_val * args[3]);
    return args[3];
}

function SetMultiplyShifted(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1] + args[2] * args[3]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val * args[4]);
    return args[4];
}

function SetPower(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, Mathf.pow(org_val, args[2]));
    return args[2];
}

function SetPowerPointed(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let pointed_id = get_block_val(entity_id,id,index);
    let pointed_index = get_block_val(entity_id,id,index+1) + args[2];
    let org_val = get_block_val(entity_id,i32(pointed_id),i32(pointed_index));
    set_block_val(entity_id, i32(pointed_id), i32(pointed_index), Mathf.pow(org_val, args[3]));
    return args[3];
}

function SetPowerShifted(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1] + args[2] * args[3]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, Mathf.pow(org_val, args[4]));
    return args[4];
}

function SetRem(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val % args[2]);
    return args[2];
}

function SetRemPointed(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let pointed_id = get_block_val(entity_id,id,index);
    let pointed_index = get_block_val(entity_id,id,index+1) + args[2];
    let org_val = get_block_val(entity_id,i32(pointed_id),i32(pointed_index));
    set_block_val(entity_id, i32(pointed_id), i32(pointed_index), org_val % args[3]);
    return args[3];
}

function SetRemShifted(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1] + args[2] * args[3]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val % args[4]);
    return args[4];
}

function SetSubtract(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val - args[2]);
    return args[2];
}

function SetSubtractPointed(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let pointed_id = get_block_val(entity_id,id,index);
    let pointed_index = get_block_val(entity_id,id,index+1) + args[2];
    let org_val = get_block_val(entity_id,i32(pointed_id),i32(pointed_index));
    set_block_val(entity_id, i32(pointed_id), i32(pointed_index), org_val - args[3]);
    return args[3];
}

function SetSubtractShifted(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1] + args[2] * args[3]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val - args[4]);
    return args[4];
}

function DecrementPost(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val - 1);
    return org_val - 1;
}

function DecrementPostPointed(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let pointed_id = get_block_val(entity_id,id,index);
    let pointed_index = get_block_val(entity_id,id,index+1) + args[2];
    let org_val = get_block_val(entity_id,i32(pointed_id),i32(pointed_index));
    set_block_val(entity_id, i32(pointed_id), i32(pointed_index), org_val - 1);
    return org_val - 1;
}

function DecrementPostShifted(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1] + args[2] * args[3]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val - 1);
    return org_val - 1;
}

function DecrementPre(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val - 1);
    return org_val;
}

function DecrementPrePointed(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let pointed_id = get_block_val(entity_id,id,index);
    let pointed_index = get_block_val(entity_id,id,index+1) + args[2];
    let org_val = get_block_val(entity_id,i32(pointed_id),i32(pointed_index));
    set_block_val(entity_id, i32(pointed_id), i32(pointed_index), org_val - 1);
    return org_val;
}

function DecrementPreShifted(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1] + args[2] * args[3]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val - 1);
    return org_val;
}

function IncrementPost(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val + 1);
    return org_val + 1;
}

function IncrementPostPointed(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let pointed_id = get_block_val(entity_id,id,index);
    let pointed_index = get_block_val(entity_id,id,index+1) + args[2];
    let org_val = get_block_val(entity_id,i32(pointed_id),i32(pointed_index));
    set_block_val(entity_id, i32(pointed_id), i32(pointed_index), org_val + 1);
    return org_val + 1;
}

function IncrementPostShifted(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1] + args[2] * args[3]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val + 1);
    return org_val + 1;
}

function IncrementPre(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val + 1);
    return org_val;
}

function IncrementPrePointed(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1]);
    let pointed_id = get_block_val(entity_id,id,index);
    let pointed_index = get_block_val(entity_id,id,index+1) + args[2];
    let org_val = get_block_val(entity_id,i32(pointed_id),i32(pointed_index));
    set_block_val(entity_id, i32(pointed_id), i32(pointed_index), org_val + 1);
    return org_val;
}

function IncrementPreShifted(entity_id:i32,args:StaticArray<f32>):f32{
    let id = i32(args[0]), index = i32(args[1] + args[2] * args[3]);
    let org_val = get_block_val(entity_id, id, index);
    set_block_val(entity_id, id, index, org_val + 1);
    return org_val;
}

function Copy(entity_id:i32,args:StaticArray<f32>):f32{
    if(args[0] == args[2]){//同じブロック
        if(args[1] < args[3]){
            for(let i:i32 = i32(args[4])-1;i>=0;i--){//デクリメントの方向にすることで正常に動作させる
                set_block_val(entity_id,i32(args[2]),i32(args[3])+i,get_block_val(entity_id,i32(args[0]),i32(args[1])+i));
            }
        }else if(args[1] > args[3]){
            for(let i:i32 = 0;i<i32(args[4]);i++){
                set_block_val(entity_id,i32(args[2]),i32(args[3])+i,get_block_val(entity_id,i32(args[0]),i32(args[1])+i));
            }
        }//同じインデックスの時はスルー
    }else{
        for(let i:i32 = 0;i<i32(args[4]);i++){
            set_block_val(entity_id,i32(args[2]),i32(args[3])+i,get_block_val(entity_id,i32(args[0]),i32(args[1])+i));
        }
    }
    return 0.;
}

function transform_tex(x1:f32,y1:f32,x2:f32,y2:f32,x3:f32,y3:f32,x4:f32,y4:f32,m:StaticArray<f32>):StaticArray<f32>{
    let output = new StaticArray<f32>(8);
    for(let i:i32 = 0;i<8;i++){
        output[i] = x1*m[i*8] + y1*m[i*8+1] + x2*m[i*8+2] + y2*m[i*8+3] + x3*m[i*8+4] + y3*m[i*8+5] + x4*m[i*8+6] + y4*m[i*8+7];
    }
    return output;
}

function center2LT_x(x:f32):f32{
    return nearest<f32>((x+AspectRatio)/<f32>2*f32(C_height));
}
function center2LT_y(y:f32):f32{
    return nearest((<f32>1-y)/<f32>2*f32(C_height));
}

function transform_mat_x(m:Map<i32,f32>,x:f32,y:f32):f32{
    return x*m[0] + y*m[1] + m[3];
}
function transform_mat_y(m:Map<i32,f32>,x:f32,y:f32):f32{
    return x*m[4] + y*m[5] + m[7];
}

function Draw(entity_id:i32,args:StaticArray<f32>):f32{
    if(tex_transforms.has(i32(args[0]))){
        let x1:f32,x2:f32,x3:f32,x4:f32,y1:f32,y2:f32,y3:f32,y4:f32;
        let output = transform_tex(args[1],args[2],args[3],args[4],args[5],args[6],args[7],args[8],tex_transforms.get(i32(args[0])));
        x1 = output[0], y1 = output[1], x2 = output[2], y2 = output[3],
        x3 = output[4], y3 = output[5], x4 = output[6], y4 = output[7];
        let m = Blocks.get(1003);
        x1 = center2LT_x(transform_mat_x(m,x1,y1));
        x2 = center2LT_x(transform_mat_x(m,x2,y2));
        x3 = center2LT_x(transform_mat_x(m,x3,y3));
        x4 = center2LT_x(transform_mat_x(m,x4,y4));
        y1 = center2LT_y(transform_mat_y(m,x1,y1));
        y2 = center2LT_y(transform_mat_y(m,x2,y2));
        y3 = center2LT_y(transform_mat_y(m,x3,y3));
        y4 = center2LT_y(transform_mat_y(m,x4,y4));
        

        let uvs = new StaticArray<f32>(vertices*vertices*2);
        let t:f32 = 0;
        for (let i:i32 = 0; i < vertices; i++) {
            t = f32(i)/f32(vertices-1);
            let sx:f32 = (x1-x2)*t+x2; let sy:f32 = (y1-y2)*t+y2;
            let ex:f32 = (x4-x3)*t+x3; let ey:f32 = (y4-y3)*t+y3;
            for (let j:i32 = 0; j < vertices; j++) {
                t = f32(j)/f32(vertices-1);
                uvs[i*vertices*2+j*2] = (ex-sx)*t+sx;
                uvs[i*vertices*2+j*2+1] = (ey-sy)*t+sy;
            }
        }

        draw_sprites_uvs.push(uvs);
        draw_sprites_info.push(StaticArray.fromArray<f32>([
            f32(entity_id), args[0], args[9], args[10], 0., 0.
        ]));

        return 0.;
    }else{
        console.warn(`[node_calc] Draw: texture:${args[0]} does not exist.`);
        return 0.;
    }
}

function draw_curved_LR(entity_id:i32,id:f32,Lcurv:StaticArray<f32>,Rcurv:StaticArray<f32>,z:f32,a:f32):void{
    let n:i32 = Lcurv.length;
    let uvs = new StaticArray<f32>(n * curv_vertices * 2);
    for (let y:i32 = 0; y < n; y++) {
        for(let x:i32 = 0; x < curv_vertices; x++){
            let t = f32(x)/f32(curv_vertices-1);
            uvs[y*curv_vertices*2+x*2] = (Rcurv[y*2]-Lcurv[y*2])*t+Lcurv[y*2];
            uvs[y*curv_vertices*2+x*2+1] = (Rcurv[y*2+1]-Lcurv[y*2+1])*t+Lcurv[y*2+1];
        }
    }
    draw_sprites_uvs.push(uvs);
    draw_sprites_info.push(StaticArray.fromArray<f32>([
        f32(entity_id), id, z, a, f32(n), 1.
    ]));
}

function draw_curved_BT(entity_id:i32,id:f32,Tcurv:StaticArray<f32>,Bcurv:StaticArray<f32>,z:f32,a:f32):void{
    let n = Tcurv.length;
    let uvs = new StaticArray<f32>(n * curv_vertices * 2);
    for (let y = 0; y < curv_vertices; y++) {
        let t = f32(y)/f32(curv_vertices-1);
        for(let x = 0; x < n; x++){
            uvs[y*n*2+x*2] = (Bcurv[x*2]-Tcurv[x*2])*t+Tcurv[x*2];
            uvs[y*n*2+x*2+1] = (Bcurv[x*2+1]-Tcurv[x*2+1])*t+Tcurv[x*2+1];
        }
    }
    draw_sprites_uvs.push(uvs);
    draw_sprites_info.push(StaticArray.fromArray<f32>([
        f32(entity_id), id, z, a, f32(n), 2.
    ]));
}

//(p,q)は左上が(0,0)、右下が(1,1)の座標系
function bilinear_interpolation_x(bl_x:f32,tl_x:f32,tr_x:f32,br_x:f32,p:f32,q:f32):f32{
    let lx:f32 = (bl_x - tl_x) * q  + tl_x;
    let rx:f32 = (br_x - tr_x) * q  + tr_x;
    return (rx - lx) * p + lx;
}

//(p,q)は左上が(0,0)、右下が(1,1)の座標系
function bilinear_interpolation_y(bl_y:f32,tl_y:f32,tr_y:f32,br_y:f32,p:f32,q:f32):f32{
    let ly:f32 = (bl_y - tl_y) * q  + tl_y;
    let ry:f32 = (br_y - tr_y) * q  + tr_y;
    return (ry - ly) * p + ly;
}

function DrawCurvedL(entity_id:i32,args:StaticArray<f32>):f32{
    if(tex_transforms.has(i32(args[0]))){
        let n:i32 = i32(args[11]);
        let x1:f32,x2:f32,x3:f32,x4:f32,y1:f32,y2:f32,y3:f32,y4:f32;
        let output = transform_tex(args[1],args[2],args[3],args[4],args[5],args[6],args[7],args[8],tex_transforms.get(i32(args[0])));
        x1 = output[0], y1 = output[1], x2 = output[2], y2 = output[3],
        x3 = output[4], y3 = output[5], x4 = output[6], y4 = output[7];
        let m = Blocks.get(1003);
        x1 = center2LT_x(transform_mat_x(m,x1,y1));
        x2 = center2LT_x(transform_mat_x(m,x2,y2));
        x3 = center2LT_x(transform_mat_x(m,x3,y3));
        x4 = center2LT_x(transform_mat_x(m,x4,y4));
        y1 = center2LT_y(transform_mat_y(m,x1,y1));
        y2 = center2LT_y(transform_mat_y(m,x2,y2));
        y3 = center2LT_y(transform_mat_y(m,x3,y3));
        y4 = center2LT_y(transform_mat_y(m,x4,y4));
        let cxL:f32 = bilinear_interpolation_x(x1,x2,x3,x4,(args[12]+1.)/2.,(1-args[13])/2);
        let cyL:f32 = bilinear_interpolation_y(y1,y2,y3,y4,(args[12]+1.)/2.,(1-args[13])/2);

        let Lcurv = new StaticArray<f32>(n*2);
        let Rcurv = new StaticArray<f32>(n*2);
        for(let i:i32 = 0;i < n;i++){
            let t:f32 = f32(i)/f32(n-1);

            Lcurv[i*2] = ((<f32>1-t)**<f32>2)*x2 + <f32>2*(<f32>1-t)*t*cxL + (t**<f32>2)*x1;
            Lcurv[i*2+1] = ((<f32>1-t)**<f32>2)*y2 + <f32>2*(<f32>1-t)*t*cyL + (t**<f32>2)*y1;

            Rcurv[i*2] = (x4-x3)*t+x3;
            Rcurv[i*2+1] = (y4-y3)*t+y3;
        }

        draw_curved_LR(entity_id, args[0], Lcurv, Rcurv, args[9], args[10]);

        return 0.;
    }else{
        console.warn(`[node_calc] DrawCurvedL: texture:${args[0]} does not exist.`);
        return 0.;
    }
}

function DrawCurvedR(entity_id:i32,args:StaticArray<f32>):f32{
    if(tex_transforms.has(i32(args[0]))){
        let n:i32 = i32(args[11]);
        let x1:f32,x2:f32,x3:f32,x4:f32,y1:f32,y2:f32,y3:f32,y4:f32;
        let output = transform_tex(args[1],args[2],args[3],args[4],args[5],args[6],args[7],args[8],tex_transforms.get(i32(args[0])));
        x1 = output[0], y1 = output[1], x2 = output[2], y2 = output[3],
        x3 = output[4], y3 = output[5], x4 = output[6], y4 = output[7];
        let m = Blocks.get(1003);
        x1 = center2LT_x(transform_mat_x(m,x1,y1));
        x2 = center2LT_x(transform_mat_x(m,x2,y2));
        x3 = center2LT_x(transform_mat_x(m,x3,y3));
        x4 = center2LT_x(transform_mat_x(m,x4,y4));
        y1 = center2LT_y(transform_mat_y(m,x1,y1));
        y2 = center2LT_y(transform_mat_y(m,x2,y2));
        y3 = center2LT_y(transform_mat_y(m,x3,y3));
        y4 = center2LT_y(transform_mat_y(m,x4,y4));
        let cxR:f32 = bilinear_interpolation_x(x1,x2,x3,x4,(args[12]+1.)/2.,(1-args[13])/2);
        let cyR:f32 = bilinear_interpolation_y(y1,y2,y3,y4,(args[12]+1.)/2.,(1-args[13])/2);

        let Lcurv = new StaticArray<f32>(n*2);
        let Rcurv = new StaticArray<f32>(n*2);
        for(let i:i32 = 0;i < n;i++){
            let t:f32 = f32(i)/f32(n-1);

            Lcurv[i*2] = (x1-x2)*t+x2;
            Lcurv[i*2+1] = (y1-y2)*t+y2;

            Rcurv[i*2] = ((<f32>1-t)**<f32>2)*x3 + <f32>2*(<f32>1-t)*t*cxR + (t**<f32>2)*x4;
            Rcurv[i*2+1] = ((<f32>1-t)**<f32>2)*y3 + <f32>2*(<f32>1-t)*t*cyR + (t**<f32>2)*y4;
        }

        draw_curved_LR(entity_id, args[0], Lcurv, Rcurv, args[9], args[10]);

        return 0.;
    }else{
        console.warn(`[node_calc] DrawCurvedR: texture:${args[0]} does not exist.`);
        return 0.;
    }
}

function DrawCurvedLR(entity_id:i32,args:StaticArray<f32>):f32{
    if(tex_transforms.has(i32(args[0]))){
        let n:i32 = i32(args[11]);
        let x1:f32,x2:f32,x3:f32,x4:f32,y1:f32,y2:f32,y3:f32,y4:f32;
        let output = transform_tex(args[1],args[2],args[3],args[4],args[5],args[6],args[7],args[8],tex_transforms.get(i32(args[0])));
        x1 = output[0], y1 = output[1], x2 = output[2], y2 = output[3],
        x3 = output[4], y3 = output[5], x4 = output[6], y4 = output[7];
        let m = Blocks.get(1003);
        x1 = center2LT_x(transform_mat_x(m,x1,y1));
        x2 = center2LT_x(transform_mat_x(m,x2,y2));
        x3 = center2LT_x(transform_mat_x(m,x3,y3));
        x4 = center2LT_x(transform_mat_x(m,x4,y4));
        y1 = center2LT_y(transform_mat_y(m,x1,y1));
        y2 = center2LT_y(transform_mat_y(m,x2,y2));
        y3 = center2LT_y(transform_mat_y(m,x3,y3));
        y4 = center2LT_y(transform_mat_y(m,x4,y4));
        let cxL:f32 = bilinear_interpolation_x(x1,x2,x3,x4,(args[12]+1.)/2.,(1-args[13])/2);
        let cyL:f32 = bilinear_interpolation_y(y1,y2,y3,y4,(args[12]+1.)/2.,(1-args[13])/2);
        let cxR:f32 = bilinear_interpolation_x(x1,x2,x3,x4,(args[14]+1.)/2.,(1-args[15])/2);
        let cyR:f32 = bilinear_interpolation_y(y1,y2,y3,y4,(args[14]+1.)/2.,(1-args[15])/2);

        let Lcurv = new StaticArray<f32>(n*2);
        let Rcurv = new StaticArray<f32>(n*2);
        for(let i:i32 = 0;i < n;i++){
            let t:f32 = f32(i)/f32(n-1);

            Lcurv[i*2] = ((<f32>1-t)**<f32>2)*x2 + <f32>2*(<f32>1-t)*t*cxL + (t**<f32>2)*x1;
            Lcurv[i*2+1] = ((<f32>1-t)**<f32>2)*y2 + <f32>2*(<f32>1-t)*t*cyL + (t**<f32>2)*y1;

            Rcurv[i*2] = ((<f32>1-t)**<f32>2)*x3 + <f32>2*(<f32>1-t)*t*cxR + (t**<f32>2)*x4;
            Rcurv[i*2+1] = ((<f32>1-t)**<f32>2)*y3 + <f32>2*(<f32>1-t)*t*cyR + (t**<f32>2)*y4;
        }

        draw_curved_LR(entity_id, args[0], Lcurv, Rcurv, args[9], args[10]);

        return 0.;
    }else{
        console.warn(`[node_calc] DrawCurvedLR: texture:${args[0]} does not exist.`);
        return 0.;
    }
}

function DrawCurvedB(entity_id:i32,args:StaticArray<f32>):f32{
    if(tex_transforms.has(i32(args[0]))){
        let n:i32 = i32(args[11]);
        let x1:f32,x2:f32,x3:f32,x4:f32,y1:f32,y2:f32,y3:f32,y4:f32;
        let output = transform_tex(args[1],args[2],args[3],args[4],args[5],args[6],args[7],args[8],tex_transforms.get(i32(args[0])));
        x1 = output[0], y1 = output[1], x2 = output[2], y2 = output[3],
        x3 = output[4], y3 = output[5], x4 = output[6], y4 = output[7];
        let m = Blocks.get(1003);
        x1 = center2LT_x(transform_mat_x(m,x1,y1));
        x2 = center2LT_x(transform_mat_x(m,x2,y2));
        x3 = center2LT_x(transform_mat_x(m,x3,y3));
        x4 = center2LT_x(transform_mat_x(m,x4,y4));
        y1 = center2LT_y(transform_mat_y(m,x1,y1));
        y2 = center2LT_y(transform_mat_y(m,x2,y2));
        y3 = center2LT_y(transform_mat_y(m,x3,y3));
        y4 = center2LT_y(transform_mat_y(m,x4,y4));
        let cxB:f32 = bilinear_interpolation_x(x1,x2,x3,x4,(args[12]+1.)/2.,(1-args[13])/2);
        let cyB:f32 = bilinear_interpolation_y(y1,y2,y3,y4,(args[12]+1.)/2.,(1-args[13])/2);

        let Tcurv = new StaticArray<f32>(n*2);
        let Bcurv = new StaticArray<f32>(n*2);
        for(let i:i32 = 0;i < n;i++){
            let t:f32 = f32(i)/f32(n-1);

            Tcurv[i*2] = (x3-x2)*t+x2;
            Tcurv[i*2+1] = (y3-y2)*t+y2;

            Bcurv[i*2] = ((<f32>1-t)**<f32>2)*x1 + <f32>2*(<f32>1-t)*t*cxB + (t**<f32>2)*x4;
            Bcurv[i*2+1] = ((<f32>1-t)**<f32>2)*y1 + <f32>2*(<f32>1-t)*t*cyB + (t**<f32>2)*y4;
        }

        draw_curved_BT(entity_id, args[0], Tcurv, Bcurv, args[9], args[10]);

        return 0.;
    }else{
        console.warn(`[node_calc] DrawCurvedB: texture:${args[0]} does not exist.`);
        return 0.;
    }
}

function DrawCurvedT(entity_id:i32,args:StaticArray<f32>):f32{
    if(tex_transforms.has(i32(args[0]))){
        let n:i32 = i32(args[11]);
        let x1:f32,x2:f32,x3:f32,x4:f32,y1:f32,y2:f32,y3:f32,y4:f32;
        let output = transform_tex(args[1],args[2],args[3],args[4],args[5],args[6],args[7],args[8],tex_transforms.get(i32(args[0])));
        x1 = output[0], y1 = output[1], x2 = output[2], y2 = output[3],
        x3 = output[4], y3 = output[5], x4 = output[6], y4 = output[7];
        let m = Blocks.get(1003);
        x1 = center2LT_x(transform_mat_x(m,x1,y1));
        x2 = center2LT_x(transform_mat_x(m,x2,y2));
        x3 = center2LT_x(transform_mat_x(m,x3,y3));
        x4 = center2LT_x(transform_mat_x(m,x4,y4));
        y1 = center2LT_y(transform_mat_y(m,x1,y1));
        y2 = center2LT_y(transform_mat_y(m,x2,y2));
        y3 = center2LT_y(transform_mat_y(m,x3,y3));
        y4 = center2LT_y(transform_mat_y(m,x4,y4));
        let cxT:f32 = bilinear_interpolation_x(x1,x2,x3,x4,(args[12]+1.)/2.,(1-args[13])/2);
        let cyT:f32 = bilinear_interpolation_y(y1,y2,y3,y4,(args[12]+1.)/2.,(1-args[13])/2);

        let Tcurv = new StaticArray<f32>(n*2);
        let Bcurv = new StaticArray<f32>(n*2);
        for(let i:i32 = 0;i < n;i++){
            let t:f32 = f32(i)/f32(n-1);

            Tcurv[i*2] = ((<f32>1-t)**<f32>2)*x2 + <f32>2*(<f32>1-t)*t*cxT + (t**<f32>2)*x3;
            Tcurv[i*2+1] = ((<f32>1-t)**<f32>2)*y2 + <f32>2*(<f32>1-t)*t*cyT + (t**<f32>2)*y3;

            Bcurv[i*2] = (x4-x1)*t+x1;
            Bcurv[i*2+1] = (y4-y1)*t+y1;
        }

        draw_curved_BT(entity_id, args[0], Tcurv, Bcurv, args[9], args[10]);

        return 0.;
    }else{
        console.warn(`[node_calc] DrawCurvedT: texture:${args[0]} does not exist.`);
        return 0.;
    }
}

function DrawCurvedBT(entity_id:i32,args:StaticArray<f32>):f32{
    if(tex_transforms.has(i32(args[0]))){
        let n:i32 = i32(args[11]);
        let x1:f32,x2:f32,x3:f32,x4:f32,y1:f32,y2:f32,y3:f32,y4:f32;
        let output = transform_tex(args[1],args[2],args[3],args[4],args[5],args[6],args[7],args[8],tex_transforms.get(i32(args[0])));
        x1 = output[0], y1 = output[1], x2 = output[2], y2 = output[3],
        x3 = output[4], y3 = output[5], x4 = output[6], y4 = output[7];
        let m = Blocks.get(1003);
        x1 = center2LT_x(transform_mat_x(m,x1,y1));
        x2 = center2LT_x(transform_mat_x(m,x2,y2));
        x3 = center2LT_x(transform_mat_x(m,x3,y3));
        x4 = center2LT_x(transform_mat_x(m,x4,y4));
        y1 = center2LT_y(transform_mat_y(m,x1,y1));
        y2 = center2LT_y(transform_mat_y(m,x2,y2));
        y3 = center2LT_y(transform_mat_y(m,x3,y3));
        y4 = center2LT_y(transform_mat_y(m,x4,y4));
        let cxB:f32 = bilinear_interpolation_x(x1,x2,x3,x4,(args[12]+1.)/2.,(1-args[13])/2);
        let cyB:f32 = bilinear_interpolation_y(y1,y2,y3,y4,(args[12]+1.)/2.,(1-args[13])/2);
        let cxT:f32 = bilinear_interpolation_x(x1,x2,x3,x4,(args[14]+1.)/2.,(1-args[15])/2);
        let cyT:f32 = bilinear_interpolation_y(y1,y2,y3,y4,(args[14]+1.)/2.,(1-args[15])/2);

        let Tcurv = new StaticArray<f32>(n*2);
        let Bcurv = new StaticArray<f32>(n*2);
        for(let i:i32 = 0;i < n;i++){
            let t:f32 = f32(i)/f32(n-1);

            Tcurv[i*2] = ((<f32>1-t)**<f32>2)*x2 + <f32>2*(<f32>1-t)*t*cxT + (t**<f32>2)*x3;
            Tcurv[i*2+1] = ((<f32>1-t)**<f32>2)*y2 + <f32>2*(<f32>1-t)*t*cyT + (t**<f32>2)*y3;

            Bcurv[i*2] = ((<f32>1-t)**<f32>2)*x1 + <f32>2*(<f32>1-t)*t*cxB + (t**<f32>2)*x4;
            Bcurv[i*2+1] = ((<f32>1-t)**<f32>2)*y1 + <f32>2*(<f32>1-t)*t*cyB + (t**<f32>2)*y4;
        }

        draw_curved_BT(entity_id, args[0], Tcurv, Bcurv, args[9], args[10]);

        return 0.;
    }else{
        console.warn(`[node_calc] DrawCurvedBT: texture:${args[0]} does not exist.`);
        return 0.;
    }
}

function Play(entity_id:i32,args:StaticArray<f32>):f32{
    // let now:f32 = Blocks.get(1001).get(0);
    // let dist:f32 = args[1];
    // let allowed:bool = true;
    // for(let i:i32 = 0;i<effect_schedule.length;i++){
    //     if(Math.abs(now - effect_schedule[i][1]) <= dist){
    //         allowed = false;
    //     }
    // }
    // if(allowed){
    //     effect_schedule.push(StaticArray.fromArray<f32>([args[0],now,<f32>-1]));
    // }
    effect_queue.push(StaticArray.fromArray<f32>([args[0], Blocks.get(1001).get(0), <f32>-1]));
    return 0.;
}

function PlayScheduled(entity_id:i32,args:StaticArray<f32>):f32{
    // let now:f32 = Blocks.get(1001).get(0);
    // let dist:f32 = args[2];
    // let t:f32 = args[1];
    // let allowed:bool = true;
    // for(let i:i32 = 0;i<effect_schedule.length;i++){
    //     if(Math.abs(t - effect_schedule[i][1]) <= dist){
    //         allowed = false;
    //     }
    // }
    // if(allowed){
    //     effect_schedule.push(StaticArray.fromArray<f32>([args[0],t,<f32>-1]));
    // }
    effect_queue.push(StaticArray.fromArray<f32>([args[0], args[1], <f32>-1]));
    return 0.;
}

function PlayLooped(entity_id:i32,args:StaticArray<f32>):f32{
    let loop_id:f32 = loop_id_generated;
    loop_id_generated++;
    effect_queue.push(StaticArray.fromArray<f32>([args[0],Blocks.get(1001).get(0),loop_id]));
    //effect_schedule.push(StaticArray.fromArray<f32>([args[0],now,loop_id]));
    return loop_id;
}

function PlayLoopedScheduled(entity_id:i32,args:StaticArray<f32>):f32{
    let loop_id:f32 = loop_id_generated;
    loop_id_generated++;
    effect_queue.push(StaticArray.fromArray<f32>([args[0],args[1],loop_id]));
    //effect_schedule.push(StaticArray.fromArray<f32>([args[0],t,loop_id]));
    return loop_id;
}

function StopLooped(entity_id:i32,args:StaticArray<f32>):f32{
    effect_queue.push(StaticArray.fromArray<f32>([-1, Blocks.get(1001).get(0), args[0]]));
    // effect_stop_schedule.push(StaticArray.fromArray<f32>([
    //     Blocks.get(1001).get(0),
    //     args[0],
    // ]));
    return 0.;
}

function StopLoopedScheduled(entity_id:i32,args:StaticArray<f32>):f32{
    effect_queue.push(StaticArray.fromArray<f32>([-1, args[1], args[0]]));
    // effect_stop_schedule.push(StaticArray.fromArray<f32>([
    //     args[1],
    //     args[0],
    // ]));
    return 0.;
}

function Spawn(entity_id:i32,args:StaticArray<f32>):f32{
    let ent_id = entities.length;
    spawned_entities++;
    entities.push(new Entity(i32(args[0]),true,true));
    init_entities.push(ent_id);
    for(let i:i32 = 0;i < args.length-1;i++){
        set_block_val(ent_id, 4000, i, args[i+1]);//EntityMemory
    }
    set_block_val(ent_id, 4004, 0, <f32>0.);//EntityDespawn
    return 0.;
}

function SpawnParticleEffect(entity_id:i32,args:StaticArray<f32>):f32{
    if(ptc_transforms.has(i32(args[0]))){
        let x1:f32,x2:f32,x3:f32,x4:f32,y1:f32,y2:f32,y3:f32,y4:f32;
        let output = transform_tex(args[1],args[2],args[3],args[4],args[5],args[6],args[7],args[8],ptc_transforms.get(i32(args[0])));
        x1 = output[0], y1 = output[1], x2 = output[2], y2 = output[3],
        x3 = output[4], y3 = output[5], x4 = output[6], y4 = output[7];
        let m = Blocks.get(1004);
        x1 = center2LT_x(transform_mat_x(m,x1,y1));
        x2 = center2LT_x(transform_mat_x(m,x2,y2));
        x3 = center2LT_x(transform_mat_x(m,x3,y3));
        x4 = center2LT_x(transform_mat_x(m,x4,y4));
        y1 = center2LT_y(transform_mat_y(m,x1,y1));
        y2 = center2LT_y(transform_mat_y(m,x2,y2));
        y3 = center2LT_y(transform_mat_y(m,x3,y3));
        y4 = center2LT_y(transform_mat_y(m,x4,y4));

        ptc_unique2effect.set(particle_id_generated,i32(args[0]));
        particle_queue.push(StaticArray.fromArray<f32>([particle_id_generated,0.,args[0],x1,y1,x2,y2,x3,y3,x4,y4,args[9],args[10]]));
        return particle_id_generated++;
    }else{
        console.warn(`[node_calc] SpawnParticleEffect: particle:${args[0]} does not exist.`);
        return 0.;
    }
}

function MoveParticleEffect(entity_id:i32,args:StaticArray<f32>):f32{
    if(ptc_unique2effect.has(args[0])){
        let x1:f32,x2:f32,x3:f32,x4:f32,y1:f32,y2:f32,y3:f32,y4:f32;
        let ptc_efc_id:i32 = ptc_unique2effect.get(args[0]);
        let output = transform_tex(args[1],args[2],args[3],args[4],args[5],args[6],args[7],args[8],ptc_transforms.get(ptc_efc_id));
        x1 = output[0], y1 = output[1], x2 = output[2], y2 = output[3],
        x3 = output[4], y3 = output[5], x4 = output[6], y4 = output[7];
        let m = Blocks.get(1004);
        x1 = center2LT_x(transform_mat_x(m,x1,y1));
        x2 = center2LT_x(transform_mat_x(m,x2,y2));
        x3 = center2LT_x(transform_mat_x(m,x3,y3));
        x4 = center2LT_x(transform_mat_x(m,x4,y4));
        y1 = center2LT_y(transform_mat_y(m,x1,y1));
        y2 = center2LT_y(transform_mat_y(m,x2,y2));
        y3 = center2LT_y(transform_mat_y(m,x3,y3));
        y4 = center2LT_y(transform_mat_y(m,x4,y4));

        particle_queue.push(StaticArray.fromArray<f32>([args[0],1.,x1,y1,x2,y2,x3,y3,x4,y4]));
    }else{
        console.warn(`[node_calc] MoveParticleEffect: particle_unique_id:${args[0]} does not exist.`);
    }
    return 0.;
}

function DestroyParticleEffect(entity_id:i32,args:StaticArray<f32>):f32{
    if(ptc_unique2effect.has(args[0])){
        ptc_unique2effect.delete(args[0]);
        particle_queue.push(StaticArray.fromArray<f32>([args[0],2.]));
    }else{
        console.warn(`[node_calc] DestroyParticleEffect: particle_unique_id:${args[0]} does not exist.`);
    }
    return 0.;
}


function get_stream_keys(id:f32):Array<f32>{
    if(!stream_keys.has(id)){
        stream_keys.set(id,new Array<f32>());
        stream_values.set(id,new Array<f32>());
    }
    return stream_keys.get(id);
}
function get_stream_values(id:f32):Array<f32>{
    if(!stream_values.has(id)){
        stream_keys.set(id,new Array<f32>());
        stream_values.set(id,new Array<f32>());
    }
    return stream_values.get(id);
}
function stream_lower_bound(keys:Array<f32>,key:f32):i32{
    let lo:i32=0;
    let hi:i32=keys.length;
    while(lo<hi){
        const mid:i32=(lo+hi)>>1;
        if(keys[mid]<key) lo=mid+1;
        else hi=mid;
    }
    return lo;
}
function stream_upper_bound(keys:Array<f32>,key:f32):i32{
    let lo:i32=0;
    let hi:i32=keys.length;
    while(lo<hi){
        const mid:i32=(lo+hi)>>1;
        if(keys[mid]<=key) lo=mid+1;
        else hi=mid;
    }
    return lo;
}
function StreamSet(entity_id:i32,args:StaticArray<f32>):f32{
    const id=args[0], key=args[1], value=args[2];
    const keys=get_stream_keys(id);
    const values=get_stream_values(id);
    const i=stream_lower_bound(keys,key);
    if(i<keys.length && keys[i]==key){
        values[i]=value;
        return 0.;
    }
    // Entries are ordered by key. Most writes are chronological, so appends stay O(1).
    if(i==keys.length){
        keys.push(key);
        values.push(value);
        return 0.;
    }
    keys.push(0.);
    values.push(0.);
    for(let j:i32=keys.length-1;j>i;j--){
        keys[j]=keys[j-1];
        values[j]=values[j-1];
    }
    keys[i]=key;
    values[i]=value;
    return 0.;
}
function StreamHas(entity_id:i32,args:StaticArray<f32>):f32{
    const id=args[0], key=args[1];
    if(!stream_keys.has(id)) return 0.;
    const keys=get_stream_keys(id);
    const i=stream_lower_bound(keys,key);
    return i<keys.length && keys[i]==key ? 1. : 0.;
}
function StreamGetNextKey(entity_id:i32,args:StaticArray<f32>):f32{
    const id=args[0], key=args[1];
    if(!stream_keys.has(id)) return key;
    const keys=get_stream_keys(id);
    const i=stream_upper_bound(keys,key);
    return i<keys.length ? keys[i] : key;
}
function StreamGetPreviousKey(entity_id:i32,args:StaticArray<f32>):f32{
    const id=args[0], key=args[1];
    if(!stream_keys.has(id)) return key;
    const keys=get_stream_keys(id);
    // Previous must be strictly less than key; returning key at equality can stall stream iterators.
    const i=stream_lower_bound(keys,key)-1;
    return i>=0 ? keys[i] : key;
}
function StreamGetValue(entity_id:i32,args:StaticArray<f32>):f32{
    const id=args[0], key=args[1];
    if(!stream_keys.has(id)) return 0.;
    const keys=get_stream_keys(id);
    const values=get_stream_values(id);
    if(keys.length==0) return 0.;
    const i=stream_lower_bound(keys,key);
    if(i<keys.length && keys[i]==key) return values[i];
    if(i<=0) return values[0];
    if(i>=keys.length) return values[values.length-1];
    const lowKey=keys[i-1], highKey=keys[i];
    const lowValue=values[i-1], highValue=values[i];
    if(highKey==lowKey) return lowValue;
    return lowValue+(highValue-lowValue)*(key-lowKey)/(highKey-lowKey);
}

function HasSkinSprite(entity_id:i32,args:StaticArray<f32>):f32{
    return texture_ids.includes(i32(args[0])) ? 1 : 0;
}

function HasEffectClip(entity_id:i32,args:StaticArray<f32>):f32{
    return effect_ids.includes(i32(args[0])) ? 1 : 0;
}

function HasParticleEffect(entity_id:i32,args:StaticArray<f32>):f32{
    return particle_ids.includes(i32(args[0])) ? 1 : 0;
}

function Judge(entity_id:i32,args:StaticArray<f32>):f32{
    let param:f32 = args[0] - args[1];
    if(param <= args[3] && param >= args[2]){
        return 1.;
    }else if(param <= args[5] && param >= args[4]){
        return 2.;
    }else if(param <= args[7] && param >= args[6]){
        return 3.;
    }else{
        return 0.;
    }
}

function JudgeSimple(entity_id:i32,args:StaticArray<f32>):f32{
    let param:f32 = args[0] - args[1];
    if(param <= args[2] && param >= -args[2]){
        return 1.;
    }else if(param <= args[3] && param >= -args[3]){
        return 2.;
    }else if(param <= args[4] && param >= -args[4]){
        return 3.;
    }else{
        return 0.;
    }
}

function IsDebug(entity_id:i32,args:StaticArray<f32>):f32{
    return is_debug ? 1. : 0.;
}

function DebugPause(entity_id:i32,args:StaticArray<f32>):f32{
    if(is_debug) console.warn("DebugPauseは未実装です。");
    return 0.;
}

function DebugLog(entity_id:i32,args:StaticArray<f32>):f32{
    if(is_debug){
        console.log(`[node_calc] debug log: ${args[0]}`);
    }
    return 0.;
}

function UnimplementedFunction(entity_id:i32,args:StaticArray<f32>):f32{
    //未実装
    console.warn("Unimplemented function was run.");
    return 0.;
}

function UnknownFunction(entity_id:i32,args:StaticArray<f32>):f32{
    //不明
    console.warn("Unknown function was run.");
    return 0.;
}