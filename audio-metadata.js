// Lector local de etiquetas ID3v2 para archivos MP3. No sube ni transmite el audio.
function decodeId3Text(bytes){
 if(!bytes.length)return "";
 const encoding=bytes[0];
 const data=bytes.subarray(1);
 try{
  if(encoding===0)return new TextDecoder("windows-1252").decode(data).replace(/\\0+$/g,"").trim();
  if(encoding===3)return new TextDecoder("utf-8").decode(data).replace(/\\0+$/g,"").trim();
  if(encoding===1){
   let start=0;
   if(data[0]===0xff&&data[1]===0xfe)start=2;
   else if(data[0]===0xfe&&data[1]===0xff)start=2;
   return new TextDecoder("utf-16").decode(data.subarray(start)).replace(/\\0+$/g,"").trim();
  }
  if(encoding===2)return new TextDecoder("utf-16be").decode(data).replace(/\\0+$/g,"").trim();
 }catch(_error){}
 return "";
}
function syncSafeSize(bytes,offset){
 return (bytes[offset]&0x7f)<<21|(bytes[offset+1]&0x7f)<<14|(bytes[offset+2]&0x7f)<<7|(bytes[offset+3]&0x7f);
}
export async function readAudioMetadata(file){
 if(!file||!file.name||!file.name.toLowerCase().endsWith(".mp3"))return {};
 try{
  const buffer=await file.slice(0,1024*1024).arrayBuffer();
  const bytes=new Uint8Array(buffer);
  if(bytes.length<10||String.fromCharCode(...bytes.subarray(0,3))!=="ID3")return {};
  const major=bytes[3];
  if(major<2||major>4)return {};
  const tagEnd=Math.min(bytes.length,10+syncSafeSize(bytes,6));
  let offset=10;
  const result={};
  const ids=major===2?{TT2:"title",TP1:"artist",TAL:"album"}:{TIT2:"title",TPE1:"artist",TALB:"album"};
  while(offset+6<tagEnd){
   let frameId,frameSize,headerSize;
   if(major===2){
    frameId=String.fromCharCode(...bytes.subarray(offset,offset+3));
    frameSize=(bytes[offset+3]<<16)|(bytes[offset+4]<<8)|bytes[offset+5];
    headerSize=6;
   }else{
    frameId=String.fromCharCode(...bytes.subarray(offset,offset+4));
    frameSize=major===4?syncSafeSize(bytes,offset+4):((bytes[offset+4]<<24)|(bytes[offset+5]<<16)|(bytes[offset+6]<<8)|bytes[offset+7]);
    headerSize=10;
   }
   if(!frameId.trim()||/^\\0+$/.test(frameId)||!Number.isFinite(frameSize)||frameSize<=0)break;
   const start=offset+headerSize,end=Math.min(tagEnd,start+frameSize);
   if(end<=start)break;
   const field=ids[frameId];
   if(field&&!result[field])result[field]=decodeId3Text(bytes.subarray(start,end));
   offset=start+frameSize;
  }
  return result;
 }catch(_error){return {};}
}
