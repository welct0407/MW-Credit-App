import sharp from 'sharp';
export async function decodeCommandReceipt(bytes,mimeType) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length>5242880 || !['image/png','image/jpeg'].includes(mimeType)) throw Error('invalid_receipt');
  const snapshot=Buffer.from(bytes);
  const png=snapshot.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=snapshot[0]===255 && snapshot[1]===216 && snapshot[2]===255;
  if ((mimeType==='image/png'&&!png)||(mimeType==='image/jpeg'&&!jpeg)) throw Error('invalid_receipt');
  try {
    const image=sharp(snapshot,{failOn:'warning',limitInputPixels:20000000,animated:false});
    const meta=await image.metadata();
    if (meta.format!==(mimeType==='image/png'?'png':'jpeg') || !meta.width || !meta.height
      || meta.width*meta.height>20000000 || (meta.pages??1)>1) throw Error();
    await image.raw().toBuffer();
  } catch { throw Error('invalid_receipt'); }
}
