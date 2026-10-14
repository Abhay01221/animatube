/** Captions use provider word boundaries; missing timing is disclosed as scene-level captions. */
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import ffmpeg,{runFFmpeg} from "../ffmpeg";
import { downloadAsset } from "../assets";
import { uploadFileToS3 } from "../s3";
import { escapeFilterPath,resolveRenderOptions } from "../cinematic/render-options";
import type { CinematicScene,RenderOptions,TimedWord } from "../types/cinematic";

export interface SubtitlePhrase {text:string;startTime:number;endTime:number;sceneIndex:number}
export interface CinematicSubtitleOptions extends RenderOptions {
  language?:string;words?:TimedWord[];fontSize?:number;fontName?:string;primaryColor?:string;outlineColor?:string;
  outlineWidth?:number;shadowDepth?:number;marginBottom?:number;fadeInDuration?:number;fadeOutDuration?:number;
  maxCharsPerLine?:number;maxLines?:number;captionPreset?:"clean"|"bold"|"minimal";
}
type Timeline=Array<{start_sec:number;end_sec:number;scene:CinematicScene}>;
export function captionPhrases(timeline:Timeline,options:CinematicSubtitleOptions={}):SubtitlePhrase[]{
  const phrases:SubtitlePhrase[]=[];
  const maxChars=(options.maxCharsPerLine??(options.aspectRatio==="9:16"?24:42))*(options.maxLines??2);
  for(const [sceneIndex,entry] of timeline.entries()){
    const override=(entry.scene as CinematicScene&{caption?:string}).caption;
    const words=(options.words??[]).filter(word=>word.sceneIndex===sceneIndex&&Number.isFinite(word.startTime)&&Number.isFinite(word.endTime)&&word.endTime>word.startTime).sort((a,b)=>a.startTime-b.startTime);
    if(override!==undefined||!words.length){
      // Never invent word timing. A user-edited caption or missing provider timings is a scene-level cue.
      const text=(override??entry.scene.narration).trim();
      if(text)phrases.push({text,startTime:entry.start_sec,endTime:entry.end_sec,sceneIndex});
      continue;
    }
    let group:TimedWord[]=[];
    const flush=()=>{if(group.length){const text=group.map(w=>w.text).join(" ");phrases.push({text,startTime:Math.max(entry.start_sec,group[0].startTime),endTime:Math.min(entry.end_sec,group[group.length-1].endTime),sceneIndex});group=[];}};
    for(const word of words){
      if(group.length&&(group.map(w=>w.text).join(" ").length+word.text.length+1>maxChars||word.startTime-group[0].startTime>4||word.startTime-group[group.length-1].endTime>0.6))flush();
      group.push(word);if(/[.!?।]$/.test(word.text))flush();
    }
    flush();
  }
  return phrases.filter(cue=>cue.endTime>cue.startTime);
}
export function subtitleTimestamp(seconds:number,format:"srt"|"vtt"|"ass"="srt"):string{
  const factor=format==="ass"?100:1000;const units=Math.max(0,Math.round(seconds*factor));
  const h=Math.floor(units/(3600*factor)),m=Math.floor(units/(60*factor))%60,s=Math.floor(units/factor)%60,sub=units%factor;
  return `${format==="ass"?h:String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}${format==="srt"?",":"."}${String(sub).padStart(format==="ass"?2:3,"0")}`;
}
const safeText=(text:string)=>text.replace(/\r/g,"").replace(/-->/g,"→");
export function exportSrt(phrases:SubtitlePhrase[]):string{
  return phrases.map((p,index)=>`${index+1}\n${subtitleTimestamp(p.startTime)} --> ${subtitleTimestamp(p.endTime)}\n${safeText(p.text)}\n`).join("\n");
}
export function exportVtt(phrases:SubtitlePhrase[]):string{
  return "WEBVTT\n\n"+phrases.map(p=>`${subtitleTimestamp(p.startTime,"vtt")} --> ${subtitleTimestamp(p.endTime,"vtt")}\n${safeText(p.text).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}\n`).join("\n");
}
export function wrapCaption(text:string,width:number):string{
  const lines:string[]=[];let current="";
  for(const word of text.replace(/[{}]/g,"").replace(/\\/g,"／").split(/\s+/)){
    if(current&&(current+" "+word).length>width){lines.push(current);current=word;}else current+=(current?" ":"")+word;
  }
  if(current)lines.push(current);return lines.join("\\N");
}
export function generateASSSubtitles(phrases:SubtitlePhrase[],options:CinematicSubtitleOptions={}):string{
  const {width,height}=resolveRenderOptions(options);const vertical=options.aspectRatio==="9:16";
  const hindi=["hindi","hi"].includes(options.language??"");
  const font=(options.fontName??(hindi?(process.platform==="win32"?"Nirmala UI":"Noto Sans Devanagari"):"Arial")).replace(/[,\r\n]/g,"");
  const fontSize=options.fontSize??Math.round(width*(vertical?0.048:0.026)*(options.captionPreset==="bold"?1.15:1));
  const margin=options.marginBottom??Math.round(height*(vertical?0.16:0.07));
  const color=(value:string|undefined,fallback:string)=>value&&/^&H[0-9a-f]{6,8}$/i.test(value)?value:fallback;
  return ["[Script Info]","ScriptType: v4.00+",`PlayResX: ${width}`,`PlayResY: ${height}`,"WrapStyle: 0","ScaledBorderAndShadow: yes","","[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Caption,${font},${fontSize},${color(options.primaryColor,"&H00FFFFFF")},&H00FFFFFF,${color(options.outlineColor,"&H00000000")},&H80000000,${options.captionPreset==="bold"?-1:0},0,0,0,100,100,0,0,1,${options.outlineWidth??2},${options.shadowDepth??1},2,${Math.round(width*0.06)},${Math.round(width*0.06)},${margin},1`,
    "","[Events]","Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...phrases.map(p=>`Dialogue: 0,${subtitleTimestamp(p.startTime,"ass")},${subtitleTimestamp(p.endTime,"ass")},Caption,,0,0,0,,{\\fad(${Math.round((options.fadeInDuration??0.08)*1000)},${Math.round((options.fadeOutDuration??0.08)*1000)})}${wrapCaption(p.text,options.maxCharsPerLine??(vertical?24:42))}`),""].join("\n");
}
export async function burnCinematicSubtitles(videoPath:string,assPath:string,outputPath:string,options:CinematicSubtitleOptions={}):Promise<void>{
  const fonts=process.env.SUBTITLE_FONT_DIR?`:fontsdir='${escapeFilterPath(process.env.SUBTITLE_FONT_DIR)}'`:"";
  const command=ffmpeg(videoPath).videoFilters(`ass='${escapeFilterPath(assPath)}'${fonts}`).outputOptions(["-c:v","libx264","-preset","veryfast","-crf","20","-c:a","copy","-pix_fmt","yuv420p","-threads","2","-movflags","+faststart"]).output(outputPath);
  await runFFmpeg(command,30*60_000,options.signal);
}
export async function addCinematicSubtitles(jobId:string,_scenes:CinematicScene[],timeline:Timeline,rawVideoS3Key:string,tmpDir:string,options:CinematicSubtitleOptions={},onLog?:(message:string)=>void):Promise<string>{
  const phrases=captionPhrases(timeline,options);if(!phrases.length)throw new Error("No valid captions could be created");
  if(timeline.some((_,index)=>!(options.words??[]).some(word=>word.sceneIndex===index)))onLog?.("Some scenes lack provider word timings; those captions use disclosed scene-level cues.");
  const assPath=join(tmpDir,"cinematic_subs.ass"),srtPath=join(tmpDir,"captions.srt"),vttPath=join(tmpDir,"captions.vtt");
  await Promise.all([writeFile(assPath,generateASSSubtitles(phrases,options),"utf8"),writeFile(srtPath,exportSrt(phrases),"utf8"),writeFile(vttPath,exportVtt(phrases),"utf8")]);
  await Promise.all([[assPath,"cinematic_subs.ass","text/plain"],[srtPath,"captions.srt","application/x-subrip"],[vttPath,"captions.vtt","text/vtt"]].map(([file,name,type])=>uploadFileToS3(`jobs/${jobId}/${name}`,file,type)));
  const rawPath=join(tmpDir,"raw_video.mp4");if(!existsSync(rawPath))await downloadAsset({provider:"s3",key:rawVideoS3Key},rawPath);
  const finalPath=join(tmpDir,"final_video.mp4");await burnCinematicSubtitles(rawPath,assPath,finalPath,options);
  const key=`jobs/${jobId}/final_video.mp4`;await uploadFileToS3(key,finalPath,"video/mp4");onLog?.("Captions rendered and SRT/VTT exports saved");return key;
}
