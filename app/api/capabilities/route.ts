import { NextResponse } from "next/server";
import { generatedVisualCapabilities } from "@/lib/cinematic/generated-provider";
export async function GET(){return NextResponse.json({generatedVisuals:generatedVisualCapabilities(),formats:["16:9","9:16"],resolutions:["720p","1080p"],generationCredits:1,billing:"pilot"});}
