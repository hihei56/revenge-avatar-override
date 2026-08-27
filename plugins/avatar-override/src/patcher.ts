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

const avatarUtils = findByProps("getUserAvatarURL", "getUserAvatarSource");
const guildIconUtils = findByProps("getGuildIconURL", "getGuildIconSource") ?? avatarUtils;
const UserStore = findByStoreName("UserStore");
const GuildStore = findByStoreName("GuildStore");
const GuildMemberStore = findByStoreName("GuildMemberStore");
const ChannelStore = findByStoreName("ChannelStore");
const PresenceStore = findByStoreName("PresenceStore");

// The `User` record class exposes guild-aware `getAvatarURL(guildId, ...)` /
// `getAvatarSource(guildId)` instance methods. Unlike the module-level
// getUserAvatarURL/getUserAvatarSource above, these receive the guild the
// avatar is being rendered in, which is the only way to scope an override
// to "every bot/webhook avatar in this guild" (bots and webhooks are both
// flagged `bot: true` with no other reliable distinguishing signal).
const UserRecordProto = UserStore?.getCurrentUser?.()?.constructor?.prototype;

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

    const unpatches = [
        after("getUser", UserStore, ([id], user) => {
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

        after("getUserAvatarURL", avatarUtils, ([user, animate]) => {
            const override = user?.id && vstorage.overrides[user.id];
            if (!override) return;

            if (!animate && urlExt(override) === "gif") {
                return override.replace(/\.gif($|\?)/, ".png$1");
            }
            return override;
        }),

        after("getUserAvatarSource", avatarUtils, ([user, animate]) => {
            const override = user?.id && vstorage.overrides[user.id];
            if (!override) return;

            const uri = !animate && urlExt(override) === "gif"
                ? override.replace(/\.gif($|\?)/, ".png$1")
                : override;
            return { uri };
        }),

        after("getGuildIconURL", guildIconUtils, ([data]) => {
            const override = data?.id && vstorage.guildIconOverrides[data.id];
            return override || undefined;
        }),

        after("getGuildIconSource", guildIconUtils, ([data]) => {
            const override = data?.id && vstorage.guildIconOverrides[data.id];
            return override ? { uri: override } : undefined;
        }),

        after("getGuild", GuildStore, ([id], guild) => {
            if (!guild) return;
            const override = vstorage.guildNameOverrides[id];
            if (override) guild.name = override;
        }),

        UserRecordProto && after("getAvatarURL", UserRecordProto, function (this: any, [guildId]) {
            if (!guildId || !this?.id || vstorage.overrides[this.id] || vstorage.bulkExceptions[this.id]) return;
            const guildOverrides = this.bot ? vstorage.guildBotIconOverrides : vstorage.guildUserIconOverrides;
            return guildOverrides[guildId] || undefined;
        }),

        UserRecordProto && after("getAvatarSource", UserRecordProto, function (this: any, [guildId]) {
            if (!guildId || !this?.id || vstorage.overrides[this.id] || vstorage.bulkExceptions[this.id]) return;
            const guildOverrides = this.bot ? vstorage.guildBotIconOverrides : vstorage.guildUserIconOverrides;
            const override = guildOverrides[guildId];
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
        }),
    ].filter(Boolean) as (() => void)[];

    return () => unpatches.forEach(unpatch => unpatch());
}
