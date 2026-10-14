import { createCanvas } from "canvas";
export type ThumbnailStyle="bold"|"clean"|"cinematic";
export function renderThumbnail(title:string,style:ThumbnailStyle):Buffer{
  const canvas=createCanvas(1280,720),ctx=canvas.getContext("2d");
  const palette={bold:["#4c1d95","#111827"],clean:["#0f172a","#164e63"],cinematic:["#18181b","#7c2d12"]}[style];
  const gradient=ctx.createLinearGradient(0,0,1280,720);gradient.addColorStop(0,palette[0]);gradient.addColorStop(1,palette[1]);ctx.fillStyle=gradient;ctx.fillRect(0,0,1280,720);
  ctx.fillStyle=style==="clean"?"#22d3ee":"#c4b5fd";ctx.fillRect(70,100,12,520);ctx.fillStyle="#ffffff";
  let size=82;let lines:string[]=[];
  do{ctx.font=`bold ${size}px sans-serif`;lines=[];let line="";for(const word of title.trim().split(/\s+/)){if(line&&ctx.measureText(line+" "+word).width>1080){lines.push(line);line=word;}else line+=(line?" ":"")+word;}if(line)lines.push(line);if(lines.length<=4)break;size-=4;}while(size>44);
  const start=360-(lines.length-1)*size*0.65;lines.slice(0,4).forEach((line,index)=>ctx.fillText(line,110,start+index*size*1.3,1080));
  ctx.font="24px sans-serif";ctx.fillStyle="#cbd5e1";ctx.fillText("ANIMATUBE",110,655);return canvas.toBuffer("image/png");
}
