export const DOMINANT_VISUAL_STORY_INSTRUCTION = [
  'Сначала проанализируй все фотографии как единый набор, затем выбери один доминирующий визуальный сюжет.',
  'Построй текст вокруг одного главного визуального акцента, одной эмоциональной линии и одной истории.',
  'Остальные фотографии используй только как поддерживающий контекст: не перечисляй объекты или детали каждого изображения и не пытайся описать всё.',
  'Если кадры противоречат друг другу, выбери наиболее сильную линию, а второстепенные и противоречащие ей кадры игнорируй.',
].join(' ');

export function buildInitialContentInstruction(archetypeInstruction?: string): string {
  if (!archetypeInstruction?.trim()) return DOMINANT_VISUAL_STORY_INSTRUCTION;
  return `${DOMINANT_VISUAL_STORY_INSTRUCTION}\n\n${archetypeInstruction}`;
}
