import { findByStoreName } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { semanticColors } from "@vendetta/ui";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms } from "@vendetta/ui/components";

import { pickRandomPoop, vstorage } from "./patcher";

const { FormRow, FormSection, FormText, FormInput, FormSwitchRow } = Forms;

const UserStore = findByStoreName("UserStore");
const GuildStore = findByStoreName("GuildStore");
const ChannelStore = findByStoreName("ChannelStore");

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

type ToggleStoreKey = "roleColorDisabled" | "hiddenStatusUsers" | "bulkExceptions";

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

export default function Settings() {
    useProxy(vstorage);

    return (
        <RN.ScrollView style={{ flex: 1 }}>
            <FormSection title="使い方">
                <FormText style={{ padding: 16 }}>
                    ユーザーやサーバーのIDを登録すると、アバター・表示名・サーバーアイコン・サーバー名があなたの端末上でのみ指定した内容に置き換わります。相手や他のユーザーには一切送信・共有されません。項目をタップすると編集・削除できます。
                </FormText>
            </FormSection>

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

            <FormSection title="実験的機能">
                <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                    サーバーID単位でBot/webhookのアイコンを見分ける確実な方法がないため、以下はそのサーバー内の`bot`と判定されるアバター全てに一律適用されます (実在のBotアカウントも巻き込まれます)。個別のユーザーIDが分かる場合は上の「アバターを追加」の方が確実です。
                </FormText>
            </FormSection>
            <OverrideSection config={guildBotIconConfig} />
        </RN.ScrollView>
    );
}
