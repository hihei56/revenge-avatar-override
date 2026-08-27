import { findByProps, findByStoreName } from "@vendetta/metro";
import { after } from "@vendetta/patcher";
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

    const unpatches = [
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

        guildIconUtils && after("getGuildIconURL", guildIconUtils, ([data]) => {
            const override = data?.id && vstorage.guildIconOverrides[data.id];
            return override || undefined;
        }),

        guildIconUtils && after("getGuildIconSource", guildIconUtils, ([data]) => {
            const override = data?.id && vstorage.guildIconOverrides[data.id];
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
