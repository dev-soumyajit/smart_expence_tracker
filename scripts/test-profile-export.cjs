const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('../apps/mobile/node_modules/typescript');
const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../apps/mobile/lib/profile-export.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const user='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const other='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
function setup(options={}){
  const files=new Map(),directories=new Set(),calls=[];
  class Directory{
    constructor(...parts){this.uri=parts.map(part=>typeof part==='string'?part:part.uri).join('/');}
    get exists(){return directories.has(this.uri);}
    create(){directories.add(this.uri);}
    list(){return [...files.keys()].filter(uri=>uri.startsWith(this.uri+'/')).map(uri=>new File(uri));}
    delete(){for(const uri of files.keys())if(uri.startsWith(this.uri+'/'))files.delete(uri);directories.delete(this.uri);}
  }
  class File{
    constructor(...parts){this.uri=parts.map(part=>typeof part==='string'?part:part.uri).join('/');this.name=this.uri.split('/').at(-1);}
    get exists(){return files.has(this.uri);}
    get modificationTime(){return files.get(this.uri)?.time??null;}
    write(value){files.set(this.uri,{value,time:Date.now()});if(options.writeError)throw new Error('Disk full');}
    delete(){files.delete(this.uri);}
  }
  const exports={};
  const requireMock=name=>{
    if(name==='expo-file-system')return{Directory,File,Paths:{cache:{uri:'private-cache'}}};
    if(name==='expo-crypto')return{randomUUID:()=> 'cccccccc-cccc-4ccc-cccc-cccccccccccc'};
    if(name==='./api')return{api:async route=>{calls.push(route);if(options.apiError)throw new Error('Offline');return{profile:{email:'private@example.com'},transactions:[{amount:12550}]};}};
    if(name==='expo-sharing'){if(options.missingModule)throw new Error('Cannot find native module ExpoSharing');return{isAvailableAsync:async()=>options.available!==false,shareAsync:async uri=>{assert.ok(files.has(uri),'A complete file is present when sharing begins');calls.push({shared:uri});if(options.shareError)throw new Error('Share sheet unavailable');}};}
    throw new Error('Unexpected import '+name);
  };
  vm.runInNewContext(source,{exports,require:requireMock,Date,JSON,Error,Promise});
  return{...exports,files,directories,calls};
}
test('export fetches authenticated data only after sharing is available',async()=>{const env=setup({available:false});await assert.rejects(env.exportProfileData(user),/sharing is unavailable/);assert.deepEqual(env.calls,[]);assert.equal(env.files.size,0);});
test('an older installed build can open profile and gets a rebuild message when exporting',async()=>{const env=setup({missingModule:true});await assert.rejects(env.exportProfileData(user),/Rebuild the mobile app/);assert.deepEqual(env.calls,[]);assert.equal(env.files.size,0);});
test('shared JSON preserves paise and remains readable after Android chooser completion',async()=>{const env=setup();await env.exportProfileData(user);assert.equal(env.calls[0],'settings/export');assert.equal(env.files.size,1);const[uri,file]=[...env.files][0];assert.ok(!uri.includes('private@example.com'));assert.equal(JSON.parse(file.value).transactions[0].amount,12550);assert.ok(env.files.has(uri),'Do not remove a file while another app may still be reading it');});
test('cleanup removes only expired exports for the current user',async()=>{const env=setup();const base='private-cache/morrowmint-exports-'+user;const old=base+'/morrowmint-data-dddddddd.json';const recent=base+'/morrowmint-data-eeeeeeee.json';const foreign=base+'/unrelated.txt';const another='private-cache/morrowmint-exports-'+other+'/morrowmint-data-ffffffff.json';for(const uri of[old,foreign,another])env.files.set(uri,{time:Date.now()-2*86400000,value:'old'});env.files.set(recent,{time:Date.now(),value:'recent'});await env.exportProfileData(user);assert.equal(env.files.has(old),false);assert.ok(env.files.has(recent));assert.ok(env.files.has(foreign));assert.ok(env.files.has(another));});
test('failed sharing removes the newly created financial copy',async()=>{const env=setup({shareError:true});await assert.rejects(env.exportProfileData(user),/Share sheet unavailable/);assert.equal(env.files.size,0);});
test('failed write removes a partial export',async()=>{const env=setup({writeError:true});await assert.rejects(env.exportProfileData(user),/Disk full/);assert.equal(env.files.size,0);});
test('failed API request produces no financial file',async()=>{const env=setup({apiError:true});await assert.rejects(env.exportProfileData(user),/Offline/);assert.equal(env.files.size,0);});
test('sign-out cleanup is scoped to the current user and rejects path traversal',async()=>{const env=setup();for(const id of[user,other]){const dir='private-cache/morrowmint-exports-'+id;env.directories.add(dir);env.files.set(dir+'/morrowmint-data-ffffffff.json',{time:Date.now(),value:'private'});}await assert.rejects(env.clearProfileExports('../another-folder'),/Reload your profile/);assert.equal(env.files.size,2);await env.clearProfileExports(user);assert.equal(env.files.size,1);assert.ok([...env.files.keys()][0].includes(other));});
