importScripts('participant-tracker.js');
const tracker=new ParticipantTracker();
const sample=new OffscreenCanvas(32,24),sampleBrush=sample.getContext('2d',{willReadFrequently:true});
const maskCanvas=new OffscreenCanvas(1,1),maskBrush=maskCanvas.getContext('2d');
let detector;
function appearance(points,pixels){
  const visible=i=>points[i]?.visibility>.3;
  if(![11,12,23,24].every(visible))return null;
  const shoulders={x:(points[11].x+points[12].x)/2,y:(points[11].y+points[12].y)/2},hips={x:(points[23].x+points[24].x)/2,y:(points[23].y+points[24].y)/2};
  const shirt={x:(shoulders.x+hips.x)/2,y:(shoulders.y+hips.y)/2};
  const knees=[25,26].filter(visible),pants=knees.length?{x:(hips.x+knees.reduce((s,i)=>s+points[i].x,0)/knees.length)/2,y:(hips.y+knees.reduce((s,i)=>s+points[i].y,0)/knees.length)/2}:hips;
  return [shirt,pants].flatMap(p=>{
    const x=Math.max(1,Math.min(30,Math.round(p.x*31))),y=Math.max(1,Math.min(22,Math.round(p.y*23))),rgb=[0,0,0];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(let c=0;c<3;c++)rgb[c]+=pixels[((y+dy)*32+x+dx)*4+c]/(9*255);
    return rgb;
  });
}
self.onmessage=async({data})=>{
  const {job,type}=data;let transferred=false;
  try{
    if(type==='init'){
      const base=new URL('assets/vision/',self.location.href).href;
      const {FilesetResolver,PoseLandmarker}=await import(base+'vision_bundle.js');
      const files=await FilesetResolver.forVisionTasks(base+'wasm');
      const options={baseOptions:{modelAssetPath:base+'pose_landmarker_lite.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:4,outputSegmentationMasks:true,minPoseDetectionConfidence:.3,minPosePresenceConfidence:.3,minTrackingConfidence:.3};
      // GPU initialization can succeed while its segmentation readback is all zero.
      // CPU/WASM in this worker keeps the display responsive and the mask portable.
      detector=await PoseLandmarker.createFromOptions(files,options);
      self.postMessage({job,ready:true});return;
    }
    if(type==='reset'){tracker.reset();self.postMessage({job,ready:true});return}
    const image=data.image;sampleBrush.drawImage(image,0,0,32,24);const pixels=sampleBrush.getImageData(0,0,32,24).data;
    let tracking,points=null,maskReady=false,maskPeak=0;
    // Consume only the selected mask inside the callback; other people never drive the app.
    detector.detectForVideo(image,data.time,result=>{
      const candidates=result.landmarks.map((p,index)=>tracker.candidate(p,index,appearance(p,pixels)));
      tracking=tracker.select(candidates,performance.now());
      if(tracking.index===null)return;
      points=result.landmarks[tracking.index];
      const mask=result.segmentationMasks?.[tracking.index];if(!mask||!data.needMask)return;
      const values=mask.getAsFloat32Array(),rgba=new Uint8ClampedArray(values.length*4);
      for(let i=0;i<values.length;i++){maskPeak=Math.max(maskPeak,values[i]);rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=255;rgba[i*4+3]=Math.round(Math.max(0,Math.min(1,values[i]))*255)}
      if(!(maskPeak>.05))return;
      if(maskCanvas.width!==mask.width||maskCanvas.height!==mask.height){maskCanvas.width=mask.width;maskCanvas.height=mask.height}
      maskBrush.putImageData(new ImageData(rgba,mask.width,mask.height),0,0);maskReady=true;
    });
    const mask=maskReady?await createImageBitmap(maskCanvas):null;
    self.postMessage({job,poseLandmarks:points,tracking,segmentationMask:mask,image,maskPeak},mask?[image,mask]:[image]);transferred=true;
  }catch(error){self.postMessage({job,error:String(error.message||error)})}
  finally{if(data.image&&!transferred)data.image.close()}
};
