UPDATE combos SET models = '["cline-free/z-ai/glm-5.3-flash", "cline-free/z-ai/glm-5.2:free", "kilocode/z-ai/glm-5.2:free"]'::jsonb, updated_at = NOW() WHERE name IN ('glm-latest', 'glm-5.3-flash');

UPDATE combos SET models = '["cline-free/z-ai/glm-5.3-flash", "cline-free/z-ai/glm-5.2:free", "kilocode/z-ai/glm-5.2:free", "tokenrouter/z-ai/glm-5.3-free"]'::jsonb, updated_at = NOW() WHERE name = 'glm5.3';
