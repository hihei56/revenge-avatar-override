import { find, findByProps, findByStoreName } from "@vendetta/metro";
import { ReactNative as RN } from "@vendetta/metro/common";
import { after, before } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";

export const vstorage = storage as {
    overrides: Record<string, string>; // userId -> avatar URL
    nameOverrides: Record<string, string>; // userId -> display name
    guildIconOverrides: Record<string, string>; // guildId -> icon URL
    guildNameOverrides: Record<string, string>; // guildId -> guild name
    guildBotIconOverrides: Record<string, string>; // guildId -> icon URL applied to all bot/webhook avatars in that guild
    roleColorDisabled: Record<string, boolean>; // guildId -> role colors hidden in that guild
    channelNameOverrides: Record<string, string>; // channelId -> channel name
    hiddenStatusUsers: Record<string, boolean>; // userId -> show as offline regardless of real status
    guildChannelBulkRename: Record<string, string>; // guildId -> name applied to every channel in that guild
    guildUserIconOverrides: Record<string, string>; // guildId -> icon URL applied to all non-bot avatars in that guild
    guildUserNameOverrides: Record<string, string>; // guildId -> display name applied to all non-excepted members in that guild
    bulkExceptions: Record<string, boolean>; // userId -> excluded from every guild-wide bulk override above
    allowedTagGuildIds: Record<string, boolean>; // guildId -> server tags from this guild are allowed to show (others are hidden). Empty = show all.
    guildHideAllStatus: Record<string, boolean>; // guildId -> every member of this guild shows as offline (everywhere — status is global, not per-guild, data)
    guildHomeHeaderOverrides: Record<string, string>; // guildId -> home/guide tab header image URL
    hideProfileRoles: boolean; // hides every member's role list everywhere (profile, etc.)
    hideRoleIcons: boolean; // hides the small role-icon badge (member.iconRoleId) everywhere
    roleDisplayExceptions: Record<string, boolean>; // userId -> excluded from hideProfileRoles/hideRoleIcons above
    guildBannerOverrides: Record<string, string>; // guildId -> wide banner image shown above the server name in the channel list
    clockChannels: Record<string, boolean>; // channelId -> shows the current time as this channel's name, live
    countdownChannelId: string; // channelId -> shows a live countdown to countdownTargetMs as this channel's name
    countdownTargetMs: number; // target time (epoch ms) for the countdown above; 0 = unset
    countdownLabel: string; // optional label shown alongside the countdown, e.g. "テスト"
    hideReadChannelsGuilds: Record<string, boolean>; // guildId -> channel list only shows unread channels (plus whichever one is open) in that guild
    hideUnreadIndicatorsGuilds: Record<string, boolean>; // guildId -> suppresses the unread bold/highlight, mention badge count, and server-icon unread dot for that guild
    channelAllowlistGuilds: Record<string, boolean>; // guildId -> channel list only shows channels registered in allowedChannelIds (plus whichever one is open) in that guild
    allowedChannelIds: Record<string, boolean>; // channelId -> stays visible when its guild has channelAllowlistGuilds enabled
    keepDeveloperModeOn: boolean; // best-effort: forces Discord's own Developer Mode setting back on if it's found off
};

export const STORAGE_KEYS = [
    "overrides",
    "nameOverrides",
    "guildIconOverrides",
    "guildNameOverrides",
    "guildBotIconOverrides",
    "roleColorDisabled",
    "channelNameOverrides",
    "hiddenStatusUsers",
    "guildChannelBulkRename",
    "guildUserIconOverrides",
    "guildUserNameOverrides",
    "bulkExceptions",
    "allowedTagGuildIds",
    "guildHideAllStatus",
    "guildHomeHeaderOverrides",
    "hideProfileRoles",
    "hideRoleIcons",
    "roleDisplayExceptions",
    "guildBannerOverrides",
    "clockChannels",
    "countdownChannelId",
    "countdownTargetMs",
    "countdownLabel",
    "hideReadChannelsGuilds",
    "hideUnreadIndicatorsGuilds",
    "channelAllowlistGuilds",
    "allowedChannelIds",
    "keepDeveloperModeOn",
] as const;

export const POOP_IMAGES = [
    "https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f4a9.png",
    "https://raw.githubusercontent.com/googlefonts/noto-emoji/main/png/128/emoji_u1f4a9.png",
    "https://raw.githubusercontent.com/hfg-gmuend/openmoji/master/color/72x72/1F4A9.png",
    "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Pile%20of%20poo/3D/pile_of_poo_3d.png",
    "https://raw.githubusercontent.com/iamcal/emoji-data/master/img-apple-160/1f4a9.png",
    "https://raw.githubusercontent.com/iamcal/emoji-data/master/img-facebook-96/1f4a9.png",
];

export const pickRandomPoop = () => POOP_IMAGES[Math.floor(Math.random() * POOP_IMAGES.length)];

const urlExt = (url: string) => {
    try {
        return new URL(url).pathname.split(".").pop()?.toLowerCase();
    } catch {
        return undefined;
    }
};

// Checks for "does this map have any entries" without Object.keys()'s full
// array allocation — several of these run on every single Image/avatar/guild
// render in the whole app, so avoiding an allocation there (even a small,
// short-lived one) on the overwhelmingly common "nothing configured" path
// adds up under frequent re-renders (scrolling, opening the guild rail, etc.).
const hasAnyKey = (obj: Record<string, unknown>) => {
    for (const _k in obj) return true;
    return false;
};

// Shared reference reused every time hideProfileRoles clears a member's
// roles, instead of a fresh `[]` literal on every single getMember() call.
// Discord's own channel-permission/visibility computation for a guild is
// derived from GuildMemberStore.getMember(...).roles, and (like most of the
// app) is memoized — typically keyed off whether inputs are ===-identical to
// last time. Handing back a brand-new array every call defeats that even
// when the content never changes, forcing an expensive permission
// recalculation on every render — which is exactly what made role-gated
// channels in particular feel slow to load/scroll.
const EMPTY_ROLES: string[] = [];

const formatClock = () => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `🕐 ${hh}:${mm}`;
};

const formatCountdown = (targetMs: number, label: string) => {
    const prefix = label ? `${label} ` : "";
    const diffMs = targetMs - Date.now();
    if (diffMs <= 0) return `⏰ ${prefix}時間です`;

    const totalMin = Math.floor(diffMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `⏳ ${prefix}残り${h}時間${m}分` : `⏳ ${prefix}残り${m}分`;
};

export default function patchOverrides() {
    vstorage.overrides ??= {};
    vstorage.nameOverrides ??= {};
    vstorage.guildIconOverrides ??= {};
    vstorage.guildNameOverrides ??= {};
    vstorage.guildBotIconOverrides ??= {};
    vstorage.roleColorDisabled ??= {};
    vstorage.channelNameOverrides ??= {};
    vstorage.hiddenStatusUsers ??= {};
    vstorage.guildChannelBulkRename ??= {};
    vstorage.guildUserIconOverrides ??= {};
    vstorage.guildUserNameOverrides ??= {};
    vstorage.bulkExceptions ??= {};
    vstorage.allowedTagGuildIds ??= {};
    vstorage.guildHideAllStatus ??= {};
    vstorage.guildHomeHeaderOverrides ??= {};
    vstorage.hideProfileRoles ??= false;
    vstorage.hideRoleIcons ??= false;
    vstorage.roleDisplayExceptions ??= {};
    vstorage.guildBannerOverrides ??= {};
    vstorage.clockChannels ??= {};
    vstorage.countdownChannelId ??= "";
    vstorage.countdownTargetMs ??= 0;
    vstorage.countdownLabel ??= "";
    vstorage.hideReadChannelsGuilds ??= {};
    vstorage.hideUnreadIndicatorsGuilds ??= {};
    vstorage.channelAllowlistGuilds ??= {};
    vstorage.allowedChannelIds ??= {};
    vstorage.keepDeveloperModeOn ??= false;

    // Every findByProps/findByStoreName lookup below is resolved here, inside
    // patchOverrides() (called at onLoad), rather than at module top-level.
    // Metro modules can still be un-loaded chunks at the instant a plugin's
    // top-level code runs (e.g. right after a cold app start, before the
    // relevant screen has ever mounted) — a plain, one-shot findByProps at
    // that moment can silently return undefined and permanently disable a
    // patch for the rest of the session, even though the same lookup would
    // succeed a moment later. onLoad, running after a session is already
    // active and plugins are toggled from a live Settings screen, is a much
    // safer point to resolve these.
    const avatarUtils = findByProps("getUserAvatarURL", "getUserAvatarSource");
    const guildIconUtils = findByProps("getGuildIconURL", "getGuildIconSource") ?? avatarUtils;
    // Home header and banner were previously read off guildIconUtils on the
    // (until now unverified) assumption that every IconUtils-style function
    // lives on one shared module, same as on desktop. If this mobile bundle's
    // bundler ever splits them into a different chunk, guildIconUtils.getGuild
    // HomeHeaderURL/Source would just silently be undefined and that one
    // feature would never fire no matter what — a total, not intermittent,
    // failure, which matches "header never changes at all" better than a
    // race/caching issue would. Resolving each function family through its
    // own findByProps call (falling back to guildIconUtils if a dedicated
    // module isn't found, since they usually do live together) removes that
    // assumption at zero cost.
    const homeHeaderUtils = findByProps("getGuildHomeHeaderURL", "getGuildHomeHeaderSource") ?? guildIconUtils;
    const bannerUtils = findByProps("getGuildBannerURL", "getGuildBannerSource") ?? guildIconUtils;
    const UserStore = findByStoreName("UserStore");
    const GuildStore = findByStoreName("GuildStore");
    const GuildMemberStore = findByStoreName("GuildMemberStore");
    const ChannelStore = findByStoreName("ChannelStore");
    const PresenceStore = findByStoreName("PresenceStore");
    const GuildChannelStore = findByStoreName("GuildChannelStore");
    const ReadStateStore = findByStoreName("ReadStateStore");
    const SelectedChannelStore = findByStoreName("SelectedChannelStore");
    // Only the guild-aware getAvatarURL(guildId, ...)/getAvatarSource(guildId)
    // instance methods below receive a guild directly (e.g. profile popups).
    // The plain module-level getUserAvatarURL/getUserAvatarSource(user, animate)
    // patched further down — which is what message-list avatars in a channel
    // actually call — never receives one, so the guild-wide bulk overrides
    // silently never applied there. SelectedGuildStore.getGuildId() (the guild
    // currently being viewed) is used as a stand-in guild context for that path.
    const SelectedGuildStore = findByStoreName("SelectedGuildStore");

    // The `User` record class exposes guild-aware `getAvatarURL(guildId, ...)` /
    // `getAvatarSource(guildId)` instance methods. Unlike the module-level
    // getUserAvatarURL/getUserAvatarSource above, these receive the guild the
    // avatar is being rendered in, which is what lets us scope an override to
    // "every webhook/user avatar in this guild".
    const UserRecordProto = UserStore?.getCurrentUser?.()?.constructor?.prototype;
    const currentUserId: string | undefined = UserStore?.getCurrentUser?.()?.id;

    // Webhooks aren't real guild members (no roles, no join date), while an
    // actual bot account is. A bot-flagged user with no GuildMember record in
    // this guild is therefore a webhook, not a real bot — this is how we tell
    // them apart without needing the Message object (which isn't available at
    // this patch point).
    //
    // Memoized per (guildId, userId): a real GuildMemberStore.getMember() call
    // sits behind this on every use, and both call sites (the bulk bot-icon
    // override check, and the per-guild "hide all status" check) can ask the
    // same question for the same pair repeatedly in a short burst — most
    // visibly when one bot/webhook posts many consecutive messages, which
    // reruns this same lookup once per message with no caching in between.
    // Membership essentially never flips mid-session for what this answers,
    // so a session-lifetime cache (never invalidated) is a safe trade: a
    // member who leaves mid-session keeps their last-known answer here, which
    // is a cosmetic staleness, not a correctness issue.
    const realMemberCache = new Map<string, boolean>();
    const isRealMember = (guildId: string, userId: string) => {
        const key = `${guildId}:${userId}`;
        let cached = realMemberCache.get(key);
        if (cached === undefined) {
            cached = !!GuildMemberStore?.getMember?.(guildId, userId);
            realMemberCache.set(key, cached);
        }
        return cached;
    };

    // getGuildIconURL/getGuildIconSource are typed on desktop as taking a
    // single { id, icon, ... } object, but that's unverified for this mobile
    // bundle — if it actually takes a plain guildId string as its first
    // argument instead, `data?.id` would silently always be undefined (no
    // crash, just a permanent no-op), which matches "doesn't apply anywhere"
    // better than a timing bug would. Handle both shapes defensively.
    const extractGuildId = (first: unknown): string | undefined => {
        if (typeof first === "string") return first;
        if (first && typeof first === "object") {
            const obj = first as any;
            if (typeof obj.id === "string") return obj.id;
            // Some call sites pass a wrapper object ({ guild: {...} }) instead
            // of the Guild record directly.
            if (obj.guild && typeof obj.guild.id === "string") return obj.guild.id;
            if (typeof obj.guildId === "string") return obj.guildId;
        }
        return undefined;
    };

    // Shared by both the guild-aware instance methods and the plain
    // module-level avatar functions (using the currently-viewed guild as a
    // best-effort stand-in for the latter).
    const guildWideIconOverride = (guildId: string | undefined, userId: string, isBot: boolean) => {
        if (!guildId || vstorage.overrides[userId] || vstorage.bulkExceptions[userId]) return undefined;
        if (isBot) {
            const override = vstorage.guildBotIconOverrides[guildId];
            return !override || isRealMember(guildId, userId) ? undefined : override;
        }
        return vstorage.guildUserIconOverrides[guildId] || undefined;
    };

    // A "default" entry in guildHomeHeaderOverrides is a reserved sentinel
    // key (not a real guild ID) meaning "every guild without its own explicit
    // entry" — this is how the header override supports being set either
    // per-guild or in common across every guild, without needing a second
    // non-Record field (which the generic STORAGE_KEYS-driven export/import
    // in Settings.tsx only handles for Record values).
    const homeHeaderFor = (guildId: string | undefined) =>
        (guildId && vstorage.guildHomeHeaderOverrides[guildId]) || vstorage.guildHomeHeaderOverrides.default || undefined;

    // Belt-and-suspenders fallback for the guild icon/home-header overrides
    // above: rather than trusting an assumed argument shape for
    // getGuildIconURL/getGuildIconSource/getGuildHomeHeaderURL/Source (which
    // has not reliably applied to every guild icon surface — rail, header,
    // etc. — on this mobile build), this matches the actual Discord CDN URL
    // once it reaches React Native's own `Image` component and rewrites it
    // directly. This is the same technique nexpid's published twemoji-everywhere
    // plugin uses (`before("Image", RN, ...)`) to universally rewrite image
    // URIs regardless of which internal function produced them.
    const GUILD_ICON_URI_RE = /(?:cdn\.discordapp\.com|media\.discordapp\.net)\/icons\/(\d{15,25})\//;
    const GUILD_HOME_HEADER_URI_RE = /(?:cdn\.discordapp\.com|media\.discordapp\.net)\/guilds\/(\d{15,25})\/home-headers\//;
    const GUILD_BANNER_URI_RE = /(?:cdn\.discordapp\.com|media\.discordapp\.net)\/banners\/(\d{15,25})\//;
    // Per-server ("server profile") avatar CDN path — distinct from a normal
    // user avatar's /avatars/{userId}/{hash} (no /guilds/.../users/ prefix).
    const GUILD_MEMBER_AVATAR_URI_RE = /(?:cdn\.discordapp\.com|media\.discordapp\.net)\/guilds\/(\d{15,25})\/users\/(\d{15,25})\/avatars\//;

    // Discord's own "Developer Mode" (Settings > Advanced), reported to turn
    // itself off unexpectedly. Every individual row in Discord's Settings UI
    // (this one included) is implemented through a shared per-setting
    // definition object — { getSetting(), updateSetting(value), useSetting(),
    // userSettingsAPIGroup, userSettingsAPIName } — confirmed via Vencord's
    // real UserSettingsAPI (getUserSettingLazy("appearance", "developerMode"))
    // and its betterRoleContext plugin actually calling .updateSetting(true)
    // on the result to force developer mode on. Vencord's own lookup
    // (findModuleId with a desktop-bundle-specific search string) doesn't
    // apply here, so this re-implements the same "scan a module's exports for
    // an entry tagged with this group/name" idea as a plain predicate search
    // instead — if this mobile bundle doesn't expose the same definition-
    // object shape, the search just finds nothing and this feature silently
    // no-ops, same as every other typeof-guarded patch in this file.
    let developerModeSetting: any;
    const getDeveloperModeSetting = () => {
        if (developerModeSetting !== undefined) return developerModeSetting;
        const definitions = find((m: any) => {
            if (!m || typeof m !== "object") return false;
            for (const key in m) {
                const v = m[key];
                if (v?.userSettingsAPIGroup === "appearance" && v?.userSettingsAPIName === "developerMode") return true;
            }
            return false;
        });
        developerModeSetting = null;
        if (definitions) {
            for (const key in definitions) {
                const v = definitions[key];
                if (v?.userSettingsAPIGroup === "appearance" && v?.userSettingsAPIName === "developerMode") {
                    developerModeSetting = v;
                    break;
                }
            }
        }
        return developerModeSetting;
    };

    const forceDeveloperModeOn = () => {
        if (!vstorage.keepDeveloperModeOn) return;
        try {
            const setting = getDeveloperModeSetting();
            if (setting && setting.getSetting?.() === false) {
                setting.updateSetting?.(true);
            }
        } catch {
            // best-effort only — never let this break plugin load
        }
    };

    // The first call to getDeveloperModeSetting() scans every currently
    // loaded metro module (with a nested for-in per module) looking for the
    // one tagged appearance/developerMode — a real, if one-time, cost. Firing
    // it synchronously here would run it inline with patch registration
    // itself (onLoad), which can happen while the app is still settling
    // right after a cold start or a plugin toggle — exactly when a stray
    // synchronous scan is most likely to be felt as a stutter. Deferred a
    // tick via setTimeout so it runs after whatever's currently rendering
    // finishes, instead of blocking it.
    if (vstorage.keepDeveloperModeOn) setTimeout(forceDeveloperModeOn, 0);

    const unpatches = [
        typeof RN?.Image === "function" && before("Image", RN, ([props]: [any]) => {
            const uri: string | undefined = props?.source?.uri;
            if (!uri) return;

            // This runs on every single Image in the whole app — every
            // avatar, attachment, emoji, sticker — not just guild icons, so
            // it needs to bail out as cheaply as possible for the
            // overwhelming majority of calls that have nothing to do with
            // this feature, before ever touching a regex.
            const hasIconOverrides = hasAnyKey(vstorage.guildIconOverrides);
            const hasHeaderOverrides = hasAnyKey(vstorage.guildHomeHeaderOverrides);
            const hasBannerOverrides = hasAnyKey(vstorage.guildBannerOverrides);
            const hasMemberAvatarOverrides = hasAnyKey(vstorage.overrides)
                || hasAnyKey(vstorage.guildUserIconOverrides)
                || hasAnyKey(vstorage.guildBotIconOverrides);
            if (!hasIconOverrides && !hasHeaderOverrides && !hasBannerOverrides && !hasMemberAvatarOverrides) return;
            if (
                uri.indexOf("/icons/") === -1
                && uri.indexOf("/home-headers/") === -1
                && uri.indexOf("/banners/") === -1
                && !(uri.indexOf("/users/") !== -1 && uri.indexOf("/avatars/") !== -1)
            ) return;

            if (hasIconOverrides) {
                const iconMatch = uri.match(GUILD_ICON_URI_RE);
                const iconOverride = iconMatch && vstorage.guildIconOverrides[iconMatch[1]];
                if (iconOverride) {
                    return [{ ...props, source: { ...props.source, uri: iconOverride } }];
                }
            }

            if (hasHeaderOverrides) {
                const headerMatch = uri.match(GUILD_HOME_HEADER_URI_RE);
                const headerOverride = headerMatch && homeHeaderFor(headerMatch[1]);
                if (headerOverride) {
                    return [{ ...props, source: { ...props.source, uri: headerOverride } }];
                }
            }

            if (hasBannerOverrides) {
                const bannerMatch = uri.match(GUILD_BANNER_URI_RE);
                const bannerOverride = bannerMatch && vstorage.guildBannerOverrides[bannerMatch[1]];
                if (bannerOverride) {
                    return [{ ...props, source: { ...props.source, uri: bannerOverride } }];
                }
            }

            if (hasMemberAvatarOverrides) {
                const memberMatch = uri.match(GUILD_MEMBER_AVATAR_URI_RE);
                if (memberMatch) {
                    const [, memberGuildId, memberUserId] = memberMatch;
                    const isBot = !!UserStore?.getUser?.(memberUserId)?.bot;
                    const memberOverride = vstorage.overrides[memberUserId]
                        || guildWideIconOverride(memberGuildId, memberUserId, isBot);
                    if (memberOverride) {
                        return [{ ...props, source: { ...props.source, uri: memberOverride } }];
                    }
                }
            }
        }),

        UserStore && after("getUser", UserStore, ([id], user) => {
            if (!user) return;

            const avatarOverride = vstorage.overrides[id];
            if (avatarOverride && urlExt(avatarOverride) === "gif") {
                // Makes Discord treat the user as having an animated avatar hash,
                // so avatar-decoration/animation code paths don't immediately bail out.
                const avatar = user.avatar ?? "0";
                if (!avatar.startsWith("a_")) user.avatar = `a_${avatar}`;
            }

            const nameOverride = vstorage.nameOverrides[id];
            if (nameOverride) {
                user.globalName = nameOverride;
                user.username = nameOverride;
            }

            const tagGuildId = user.primaryGuild?.identityGuildId;
            if (tagGuildId && hasAnyKey(vstorage.allowedTagGuildIds) && !vstorage.allowedTagGuildIds[tagGuildId]) {
                user.primaryGuild = null;
            }
        }),

        avatarUtils && after("getUserAvatarURL", avatarUtils, ([user, animate]) => {
            if (!user?.id) return;

            const individualOverride = vstorage.overrides[user.id];
            const override = individualOverride
                || guildWideIconOverride(SelectedGuildStore?.getGuildId?.(), user.id, !!user.bot);
            if (!override) return;

            if (!animate && urlExt(override) === "gif") {
                return override.replace(/\.gif($|\?)/, ".png$1");
            }
            return override;
        }),

        avatarUtils && after("getUserAvatarSource", avatarUtils, ([user, animate]) => {
            if (!user?.id) return;

            const individualOverride = vstorage.overrides[user.id];
            const override = individualOverride
                || guildWideIconOverride(SelectedGuildStore?.getGuildId?.(), user.id, !!user.bot);
            if (!override) return;

            const uri = !animate && urlExt(override) === "gif"
                ? override.replace(/\.gif($|\?)/, ".png$1")
                : override;
            return { uri };
        }),

        // Per-server ("server profile") avatars are a separate Discord
        // feature — a member can set an avatar that only shows in one
        // specific guild — resolved via this function instead of
        // getUserAvatarURL/getAvatarURL. A user with one of these set would
        // never pick up an override in chat (or anywhere else in that guild)
        // without patching this too, since none of the functions above see it.
        typeof avatarUtils?.getGuildMemberAvatarURL === "function" && after("getGuildMemberAvatarURL", avatarUtils, ([member, animate]) => {
            if (!member?.userId) return;
            const isBot = !!UserStore?.getUser?.(member.userId)?.bot;
            const individualOverride = vstorage.overrides[member.userId];
            const override = individualOverride || guildWideIconOverride(member.guildId, member.userId, isBot);
            if (!override) return;

            return !animate && urlExt(override) === "gif"
                ? override.replace(/\.gif($|\?)/, ".png$1")
                : override;
        }),

        typeof avatarUtils?.getGuildMemberAvatarSource === "function" && after("getGuildMemberAvatarSource", avatarUtils, ([member, animate]) => {
            if (!member?.userId) return;
            const isBot = !!UserStore?.getUser?.(member.userId)?.bot;
            const override = vstorage.overrides[member.userId] || guildWideIconOverride(member.guildId, member.userId, isBot);
            if (!override) return;

            const uri = !animate && urlExt(override) === "gif"
                ? override.replace(/\.gif($|\?)/, ".png$1")
                : override;
            return { uri };
        }),

        typeof guildIconUtils?.getGuildIconURL === "function" && after("getGuildIconURL", guildIconUtils, ([first]) => {
            const guildId = extractGuildId(first);
            const override = guildId && vstorage.guildIconOverrides[guildId];
            return override || undefined;
        }),

        typeof guildIconUtils?.getGuildIconSource === "function" && after("getGuildIconSource", guildIconUtils, ([first]) => {
            const guildId = extractGuildId(first);
            const override = guildId && vstorage.guildIconOverrides[guildId];
            return override ? { uri: override } : undefined;
        }),

        // Wide banner shown above the server name in the channel list drawer
        // (guild.banner) — separate from both the guild icon and the
        // home/guide tab header.
        typeof bannerUtils?.getGuildBannerURL === "function" && after("getGuildBannerURL", bannerUtils, ([first]) => {
            const guildId = extractGuildId(first);
            const override = guildId && vstorage.guildBannerOverrides[guildId];
            return override || undefined;
        }),

        typeof bannerUtils?.getGuildBannerSource === "function" && after("getGuildBannerSource", bannerUtils, ([first]) => {
            const guildId = extractGuildId(first);
            const override = guildId && vstorage.guildBannerOverrides[guildId];
            return override ? { uri: override } : undefined;
        }),

        typeof homeHeaderUtils?.getGuildHomeHeaderURL === "function" && after("getGuildHomeHeaderURL", homeHeaderUtils, ([first]) => {
            const guildId = extractGuildId(first);
            return homeHeaderFor(guildId) || undefined;
        }),

        typeof homeHeaderUtils?.getGuildHomeHeaderSource === "function" && after("getGuildHomeHeaderSource", homeHeaderUtils, ([first]) => {
            const guildId = extractGuildId(first);
            const override = homeHeaderFor(guildId);
            return override ? { uri: override } : undefined;
        }),

        GuildStore && after("getGuild", GuildStore, ([id], guild) => {
            if (!guild) return;
            const override = vstorage.guildNameOverrides[id];
            if (override) guild.name = override;
        }),

        UserRecordProto && after("getAvatarURL", UserRecordProto, function (this: any, [guildId]) {
            if (!this?.id) return;
            // guildWideIconOverride() deliberately returns undefined when an
            // individual override exists for this user (it assumes something
            // else applies it) — but nothing else was checking vstorage.overrides
            // on this call path, so an individually-overridden user's avatar
            // never changed in profile popups (this instance method's actual
            // caller), even though it worked correctly in the chat feed, which
            // goes through the separate module-level getUserAvatarURL below.
            return vstorage.overrides[this.id] || guildWideIconOverride(guildId, this.id, !!this.bot);
        }),

        UserRecordProto && after("getAvatarSource", UserRecordProto, function (this: any, [guildId]) {
            if (!this?.id) return;
            const override = vstorage.overrides[this.id] || guildWideIconOverride(guildId, this.id, !!this.bot);
            return override ? { uri: override } : undefined;
        }),

        GuildMemberStore && after("getMember", GuildMemberStore, ([guildId, userId], member) => {
            if (!member) return;

            if (vstorage.roleColorDisabled[guildId]) {
                member.colorString = null;
                member.colorRoleId = null;
                // Gradient role colors are stored separately from colorString/colorRoleId.
                member.colorStrings = null;
            }

            const nameOverride = !vstorage.bulkExceptions[userId] && vstorage.guildUserNameOverrides[guildId];
            if (nameOverride) member.nick = nameOverride;

            if (!vstorage.roleDisplayExceptions[userId]) {
                // Never touch the logged-in user's own roles: Discord derives
                // real channel-permission/visibility checks from this exact
                // member record, so clearing it would locally break access to
                // role-gated channels, not just hide a badge. The role-icon
                // badge is purely cosmetic, so it's still safe to clear for self.
                if (vstorage.hideProfileRoles && userId !== currentUserId && member.roles.length > 0) {
                    member.roles = EMPTY_ROLES;
                }
                if (vstorage.hideRoleIcons) member.iconRoleId = null;
            }
        }),

        ChannelStore && after("getChannel", ChannelStore, ([id], channel) => {
            if (!channel) return;

            const individualOverride = vstorage.channelNameOverrides[id];
            if (individualOverride) {
                channel.name = individualOverride;
            } else {
                const bulkName = channel.guild_id && vstorage.guildChannelBulkRename[channel.guild_id];
                if (bulkName) channel.name = bulkName;
            }

            // Clock/countdown take priority over the name overrides above —
            // they're a dedicated purpose for that one channel slot, not
            // something you'd also want a static rename on.
            if (vstorage.clockChannels[id]) {
                channel.name = formatClock();
            } else if (vstorage.countdownChannelId === id && vstorage.countdownTargetMs) {
                channel.name = formatCountdown(vstorage.countdownTargetMs, vstorage.countdownLabel);
            }
        }),

        PresenceStore && after("getStatus", PresenceStore, ([id]) => {
            if (vstorage.hiddenStatusUsers[id]) return "offline";

            // Presence is global (not per-guild) data, so making everyone in a
            // guild show as offline means checking membership in every guild
            // that has the toggle on. This also means an affected user shows
            // as offline everywhere (DMs, other guilds), not just that server.
            for (const guildId in vstorage.guildHideAllStatus) {
                if (vstorage.guildHideAllStatus[guildId] && isRealMember(guildId, id)) return "offline";
            }
        }),

        // GuildChannelStore.getChannels(guildId) is what actually builds the
        // grouped, sorted data the channel list sidebar renders from (SELECTABLE
        // = text/forum/stage channels, VOCAL = voice channels) — confirmed via
        // Vencord's discord-types GuildChannelStore.d.ts and how its real
        // ShowHiddenChannels plugin filters this exact same return value for a
        // similar purpose. Filtering it here (rather than any rendering
        // component) hides channels without touching unverified UI code.
        typeof GuildChannelStore?.getChannels === "function" && after("getChannels", GuildChannelStore, ([guildId], result) => {
            const hideRead = vstorage.hideReadChannelsGuilds[guildId];
            const allowlistOnly = vstorage.channelAllowlistGuilds[guildId];
            if (!result || (!hideRead && !allowlistOnly)) return;

            const currentChannelId = SelectedChannelStore?.getChannelId?.(guildId);
            const keepChannel = (item: any) => {
                const channelId = item?.channel?.id ?? item?.id;
                // Fail open (keep it visible) for anything we can't identify.
                if (!channelId) return true;
                if (channelId === currentChannelId) return true;
                if (hideRead && !(ReadStateStore?.hasUnread?.(channelId) ?? true)) return false;
                if (allowlistOnly && !vstorage.allowedChannelIds[channelId]) return false;
                return true;
            };

            const filtered = { ...result };
            // Only SELECTABLE/VOCAL are the actual per-channel lists the
            // sidebar renders; other keys (categories, id, count) are left
            // untouched so category headers and counts aren't affected.
            if (Array.isArray(result.SELECTABLE)) filtered.SELECTABLE = result.SELECTABLE.filter(keepChannel);
            if (Array.isArray(result.VOCAL)) filtered.VOCAL = result.VOCAL.filter(keepChannel);
            return filtered;
        }),

        // Suppresses the unread bold/highlight, the mention count badge, and
        // (since the server-icon unread dot is itself derived by aggregating
        // these same per-channel signals across a guild, not from a single
        // separate function) the server icon's unread dot — all in one place,
        // by making the underlying per-channel unread data report "nothing to
        // see here" for channels in a registered guild.
        //
        // NOTE: the "既読チャンネル非表示" feature above also reads
        // ReadStateStore.hasUnread — enabling both for the same guild means
        // every channel there will look read to that filter too, collapsing
        // the visible channel list down to just the one currently open.
        // These four fire on every single unread/mention check for every
        // channel in every guild you scroll past — one of the hottest patch
        // points in this whole file. Each previously called
        // ChannelStore.getChannel(channelId) unconditionally just to read
        // guild_id, even with hideUnreadIndicatorsGuilds completely empty
        // (the common case for anyone not using this feature). Bailing out
        // on a cheap hasAnyKey() check first avoids that store lookup
        // entirely on the overwhelmingly common "feature unused" path.
        typeof ReadStateStore?.hasUnread === "function" && after("hasUnread", ReadStateStore, ([channelId]) => {
            if (!hasAnyKey(vstorage.hideUnreadIndicatorsGuilds)) return;
            if (vstorage.hideUnreadIndicatorsGuilds[ChannelStore?.getChannel?.(channelId)?.guild_id]) return false;
        }),

        typeof ReadStateStore?.hasUnreadOrMentions === "function" && after("hasUnreadOrMentions", ReadStateStore, ([channelId]) => {
            if (!hasAnyKey(vstorage.hideUnreadIndicatorsGuilds)) return;
            if (vstorage.hideUnreadIndicatorsGuilds[ChannelStore?.getChannel?.(channelId)?.guild_id]) return false;
        }),

        typeof ReadStateStore?.getMentionCount === "function" && after("getMentionCount", ReadStateStore, ([channelId]) => {
            if (!hasAnyKey(vstorage.hideUnreadIndicatorsGuilds)) return;
            if (vstorage.hideUnreadIndicatorsGuilds[ChannelStore?.getChannel?.(channelId)?.guild_id]) return 0;
        }),

        typeof ReadStateStore?.getUnreadCount === "function" && after("getUnreadCount", ReadStateStore, ([channelId]) => {
            if (!hasAnyKey(vstorage.hideUnreadIndicatorsGuilds)) return;
            if (vstorage.hideUnreadIndicatorsGuilds[ChannelStore?.getChannel?.(channelId)?.guild_id]) return 0;
        }),
    ].filter(Boolean) as (() => void)[];

    // The clock/countdown channel name only actually changes when whatever
    // component last rendered ChannelStore's data asks for it again — a
    // channel row otherwise sits however it last rendered, with nothing to
    // prompt a refresh purely from time passing. emitChange() (a base method
    // on every Flux store, confirmed via Vencord's FluxStore typings, and how
    // real plugins like implicitRelationships/MessageUpdater force a
    // re-render after mutating store-backed data outside the normal
    // dispatch flow) nudges any subscribed UI to re-read it periodically.
    // Best-effort: still depends on this mobile bundle's store base class
    // actually exposing it the same way, guarded so it's a no-op if not.
    const clockInterval = setInterval(() => {
        const hasClockFeature = hasAnyKey(vstorage.clockChannels)
            || (!!vstorage.countdownChannelId && vstorage.countdownTargetMs > 0);
        if (hasClockFeature && typeof (ChannelStore as any)?.emitChange === "function") {
            (ChannelStore as any).emitChange();
        }
        forceDeveloperModeOn();
    }, 30000);

    return () => {
        clearInterval(clockInterval);
        unpatches.forEach(unpatch => unpatch());
    };
}
