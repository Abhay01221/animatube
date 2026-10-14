import { z } from "zod";

export const GenerationSchema = z.object({
  prompt: z.string().trim().min(10).max(20000),
  style: z.enum(["educational", "storytelling", "motivational", "documentary", "anime-style"]).default("educational"),
  duration: z.enum(["short", "long"]).default("short"),
  voice: z.enum(["male", "female", "ai_narrator"]).default("ai_narrator"),
  language: z.enum(["english", "hindi", "spanish"]).default("english"),
  visibility: z.enum(["private", "unlisted", "public"]).default("private"),
  visualStyle: z.enum(["stock", "illustration", "anime"]).default("stock"),
  aspectRatio: z.enum(["16:9", "9:16"]).default("16:9"),
  resolution: z.enum(["720p", "1080p"]).default("1080p"),
  frameRate: z.union([z.literal(24), z.literal(30)]).default(24),
  targetDuration: z.number().int().min(15).max(600).optional(),
  approvalRequired: z.boolean().default(true),
  pronunciation: z.record(z.string().max(100), z.string().max(200)).default({}),
  captionPreset:z.enum(["clean","bold","minimal"]).default("clean"),
  musicAsset:z.object({provider:z.literal("s3"),key:z.string().min(1).max(2000),licensed:z.literal(true)}).optional(),
  musicVolume:z.number().min(0).max(0.5).default(0.15),
  channelProfileId: z.string().max(100).optional(),
  channelInstructions:z.string().max(15000).default(""),
  parentVideoId: z.string().max(100).optional(),
  variantKind:z.enum(["short","translation"]).optional(),
  variantSceneIds:z.array(z.number().int().positive()).max(60).optional(),
  sources: z.array(z.object({ id: z.string().min(1).max(100), title: z.string().max(300), text: z.string().min(1).max(30000), url: z.string().url().optional() })).max(10).refine(sources=>sources.reduce((size,source)=>size+source.text.length,0)<=60000,"Combined source text exceeds 60,000 characters").refine(sources=>new Set(sources.map(source=>source.id)).size===sources.length,"Source IDs must be unique").default([]),
});
export type GenerationConfig = z.infer<typeof GenerationSchema>;
export function configFromVideo(video: {prompt:string;style:string;duration:string;voice:string;language:string;visibility:string;generationOptions?:unknown}): GenerationConfig {
  const options = video.generationOptions && typeof video.generationOptions === "object" ? video.generationOptions : {};
  return GenerationSchema.parse({ prompt:video.prompt, style:video.style, duration:video.duration, voice:video.voice, language:video.language, visibility:video.visibility, ...options });
}
export const asJson = <T>(value: T) => JSON.parse(JSON.stringify(value)) as import("@prisma/client").Prisma.InputJsonValue;
