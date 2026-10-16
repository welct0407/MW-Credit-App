/** Receipt photos are downscaled on the device so a slow uplink can finish within the server body timer. Output is never larger than the original. */
export const RECEIPT_MAX_EDGE=1600,RECEIPT_TARGET_BYTES=1048576,RECEIPT_LIMIT_BYTES=5242880,RECEIPT_QUALITIES=[0.85,0.75,0.65];
export function scaledSize(width:number,height:number,maxEdge=RECEIPT_MAX_EDGE):{width:number;height:number;scale:number}{
 const longest=Math.max(width,height);
 if(!(longest>maxEdge))return {width,height,scale:1};
 const scale=maxEdge/longest;
 return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)),scale};
}
export function needsDownscale(file:{type:string;size:number},dims:{width:number;height:number}|null):boolean{
 if(!dims)return false;
 return file.size>RECEIPT_TARGET_BYTES||Math.max(dims.width,dims.height)>RECEIPT_MAX_EDGE;
}
type Bitmap={width:number;height:number;close?:()=>void};
type Canvas={width:number;height:number;getContext:(kind:'2d')=>{drawImage:(image:any,x:number,y:number,width:number,height:number)=>void}|null;toBlob:(callback:(blob:Blob|null)=>void,type?:string,quality?:number)=>void};
export type ReceiptImageDeps={createImageBitmap:(file:Blob,options?:any)=>Promise<Bitmap>;createCanvas:()=>Canvas};
const defaultDeps=():ReceiptImageDeps=>({createImageBitmap:(file,options)=>globalThis.createImageBitmap(file,options) as Promise<Bitmap>,createCanvas:()=>document.createElement('canvas') as unknown as Canvas});
export async function prepareReceiptImage(file:File,deps:ReceiptImageDeps=defaultDeps()):Promise<File>{
 if(!['image/png','image/jpeg'].includes(file.type)||!(file.size>0))return file;
 let bitmap:Bitmap|null=null;
 try{
  // from-image bakes EXIF orientation into the re-encoded JPEG, which carries no EXIF.
  try{bitmap=await deps.createImageBitmap(file,{imageOrientation:'from-image'})}catch{bitmap=await deps.createImageBitmap(file)}
  if(!bitmap||!needsDownscale(file,{width:bitmap.width,height:bitmap.height}))return file;
  const size=scaledSize(bitmap.width,bitmap.height),canvas=deps.createCanvas();
  canvas.width=size.width;canvas.height=size.height;
  const context=canvas.getContext('2d');if(!context)return file;
  context.drawImage(bitmap,0,0,size.width,size.height);
  let blob:Blob|null=null;
  for(const quality of RECEIPT_QUALITIES){
   blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
   if(blob&&blob.size<=RECEIPT_TARGET_BYTES)break;
  }
  if(!blob||!(blob.size>0)||blob.size>=file.size)return file;
  return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg',lastModified:file.lastModified});
 }catch{return file}
 finally{try{bitmap?.close?.()}catch{}}
}
