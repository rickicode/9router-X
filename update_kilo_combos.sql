-- Update open-weight-latest with tested Kilo Free models + Cline Free flagships
UPDATE combos SET models = '[
  "cline-free/z-ai/glm-5.3-flash",
  "cline-free/deepseek/deepseek-v4.1-flash",
  "kilocode/kilo-auto/free",
  "kilocode/inclusionai/ling-3.0-flash-fin:free",
  "kilocode/poolside/laguna-xs-2.1:free",
  "cline-free/google/gemma-4-26b-a4b-it:free",
  "cline-free/z-ai/glm-5.2:free",
  "kilocode/z-ai/glm-5.2:free",
  "kilocode/nvidia/nemotron-3-ultra-550b-a55b:free",
  "kilocode/nex-agi/nex-n2.5-mini:free",
  "kilocode/cohere/north-mini-code:free",
  "cline-free/poolside/laguna-s-2.1:free",
  "kilocode/poolside/laguna-s-2.1:free",
  "kilocode/dots-studio/dots-3-note-preview:free",
  "cline-free/nvidia/nemotron-3.5-lightning:free",
  "kilocode/qwen/qwen3.8-27b:free"
]'::jsonb, updated_at = NOW() WHERE name = 'open-weight-latest';

-- Update GLM combos with kilocode/z-ai/glm-5.2:free
UPDATE combos SET models = '[
  "cline-free/z-ai/glm-5.3-flash",
  "cline-free/z-ai/glm-5.2:free",
  "kilocode/z-ai/glm-5.2:free",
  "tokenrouter/z-ai/glm-5.3-free",
  "ocz/glm-5.3-flash",
  "ocz/glm-5.3"
]'::jsonb, updated_at = NOW() WHERE name = 'glm5.3';

UPDATE combos SET models = '[
  "cline-free/z-ai/glm-5.3-flash",
  "cline-free/z-ai/glm-5.2:free",
  "kilocode/z-ai/glm-5.2:free",
  "ocz/glm-5.3-flash"
]'::jsonb, updated_at = NOW() WHERE name IN ('glm-latest', 'glm-5.3-flash');
