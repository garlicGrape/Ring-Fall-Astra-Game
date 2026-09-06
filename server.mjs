import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root=resolve(import.meta.dirname,'dist');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.zip':'application/zip'};
createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root+'/')&&path!==root){res.writeHead(403).end();return}const file=path===root?resolve(root,'index.html'):path;res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end('Not found');}}).listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('RINGFALL running at http://localhost:'+(process.env.PORT||3000)));
