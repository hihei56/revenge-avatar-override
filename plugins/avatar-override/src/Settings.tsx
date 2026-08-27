import { findByProps, findByStoreName } from "@vendetta/metro";
import { clipboard, React, ReactNative as RN } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { semanticColors } from "@vendetta/ui";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";

import { pickRandomPoop, STORAGE_KEYS, vstorage } from "./patcher";

const { FormRow, FormSection, FormText, FormInput, FormSwitchRow } = Forms;

const UserStore = findByStoreName("UserStore");
const GuildStore = findByStoreName("GuildStore");
const ChannelStore = findByStoreName("ChannelStore");
const SelectedGuildStore = findByStoreName("SelectedGuildStore");
const SelectedChannelStore = findByStoreName("SelectedChannelStore");

// Same document-picker lookup used by other Revenge plugins (e.g. monet-theme's
// AddBackgroundSheet) to let the user pick an image from the device. The
// resulting file:// path is used directly as the "URL" — it renders fine
// locally, but (unlike a real CDN link) only works on this device.
const DocumentPicker = findByProps("pickSingle", "isCancel");
const DocumentsNew = findByProps("pick", "saveDocuments");

async function pickImageFile(): Promise<string | undefined> {
    try {
        if (DocumentPicker) {
            const file = await DocumentPicker.pickSingle({
                type: DocumentPicker.types.images,
                mode: "import",
                copyTo: "documentDirectory",
            });
            if (file.fileCopyUri) return `file://${file.fileCopyUri}`;
        } else if (DocumentsNew) {
            const [picked] = await DocumentsNew.pick({
                type: DocumentsNew.types.images,
                allowVirtualFiles: true,
                mode: "import",
            });
            if (picked?.uri) {
                const [result] = await DocumentsNew.keepLocalCopy({
                    files: [{ fileName: picked.name ?? "image", uri: picked.uri }],
                    destination: "documentDirectory",
                });
                if (result?.status === "success") return `file://${result.localUri}`;
            }
        }
    } catch {
        // user cancelled the picker, or it's unavailable on this build
    }
    return undefined;
}

// Shared by every guild-ID field (OverrideSection's AddRow and
// ToggleListSection) so a server can be picked from the list of joined
// guilds instead of typing/pasting a raw ID — useful once someone is in
// enough servers that finding a specific ID by hand gets tedious.
function GuildPickerRow({ onSelect }: { onSelect: (id: string) => void }) {
    const [expanded, setExpanded] = React.useState(false);
    const [query, setQuery] = React.useState("");

    if (!expanded) {
        return (
            <FormRow
                label="サーバーから選ぶ"
                leading={<FormRow.Icon source={getAssetIDByName("ListBulletsIcon") ?? getAssetIDByName("PencilIcon")} />}
                trailing={<FormRow.Arrow />}
                onPress={() => setExpanded(true)}
            />
        );
    }

    const guilds: any[] = GuildStore?.getGuildsArray?.() ?? [];
    const q = query.trim().toLowerCase();
    const filtered = (q ? guilds.filter(g => g.name?.toLowerCase().includes(q) || g.id.includes(q)) : guilds)
        .slice()
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

    return (
        <>
            <FormRow
                label="閉じる"
                leading={<FormRow.Icon source={getAssetIDByName("CircleXIcon-primary")} />}
                onPress={() => { setExpanded(false); setQuery(""); }}
            />
            <FormInput
                placeholder="サーバー名で検索"
                value={query}
                onChange={setQuery}
            />
            {filtered.length === 0 && (
                <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                    一致するサーバーが見つかりません
                </FormText>
            )}
            {filtered.map(g => (
                <FormRow
                    key={g.id}
                    label={g.name ?? g.id}
                    subLabel={g.id}
                    onPress={() => { onSelect(g.id); setExpanded(false); setQuery(""); }}
                />
            ))}
        </>
    );
}

type StoreKey =
    | "overrides"
    | "nameOverrides"
    | "guildIconOverrides"
    | "guildNameOverrides"
    | "guildBotIconOverrides"
    | "channelNameOverrides"
    | "guildChannelBulkRename"
    | "guildUserIconOverrides"
    | "guildUserNameOverrides"
    | "guildHomeHeaderOverrides"
    | "guildBannerOverrides";

const setEntry = (key: StoreKey, id: string, value: string) => {
    vstorage[key] = { ...vstorage[key], [id]: value.trim() };
};

const removeEntry = (key: StoreKey, id: string) => {
    const next = { ...vstorage[key] };
    delete next[id];
    vstorage[key] = next;
};

interface SectionConfig {
    storeKey: StoreKey;
    sectionTitle: string;
    idLabel: string;
    idPlaceholder: string;
    valueLabel: string;
    valuePlaceholder: string;
    isImage?: boolean;
    allowBlankRandomPoop?: boolean;
    pickGuild?: boolean;
    resolveLabel: (id: string) => string;
}

function AddRow({ config }: { config: SectionConfig }) {
    const [id, setId] = React.useState("");
    const [value, setValue] = React.useState("");
    const [error, setError] = React.useState("");

    const submit = () => {
        const trimmedId = id.trim();
        let trimmedValue = value.trim();

        if (!/^\d{15,25}$/.test(trimmedId)) {
            setError("IDが正しくありません (数字のみ・15〜25桁)");
            return;
        }

        if (!trimmedValue) {
            if (config.allowBlankRandomPoop) {
                trimmedValue = pickRandomPoop();
            } else {
                setError(`${config.valueLabel}を入力してください`);
                return;
            }
        }

        setEntry(config.storeKey, trimmedId, trimmedValue);
        setId("");
        setValue("");
        setError("");
    };

    return (
        <FormSection title={config.sectionTitle}>
            <FormInput
                title={config.idLabel}
                placeholder={config.idPlaceholder}
                value={id}
                keyboardType="numeric"
                onChange={(text: string) => {
                    setId(text);
                    setError("");
                }}
            />
            {config.pickGuild && (
                <GuildPickerRow onSelect={(guildId) => { setId(guildId); setError(""); }} />
            )}
            <FormInput
                title={config.valueLabel}
                placeholder={config.allowBlankRandomPoop
                    ? `${config.valuePlaceholder} (空欄でランダムなうんこ画像)`
                    : config.valuePlaceholder}
                value={value}
                onChange={(text: string) => {
                    setValue(text);
                    setError("");
                }}
            />
            {config.isImage && (
                <FormRow
                    label="端末から画像を選択"
                    subLabel="この端末専用になります (他の端末には反映されません)"
                    leading={<FormRow.Icon source={getAssetIDByName("ImageIcon")} />}
                    onPress={async () => {
                        const path = await pickImageFile();
                        if (path) {
                            setValue(path);
                            setError("");
                        }
                    }}
                />
            )}
            {!!error && (
                <FormText style={{ color: semanticColors.TEXT_FEEDBACK_CRITICAL, paddingHorizontal: 16, paddingBottom: 8 }}>
                    {error}
                </FormText>
            )}
            <FormRow
                label="追加する"
                leading={<FormRow.Icon source={getAssetIDByName("PlusLargeIcon")} />}
                onPress={submit}
            />
        </FormSection>
    );
}

function EntryRow({ config, id, value }: { config: SectionConfig; id: string; value: string }) {
    const [editing, setEditing] = React.useState(false);
    const [draft, setDraft] = React.useState(value);

    const label = config.resolveLabel(id);

    if (editing) {
        return (
            <RN.View>
                <FormInput
                    title={label}
                    placeholder={config.valuePlaceholder}
                    value={draft}
                    onChange={setDraft}
                />
                {config.isImage && (
                    <FormRow
                        label="端末から画像を選択"
                        leading={<FormRow.Icon source={getAssetIDByName("ImageIcon")} />}
                        onPress={async () => {
                            const path = await pickImageFile();
                            if (path) setDraft(path);
                        }}
                    />
                )}
                <FormRow
                    label="保存"
                    leading={<FormRow.Icon source={getAssetIDByName("CircleCheckIcon-primary")} />}
                    onPress={() => {
                        if (draft.trim()) setEntry(config.storeKey, id, draft);
                        setEditing(false);
                    }}
                />
                <FormRow
                    label="削除"
                    leading={
                        <FormRow.Icon
                            source={getAssetIDByName("TrashIcon")}
                            style={{ tintColor: semanticColors.TEXT_FEEDBACK_CRITICAL }}
                        />
                    }
                    onPress={() => {
                        removeEntry(config.storeKey, id);
                        setEditing(false);
                    }}
                />
                <FormRow
                    label="キャンセル"
                    leading={<FormRow.Icon source={getAssetIDByName("CircleXIcon-primary")} />}
                    onPress={() => {
                        setDraft(value);
                        setEditing(false);
                    }}
                />
            </RN.View>
        );
    }

    return (
        <FormRow
            label={label}
            subLabel={config.isImage ? id : value}
            leading={
                config.isImage
                    ? (
                        <RN.Image
                            source={{ uri: value }}
                            style={{ width: 32, height: 32, borderRadius: 16 }}
                        />
                    )
                    : <FormRow.Icon source={getAssetIDByName("PencilIcon")} />
            }
            trailing={<FormRow.Arrow />}
            onPress={() => setEditing(true)}
        />
    );
}

function OverrideSection({ config }: { config: SectionConfig }) {
    const entries = Object.entries(vstorage[config.storeKey] ?? {});

    return (
        <>
            <AddRow config={config} />
            <FormSection title={`登録済み (${entries.length})`}>
                {entries.length === 0 && (
                    <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                        まだ何も登録されていません
                    </FormText>
                )}
                {entries.map(([id, value]) => <EntryRow key={id} config={config} id={id} value={value} />)}
            </FormSection>
        </>
    );
}

const avatarConfig: SectionConfig = {
    storeKey: "overrides",
    sectionTitle: "アバターを追加",
    idLabel: "ユーザーID",
    idPlaceholder: "例: 123456789012345678",
    valueLabel: "画像URL",
    valuePlaceholder: "https://example.com/avatar.png",
    isImage: true,
    allowBlankRandomPoop: true,
    resolveLabel: id => UserStore?.getUser?.(id)?.username ?? id,
};

const nameConfig: SectionConfig = {
    storeKey: "nameOverrides",
    sectionTitle: "ユーザー名を追加",
    idLabel: "ユーザーID",
    idPlaceholder: "例: 123456789012345678",
    valueLabel: "表示名",
    valuePlaceholder: "表示させたい名前",
    resolveLabel: id => UserStore?.getUser?.(id)?.username ?? id,
};

const guildIconConfig: SectionConfig = {
    storeKey: "guildIconOverrides",
    sectionTitle: "サーバーアイコンを追加",
    idLabel: "サーバーID",
    idPlaceholder: "例: 123456789012345678",
    valueLabel: "画像URL",
    valuePlaceholder: "https://example.com/icon.png",
    isImage: true,
    pickGuild: true,
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

// The wide banner image shown above the server name in the channel list
// drawer (guild.banner) — distinct from the guild icon (small circular
// avatar) and the home/guide tab header (guildHomeHeaderOverrides).
const guildBannerConfig: SectionConfig = {
    storeKey: "guildBannerOverrides",
    sectionTitle: "サーバーバナー画像を追加",
    idLabel: "サーバーID",
    idPlaceholder: "例: 123456789012345678",
    valueLabel: "画像URL",
    valuePlaceholder: "https://example.com/banner.png",
    isImage: true,
    pickGuild: true,
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

const guildHomeHeaderConfig: SectionConfig = {
    storeKey: "guildHomeHeaderOverrides",
    sectionTitle: "サーバーホームヘッダー画像を追加",
    idLabel: "サーバーID (全サーバー共通にする場合は default と入力)",
    idPlaceholder: "例: 123456789012345678 / default",
    valueLabel: "画像URL",
    valuePlaceholder: "https://example.com/header.png",
    isImage: true,
    pickGuild: true,
    resolveLabel: id => (id === "default" ? "🌐 全サーバー共通" : GuildStore?.getGuild?.(id)?.name ?? id),
};

const guildNameConfig: SectionConfig = {
    storeKey: "guildNameOverrides",
    sectionTitle: "サーバー名を追加",
    idLabel: "サーバーID",
    idPlaceholder: "例: 123456789012345678",
    valueLabel: "サーバー名",
    valuePlaceholder: "表示させたいサーバー名",
    pickGuild: true,
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

const guildBotIconConfig: SectionConfig = {
    storeKey: "guildBotIconOverrides",
    sectionTitle: "サーバー内のBot/webhookアイコンを一括変更",
    idLabel: "サーバーID",
    idPlaceholder: "例: 123456789012345678",
    valueLabel: "画像URL",
    valuePlaceholder: "https://example.com/icon.png",
    isImage: true,
    allowBlankRandomPoop: true,
    pickGuild: true,
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

const guildUserIconConfig: SectionConfig = {
    storeKey: "guildUserIconOverrides",
    sectionTitle: "サーバー内の全ユーザーのアイコンを一括変更",
    idLabel: "サーバーID",
    idPlaceholder: "例: 123456789012345678",
    valueLabel: "画像URL",
    valuePlaceholder: "https://example.com/icon.png",
    isImage: true,
    allowBlankRandomPoop: true,
    pickGuild: true,
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

const guildUserNameConfig: SectionConfig = {
    storeKey: "guildUserNameOverrides",
    sectionTitle: "サーバー内の全ユーザーの表示名を一括変更",
    idLabel: "サーバーID",
    idPlaceholder: "例: 123456789012345678",
    valueLabel: "表示名 (全員共通)",
    valuePlaceholder: "例: うんこ",
    pickGuild: true,
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

const channelNameConfig: SectionConfig = {
    storeKey: "channelNameOverrides",
    sectionTitle: "チャンネル名を追加",
    idLabel: "チャンネルID",
    idPlaceholder: "例: 123456789012345678",
    valueLabel: "チャンネル名",
    valuePlaceholder: "表示させたいチャンネル名",
    resolveLabel: id => ChannelStore?.getChannel?.(id)?.name ?? id,
};

const guildChannelBulkRenameConfig: SectionConfig = {
    storeKey: "guildChannelBulkRename",
    sectionTitle: "サーバー内の全チャンネル名を一括変更",
    idLabel: "サーバーID",
    idPlaceholder: "例: 123456789012345678",
    valueLabel: "チャンネル名 (全チャンネル共通)",
    valuePlaceholder: "例: うんこ",
    pickGuild: true,
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

const clockChannelsConfig: ToggleSectionConfig = {
    storeKey: "clockChannels",
    sectionTitle: "時計チャンネルを追加",
    idLabel: "チャンネルID",
    idPlaceholder: "例: 123456789012345678",
    resolveLabel: id => ChannelStore?.getChannel?.(id)?.name ?? id,
};

const hideReadChannelsConfig: ToggleSectionConfig = {
    storeKey: "hideReadChannelsGuilds",
    sectionTitle: "既読チャンネルを非表示にするサーバーを追加",
    idLabel: "サーバーID",
    idPlaceholder: "例: 123456789012345678",
    pickGuild: true,
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

const hideUnreadIndicatorsConfig: ToggleSectionConfig = {
    storeKey: "hideUnreadIndicatorsGuilds",
    sectionTitle: "未読の光る表示を消すサーバーを追加",
    idLabel: "サーバーID",
    idPlaceholder: "例: 123456789012345678",
    pickGuild: true,
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

const channelAllowlistConfig: ToggleSectionConfig = {
    storeKey: "channelAllowlistGuilds",
    sectionTitle: "指定チャンネルのみ表示するサーバーを追加",
    idLabel: "サーバーID",
    idPlaceholder: "例: 123456789012345678",
    pickGuild: true,
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

const allowedChannelsConfig: ToggleSectionConfig = {
    storeKey: "allowedChannelIds",
    sectionTitle: "表示を許可するチャンネルを追加",
    idLabel: "チャンネルID",
    idPlaceholder: "例: 123456789012345678",
    resolveLabel: id => ChannelStore?.getChannel?.(id)?.name ?? id,
};

type ToggleStoreKey =
    | "roleColorDisabled"
    | "hiddenStatusUsers"
    | "bulkExceptions"
    | "allowedTagGuildIds"
    | "guildHideAllStatus"
    | "roleDisplayExceptions"
    | "clockChannels"
    | "hideReadChannelsGuilds"
    | "hideUnreadIndicatorsGuilds"
    | "channelAllowlistGuilds"
    | "allowedChannelIds";

interface ToggleSectionConfig {
    storeKey: ToggleStoreKey;
    sectionTitle: string;
    idLabel: string;
    idPlaceholder: string;
    pickGuild?: boolean;
    resolveLabel: (id: string) => string;
}

function ToggleListSection({ config }: { config: ToggleSectionConfig }) {
    const [newId, setNewId] = React.useState("");
    const [error, setError] = React.useState("");

    const store = vstorage[config.storeKey] ?? {};
    const entries = Object.keys(store);

    const addEntry = () => {
        const id = newId.trim();
        if (!/^\d{15,25}$/.test(id)) {
            setError(`${config.idLabel}が正しくありません (数字のみ・15〜25桁)`);
            return;
        }
        vstorage[config.storeKey] = { ...store, [id]: true };
        setNewId("");
        setError("");
    };

    const removeEntry = (id: string) => {
        const next = { ...vstorage[config.storeKey] };
        delete next[id];
        vstorage[config.storeKey] = next;
    };

    return (
        <>
            <FormSection title={config.sectionTitle}>
                <FormInput
                    title={config.idLabel}
                    placeholder={config.idPlaceholder}
                    value={newId}
                    keyboardType="numeric"
                    onChange={(text: string) => {
                        setNewId(text);
                        setError("");
                    }}
                />
                {config.pickGuild && (
                    <GuildPickerRow onSelect={(guildId) => { setNewId(guildId); setError(""); }} />
                )}
                {!!error && (
                    <FormText style={{ color: semanticColors.TEXT_FEEDBACK_CRITICAL, paddingHorizontal: 16, paddingBottom: 8 }}>
                        {error}
                    </FormText>
                )}
                <FormRow
                    label="追加する"
                    leading={<FormRow.Icon source={getAssetIDByName("PlusLargeIcon")} />}
                    onPress={addEntry}
                />
            </FormSection>
            <FormSection title={`登録済み (${entries.length})`}>
                {entries.length === 0 && (
                    <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                        まだ何も登録されていません
                    </FormText>
                )}
                {entries.map(id => (
                    <FormSwitchRow
                        key={id}
                        label={config.resolveLabel(id)}
                        subLabel={`${id} (長押しでリストから削除)`}
                        value={!!store[id]}
                        onValueChange={(value: boolean) => {
                            vstorage[config.storeKey] = { ...vstorage[config.storeKey], [id]: value };
                        }}
                        onLongPress={() => removeEntry(id)}
                    />
                ))}
            </FormSection>
        </>
    );
}

const roleColorConfig: ToggleSectionConfig = {
    storeKey: "roleColorDisabled",
    sectionTitle: "ロールカラー無効化サーバーを追加",
    idLabel: "サーバーID",
    idPlaceholder: "例: 123456789012345678",
    pickGuild: true,
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

const hiddenStatusConfig: ToggleSectionConfig = {
    storeKey: "hiddenStatusUsers",
    sectionTitle: "オンラインステータスを隠すユーザーを追加",
    idLabel: "ユーザーID",
    idPlaceholder: "例: 123456789012345678",
    resolveLabel: id => UserStore?.getUser?.(id)?.username ?? id,
};

const bulkExceptionsConfig: ToggleSectionConfig = {
    storeKey: "bulkExceptions",
    sectionTitle: "一括変更から除外するユーザーを追加",
    idLabel: "ユーザーID",
    idPlaceholder: "例: 123456789012345678",
    resolveLabel: id => UserStore?.getUser?.(id)?.username ?? id,
};

const guildHideAllStatusConfig: ToggleSectionConfig = {
    storeKey: "guildHideAllStatus",
    sectionTitle: "サーバー内全員をオフライン扱いにするサーバーを追加",
    idLabel: "サーバーID",
    idPlaceholder: "例: 123456789012345678",
    pickGuild: true,
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

const roleDisplayExceptionsConfig: ToggleSectionConfig = {
    storeKey: "roleDisplayExceptions",
    sectionTitle: "ロール非表示から除外するユーザーを追加",
    idLabel: "ユーザーID",
    idPlaceholder: "例: 123456789012345678",
    resolveLabel: id => UserStore?.getUser?.(id)?.username ?? id,
};

const allowedTagsConfig: ToggleSectionConfig = {
    storeKey: "allowedTagGuildIds",
    sectionTitle: "表示を許可するサーバータグを追加",
    idLabel: "サーバーID (タグの元サーバー)",
    idPlaceholder: "例: 123456789012345678",
    pickGuild: true,
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

const isPrimitiveStorageValue = (value: unknown) =>
    typeof value === "boolean" || typeof value === "string" || typeof value === "number";

function exportSnapshot() {
    const snapshot: Record<string, unknown> = {};
    for (const key of STORAGE_KEYS) {
        const value = vstorage[key];
        snapshot[key] = isPrimitiveStorageValue(value) ? value : value ?? {};
    }
    return JSON.stringify(snapshot, null, 2);
}

function BackupSection() {
    const [importText, setImportText] = React.useState("");
    const [error, setError] = React.useState("");

    const doExport = async () => {
        const json = exportSnapshot();
        try {
            clipboard.setString(json);
            showToast("設定をクリップボードにコピーしました", getAssetIDByName("copy"));
        } catch {
            // clipboard API unavailable; sharing below still works
        }
        try {
            await RN.Share.share({ message: json });
        } catch {
            // user cancelled the share sheet, or it's unavailable; clipboard copy above already succeeded
        }
    };

    const importFrom = (text: string) => {
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(text);
        } catch {
            setError("JSONの読み込みに失敗しました。正しいエクスポートデータか確認してください");
            return;
        }

        for (const key of STORAGE_KEYS) {
            const value = parsed[key];
            if (isPrimitiveStorageValue(value) || (value && typeof value === "object")) {
                vstorage[key] = value as never;
            }
        }

        setError("");
        setImportText("");
        showToast("設定を読み込みました", getAssetIDByName("CircleCheckIcon-primary"));
    };

    const importFromClipboard = async () => {
        try {
            const text = await clipboard.getString();
            if (!text) {
                setError("クリップボードが空です");
                return;
            }
            importFrom(text);
        } catch {
            setError("クリップボードの読み取りに失敗しました");
        }
    };

    return (
        <FormSection title="設定のバックアップ">
            <FormText style={{ padding: 16 }}>
                現在の全設定をJSONとしてクリップボードにコピー・共有シートから保存したり、以前エクスポートしたJSONを貼り付けて読み込み直したりできます。読み込みは既存の設定に上書きされます (置き換わらないキーはそのまま残ります)。
            </FormText>
            <FormRow
                label="エクスポート (コピー & 共有)"
                leading={<FormRow.Icon source={getAssetIDByName("ShareIcon") ?? getAssetIDByName("copy")} />}
                onPress={doExport}
            />
            <FormRow
                label="クリップボードから読み込む"
                leading={<FormRow.Icon source={getAssetIDByName("PasteIcon") ?? getAssetIDByName("copy")} />}
                onPress={importFromClipboard}
            />
            <FormInput
                title="または貼り付けて読み込む"
                placeholder="エクスポートしたJSONをここに貼り付け"
                value={importText}
                multiline
                onChange={(text: string) => {
                    setImportText(text);
                    setError("");
                }}
            />
            {!!error && (
                <FormText style={{ color: semanticColors.TEXT_FEEDBACK_CRITICAL, paddingHorizontal: 16, paddingBottom: 8 }}>
                    {error}
                </FormText>
            )}
            <FormRow
                label="貼り付けた内容を読み込む"
                leading={<FormRow.Icon source={getAssetIDByName("CircleCheckIcon-primary")} />}
                onPress={() => importFrom(importText)}
            />
        </FormSection>
    );
}

function QuickIdSection() {
    const [, forceRerender] = React.useState(0);

    const guildId: string | undefined = SelectedGuildStore?.getGuildId?.();
    const channelId: string | undefined = SelectedChannelStore?.getChannelId?.(guildId);
    const selfId: string | undefined = UserStore?.getCurrentUser?.()?.id;

    const copy = (label: string, id: string | undefined) => {
        if (!id) {
            showToast(`${label}を取得できませんでした`, getAssetIDByName("CircleXIcon-primary"));
            return;
        }
        clipboard.setString(id);
        showToast(`${label}をコピーしました: ${id}`, getAssetIDByName("CopyIcon"));
    };

    return (
        <FormSection title="IDを簡単コピー">
            <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                開発者モードがオフでも、今開いているサーバー・チャンネルのIDをここからコピーできます。行をタップでコピーします。他の画面に移動した後は「今の場所を再取得」で更新してください。
            </FormText>
            <FormRow
                label="現在のサーバーID"
                subLabel={guildId ? `${GuildStore?.getGuild?.(guildId)?.name ?? ""} (${guildId})` : "サーバーを開いていません"}
                leading={<FormRow.Icon source={getAssetIDByName("CopyIcon")} />}
                onPress={() => copy("サーバーID", guildId)}
            />
            <FormRow
                label="現在のチャンネルID"
                subLabel={channelId ? `${ChannelStore?.getChannel?.(channelId)?.name ?? ""} (${channelId})` : "チャンネルを開いていません"}
                leading={<FormRow.Icon source={getAssetIDByName("CopyIcon")} />}
                onPress={() => copy("チャンネルID", channelId)}
            />
            <FormRow
                label="自分のユーザーID"
                subLabel={selfId ?? "取得できません"}
                leading={<FormRow.Icon source={getAssetIDByName("CopyIcon")} />}
                onPress={() => copy("ユーザーID", selfId)}
            />
            <FormRow
                label="今の場所を再取得"
                leading={<FormRow.Icon source={getAssetIDByName("RefreshIcon")} />}
                onPress={() => forceRerender(n => n + 1)}
            />
        </FormSection>
    );
}

function DeveloperModeSection() {
    useProxy(vstorage);

    return (
        <FormSection title="開発者モードの維持">
            <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                Discordの「開発者モード」(設定 &gt; 詳細設定) が勝手にオフになる場合、ONにすると約30秒ごとにチェックしてオンに戻そうとします。対応する内部設定がこの端末で見つからない場合は何も起きません (安全のため無視されるだけです)。上の「IDを簡単コピー」を使えば、そもそも開発者モードなしでもサーバー・チャンネルIDを取得できます。
            </FormText>
            <FormSwitchRow
                label="開発者モードがオフになったら戻す"
                value={vstorage.keepDeveloperModeOn}
                onValueChange={(value: boolean) => { vstorage.keepDeveloperModeOn = value; }}
            />
        </FormSection>
    );
}

function parseDateTimeInput(text: string): number | undefined {
    const m = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
    if (!m) return undefined;
    const [, y, mo, d, h, mi] = m.map(Number);
    const date = new Date(y, mo - 1, d, h, mi);
    return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

function formatDateTimeForInput(ms: number): string {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CountdownSection() {
    useProxy(vstorage);

    const [channelIdInput, setChannelIdInput] = React.useState(vstorage.countdownChannelId);
    const [dateInput, setDateInput] = React.useState(
        vstorage.countdownTargetMs ? formatDateTimeForInput(vstorage.countdownTargetMs) : "",
    );
    const [labelInput, setLabelInput] = React.useState(vstorage.countdownLabel);
    const [error, setError] = React.useState("");

    const save = () => {
        const id = channelIdInput.trim();
        if (id && !/^\d{15,25}$/.test(id)) {
            setError("チャンネルIDが正しくありません (数字のみ・15〜25桁)");
            return;
        }
        const targetMs = parseDateTimeInput(dateInput);
        if (dateInput.trim() && targetMs === undefined) {
            setError("日時の形式が正しくありません (例: 2026-08-27 15:00)");
            return;
        }

        vstorage.countdownChannelId = id;
        vstorage.countdownTargetMs = targetMs ?? 0;
        vstorage.countdownLabel = labelInput.trim();
        setError("");
        showToast("カウントダウンを設定しました", getAssetIDByName("CircleCheckIcon-primary"));
    };

    const clear = () => {
        vstorage.countdownChannelId = "";
        vstorage.countdownTargetMs = 0;
        vstorage.countdownLabel = "";
        setChannelIdInput("");
        setDateInput("");
        setLabelInput("");
        showToast("カウントダウンを解除しました", getAssetIDByName("CircleCheckIcon-primary"));
    };

    return (
        <FormSection title="予定までのカウントダウン">
            <FormText style={{ paddingHorizontal: 16, paddingBottom: 8, color: semanticColors.TEXT_MUTED }}>
                指定したチャンネルの名前に、指定した日時までの残り時間を表示します (例: ⏳ 残り2時間15分)。
            </FormText>
            <FormInput
                title="チャンネルID"
                placeholder="例: 123456789012345678"
                value={channelIdInput}
                keyboardType="numeric"
                onChange={(text: string) => setChannelIdInput(text)}
            />
            <FormInput
                title="予定日時"
                placeholder="2026-08-27 15:00"
                value={dateInput}
                onChange={(text: string) => setDateInput(text)}
            />
            <FormInput
                title="ラベル (任意)"
                placeholder="例: テスト"
                value={labelInput}
                onChange={(text: string) => setLabelInput(text)}
            />
            {!!error && (
                <FormText style={{ color: semanticColors.TEXT_FEEDBACK_CRITICAL, paddingHorizontal: 16, paddingBottom: 8 }}>
                    {error}
                </FormText>
            )}
            <FormRow
                label="保存する"
                leading={<FormRow.Icon source={getAssetIDByName("CircleCheckIcon-primary")} />}
                onPress={save}
            />
            {!!vstorage.countdownTargetMs && (
                <FormRow
                    label="解除する"
                    leading={<FormRow.Icon source={getAssetIDByName("TrashIcon")} />}
                    onPress={clear}
                />
            )}
        </FormSection>
    );
}

interface SettingsBlock {
    key: string;
    keywords: string;
    render: () => React.ReactNode;
}

const settingsBlocks: SettingsBlock[] = [
    {
        key: "intro",
        keywords: "使い方 説明 はじめに 使いかた",
        render: () => (
            <FormSection title="使い方">
                <FormText style={{ padding: 16 }}>
                    ユーザーやサーバーのIDを登録すると、アバター・表示名・サーバーアイコン・サーバー名があなたの端末上でのみ指定した内容に置き換わります。相手や他のユーザーには一切送信・共有されません。項目をタップすると編集・削除できます。
                </FormText>
            </FormSection>
        ),
    },
    {
        key: "backup",
        keywords: "バックアップ エクスポート インポート 復元 共有 設定の引き継ぎ",
        render: () => <BackupSection />,
    },
    {
        key: "quickIds",
        keywords: "ID 簡単コピー サーバーID チャンネルID ユーザーID 開発者モード コピー",
        render: () => <QuickIdSection />,
    },
    {
        key: "developerMode",
        keywords: "開発者モード developer mode オフになる 維持",
        render: () => <DeveloperModeSection />,
    },
    {
        key: "avatar",
        keywords: "アバターを追加 画像 うんこ アバター override",
        render: () => <OverrideSection config={avatarConfig} />,
    },
    {
        key: "name",
        keywords: "ユーザー名を追加 表示名 名前",
        render: () => <OverrideSection config={nameConfig} />,
    },
    {
        key: "guildIcon",
        keywords: "サーバーアイコンを追加 サーバーアイコン アイコン",
        render: () => <OverrideSection config={guildIconConfig} />,
    },
    {
        key: "guildBanner",
        keywords: "サーバーバナー画像を追加 バナー 画像",
        render: () => <OverrideSection config={guildBannerConfig} />,
    },
    {
        key: "guildHomeHeader",
        keywords: "サーバーホームヘッダー画像を追加 ホーム ガイド ヘッダー 画像",
        render: () => <OverrideSection config={guildHomeHeaderConfig} />,
    },
    {
        key: "guildName",
        keywords: "サーバー名を追加 サーバー名",
        render: () => <OverrideSection config={guildNameConfig} />,
    },
    {
        key: "channelName",
        keywords: "チャンネル名を追加 チャンネル名",
        render: () => <OverrideSection config={channelNameConfig} />,
    },
    {
        key: "guildChannelBulkRename",
        keywords: "サーバー内の全チャンネル名を一括変更 チャンネル 一括変更",
        render: () => <OverrideSection config={guildChannelBulkRenameConfig} />,
    },
    {
        key: "clockChannels",
        keywords: "時計チャンネル 現在時刻 時刻表示 clock",
        render: () => (
            <>
                <ToggleListSection config={clockChannelsConfig} />
                <FormSection title="時計チャンネルについて">
                    <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                        登録したチャンネルの名前が、常に現在時刻 (例: 🕐 14:32) に置き換わります。個別のチャンネル名指定より優先されます。表示は約30秒ごとに更新を試みますが、Discord側の再描画のタイミング次第で数十秒〜数分ずれることがあります。
                    </FormText>
                </FormSection>
            </>
        ),
    },
    {
        key: "countdown",
        keywords: "カウントダウン 残り時間 countdown 時間 チャンネル",
        render: () => <CountdownSection />,
    },
    {
        key: "hideReadChannels",
        keywords: "既読チャンネル非表示 未読のみ表示 チャンネル 重い 軽量化",
        render: () => (
            <>
                <ToggleListSection config={hideReadChannelsConfig} />
                <FormSection title="既読チャンネル非表示について">
                    <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                        登録したサーバーでは、未読メッセージがあるチャンネルと今開いているチャンネルだけがチャンネル一覧に表示され、それ以外は隠れます。ボイスチャンネル・テキストチャンネル両方が対象です。カテゴリ自体は非表示になりません (中身が空でも表示されたままです)。
                    </FormText>
                </FormSection>
            </>
        ),
    },
    {
        key: "hideUnreadIndicators",
        keywords: "未読の光る表示を消す 未読 ハイライト バッジ 未読ドット 依存性",
        render: () => (
            <>
                <ToggleListSection config={hideUnreadIndicatorsConfig} />
                <FormSection title="未読の光る表示を消すことについて">
                    <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                        登録したサーバーでは、チャンネル一覧の太字・白色ハイライト、メンションの赤いバッジ、サーバーアイコンの未読ドットがまとめて消えます (実際のメッセージ既読状態は変わりません、見た目だけです)。
                    </FormText>
                    <FormText style={{ paddingHorizontal: 16, paddingBottom: 16, color: semanticColors.TEXT_FEEDBACK_CRITICAL }}>
                        注意: 同じサーバーで上の「既読チャンネル非表示」も有効にすると、そのサーバーの全チャンネルが「既読扱い」になるため、今開いているチャンネル以外は一覧から消えます。
                    </FormText>
                </FormSection>
            </>
        ),
    },
    {
        key: "channelAllowlist",
        keywords: "指定チャンネルのみ表示 表示を許可するチャンネル 絞り込み フォーカス",
        render: () => (
            <>
                <ToggleListSection config={channelAllowlistConfig} />
                <ToggleListSection config={allowedChannelsConfig} />
                <FormSection title="指定チャンネルのみ表示について">
                    <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                        サーバーを登録すると、そのサーバーのチャンネル一覧が「表示を許可するチャンネル」に登録したものと、今開いているチャンネルだけに絞り込まれます。チャンネルが多いサーバーで、よく使うチャンネルだけ見たい場合に使えます。「表示を許可するチャンネル」はサーバーを問わず共通のリストです。
                    </FormText>
                </FormSection>
            </>
        ),
    },
    {
        key: "roleDisplay",
        keywords: "ロール表示 ロールを非表示 ロールアイコン プロフィール",
        render: () => (
            <FormSection title="ロール表示">
                <FormSwitchRow
                    label="プロフィールのロールを非表示にする"
                    subLabel="プロフィール画面などに表示されるロール一覧を、全サーバーで表示しないようにします"
                    value={vstorage.hideProfileRoles}
                    onValueChange={(value: boolean) => { vstorage.hideProfileRoles = value; }}
                />
                <FormSwitchRow
                    label="ロールアイコンを非表示にする"
                    subLabel="ユーザー名の横などに表示されるロールアイコンを、全サーバーで表示しないようにします"
                    value={vstorage.hideRoleIcons}
                    onValueChange={(value: boolean) => { vstorage.hideRoleIcons = value; }}
                />
            </FormSection>
        ),
    },
    {
        key: "roleDisplayExceptions",
        keywords: "ロール非表示の除外 ロール 除外 例外",
        render: () => (
            <>
                <ToggleListSection config={roleDisplayExceptionsConfig} />
                <FormSection title="ロール非表示の除外について">
                    <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                        ここに登録したユーザーIDは、上の「プロフィールのロールを非表示にする」「ロールアイコンを非表示にする」がONでも、そのユーザーだけロール・ロールアイコンが通常通り表示されます。
                    </FormText>
                </FormSection>
            </>
        ),
    },
    {
        key: "roleColor",
        keywords: "ロールカラー無効化 ロールの色 無効化",
        render: () => <ToggleListSection config={roleColorConfig} />,
    },
    {
        key: "hiddenStatus",
        keywords: "オンラインステータスを隠す ステータス オフライン",
        render: () => <ToggleListSection config={hiddenStatusConfig} />,
    },
    {
        key: "guildHideAllStatus",
        keywords: "サーバー内全員オフライン扱い ステータス オフライン",
        render: () => (
            <>
                <ToggleListSection config={guildHideAllStatusConfig} />
                <FormSection title="サーバー内全員オフライン扱いについて">
                    <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                        オンラインステータスはユーザーごとの共通データ (サーバーごとには分かれていません) のため、ここで登録したサーバーのメンバーは、そのサーバーに限らずDMや他のサーバーでも常にオフライン扱いになります。
                    </FormText>
                </FormSection>
            </>
        ),
    },
    {
        key: "bulkExceptions",
        keywords: "除外ユーザー 一括変更 除外",
        render: () => (
            <>
                <ToggleListSection config={bulkExceptionsConfig} />
                <FormSection title="除外ユーザーについて">
                    <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                        ここに登録したユーザーIDは、下の「サーバー内の全ユーザー/Bot一括変更」系の設定すべてから常に除外されます (自分自身などを除外したい場合に使います)。個別の「アバターを追加」「ユーザー名を追加」には影響しません。
                    </FormText>
                </FormSection>
            </>
        ),
    },
    {
        key: "guildUserIcon",
        keywords: "サーバー内の全ユーザーのアイコンを一括変更 一括変更 アイコン",
        render: () => <OverrideSection config={guildUserIconConfig} />,
    },
    {
        key: "guildUserName",
        keywords: "サーバー内の全ユーザーの表示名を一括変更 一括変更 表示名",
        render: () => <OverrideSection config={guildUserNameConfig} />,
    },
    {
        key: "allowedTags",
        keywords: "サーバータグ タグ 表示を許可",
        render: () => (
            <>
                <ToggleListSection config={allowedTagsConfig} />
                <FormSection title="サーバータグについて">
                    <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                        ここに1つ以上登録すると、登録したサーバー由来のサーバータグ以外は全て非表示になります (メッセージやプロフィールに出るユーザー名の横の小さなタグ)。何も登録しなければ通常通り全て表示されます。
                    </FormText>
                </FormSection>
            </>
        ),
    },
    {
        key: "guildBotIcon",
        keywords: "Bot webhookアイコン一括変更 ボット アイコン",
        render: () => (
            <>
                <FormSection title="Bot/webhookアイコン一括変更について">
                    <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                        そのサーバーの実メンバーではないbot判定アバター (= webhook) にのみ適用されます。Carl-botなど実在のBotアカウントは自動的に対象外です。
                    </FormText>
                </FormSection>
                <OverrideSection config={guildBotIconConfig} />
            </>
        ),
    },
];

export default function Settings() {
    useProxy(vstorage);
    const [search, setSearch] = React.useState("");

    const query = search.trim().toLowerCase();
    const visibleBlocks = query
        ? settingsBlocks.filter(block => block.keywords.toLowerCase().includes(query))
        : settingsBlocks;

    return (
        <RN.ScrollView style={{ flex: 1 }}>
            <FormSection title="項目を検索">
                <FormInput
                    placeholder="例: サーバーアイコン、ロール、時計"
                    value={search}
                    onChange={setSearch}
                />
            </FormSection>
            {query !== "" && visibleBlocks.length === 0 && (
                <FormSection title="検索結果なし">
                    <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                        一致する項目が見つかりませんでした
                    </FormText>
                </FormSection>
            )}
            {visibleBlocks.map(block => (
                <React.Fragment key={block.key}>{block.render()}</React.Fragment>
            ))}
        </RN.ScrollView>
    );
}
