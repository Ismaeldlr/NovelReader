import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, createStyles } from "../src/theme";
import { Link } from "expo-router";

function Row({ icon, label, href }: { icon: keyof typeof Ionicons.glyphMap; label: string; href?: string }) {
  const { theme } = useTheme();
  const s = styles(theme);
  const body = (
    <View style={s.item}>
      <Ionicons name={icon} size={22} color={theme.colors.text} style={s.icon} />
      <Text style={s.label}>{label}</Text>
    </View>
  );
  return href ? <Link href={href as any} asChild><TouchableOpacity>{body}</TouchableOpacity></Link> : body;
}

export default function MoreScreen() {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View style={s.container}>
      <Text style={s.header}>More</Text>

      <View style={s.section}>
        <Row icon="cloud-download-outline" label="Import" href="Components/import" />
        <Row icon="cloud-upload-outline"   label="Export" href="Components/export" />
      </View>

      <View style={s.section}>
        <Row icon="settings-outline"       label="Settings" />
        <Row icon="information-circle-outline" label="About" />
        <Row icon="help-circle-outline"    label="Help" />
      </View>
    </View>
  );
}

const styles = createStyles((t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.colors.bg, padding: t.spacing(4) },
  header: { color: t.colors.text, fontSize: t.font.xl, fontWeight: "800", marginBottom: t.spacing(3) },
  section: {
    backgroundColor: t.colors.card,
    borderRadius: t.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    overflow: "hidden",
    marginBottom: t.spacing(4),
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: t.spacing(3),
    paddingHorizontal: t.spacing(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
  },
  icon: { marginRight: t.spacing(3) },
  label: { color: t.colors.text, fontSize: t.font.md, fontWeight: "600" },
}));
