import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { useLocalSearchParams, Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, createStyles } from "../../../../src/theme";
import { initDb } from "../../../../src/db";

// Save progress helper
import { saveReadingProgress } from "../../../../src/db/reading_progress";

// NEW: bottom sheet
import ReaderSheet from "./[chapter]/ReaderSheet";

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
  const [novelTitle, setNovelTitle] = useState<string>("");
  const scrollRef = useRef<ScrollView>(null);
  const dbRef = useRef<any>(null);

  // sheet & reader UI state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [panel, setPanel] = useState<"info" | "font" | "settings" | "more">("info");
  const [readPct, setReadPct] = useState(0);

  // Reader style state (Font tab controls)
  const [fontFamily, setFontFamily] = useState<string | undefined>(undefined); // e.g., "Nunito Sans"
  const [fontSize, setFontSize] = useState(16);
  const [lineHeight, setLineHeight] = useState<number | "default">("default");

  //Tap controls
  const [isDragging, setIsDragging] = useState(false);
  const touchStartRef = useRef({ y: 0, t: 0 });

  // consider these your tap thresholds
  const TAP_SLOP_PX = 10;
  const TAP_MAX_MS = 250;

  // Ignore opening the sheet when a real button is being pressed
  const ignoreTapRef = useRef(false);
  const TAP_IGNORE_MS = 150; // small delay so parent doesn't see the tap

  // === Progress persistence refs ===
  const currentPctRef = useRef(0);
  const saveMetaRef = useRef({ lastTs: 0, lastPct: 0 });

  useEffect(() => {
    let alive = true;
    (async () => {
      const db = await initDb();
      if (!alive) return;
      dbRef.current = db;
      await loadChapters(db);
      await loadCurrent(db, chId);

      // Load novel title
      const rows = await db.select("SELECT title FROM novels WHERE id = ? LIMIT 1", [novelId]);
      setNovelTitle(rows[0]?.title || "Novel");
      setMsg("Ready");

      // reset UI progress
      setReadPct(0);
      currentPctRef.current = 0;
      saveMetaRef.current = { lastTs: 0, lastPct: 0 };

      // jump to top when chapter changes
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));

      // Immediately mark this chapter as current (0%) so "Continue" points here even if you don't scroll yet.
      requestAnimationFrame(() => { void persistProgress(0, true); });
    })().catch(e => setMsg("DB error: " + String(e)));
    return () => { alive = false; };
  }, [novelId, chId]);

  // Flush progress on unmount / route-away
  useEffect(() => {
    return () => {
      void persistProgress(currentPctRef.current, /*immediate*/ true);
    };
  }, []);

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

  const { prev, next, idx, total } = useMemo(() => {
    const i = chapters.findIndex(c => c.id === chId);
    return {
      prev: i > 0 ? chapters[i - 1] : null,
      next: i >= 0 && i < chapters.length - 1 ? chapters[i + 1] : null,
      idx: i >= 0 ? i + 1 : 0,
      total: chapters.length,
    };
  }, [chapters, chId]);

  // === Persist progress (throttled) ===
  function shouldSave(now: number, pct: number) {
    const { lastTs, lastPct } = saveMetaRef.current;
    // Save if at least 1s passed OR moved at least 5 percentage points
    return (now - lastTs) > 1000 || Math.abs(pct - lastPct) >= 0.05 || pct >= 0.99;
  }

  async function persistProgress(pct: number, immediate = false) {
    try {
      const now = Date.now();
      const clamped = Math.max(0, Math.min(1, pct));
      if (!immediate && !shouldSave(now, clamped)) return;
      saveMetaRef.current = { lastTs: now, lastPct: clamped };
      await saveReadingProgress(novelId, chId, clamped);
    } catch {
      /* ignore transient write errors */
    }
  }

  async function goPrev() {
    await persistProgress(currentPctRef.current, true);
    if (!prev) return;
    router.replace({
      pathname: "/novel/[id]/chapter/[chapterId]",
      params: { id: String(novelId), chapterId: String(prev.id) },
    });
  }

  async function goNext() {
    await persistProgress(currentPctRef.current, true);
    if (!next) return;
    router.replace({
      pathname: "/novel/[id]/chapter/[chapterId]",
      params: { id: String(novelId), chapterId: String(next.id) },
    });
  }

  // Calculate reading progress while scrolling
  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const max = Math.max(1, contentSize.height - layoutMeasurement.height);
    const pct = Math.min(1, Math.max(0, contentOffset.y / max));
    setReadPct(pct);
    currentPctRef.current = pct;
    // save (throttled)
    void persistProgress(pct);
  }

  // Helpers for routing from sheet
  async function openTOC() {
    await persistProgress(currentPctRef.current, true);
    router.push({ pathname: "/novel/[id]", params: { id: String(novelId), tab: "toc" } });
    setSheetOpen(false);
  }
  async function openAbout() {
    await persistProgress(currentPctRef.current, true);
    router.push({ pathname: "/novel/[id]", params: { id: String(novelId), tab: "about" } });
    setSheetOpen(false);
  }

  const effectiveLineHeight = lineHeight === "default" ? undefined : Math.round(fontSize * lineHeight);

  function handleTouchStart(e: any) {
    touchStartRef.current = {
      y: e.nativeEvent.pageY,
      t: Date.now(),
    };
  }

  function handleTouchEnd(e: any) {
    const dy = Math.abs(e.nativeEvent.pageY - touchStartRef.current.y);
    const dt = Date.now() - touchStartRef.current.t;

    // 🚫 do not open if a child control is being pressed or the sheet is already open
    if (ignoreTapRef.current || sheetOpen) return;

    if (!isDragging && dy < TAP_SLOP_PX && dt < TAP_MAX_MS) {
      setSheetOpen(true);
    }
  }

  // helper to mark a Pressable as "interactive" so the parent tap doesn't open the sheet
  const markInteractive = {
    onPressIn: () => { ignoreTapRef.current = true; },
    onPressOut: () => { setTimeout(() => { ignoreTapRef.current = false; }, TAP_IGNORE_MS); },
  };

  return (
    <View style={s.page}>
      <View style={s.header} />

      {!current ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No content for this chapter yet.</Text>
          <Text style={s.emptySub}>{msg}</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.contentWrap}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onScrollBeginDrag={() => setIsDragging(true)}
          onScrollEndDrag={() => setIsDragging(false)}
          onMomentumScrollEnd={() => setIsDragging(false)}
        >
          {/* Rectangle: Novel Title */}
          <View style={s.rectContainer}>
            <Link href={{ pathname: "/novel/[id]", params: { id: String(novelId) } }} asChild>
              <Pressable
                style={s.novelTitleWrap}
                android_ripple={{ color: theme.colors.border }}
                {...markInteractive}
              >
                <Text style={s.novelTitle} numberOfLines={1}>{novelTitle}</Text>
              </Pressable>
            </Link>
          </View>

          {/* Rectangle: Top navigation chips */}
          <View style={[s.rectContainer, { marginTop: 16 }]}>
            <View style={[s.nav, { marginTop: 0, marginBottom: 0 }]}>
              <Pressable
                style={[s.pill, !prev && s.pillDisabled]}
                onPress={goPrev}
                disabled={!prev}
                {...markInteractive}
              >
                <Ionicons name="chevron-back" size={16} color={theme.colors.text} />
                <Text style={s.pillTxt}>Back</Text>
              </Pressable>

              <Link href={{ pathname: "/novel/[id]", params: { id: String(novelId) } }} asChild>
                <Pressable style={s.pill} {...markInteractive}>
                  <Text style={s.pillTxt}>Chapters List</Text>
                </Pressable>
              </Link>

              <Pressable
                style={[s.pill, !next && s.pillDisabled]}
                onPress={goNext}
                disabled={!next}
                {...markInteractive}
              >
                <Text style={s.pillTxt}>Next</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.text} />
              </Pressable>
            </View>
          </View>

          {/* Rectangle: Reader content */}
          <View style={[s.rectContainer, { marginTop: 16 }]}>
            <View style={s.headerRow}>
              <Text style={s.title}>{current.title || "Untitled chapter"}</Text>
            </View>

            <Text style={s.meta}>Variant: {current.variant_type} • Lang: {current.lang}</Text>

            {/* Content */}
            <Text style={[s.body, { fontFamily, fontSize, lineHeight: effectiveLineHeight }]}>
              {current.content}
            </Text>
          </View>

          {/* Rectangle: Bottom navigation chips */}
          <View style={[s.rectContainer, { marginTop: 32, marginBottom: 0 }]}>
            <View style={[s.nav, { marginTop: 0, marginBottom: 0 }]}>
              <Pressable
                style={[s.pill, !prev && s.pillDisabled]}
                onPress={goPrev}
                disabled={!prev}
                {...markInteractive}
              >
                <Ionicons name="chevron-back" size={16} color={theme.colors.text} />
                <Text style={s.pillTxt}>Back</Text>
              </Pressable>

              <Link href={{ pathname: "/novel/[id]", params: { id: String(novelId) } }} asChild>
                <Pressable style={s.pill} {...markInteractive}>
                  <Text style={s.pillTxt}>Chapters List</Text>
                </Pressable>
              </Link>

              <Pressable
                style={[s.pill, !next && s.pillDisabled]}
                onPress={goNext}
                disabled={!next}
                {...markInteractive}
              >
                <Text style={s.pillTxt}>Next</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.text} />
              </Pressable>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Bottom sheet */}
      <ReaderSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        panel={panel}
        onChangePanel={setPanel}
        // info props
        idx={idx}
        total={total}
        readPct={readPct}
        onPrev={goPrev}
        onNext={goNext}
        prevDisabled={!prev}
        nextDisabled={!next}
        onOpenContents={openTOC}
        onOpenAbout={openAbout}
        // font props
        fontFamily={fontFamily}
        fontSize={fontSize}
        lineHeight={lineHeight}
        onFontFamily={setFontFamily}
        onFontSize={setFontSize}
        onLineHeight={setLineHeight}
      />
    </View>
  );
}

const styles = createStyles((t) => StyleSheet.create({
  rectContainer: {
    backgroundColor: t.colors.card,
    borderRadius: t.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    padding: t.spacing(3),
    shadowColor: t.colors.bg,
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  novelTitleWrap: {
    marginBottom: 0,
    marginTop: 0,
  },
  novelTitle: {
    color: t.colors.text,
    fontSize: t.font.lg,
    fontWeight: "bold",
    maxWidth: "90%",
  },
  page: { flex: 1, backgroundColor: t.colors.bg, padding: t.spacing(2) },
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: t.spacing(3),
    marginTop: t.spacing(2),
    marginBottom: t.spacing(12),
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
  pillTxt: { color: t.colors.text, fontWeight: "700" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 100 },
  emptyTitle: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "700", marginBottom: 6 },
  emptySub: { color: t.colors.textDim },

  contentWrap: { paddingBottom: 48 },
  header: { marginBottom: t.spacing(10) },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  title: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "800" },
  meta: { color: t.colors.textDim, marginBottom: 22 },
  body: { color: t.colors.text, lineHeight: 24, fontSize: 16 },
}));
