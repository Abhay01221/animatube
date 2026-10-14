import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act,createElement } from "react";
import { VideoPlayer } from "./VideoPlayer";

async function fixture(run:(root:import("react-dom/client").Root,container:HTMLElement,window:JSDOM["window"])=>Promise<void>){
  const dom=new JSDOM("<!doctype html><div id='root'></div>",{url:"http://localhost"});
  const previous=new Map<string,PropertyDescriptor|undefined>();
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  }
  const {createRoot}=await import("react-dom/client"),container=dom.window.document.getElementById("root")!,root=createRoot(container);
  try{await run(root,container,dom.window);}finally{await act(()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
}
test("dashboard signature refresh preserves the player node, source and playback position",async()=>fixture(async(root,container)=>{
  await act(()=>root.render(createElement(VideoPlayer,{key:"asset-1",src:"https://storage.test/video?signature=old",controls:true})));
  const player=container.querySelector("video")!;player.currentTime=37;
  for(let poll=0;poll<4;poll++)await act(()=>root.render(createElement(VideoPlayer,{key:"asset-1",src:`https://storage.test/video?signature=${poll}`,controls:true})));
  assert.equal(container.querySelector("video"),player);assert.equal(player.currentTime,37);assert.equal(player.getAttribute("src"),"https://storage.test/video?signature=old");
  await act(()=>root.render(createElement(VideoPlayer,{key:"asset-2",src:"https://storage.test/new-video",controls:true})));
  assert.notEqual(container.querySelector("video"),player);assert.equal(container.querySelector("video")!.getAttribute("src"),"https://storage.test/new-video");
}));
test("an expired playback URL renews while preserving position and play state",async()=>fixture(async(root,container,window)=>{
  let plays=0;window.HTMLMediaElement.prototype.play=async()=>{plays++;};
  await act(()=>root.render(createElement(VideoPlayer,{key:"asset-1",src:"https://storage.test/video?old",controls:true})));
  const player=container.querySelector("video")!;player.currentTime=42;
  await act(()=>{player.dispatchEvent(new window.Event("timeupdate"));player.dispatchEvent(new window.Event("play"));});
  await act(()=>root.render(createElement(VideoPlayer,{key:"asset-1",src:"https://storage.test/video?new",controls:true})));
  await act(()=>player.dispatchEvent(new window.Event("error")));
  assert.equal(player.getAttribute("src"),"https://storage.test/video?new");
  player.currentTime=0;await act(()=>player.dispatchEvent(new window.Event("loadedmetadata")));
  assert.equal(player.currentTime,42);assert.equal(plays,1);
}));
test("renewing a paused player keeps it paused at its saved position",async()=>fixture(async(root,container,window)=>{
  let pauses=0,plays=0;window.HTMLMediaElement.prototype.pause=()=>{pauses++;};window.HTMLMediaElement.prototype.play=async()=>{plays++;};
  await act(()=>root.render(createElement(VideoPlayer,{key:"asset",src:"https://storage.test/video?old",autoPlay:true})));
  const player=container.querySelector("video")!;player.currentTime=23;
  await act(()=>{player.dispatchEvent(new window.Event("timeupdate"));player.dispatchEvent(new window.Event("pause"));});
  await act(()=>root.render(createElement(VideoPlayer,{key:"asset",src:"https://storage.test/video?new",autoPlay:true})));
  await act(()=>player.dispatchEvent(new window.Event("error")));player.currentTime=0;
  await act(()=>player.dispatchEvent(new window.Event("loadedmetadata")));
  assert.equal(player.currentTime,23);assert.equal(plays,0);assert.equal(pauses,1);
}));
