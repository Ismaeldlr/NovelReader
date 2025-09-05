// app/index.tsx
import { JSX, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, SafeAreaView } from "react-native";
import { useTheme, createStyles } from "../src/theme";
import Library from "./Library";
import History from "./History";
import MoreScreen from "./MoreScreen";

// 👇 importa librerías de íconos
import { Feather, Ionicons, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";


type TabKey = "Library" | "Updates" | "History" | "Browse" | "More";
export default function Index() {
  const [tab, setTab] = useState<TabKey>("Library");
  const { theme, setMode, mode } = useTheme();
  const s = styles(theme);

  const Screen = useMemo(() => {
    switch (tab) {
      case "Library": return <Library />;
      case "History": return <History />;
      case "More": return <MoreScreen />;
      default: return <Placeholder title={tab} />;
    }
  }, [tab]);

  // mapa de íconos con color dependiente del theme
  const icons: Record<TabKey, (active: boolean) => JSX.Element> = {
    Library: (active) => (
      <MaterialCommunityIcons 
        name="book" 
        size={22} 
        color={active ? theme.colors.text : theme.colors.textDim} 
      />
    ),
    Updates: (active) => (
      <MaterialIcons 
        name="update" 
        size={22} 
        color={active ? theme.colors.text : theme.colors.textDim} 
      />
    ),
    History: (active) => (
      <MaterialIcons 
        name="history" 
        size={22} 
        color={active ? theme.colors.text : theme.colors.textDim} 
      />
    ),
    Browse: (active) => (
      <Ionicons 
        name="search" 
        size={22} 
        color={active ? theme.colors.text : theme.colors.textDim} 
      />
    ),
    More: (active) => (
      <Feather 
        name="menu" 
        size={22} 
        color={active ? theme.colors.text : theme.colors.textDim} 
      />
    ),
  };

  return (
    <View style={s.safe}>
      <View style={s.container}>
        <View style={s.content}>{Screen}</View>

        <View style={s.tabbar}>
          {(["Library","Updates","History","Browse","More"] as TabKey[]).map(k => {
            const active = tab === k;
            return (
              <Pressable 
                key={k} 
                onPress={() => setTab(k)} 
                style={[s.tab, active && s.tabActive]}
              >
                <View style={{ alignItems: "center" }}>
                  {icons[k](active)}
                  <Text style={[s.tabLabel, active && s.tabLabelActive]}>{k}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
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
  tab: { 
    flex: 1, 
    paddingVertical: t.spacing(2), 
    alignItems: "center", 
    justifyContent: "center",
    
  },
  tabActive: { backgroundColor: "rgba(127,127,127,0.08)" },
  tabLabel: { 
    color: t.colors.textDim, 
    fontSize: 12, 
    fontWeight: "600", 
    marginTop: 2,
    marginBottom: 18
  },
  tabLabelActive: { color: t.colors.text },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholderTitle: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "800" },
}));