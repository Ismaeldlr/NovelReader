// app/index.tsx
import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, SafeAreaView } from "react-native";
import { useTheme, createStyles } from "../src/theme";
import Library from "./Library";

type TabKey = "Library" | "Updates" | "History" | "Browse" | "More";

export default function Index() {
  const [tab, setTab] = useState<TabKey>("Library");
  const { theme, setMode, mode } = useTheme();
  const s = styles(theme);

  const Screen = useMemo(() => {
    switch (tab) {
      case "Library": return <Library />;
      default: return <Placeholder title={tab} />;
    }
  }, [tab]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.content}>{Screen}</View>

        <View style={s.tabbar}>
          {(["Library","Updates","History","Browse","More"] as TabKey[]).map(k => (
            <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabActive]}>
              <Text style={[s.tabLabel, tab === k && s.tabLabelActive]}>{k}</Text>
            </Pressable>
          ))}
        </View>

        {/* Example theme toggle (dev only) */}
        <View style={s.themeToggle}>
          <Pressable onPress={() => setMode(mode === "dark" ? "light" : "dark")}>
            <Text style={{ color: theme.colors.textDim }}>Toggle theme ({mode})</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Placeholder({ title }: { title: string }) {
  const { theme } = useTheme();
  const s = styles(theme);
  return (
    <View style={s.placeholder}>
      <Text style={s.placeholderTitle}>{title}</Text>
    </View>
  );
}

const styles = createStyles((t) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: t.colors.bg },
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: t.spacing(4), paddingTop: t.spacing(10) },
  tabbar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.card,
  },
  tab: { flex: 1, paddingVertical: t.spacing(3), alignItems: "center", justifyContent: "center" },
  tabActive: { backgroundColor: "rgba(127,127,127,0.08)" },
  tabLabel: { color: t.colors.textDim, fontSize: 12, fontWeight: "600" },
  tabLabelActive: { color: t.colors.text },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholderTitle: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "800" },
  themeToggle: { position: "absolute", bottom: 56, right: 16 },
}));
