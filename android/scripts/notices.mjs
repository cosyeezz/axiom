// Collect the license/notice files of the resolved Go module graph, not secrets.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const input=execFileSync('go',['list','-m','-json','all'],{cwd:join(root,'go'),encoding:'utf8',maxBuffer:16*1024*1024});
const modules=[];let depth=0,start=0,string=false,escape=false;
for(let i=0;i<input.length;i++){
 const c=input[i];if(string){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')string=false;continue;}
 if(c==='"'){string=true;continue;}if(c==='{'){if(depth++===0)start=i;}if(c==='}'&&--depth===0)modules.push(JSON.parse(input.slice(start,i+1)));
}
let out='Axiom Android — third-party notices\n\nThis app embeds Tailscale tsnet and the following resolved Go dependencies.\nEach component remains subject to its own license.\n\n';
for(const m of modules){
 if(m.Main)continue;const dir=(m.Replace||m).Dir;if(!dir)throw new Error(`Module not downloaded: ${m.Path}`);
 const files=readdirSync(dir).filter(n=>/^(licen[cs]e|copying|notice)([.\-_]|$)/i.test(n));
 out+=`\n${'='.repeat(72)}\n${m.Path} ${m.Version||''}\n`;
 if(!files.length)out+='No top-level license file; refer to the module source at the pinned version.\n';
 for(const file of files){try{out+=`\n--- ${file} ---\n${readFileSync(join(dir,file),'utf8')}\n`;}catch(e){if(e.code!=='EISDIR')throw e;}}
}
const assets=join(root,'app','src','main','assets');mkdirSync(assets,{recursive:true});writeFileSync(join(assets,'THIRD-PARTY-NOTICES.txt'),out);
console.log(`Collected notices for ${modules.length-1} Go modules.`);
