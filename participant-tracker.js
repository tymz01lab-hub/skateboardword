// Local, short-lived position/clothing tracking. No images or identity data are saved.
class ParticipantTracker {
  constructor(){this.track=null;this.generation=0;this.releaseAfter=1500}
  reset(){this.track=null}
  candidate(points,index,appearance=null){
    const visible=i=>points[i]?.visibility>.3&&Number.isFinite(points[i].x)&&Number.isFinite(points[i].y)&&points[i].x>=0&&points[i].x<=1&&points[i].y>=0&&points[i].y<=1;
    const torso=[11,12,23,24].filter(visible);if(torso.length<2)return null;
    const body=[0,11,12,23,24,25,26,27,28].filter(visible),ys=body.map(i=>points[i].y);
    return {index,points,x:torso.reduce((s,i)=>s+points[i].x,0)/torso.length,y:torso.reduce((s,i)=>s+points[i].y,0)/torso.length,height:Math.max(.15,Math.max(...ys)-Math.min(...ys)),appearance};
  }
  select(candidates,now){
    candidates=candidates.filter(Boolean);
    if(this.track&&now-this.track.seen>=this.releaseAfter)this.track=null;
    let selected=null;
    if(this.track){
      const t=this.track,elapsed=Math.max(1,now-t.seen),prediction=Math.min(elapsed,300),gate=Math.max(.10,Math.min(.30,t.height*.35))+Math.min(elapsed,500)*.00015;
      const ranked=candidates.map(c=>{
        const distance=Math.hypot(c.x-t.x-t.vx*prediction,c.y-t.y-t.vy*prediction),ratio=c.height/t.height;
        const color=c.appearance&&t.appearance?Math.sqrt(c.appearance.reduce((sum,v,i)=>sum+(v-t.appearance[i])**2,0)/c.appearance.length):0;
        return {c,distance,ratio,color,score:distance/gate+Math.abs(Math.log(ratio))*.35+color*2};
      }).filter(v=>v.distance<=gate&&v.ratio>.45&&v.ratio<2.2&&v.color<.24).sort((a,b)=>a.score-b.score);
      selected=ranked[0]?.c||null;
      if(selected){
        const vx=(selected.x-t.x)/elapsed,vy=(selected.y-t.y)/elapsed;
        t.vx=t.vx*.6+Math.max(-.001,Math.min(.001,vx))*.4;t.vy=t.vy*.6+Math.max(-.001,Math.min(.001,vy))*.4;
        t.x=selected.x;t.y=selected.y;t.height=t.height*.7+selected.height*.3;t.seen=now;
        if(selected.appearance)t.appearance=t.appearance?t.appearance.map((v,i)=>v*.97+selected.appearance[i]*.03):selected.appearance.slice();
      }
    }else if(candidates.length){
      // On first arrival, prefer the person near the center of the experience.
      selected=candidates.slice().sort((a,b)=>(Math.abs(a.x-.5)-a.height*.12)-(Math.abs(b.x-.5)-b.height*.12))[0];
      this.track={...selected,appearance:selected.appearance?.slice()||null,vx:0,vy:0,seen:now};this.generation++;
    }
    return {index:selected?.index??null,id:this.generation,locked:!!this.track,missing:!!this.track&&!selected};
  }
}
