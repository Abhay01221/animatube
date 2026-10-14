import type { GenerationConfig } from "./config";
import type { StageKey,StageOutput } from "./checkpoints";
export function stageInput(config:GenerationConfig, approvedScript:unknown, stage:StageKey, outputs:Partial<Record<StageKey,StageOutput>>) {
  const {visibility: _visibility, approvalRequired: _approval, channelProfileId: _channel, parentVideoId: _parent, ...renderConfig}=config;
  void _visibility; void _approval; void _channel; void _parent;
  return {rendererVersion:2,stage,config:renderConfig,approvedScript:approvedScript??null,dependencies:outputs};
}
