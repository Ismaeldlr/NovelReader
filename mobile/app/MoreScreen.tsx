import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, createStyles } from "../src/theme";
import { Link } from "expo-router";

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  href?: string;
  badge?: number;
  chevron?: boolean;
};

function Row({ icon, label, href, badge, chevron = true }: RowProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  const content = (
    <View style={s.row}>
      <View style={s.rowLeft}>
        <Ionicons name={icon} size={28} color={theme.colors.text} style={s.icon} />
        <Text style={s.labelBig}>{label}</Text>
      </View>
      <View style={s.rowRight}>
        {typeof badge === "number" && badge > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeText}>{badge > 99 ? "99+" : String(badge)}</Text>
          </View>
        )}
        {chevron && <Ionicons name="chevron-forward" size={22} color={theme.colors.text} style={{ opacity: 0.35 }} />}
      </View>
    </View>
  );

  const pressable = (
    <Pressable
      android_ripple={{ color: theme.colors.border }}
      style={({ pressed }) => [s.rowWrap, pressed && { opacity: 0.96 }]}
    >
      {content}
    </Pressable>
  );

  return href ? (
    <Link href={href as any} asChild>
      {pressable}
    </Link>
  ) : (
    pressable
  );
}

function SectionHeader({ children }: { children: string }) {
  const { theme } = useTheme();
  const s = styles(theme);
  return <Text style={s.sectionHeader}>{children}</Text>;
}

export default function MoreScreen() {
  const { theme, setMode, mode } = useTheme();
  const s = styles(theme);

  return (
    <View style={s.container}>
      <Text style={s.title}>More</Text>

      <ScrollView
        contentContainerStyle={{ paddingBottom: theme.spacing(10) }}
        showsVerticalScrollIndicator={false}
      >
        {/* Edge-to-edge list (no card background) */}
        <View style={s.list}>
          <SectionHeader>Library</SectionHeader>
          <Row icon="cloud-download-outline" label="Import" href="Components/import" />
          <Row icon="cloud-upload-outline" label="Export" href="Components/export" />

          <View style={s.groupGap} />

          <SectionHeader>App</SectionHeader>
          <Row icon="settings-outline" label="Settings" href="Components/settings" />
          <Row icon="information-circle-outline" label="About" href="Components/about" />
          <Row icon="help-circle-outline" label="Help" href="Components/help" />
        </View>
        <View style={s.themeToggleWrap}>
          <Pressable style={s.themeToggleBtn} onPress={() => setMode(mode === "dark" ? "light" : "dark")}> 
            <Text style={s.themeToggleText}>Toggle theme ({mode})</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = createStyles((t) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.colors.bg,
      paddingTop: t.spacing(4),
      // near full-width: remove side padding so rows align with screen edges
      paddingHorizontal: 0,
    },
    title: {
      color: t.colors.text,
      fontSize: t.font.xl,
      fontWeight: "800",
      marginBottom: t.spacing(3),
      // keep some breathing room for the title/search only
      paddingHorizontal: t.spacing(4),
    },

    // Search
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.colors.card, // subtle pill only for the search bar
      borderRadius: t.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      paddingHorizontal: t.spacing(3),
      height: 44,
      marginBottom: t.spacing(2),
      marginHorizontal: t.spacing(4),
    },
    searchInput: { flex: 1, color: t.colors.text, fontSize: t.font.md },

    list: {
      
    },

    sectionHeader: {
      color: t.colors.text,
      opacity: 0.6,
      fontSize: t.font.sm,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      paddingTop: t.spacing(8),
      paddingBottom: t.spacing(1),
      paddingHorizontal: t.spacing(4), 
    },
    groupGap: { height: t.spacing(1) },


    rowWrap: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    row: {
      paddingHorizontal: t.spacing(4), 
      paddingVertical: t.spacing(3.75),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    rowLeft: { flexDirection: "row", alignItems: "center" },
    rowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    icon: { marginRight: t.spacing(3) },
  label: { color: t.colors.text, fontSize: t.font.md, fontWeight: "600" },
  labelBig: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "700" },

    badge: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 6,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#E11D48",
      marginRight: 6,
    },
    badgeText: { color: "white", fontSize: 12, fontWeight: "800" },
    themeToggleWrap: {
      marginTop: 32,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
    },
    themeToggleBtn: {
      marginTop: 16,
      paddingVertical: 12,
      paddingHorizontal: 32,
      borderRadius: 20,
      backgroundColor: '#222',
    },
    themeToggleText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 16,
    },
  })
);
