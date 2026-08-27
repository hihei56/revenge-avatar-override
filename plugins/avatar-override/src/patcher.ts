import { logger } from "@vendetta";
import { findByProps, findByStoreName } from "@vendetta/metro";
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
    logger.log(
        `[AvatarOverride] guildIconUtils found=${!!guildIconUtils} ` +
        `getGuildIconURL=${typeof guildIconUtils?.getGuildIconURL} ` +
        `getGuildIconSource=${typeof guildIconUtils?.getGuildIconSource}`,
    );
    const UserStore = findByStoreName("UserStore");
    const GuildStore = findByStoreName("GuildStore");
    const GuildMemberStore = findByStoreName("GuildMemberStore");
    const ChannelStore = findByStoreName("ChannelStore");
    const PresenceStore = findByStoreName("PresenceStore");
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

    // Webhooks aren't real guild members (no roles, no join date), while an
    // actual bot account is. A bot-flagged user with no GuildMember record in
    // this guild is therefore a webhook, not a real bot — this is how we tell
    // them apart without needing the Message object (which isn't available at
    // this patch point).
    const isRealMember = (guildId: string, userId: string) => !!GuildMemberStore?.getMember?.(guildId, userId);

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

    // Whether an override for this guild icon is even configured is cheap to
    // check, so this only logs when it could plausibly matter — once per
    // distinct raw argument shape seen, to help diagnose reports of the
    // override silently not applying without spamming logs on every render.
    const loggedIconShapes = new Set<string>();
    const debugIconArg = (label: string, first: unknown, guildId: string | undefined) => {
        if (Object.keys(vstorage.guildIconOverrides).length === 0) return;
        const shapeKey = `${label}:${typeof first}:${guildId ?? "none"}`;
        if (loggedIconShapes.has(shapeKey)) return;
        loggedIconShapes.add(shapeKey);
        try {
            logger.log(`[AvatarOverride] ${label} arg=${JSON.stringify(first)} resolvedGuildId=${guildId}`);
        } catch {
            logger.log(`[AvatarOverride] ${label} arg=<unserializable ${typeof first}> resolvedGuildId=${guildId}`);
        }
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

    const unpatches = [
        typeof RN?.Image === "function" && before("Image", RN, ([props]: [any]) => {
            const uri: string | undefined = props?.source?.uri;
            if (!uri) return;

            const iconMatch = uri.match(GUILD_ICON_URI_RE);
            const iconOverride = iconMatch && vstorage.guildIconOverrides[iconMatch[1]];
            if (iconOverride) {
                return [{ ...props, source: { ...props.source, uri: iconOverride } }];
            }

            const headerMatch = uri.match(GUILD_HOME_HEADER_URI_RE);
            const headerOverride = headerMatch && homeHeaderFor(headerMatch[1]);
            if (headerOverride) {
                return [{ ...props, source: { ...props.source, uri: headerOverride } }];
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

            const allowedTags = vstorage.allowedTagGuildIds;
            const tagGuildId = user.primaryGuild?.identityGuildId;
            if (tagGuildId && Object.keys(allowedTags).length > 0 && !allowedTags[tagGuildId]) {
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

        typeof guildIconUtils?.getGuildIconURL === "function" && after("getGuildIconURL", guildIconUtils, ([first]) => {
            const guildId = extractGuildId(first);
            debugIconArg("getGuildIconURL", first, guildId);
            const override = guildId && vstorage.guildIconOverrides[guildId];
            return override || undefined;
        }),

        typeof guildIconUtils?.getGuildIconSource === "function" && after("getGuildIconSource", guildIconUtils, ([first]) => {
            const guildId = extractGuildId(first);
            debugIconArg("getGuildIconSource", first, guildId);
            const override = guildId && vstorage.guildIconOverrides[guildId];
            return override ? { uri: override } : undefined;
        }),

        typeof guildIconUtils?.getGuildHomeHeaderURL === "function" && after("getGuildHomeHeaderURL", guildIconUtils, ([first]) => {
            const guildId = extractGuildId(first);
            return homeHeaderFor(guildId) || undefined;
        }),

        typeof guildIconUtils?.getGuildHomeHeaderSource === "function" && after("getGuildHomeHeaderSource", guildIconUtils, ([first]) => {
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
            return guildWideIconOverride(guildId, this.id, !!this.bot);
        }),

        UserRecordProto && after("getAvatarSource", UserRecordProto, function (this: any, [guildId]) {
            if (!this?.id) return;
            const override = guildWideIconOverride(guildId, this.id, !!this.bot);
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
                if (vstorage.hideProfileRoles) member.roles = [];
                if (vstorage.hideRoleIcons) member.iconRoleId = null;
            }
        }),

        ChannelStore && after("getChannel", ChannelStore, ([id], channel) => {
            if (!channel) return;

            const individualOverride = vstorage.channelNameOverrides[id];
            if (individualOverride) {
                channel.name = individualOverride;
                return;
            }

            const bulkName = channel.guild_id && vstorage.guildChannelBulkRename[channel.guild_id];
            if (bulkName) channel.name = bulkName;
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
    ].filter(Boolean) as (() => void)[];

    return () => unpatches.forEach(unpatch => unpatch());
}
