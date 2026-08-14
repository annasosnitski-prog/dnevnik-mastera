// Вынесено из TattoDiary.tsx (PR 3 рефакторинга). Логика не менялась —
// только перенос.
// Явное .js — модуль попадает в тестовую сборку (tsconfig.test.json), а
// скомпилированный ESM требует расширение в value-импортах.
import { type ChatPlatform, CHAT_PLATFORM_DOMAINS } from '../domain/client.js';

// Turns a raw input (phone, @handle, domain or full URL) into an openable link.
export function buildChatLink(platform: ChatPlatform, raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Without this, a link like "instagram.com/name" falls through to the
  // handle logic below, which would prefix the domain a second time —
  // "https://instagram.com/instagram.com/name" — a broken URL that the
  // platform then redirects to its own homepage instead of the profile/chat.
  const domain = CHAT_PLATFORM_DOMAINS[platform];
  if (domain && new RegExp(`^(www\\.)?${domain.replace('.', '\\.')}(/|$)`, 'i').test(trimmed)) {
    return `https://${trimmed}`;
  }
  const handle = trimmed.replace(/^@/, '');
  switch (platform) {
    case 'whatsapp': {
      const digits = trimmed.replace(/[^\d]/g, '');
      return digits ? `https://wa.me/${digits}` : trimmed;
    }
    case 'telegram':
      return handle ? `https://t.me/${handle}` : trimmed;
    // Social-media platforms (Instagram/Facebook/TikTok/Pinterest) open the
    // profile page, not a chat — only whatsapp/telegram/messenger are actual
    // messaging apps and get a direct-chat link.
    case 'instagram':
      return handle ? `https://instagram.com/${handle}` : trimmed;
    case 'facebook':
      return handle ? `https://facebook.com/${handle}` : trimmed;
    case 'messenger':
      return handle ? `https://m.me/${handle}` : trimmed;
    case 'tiktok':
      return handle ? `https://tiktok.com/@${handle}` : trimmed;
    case 'pinterest':
      return handle ? `https://pinterest.com/${handle}` : trimmed;
    case 'website':
      return trimmed ? `https://${trimmed}` : trimmed;
    default:
      return trimmed;
  }
}
