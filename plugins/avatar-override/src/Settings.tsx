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

type StoreKey =
    | "overrides"
    | "nameOverrides"
    | "guildIconOverrides"
    | "guildNameOverrides"
    | "guildBotIconOverrides"
    | "channelNameOverrides"
    | "guildChannelBulkRename"
    | "guildUserIconOverrides"
    | "guildUserNameOverrides";

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
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

const guildNameConfig: SectionConfig = {
    storeKey: "guildNameOverrides",
    sectionTitle: "サーバー名を追加",
    idLabel: "サーバーID",
    idPlaceholder: "例: 123456789012345678",
    valueLabel: "サーバー名",
    valuePlaceholder: "表示させたいサーバー名",
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
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

const guildUserNameConfig: SectionConfig = {
    storeKey: "guildUserNameOverrides",
    sectionTitle: "サーバー内の全ユーザーの表示名を一括変更",
    idLabel: "サーバーID",
    idPlaceholder: "例: 123456789012345678",
    valueLabel: "表示名 (全員共通)",
    valuePlaceholder: "例: うんこ",
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
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

type ToggleStoreKey = "roleColorDisabled" | "hiddenStatusUsers" | "bulkExceptions" | "allowedTagGuildIds";

interface ToggleSectionConfig {
    storeKey: ToggleStoreKey;
    sectionTitle: string;
    idLabel: string;
    idPlaceholder: string;
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

const allowedTagsConfig: ToggleSectionConfig = {
    storeKey: "allowedTagGuildIds",
    sectionTitle: "表示を許可するサーバータグを追加",
    idLabel: "サーバーID (タグの元サーバー)",
    idPlaceholder: "例: 123456789012345678",
    resolveLabel: id => GuildStore?.getGuild?.(id)?.name ?? id,
};

function exportSnapshot() {
    const snapshot: Record<string, unknown> = {};
    for (const key of STORAGE_KEYS) snapshot[key] = vstorage[key] ?? {};
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
            if (value && typeof value === "object") vstorage[key] = value as never;
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

export default function Settings() {
    useProxy(vstorage);

    return (
        <RN.ScrollView style={{ flex: 1 }}>
            <FormSection title="使い方">
                <FormText style={{ padding: 16 }}>
                    ユーザーやサーバーのIDを登録すると、アバター・表示名・サーバーアイコン・サーバー名があなたの端末上でのみ指定した内容に置き換わります。相手や他のユーザーには一切送信・共有されません。項目をタップすると編集・削除できます。
                </FormText>
            </FormSection>

            <BackupSection />

            <OverrideSection config={avatarConfig} />
            <OverrideSection config={nameConfig} />
            <OverrideSection config={guildIconConfig} />
            <OverrideSection config={guildNameConfig} />
            <OverrideSection config={channelNameConfig} />
            <OverrideSection config={guildChannelBulkRenameConfig} />
            <ToggleListSection config={roleColorConfig} />
            <ToggleListSection config={hiddenStatusConfig} />

            <ToggleListSection config={bulkExceptionsConfig} />
            <FormSection title="除外ユーザーについて">
                <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                    ここに登録したユーザーIDは、下の「サーバー内の全ユーザー/Bot一括変更」系の設定すべてから常に除外されます (自分自身などを除外したい場合に使います)。個別の「アバターを追加」「ユーザー名を追加」には影響しません。
                </FormText>
            </FormSection>

            <OverrideSection config={guildUserIconConfig} />
            <OverrideSection config={guildUserNameConfig} />

            <ToggleListSection config={allowedTagsConfig} />
            <FormSection title="サーバータグについて">
                <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                    ここに1つ以上登録すると、登録したサーバー由来のサーバータグ以外は全て非表示になります (メッセージやプロフィールに出るユーザー名の横の小さなタグ)。何も登録しなければ通常通り全て表示されます。
                </FormText>
            </FormSection>

            <FormSection title="Bot/webhookアイコン一括変更について">
                <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                    そのサーバーの実メンバーではないbot判定アバター (= webhook) にのみ適用されます。Carl-botなど実在のBotアカウントは自動的に対象外です。
                </FormText>
            </FormSection>
            <OverrideSection config={guildBotIconConfig} />
        </RN.ScrollView>
    );
}
