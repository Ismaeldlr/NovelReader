import { useEffect, useState } from "react";
import {
  Modal, View, Text, Pressable, StyleSheet, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, createStyles } from "../../src/theme";
import { initDb } from "../../src/db";

type Props = {
  visible: boolean;
  novelId: number;
  onClose: () => void;
  onSaved?: () => void; // notify parent to refresh
};

type NovelRow = {
  id: number;
  title: string;
  author: string | null;
  description: string | null;
  lang_original: string | null;
  status: string | null;
  slug: string | null;
  cover_path: string | null;
};

export default function EditNovelSheet({ visible, onClose, onSaved, novelId }: Props) {
  const { theme } = useTheme();
  const s = styles(theme);
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // fields
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [langOriginal, setLangOriginal] = useState("");
  const [status, setStatus] = useState("");
  const [slug, setSlug] = useState("");
  const [coverPath, setCoverPath] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!visible) return;
      setLoading(true);
      setErr(null);
      try {
        const db = await initDb();
        const rows = await db.select<NovelRow>(
          `SELECT id, title, author, description, lang_original, status, slug, cover_path
             FROM novels WHERE id = ? LIMIT 1;`,
          [novelId]
        );
        const n = rows?.[0];
        if (alive && n) {
          setTitle(n.title ?? "");
          setAuthor(n.author ?? "");
          setDescription(n.description ?? "");
          setLangOriginal(n.lang_original ?? "");
          setStatus(n.status ?? "");
          setSlug(n.slug ?? "");
          setCoverPath(n.cover_path ?? "");
        }
      } catch (e: any) {
        if (alive) setErr(e?.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [visible, novelId]);

  function resetAndClose() {
    onClose();
    setErr(null);
  }

  function slugify(input: string) {
    return input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // accents
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  async function onSave() {
    const name = title.trim();
    if (!name) {
      setErr("Title is required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const db = await initDb();
      await db.execute(
        `UPDATE novels
            SET title = ?,
                author = ?,
                description = ?,
                lang_original = ?,
                status = ?,
                slug = ?,
                cover_path = ?
          WHERE id = ?;`,
        [
          name,
          author.trim() || null,
          description.trim() || null,
          langOriginal.trim() || null,
          status.trim() || null,
          slug.trim() || null,
          coverPath.trim() || null,
          novelId,
        ]
      );
      onSaved?.();
      resetAndClose();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={resetAndClose}>
      <Pressable style={s.backdrop} onPress={resetAndClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={-insets.bottom} // flush to bottom
        style={s.sheetWrap}
      >
        <View style={[s.sheet, { paddingBottom: insets.bottom + theme.spacing(4) }]}>
          <Text style={s.title}>Edit Novel</Text>

          {loading ? (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <ActivityIndicator />
            </View>
          ) : (
            <>
              {!!err && <Text style={s.err}>{err}</Text>}


              <View style={s.field}>
                <Text style={s.label}>Title *</Text>
                <TextInput
                  style={s.input}
                  placeholder="Required"
                  placeholderTextColor={theme.colors.textDim}
                  value={title}
                  onChangeText={setTitle}
                />
              </View>

              <View style={s.field}>
                <Text style={s.label}>Cover Path</Text>
                <TextInput
                  style={s.input}
                  placeholder="https://example.com/cover.jpg or local path"
                  placeholderTextColor={theme.colors.textDim}
                  value={coverPath}
                  onChangeText={setCoverPath}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={s.field}>
                <Text style={s.label}>Author</Text>
                <TextInput
                  style={s.input}
                  placeholder="Optional"
                  placeholderTextColor={theme.colors.textDim}
                  value={author}
                  onChangeText={setAuthor}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={[s.field, { flex: 1 }]}>
                  <Text style={s.label}>Original Language</Text>
                  <View style={[s.input, { padding: 0 }]}>
                    <Picker
                      selectedValue={langOriginal}
                      onValueChange={setLangOriginal}
                      style={{ color: theme.colors.text, width: "100%" }}
                      dropdownIconColor={theme.colors.textDim}
                    >
                      <Picker.Item label="— Select —" value="" />
                      <Picker.Item label="English" value="en" />
                      <Picker.Item label="Chinese" value="zh" />
                      <Picker.Item label="Korean" value="ko" />
                      <Picker.Item label="Japanese" value="ja" />
                      <Picker.Item label="Spanish" value="es" />
                    </Picker>
                  </View>
                </View>

                <View style={[s.field, { flex: 1 }]}>
                  <Text style={s.label}>Status</Text>
                  <View style={[s.input, { padding: 0 }]}>
                    <Picker
                      selectedValue={status}
                      onValueChange={setStatus}
                      style={{ color: theme.colors.text, width: "100%" }}
                      dropdownIconColor={theme.colors.textDim}
                    >
                      <Picker.Item label="— Select —" value="" />
                      <Picker.Item label="Ongoing" value="ongoing" />
                      <Picker.Item label="Completed" value="completed" />
                      <Picker.Item label="Hiatus" value="hiatus" />
                      <Picker.Item label="Dropped" value="dropped" />
                    </Picker>
                  </View>
                </View>
              </View>

              <View style={s.field}>
                <Text style={s.label}>Slug</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TextInput
                    style={[s.input, { flex: 1 }]}
                    placeholder="Optional"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor={theme.colors.textDim}
                    value={slug}
                    onChangeText={setSlug}
                  />
                  <Pressable onPress={() => setSlug(slugify(title))} style={s.smallBtn}>
                    <Text style={s.smallBtnText}>Auto</Text>
                  </Pressable>
                </View>
              </View>

              <View style={s.field}>
                <Text style={s.label}>Description</Text>
                <TextInput
                  style={[s.input, { height: 96, textAlignVertical: "top" }]}
                  multiline
                  placeholder="Optional"
                  placeholderTextColor={theme.colors.textDim}
                  value={description}
                  onChangeText={setDescription}
                />
              </View>

              <View style={s.actions}>
                <Pressable style={s.btnGhost} onPress={resetAndClose}>
                  <Text style={s.btnGhostText}>Cancel</Text>
                </Pressable>
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={onSave}
                  disabled={saving}
                  style={[s.btn, saving && { opacity: 0.6 }]}
                >
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Save</Text>}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = createStyles((t) =>
  StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
    sheetWrap: { flex: 1, justifyContent: "flex-end" },
    sheet: {
      backgroundColor: t.colors.card,
      borderTopLeftRadius: t.radius.xl,
      borderTopRightRadius: t.radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      padding: t.spacing(4),
      gap: t.spacing(2),
    },
    title: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "800", marginBottom: 4 },
    err: { color: "#ff7676", marginBottom: 6 },

    field: { gap: 6, marginTop: 4 },
    label: { color: t.colors.textDim, fontSize: t.font.sm },
    input: {
      backgroundColor: t.colors.bg,
      color: t.colors.text,
      borderRadius: t.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },

    actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
    btn: { backgroundColor: t.colors.tint, paddingVertical: 10, paddingHorizontal: 16, borderRadius: t.radius.md },
    btnText: { color: "#fff", fontWeight: "700" },
    btnGhost: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: t.radius.md },
    btnGhostText: { color: t.colors.textDim, fontWeight: "700" },

    smallBtn: {
      backgroundColor: t.colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      borderRadius: t.radius.md,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    smallBtnText: { color: t.colors.text, fontWeight: "700" },
  })
);
