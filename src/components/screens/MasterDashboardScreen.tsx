import { useState, useEffect, type SVGProps } from 'react';
import type * as React from 'react';
import { DROP_CAP_FONT } from '../InkaLogo';
import { ToolbarIcon } from '../navigation/ToolbarIcons';
import { StarDivider } from '../icons/StarIcons';
import { InstagramIcon, TikTokIcon, PinterestIcon, FacebookIcon, WhatsAppIcon } from '../icons/SocialIcons';
import { ClientCardTabBar, type ClientCardTabDef } from '../client/ClientCardTabBar';
import { AddChatLinkForm, AddMasterLinkForm } from '../client/ClientControls';
import { GoldFrame } from '../ui/Stripes';
import { StatBlock } from '../ui/StatBlocks';
import { COLORS, fs } from '../ui/designTokens';
import { INPUT_STYLE } from '../TattoDiary';
import { ProjectCard } from '../project/ProjectCard';
import { buildChatLink } from '../../lib/chatLink';
import { syncActive, fetchBotBookings, DEFAULT_ENDPOINT, type CalendarSyncSettings } from '../../lib/calendarSync';
import { type ContentSyncSettings } from '../../lib/contentSync';
import { type MasterInfo, type MasterLink } from '../../lib/masterInfoStore';
import { mostUsedStyle } from '../../domain/plannerSelectors';
import { getWorkshopProjects } from '../../domain/projectSelectors';
import { type Client, type ChatPlatform, type ChatLink, PLATFORM_LABELS, MARKER_COLORS } from '../../domain/client';
import { type Project } from '../../domain/project';

// Вынесено из TattoDiary.tsx без изменения поведения, разметки и
// prop-driven контракта. Локальное состояние (активная вкладка, черновики
// полей ввода, тап-копирование в буфер) сохранено как было.

const MASTER_TABS: ClientCardTabDef<'info' | 'projects'>[] = [
  { id: 'info', kind: 'info', label: 'Инфо' },
  { id: 'projects', kind: 'projects', label: 'Проекты' },
];

export function MasterDashboardScreen({
  clients,
  masterInfo,
  onChangeMasterInfo,
  onOpenSettings,
  calendarSync,
  onChangeCalendarSync,
  contentSync,
  onChangeContentSync,
  onOpenContent,
  projects,
  onOpenProject,
  onCreateProject,
}: {
  clients: Client[];
  masterInfo: MasterInfo;
  onChangeMasterInfo: (m: MasterInfo) => void;
  onOpenSettings: () => void;
  calendarSync: CalendarSyncSettings;
  onChangeCalendarSync: (s: CalendarSyncSettings) => void;
  contentSync: ContentSyncSettings;
  onChangeContentSync: (s: ContentSyncSettings) => void;
  onOpenContent: () => void;
  // Проекты мастера без клиента («Мастерская») — тот же каркас вкладок, что
  // у карточки клиента (см. ClientCardTabBar), своя вкладка «Проекты».
  projects: Project[];
  onOpenProject: (project: Project) => void;
  onCreateProject: () => void;
}) {
  const [tab, setTab] = useState<'info' | 'projects'>('info');
  const [name, setName] = useState(masterInfo.name);
  useEffect(() => setName(masterInfo.name), [masterInfo.name]);

  const style = mostUsedStyle(clients);
  // «Проекты мастера» (clientId === null) — та же выборка, что «Мастерская»
  // использует для своей одноимённой папки (см. buildProjectFolders).
  const workshopProjects = getWorkshopProjects(projects);

  const addMasterLink = (label: string, value: string) => {
    const link: MasterLink = { id: crypto.randomUUID(), label: label.trim(), value: value.trim() };
    onChangeMasterInfo({ ...masterInfo, links: [...masterInfo.links, link] });
  };
  const removeMasterLink = (id: string) => {
    onChangeMasterInfo({ ...masterInfo, links: masterInfo.links.filter((l) => l.id !== id) });
  };
  const setColorLabel = (color: string, label: string) => {
    onChangeMasterInfo({ ...masterInfo, colorLabels: { ...masterInfo.colorLabels, [color]: label } });
  };

  // Tap-to-copy: a small "Скопировано ✓" chip fades in over the tapped card
  // for a moment, confirming the clipboard write without a blocking dialog.
  const [copiedTag, setCopiedTag] = useState<'payment' | 'phone' | 'telegramBot' | null>(null);
  const copyToClipboard = (text: string, tag: 'payment' | 'phone' | 'telegramBot') => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedTag(tag);
      setTimeout(() => setCopiedTag((t) => (t === tag ? null : t)), 1400);
    }).catch(() => {});
  };

  const [editingPayment, setEditingPayment] = useState(false);
  const hasPaymentData = masterInfo.links.length > 0 || !!masterInfo.bankDetails;
  const paymentCopyText = () =>
    [...masterInfo.links.map((l) => `${l.label}: ${l.value}`), ...(masterInfo.bankDetails ? [masterInfo.bankDetails] : [])].join('\n');

  // Соцсети — read-only icon row, derived from whichever of these platforms
  // already have a link in «Контакты» below (no separate fields to fill in
  // twice); empty platforms show a dim placeholder.
  const SOCIAL_PLATFORMS: { key: ChatPlatform; label: string; Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element }[] = [
    { key: 'instagram', label: 'Instagram', Icon: InstagramIcon },
    { key: 'whatsapp', label: 'WhatsApp', Icon: WhatsAppIcon },
    { key: 'tiktok', label: 'TikTok', Icon: TikTokIcon },
    { key: 'pinterest', label: 'Pinterest', Icon: PinterestIcon },
    { key: 'facebook', label: 'Facebook', Icon: FacebookIcon },
  ];

  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState(masterInfo.phone);
  useEffect(() => setPhoneDraft(masterInfo.phone), [masterInfo.phone]);

  // Бот в Telegram — своя ссылка внутри блока «Автоматизация»: master
  // копирует и отправляет клиенту для брони.
  const [editingTelegramBot, setEditingTelegramBot] = useState(false);
  const [telegramBotDraft, setTelegramBotDraft] = useState(masterInfo.telegramBotLink);
  useEffect(() => setTelegramBotDraft(masterInfo.telegramBotLink), [masterInfo.telegramBotLink]);

  // Личные ссылки мастера (сайт/соцсети/мессенджеры) — тот же пикер
  // платформ, что у контактов клиента, но тап по строке копирует ссылку в
  // буфер (а не открывает её), как и остальные блоки на этом экране.
  const addChatLink = (platform: ChatPlatform, raw: string) => {
    const link: ChatLink = { id: crypto.randomUUID(), platform, url: buildChatLink(platform, raw) };
    onChangeMasterInfo({ ...masterInfo, chatLinks: [...masterInfo.chatLinks, link] });
  };
  const removeChatLink = (id: string) => {
    onChangeMasterInfo({ ...masterInfo, chatLinks: masterInfo.chatLinks.filter((l) => l.id !== id) });
  };
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const copyChatLink = (link: ChatLink) => {
    navigator.clipboard?.writeText(link.url).then(() => {
      setCopiedLinkId(link.id);
      setTimeout(() => setCopiedLinkId((id) => (id === link.id ? null : id)), 1400);
    }).catch(() => {});
  };

  const [colorsOpen, setColorsOpen] = useState(false);
  const [showSyncSecret, setShowSyncSecret] = useState(false);
  const [showContentSecret, setShowContentSecret] = useState(false);

  // «Проверить соединение» прямо в настройках синхронизации — раньше
  // единственным способом узнать, работает ли связь с ботом, было зайти
  // в Админку и открыть «Брони от бота». Дёргаем тот же bot-bookings,
  // что и тот виджет, но здесь просто нужен статус, а не список.
  const [syncCheck, setSyncCheck] = useState<{ status: 'idle' | 'checking' | 'ok' | 'error'; message?: string }>({
    status: 'idle',
  });
  const checkCalendarSync = () => {
    setSyncCheck({ status: 'checking' });
    fetchBotBookings(calendarSync)
      .then((b) => setSyncCheck({ status: 'ok', message: `подключено — записей от бота: ${b.length}.` }))
      .catch((err) =>
        setSyncCheck({ status: 'error', message: err instanceof Error ? err.message : 'не получилось проверить соединение.' })
      );
  };

  const statLabelStyle: React.CSSProperties = {
    fontSize: fs(11),
    color: COLORS.textGhost,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    marginBottom: 6,
  };
  const editToggleStyle: React.CSSProperties = {
    fontSize: fs(11),
    color: COLORS.gold,
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    flexShrink: 0,
  };
  const copiedChipStyle: React.CSSProperties = {
    position: 'absolute',
    top: 40,
    right: 14,
    fontSize: fs(11),
    color: COLORS.gold,
    background: 'rgba(var(--gold-rgb),0.14)',
    border: '1px solid rgba(var(--gold-rgb),0.4)',
    borderRadius: 2,
    padding: '4px 9px',
    zIndex: 1,
  };

  return (
    <div style={{ minHeight: '100%' }}>
      <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)' }} />
      <div style={{ padding: '6px 24px 12px', position: 'relative', zIndex: 1 }}>
        <div
          style={{
            fontFamily: DROP_CAP_FONT,
            fontSize: fs(24),
            color: COLORS.gold,
            letterSpacing: '5px',
            textTransform: 'uppercase',
          }}
        >
          Личный кабинет
        </div>
        <div style={{ fontSize: fs(9.66), color: COLORS.textGhost, letterSpacing: `${fs(2.97)}px`, textTransform: 'uppercase', marginTop: 3, fontStyle: 'italic' }}>
          Профиль мастера
        </div>
        <StarDivider />
      </div>

      {/* Settings now lives here rather than as its own top-level nav button
          — the list screen keeps only the Мастер shortcut. Placed in its own
          row below the divider, in normal flow (not overlaid on the header).
          No «сегодня» calendar badge on this screen — «today» isn't a
          relevant frame for the master's own profile. */}
      <div style={{ padding: '0 20px 8px', position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <div
          onClick={onOpenSettings}
          role="button"
          aria-label="Настройки"
          style={{
            width: 42,
            height: 42,
            borderRadius: '50%',
            border: '1px solid rgba(var(--gold-rgb),0.25)',
            background: 'rgba(var(--gold-rgb),0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <ToolbarIcon name="settingsGear" size={21} style={{ color: 'var(--gold)' }} />
        </div>
      </div>

      {/* Та же строка вкладок-самоцветов, что у карточки клиента (см. её
          собственный комментарий в client/ClientCardTabBar.tsx) — «оформим
          личный кабинет по форме как карточка клиента»: Инфо — весь прежний
          профиль ниже, Проекты — «Проекты мастера» (без клиента), раньше
          жившие только в общей Мастерской. */}
      <ClientCardTabBar tabs={MASTER_TABS} activeTab={tab} onTab={setTab} ariaLabel="Разделы личного кабинета" />

      <div style={{ padding: '4px 20px calc(env(safe-area-inset-bottom, 0px) + 84px)', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {tab === 'info' && (
        <>
        {/* Имя + «Частый стиль» share one row — two columns, since both are
            short, glanceable facts rather than editable forms. */}
        <div style={{ display: 'flex', gap: 12 }}>
          <GoldFrame plain style={{ padding: '14px 16px', flex: 1, minWidth: 0 }}>
            <div style={{ ...statLabelStyle, textAlign: 'center' }}>Имя мастера</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() !== masterInfo.name && onChangeMasterInfo({ ...masterInfo, name: name.trim() })}
              placeholder="Ваше имя"
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                padding: 0,
                textAlign: 'center',
                fontFamily: DROP_CAP_FONT,
                fontSize: fs(19),
                fontWeight: 600,
                color: COLORS.gold,
              }}
            />
          </GoldFrame>

          {/* «Частый стиль» — the one stat that stays a personal Мастер
              metric; the rest of the stats grid moved to Админка. */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <StatBlock label="Частый стиль" value={style || 'Пока нет данных'} big={false} plain />
          </div>
        </div>

        {/* Соцсети — read-only icon row pulled straight from «Контакты»
            below (no separate fields — a link only needs to be entered
            once). Tap opens the profile, unlike «Контакты», which copies. */}
        <GoldFrame plain style={{ padding: '14px 16px' }}>
          <div style={{ ...statLabelStyle, marginBottom: 10 }}>Соцсети</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {SOCIAL_PLATFORMS.map(({ key, label, Icon }) => {
              const link = masterInfo.chatLinks.find((l) => l.platform === key);
              const iconStyle: React.CSSProperties = {
                width: 48,
                height: 48,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
              };
              if (!link) {
                return (
                  <div key={key} aria-label={label} style={{ ...iconStyle, border: '1px solid rgba(var(--gold-rgb),0.12)', color: COLORS.textGhost, opacity: 0.4 }}>
                    <Icon width={22} height={22} />
                  </div>
                );
              }
              return (
                <a
                  key={key}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Открыть ${label}`}
                  style={{ ...iconStyle, border: '1px solid rgba(var(--gold-rgb),0.3)', background: 'rgba(var(--gold-rgb),0.04)', color: COLORS.gold }}
                >
                  <Icon width={22} height={22} />
                </a>
              );
            })}
          </div>
          {SOCIAL_PLATFORMS.some(({ key }) => !masterInfo.chatLinks.some((l) => l.platform === key)) && (
            <div style={{ fontSize: fs(10.5), color: COLORS.textGhost, marginTop: 10, fontStyle: 'italic' }}>
              Добавьте ссылку в «Контакты» ниже, чтобы иконка открылась
            </div>
          )}
        </GoldFrame>

        {/* Оплата — master's own payment links + bank details. Once there's
            data, the card shows a read view that copies everything to the
            clipboard on tap; the pencil toggle switches back to the edit form. */}
        <GoldFrame plain style={{ padding: '14px 16px', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: hasPaymentData && !editingPayment ? 8 : 14 }}>
            <div style={{ ...statLabelStyle, marginBottom: 0 }}>Оплата</div>
            <span onClick={() => setEditingPayment((v) => !v)} role="button" aria-label={editingPayment ? 'Готово' : 'Редактировать оплату'} style={editToggleStyle}>
              {editingPayment ? 'Готово' : hasPaymentData ? 'Изменить' : 'Заполнить'}
            </span>
          </div>
          {editingPayment || !hasPaymentData ? (
            <>
              {masterInfo.links.map((link) => (
                <div
                  key={link.id}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(var(--gold-rgb),0.08)' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: fs(12), color: COLORS.gold, letterSpacing: '0.3px' }}>{link.label}</div>
                    <div style={{ fontSize: fs(13), color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{link.value}</div>
                  </div>
                  <span onClick={() => removeMasterLink(link.id)} style={{ cursor: 'pointer', color: COLORS.textFaint, fontSize: fs(18), flexShrink: 0, lineHeight: 1 }}>
                    ×
                  </span>
                </div>
              ))}
              <AddMasterLinkForm onAdd={addMasterLink} />
              <textarea
                value={masterInfo.bankDetails}
                onChange={(e) => onChangeMasterInfo({ ...masterInfo, bankDetails: e.target.value })}
                placeholder="Счёт, БИК, ИНН..."
                style={{ ...INPUT_STYLE, resize: 'none', height: 80, marginTop: 10 }}
              />
            </>
          ) : (
            <div onClick={() => copyToClipboard(paymentCopyText(), 'payment')} role="button" aria-label="Скопировать данные" style={{ cursor: 'pointer' }}>
              {masterInfo.links.map((l) => (
                <div key={l.id} style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: fs(12), color: COLORS.gold }}>{l.label}: </span>
                  <span style={{ fontSize: fs(13), color: 'var(--text-secondary)' }}>{l.value}</span>
                </div>
              ))}
              {masterInfo.bankDetails && (
                <div style={{ fontSize: fs(13), color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', marginTop: 6 }}>{masterInfo.bankDetails}</div>
              )}
              <div style={{ fontSize: fs(10.5), color: COLORS.textGhost, marginTop: 8, fontStyle: 'italic' }}>Нажмите, чтобы скопировать</div>
            </div>
          )}
          {copiedTag === 'payment' && <div style={copiedChipStyle}>Скопировано ✓</div>}
        </GoldFrame>

        {/* Контакты — телефон мастера + личные ссылки (сайт/соцсети/
            мессенджеры), тот же пикер платформ, что у контактов клиента.
            Тап по строке копирует, а не открывает (в отличие от карточки
            клиента) — остальные блоки на этом экране ведут себя так же. */}
        <GoldFrame plain style={{ padding: '14px 16px', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: masterInfo.phone && !editingPhone ? 8 : 14 }}>
            <div style={{ ...statLabelStyle, marginBottom: 0 }}>Контакты</div>
            <span
              onClick={() => {
                if (editingPhone && phoneDraft.trim() !== masterInfo.phone) onChangeMasterInfo({ ...masterInfo, phone: phoneDraft.trim() });
                setEditingPhone((v) => !v);
              }}
              role="button"
              aria-label={editingPhone ? 'Готово' : 'Редактировать телефон'}
              style={{ ...editToggleStyle, flexShrink: 0 }}
            >
              {editingPhone ? 'Готово' : masterInfo.phone ? 'Изменить' : 'Заполнить'}
            </span>
          </div>
          {editingPhone || !masterInfo.phone ? (
            <input
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
              onBlur={() => phoneDraft.trim() !== masterInfo.phone && onChangeMasterInfo({ ...masterInfo, phone: phoneDraft.trim() })}
              placeholder="+7 ..."
              style={{ ...INPUT_STYLE, marginBottom: 14 }}
            />
          ) : (
            <div onClick={() => copyToClipboard(masterInfo.phone, 'phone')} role="button" aria-label="Скопировать телефон" style={{ cursor: 'pointer', marginBottom: 14 }}>
              <div style={{ fontSize: fs(15), color: COLORS.textPrimary }}>{masterInfo.phone}</div>
              <div style={{ fontSize: fs(10.5), color: COLORS.textGhost, marginTop: 6, fontStyle: 'italic' }}>Нажмите, чтобы скопировать</div>
            </div>
          )}
          {copiedTag === 'phone' && <div style={copiedChipStyle}>Скопировано ✓</div>}

          {masterInfo.chatLinks.map((link) => (
            <div
              key={link.id}
              onClick={() => copyChatLink(link)}
              role="button"
              aria-label={`Скопировать ${PLATFORM_LABELS[link.platform]}`}
              style={{
                background: 'rgba(var(--surface-rgb),0.018)',
                border: '1px solid rgba(var(--gold-rgb),0.1)',
                borderRadius: 2,
                padding: '11px 13px',
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                marginBottom: 8,
                cursor: 'pointer',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: COLORS.gold, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: fs(13), color: COLORS.gold, letterSpacing: '0.3px' }}>
                  {copiedLinkId === link.id ? 'Скопировано ✓' : PLATFORM_LABELS[link.platform]}
                </div>
                <div style={{ fontSize: fs(12), color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {link.url.replace(/^https?:\/\//, '')}
                </div>
              </div>
              <span
                onClick={(e) => { e.stopPropagation(); removeChatLink(link.id); }}
                style={{ color: COLORS.textFaint, cursor: 'pointer', flexShrink: 0, fontSize: fs(15), lineHeight: 1 }}
              >
                ×
              </span>
            </div>
          ))}
          <AddChatLinkForm onAdd={addChatLink} />
        </GoldFrame>

        {/* Автоматизация — бот в Telegram (ссылка, которую мастер копирует
            и отправляет клиенту для брони) + синхронизация с Инка-
            календарём. Настоящий выключатель синхронизации — СЕКРЕТ: без
            него переключатель ничего не делает (бот ответит 401), поэтому
            другие пользователи приложения, не знающие секрета, писать в
            чужой календарь не могут. Секрет живёт только в localStorage
            этого устройства и НЕ попадает в резервную копию. */}
        <GoldFrame plain style={{ padding: '14px 16px', position: 'relative' }}>
          <div style={{ ...statLabelStyle, marginBottom: 10 }}>Автоматизация</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: fs(12), color: COLORS.gold, letterSpacing: '0.3px' }}>Бот в Telegram</div>
            <span
              onClick={() => {
                if (editingTelegramBot && telegramBotDraft.trim() !== masterInfo.telegramBotLink) onChangeMasterInfo({ ...masterInfo, telegramBotLink: telegramBotDraft.trim() });
                setEditingTelegramBot((v) => !v);
              }}
              role="button"
              aria-label={editingTelegramBot ? 'Готово' : 'Редактировать ссылку на бота'}
              style={editToggleStyle}
            >
              {editingTelegramBot ? 'Готово' : masterInfo.telegramBotLink ? 'Изменить' : 'Заполнить'}
            </span>
          </div>
          {editingTelegramBot || !masterInfo.telegramBotLink ? (
            <input
              value={telegramBotDraft}
              onChange={(e) => setTelegramBotDraft(e.target.value)}
              onBlur={() => telegramBotDraft.trim() !== masterInfo.telegramBotLink && onChangeMasterInfo({ ...masterInfo, telegramBotLink: telegramBotDraft.trim() })}
              placeholder="https://t.me/..."
              style={{ ...INPUT_STYLE, marginBottom: 14 }}
            />
          ) : (
            <div onClick={() => copyToClipboard(masterInfo.telegramBotLink, 'telegramBot')} role="button" aria-label="Скопировать ссылку на бота" style={{ cursor: 'pointer', marginBottom: 14 }}>
              <div style={{ fontSize: fs(15), color: COLORS.textPrimary, wordBreak: 'break-all' }}>{masterInfo.telegramBotLink}</div>
              <div style={{ fontSize: fs(10.5), color: COLORS.textGhost, marginTop: 6, fontStyle: 'italic' }}>Нажмите, чтобы скопировать</div>
            </div>
          )}
          {copiedTag === 'telegramBot' && <div style={copiedChipStyle}>Скопировано ✓</div>}

          <div style={{ height: 1, background: 'rgba(var(--gold-rgb),0.1)', margin: '4px 0 14px' }} />

          <div style={{ fontSize: fs(12), color: COLORS.gold, letterSpacing: '0.3px', marginBottom: 8 }}>Инка-календарь · Синхронизация</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {([
              { v: true, label: 'Включена' },
              { v: false, label: 'Выключена' },
            ] as { v: boolean; label: string }[]).map((o) => (
              <div
                key={String(o.v)}
                onClick={() => onChangeCalendarSync({ ...calendarSync, enabled: o.v })}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '10px 0',
                  borderRadius: 2,
                  cursor: 'pointer',
                  fontSize: fs(13),
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  border: calendarSync.enabled === o.v ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                  background: calendarSync.enabled === o.v ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                  color: calendarSync.enabled === o.v ? COLORS.gold : COLORS.textFaint,
                }}
              >
                {o.label}
              </div>
            ))}
          </div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input
              type={showSyncSecret ? 'text' : 'password'}
              value={calendarSync.secret}
              onChange={(e) => onChangeCalendarSync({ ...calendarSync, secret: e.target.value })}
              placeholder="Секретный код синхронизации"
              autoComplete="off"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 40px 10px 12px',
                borderRadius: 2,
                border: '1px solid rgba(var(--gold-rgb),0.2)',
                background: 'rgba(var(--surface-rgb),0.03)',
                color: 'var(--text-secondary)',
                fontSize: fs(13),
                outline: 'none',
              }}
            />
            <span
              onClick={() => setShowSyncSecret((v) => !v)}
              role="button"
              aria-label={showSyncSecret ? 'Скрыть код' : 'Показать код'}
              style={{
                position: 'absolute',
                top: '50%',
                right: 10,
                transform: 'translateY(-50%)',
                cursor: 'pointer',
                color: COLORS.textGhost,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {showSyncSecret ? (
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
                  <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
                  <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              )}
            </span>
          </div>
          <input
            type="text"
            value={calendarSync.endpoint}
            onChange={(e) => onChangeCalendarSync({ ...calendarSync, endpoint: e.target.value || DEFAULT_ENDPOINT })}
            placeholder={DEFAULT_ENDPOINT}
            autoComplete="off"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: 2,
              border: '1px solid rgba(var(--gold-rgb),0.2)',
              background: 'rgba(var(--surface-rgb),0.03)',
              color: 'var(--text-secondary)',
              fontSize: fs(12),
              outline: 'none',
            }}
          />
          <div style={{ marginTop: 8, fontSize: fs(11), color: COLORS.textGhost, fontStyle: 'italic', lineHeight: 1.5 }}>
            {syncActive(calendarSync)
              ? 'записи и консультации улетают в календарь Инки при сохранении.'
              : calendarSync.enabled
              ? 'нужен секретный код — без него синхронизация не работает.'
              : 'выключена: записи остаются только в дневнике.'}
          </div>
          {syncActive(calendarSync) && (
            <div style={{ marginTop: 10 }}>
              <span
                onClick={syncCheck.status === 'checking' ? undefined : checkCalendarSync}
                role="button"
                aria-label="Проверить соединение с ботом"
                style={{
                  fontSize: fs(11),
                  color: COLORS.gold,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  cursor: syncCheck.status === 'checking' ? 'default' : 'pointer',
                  opacity: syncCheck.status === 'checking' ? 0.5 : 1,
                }}
              >
                {syncCheck.status === 'checking' ? 'проверяю…' : 'проверить соединение'}
              </span>
              {syncCheck.message && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: fs(11),
                    fontStyle: 'italic',
                    color: syncCheck.status === 'error' ? '#C99' : COLORS.textGhost,
                  }}
                >
                  {syncCheck.message}
                </div>
              )}
            </div>
          )}
        </GoldFrame>

        {/* ContentINKA — тот же принцип, что «Инка-календарь» выше, свой
            секрет и свой адрес сервиса (не тот же деплой, что у бота). */}
        <GoldFrame plain style={{ padding: '14px 16px', marginTop: 12 }}>
          <div style={{ fontSize: fs(12), color: COLORS.gold, letterSpacing: '0.3px', marginBottom: 8 }}>ContentINKA · Отбор и текст</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {([
              { v: true, label: 'Включена' },
              { v: false, label: 'Выключена' },
            ] as { v: boolean; label: string }[]).map((o) => (
              <div
                key={String(o.v)}
                onClick={() => onChangeContentSync({ ...contentSync, enabled: o.v })}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '10px 0',
                  borderRadius: 2,
                  cursor: 'pointer',
                  fontSize: fs(13),
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  border: contentSync.enabled === o.v ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                  background: contentSync.enabled === o.v ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                  color: contentSync.enabled === o.v ? COLORS.gold : COLORS.textFaint,
                }}
              >
                {o.label}
              </div>
            ))}
          </div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input
              type={showContentSecret ? 'text' : 'password'}
              value={contentSync.secret}
              onChange={(e) => onChangeContentSync({ ...contentSync, secret: e.target.value })}
              placeholder="Секретный код ContentINKA"
              autoComplete="off"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 40px 10px 12px',
                borderRadius: 2,
                border: '1px solid rgba(var(--gold-rgb),0.2)',
                background: 'rgba(var(--surface-rgb),0.03)',
                color: 'var(--text-secondary)',
                fontSize: fs(13),
                outline: 'none',
              }}
            />
            <span
              onClick={() => setShowContentSecret((v) => !v)}
              role="button"
              aria-label={showContentSecret ? 'Скрыть код' : 'Показать код'}
              style={{
                position: 'absolute',
                top: '50%',
                right: 10,
                transform: 'translateY(-50%)',
                cursor: 'pointer',
                color: COLORS.textGhost,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {showContentSecret ? (
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
                  <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
                  <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              )}
            </span>
          </div>
          <input
            type="text"
            value={contentSync.endpoint}
            onChange={(e) => onChangeContentSync({ ...contentSync, endpoint: e.target.value })}
            placeholder="https://contentinka-....vercel.app"
            autoComplete="off"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: 2,
              border: '1px solid rgba(var(--gold-rgb),0.2)',
              background: 'rgba(var(--surface-rgb),0.03)',
              color: 'var(--text-secondary)',
              fontSize: fs(12),
              outline: 'none',
            }}
          />
          <div style={{ marginTop: 8, fontSize: fs(11), color: COLORS.textGhost, fontStyle: 'italic', lineHeight: 1.5 }}>
            {contentSync.enabled && contentSync.secret && contentSync.endpoint
              ? '«Отправить в контент» доступна в карточке сессии/консультации.'
              : 'нужны адрес сервиса и секретный код — без них кнопка «Отправить в контент» не сработает.'}
          </div>
          <div
            onClick={onOpenContent}
            role="button"
            aria-label="Открыть ContentINKA"
            style={{
              marginTop: 12,
              fontSize: fs(12),
              color: COLORS.gold,
              textAlign: 'center',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Открыть ContentINKA · контент мастерской
          </div>
        </GoldFrame>

        {/* Обозначения цветов — collapsed by default, kept compact. */}
        <GoldFrame plain style={{ padding: '14px 16px' }}>
          <div
            onClick={() => setColorsOpen((v) => !v)}
            role="button"
            aria-label="Обозначения цветов"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          >
            <div style={{ ...statLabelStyle, marginBottom: 0 }}>Обозначения цветов</div>
            <span style={{ color: COLORS.gold, fontSize: fs(12), transform: colorsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▾</span>
          </div>
          {colorsOpen && (
            <div style={{ marginTop: 12 }}>
              {MARKER_COLORS.map((c) => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: c, flexShrink: 0 }} />
                  <input
                    value={masterInfo.colorLabels[c] || ''}
                    onChange={(e) => setColorLabel(c, e.target.value)}
                    placeholder="Например: Постоянные клиенты"
                    style={{ ...INPUT_STYLE, flex: 1 }}
                  />
                </div>
              ))}
            </div>
          )}
        </GoldFrame>
        </>
      )}

      {tab === 'projects' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ ...statLabelStyle, marginBottom: 0 }}>Проекты мастера</div>
            <span onClick={onCreateProject} style={{ fontSize: fs(12), color: COLORS.gold, cursor: 'pointer', letterSpacing: '0.5px' }}>
              + Новый
            </span>
          </div>
          {workshopProjects.length === 0 ? (
            <div style={{ fontSize: fs(14), color: COLORS.textGhost, fontStyle: 'italic' }}>
              Пока нет своих проектов — нажмите «+ Новый», чтобы добавить первый
            </div>
          ) : (
            <div className="inka-client-grid" style={{ display: 'grid', gap: 10 }}>
              {workshopProjects.map((p) => (
                <ProjectCard key={p.id} project={p} clientName={null} onClick={() => onOpenProject(p)} />
              ))}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
