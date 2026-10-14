"use client";
import {useRef,useState,type VideoHTMLAttributes} from "react";

// The parent keys this component by the rendered asset, never its expiring signature.
export function VideoPlayer({src,...props}:Omit<VideoHTMLAttributes<HTMLVideoElement>,"src">&{src:string}){
  const [source,setSource]=useState(src),[failed,setFailed]=useState(false);
  const element=useRef<HTMLVideoElement>(null),position=useRef(0),wasPlaying=useRef(false);
  const resume=useRef<{time:number;playing:boolean}|null>(null);
  function retry(){
    resume.current={time:position.current,playing:wasPlaying.current};setFailed(false);
    if(src!==source)setSource(src);else element.current?.load();
  }
  return <div className="relative h-full w-full"><video {...props} ref={element} src={source}
    onTimeUpdate={()=>{position.current=element.current?.currentTime??0;}}
    onPlay={()=>{wasPlaying.current=true;}}
    onPause={()=>{if(!element.current?.error)wasPlaying.current=false;}}
    onError={()=>{if(src!==source)retry();else setFailed(true);}}
    onLoadedMetadata={()=>{const saved=resume.current;if(!saved||!element.current)return;resume.current=null;element.current.currentTime=saved.time;if(saved.playing)void element.current.play().catch(()=>{});else element.current.pause();}}/>
    {failed&&<button type="button" onClick={retry} className="absolute bottom-12 left-3 right-3 rounded bg-zinc-900 px-3 py-2 text-sm text-white">Retry playback from saved position</button>}
  </div>;
}
