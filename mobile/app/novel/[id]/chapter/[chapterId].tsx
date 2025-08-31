import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, createStyles } from "../../../../src/theme";
import { initDb } from "../../../../src/db";

type ChapterListItem = { id: number; seq: number; display_title: string | null };
type ChapterVariant = { id: number; title: string | null; content: string; variant_type: string; lang: string };

export default function Reader() {
  const { id, chapterId } = useLocalSearchParams<{ id: string; chapterId: string }>();
  const novelId = Number(id);
  const chId = Number(chapterId);

  const { theme } = useTheme();
  const s = styles(theme);
  const router = useRouter();

  const [chapters, setChapters] = useState<ChapterListItem[]>([]);
  const [current, setCurrent] = useState<ChapterVariant | null>(null);
  const [msg, setMsg] = useState("Loading…");
  const scrollRef = useRef<ScrollView>(null);
  const dbRef = useRef<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const db = await initDb();
      if (!alive) return;
      dbRef.current = db;
      await loadChapters(db);
      await loadCurrent(db, chId);
      setMsg("Ready");
      // jump to top when chapter changes
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
    })().catch(e => setMsg("DB error: " + String(e)));
    return () => { alive = false; };
  }, [novelId, chId]);

  async function loadChapters(db: any) {
    const rows = await db.select(
      "SELECT id, seq, display_title FROM chapters WHERE novel_id = ? ORDER BY seq ASC",
      [novelId]
    );
    setChapters(rows as ChapterListItem[]);
  }

  async function loadCurrent(db: any, chapterIdNum: number) {
    const rows = await db.select(
      `SELECT id, title, content, variant_type, lang
       FROM chapter_variants
       WHERE chapter_id = ?
       ORDER BY is_primary DESC,
         CASE variant_type
           WHEN 'OFFICIAL' THEN 1
           WHEN 'HUMAN'    THEN 2
           WHEN 'AI'       THEN 3
           WHEN 'MTL'      THEN 4
           WHEN 'RAW'      THEN 5
           ELSE 6
         END ASC
       LIMIT 1`,
      [chapterIdNum]
    );
    setCurrent(rows[0] ?? null);
  }

  const { prev, next } = useMemo(() => {
    const idx = chapters.findIndex(c => c.id === chId);
    return {
      prev: idx > 0 ? chapters[idx - 1] : null,
      next: idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null,
    };
  }, [chapters, chId]);

  function goPrev() {
    if (!prev) return;
    router.replace({
      pathname: "/novel/[id]/chapter/[chapterId]",
      params: { id: String(novelId), chapterId: String(prev.id) },
    });
  }
  function goNext() {
    if (!next) return;
    router.replace({
      pathname: "/novel/[id]/chapter/[chapterId]",
      params: { id: String(novelId), chapterId: String(next.id) },
    });
  }

  return (
    <View style={s.page}>
      <View style={s.header}>
        
      </View>

      {!current ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No content for this chapter yet.</Text>
          <Text style={s.emptySub}>{msg}</Text>
        </View>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={s.contentWrap}>
          {/* Navigation controls as a normal item */}
          <View style={[s.nav, { marginTop: 0, marginBottom: 24 }]}> 
            <Pressable style={[s.pill, !prev && s.pillDisabled]} onPress={goPrev} disabled={!prev}>
              <Ionicons name="chevron-back" size={16} color={theme.colors.text} />
              <Text style={s.pillTxt}>Back</Text>
            </Pressable>

            <Link href={{ pathname: "/novel/[id]", params: { id: String(novelId) } }} asChild>
              <Pressable style={[s.pill, s.pillCenter]}>
                <Text style={s.pillTxt}>Chapters List</Text>
              </Pressable>
            </Link>

            <Pressable style={[s.pill, !next && s.pillDisabled]} onPress={goNext} disabled={!next}>
              <Text style={s.pillTxt}>Next</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.text} />
            </Pressable>
          </View>

          <View style={s.headerRow}>
            <Text style={s.title}>{current.title || "Untitled chapter"}</Text>
            {/* Future: link to editor route */}
            {/* <Link href={`/novel/${novelId}/editor/${chId}`} asChild>
              <Pressable style={s.btn}><Text style={s.btnTxt}>Edit Chapter</Text></Pressable>
            </Link> */}
          </View>

          <Text style={s.meta}>Variant: {current.variant_type} • Lang: {current.lang}</Text>

          {/* Content: Text preserves \n; RN handles wrapping. */}
          <Text style={s.body}>{current.content}</Text>

          {/* Navigation controls at the bottom */}
          <View style={[s.nav, { marginTop: 32, marginBottom: 0 }]}> 
            <Pressable style={[s.pill, !prev && s.pillDisabled]} onPress={goPrev} disabled={!prev}>
              <Ionicons name="chevron-back" size={16} color={theme.colors.text} />
              <Text style={s.pillTxt}>Back</Text>
            </Pressable>

            <Link href={{ pathname: "/novel/[id]", params: { id: String(novelId) } }} asChild>
              <Pressable style={[s.pill, s.pillCenter]}>
                <Text style={s.pillTxt}>Chapters List</Text>
              </Pressable>
            </Link>

            <Pressable style={[s.pill, !next && s.pillDisabled]} onPress={goNext} disabled={!next}>
              <Text style={s.pillTxt}>Next</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.text} />
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = createStyles((t) => StyleSheet.create({
  page: { flex: 1, backgroundColor: t.colors.bg, padding: t.spacing(4)},
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: t.spacing(2),
    marginBottom: t.spacing(10),
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: t.colors.card,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
  },
  pillDisabled: { opacity: 0.4 },
  pillCenter: { flex: 1, justifyContent: "center", alignItems: "center" },
  pillTxt: { color: t.colors.text, fontWeight: "700" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 100 },
  emptyTitle: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "700", marginBottom: 6 },
  emptySub: { color: t.colors.textDim },

  contentWrap: { paddingBottom: 48 },
  header: { marginBottom: t.spacing(20) },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  title: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "800" },
  meta: { color: t.colors.textDim, marginBottom: 12 },
  body: { color: t.colors.text, lineHeight: 24, fontSize: 16 },
  btn: { backgroundColor: t.colors.tint, paddingVertical: 8, paddingHorizontal: 12, borderRadius: t.radius.sm },
  btnTxt: { color: "#fff", fontWeight: "700" },
}));
