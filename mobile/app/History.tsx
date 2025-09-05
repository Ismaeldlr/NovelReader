// app/History.tsx
import { useEffect, useRef, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, createStyles } from "../src/theme";
import { initDb } from "../src/db";
import { getDeviceId } from "../src/db/reading_progress"; // adjust path if needed
import { Image as ExpoImage } from "expo-image";

type HistoryRow = {
  id: number;
  title: string;
  author: string | null;
  description?: string | null;
  cover_path?: string | null;
  last_chapter_id: number | null;
  last_chapter_position: number | null; // 0..1 (within-chapter)
  last_seq: number | null;              // chapter sequence
  chapter_count: number | null;         // total chapters
  last_read_at: number;                 // unixepoch()
};

// --- helpers for covers ---
function normalizeCoverUri(p?: string | null): string | null {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return encodeURI(p); // encode remote URLs
  if (/^(file|content|data):/i.test(p)) return p;    // already valid scheme
  return "file://" + p.replace(/^\/+/, "");          // prefix local absolute paths
}
function buildCoverSource(uri: string | null) {
  if (!uri) return null as any;
  const isNU = /^https?:\/\/cdn\.novelupdates\.com\//i.test(uri);
  return isNU ? { uri, headers: { Referer: "https://www.novelupdates.com/" } } : { uri };
}
function initials(title: string) {
  const words = title.trim().split(/\s+/).slice(0, 2);
  return words.map(w => w[0]?.toUpperCase() ?? "").join("");
}
function CoverImage({
  coverUri,
  title,
  styleImage,
  styleFallbackText,
}: {
  coverUri: string | null;
  title: string;
  styleImage: any;
  styleFallbackText: any;
}) {
  const [ok, setOk] = useState(true);
  const source = coverUri ? buildCoverSource(coverUri) : null;
  if (source && ok) {
    return (
      <ExpoImage
        source={source}
        style={styleImage}
        contentFit="cover"
        cachePolicy="disk"
        onError={() => setOk(false)}
      />
    );
  }
  return <Text style={styleFallbackText}>{initials(title)}</Text>;
}

export default function History() {
  const { theme } = useTheme();
  const s = styles(theme);
  const router = useRouter();

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [status, setStatus] = useState("Loading…");
  const dbRef = useRef<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const db = await initDb();
        if (!alive) return;
        dbRef.current = db;
        await reload();
      } catch (e: any) {
        setStatus("DB error: " + String(e));
      }
    })();
    return () => { alive = false; };
  }, []);

  async function reload() {
    const db = dbRef.current; if (!db) return;
    const device = await getDeviceId();

    const q = `
      SELECT
        n.id,
        n.title,
        n.author,
        n.description,
        n.cover_path,
        rs.chapter_id           AS last_chapter_id,
        rs.position_pct         AS last_chapter_position,
        c.seq                   AS last_seq,
        ns.chapter_count        AS chapter_count,
        rs.updated_at           AS last_read_at
      FROM reading_state rs
      JOIN novels       n  ON n.id = rs.novel_id
      LEFT JOIN chapters c  ON c.id = rs.chapter_id
      LEFT JOIN novel_stats ns ON ns.novel_id = n.id
      WHERE rs.device_id = ?
      ORDER BY rs.updated_at DESC
    `;
    const data = await db.select(q, [device]);
    setRows(data as HistoryRow[]);
    setStatus((data?.length ?? 0) ? "Ready" : "No recent reading yet");
  }

  function pctForRow(r: HistoryRow): number {
    const total = Math.max(0, Number(r.chapter_count ?? 0));
    const seq = Math.max(0, Number(r.last_seq ?? 0));
    const within = Math.max(0, Math.min(1, Number(r.last_chapter_position ?? 0)));
    if (!total) return 0;
    // overall = (chapters fully read + current chapter position) / total
    return Math.max(0, Math.min(1, ((Math.max(0, seq - 1)) + within) / total));
  }
  function pctLabel(pct: number) {
    return `${Math.round(pct * 1000) / 10}%`;
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.h1}>History</Text>
        <Text style={s.status}>{status}</Text>
      </View>

      {rows.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>Nothing here yet</Text>
          <Text style={s.emptySub}>Start reading a chapter and it’ll appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it) => String(it.id)}
          contentContainerStyle={{ paddingBottom: theme.spacing(24), paddingHorizontal: theme.spacing(0) }}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing(2) }} />}
          renderItem={({ item }) => {
            const pct = pctForRow(item);
            const coverUri = normalizeCoverUri(item.cover_path);
            return (
              <Pressable
                style={s.card}
                onPress={() => {
                  if (item.last_chapter_id) {
                    router.push({
                      pathname: "/novel/[id]/chapter/[chapterId]",
                      params: { id: String(item.id), chapterId: String(item.last_chapter_id) },
                    });
                  } else {
                    router.push({ pathname: "/novel/[id]", params: { id: String(item.id) } });
                  }
                }}
                android_ripple={{ color: "#222" }}
              >
                <View style={s.cover}>
                  {coverUri ? (
                    <CoverImage
                      coverUri={coverUri}
                      title={item.title}
                      styleImage={s.coverImg}
                      styleFallbackText={s.coverText}
                    />
                  ) : (
                    <Text style={s.coverText}>{initials(item.title)}</Text>
                  )}
                </View>

                <View style={s.meta}>
                  <Text numberOfLines={1} style={s.title}>{item.title}</Text>
                  <Text numberOfLines={1} style={s.author}>{item.author || "Unknown author"}</Text>
                  {!!item.description && <Text numberOfLines={2} style={s.desc}>{item.description}</Text>}

                  {/* Progress */}
                  <View style={s.progressWrap}>
                    <View style={s.progressBar}>
                      <View style={[s.progressFill, { width: `${pct * 100}%` }]} />
                    </View>
                    <Text style={s.progressLabel}>{pctLabel(pct)}</Text>
                  </View>

                  {/* Continue pill */}
                  <View style={s.actions}>
                    <View style={{ flex: 1 }} />
                    <Pressable
                      style={s.pill}
                      onPress={() => {
                        if (item.last_chapter_id) {
                          router.push({
                            pathname: "/novel/[id]/chapter/[chapterId]",
                            params: { id: String(item.id), chapterId: String(item.last_chapter_id) },
                          });
                        } else {
                          router.push({ pathname: "/novel/[id]", params: { id: String(item.id) } });
                        }
                      }}
                    >
                      <Ionicons name="play" size={14} color={theme.colors.text} />
                      <Text style={s.pillTxt}>Continue</Text>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = createStyles((t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.colors.bg },
  header: {
    paddingVertical: t.spacing(4),
    paddingHorizontal: t.spacing(1),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  h1: { color: t.colors.text, fontSize: t.font.xl, fontWeight: "800" },
  status: { color: t.colors.textDim },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: t.spacing(4) },
  emptyTitle: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "700", marginBottom: 6 },
  emptySub: { color: t.colors.textDim },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderRadius: t.radius.lg,
    padding: t.spacing(1.5),
    gap: t.spacing(2),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
  },
  cover: {
    width: 96, height: 142,
    borderRadius: t.radius.md,
    overflow: "hidden",
    backgroundColor: "#1b222c",
    alignItems: "center", justifyContent: "center",
  },
  coverImg: { width: "100%", height: "100%" },
  coverText: { color: "#c3c7d1", fontWeight: "800", fontSize: 16 },

  meta: { flex: 1 },
  title: { color: t.colors.text, fontSize: t.font.md, fontWeight: "700" },
  author: { color: t.colors.textDim, marginTop: 2 },
  desc: { color: t.colors.textDim, marginTop: 6, fontSize: t.font.sm },

  // Progress
  progressWrap: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  progressBar: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(127,127,127,0.18)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: t.colors.tint,
  },
  progressLabel: { color: t.colors.textDim, fontSize: t.font.sm, minWidth: 44, textAlign: "right" },

  actions: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: t.colors.bgElevated,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
  },
  pillTxt: { color: t.colors.text, fontWeight: "700" },
}));
