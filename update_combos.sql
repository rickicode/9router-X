UPDATE combos SET models = '["cline-free/z-ai/glm-5.3-flash", "cline-free/deepseek/deepseek-v4.1-flash", "cline-free/google/gemma-4-26b-a4b-it:free", "cline-free/z-ai/glm-5.2:free", "cline-free/poolside/laguna-s-2.1:free", "oc/muse-spark-1.3-contributor-free", "ocz/muse-spark-1.3-contributor-free"]'::jsonb, updated_at = NOW() WHERE name = 'free-model';

UPDATE combos SET models = '["cline-free/z-ai/glm-5.3-flash", "cline-free/z-ai/glm-5.2:free", "tokenrouter/z-ai/glm-5.3-free", "ocz/glm-5.3-flash", "ocz/glm-5.3"]'::jsonb, updated_at = NOW() WHERE name = 'glm5.3';

UPDATE combos SET models = '["cline-free/z-ai/glm-5.3-flash", "cline-free/z-ai/glm-5.2:free", "ocz/glm-5.3-flash"]'::jsonb, updated_at = NOW() WHERE name IN ('glm-latest', 'glm-5.3-flash');

UPDATE combos SET models = '["cline-free/deepseek/deepseek-v4.1-flash", "uk/deepseek/deepseek-v4-flash", "th/deepseek-v4.1-flash:free", "cloudflare-ai/@cf/deepseek-ai/deepseek-r1-distill-qwen-32b"]'::jsonb, updated_at = NOW() WHERE name = 'deepseek-v4.1-flash';

UPDATE combos SET models = '["cline-free/deepseek/deepseek-v4.1-flash", "uk/deepseek/deepseek-v4-flash", "th/deepseek-v4.1-flash:free"]'::jsonb, updated_at = NOW() WHERE name IN ('deepseek-flash-latest', 'deepseek-v4-flash');

UPDATE combos SET models = '["cline-free/z-ai/glm-5.3-flash", "cline-free/deepseek/deepseek-v4.1-flash", "cline-free/google/gemma-4-26b-a4b-it:free", "cline-free/z-ai/glm-5.2:free", "cline-free/poolside/laguna-s-2.1:free", "cline-free/google/gemma-4-31b-it:free", "cline-free/nvidia/nemotron-3.5-lightning:free"]'::jsonb, updated_at = NOW() WHERE name = 'open-weight-latest';

UPDATE combos SET models = '["uk/claude-haiku-4-5-20251001", "cline-free/z-ai/glm-5.3-flash", "cline-free/deepseek/deepseek-v4.1-flash", "cline-free/google/gemma-4-26b-a4b-it:free", "mimo", "mocin", "atria/Atria-Dawn-Preview"]'::jsonb, updated_at = NOW() WHERE name = 'wush';

UPDATE combos SET models = '["free-model", "cline-free/z-ai/glm-5.3-flash", "cline-free/deepseek/deepseek-v4.1-flash", "gemini-flash-latest", "claude-latest", "gpt-latest"]'::jsonb, updated_at = NOW() WHERE name = 'smart-model';

UPDATE combos SET models = '["cline-free/z-ai/glm-5.3-flash", "free-model", "mocin", "mimo", "glm5.3", "oc/muse-spark-1.3-contributor-free"]'::jsonb, updated_at = NOW() WHERE name = 'hemat';
