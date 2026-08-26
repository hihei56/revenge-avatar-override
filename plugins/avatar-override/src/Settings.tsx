import { findByStoreName } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { semanticColors } from "@vendetta/ui";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms } from "@vendetta/ui/components";

import { vstorage } from "./patcher";

const { FormRow, FormSection, FormText, FormInput } = Forms;

const UserStore = findByStoreName("UserStore");

const setOverride = (userId: string, url: string) => {
    vstorage.overrides = { ...vstorage.overrides, [userId]: url.trim() };
};

const removeOverride = (userId: string) => {
    const next = { ...vstorage.overrides };
    delete next[userId];
    vstorage.overrides = next;
};

function AddSection() {
    const [userId, setUserId] = React.useState("");
    const [url, setUrl] = React.useState("");
    const [error, setError] = React.useState("");

    const submit = () => {
        const id = userId.trim();
        const link = url.trim();

        if (!/^\d{15,25}$/.test(id)) {
            setError("ユーザーIDが正しくありません (数字のみ・15〜25桁)");
            return;
        }
        if (!link) {
            setError("画像URLを入力してください");
            return;
        }

        setOverride(id, link);
        setUserId("");
        setUrl("");
        setError("");
    };

    return (
        <FormSection title="ユーザーを追加">
            <FormInput
                title="ユーザーID"
                placeholder="例: 123456789012345678"
                value={userId}
                keyboardType="numeric"
                onChange={(text: string) => {
                    setUserId(text);
                    setError("");
                }}
            />
            <FormInput
                title="画像URL"
                placeholder="https://example.com/avatar.png"
                value={url}
                onChange={(text: string) => {
                    setUrl(text);
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

function OverrideRow({ userId, url }: { userId: string; url: string }) {
    const [editing, setEditing] = React.useState(false);
    const [draft, setDraft] = React.useState(url);

    const user = UserStore?.getUser?.(userId);
    const label = user?.username ?? userId;

    if (editing) {
        return (
            <RN.View>
                <FormInput
                    title={label}
                    placeholder="https://example.com/avatar.png"
                    value={draft}
                    onChange={setDraft}
                />
                <FormRow
                    label="保存"
                    leading={<FormRow.Icon source={getAssetIDByName("CircleCheckIcon-primary")} />}
                    onPress={() => {
                        if (draft.trim()) setOverride(userId, draft);
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
                        removeOverride(userId);
                        setEditing(false);
                    }}
                />
                <FormRow
                    label="キャンセル"
                    leading={<FormRow.Icon source={getAssetIDByName("CircleXIcon-primary")} />}
                    onPress={() => {
                        setDraft(url);
                        setEditing(false);
                    }}
                />
            </RN.View>
        );
    }

    return (
        <FormRow
            label={label}
            subLabel={userId}
            leading={
                <RN.Image
                    source={{ uri: url }}
                    style={{ width: 32, height: 32, borderRadius: 16 }}
                />
            }
            trailing={<FormRow.Arrow />}
            onPress={() => setEditing(true)}
        />
    );
}

export default function Settings() {
    useProxy(vstorage);

    const entries = Object.entries(vstorage.overrides ?? {});

    return (
        <RN.ScrollView style={{ flex: 1 }}>
            <FormSection title="使い方">
                <FormText style={{ padding: 16 }}>
                    ユーザーIDと画像URLを登録すると、そのユーザーのアバターがあなたの端末上でのみ指定した画像に置き換わります。相手や他のユーザーには一切送信・共有されません。項目をタップすると編集・削除できます。
                </FormText>
            </FormSection>

            <AddSection />

            <FormSection title={`登録済み (${entries.length})`}>
                {entries.length === 0 && (
                    <FormText style={{ padding: 16, color: semanticColors.TEXT_MUTED }}>
                        まだ何も登録されていません
                    </FormText>
                )}
                {entries.map(([userId, url]) => (
                    <OverrideRow key={userId} userId={userId} url={url} />
                ))}
            </FormSection>
        </RN.ScrollView>
    );
}
