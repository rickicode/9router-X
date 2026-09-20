-- Update open-weight-latest with ALL working cline-free models + top kilocode models
UPDATE combos SET models = '[
  "cline-free/z-ai/glm-5.3-flash",
  "cline-free/deepseek/deepseek-v4.1-flash",
  "kilocode/kilo-auto/free",
  "kilocode/inclusionai/ling-3.0-flash-fin:free",
  "cline-free/google/gemma-4-26b-a4b-it:free",
  "cline-free/nvidia/nemotron-3.5-lightning:free",
  "cline-free/z-ai/glm-5.2:free",
  "cline-free/poolside/laguna-s-2.1:free",
  "cline-free/google/gemma-4-31b-it:free",
  "cline-free/nvidia/nemotron-3-ultra-550b-a55b:free",
  "cline-free/poolside/laguna-xs-2.1:free",
  "kilocode/poolside/laguna-xs-2.1:free",
  "kilocode/z-ai/glm-5.2:free",
  "kilocode/nvidia/nemotron-3-ultra-550b-a55b:free",
  "kilocode/nex-agi/nex-n2.5-mini:free",
  "kilocode/cohere/north-mini-code:free",
  "kilocode/poolside/laguna-s-2.1:free",
  "kilocode/dots-studio/dots-3-note-preview:free",
  "cline-free/nvidia/nemotron-3-super-120b-a12b:free",
  "cline-free/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "kilocode/qwen/qwen3.8-27b:free"
]'::jsonb, updated_at = NOW() WHERE name = 'open-weight-latest';

-- Update free-model with ALL working cline-free models + top kilocode free models
UPDATE combos SET models = '[
  "cline-free/z-ai/glm-5.3-flash",
  "cline-free/deepseek/deepseek-v4.1-flash",
  "kilocode/kilo-auto/free",
  "kilocode/inclusionai/ling-3.0-flash-fin:free",
  "cline-free/google/gemma-4-26b-a4b-it:free",
  "cline-free/nvidia/nemotron-3.5-lightning:free",
  "cline-free/z-ai/glm-5.2:free",
  "cline-free/poolside/laguna-s-2.1:free",
  "cline-free/google/gemma-4-31b-it:free",
  "cline-free/poolside/laguna-xs-2.1:free",
  "cline-free/nvidia/nemotron-3-ultra-550b-a55b:free",
  "kilocode/poolside/laguna-xs-2.1:free",
  "kilocode/nvidia/nemotron-3-ultra-550b-a55b:free",
  "kilocode/nex-agi/nex-n2.5-mini:free",
  "kilocode/cohere/north-mini-code:free",
  "oc/muse-spark-1.3-contributor-free"
]'::jsonb, updated_at = NOW() WHERE name = 'free-model';
